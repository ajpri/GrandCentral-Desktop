// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Lifetime} from './lifetime.js';
import {calendarRange} from './calendarModel.js';

// Independent read-only EDS views keep the Shell calendar's month/range intact.
export class CalendarSource {
    constructor(changed, days) {
        this._changed = changed;
        this._days = days;
        this._life = new Lifetime();
        this._cancel = new Gio.Cancellable();
        this._records = new Map();
        this._setRange();
        this._start();
    }

    async _start() {
        try {
            const [cal, data, ical] = await Promise.all([
                import('gi://ECal?version=2.0'), import('gi://EDataServer?version=1.2'), import('gi://ICalGLib?version=3.0')]);
            if (this._destroyed)
                return;
            this._cal = cal.default;
            this._data = data.default;
            this._ical = ical.default;
            this._data.SourceRegistry.new(this._cancel, (_object, result) => {
                try {
                    const registry = this._data.SourceRegistry.new_finish(result);
                    if (this._destroyed)
                        return;
                    this._registry = registry;
                    for (const signal of ['source-added', 'source-removed', 'source-changed', 'source-enabled', 'source-disabled'])
                        this._life.connect(registry, signal, () => this._queueSources());
                    this._syncSources();
                } catch (e) {
                    if (!this._destroyed)
                        console.warn(`Grand Central Desktop calendar: ${e.message}`);
                }
            });
        } catch (e) {
            if (!this._destroyed)
                console.warn('Grand Central Desktop calendar: GNOME calendar libraries are unavailable');
        }
    }

    _setRange() {
        const range = calendarRange(new Date(), this._days);
        this._range = {start: range.start.getTime() / 1000, end: range.end.getTime() / 1000};
        this._timezone = GLib.TimeZone.new_local().get_identifier();
    }

    tick(days = this._days) {
        if (this._destroyed)
            return;
        const old = this._range;
        const zone = this._timezone;
        this._days = days;
        this._setRange();
        if (old.start !== this._range.start || old.end !== this._range.end || zone !== this._timezone) {
            for (const record of this._records.values()) {
                if (record.client)
                    this._startView(record);
            }
        }
        this._queueSources();
        this._emit();
    }

    _queueSources() {
        if (this._syncQueued || this._destroyed)
            return;
        this._syncQueued = true;
        this._life.idle(() => {
            this._syncQueued = false;
            this._syncSources();
        });
    }

    _syncSources() {
        if (!this._registry)
            return;
        const sources = this._registry.list_sources(this._data.SOURCE_EXTENSION_CALENDAR).filter(source =>
            this._registry.check_enabled(source) && source.get_extension(this._data.SOURCE_EXTENSION_CALENDAR).get_selected());
        const ids = new Set(sources.map(source => source.get_uid()));
        for (const [id, record] of this._records) {
            if (!ids.has(id)) {
                this._stopView(record);
                record.cancel.cancel();
                this._records.delete(id);
            }
        }
        for (const source of sources) {
            const id = source.get_uid();
            if (this._records.has(id))
                continue;
            const record = {id, source, cancel: new Gio.Cancellable(), events: new Map()};
            this._records.set(id, record);
            this._cal.Client.connect(source, this._cal.ClientSourceType.EVENTS, 10, record.cancel, (_object, result) => {
                try {
                    const client = this._cal.Client.connect_finish(result);
                    if (this._destroyed || this._records.get(id) !== record)
                        return;
                    record.client = client;
                    this._startView(record);
                } catch (e) {
                    if (this._records.get(id) === record) {
                        if (!record.cancel.is_cancelled())
                            console.warn(`Grand Central Desktop calendar connection: ${e.message}`);
                        this._records.delete(id);
                        record.cancel.cancel();
                        this._emit();
                    }
                }
            });
        }
        this._emit();
    }

    _stopView(record) {
        record.viewLife?.destroy();
        record.reloadQueued = false;
        record.queryCancel?.cancel();
        record.generationCancel?.cancel();
        if (record.view) {
            try { record.view.stop(); } catch { /* Backend may have disconnected. */ }
        }
        record.view = null;
        record.events.clear();
    }

    _startView(record) {
        this._stopView(record);
        record.queryCancel = new Gio.Cancellable();
        const cancel = record.queryCancel;
        const zone = this._ical.Timezone.get_builtin_timezone(this._timezone) ?? this._ical.Timezone.get_utc_timezone();
        record.client.set_default_timezone(zone);
        record.zone = zone;
        const iso = seconds => new Date(seconds * 1000).toISOString().replace(/[-:]/g, '').replace('.000', '');
        const query = `(occur-in-time-range? (make-time "${iso(this._range.start)}") (make-time "${iso(this._range.end)}"))`;
        record.client.get_view(query, cancel, (client, result) => {
            try {
                const value = client.get_view_finish(result);
                const view = Array.isArray(value) ? value.at(-1) : value;
                if (this._destroyed || cancel.is_cancelled() || this._records.get(record.id) !== record)
                    return;
                record.view = view;
                record.viewLife = new Lifetime();
                for (const signal of ['objects-added', 'objects-modified', 'objects-removed'])
                    record.viewLife.connect(view, signal, () => this._queueReload(record));
                view.start();
                this._queueReload(record);
            } catch (e) {
                if (!cancel.is_cancelled()) {
                    console.warn(`Grand Central Desktop calendar view: ${e.message}`);
                    this._emit();
                }
            }
        });
    }

    _queueReload(record) {
        if (record.reloadQueued)
            return;
        record.reloadQueued = true;
        record.viewLife.idle(() => {
            record.reloadQueued = false;
            record.generationCancel?.cancel();
            const cancel = new Gio.Cancellable();
            record.generationCancel = cancel;
            record.events.clear();
            this._emit();
            record.client.generate_instances(this._range.start, this._range.end, cancel, (component, start, end) => {
                try {
                    if (this._destroyed || cancel.is_cancelled())
                        return false;
                    if (component.get_first_property(this._ical.PropertyKind.STATUS_PROPERTY)?.get_status() === this._ical.PropertyStatus.CANCELLED)
                        return true;
                    const epoch = time => time.is_date()
                        ? GLib.DateTime.new_local(time.get_year(), time.get_month(), time.get_day(), 0, 0, 0).to_unix()
                        : time.as_timet_with_zone(time.get_timezone() ?? record.zone);
                    const begin = epoch(start) * 1000;
                    const uid = component.get_uid();
                    const id = `${record.id}:${uid}:${begin}`;
                    record.events.set(id, {id, sourceId: record.id, uid, start: begin, end: epoch(end) * 1000,
                        allDay: start.is_date(), title: component.get_summary() || 'Untitled event'});
                    this._emit();
                    return true;
                } catch (e) {
                    console.warn(`Grand Central Desktop calendar event: ${e.message}`);
                    return true;
                }
            });
        });
    }

    _emit() {
        if (this._queued || this._destroyed)
            return;
        this._queued = true;
        this._life.idle(() => {
            this._queued = false;
            this._changed([...this._records.values()].flatMap(record => [...record.events.values()]));
        });
    }

    destroy() {
        this._destroyed = true;
        this._cancel.cancel();
        this._life.destroy();
        for (const record of this._records.values()) {
            this._stopView(record);
            record.cancel.cancel();
        }
        this._records.clear();
        this._registry = null;
    }
}
