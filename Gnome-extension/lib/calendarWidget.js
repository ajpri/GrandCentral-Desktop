// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Lifetime} from './lifetime.js';
import {CalendarSource} from './calendarSource.js';
import {calendarRange, eventTime, isOngoing, upcomingEvents} from './calendarModel.js';
import {Tooltip, clippedText} from './tooltip.js';

export class CalendarWidget {
    constructor(settings, layoutChanged) {
        this._settings = settings;
        this._layoutChanged = layoutChanged;
        this._life = new Lifetime();
        this._clockSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._events = [];
        this.cards = [];
        this.actor = new St.BoxLayout({name: 'grand-central-desktop-calendar', style_class: 'dp-calendar', visible: false});
        this._life.connect(settings, 'changed::show-calendar', () => this._syncEnabled());
        this._life.connect(settings, 'changed::calendar-days', () => {
            this.source?.tick(settings.get_int('calendar-days'));
            this._render();
        });
        this._life.connect(settings, 'changed::calendar-max-events', () => this._render());
        this._life.connect(this._clockSettings, 'changed::clock-format', () => this._render());
        this._syncEnabled();
    }

    _syncEnabled() {
        if (this._settings.get_boolean('show-calendar')) {
            if (!this.source) {
                this.source = new CalendarSource(events => {
                    this._events = events;
                    this._render();
                }, this._settings.get_int('calendar-days'));
                this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
                    this.source.tick();
                    this._render();
                    return GLib.SOURCE_CONTINUE;
                });
            }
        } else {
            this._stopSource();
        }
        this._render();
    }

    _stopSource() {
        this.source?.destroy();
        this.source = null;
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        if (this._boundaryTimer) GLib.Source.remove(this._boundaryTimer);
        this._boundaryTimer = 0;
        this._events = [];
    }

    _scheduleBoundary(events, now) {
        if (this._boundaryTimer) GLib.Source.remove(this._boundaryTimer);
        this._boundaryTimer = 0;
        if (!this.source) return;
        const time = now.getTime();
        const boundary = Math.min(calendarRange(now, 1).end.getTime(), ...events
            .filter(event => !event.allDay && event.end > event.start)
            .flatMap(event => [event.start, event.end]).filter(value => value > time));
        this._boundaryTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, boundary - time), () => {
            this._boundaryTimer = 0;
            this._render();
            return GLib.SOURCE_REMOVE;
        });
    }

    _render() {
        const now = new Date();
        const events = this._settings.get_boolean('show-calendar')
            ? upcomingEvents(this._events, now, this._settings.get_int('calendar-days'),
                this._settings.get_int('calendar-max-events')) : [];
        const labels = events.map(event => eventTime(event, now, this._clockSettings.get_string('clock-format')));
        this._scheduleBoundary(events, now);
        const key = JSON.stringify(events.map((event, index) => [event.id, event.title, labels[index]]));
        if (this._renderKey === key)
            return;
        this._renderKey = key;
        const count = this.cards.length;
        this.actor.destroy_all_children();
        this.cards = events.map((event, index) => {
            const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
                y_align: Clutter.ActorAlign.CENTER, x_expand: true, style_class: 'dp-calendar-event-text'});
            const title = new St.Label({text: event.title, style_class: 'dp-calendar-title', x_expand: true});
            const time = new St.Label({text: labels[index], style_class: 'dp-calendar-time', x_expand: true});
            for (const label of [title, time]) {
                label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                text.add_child(label);
            }
            const button = new St.Button({child: text, x_expand: true, can_focus: true,
                style_class: `dp-calendar-event${index ? ' dp-calendar-event-next' : ''}`,
                accessible_name: `${event.title}, ${labels[index]}, Open Calendar`});
            if (isOngoing(event, now)) button.add_style_class_name('dp-calendar-event-ongoing');
            button.connect('clicked', () => this._activate());
            new Tooltip(button, `${event.title}\n${labels[index]}`, () => !clippedText(title) && !clippedText(time));
            this.actor.add_child(button);
            return button;
        });
        this.actor.visible = events.length > 0;
        if (count !== events.length)
            this._layoutChanged();
        else if (this._geometry)
            this.setGeometry(this._geometry);
    }

    _activate() {
        Shell.AppSystem.get_default().lookup_app('org.gnome.Calendar.desktop')?.activate();
    }

    setGeometry(box) {
        this._geometry = box;
        this.actor.set_position(box.x, box.y);
        this.actor.set_size(box.width, box.height);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const width = Math.max(1, (box.width - 16 * scale) / Math.max(1, this.cards.length));
        this.cards.forEach(card => card.set_width(width));
    }

    destroy() {
        this._life.destroy();
        this._stopSource();
        this.actor.destroy();
    }
}
