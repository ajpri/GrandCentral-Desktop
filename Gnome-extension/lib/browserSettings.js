// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {BROWSER_OVERRIDE_KEYS, readMonitorMap} from './monitorModel.js';

// Small settings facade shared by Shell, native preferences, and browser views.
// Unset per-display values inherit the existing Browser preferences.
export class BrowserSettings {
    constructor(general, base, monitorId, primary = false, forceLocal = false, authoritative = false) {
        this.general = general;
        this.base = base;
        this.monitorId = monitorId;
        this.primary = primary;
        this.forceLocal = forceLocal;
        this.settings_schema = base.settings_schema;
        this._signals = new Map();
        this._pending = new Map();
        this._bindings = [];
        this._nextSignal = 1;
        this._cache = new Map(this.settings_schema.list_keys().map(key => [key, this.get_value(key).deep_unpack()]));
        this._emitChanges = () => {
            for (const key of this.settings_schema.list_keys()) {
                const value = this.get_value(key).deep_unpack();
                if (JSON.stringify(value) === JSON.stringify(this._cache.get(key))) continue;
                this._cache.set(key, value);
                for (const [signal, callback] of this._signals.values()) {
                    if (signal === 'changed' || signal === `changed::${key}`) callback(this, key);
                }
            }
        };
        const changed = () => { this._pending.clear(); this._emitChanges(); };
        this._baseSignal = base.connect('changed', changed);
        this._generalSignal = general.connect('changed::monitor-browser-overrides', changed);
        if (!authoritative && GLib.getenv('GSETTINGS_BACKEND') !== 'memory') {
            try {
                this._writer = Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SESSION,
                    Gio.DBusProxyFlags.DO_NOT_AUTO_START | Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES,
                    null, 'org.grandcentraldesktop.Browser', '/org/grandcentraldesktop/Browser',
                    'org.grandcentraldesktop.Browser', null);
            } catch (_error) { /* Preferences also work when the browser is stopped. */ }
        }
    }

    _overrides() {
        try { return readMonitorMap(this.general.get_string('monitor-browser-overrides')); }
        catch (_error) { return {}; }
    }

    get_value(key) {
        if (this._pending.has(key)) {
            const pending = this._pending.get(key);
            if (!pending.reset) return pending.value;
            return key === 'expanded' && !this.primary ? new GLib.Variant('b', false) : this.base.get_value(key);
        }
        const record = this._overrides()[this.monitorId];
        if (record && Object.hasOwn(record, key))
            return new GLib.Variant(this.settings_schema.get_key(key).get_value_type().dup_string(), record[key]);
        if (key === 'expanded' && !this.primary) return new GLib.Variant('b', false);
        return this.base.get_value(key);
    }
    get_string(key) { return this.get_value(key).deep_unpack(); }
    get_int(key) { return this.get_value(key).deep_unpack(); }
    get_boolean(key) { return this.get_value(key).deep_unpack(); }
    set_value(key, variant) {
        const local = this.forceLocal || !this.primary || this.general.get_int('monitor') === -2 ||
            Object.hasOwn(this._overrides()[this.monitorId] ?? {}, key);
        if (!local || !BROWSER_OVERRIDE_KEYS.includes(key)) return this.base.set_value(key, variant);
        if (!this.settings_schema.get_key(key).range_check(variant)) throw new Error('Invalid browser setting');
        if (this._writeThroughService(key, variant, false)) return true;
        const map = this._overrides();
        const record = Object.hasOwn(map, this.monitorId) ? map[this.monitorId] : {};
        record[key] = variant.deep_unpack();
        map[this.monitorId] = record;
        return this.general.set_string('monitor-browser-overrides', JSON.stringify(map));
    }
    set_string(key, value) { return this.set_value(key, new GLib.Variant('s', value)); }
    set_int(key, value) { return this.set_value(key, new GLib.Variant('i', value)); }
    set_boolean(key, value) { return this.set_value(key, new GLib.Variant('b', value)); }
    reset(key) {
        const map = this._overrides();
        if (BROWSER_OVERRIDE_KEYS.includes(key) && (this.forceLocal || !this.primary ||
            Object.hasOwn(map[this.monitorId] ?? {}, key)) && this._writeThroughService(key, new GLib.Variant('b', false), true)) return;
        if (map[this.monitorId] && Object.hasOwn(map[this.monitorId], key)) {
            delete map[this.monitorId][key];
            if (!Object.keys(map[this.monitorId]).length) delete map[this.monitorId];
            this.general.set_string('monitor-browser-overrides', JSON.stringify(map));
        } else if (!this.forceLocal && this.primary) this.base.reset(key);
    }
    _writeThroughService(key, value, reset) {
        if (!this._writer?.get_name_owner()) return false;
        try {
            this._writer.call_sync('SetDisplayPreference', new GLib.Variant('(ssvb)', [this.monitorId, key, value, reset]),
                Gio.DBusCallFlags.NONE, 2000, null);
            this._pending.set(key, {value, reset});
            this._emitChanges();
            return true;
        } catch (_error) { return false; }
    }
    connect(signal, callback) {
        const id = this._nextSignal++;
        this._signals.set(id, [signal, callback]);
        return id;
    }
    disconnect(id) { this._signals.delete(id); }
    bind(key, target, property, flags) {
        let syncing = false;
        const update = () => { syncing = true; target[property.replaceAll('-', '_')] = this.get_value(key).deep_unpack(); syncing = false; };
        const id = this.connect(`changed::${key}`, update);
        update();
        if (flags === Gio.SettingsBindFlags.DEFAULT || flags & Gio.SettingsBindFlags.SET) {
            const notify = target.connect(`notify::${property}`, () => {
                if (!syncing) this.set_value(key, new GLib.Variant(this.settings_schema.get_key(key).get_value_type().dup_string(), target[property.replaceAll('-', '_')]));
            });
            this._bindings.push([target, notify]);
        }
        return id;
    }
    destroy() {
        this.base.disconnect(this._baseSignal);
        this.general.disconnect(this._generalSignal);
        for (const [target, id] of this._bindings) target.disconnect(id);
        this._bindings = [];
        this._signals.clear();
        this._writer = null;
    }
}
