import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import {pause, screenshot, pressKey} from '../helpers.js';

export const searchScenarios = {
    async checkDocumentSearch(extension, assert) {
        const panel = extension._panels[2];
        const items = panel._allItems;
        const selected = items[0];
        const message = panel._sourceMessage;
        const columns = panel.settings.get_int('columns');
        const rows = panel.settings.get_int('rows');
        const page = panel._page;
        const geometry = panel._geometry;
        const privacy = extension._privacy.get_boolean('remember-recent-files');
        const launch = Gio.AppInfo.launch_default_for_uri_async;
        const positions = () => JSON.stringify([panel.header, panel.searchEntry, panel.body, panel.footer]
            .map(actor => [...actor.get_transformed_position(), ...actor.get_transformed_size()]));
        try {
            assert(panel.searchEntry.visible, 'Recent Documents has a permanent search bar');
            assert(extension._contextActions.forActor(panel.searchEntry.clutter_text) === null && Boolean(panel.searchEntry.menu),
                'recent-file search keeps the native clipboard menu');
            panel.settings.set_int('columns', 1);
            panel.settings.set_int('rows', 1);
            panel.turn(1);
            await pause(100);
            const before = positions();
            panel.searchEntry.emit('primary-icon-clicked');
            await pause(80);
            assert(global.stage.get_key_focus() === panel.searchEntry.clutter_text && positions() === before,
                'focusing recent-file search does not move the grid');
            panel.searchEntry.set_text(selected.filename.toUpperCase());
            await pause(80);
            assert(panel._items.length === 1 && panel._items[0].uri === selected.uri && panel._page === 0,
                'typing a filename filters recent files and starts on the first results page');
            assert(positions() === before, 'typing a recent-file query leaves header, search row, grid, and footer stationary');
            let openedUri = null;
            Gio.AppInfo.launch_default_for_uri_async = uri => { openedUri = uri; };
            panel.searchEntry.clutter_text.emit('activate');
            assert(openedUri === selected.uri, 'Enter opens the first matching recent file through its default application');
            const button = panel.body.get_children()[0].get_children().find(actor => actor._grandCentralDesktopItem);
            assert(extension._contextActions.forActor(button).map(action => action.label).includes('Properties'),
                'filtered file icons retain normal file context actions');
            await screenshot('recent-files-search');
            panel.searchEntry.set_text('grand-central-no-such-file-12345');
            assert(!panel._items.length && panel.body.get_children()[0].text === 'No matching files.',
                'unmatched recent-file search has a concise empty state');
            openedUri = null;
            panel.searchEntry.clutter_text.emit('activate');
            assert(openedUri === null, 'Enter with no matching files does not open anything');
            await pressKey(Clutter.KEY_Escape);
            assert(panel.searchEntry.visible && !panel.searchEntry.get_text() && panel._page === 1 && positions() === before,
                'Escape restores the recent-file browsing page without hiding search or shifting icons');
            await pressKey(Clutter.KEY_Escape);
            assert(panel.searchEntry.visible && global.stage.get_key_focus() === panel.searchEntry.clutter_text,
                'empty Escape leaves recent-file search visible and focused');
            panel.searchEntry.set_text(`${selected.filename}x`);
            panel.searchEntry.clutter_text.set_cursor_position(-1);
            await pressKey(Clutter.KEY_BackSpace);
            assert(panel.searchEntry.get_text() === selected.filename && panel._items[0]?.uri === selected.uri,
                'native Backspace edits a recent-file query');
            const navigation = panel.captureNavigation();
            assert(navigation.query === selected.filename && navigation.browsePage === 1,
                'recent-file query and browsing page are captured for automatic updates');
            panel.setItems(items.filter(item => item.uri !== selected.uri), message);
            assert(!panel._items.length && panel.searchEntry.get_text() === selected.filename,
                'recent-file results follow source changes without clearing the query');
            panel.setItems(items.map(item => item.uri === selected.uri ? {...item, label: 'Custom document title'} : item), message);
            assert(panel._items[0]?.uri === selected.uri, 'filename search works when a recent document has a different display title');
            extension._privacy.set_boolean('remember-recent-files', false);
            for (let i = 0; i < 40 && panel._allItems.length; i++) await pause(50);
            assert(!panel._items.length && panel._message.includes('disabled'),
                'active file search respects privacy and displays the disabled-source message');
            extension._privacy.set_boolean('remember-recent-files', true);
            for (let i = 0; i < 40 && !panel._allItems.length; i++) await pause(50);
            assert(panel._items[0]?.uri === selected.uri, 'reenabling recent history refreshes the current query');
            panel.searchEntry.emit('secondary-icon-clicked');
            assert(panel._items.length === 2 && panel._page === 1 && panel.searchEntry.visible,
                'clear restores the unfiltered recent-file list and its page');
            panel.searchEntry.set_text('Project');
            panel.turn(1);
            assert(panel._page === 1 && panel._pageCount === 2, 'recent-file results retain independent pagination');
            panel.searchEntry.set_text(selected.filename);
            panel.setGeometry({...geometry, width: 300, height: 420});
            await pause(100);
            const [, bodyY] = panel.body.get_transformed_position();
            const [, bodyHeight] = panel.body.get_transformed_size();
            const [, entryY] = panel.searchEntry.get_transformed_position();
            const [, entryHeight] = panel.searchEntry.get_transformed_size();
            const [, footerY] = panel.footer.get_transformed_position();
            assert(entryY + entryHeight <= bodyY && bodyY + bodyHeight <= footerY + 1,
                'permanent recent-file search and pagination fit the Small panel size');
        } finally {
            Gio.AppInfo.launch_default_for_uri_async = launch;
            extension._privacy.set_boolean('remember-recent-files', privacy);
            panel.searchEntry.set_text('');
            panel.setItems(items, message);
            panel.settings.set_int('columns', columns);
            panel.settings.set_int('rows', rows);
            panel._page = page;
            panel.setGeometry(geometry);
            await pause(100);
        }
    },
    async checkAppSearch(extension, panel, assert) {
        assert(panel.searchEntry.visible && !panel.searchButton, 'All Apps has a persistent search bar without a toggle button');
        const originalPage = panel._page;
        const positions = () => JSON.stringify([panel.header, panel.searchEntry, panel.body, panel.footer]
            .map(actor => [...actor.get_transformed_position(), ...actor.get_transformed_size()]));
        await pause(100);
        const restingPositions = positions();
        panel.searchEntry.emit('primary-icon-clicked');
        await pause(80);
        assert(panel.searchEntry.visible && global.stage.get_key_focus() === panel.searchEntry.clutter_text,
            'persistent search entry accepts keyboard focus');
        assert(positions() === restingPositions, 'focusing search does not move the icon grid or pagination');
        assert(extension._contextActions.forActor(panel.searchEntry.clutter_text) === null && Boolean(panel.searchEntry.menu),
            'app search retains the native clipboard menu');
        const folder = panel._rootItems.find(item => item.children);
        const member = folder.children[0];
        panel.searchEntry.set_text(member.label.toUpperCase());
        assert(panel._items.some(item => item.id === member.id) && panel._items.every(item => item.app),
            'typing a program name finds apps inside folders as flat launchable results');
        assert(!panel.back.visible && !panel._renameButton.visible && panel._page === 0,
            'global results have a centered All Apps heading without folder actions');
        assert(panel.body.get_children()[0].get_children().filter(actor => actor._grandCentralDesktopItem)
            .every(actor => !actor._grandCentralDesktopDraggable), 'filtered results cannot accidentally regroup folders');
        await pause(100);
        assert(positions() === restingPositions, 'typing a search keeps header, entry, grid, and pagination in place');
        await screenshot('all-apps-search');
        const geometry = panel._geometry;
        panel.setGeometry({...geometry, width: 300, height: 420});
        await pause(100);
        const [, bodyY] = panel.body.get_transformed_position();
        const [, bodyHeight] = panel.body.get_transformed_size();
        const [, entryY] = panel.searchEntry.get_transformed_position();
        const [, entryHeight] = panel.searchEntry.get_transformed_size();
        const [, footerY] = panel.footer.get_transformed_position();
        assert(entryY + entryHeight <= bodyY && bodyY + bodyHeight <= footerY + 1 &&
            panel.body.get_children()[0].get_children().filter(actor => actor._grandCentralDesktopItem).every(actor => {
                const [, y] = actor.get_transformed_position();
                const [, height] = actor.get_transformed_size();
                return y >= bodyY && y + height <= bodyY + bodyHeight + 1;
            }), 'search entry, matching icons, and pagination fit the Small panel size');
        panel.setGeometry(geometry);
        const activate = member.app.activate;
        let launched = false;
        try {
            member.app.activate = () => { launched = true; };
            panel.searchEntry.clutter_text.emit('activate');
            assert(launched, 'Enter launches the first matching program');
        } finally { member.app.activate = activate; }
        panel.searchEntry.set_text('grand-central-no-such-app-12345');
        assert(!panel._items.length && panel.body.get_children()[0].text === 'No matching apps.',
            'unmatched queries display a concise empty state');
        panel.searchEntry.clutter_text.emit('activate');
        await pressKey(Clutter.KEY_Escape);
        assert(panel.searchEntry.visible && !panel.searchEntry.get_text() && panel._page === originalPage,
            'Escape clears search and restores the original grid page without hiding the bar');
        assert(positions() === restingPositions, 'clearing search preserves the original grid geometry');
        await pressKey(Clutter.KEY_Escape);
        assert(panel.searchEntry.visible && global.stage.get_key_focus() === panel.searchEntry.clutter_text && positions() === restingPositions,
            'Escape on an empty search leaves the bar visible and the grid stationary');
        panel._activate(folder);
        const folderPage = panel._page;
        assert(panel.searchEntry.visible, 'search remains visible inside folders');
        panel.searchEntry.grab_key_focus();
        await pause(100);
        const folderPositions = positions();
        const outside = panel._rootItems.find(item => item.app);
        panel.searchEntry.set_text(outside.label);
        assert(panel._items.some(item => item.id === outside.id) && !panel._renameButton.visible,
            'search opened from a folder still searches the whole application inventory');
        panel.searchEntry.set_text(`${outside.label}x`);
        panel.searchEntry.clutter_text.set_cursor_position(-1);
        await pressKey(Clutter.KEY_BackSpace);
        assert(panel.searchEntry.get_text() === outside.label && panel._folderId === folder.id,
            'native Backspace edits the query without leaving its underlying folder');
        assert(positions() === folderPositions, 'searching from a folder keeps the icon grid fixed when folder actions hide');
        const saved = panel.captureNavigation();
        assert(saved.query === outside.label && saved.folderId === folder.id && saved.browsePage === folderPage,
            'search query, underlying folder, and page are captured for automatic updates');
        const items = panel._rootItems;
        panel.setItems(items.filter(item => item.id !== outside.id), 'No applications.');
        assert(!panel._items.some(item => item.id === outside.id), 'search results follow live inventory changes');
        panel.setItems(items, panel._rootMessage);
        panel.searchEntry.emit('secondary-icon-clicked');
        assert(!panel.searchEntry.get_text() && panel._folderId === folder.id && panel._page === folderPage && panel.back.visible,
            'clear restores the open folder and page without changing membership');
        panel.renameFolder();
        assert(panel.searchEntry.visible && panel._nameEntry.visible, 'folder renaming keeps the persistent search row in place');
        panel._finishRename(false);
        panel.goBack();
        panel.searchEntry.set_text('  ');
        assert(!panel._isSearching() && panel._items.some(item => item.children), 'whitespace-only query retains the normal folder grid');
        panel.searchEntry.set_text('');
        assert(panel._page === originalPage && panel.searchEntry.visible, 'clearing search restores normal navigation with its bar retained');
    },
};
