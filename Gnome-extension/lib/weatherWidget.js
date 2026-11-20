// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {WeatherSource, sharedWeatherClient} from './weatherSource.js';

export class WeatherWidget {
    constructor(layoutChanged, client = sharedWeatherClient()) {
        this.actor = new St.Button({name: 'grand-central-desktop-weather', style_class: 'dp-weather',
            can_focus: true, accessible_name: 'Open Weather', visible: false});
        const content = new St.BoxLayout({style_class: 'dp-weather-content', x_expand: true});
        this.icon = new St.Icon({icon_name: 'weather-overcast-large', icon_size: 48, style_class: 'dp-weather-icon',
            fallback_icon_name: 'weather-overcast-symbolic', y_align: Clutter.ActorAlign.CENTER});
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'dp-weather-text', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this.temperature = new St.Label({style_class: 'dp-weather-temperature', x_expand: true});
        this.location = new St.Label({style_class: 'dp-weather-location', x_expand: true});
        this.refreshed = new St.Label({style_class: 'dp-weather-refreshed', x_expand: true});
        for (const label of [this.temperature, this.location, this.refreshed]) {
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(label);
        }
        content.add_child(this.icon);
        content.add_child(text);
        this.actor.child = content;
        this.actor.connect('clicked', () => this.source.activate());
        this.source = new WeatherSource(state => {
            const wasVisible = this.actor.visible;
            this.temperature.text = state.temperature;
            this.location.text = state.location;
            this.refreshed.text = state.refreshed;
            this.refreshed.visible = Boolean(state.refreshed);
            this.icon.icon_name = state.icon;
            this.actor.accessible_name = [state.location, state.temperature, state.refreshed, 'Open Weather']
                .filter(Boolean).join(', ');
            this.actor.visible = state.visible;
            if (wasVisible !== state.visible)
                layoutChanged();
        }, client);
    }

    setGeometry(box) {
        this.actor.set_position(box.x, box.y);
        this.actor.set_size(box.width, box.height);
    }

    destroy() {
        this.source.destroy();
        this.actor.destroy();
    }
}
