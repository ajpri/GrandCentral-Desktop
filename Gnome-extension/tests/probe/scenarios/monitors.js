import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, readBrowserState, screenshot} from '../helpers.js';

function displayCall(method, parameters = null) {
    return new Promise((resolve, reject) => Gio.DBus.session.call('org.gnome.Mutter.DisplayConfig',
        '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig', method, parameters, null,
        Gio.DBusCallFlags.NONE, 5000, null, (connection, result) => {
            try { resolve(connection.call_finish(result).deep_unpack()); } catch (error) { reject(error); }
        }));
}

export const monitorScenarios = {
    async checkMonitors(owner, assert) {
        let runtime = owner._grandCentralDesktopLoader.runtime;
        const settings = runtime._settings;
        const original = {monitor: settings.get_int('monitor'), id: settings.get_string('monitor-id'),
            overrides: settings.get_string('monitor-browser-overrides'), layouts: settings.get_string('monitor-layouts'), start: runtime._start};
        const wait = async condition => { for (let i = 0; i < 150 && !condition(); i++) await pause(50); };
        const read = async (surface, title) => {
            const browser = surface.panel('browser');
            for (let i = 0; i < 150; i++) {
                if (browser._proxy?.get_name_owner()) {
                    const state = await readBrowserState(browser);
                    if (state.loaded && state.title === title) return state;
                }
                await pause(50);
            }
            throw new Error(`Monitor browser did not load ${title}`);
        };
        assert(Main.layoutManager.monitors.length === 2, 'two real virtual monitors are available');
        settings.set_int('monitor', -2);
        await wait(() => runtime._extraSurfaces.size === 1);
        let secondary = [...runtime._extraSurfaces.values()][0];
        assert(runtime._active && secondary?._active && secondary._monitorKey !== runtime._monitorKey,
            'All monitors creates independent desktop surfaces with stable identities');
        const otherStart = secondary._start;
        runtime._turnPanels(1);
        assert(secondary._start === otherStart && runtime._start !== secondary._start,
            'carousel navigation changes only its own monitor');
        assert(runtime._surfaceAt(secondary._monitorSpec.x + 20, secondary._monitorSpec.y + 20) === secondary,
            'carousel shortcut targeting selects the monitor under the pointer');
        for (const surface of [runtime, secondary]) {
            const monitor = surface._monitorSpec;
            const shown = surface._panels.filter(panel => panel.actor.visible);
            assert(shown.length === 3 && shown.every(panel => panel.actor.x >= monitor.x &&
                panel.actor.x + panel.actor.width <= monitor.x + monitor.width),
            `monitor ${monitor.index}: three panels fit inside its own work area`);
        }
        const noteA = runtime.panel('notes');
        const noteB = secondary.panel('notes');
        assert(noteA.store === noteB.store, 'display note editors share one document and one writer');
        noteA.entry.set_text('Shared **note**\nAcross monitors');
        assert(noteB.entry.get_text() === noteA.entry.get_text(), 'note edits synchronize immediately to the other monitor');
        noteB.entry.set_text('Edited on the second display');
        assert(noteA.entry.get_text() === 'Edited on the second display', 'note synchronization works in either direction');
        noteA.entry.set_text('Loaded on the first display');
        noteA.store.save();
        noteA._document.rememberLoad('Edited on the second display', noteA.entry.get_text());
        assert(noteA.undoButton.visible && noteB.undoButton.visible, 'note-load Undo is shared across monitor views');
        noteB.undoButton.emit('clicked', 1);
        assert(noteA.entry.get_text() === 'Edited on the second display' && noteB.entry.get_text() === noteA.entry.get_text(),
            'Undo from the other monitor restores the one shared note');
        runtime.panel('calculator').entry.set_text('12 + 3');
        secondary.panel('calculator').entry.set_text('9 * 9');
        assert(runtime.panel('calculator').entry.get_text() === '12 + 3', 'calculator inputs are independent between monitors');
        runtime.panel('documents').searchEntry.set_text('Project 01');
        assert(secondary.panel('documents').searchEntry.get_text() === '', 'document search and browsing state are independent');
        runtime.panel('documents').searchEntry.set_text('');
        for (const surface of [runtime, secondary]) { surface._start = 2; surface._layout(); }
        const a = runtime.panel('browser');
        let b = secondary.panel('browser');
        const home = a.settings.get_string('home-url');
        const origin = home.replace(/\/[^/]*$/, '');
        await read(runtime, 'Grand Central Desktop browser test');
        await read(secondary, 'Grand Central Desktop browser test');
        assert(a._process === b._process && a._proxy.get_object_path() !== b._proxy.get_object_path(),
            'monitor browsers use independent views in one profile-owning helper');
        a.settings.set_string('home-url', `${origin}/second.html`);
        await read(runtime, 'Second page');
        assert((await readBrowserState(b)).title === 'Grand Central Desktop browser test',
            'navigating one browser view leaves the other page unchanged');
        b.settings.set_int('zoom-percent', 150);
        await pause(200);
        assert((await readBrowserState(b)).zoom === 1.5 && (await readBrowserState(a)).zoom === 1,
            'browser zoom overrides apply only to the chosen monitor');
        a._call('Navigate', '(s)', ['match-page-color']);
        b._call('Navigate', '(s)', ['match-page-color']);
        await pause(350);
        assert((await readBrowserState(a)).backgroundColor === '#ffffff' &&
            (await readBrowserState(b)).backgroundColor === '#f6f5f4',
            'each view matches its own page background independently');
        a._call('Navigate', '(s)', ['toggle-expanded']);
        await pause(250);
        assert(runtime._restoreBrowser.visible && !secondary._restoreBrowser.visible && secondary._next.visible,
            'Expand and floating Restore are confined to the chosen monitor');
        runtime._restoreBrowser.emit('clicked', 1);
        a.settings.set_string('home-url', `${origin}/signin`);
        await read(runtime, 'Fixture signed in');
        b.settings.set_string('home-url', `${origin}/protected`);
        await read(secondary, 'Fixture sign-in restored');
        assert(true, 'signing in on one monitor shares cookies and website storage with the other');
        a.settings.set_string('home-url', `${origin}/signout`);
        await read(runtime, 'Fixture signed out');
        b._call('Navigate', '(s)', ['refresh']);
        await read(secondary, 'Fixture sign-in missing');
        assert(true, 'signing out on one monitor is respected by the other view');
        a.settings.set_string('home-url', `${origin}/index.html`);
        b.settings.set_string('home-url', `${origin}/color-wrapper.html`);
        await read(runtime, 'Grand Central Desktop browser test');
        await read(secondary, 'Color wrapper');
        await screenshot('multiple-monitors');
        const secondaryId = secondary._monitorKey;
        secondary._turnPanels(1);
        const savedStart = secondary._start;
        const beforeProcess = a._process;
        const beforeRuntime = runtime;
        await this.publish(owner, 'good');
        await wait(() => owner._grandCentralDesktopLoader.runtime !== beforeRuntime);
        runtime = owner._grandCentralDesktopLoader.runtime;
        secondary = runtime._extraSurfaces.get(secondaryId);
        b = secondary.panel('browser');
        assert(secondary._start === savedStart && runtime.panel('browser')._process === beforeProcess && b._process === beforeProcess,
            'automatic updates preserve all display positions and the shared browser process');
        assert(runtime.panel('notes').entry.get_text() === 'Edited on the second display' &&
            secondary.panel('notes').entry.get_text() === 'Edited on the second display',
            'automatic updates preserve the synchronized single note');
        const loader = owner._grandCentralDesktopLoader;
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        const loadStylesheet = theme.load_stylesheet;
        try {
            theme.load_stylesheet = () => { throw new Error('Intentional multi-monitor stylesheet failure'); };
            const attempted = loader._attempted;
            await this.publish(owner, 'style');
            await wait(() => !loader._busy && loader._attempted !== attempted);
            assert(loader.runtime === runtime && runtime.panel('browser').actor.get_parent() === runtime._root &&
                b.actor.get_parent() === secondary._root && b._process === beforeProcess,
                'stylesheet failure keeps every monitor browser attached to its existing surface');
        } finally { theme.load_stylesheet = loadStylesheet; }
        const attempted = loader._attempted;
        await this.publish(owner, 'bad');
        await wait(() => !loader._busy && loader._attempted !== attempted);
        secondary = runtime._extraSurfaces.get(secondaryId);
        b = secondary.panel('browser');
        assert(loader.runtime === runtime && runtime._active && secondary._active &&
            b.actor.get_parent() === secondary._root && b._process === beforeProcess &&
            secondary._start === savedStart,
            'failed runtime update rolls back every monitor without losing browser views or carousel positions');
        await this.publish(owner, 'browser');
        await wait(() => loader.runtime !== runtime);
        runtime = loader.runtime;
        secondary = runtime._extraSurfaces.get(secondaryId);
        b = secondary.panel('browser');
        await read(runtime, 'Grand Central Desktop browser test');
        await read(secondary, 'Color wrapper');
        assert(b._process !== beforeProcess && b._process === runtime.panel('browser')._process,
            'browser-code update restarts one shared helper and restores each monitor to its own URL');
        const state = await displayCall('GetCurrentState');
        const [, physical, logical] = state;
        const config = logical.map(item => [item[0], item[1], item[2], item[3], item[4], item[5].map(spec => {
            const monitor = physical.find(record => record[0][0] === spec[0]);
            const mode = monitor[1].find(record => record[6]['is-current']?.deep_unpack());
            return [spec[0], mode[0], {}];
        })]);
        const apply = async configToApply => {
            const [serial] = await displayCall('GetCurrentState');
            await displayCall('ApplyMonitorsConfig', new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [serial, 1, configToApply, {}]));
            await pause(350);
        };
        const primaryIndex = runtime._monitorSpec.index;
        await apply([config[primaryIndex].map((value, index) => index === 4 ? true : value)]);
        await wait(() => runtime._extraSurfaces.size === 0);
        assert(runtime._active && !runtime._extraSurfaces.has(secondaryId),
            'disconnecting an output removes its surface while the remaining desktop stays usable');
        await apply(config);
        await wait(() => runtime._extraSurfaces.has(secondaryId));
        secondary = runtime._extraSurfaces.get(secondaryId);
        assert(secondary?._start === savedStart, 'reconnecting a display restores its own saved carousel position');
        await read(secondary, 'Color wrapper');
        assert(true, 'reconnecting restores the browser page without changing the shared profile');
        const mixed = config.map((record, index) => index === primaryIndex ? record : record.map((value, column) => column === 2 ? 2 : value));
        await apply(mixed);
        await wait(() => secondary._monitorSpec && secondary._monitorSpec.width < 2000);
        secondary._start = 2; secondary._layout();
        await pause(250);
        const native = global.get_window_actors().map(actor => actor.meta_window)
            .find(window => window.get_title().startsWith('Grand Central Desktop Browser ·'));
        await screenshot('multiple-monitors-scaled');
        const actual = native?.get_frame_rect();
        const desired = secondary.panel('browser')._geometry;
        assert(actual && Math.abs(actual.width - desired.width) <= 2 && Math.abs(actual.x - desired.x) <= 2,
            `browser native geometry follows the display after mixed-DPI reconfiguration: actual ${actual?.x},${actual?.y} ${actual?.width}x${actual?.height}; desired ${JSON.stringify(desired)}`);
        await apply(config);
        settings.set_string('monitor-id', secondaryId);
        settings.set_int('monitor', secondary._monitorSpec.index);
        await pause(150);
        assert(!runtime._active && secondary._active, 'Selected monitor mode displays the desktop only on the chosen stable identity');
        settings.set_string('monitor-id', 'unavailable-monitor');
        await pause(100);
        assert(runtime._active && !secondary._active && settings.get_string('monitor-id') === 'unavailable-monitor',
            'an unavailable selected display falls back to primary without erasing its saved identity');
        runtime.panel('browser').settings.set_boolean('expanded', true);
        await pause(150);
        assert(runtime._restoreBrowser.visible, 'saved browser overrides remain editable in single-monitor mode');
        runtime._restoreBrowser.emit('clicked', 1);
        assert(!runtime.panel('browser').settings.get_boolean('expanded'),
            'floating Restore still works after changing monitor mode');
        settings.set_string('monitor-browser-overrides', original.overrides);
        settings.set_string('monitor-layouts', original.layouts);
        settings.set_string('monitor-id', original.id);
        settings.set_int('monitor', original.monitor);
        runtime._start = original.start; runtime._layout();
        await read(runtime, 'Grand Central Desktop browser test');
        await this.publish(owner, 'baseline');
        await wait(() => owner._grandCentralDesktopLoader.runtime !== runtime);
    },
};
