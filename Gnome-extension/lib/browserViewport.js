// SPDX-License-Identifier: GPL-3.0-or-later
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=3.0';
import {insetCornerRadius} from './model.js';

// Clip the child during GTK's draw traversal. A CSS border radius alone only
// rounds the container's background, leaving the web page rectangular.
export const BrowserViewport = GObject.registerClass(
class BrowserViewport extends Gtk.Bin {
    _init() {
        super._init({hexpand: true, vexpand: true});
        this._outerRadius = 0;
    }

    setRadius(radius) {
        this._outerRadius = radius;
        this.queue_draw();
    }

    get radius() {
        // Match the frame's inner curve: 12px padding plus its 1px border.
        return insetCornerRadius(this._outerRadius, 13,
            this.get_allocated_width(), this.get_allocated_height());
    }

    vfunc_draw(cr) {
        const width = this.get_allocated_width();
        const height = this.get_allocated_height();
        const radius = this.radius;
        cr.save();
        if (radius > 0) {
            cr.newSubPath();
            cr.arc(width - radius, radius, radius, -Math.PI / 2, 0);
            cr.arc(width - radius, height - radius, radius, 0, Math.PI / 2);
            cr.arc(radius, height - radius, radius, Math.PI / 2, Math.PI);
            cr.arc(radius, radius, radius, Math.PI, Math.PI * 1.5);
            cr.closePath();
        } else {
            cr.rectangle(0, 0, width, height);
        }
        cr.clip();
        const result = super.vfunc_draw(cr);
        cr.restore();
        return result;
    }
});
