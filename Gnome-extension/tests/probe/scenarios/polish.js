import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, readBrowserState, screenshot} from '../helpers.js';

async function findShortcut() {
    const keyboard = global.stage.get_context().get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    try {
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_f, Clutter.KeyState.PRESSED);
        await pause(30);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_f, Clutter.KeyState.RELEASED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
        await pause(80);
    } finally { keyboard.run_dispose(); }
}

export const polishScenarios = {
    async checkPolish(runtime, assert) {
        Main.overview.hide();
        const start = runtime._start;
        runtime._start = 0; runtime._layout();
        await pause(150);
        const desktop = runtime.panel('desktop');
        const items = [...desktop._items];
        desktop._page = 0; desktop.render();
        const focused = desktop._buttons[2];
        const uri = focused._grandCentralDesktopItem.uri;
        focused.grab_key_focus();
        runtime._layout();
        assert(global.stage.get_key_focus()?._grandCentralDesktopItem?.uri === uri,
            'a layout refresh preserves the focused desktop file');
        desktop.setItems([...items].reverse(), '');
        assert(global.stage.get_key_focus()?._grandCentralDesktopItem?.uri === uri,
            'a live source reorder preserves the focused file and follows it to its page');
        global.stage.set_key_focus(null);
        desktop._page = 0;
        desktop.setItems([items[0]], '');
        await pause(60);
        const footerHeight = desktop.footer.height;
        assert(desktop.pageLabel.text.includes('1 item') && !desktop.pageLabel.text.includes('1 items') &&
            desktop.previous.opacity === 0 && desktop.next.opacity === 0 && desktop.previous.width > 0,
            'single-item pagination uses singular text and hides arrows without collapsing their slots');
        desktop.setItems(items, '');
        await pause(60);
        assert(desktop.footer.height === footerHeight && desktop.next.opacity === 255,
            'multipage controls return without shifting the grid or footer');
        for (const id of ['apps', 'documents']) {
            runtime._start = id === 'apps' ? 5 : 1; runtime._layout();
            await pause(60);
            const panel = runtime.panel(id);
            panel._buttons[0].grab_key_focus();
            await findShortcut();
            assert(panel.searchEntry.contains(global.stage.get_key_focus()), `${id}: native Ctrl+F focuses the existing stationary search field`);
        }
        const controls = [runtime._previous, runtime._next, runtime._restoreBrowser,
            desktop.previous, desktop.next, runtime.panel('apps').back, runtime.panel('apps')._renameButton,
            runtime._media.button];
        assert(controls.every(actor => actor._grandCentralDesktopTooltip?.label.text),
            'icon-only navigation, folder, restore, and media controls have descriptive tooltips');
        const calculator = runtime.panel('calculator');
        calculator.entry.set_text('1/0'); calculator.solve();
        assert(calculator._error && calculator.history.text, 'calculator records an error before the correction test');
        calculator.entry.set_text('4+4');
        assert(!calculator._error && !calculator.history.text && calculator.history.opacity === 0,
            'editing clears the stale calculator error while retaining the reserved history row');
        runtime._start = 5; runtime._layout();
        const notes = runtime.panel('notes');
        const previous = notes.entry.get_text();
        notes.entry.set_text('Polish status test');
        await pause(450);
        assert(notes.status.text === 'Saved' && notes.status.opacity === 255, 'note save confirmation appears after autosave');
        await pause(2250);
        assert(notes.status.opacity === 0, 'Saved fades out while its footer allocation stays in place');
        notes.entry.set_text('Polish status test edited');
        assert(notes.status.text === 'Saving…' && notes.status.opacity === 255, 'new typing restores the visible Saving indicator');
        notes.entry.set_text(previous);
        runtime._start = 2; runtime._layout();
        const browser = await this.waitForBrowser(runtime, 'Grand Central Desktop browser test');
        const settings = browser.settings;
        const home = settings.get_string('home-url');
        await pause(300); // Let earlier same-URL/settings notifications settle before testing cancellation.
        settings.set_string('home-url', home.replace(/\/[^/]*$/, '/slow'));
        let state;
        for (let i = 0; i < 60; i++) {
            state = await readBrowserState(browser);
            if (state.loading && state.refreshLabel === 'Stop loading') break;
            await pause(40);
        }
        assert(state.loading && state.refreshLabel === 'Stop loading', 'Refresh becomes Stop during a real delayed page load');
        browser._call('Navigate', '(s)', ['refresh']);
        for (let i = 0; i < 60; i++) {
            state = await readBrowserState(browser);
            if (!state.loading && state.refreshLabel === 'Refresh') break;
            await pause(40);
        }
        assert(!state.loading && state.refreshLabel === 'Refresh', `Stop cancels the request and returns the control to Refresh${state.loading || state.refreshLabel !== 'Refresh' ? ': ' + JSON.stringify(state) : ''}`);
        settings.set_string('home-url', home);
        await this.waitForBrowser(runtime, 'Grand Central Desktop browser test');
        runtime._start = start; runtime._layout();
        await screenshot('polish-desktop');
    },
};
