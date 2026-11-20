import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {pause, screenshot} from '../helpers.js';

export const appsScenarios = {
    async checkApps(extension, assert) {
        const panel = extension._panels.find(panel => panel.id === 'apps');
        const view = extension._appsSource._view;
        const appsIn = entries => entries.flatMap(item => item.children ? appsIn(item.children) : [item]);
        const ids = () => appsIn(panel._rootItems).map(item => item.id);
        const flatten = entries => entries.flatMap(entry => entry.app ? [entry.app.get_id()]
            : entry.view ? flatten(entry.view.getAllItems()) : []);
        const gridIds = flatten(view.getAllItems()).filter(id => ids().includes(id));
        assert(gridIds.length > 0 && ids().length >= gridIds.length, 'All Apps includes the populated GNOME grid');
        assert(ids().filter(id => gridIds.includes(id)).join() === gridIds.join(), 'All Apps follows GNOME grid and folder order');
        assert(new Set(ids()).size === ids().length, 'All Apps has no duplicate applications');
        const installed = Shell.AppSystem.get_default().get_installed().filter(info =>
            info.should_show() && view._parentalControlsManager.shouldShowApp(info)).map(info => info.get_id());
        assert(installed.every(id => ids().includes(id)), 'All Apps includes every eligible installed app, including pinned favorites');
        const folderView = view.getAllItems().find(item => item.view)?.view;
        assert(folderView?.getAllItems().length === 2, 'GNOME folder fixture is populated');
        const folderItems = [...folderView._orderedItems];
        folderView._orderedItems = [...folderItems].reverse();
        folderView.emit('view-loaded');
        await pause(150);
        const folderIds = folderView.getAllItems().map(item => item.app.get_id());
        assert(ids().filter(id => folderIds.includes(id)).join() === folderIds.join(), 'All Apps follows live folder ordering changes');
        folderView._orderedItems = folderItems;
        folderView.emit('view-loaded');
        const folders = new Gio.Settings({schema_id: 'org.gnome.desktop.app-folders'});
        const savedFolders = folders.get_strv('folder-children');
        folders.set_strv('folder-children', []);
        await pause(200);
        folders.set_strv('folder-children', savedFolders);
        await pause(200);
        assert(installed.every(id => ids().includes(id)), 'folder removal and recreation keep all applications available');
        if (GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_APP_SORT')) {
            assert(Boolean(Extension.lookupByUUID(GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_APP_SORT'))), 'real Alphabetical App Grid extension enabled in isolated session');
            // Folder contents remain together; alphabetical top-level order is
            // checked independently from each folder's order.
            const top = view.getAllItems().map(item => item.name.toLowerCase());
            assert(top.join() === [...top].sort((a, b) => a.localeCompare(b)).join(), 'GNOME grid uses the installed alphabetical sorter');
        }
        const original = [...view._orderedItems];
        const compare = view._compareItems;
        try {
            view._orderedItems = [...original].reverse();
            view._compareItems = () => 0;
            view.emit('view-loaded');
            await pause(150);
            const reversed = flatten(view.getAllItems()).filter(id => ids().includes(id));
            assert(ids().filter(id => reversed.includes(id)).join() === reversed.join(), 'All Apps updates when live grid ordering changes');
        } finally {
            view._orderedItems = original;
            view._compareItems = compare;
            view.emit('view-loaded');
        }
        const settings = extension._settings;
        const saved = settings.get_strv('panel-order');
        settings.set_strv('panel-order', ['apps', ...saved.filter(id => id !== 'apps')]);
        assert(extension._panelOrder[0] === 'apps' && extension._start === 1, 'reordering keeps the current leftmost panel in view');
        extension._turnPanels(-1);
        const visible = () => extension._panels.filter(p => p.actor.visible).sort((a, b) => a.actor.x - b.actor.x).map(p => p.id).join();
        assert(visible() === 'apps,programs,desktop', 'carousel displays the custom panel order');
        panel.turn(1);
        assert(panel._page === 1 && extension._panels[1]._page === 0, 'All Apps has independent icon paging');
        panel.turn(-1);
        await pause(200);
        await screenshot('all-apps');
        await this.checkAppFolders(extension, panel, assert);
        await this.checkAppFolderEditing(extension, panel, assert);
        await this.checkAppSearch(extension, panel, assert);
        extension.disable();
        extension.enable();
        await pause(250);
        assert(extension._panelOrder[0] === 'apps' && visible() === 'apps,programs,desktop', 'custom panel order survives re-enabling');
        extension._settings.set_strv('panel-order', saved);
        extension._start = 0;
        extension._layout();
    },
    async checkAppFolders(extension, panel, assert) {
        const folder = panel._rootItems.find(item => item.children);
        assert(Boolean(folder) && folder.children.length === 2, 'All Apps renders GNOME folders as folder entries');
        const rootIds = panel._rootItems.map(item => item.id);
        assert(folder.children.every(child => !rootIds.includes(child.id)), 'folder apps are kept inside their folder');
        const activateFolder = () => {
            panel._page = 0;
            panel.render();
            while (!panel.body.get_children()[0].get_children().some(actor => actor.accessible_name === folder.label) &&
                panel._page + 1 < panel._pageCount)
                panel.turn(1);
            const button = panel.body.get_children()[0].get_children().find(actor => actor.accessible_name === folder.label);
            assert(Boolean(button), 'folder icon is available on its own grid page');
            button.emit('clicked', 1);
        };
        activateFolder();
        assert(panel._folderId === folder.id && panel.title.text === folder.label && panel.back.visible,
            'clicking folder opens its contents with a centered title and Back button');
        assert(panel._items.map(item => item.id).join() === folder.children.map(item => item.id).join(),
            'open folder shows GNOME’s ordered applications');
        await pause(150);
        await screenshot('app-folder');
        const app = panel._items[0].app;
        const activate = app.activate;
        let launched = false;
        try {
            app.activate = () => { launched = true; };
            panel._activate(panel._items[0]);
            assert(launched, 'apps inside folders use normal application activation');
        } finally {
            app.activate = activate;
        }
        const folderSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.app-folders.folder',
            path: `/org/gnome/desktop/app-folders/folders/${folder.folderId}/`});
        const name = folderSettings.get_string('name');
        folderSettings.set_string('name', 'Renamed folder');
        await pause(200);
        assert(panel.title.text === 'Renamed folder', 'folder renaming updates the open panel live');
        folderSettings.set_string('name', name);
        await pause(200);
        const members = folderSettings.get_strv('apps');
        folderSettings.set_strv('apps', [members[0]]);
        await pause(200);
        assert(panel._items.length === 1 && panel._items[0].id === members[0], 'open folder follows GNOME membership changes live');
        folderSettings.set_strv('apps', members);
        await pause(200);
        const columns = panel.settings.get_int('columns');
        const rows = panel.settings.get_int('rows');
        panel.settings.set_int('columns', 1);
        panel.settings.set_int('rows', 1);
        panel.turn(1);
        assert(panel._page === 1 && panel._pageCount === 2, 'folder contents have independent icon pages');
        const rootPage = panel._rootPage;
        panel.back.emit('clicked', 1);
        assert(panel._folderId === null && panel._page === rootPage && !panel.back.visible,
            'Back returns to the previous All Apps page');
        panel._activate(panel._rootItems.find(item => item.id === folder.id));
        const folders = new Gio.Settings({schema_id: 'org.gnome.desktop.app-folders'});
        const children = folders.get_strv('folder-children');
        folders.set_strv('folder-children', []);
        await pause(200);
        assert(panel._folderId === null && !panel.back.visible, 'removing an open GNOME folder returns safely to All Apps');
        folders.set_strv('folder-children', children);
        panel.settings.set_int('columns', columns);
        panel.settings.set_int('rows', rows);
        await pause(200);
        panel._page = 0;
        panel.render();
    },
};
