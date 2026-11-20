// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import {Lifetime} from './lifetime.js';

export function mountedItems(mounts) {
    const items = new Map();
    for (const mount of mounts) {
        try {
            if (mount.is_shadowed())
                continue;
            const uri = mount.get_root().get_uri();
            if (!items.has(uri)) {
                items.set(uri, {id: uri, uri, label: mount.get_name(), mountedDrive: true, directory: true,
                    gicon: mount.get_icon() ?? Gio.ThemedIcon.new('drive-harddisk')});
            }
        } catch {
            // A disappearing mount must not hide the remaining drives.
        }
    }
    return [...items.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function desktopItems(files, mounts, limit) {
    const seen = new Set();
    return [...mounts, ...files].filter(item => {
        if (seen.has(item.uri))
            return false;
        seen.add(item.uri);
        return true;
    }).slice(0, limit);
}

export class MountSource {
    constructor(changed, monitor = Gio.VolumeMonitor.get()) {
        this._life = new Lifetime();
        this._monitor = monitor;
        for (const signal of ['mount-added', 'mount-removed', 'mount-changed']) {
            this._life.connect(monitor, signal, () => {
                if (this._queued)
                    return;
                this._queued = true;
                this._life.idle(() => {
                    this._queued = false;
                    changed();
                });
            });
        }
    }

    items() {
        return mountedItems(this._monitor.get_mounts());
    }

    destroy() {
        this._life.destroy();
    }
}
