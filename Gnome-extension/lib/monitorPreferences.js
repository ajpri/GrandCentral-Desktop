// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {BrowserSettings} from './browserSettings.js';
import {monitorRecords, readMonitorMap} from './monitorModel.js';
import {group, link, subpage} from './preferencesControls.js';

export function browserMonitorPreferences(parent, settings, window, watch, buildPage) {
    const {page, navigation} = subpage('Per-monitor browser settings');
    link(parent, 'Per-monitor browser settings', () => window.push_subpage(navigation), 'video-display-symbolic');
    const displays = group(page, 'Displays');
    const rows = [];
    const pages = new Map();
    const cancel = new Gio.Cancellable();
    let records = [];
    let rendered = '';
    const render = () => {
        let saved = {};
        try { saved = readMonitorMap(settings.get_string('monitor-browser-overrides')); } catch (_error) { /* Keep defaults usable. */ }
        const available = [...records];
        for (const id of Object.keys(saved)) {
            if (available.some(record => record.id === id)) continue;
            let name = 'Disconnected display';
            try { const spec = JSON.parse(id)[0]; name = `${spec[2] || 'Display'} (${spec[0]}) · disconnected`; } catch (_error) { /* Imported identity. */ }
            available.push({id, name});
        }
        const signature = JSON.stringify(available.map(record => [record.id, record.name]));
        const status = id => Object.keys(saved[id] ?? {}).length ? 'Customized' : 'Using defaults';
        if (rendered === signature) {
            rows.forEach(row => { row.subtitle = status(row._monitorId); });
            return;
        }
        rendered = signature;
        for (const row of rows.splice(0)) displays.remove(row);
        for (const record of available) {
            const row = link(displays, record.name, () => {
                if (!pages.has(record.id)) {
                    const scoped = new BrowserSettings(settings, settings.get_child('browser'), record.id, false, true);
                    const detail = buildPage('browser', {get_child: () => scoped}, window, watch, true);
                    detail.title = `Browser · ${record.name}`;
                    detail._monitorSettings = scoped;
                    pages.set(record.id, {scoped, detail});
                }
                window.push_subpage(pages.get(record.id).detail);
            });
            row._monitorId = record.id;
            row.subtitle = status(record.id);
            rows.push(row);
        }
    };
    const refresh = () => Gio.DBus.session.call('org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig',
        'org.gnome.Mutter.DisplayConfig', 'GetCurrentState', null, null, Gio.DBusCallFlags.NONE, 3000, cancel,
        (connection, result) => {
            try {
                const [, physical, logical] = connection.call_finish(result).deep_unpack();
                if (cancel.is_cancelled()) return;
                records = monitorRecords(physical, logical);
                render();
            } catch (_error) { if (!cancel.is_cancelled()) render(); }
        });
    const changed = settings.connect('changed::monitor-browser-overrides', render);
    const subscription = Gio.DBus.session.signal_subscribe('org.gnome.Mutter.DisplayConfig',
        'org.gnome.Mutter.DisplayConfig', 'MonitorsChanged', '/org/gnome/Mutter/DisplayConfig', null,
        Gio.DBusSignalFlags.NONE, refresh);
    window.connect('close-request', () => {
        cancel.cancel();
        settings.disconnect(changed);
        Gio.DBus.session.signal_unsubscribe(subscription);
        for (const {scoped} of pages.values()) scoped.destroy();
        return false;
    });
    refresh();
}
