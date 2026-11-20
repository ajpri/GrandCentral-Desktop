import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, output, screenshot} from '../helpers.js';

export const mediaScenarios = {
    async checkMedia(extension, assert) {
        const {TestPlayer} = await import(`file://${GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_ROOT')}/tests/mprisFixture.js`);
        let widget = extension._media;
        const waitFor = async condition => {
            for (let i = 0; i < 80 && !condition(); i++)
                await pause(50);
        };
        assert(!widget.actor.visible, 'media widget is hidden without an active track');
        const first = new TestPlayer('desktop', 'Playing');
        let second;
        try {
            await first.ready;
            await waitFor(() => widget.actor.visible);
            assert(widget.actor.visible && widget.title.text === first.title && widget.artist.text === first.artist,
                'real MPRIS player discovery displays title and artist');
            const oldSource = widget.source;
            extension.disable();
            assert(oldSource._entries.size === 0 && oldSource.selected === null, 'disable clears media subscriptions and players');
            extension.enable();
            widget = extension._media;
            await waitFor(() => widget.actor.visible);
            assert(widget.actor.visible && widget.title.text === first.title, 'media discovery finds a player already running at enable');
            const artFile = Gio.File.new_for_path(`${output}/cover.svg`);
            GLib.file_set_contents(artFile.get_path(), '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="18" fill="#613583"/><circle cx="48" cy="48" r="26" fill="#c061cb"/><circle cx="48" cy="48" r="8" fill="#ffffff"/></svg>');
            first.art = artFile.get_uri();
            first.update();
            await waitFor(() => widget._artUrl === first.art);
            assert(widget.art.gicon instanceof Gio.FileIcon && widget.art.gicon.get_file().equal(artFile),
                'media artwork uses the player cover URI');
            assert(widget._icon.icon_name === 'media-playback-pause-symbolic', 'playing media shows only a Pause action');
            widget.button.emit('clicked', 1);
            await waitFor(() => first.status === 'Paused' && widget._icon.icon_name === 'media-playback-start-symbolic');
            assert(first.calls === 1 && widget.actor.visible && widget.button.accessible_name === 'Play',
                'Pause reaches the player and keeps a visible resume control');
            widget.button.emit('clicked', 1);
            await waitFor(() => first.status === 'Playing' && widget._icon.icon_name === 'media-playback-pause-symbolic');
            assert(first.calls === 2 && first.status === 'Playing', 'Play resumes the paused MPRIS player');
            const height = extension._settings.get_int('panel-height');
            extension._settings.set_int('panel-height', 1200);
            await pause(150);
            assert(extension._panels.filter(panel => panel.actor.visible).every(panel =>
                panel.actor.y + panel.actor.height <= widget.actor.y - 11), 'media row does not overlap tall panels');
            extension._settings.set_int('panel-height', height);
            const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
            assert(widget.actor.x + widget.actor.width <= area.x + area.width &&
                widget.actor.y + widget.actor.height <= area.y + area.height && widget.actor.x > area.x + area.width / 2,
                'media widget sits inside the bottom-right work area');
            const [buttonX, buttonY] = widget.button.get_transformed_position();
            const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,
                buttonX + widget.button.width / 2, buttonY + widget.button.height / 2);
            assert(picked && (picked === widget.button || widget.button.contains(picked)), 'media play/pause button receives pointer input');
            await pause(250);
            await screenshot('media');
            await this.checkWeather(extension, assert);
            widget = extension._media;
            await waitFor(() => widget.source.selected?.name === first.name);
            const title = first.title;
            first.title = 'A long track title '.repeat(40);
            first.artist = 'A long artist name '.repeat(40);
            first.update();
            await waitFor(() => widget.title.text.startsWith('A long track'));
            await pause(100);
            const [rightX] = widget.button.get_transformed_position();
            assert(rightX + widget.button.width <= widget.actor.x + widget.actor.width,
                'long media metadata leaves the playback button inside the widget');
            first.title = title;
            first.artist = 'Test Artist';
            first.update();
            first.canPause = false;
            first.update();
            await waitFor(() => !widget.button.reactive);
            widget.button.emit('clicked', 1);
            await pause(100);
            assert(!widget.button.reactive && first.calls === 2, 'media controls respect player capabilities');
            first.canPause = true;
            first.update();
            second = new TestPlayer('browser', 'Paused');
            second.title = 'Browser playback';
            await second.ready;
            await pause(250);
            assert(widget.source.selected.name === first.name, 'playing app takes priority over a paused browser');
            second.status = 'Playing';
            second.update();
            await waitFor(() => widget.title.text === second.title);
            assert(widget.source.selected.name === second.name, 'latest playing browser becomes the controlled player');
            second.close();
            second = null;
            await waitFor(() => widget.title.text === first.title);
            assert(widget.source.selected.name === first.name, 'closing a player returns to remaining active media');
            first.status = 'Stopped';
            first.update();
            await waitFor(() => !widget.actor.visible);
            assert(!widget.actor.visible, 'stopped media hides automatically');
            first.status = 'Playing';
            first.update();
            await waitFor(() => widget.actor.visible);
            assert(widget.actor.visible, 'new playback makes the media widget reappear');
        } finally {
            second?.close();
            first.close();
        }
        await waitFor(() => !widget.actor.visible);
        assert(!widget.actor.visible, 'closing the final player hides the media widget');
    },
};
