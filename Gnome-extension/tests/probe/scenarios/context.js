import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {pause, screenshot} from '../helpers.js';

export const contextScenarios = {
    async checkContextMenus(extension, assert) {
        const {ContextServices} = await import(`file://${GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_ROOT')}/tests/contextFixture.js`);
        const services = new ContextServices();
        const start = extension._start;
        const desktop = extension._panels[1];
        const apps = extension._panels.find(panel => panel.id === 'apps');
        const directory = Gio.File.new_for_path(extension._settings.get_string('desktop-directory'));
        const folderFile = directory.get_child('Context folder');
        const labels = () => extension._contextMenu._getMenuItems().map(item => item.label?.text).filter(Boolean);
        const waitFor = async condition => {
            for (let i = 0; i < 80 && !condition(); i++) await pause(50);
        };
        const show = async actor => {
            const [x, y] = actor.get_transformed_position();
            const [width, height] = actor.get_transformed_size();
            extension._openContextMenu(x + width / 2, y + height / 2, actor);
            await pause(80);
            return labels();
        };
        const click = label => extension._contextMenu._getMenuItems().find(item => item.label?.text === label).emit('activate', null);
        const icon = (panel, item) => panel.body.get_children()[0].get_children().find(actor => actor._grandCentralDesktopItem?.id === item.id);
        const launch = Gio.AppInfo.launch_default_for_uri_async;
        const preferences = extension.openPreferences;
        try {
            await services.start();
            extension._openContextMenu(16, 70, extension._root);
            assert(labels().join() === 'Display Settings,Grand Central Desktop Settings',
                'blank desktop context menu offers system display settings before extension settings');
            const displays = extension._appSystem.lookup_app('gnome-display-panel.desktop');
            const activateDisplay = displays.activate;
            let displayOpened = false;
            try {
                displays.activate = () => { displayOpened = true; };
                click('Display Settings');
                assert(displayOpened, 'desktop Display Settings activates the native Displays panel');
                await show(desktop.title);
                displayOpened = false;
                click('Display Settings');
                assert(displayOpened, 'blank Desktop panel also opens native Display Settings');
            } finally { displays.activate = activateDisplay; }
            const lookupDisplay = extension._appSystem.lookup_app;
            try {
                extension._appSystem.lookup_app = id => id === 'gnome-display-panel.desktop' ? null : lookupDisplay.call(extension._appSystem, id);
                assert((await show(extension._root)).join() === 'Grand Central Desktop Settings',
                    'missing native Displays panel omits a dead display action');
                assert((await show(desktop.title)).join() === 'Open Desktop Folder,Grand Central Desktop Settings',
                    'missing Displays panel retains Desktop folder and extension settings');
            } finally { extension._appSystem.lookup_app = lookupDisplay; }
            await show(extension._root);
            let opened = false;
            extension.openPreferences = () => { opened = true; };
            click('Grand Central Desktop Settings');
            assert(opened, 'background menu retains extension settings');
            extension.openPreferences = preferences;
            extension._start = 0; extension._layout();
            desktop.turn(-desktop._page);
            await pause(100);
            const file = desktop._items.find(item => item.uri.endsWith('.txt'));
            const fileButton = icon(desktop, file);
            assert((await show(fileButton)).join() === 'Open,Show in Files,Properties,Grand Central Desktop Settings',
                'desktop file menu contains file actions without carousel commands');
            let openedUri;
            Gio.AppInfo.launch_default_for_uri_async = uri => { openedUri = uri; };
            click('Open');
            assert(openedUri === file.uri, 'file context Open uses the selected file URI');
            await show(fileButton); click('Show in Files');
            await waitFor(() => services.calls.some(call => call.method === 'ShowItems'));
            assert(services.calls.find(call => call.method === 'ShowItems')?.uris[0] === file.uri,
                'Show in Files sends the selected URI through the file-manager interface');
            await show(fileButton); click('Properties');
            await waitFor(() => services.calls.some(call => call.method === 'ShowItemProperties'));
            assert(services.calls.find(call => call.method === 'ShowItemProperties')?.uris[0] === file.uri,
                'Properties sends the selected URI through the file-manager interface');
            assert((await show(desktop.title)).join() === 'Open Desktop Folder,Display Settings,Grand Central Desktop Settings',
                'empty Desktop panel menu offers its folder, display settings, and extension settings');
            click('Open Desktop Folder');
            assert(openedUri === directory.get_uri(), 'Open Desktop Folder respects the configured Desktop directory');
            folderFile.make_directory(null);
            await waitFor(() => desktop._items.some(item => item.uri === folderFile.get_uri()));
            const folder = desktop._items.find(item => item.uri === folderFile.get_uri());
            assert(folder?.directory, 'Desktop enumeration identifies folders without extra menu-time disk probes');
            assert((await show(icon(desktop, folder))).join() === 'Open Folder,Show in Files,Properties,Grand Central Desktop Settings',
                'real Desktop folders have folder-specific actions');
            click('Open Folder');
            assert(openedUri === folder.uri, 'folder context action opens the folder itself');
            const programs = extension._panels[0];
            assert((await show(programs.title)).join() === 'Grand Central Desktop Settings',
                'Display Settings is limited to desktop background and empty Desktop panel');
            const program = programs._items[0];
            const app = program.app;
            const activate = app.activate;
            let launched = false;
            try {
                app.activate = () => { launched = true; };
                const names = await show(icon(programs, program));
                assert(names.includes('Open') && names.includes('Show Details') && !names.includes('Properties') && !names.includes('Show in Files'),
                    'program context menu offers app actions instead of file actions');
                click('Open');
                assert(launched, 'program context Open activates the selected application');
                await show(icon(programs, program)); click('Show Details');
                await waitFor(() => services.calls.some(call => call.method === 'AppDetails'));
                const details = services.calls.find(call => call.method === 'AppDetails');
                assert(details?.action === 'details' && details.app === app.get_id(),
                    'Show Details opens the selected application through GNOME Software');
            } finally { app.activate = activate; }
            const lookup = extension._appSystem.lookup_app;
            try {
                extension._appSystem.lookup_app = id => id === 'org.gnome.Software.desktop' ? null : lookup.call(extension._appSystem, id);
                assert(!(await show(icon(programs, program))).includes('Show Details'),
                    'app details are omitted when GNOME Software is unavailable');
            } finally { extension._appSystem.lookup_app = lookup; }
            extension._start = extension._panelOrder.indexOf('apps'); extension._layout();
            await pause(100);
            const collection = apps._rootItems.find(item => item.children);
            apps.goBack(); apps.turn(-apps._page);
            const capacity = apps.body.get_children()[0].get_children().length;
            apps.turn(Math.floor(apps._items.findIndex(item => item.id === collection.id) / capacity));
            assert((await show(icon(apps, collection))).join() === 'Open Folder,Rename Folder,Grand Central Desktop Settings',
                'All Apps folders offer Open Folder without filesystem properties');
            click('Open Folder');
            assert(apps._folderId === collection.id, 'app-folder context action opens the existing folder view');
            const nested = apps._items[0];
            assert((await show(icon(apps, nested))).includes('Show Details'), 'apps inside folders retain application context actions');
            apps.goBack();
            extension._start = 1; extension._layout();
            await pause(100);
            const calculator = extension._panels[3];
            assert(extension._contextActions.forActor(calculator.entry.clutter_text) === null,
                'calculator entry delegates context handling to GNOME Copy/Paste');
            assert(calculator.entry.menu._getMenuItems().map(item => item.label?.text).filter(Boolean).join() === 'Copy,Paste',
                'calculator entry has the native clipboard context menu');
            extension._start = 0; extension._layout();
            desktop.turn(-desktop._page);
            await pause(100);
            await show(icon(desktop, file));
            await screenshot('context-file');
            await show(icon(programs, program));
            await screenshot('context-app');
        } finally {
            extension.openPreferences = preferences;
            Gio.AppInfo.launch_default_for_uri_async = launch;
            extension._contextMenu.close();
            apps.goBack();
            if (folderFile.query_exists(null)) folderFile.delete(null);
            await waitFor(() => !desktop._items.some(item => item.uri === folderFile.get_uri()));
            desktop.turn(-desktop._page);
            extension._start = start; extension._layout();
            services.close();
        }
    },
};
