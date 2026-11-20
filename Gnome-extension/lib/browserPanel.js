// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {panelColors} from './model.js';
import {BrowserService} from './browserService.js';

// WebKit runs outside Shell. GTK's X11 desktop window hint lets Mutter keep
// the real interactive web view below normal windows and out of Alt+Tab.
export class BrowserPanel {
    constructor(extension, settings, initialUri = null) {
        this.id = 'browser';
        this.settings = settings;
        this._extensionPath = extension.path;
        this._initialUri = initialUri;
        this._alive = true;
        this._service = extension._browserService ??= new BrowserService(extension.path);
        this._monitorKey = extension._monitorKey ?? 'default';
        this._viewId = extension._secondaryHost
            ? GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, this._monitorKey, -1).slice(0, 32) : 'default';
        this._viewTitle = this._viewId === 'default' ? 'Grand Central Desktop Browser' : `Grand Central Desktop Browser · ${this._viewId.slice(0, 8)}`;
        this._service.clients.add(this);
        this._visible = false;
        this.actor = new St.BoxLayout({name: 'desk-panel-browser', style_class: 'dp-panel',
            orientation: Clutter.Orientation.VERTICAL, reactive: true});
        this._title = new St.Label({style_class: 'dp-title'});
        this._message = new St.Label({text: 'Starting browser…', style_class: 'dp-empty',
            x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        this._message.clutter_text.line_wrap = true;
        this.actor.add_child(this._title);
        this.actor.add_child(this._message);
        this._retry = new St.Button({label: 'Retry', style_class: 'dp-small-button', can_focus: true,
            x_align: Clutter.ActorAlign.CENTER, visible: false, accessible_name: 'Retry browser'});
        this.actor.add_child(this._retry);
        this._retry.connect('clicked', () => this._service.retry());
    }

    get _process() { return this._service._process; }

    status(message, failed = false) {
        this._message.text = message;
        this._retry.visible = failed;
    }

    _call(method, signature, args) {
        if (!this._proxy?.get_name_owner())
            return;
        this._proxy.call(method, new GLib.Variant(signature, args), Gio.DBusCallFlags.NONE,
            2000, null, (proxy, result) => {
                try {
                    proxy.call_finish(result);
                } catch (e) {
                    if (this._alive && this._visible)
                        this._message.text = `Browser unavailable: ${e.message}`;
                }
            });
    }

    _start() { if (this._alive) this._service.start(); }

    _sync() {
        const native = global.get_window_actors().map(actor => actor.meta_window).find(window => window.get_title() === this._viewTitle);
        let scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        if (native?.stage_to_protocol_rect) {
            const frame = native.get_frame_rect();
            if (frame.width > 0) scale = Math.round(native.stage_to_protocol_rect(frame).width / frame.width);
        }
        this._coordinateScale = Math.max(1, Math.min(4, scale));
        this._call('SetCoordinateScale', '(i)', [this._coordinateScale]);
        if (this._geometry)
            this._call('SetGeometry', '(iiii)', [this._geometry.x, this._geometry.y,
                this._geometry.width, this._geometry.height]);
        this._call('SetVisible', '(b)', [this._visible]);
    }

    updateStyle() {
        const colors = panelColors(this.settings.get_string('background-color'));
        this._title.text = this.settings.get_string('title');
        this.actor.set_style(`background-color: ${colors.background}; color: ${colors.foreground};
            border-color: ${colors.border}; border-radius: ${this.settings.get_int('corner-radius')}px;`);
    }

    setGeometry(box) {
        this._geometry = box;
        this.actor.set_position(box.x, box.y);
        this.actor.set_size(box.width, box.height);
        this._sync();
    }

    setVisible(visible) {
        const changed = this._visible !== visible;
        this._visible = visible;
        if (visible) this._start();
        if (changed) this._sync();
    }

    destroy() {
        this._alive = false;
        this._service.remove(this);
        this.settings.destroy?.();
        this._proxy = null;
        // The extension destroys the containing root actor.
    }
}
