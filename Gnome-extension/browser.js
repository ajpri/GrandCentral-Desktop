// SPDX-License-Identifier: GPL-3.0-or-later
// One profile owner, with an independent native WebView for each monitor.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import {programArgs} from 'system';
import {BrowserProfile} from './lib/browserProfile.js';
import {BrowserSettings} from './lib/browserSettings.js';
import {createBrowserView} from './lib/browserView.js';
import {BROWSER_OVERRIDE_KEYS, readMonitorMap, validateMonitorMap} from './lib/monitorModel.js';

const Unix = await import('gi://GLibUnix').then(module => module.default)
    .catch(() => ({signal_add: GLib.unix_signal_add}));
const NAME = 'org.grandcentraldesktop.Browser';
const PATH = '/org/grandcentraldesktop/Browser';
const viewXml = `<method name="SetGeometry"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/></method>
<method name="SetCoordinateScale"><arg type="i" direction="in"/></method>
<method name="SetVisible"><arg type="b" direction="in"/></method>
<method name="Navigate"><arg type="s" direction="in"/></method>
<method name="GetState"><arg type="s" direction="out"/></method>
<signal name="LocationChanged"><arg type="s"/></signal>`;
const serviceXml = `<method name="CreateView"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="o" direction="out"/></method>
<method name="DestroyView"><arg type="s" direction="in"/></method>
<method name="SetDisplayPreference"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="v" direction="in"/><arg type="b" direction="in"/></method>`;
const xml = body => `<node><interface name="${NAME}">${body}</interface></node>`;
const directory = programArgs[0];
if (!directory) throw new Error('The browser helper is started by Grand Central Desktop.');
const [, releaseBytes] = GLib.file_get_contents(`${directory}/release.json`);
const {uuid} = JSON.parse(new TextDecoder().decode(releaseBytes)).metadata;
const schemas = Gio.SettingsSchemaSource.new_from_directory(`${directory}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
const general = new Gio.Settings({settings_schema: schemas.lookup('org.gnome.shell.extensions.grand-central-desktop', true)});
const base = general.get_child('browser');
const app = new Gtk.Application({application_id: NAME, flags: Gio.ApplicationFlags.NON_UNIQUE});
const views = new Map();
let profile;
let exported;
let owner;
let closing = false;
let shutdownSignal = 0;
let shutdownTimeout = 0;

function createView(id, monitorId, initialUri) {
    if (!/^(?:default|[a-f0-9]{32})$/.test(id) || monitorId.length > 1024 || closing)
        throw new Error('Invalid browser view');
    if (views.has(id)) return views.get(id).path;
    if (views.size >= 33) throw new Error('Too many browser views');
    const settings = new BrowserSettings(general, base, monitorId, id === 'default', false, true);
    const api = createBrowserView({app, profile, settings, initialUri, uuid,
        uriChanged: uri => (views.get(id)?.object ?? exported)?.emit_signal('LocationChanged', new GLib.Variant('(s)', [uri ?? ''])),
        title: id === 'default' ? 'Grand Central Desktop Browser' : `Grand Central Desktop Browser · ${id.slice(0, 8)}`,
        styleId: `gcd-browser-${id}`});
    const path = id === 'default' ? PATH : `${PATH}/views/${id}`;
    const object = id === 'default' ? null : Gio.DBusExportedObject.wrapJSObject(xml(viewXml), api);
    object?.export(Gio.DBus.session, path);
    views.set(id, {api, settings, object, path});
    return path;
}

function destroyView(id) {
    const view = views.get(id);
    if (!view) return;
    view.api.destroy();
    view.settings.destroy();
    view.object?.unexport();
    views.delete(id);
}

app.connect('activate', () => {
    profile = new BrowserProfile();
    profile.context.connect('download-started', (_context, download) => download.cancel());
    const methods = {CreateView: createView, DestroyView: destroyView,
        SetDisplayPreference(id, key, value, reset) {
            if (!id || id.length > 1024 || !BROWSER_OVERRIDE_KEYS.includes(key)) throw new Error('Invalid display preference');
            const map = readMonitorMap(general.get_string('monitor-browser-overrides'));
            const record = Object.hasOwn(map, id) ? map[id] : {};
            if (reset) delete record[key]; else record[key] = value.deep_unpack();
            if (Object.keys(record).length) map[id] = record; else delete map[id];
            const text = JSON.stringify(map);
            validateMonitorMap(general, 'monitor-browser-overrides', text);
            general.set_string('monitor-browser-overrides', text);
        }};
    for (const name of ['SetGeometry', 'SetCoordinateScale', 'SetVisible', 'Navigate', 'GetState']) {
        methods[name] = (...args) => {
            const view = views.get('default');
            if (!view) throw new Error('Browser view is not ready');
            return view.api[name](...args);
        };
    }
    exported = Gio.DBusExportedObject.wrapJSObject(xml(viewXml + serviceXml), methods);
    exported.export(Gio.DBus.session, PATH);
    owner = Gio.bus_own_name_on_connection(Gio.DBus.session, NAME, Gio.BusNameOwnerFlags.NONE, null, () => app.quit());
    app.hold();
    shutdownSignal = Unix.signal_add(GLib.PRIORITY_DEFAULT, 15, () => {
        shutdownSignal = 0;
        if (!closing) {
            closing = true;
            for (const view of views.values()) view.api.stop();
            shutdownTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                shutdownTimeout = 0; app.quit(); return GLib.SOURCE_REMOVE;
            });
            profile.save().catch(error => console.warn(`Browser session save unavailable: ${error.message}`))
                .finally(() => app.quit());
        }
        return GLib.SOURCE_REMOVE;
    });
});
await app.runAsync([]);
for (const id of [shutdownSignal, shutdownTimeout]) if (id) GLib.Source.remove(id);
for (const id of [...views.keys()]) destroyView(id);
exported?.unexport();
if (owner) Gio.bus_unown_name(owner);
