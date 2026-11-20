import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, screenshot} from '../helpers.js';

export const desktopScenarios = {
    async checkDesktopFiles(extension, assert) {
        const desktop = extension._panels[1];
        desktop.turn(1);
        assert(desktop._page === 1, 'independent icon paging');
        assert(extension._panels[2]._page === 0, 'other icon pages unchanged');
        const extra = `${extension._desktopPath}/New file.txt`;
        GLib.file_set_contents(extra, 'Live update');
        await pause(650);
        assert(desktop._items.length === 21, 'Desktop file monitor updates live');
        GLib.unlink(extra);
        await pause(650);
        assert(desktop._items.length === 20, 'Desktop file removal updates live');
        desktop.turn(-1);
        await this.checkMounts(extension, assert);
        const hit = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,
            desktop.actor.x + 40, desktop.actor.y + 100);
        assert(hit && desktop.actor.contains(hit), 'desktop panel receives pointer input');
    },
    async checkLifecycle(extension, assert) {
        const calculator = extension._panels[3];
        extension._panels[2].settings.set_string('background-color', '#f6f5f4');
        await pause(200);
        assert(extension._panels[2].actor.get_style().includes('#181818'), 'light panel uses dark text');
        assert(extension._panels[1].settings.get_string('background-color') === '#181818', 'panel colors independent');
        extension._panels[2].settings.reset('background-color');
        extension._privacy.set_boolean('remember-app-usage', false);
        extension._privacy.set_boolean('remember-recent-files', false);
        await pause(200);
        assert(extension._settings.get_strv('recent-programs').length === 0, 'app privacy clears extension history');
        assert(extension._panels[2]._items.length === 0, 'document privacy hides documents');
        extension._privacy.set_boolean('remember-app-usage', true);
        extension._privacy.set_boolean('remember-recent-files', true);
        await pause(200);
        calculator._queueEntryFocus();
        const inputLife = calculator._inputLife;
        extension.disable();
        assert(extension.panel('desktop') === undefined && extension._panels === null,
            'disabling releases the named panel registry');
        assert(inputLife._sources.size === 0, 'destroying calculator cancels pending click focus');
        assert(!Main.layoutManager._backgroundGroup.get_children().some(actor => actor.name === 'grand-central-desktop-desktop'), 'disable removes desktop actors');
        extension.enable();
        await pause(500);
        assert(extension._panels.length === 7 && extension._root.get_parent() === Main.layoutManager._backgroundGroup, 're-enable rebuilds desktop');
        extension._panels.forEach(p => p.settings.set_boolean('enabled', false));
        assert(extension._panels.every(p => !p.actor.visible), 'all panels can be disabled');
        assert(!extension._carousel.visible && extension._root.reactive, 'hidden panels leave a reactive desktop for the settings context menu');
        extension._panels.forEach(p => p.settings.set_boolean('enabled', true));
    },
    async checkCarousel(extension, assert) {
        const visibleIds = () => extension._panels.filter(p => p.actor.visible)
            .sort((a, b) => a.actor.x - b.actor.x).map(p => p.id).join(',');
        extension._turnPanels(-2);
        assert(extension._start === 6 && visibleIds() === 'notes,programs,desktop', 'carousel wraps backward from first panel to last');
        extension._turnPanels(1);
        assert(extension._start === 0 && visibleIds() === 'programs,desktop,documents', 'carousel wraps forward from last panel to first');
        for (let i = 0; i < 14; i++)
            extension._turnPanels(1);
        assert(extension._start === 0, 'carousel keeps scrolling through repeated full cycles');
        extension._settings.set_strv('recent-programs', ['org.gnome.Nautilus.desktop', 'org.gnome.Calculator.desktop', 'org.gnome.Settings.desktop']);
        await pause(200);
    },
    async checkWindowStack(extension, assert) {
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
        for (const variable of global.create_app_launch_context(0, -1).get_environment()) {
            if (/^(DISPLAY|WAYLAND_DISPLAY|XAUTHORITY)=/.test(variable)) {
                const split = variable.indexOf('=');
                launcher.setenv(variable.slice(0, split), variable.slice(split + 1), true);
            }
        }
        const process = launcher.spawnv(['gjs', '-m', `${GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_ROOT')}/tests/foreground.js`]);
        let window;
        try {
            for (let i = 0; i < 50; i++) {
                window = global.get_window_actors().map(actor => actor.meta_window)
                    .find(candidate => candidate.get_title() === 'Grand Central Desktop Foreground Test');
                if (window)
                    break;
                await pause(100);
            }
            assert(Boolean(window), 'foreground test application opens');
            const panel = extension._panels[1].actor;
            const x = Math.round(panel.x + 24);
            const y = Math.round(panel.y + 24);
            window.move_resize_frame(false, x, y, 520, 460);
            window.activate(global.get_current_time());
            await pause(500);
            const inFront = () => {
                const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x + 150, y + 150);
                const actor = window.get_compositor_private();
                return Boolean(picked && (picked === actor || actor.contains(picked)));
            };
            assert(inFront(), 'new application windows appear above panels');
            // Reproduce enabling Grand Central Desktop with Firefox already open.
            extension.disable();
            extension.enable();
            await pause(600);
            assert(inFront(), 'existing windows remain above newly enabled panels');
            window.minimize();
            await pause(350);
            const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x + 150, y + 150);
            assert(extension._root.contains(picked), 'minimizing reveals interactive desktop panels');
            window.unminimize();
            window.activate(global.get_current_time());
            await pause(400);
            assert(inFront(), 'restoring a window puts it above panels');
            const wallpaper = new St.Widget({name: 'replacement-wallpaper-test', width: 1, height: 1});
            Main.layoutManager._backgroundGroup.add_child(wallpaper);
            assert(Main.layoutManager._backgroundGroup.get_last_child() === extension._root, 'wallpaper replacement keeps panels above wallpaper');
            wallpaper.destroy();
            assert(inFront(), 'wallpaper changes keep application windows in front');
            await screenshot('foreground-window');
        } finally {
            process.force_exit();
            await pause(200);
        }
    },
};
