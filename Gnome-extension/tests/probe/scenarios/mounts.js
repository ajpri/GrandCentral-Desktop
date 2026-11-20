import Gio from 'gi://Gio';
import {pause, output, TestMountMonitor, screenshot} from '../helpers.js';

export const mountsScenarios = {
    async checkMounts(extension, assert) {
        const {MountSource} = await import(`${extension.dir.get_uri()}/lib/mounts.js`);
        const panel = extension._panels[1];
        const monitor = new TestMountMonitor();
        const root = Gio.File.new_for_path(`${output}/USB Drive`);
        root.make_directory_with_parents(null);
        let name = 'USB Drive';
        const drive = {is_shadowed: () => false, get_root: () => root,
            get_name: () => name, get_icon: () => Gio.ThemedIcon.new('drive-removable-media')};
        monitor.mounts = [drive];
        extension._mountSource.destroy();
        extension._mountSource = new MountSource(() => {
            if (panel.settings.get_boolean('show-mounts'))
                extension._refreshDesktop();
        }, monitor);
        const mounted = () => panel._items.filter(item => item.mountedDrive);
        assert(!panel.settings.get_boolean('show-mounts') && !mounted().length, 'mounted drives are optional and default to hidden');
        panel.settings.set_boolean('show-mounts', true);
        await pause(200);
        assert(mounted().length === 1 && panel._items[0].uri === root.get_uri(), 'enabling mounted drives adds icons before Desktop files');
        const launch = Gio.AppInfo.launch_default_for_uri_async;
        let launched;
        try {
            Gio.AppInfo.launch_default_for_uri_async = uri => { launched = uri; };
            extension._activate(panel._items[0]);
            assert(launched === root.get_uri(), 'drive activation opens its root URI through the default file handler');
        } finally {
            Gio.AppInfo.launch_default_for_uri_async = launch;
        }
        name = 'Renamed USB';
        monitor.emit('mount-changed');
        await pause(200);
        assert(mounted()[0].label === name, 'mount changes refresh drive names live');
        await screenshot('desktop-mounts');
        monitor.mounts = [];
        monitor.emit('mount-removed');
        await pause(200);
        assert(!mounted().length && panel._items.length === 20, 'unmount removes drive icons and preserves Desktop files');
        monitor.mounts = [drive];
        monitor.emit('mount-added');
        await pause(200);
        assert(mounted().length === 1, 'newly mounted drives appear live');
        panel.settings.set_int('item-limit', 8);
        await pause(200);
        assert(panel._items.length === 8 && mounted().length === 1, 'drive and file icons share the Desktop item limit');
        panel.settings.reset('item-limit');
        const desktopPath = extension._settings.get_string('desktop-directory');
        extension._settings.set_string('desktop-directory', `${output}/missing-desktop`);
        await pause(200);
        assert(panel._items.length === 1 && mounted().length === 1, 'mounted drives remain available when Desktop folder is missing');
        extension._settings.set_string('desktop-directory', desktopPath);
        panel.settings.set_boolean('show-mounts', false);
        await pause(200);
        assert(!mounted().length && panel._items.length === 20, 'disabling mounted drives restores file-only Desktop');
        let late = false;
        const source = extension._mountSource;
        source.destroy();
        const pending = new MountSource(() => { late = true; }, monitor);
        monitor.emit('mount-added');
        pending.destroy();
        await pause(50);
        assert(!late, 'mount source cancels queued refreshes when destroyed');
        extension._mountSource = new MountSource(() => {
            if (panel.settings.get_boolean('show-mounts'))
                extension._refreshDesktop();
        });
    },
};
