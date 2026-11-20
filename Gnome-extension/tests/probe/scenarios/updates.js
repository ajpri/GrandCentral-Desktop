import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, readBrowserState} from '../helpers.js';

export const updatesScenarios = {
    async publish(owner, mode) {
        const child = Gio.Subprocess.new(['python3', `${GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_ROOT')}/tests/publish-update.py`,
            owner.path, mode], Gio.SubprocessFlags.STDOUT_SILENCE);
        await new Promise((resolve, reject) => child.wait_check_async(null, (source, result) => {
            try {
                source.wait_check_finish(result);
                resolve();
            } catch (e) {
                reject(e);
            }
        }));
    },
    async checkAutomaticUpdates(owner, assert) {
        const loader = owner._grandCentralDesktopLoader;
        assert(Boolean(loader?.runtime && loader.current?.id), 'automatic loader is active');
        const original = loader.runtime;
        const appFolder = original._panels.find(panel => panel.id === 'apps')._rootItems.find(item => item.children);
        original._panels.find(panel => panel.id === 'apps')._activate(appFolder);
        const originalApps = original._panels.find(panel => panel.id === 'apps');
        originalApps.searchEntry.set_text(appFolder.children[0].label);
        const originalDocuments = original._panels[2];
        const document = originalDocuments._allItems[0];
        originalDocuments.searchEntry.set_text(document.filename);
        const {TestPlayer} = await import(`file://${GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_ROOT')}/tests/mprisFixture.js`);
        const media = new TestPlayer('updates', 'Playing');
        await media.ready;
        const customOrder = ['programs', 'apps', 'documents', 'calculator', 'browser', 'desktop', 'notes'];
        original._settings.set_strv('panel-order', customOrder);
        const calculator = original._panels[3];
        calculator.entry.set_text('42');
        calculator._memory = 123;
        calculator.advancedToggle.checked = true;
        const notes = original.panel('notes');
        notes.settings.set_boolean('preview', false);
        notes.entry.set_text('Reload **note**\n\n- [ ] Keep this draft');
        notes.entry.clutter_text.set_cursor_position(5);
        // Carousel positions now survive restarts. Give Desktop a real grid
        // allocation before selecting its second page for the update test.
        original._start = customOrder.indexOf('desktop');
        original._layout();
        for (let i = 0; i < 60 && original._panels[1]._pageCount < 2; i++)
            await pause(100);
        original._panels[1].turn(1 - original._panels[1]._page);
        assert(original._panels[1]._page === 1, 'update fixture selects a real second Desktop icon page');
        original._start = 2;
        original._layout();
        const browser = original._panels[4];
        for (let i = 0; i < 40 && !browser._proxy; i++)
            await pause(100);
        const process = browser._process;
        const uri = (await readBrowserState(browser)).uri;
        browser.settings.set_boolean('expanded', true);
        const publish = mode => this.publish(owner, mode);
        await publish('good');
        for (let i = 0; i < 80 && loader.runtime === original; i++)
            await pause(100);
        const updated = loader.runtime;
        assert(updated !== original && updated._liveUpdateMarker === 'good-nested-module', 'installed update reloads runtime and nested modules automatically');
        await pause(400);
        assert(updated._start === 2, 'automatic update preserves carousel position');
        assert(updated._panelOrder.join() === customOrder.join(), 'automatic update preserves custom panel order');
        assert(updated._panels.find(panel => panel.id === 'apps')._folderId === appFolder.id,
            'automatic update preserves the open All Apps folder');
        const updatedApps = updated._panels.find(panel => panel.id === 'apps');
        assert(updatedApps.searchEntry.visible &&
            updatedApps.searchEntry.get_text() === appFolder.children[0].label &&
            updatedApps._items.some(item => item.id === appFolder.children[0].id),
            'automatic update preserves the permanent search bar, query, and results');
        updatedApps.searchEntry.set_text('');
        assert(updated._panels[2].searchEntry.visible && updated._panels[2].searchEntry.get_text() === document.filename &&
            updated._panels[2]._items.some(item => item.uri === document.uri),
            'automatic update preserves recent-file query and results');
        updated._panels[2].searchEntry.set_text('');
        for (let i = 0; i < 50 && !updated._media.actor.visible; i++)
            await pause(50);
        assert(updated._media.actor.visible && updated._media.source.selected.name === media.name && media.calls === 0,
            'automatic update restores media controls without interrupting playback');
        assert(updated._panels[1]._page === 1, 'automatic update preserves icon pages');
        assert(updated._panels[3].entry.get_text() === '42' && updated._panels[3]._memory === 123,
            'automatic update preserves calculator input and memory');
        assert(updated._panels[3].advancedToggle.checked && updated._panels[3].advancedKeys.visible,
            'automatic update preserves the Advanced calculator choice');
        assert(updated.panel('notes').entry.get_text() === 'Reload **note**\n\n- [ ] Keep this draft' &&
            updated.panel('notes').entry.clutter_text.cursor_position === 5,
            'automatic update preserves the single note and editor cursor');
        assert(updated._panels[4] === browser && browser._process === process && (await readBrowserState(browser)).uri === uri,
            'unchanged browser keeps its process and browsing session during an update');
        assert(browser.settings.get_boolean('expanded') && updated._panels.filter(panel => panel.actor.visible).length === 1,
            'automatic updates preserve expanded browser mode');
        assert(updated._restoreBrowser.visible && !updated._previous.visible && !updated._next.visible &&
            updated._restoreBrowser.get_parent() === updated._root,
            'automatic updates retain floating Restore and hidden carousel arrows');
        const version = loader.current.id;
        await publish('same');
        await pause(400);
        assert(loader.runtime === updated, 'identical installed release does not rebuild panels');
        updated.panel('calculator').entry.set_text('1/0');
        updated.panel('calculator').solve();
        await publish('bad');
        for (let i = 0; i < 70; i++) {
            if (!loader._busy && loader._attempted !== version)
                break;
            await pause(100);
        }
        await pause(400);
        assert(loader.runtime === updated && updated._root?.get_parent() === Main.layoutManager._backgroundGroup,
            'failed update rolls back to working panels');
        assert(updated._panels[4] === browser && browser._process === process && browser._alive,
            'failed update preserves the existing browser session');
        assert(updated._panels[3]._memory === 123, 'failed update preserves calculator memory');
        assert(updated.panel('calculator')._error, 'failed update retains the calculator error state');
        updated.panel('calculator').entry.set_text('42');
        assert(!updated.panel('calculator').history.text, 'editing after rollback still clears a stale calculator error');
        assert(updated.panel('notes').entry.get_text().startsWith('Reload **note**'),
            'failed update preserves the saved note and current draft');
        for (let i = 0; i < 50 && !updated._media.actor.visible; i++)
            await pause(50);
        assert(updated._media.source.selected?.name === media.name, 'failed update restores media subscriptions after rollback');
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        const loadStylesheet = theme.load_stylesheet;
        try {
            theme.load_stylesheet = () => { throw new Error('Intentional stylesheet load failure'); };
            const attempted = loader._attempted;
            await publish('style');
            for (let i = 0; i < 60; i++) {
                if (!loader._busy && loader._attempted !== attempted)
                    break;
                await pause(100);
            }
            await pause(250);
            assert(loader.runtime === updated && browser.actor.get_parent() === updated._root && browser._process === process,
                'stylesheet failure leaves the previous runtime and browser intact');
        } finally {
            theme.load_stylesheet = loadStylesheet;
        }
        await publish('corrupt');
        await pause(700);
        assert(loader.runtime === updated && loader.current.id === version, 'corrupt release is rejected before replacing the working runtime');
        const [, pointerBytes] = GLib.file_get_contents(`${owner.path}/active-release.json`);
        assert(JSON.parse(new TextDecoder().decode(pointerBytes)).release === version,
            'rejected update restores the installed pointer for the next login');
        owner.disable();
        assert(loader._monitor === null && loader._timer === 0 && loader.runtime === null,
            'disabling cleans up the release watcher and runtime');
        assert(updated._restoreBrowser === null, 'disabling removes the floating Restore control');
        owner.enable();
        for (let i = 0; i < 60 && !loader.runtime; i++)
            await pause(100);
        assert(loader.runtime?._liveUpdateMarker === 'good-nested-module', 're-enabling loads the installed release without a console command');
        loader.runtime._panels[4].settings.set_boolean('expanded', false);
        media.close();
    },
};
