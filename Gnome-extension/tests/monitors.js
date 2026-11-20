// Run with GSETTINGS_BACKEND=memory; never read or modify user settings.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {BrowserSettings} from '../lib/browserSettings.js';
import {monitorIdentity, monitorRecords, validateMonitorMap} from '../lib/monitorModel.js';
import {exportConfiguration, importConfiguration} from '../lib/configuration.js';
const schemas = Gio.SettingsSchemaSource.new_from_directory(`${GLib.get_current_dir()}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema: schemas.lookup('org.gnome.shell.extensions.grand-central-desktop', true)});
const base = settings.get_child('browser');
let count = 0;
const assert = (condition, name) => { if (!condition) throw new Error(name); count++; };
const first = ['DP-1', 'Vendor', 'Display', '123'];
const second = ['DP-2', 'Vendor', 'Display', '123'];
assert(monitorIdentity([first]) !== monitorIdentity([second]), 'Identical displays on different connectors keep separate identities');
assert(monitorIdentity([first, second]) === monitorIdentity([second, first]), 'Mirrored display identity is independent of physical enumeration order');
const records = monitorRecords([], [[0, 0, 1, 0, true, [first]], [1440, 0, 2, 0, false, [second]]]);
assert(records[1].id === monitorIdentity([second]) && records[1].scale === 2, 'Display records retain stable identities and independent scale');
const a = new BrowserSettings(settings, base, records[0].id, true);
const b = new BrowserSettings(settings, base, records[1].id, false);
assert(a.get_int('zoom-percent') === 100 && b.get_int('zoom-percent') === 100, 'New views inherit shared Browser defaults');
base.set_boolean('expanded', true);
assert(a.get_boolean('expanded') && !b.get_boolean('expanded'), 'Secondary views do not inherit another view expansion');
base.reset('expanded');
settings.set_int('monitor', -2);
a.set_string('home-url', 'https://example.com/a');
b.set_string('home-url', 'https://example.com/b');
assert(a.get_string('home-url').endsWith('/a') && b.get_string('home-url').endsWith('/b') && base.get_string('home-url') === 'about:blank',
    'Per-monitor homes are independent and leave the shared default unchanged');
base.set_int('zoom-percent', 150);
b.set_int('zoom-percent', 75);
base.set_int('zoom-percent', 125);
assert(a.get_int('zoom-percent') === 125 && b.get_int('zoom-percent') === 75, 'Shared defaults update only uncustomized view values');
a.set_string('background-color', '#f6f5f4');
b.set_string('background-color', '#34243d');
assert(a.get_string('background-color') !== b.get_string('background-color'), 'Matched background colors remain per view');
a.set_boolean('expanded', true);
assert(a.get_boolean('expanded') && !b.get_boolean('expanded'), 'Expansion affects only its monitor');
settings.set_int('monitor', -1);
a.set_boolean('expanded', false);
a.set_string('home-url', 'https://example.com/after-mode-change');
assert(!a.get_boolean('expanded') && a.get_string('home-url').endsWith('/after-mode-change') &&
    base.get_string('home-url') === 'about:blank', 'Existing view overrides remain editable after switching to single-monitor mode');
settings.set_int('monitor', -2);
a.set_string('home-url', 'https://example.com/a');
const action = new Gio.SimpleAction({name: 'binding-test', enabled: true});
b.bind('show-controls', action, 'enabled', Gio.SettingsBindFlags.DEFAULT);
action.enabled = false;
assert(!b.get_boolean('show-controls') && a.get_boolean('show-controls'), 'Native preference bindings write only their view');
b.set_boolean('show-controls', true);
assert(action.enabled, 'Settings bindings follow external changes');
b.reset('zoom-percent');
assert(b.get_int('zoom-percent') === 125 && base.get_int('zoom-percent') === 125, 'Reset restores inherited values without resetting defaults');
const exported = exportConfiguration(settings);
settings.reset('monitor-browser-overrides');
importConfiguration(settings, exported);
assert(a.get_string('home-url').endsWith('/a') && b.get_string('background-color') === '#34243d', 'Monitor overrides survive configuration export/import');
for (const [key, value] of [
    ['monitor-browser-overrides', '[]'],
    ['monitor-browser-overrides', JSON.stringify({display: {'home-url': 'javascript:bad'}})],
    ['monitor-browser-overrides', JSON.stringify({display: {'zoom-percent': 999}})],
    ['monitor-browser-overrides', JSON.stringify({display: {'show-controls': 'yes'}})],
    ['monitor-browser-overrides', JSON.stringify({display: {unknown: true}})],
    ['monitor-layouts', JSON.stringify({display: {start: -1}})],
]) {
    const before = exportConfiguration(settings);
    const data = JSON.parse(before);
    data.settings.general[key] = value;
    let rejected = false;
    try { importConfiguration(settings, JSON.stringify(data)); } catch (_error) { rejected = true; }
    assert(rejected && exportConfiguration(settings) === before, `Invalid monitor data rejected before writes: ${key}`);
}
assert(validateMonitorMap(settings, 'monitor-layouts', '{"display":{"start":6}}').display.start === 6,
    'Valid per-monitor carousel positions are accepted');
a.destroy(); b.destroy();
print(`Passed ${count} monitor assertions.`);
