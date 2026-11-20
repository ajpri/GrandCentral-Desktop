import {pause, dragApp} from '../helpers.js';

export const appFoldersScenarios = {
    async checkAppFolderEditing(extension, panel, assert) {
        const folders = panel._folders;
        const saved = folders.descriptors();
        const original = folders.settings.get_strv('folder-children');
        const states = original.map(id => {
            const settings = folders.folder(id);
            return [settings, settings.settings_schema.list_keys().map(key => [key, settings.get_value(key)])];
        });
        const created = [];
        const icon = id => {
            panel._page = 0;
            panel.render();
            while (!panel.body.get_children()[0].get_children().some(actor => actor._grandCentralDesktopItem?.id === id) &&
                panel._page + 1 < panel._pageCount)
                panel.turn(1);
            return panel.body.get_children()[0].get_children().find(actor => actor._grandCentralDesktopItem?.id === id);
        };
        try {
            panel.goBack();
            const roots = panel._rootItems.filter(item => item.app);
            assert(roots.length >= 2, 'folder drag fixture has root apps');
            const [first, second] = roots;
            const sourceButton = icon(first.id);
            const targetButton = panel.body.get_children()[0].get_children().find(actor => actor._grandCentralDesktopItem?.id === second.id);
            assert(Boolean(targetButton), 'native drag source and target share a visible grid page');
            const source = sourceButton._delegate;
            const target = targetButton._delegate;
            assert(!target.acceptDrop(target), 'dropping an app on itself does not create a folder');
            assert(!target.acceptDrop({app: first.app, id: first.id}), 'unrelated drag sources cannot edit app folders');
            await dragApp(panel, sourceButton, targetButton, assert);
            await pause(300);
            const folder = panel._rootItems.find(item => item.children && item.children.some(child => child.id === first.id) &&
                item.children.some(child => child.id === second.id));
            assert(Boolean(folder), 'new folder appears with both apps and leaves the root grid');
            created.push(folder.folderId);
            assert(folders.settings.get_strv('folder-children').includes(folder.folderId), 'new folder is persisted in GNOME Show Apps settings');
            assert(!panel._rootItems.some(item => item.id === first.id || item.id === second.id), 'created folder members are not duplicated at the root');
            panel.renameFolder(folder);
            assert(panel._nameEntry.visible && global.stage.get_key_focus() === panel._nameEntry.clutter_text,
                'folder rename opens a focused entry inside the header');
            panel._nameEntry.set_text('My renamed apps');
            panel._nameEntry.clutter_text.emit('activate');
            await pause(250);
            assert(panel.title.text === 'My renamed apps' && folders.folder(folder.folderId).get_string('name') === 'My renamed apps',
                'header rename updates the panel and native GNOME folder');
            assert(!folders.folder(folder.folderId).get_boolean('translate'), 'custom folder name is not treated as a translation key');
            panel.renameFolder();
            panel._nameEntry.set_text('Cancelled');
            panel._finishRename(false);
            assert(folders.folder(folder.folderId).get_string('name') === 'My renamed apps', 'cancel preserves the previous name');
            panel.renameFolder();
            panel._nameEntry.set_text('   ');
            panel._finishRename(true);
            assert(folders.folder(folder.folderId).get_string('name') === 'My renamed apps', 'empty rename preserves the previous name');
            const inside = icon(first.id);
            assert(Boolean(inside._grandCentralDesktopDraggable), 'folder apps have native GNOME drag gestures');
            inside._grandCentralDesktopDraggable.emit('drag-begin', 0);
            panel.render();
            assert(inside.get_parent() !== null && panel._dragging, 'live render cannot destroy an active drag source');
            inside._grandCentralDesktopDraggable.emit('drag-end', 0, false);
            await pause(80);
            assert(!panel._dragging && !panel._dragMonitor, 'cancelled drag clears monitor and refreshes safely');
            await dragApp(panel, icon(first.id), null, assert, true);
            const moved = icon(first.id)._delegate;
            assert(panel.back._delegate.acceptDrop(moved), 'dropping on Back returns an app to the root');
            await pause(250);
            assert(!panel._folderId && panel._rootItems.some(item => item.id === first.id), 'moving out restores root app visibility');
            const oldFolder = panel._rootItems.find(item => item.folderId === folder.folderId);
            const drop = icon(oldFolder.id)._delegate;
            assert(drop.acceptDrop(icon(first.id)._delegate), 'app can be dropped onto an existing folder');
            await pause(250);
            assert(panel._rootItems.find(item => item.id === oldFolder.id).children.length === 2, 'existing folder updates membership live');
            const view = extension._appsSource._view;
            assert(view.getAllItems().some(item => item.id === folder.folderId), 'new folder is also present in the native Show Apps grid');
            const favorite = extension._appSystem.lookup_app(global.settings.get_strv('favorite-apps')[0]);
            folders.add(folder.folderId, favorite);
            await pause(150);
            folders.remove(first.app);
            await pause(100);
            folders.remove(second.app);
            await pause(200);
            const pinned = panel._rootItems.find(item => item.folderId === folder.folderId);
            assert(pinned?.children.length === 1 && pinned.children[0].id === favorite.get_id() &&
                !panel._rootItems.some(item => item.id === favorite.get_id()),
                'a folder containing only pinned favorites retains membership without root duplicates');
            folders.remove(favorite);
            await pause(200);
            assert(!folders.settings.get_strv('folder-children').includes(folder.folderId), 'moving out the last app removes the empty folder from GNOME');
        } finally {
            panel._finishRename(false, false);
            panel.goBack();
            for (const [settings, values] of states)
                for (const [key, value] of values)
                    settings.set_value(key, value);
            folders.settings.set_strv('folder-children', original);
            // Let GNOME dispose removed folder icons before resetting their
            // relocatable keys; otherwise its own changed callback can run
            // on a folder icon destroyed partway through that callback.
            await pause(150);
            for (const id of new Set([...created, ...folders.descriptors().filter(folder => !saved.some(old => old.id === folder.id)).map(folder => folder.id)])) {
                const settings = folders.folder(id);
                for (const key of settings.settings_schema.list_keys())
                    settings.reset(key);
            }
            await pause(250);
        }
    },
};
