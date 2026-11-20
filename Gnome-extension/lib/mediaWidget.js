// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {MediaSource} from './mediaSource.js';
import {Tooltip, clippedText} from './tooltip.js';

export class MediaWidget {
    constructor(layoutChanged) {
        this.actor = new St.BoxLayout({name: 'grand-central-desktop-media', style_class: 'dp-media',
            reactive: true, visible: false});
        this.art = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: 48,
            fallback_icon_name: 'audio-x-generic-symbolic', style_class: 'dp-media-art',
            y_align: Clutter.ActorAlign.CENTER});
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, reactive: true, track_hover: true,
            x_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'dp-media-text'});
        this.title = new St.Label({style_class: 'dp-media-title', x_expand: true});
        this.artist = new St.Label({style_class: 'dp-media-artist', x_expand: true});
        for (const label of [this.title, this.artist]) {
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(label);
        }
        this._icon = new St.Icon({icon_name: 'media-playback-pause-symbolic', icon_size: 24});
        this.button = new St.Button({style_class: 'dp-media-button', can_focus: true,
            accessible_name: 'Pause', child: this._icon, y_align: Clutter.ActorAlign.CENTER});
        this.actor.add_child(this.art);
        this.actor.add_child(text);
        this.actor.add_child(this.button);
        this._buttonTooltip = new Tooltip(this.button, 'Pause');
        this._infoTooltip = new Tooltip(text, '', () => !clippedText(this.title) && !clippedText(this.artist));
        this.button.connect('clicked', () => this.source.playPause());
        this.source = new MediaSource(player => {
            const wasVisible = this.actor.visible;
            this.actor.visible = player !== null;
            if (player) {
                const state = player.state;
                this.title.text = state.title;
                this.artist.text = state.artist;
                this.artist.visible = Boolean(state.artist);
                this._icon.icon_name = state.status === 'Playing'
                    ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
                this.button.accessible_name = state.status === 'Playing' ? 'Pause' : 'Play';
                this._buttonTooltip.text = this.button.accessible_name;
                this._infoTooltip.text = [state.title, state.artist].filter(Boolean).join('\n');
                this.button.reactive = this.button.can_focus = state.canControl &&
                    (state.status === 'Playing' ? state.canPause : state.canPlay);
                this.button.opacity = this.button.reactive ? 255 : 80;
                if (this._artUrl !== state.art) {
                    this._artUrl = state.art;
                    this.art.gicon = state.art
                        ? new Gio.FileIcon({file: Gio.File.new_for_uri(state.art)})
                        : Gio.ThemedIcon.new('audio-x-generic-symbolic');
                }
            } else {
                this.title.text = this.artist.text = '';
                this._artUrl = '';
                this.art.gicon = Gio.ThemedIcon.new('audio-x-generic-symbolic');
            }
            if (wasVisible !== this.actor.visible)
                layoutChanged();
        });
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
