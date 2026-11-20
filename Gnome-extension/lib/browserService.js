// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const BROWSER_NAME = 'org.grandcentraldesktop.Browser';
export const BROWSER_PATH = '/org/grandcentraldesktop/Browser';

export class BrowserService {
    constructor(path) {
        this.path = path;
        this.clients = new Set();
        this._cancel = new Gio.Cancellable();
        this._windows = new Map();
        this._windowCreated = global.display.connect('window-created', (_display, window) => {
            if (!window.get_title()?.startsWith('Grand Central Desktop Browser')) return;
            const rescale = () => {
                const frame = window.get_frame_rect();
                if (!frame.width || !window.stage_to_protocol_rect) return;
                const scale = Math.round(window.stage_to_protocol_rect(frame).width / frame.width);
                for (const client of this.clients) {
                    if (client._viewTitle === window.get_title() && client._coordinateScale !== scale) client._sync();
                }
            };
            const size = window.connect('size-changed', rescale);
            const unmanaged = window.connect('unmanaged', () => {
                window.disconnect(size);
                window.disconnect(unmanaged);
                this._windows.delete(window);
            });
            this._windows.set(window, [size, unmanaged]);
            rescale();
        });
        this._watch = Gio.bus_watch_name(Gio.BusType.SESSION, BROWSER_NAME, Gio.BusNameWatcherFlags.NONE,
            () => {
                this._owned = true;
                if (this._process) for (const client of this.clients) this.attach(client);
            }, () => {
                this._owned = false;
                for (const client of this.clients) client._proxy = null;
                if (this._waiting) { this._waiting = false; this.start(); }
            });
    }

    start() {
        if (this._disposed || this._starting) return;
        if (this._process) {
            if (this._owned) for (const client of this.clients) this.attach(client);
            return;
        }
        if (![...this.clients].some(client => client._visible)) return;
        this._starting = true;
        Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'NameHasOwner',
            new GLib.Variant('(s)', [BROWSER_NAME]), null, Gio.DBusCallFlags.NONE, 2000, this._cancel, (connection, result) => {
                this._starting = false;
                try {
                    const [owned] = connection.call_finish(result).deep_unpack();
                    if (this._disposed) return;
                    if (owned) { this._waiting = true; return; }
                    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
                    launcher.setenv('GDK_BACKEND', 'x11', true);
                    for (const variable of global.create_app_launch_context(0, -1).get_environment()) {
                        if (variable.startsWith('DISPLAY=')) launcher.setenv('DISPLAY', variable.slice(8), true);
                    }
                    this._process = launcher.spawnv(['gjs', '-m', `${this.path}/browser.js`, this.path]);
                    this._process.wait_async(null, (process, res) => {
                        try { process.wait_finish(res); } catch (_error) { /* Shutdown may terminate it. */ }
                        if (this._process === process) {
                            this._process = null;
                            for (const client of this.clients) {
                                client._proxy = null;
                                client._attaching = false;
                                client.status('Browser unavailable.', true);
                            }
                        }
                    });
                } catch (error) {
                    if (!this._disposed) for (const client of this.clients) client.status(`Browser unavailable: ${error.message}`, true);
                }
            });
    }

    attach(client) {
        if (!client._alive || client._proxy || client._attaching || !client._visible) return;
        client._attaching = true;
        Gio.DBus.session.call(BROWSER_NAME, BROWSER_PATH, BROWSER_NAME, 'CreateView',
            new GLib.Variant('(sss)', [client._viewId, client._monitorKey, client._initialUri ?? '']),
            new GLib.VariantType('(o)'), Gio.DBusCallFlags.NONE, 5000, this._cancel, (connection, result) => {
                try {
                    const [path] = connection.call_finish(result).deep_unpack();
                    if (!client._alive) return;
                    Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION, Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                        null, BROWSER_NAME, path, BROWSER_NAME, this._cancel, (_object, res) => {
                            client._attaching = false;
                            try {
                                const proxy = Gio.DBusProxy.new_for_bus_finish(res);
                                if (!client._alive) return;
                                client._proxy = proxy;
                                client.status('');
                                proxy.connect('g-signal', (_proxy, _sender, signal, args) => {
                                    if (signal === 'LocationChanged') client._lastUri = args.deep_unpack()[0];
                                });
                                proxy.call('GetState', null, Gio.DBusCallFlags.NONE, 3000, this._cancel, (object, stateResult) => {
                                    try { client._lastUri = JSON.parse(object.call_finish(stateResult).deep_unpack()[0]).uri; }
                                    catch (_error) { /* A view may close during registration. */ }
                                });
                                client._initialUri = null;
                                client._sync();
                            } catch (error) { if (client._alive) client.status(error.message, true); }
                        });
                } catch (error) {
                    client._attaching = false;
                    if (client._alive) client.status(error.message, true);
                }
            });
    }

    retry() {
        for (const client of this.clients) {
            client._initialUri = client._lastUri ?? client._initialUri;
            client._attaching = false;
            client.status('Starting browser…');
        }
        this.start();
    }

    remove(client) {
        this.clients.delete(client);
        if (this._owned && this.clients.size) {
            Gio.DBus.session.call(BROWSER_NAME, BROWSER_PATH, BROWSER_NAME, 'DestroyView',
                new GLib.Variant('(s)', [client._viewId]), null, Gio.DBusCallFlags.NONE, 2000, null, null);
        }
        if (!this.clients.size) {
            this._disposed = true;
            this._cancel.cancel();
            Gio.bus_unwatch_name(this._watch);
            global.display.disconnect(this._windowCreated);
            for (const [window, signals] of this._windows) for (const id of signals) window.disconnect(id);
            this._windows.clear();
            this._process?.send_signal(15);
            this._process = null;
        }
    }

    suspend(client) {
        client._initialUri = client._lastUri;
        client._proxy = null;
        if (this._owned) Gio.DBus.session.call(BROWSER_NAME, BROWSER_PATH, BROWSER_NAME, 'DestroyView',
            new GLib.Variant('(s)', [client._viewId]), null, Gio.DBusCallFlags.NONE, 2000, null, null);
    }
}
