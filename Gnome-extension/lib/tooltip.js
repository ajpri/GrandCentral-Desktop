// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import St from 'gi://St';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Lifetime} from './lifetime.js';

export function clippedText(label) {
    const text = label?.clutter_text;
    return Boolean(label?.visible && text?.text && (text.get_layout().is_ellipsized() || text.get_layout().get_pixel_size()[1] > text.height + 1));
}

export class Tooltip {
    constructor(actor, text, suppressed = () => false) {
        this.actor = actor;
        actor._grandCentralDesktopTooltip = this;
        this._suppressed = suppressed;
        this._life = new Lifetime();
        this._timer = 0;
        this._destroyed = false;
        this.label = new St.Label({text, style_class: 'dash-label', reactive: false, visible: false});
        this.label.clutter_text.set_line_wrap(true);
        this.label.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        Main.uiGroup.add_child(this.label);
        this.label.connect('destroy', () => { this._cancelTimer(); this.label = null; });
        for (const signal of ['notify::hover', 'key-focus-in', 'notify::mapped', 'notify::reactive'])
            this._life.connect(actor, signal, () => this.sync());
        this._life.connect(actor, 'key-focus-out', () => {
            this.hide();
            if (actor.hover) this.sync();
        });
        this._life.connect(Main.overview, 'showing', () => this.hide());
        this._life.connect(global.display, 'notify::focus-window', () => this.hide());
        actor.connect('destroy', () => this.destroy());
    }

    set text(value) {
        if (this.label && this.label.text !== value) { this.hide(); this.label.text = value; this.sync(); }
    }

    _shouldShow() {
        return this.label && !Main.overview.visible && this.actor.is_mapped() && this.actor.reactive && !this._suppressed() &&
            (this.actor.hover || global.stage.get_key_focus() === this.actor);
    }

    sync() {
        if (!this._shouldShow()) { this.hide(); return; }
        if (this._timer || this.label.visible) return;
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._timer = 0;
            if (this._shouldShow()) {
                this._position();
                this.label.show();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _position() {
        const [x, y] = this.actor.get_transformed_position();
        const [actorWidth, actorHeight] = this.actor.get_transformed_size();
        const monitor = Main.layoutManager.monitors.find(item => x + actorWidth / 2 >= item.x &&
            x + actorWidth / 2 < item.x + item.width && y + actorHeight / 2 >= item.y &&
            y + actorHeight / 2 < item.y + item.height) ?? {x: 0, y: 0, width: global.stage.width, height: global.stage.height};
        const width = Math.min(this.label.get_preferred_width(-1)[1], 420 * St.ThemeContext.get_for_stage(global.stage).scale_factor, Math.max(1, monitor.width - 16));
        const height = Math.min(this.label.get_preferred_height(width)[1], Math.max(1, monitor.height - 16));
        this.label.set_size(width, height);
        const left = Math.max(monitor.x + 8, Math.min(x + (actorWidth - width) / 2, monitor.x + monitor.width - width - 8));
        const below = y + actorHeight + 8;
        const top = below + height <= monitor.y + monitor.height - 8 ? below : y - height - 8;
        this.label.set_position(Math.round(left), Math.round(Math.max(monitor.y + 8, top)));
    }

    _cancelTimer() {
        if (this._timer) GLib.Source.remove(this._timer);
        this._timer = 0;
    }

    hide() { this._cancelTimer(); this.label?.hide(); }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        if (this.actor._grandCentralDesktopTooltip === this) delete this.actor._grandCentralDesktopTooltip;
        this.hide();
        this._life.destroy();
        this.label?.destroy();
    }
}
