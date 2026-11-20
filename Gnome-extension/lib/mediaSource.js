// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Lifetime} from './lifetime.js';
import {mediaState, selectMedia} from './mediaModel.js';

const PREFIX = 'org.mpris.MediaPlayer2.';
const PATH = '/org/mpris/MediaPlayer2';
const PLAYER = 'org.mpris.MediaPlayer2.Player';

// The same session-bus media interface GNOME uses, without changing or
// depending on its calendar widgets. All discovery and control is async.
export class MediaSource {
    constructor(changed) {
        this._changed = changed;
        this._connection = Gio.DBus.session;
        this._cancellable = new Gio.Cancellable();
        this._entries = new Map();
        this._clock = 0;
        this.selected = null;
        this._watch = this._connection.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus',
            'NameOwnerChanged', '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_bus, _sender, _path, _interface, _signal, parameters) => {
                const [name, oldOwner, newOwner] = parameters.deep_unpack();
                if (!name.startsWith(PREFIX))
                    return;
                if (oldOwner)
                    this._remove(name);
                if (newOwner)
                    this._add(name);
            });
        // Subscribe before listing names to avoid missing players that start
        // while the initial snapshot is in flight.
        this._connection.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'ListNames', null, new GLib.VariantType('(as)'), Gio.DBusCallFlags.NONE, 3000,
            this._cancellable, (bus, result) => {
                try {
                    const [names] = bus.call_finish(result).deep_unpack();
                    if (!this._destroyed)
                        names.filter(name => name.startsWith(PREFIX)).forEach(name => this._add(name));
                } catch (e) {
                    if (!this._destroyed)
                        console.warn(`Grand Central Desktop media discovery: ${e.message}`);
                }
            });
    }

    _add(name) {
        if (this._destroyed || this._entries.has(name))
            return;
        const entry = {name, life: new Lifetime(), state: {}, started: 0};
        this._entries.set(name, entry);
        Gio.DBusProxy.new(this._connection,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START | Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES,
            null, name, PATH, PLAYER, this._cancellable, (_object, result) => {
                try {
                    const proxy = Gio.DBusProxy.new_finish(result);
                    if (this._destroyed || this._entries.get(name) !== entry)
                        return;
                    if (!proxy.get_name_owner()) {
                        this._remove(name);
                        return;
                    }
                    entry.proxy = proxy;
                    entry.life.connect(proxy, 'g-properties-changed', () => this._update(entry));
                    entry.life.connect(proxy, 'notify::g-name-owner', () => {
                        if (!proxy.get_name_owner() && this._entries.get(name) === entry)
                            this._remove(name);
                    });
                    this._update(entry);
                } catch (e) {
                    if (!this._destroyed && this._entries.get(name) === entry)
                        this._remove(name);
                }
            });
    }

    _update(entry) {
        const state = mediaState(key => entry.proxy.get_cached_property(key));
        if (state.status === 'Playing' && entry.state.status !== 'Playing')
            entry.started = ++this._clock;
        entry.state = state;
        this._select();
    }

    _select() {
        this.selected = selectMedia([...this._entries.values()], this.selected);
        this._changed(this.selected);
    }

    _remove(name) {
        const entry = this._entries.get(name);
        if (!entry)
            return;
        entry.life.destroy();
        this._entries.delete(name);
        this._select();
    }

    playPause() {
        const entry = this.selected;
        if (!entry?.proxy || !entry.state.canControl ||
            !(entry.state.status === 'Playing' ? entry.state.canPause : entry.state.canPlay))
            return;
        entry.proxy.call('PlayPause', null, Gio.DBusCallFlags.NONE, 3000, this._cancellable, (proxy, result) => {
            try {
                proxy.call_finish(result);
            } catch (e) {
                if (!this._destroyed && proxy.get_name_owner())
                    console.warn(`Grand Central Desktop media control: ${e.message}`);
            }
        });
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        this._connection.signal_unsubscribe(this._watch);
        for (const entry of this._entries.values())
            entry.life.destroy();
        this._entries.clear();
        this.selected = null;
    }
}
