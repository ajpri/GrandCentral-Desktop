// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather?version=4.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Lifetime} from './lifetime.js';
import {weatherState} from './weatherModel.js';

export function sharedWeatherClient() {
    return Main.panel.statusArea.dateMenu?._weatherItem?._weatherClient ?? null;
}

export class WeatherSource {
    constructor(changed, client = sharedWeatherClient()) {
        this._life = new Lifetime();
        this._client = client;
        this._changed = changed;
        if (client) {
            this._life.connect(client, 'changed', () => this._queue());
            this._units = new Gio.Settings({schema_id: 'org.gnome.GWeather4'});
            this._life.connect(this._units, 'changed::temperature-unit', () => this._queue());
            this._network = Gio.NetworkMonitor.get_default();
            this._life.connect(this._network, 'network-changed', (_monitor, online) => {
                if (online)
                    this.refresh(true);
            });
            this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
                this._queue();
                this.refresh();
                return GLib.SOURCE_CONTINUE;
            });
        }
        this._queue();
        this._life.idle(() => this.refresh());
    }

    _queue() {
        if (this._queued)
            return;
        this._queued = true;
        this._life.idle(() => {
            this._queued = false;
            this._changed(weatherState(this._client, GWeather.TemperatureUnit.DEFAULT));
        });
    }

    refresh(force = false) {
        if (this._destroyed || !this._client?.available || !this._client.hasLocation ||
            this._client.loading || !this._network.get_network_available())
            return;
        const last = this._client._lastUpdate?.to_unix() ?? 0;
        if (!force && GLib.DateTime.new_now_utc().to_unix() - last < 15 * 60)
            return;
        this._client.update();
    }

    activate() {
        this._client?.activateApp();
        Main.overview.hide();
    }

    destroy() {
        this._destroyed = true;
        this._life.destroy();
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        // GNOME owns the client and its requests; leave them running.
        this._client = null;
    }
}
