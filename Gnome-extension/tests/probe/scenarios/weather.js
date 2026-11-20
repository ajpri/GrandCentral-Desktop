import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather?version=4.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, TestWeatherClient, screenshot} from '../helpers.js';

export const weatherScenarios = {
    async checkWeather(extension, assert) {
        const section = Main.panel.statusArea.dateMenu._weatherItem;
        const original = section._weatherClient;
        const originalSource = extension._weather.source;
        assert(originalSource._client === original, 'weather widget shares GNOME calendar’s Weather client');
        const client = new TestWeatherClient();
        const units = client.units.get_string('temperature-unit');
        const waitFor = async condition => {
            for (let i = 0; i < 60 && !condition(); i++)
                await pause(50);
        };
        try {
            client.units.set_string('temperature-unit', 'centigrade');
            section._weatherClient = client;
            extension.disable();
            assert(originalSource._timer === 0 && originalSource._life._signals.length === 0,
                'weather disable removes timers and signals without destroying GNOME’s client');
            extension.enable();
            const widget = extension._weather;
            await waitFor(() => widget.temperature.text === '22 °C');
            assert(widget.actor.visible && widget.location.text === 'Test City' &&
                widget.icon.icon_name === 'weather-clear-large', 'weather shows GNOME color icon, rounded temperature, and location');
            const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
            assert(widget.actor.x >= area.x && widget.actor.x < area.x + area.width / 2 &&
                widget.actor.y + widget.actor.height <= area.y + area.height, 'weather sits inside the bottom-left work area');
            assert(widget.actor.x + widget.actor.width < extension._media.actor.x &&
                widget.actor.y === extension._media.actor.y && widget.actor.width === extension._media.actor.width,
                'weather and media have equal widths and share the bottom row without overlap');
            await pause(100); // Wait for the newly enabled widget's first allocation.
            const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,
                widget.actor.x + widget.actor.width / 2, widget.actor.y + widget.actor.height / 2);
            assert(picked && (picked === widget.actor || widget.actor.contains(picked)), `weather button receives pointer input: picked ${picked}, parent ${picked?.get_parent()}, at ${widget.actor.x},${widget.actor.y} ${widget.actor.width}x${widget.actor.height}`);
            widget.actor.emit('clicked', 1);
            assert(client.activateCalls === 1, 'clicking weather activates GNOME Weather through the shared client');
            assert(!widget.refreshed.visible, 'weather hides refresh age for fresh data');
            const ageNetwork = widget.source._network;
            widget.source._network = {get_network_available: () => false};
            client._lastUpdate = GLib.DateTime.new_from_unix_utc(GLib.DateTime.new_now_utc().to_unix() - 1025);
            GLib.MainContext.default().find_source_by_id(widget.source._timer).set_ready_time(0);
            await waitFor(() => widget.refreshed.visible);
            assert(widget.refreshed.visible && widget.refreshed.text === 'Last refreshed: 17 minutes ago',
                'weather shows refresh age only when older than sixteen minutes');
            await screenshot('weather');
            widget.source._network = ageNetwork;
            client._lastUpdate = GLib.DateTime.new_now_utc();
            client.emit('changed');
            client.units.set_string('temperature-unit', 'fahrenheit');
            await waitFor(() => widget.temperature.text === '72 °F');
            assert(widget.temperature.text === '72 °F', 'weather follows GNOME’s temperature units live and rounds Fahrenheit');
            client.location = GWeather.Location.new_detached('New City', null, 45, -73);
            client.emit('changed');
            await waitFor(() => widget.location.text === 'New City');
            assert(widget.location.text === 'New City', 'GNOME location changes update weather live');
            client.valid = false;
            client.emit('changed');
            await waitFor(() => widget.temperature.text === 'Unavailable');
            assert(widget.temperature.text === 'Unavailable' && widget.location.text === 'New City', 'unavailable weather keeps the city with an unavailable status');
            client.hasLocation = false;
            client.emit('changed');
            await waitFor(() => widget.location.text === 'Choose a location');
            assert(widget.actor.visible && widget.location.text === 'Choose a location', 'unconfigured weather remains clickable to choose a location');
            client.available = false;
            client.emit('changed');
            await waitFor(() => !widget.actor.visible);
            assert(!widget.actor.visible, 'weather hides when the GNOME Weather app is unavailable');
            client.available = client.hasLocation = client.valid = true;
            client.emit('changed');
            await waitFor(() => widget.actor.visible);
            const network = widget.source._network;
            widget.source._network = {get_network_available: () => true};
            client._lastUpdate = GLib.DateTime.new_from_unix_utc(0);
            widget.source.refresh();
            widget.source.refresh();
            assert(client.updateCalls === 1, 'weather refreshes stale shared data without duplicate recent requests');
            widget.source._network = {get_network_available: () => false};
            widget.source.refresh(true);
            assert(client.updateCalls === 1, 'weather avoids refresh requests while offline');
            widget.source._network = network;
        } finally {
            section._weatherClient = original;
            client.units.set_string('temperature-unit', units);
            extension.disable();
            extension.enable();
        }
        await waitFor(() => extension._weather.source._client === original);
        assert(extension._weather.source._client === original, 'weather re-enabling restores the shared GNOME client');
    },
};
