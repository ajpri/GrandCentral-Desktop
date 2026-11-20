// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';

export class Lifetime {
    constructor() {
        this._signals = [];
        this._sources = new Set();
    }

    idle(callback) {
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._sources.delete(id);
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this._sources.add(id);
    }

    connect(object, signal, callback) {
        const id = object.connect(signal, callback);
        this._signals.push([object, id]);
        return id;
    }

    destroy() {
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        for (const id of this._sources)
            GLib.Source.remove(id);
        this._sources.clear();
    }
}
