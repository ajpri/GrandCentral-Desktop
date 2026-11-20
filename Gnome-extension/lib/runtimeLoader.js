// SPDX-License-Identifier: GPL-3.0-or-later
// This small host stays loaded. Installed releases use separate module paths.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

const POINTER = 'active-release.json';
const STATUS = '.update-status.json';
const HASH = /^[a-f0-9]{64}$/;
const digest = bytes => GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, new GLib.Bytes(bytes));

function contents(file, cancellable) {
    return new Promise((resolve, reject) => file.load_contents_async(cancellable, (source, result) => {
        try {
            const [, bytes] = source.load_contents_finish(result);
            resolve(bytes);
        } catch (e) {
            reject(e);
        }
    }));
}

async function browserUri(runtime, cancellable) {
    const browser = runtime?._panels?.find(panel => panel.id === 'browser');
    if (!browser?._proxy)
        return null;
    try {
        const state = await new Promise((resolve, reject) => browser._proxy.call('GetState', null,
            Gio.DBusCallFlags.NONE, 2000, cancellable, (proxy, result) => {
                try {
                    resolve(JSON.parse(proxy.call_finish(result).deep_unpack()[0]));
                } catch (e) {
                    reject(e);
                }
            }));
        return state.uri;
    } catch (_e) {
        return null;
    }
}

export class RuntimeLoader {
    constructor(owner) {
        this.owner = owner;
        this.root = owner.dir;
        this.current = null;
        this.runtime = null;
        this._stopped = true;
        this._busy = false;
        this._timer = 0;
        this._attempted = null;
    }

    start() {
        if (!this._stopped)
            return;
        this._stopped = false;
        this._cancellable = new Gio.Cancellable();
        this._monitor = this.root.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitor.connect('changed', (_monitor, file, other) => {
            if (![file, other].some(f => f?.get_basename() === POINTER))
                return;
            if (this._timer)
                GLib.Source.remove(this._timer);
            this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
                this._timer = 0;
                this.check();
                return GLib.SOURCE_REMOVE;
            });
        });
        this.check();
    }

    async check() {
        this._dirty = true;
        if (this._busy || this._stopped)
            return;
        this._busy = true;
        try {
            do {
                this._dirty = false;
                try {
                    await this._applyLatest();
                } catch (e) {
                    if (!this._stopped) {
                        console.error(`Grand Central Desktop update rejected: ${e.message}`);
                        await this._restorePointer();
                        this._status('error', this.current?.id, e.message);
                        Main.notify('Grand Central Desktop update not applied', `${e.message}\nThe previous release has been kept.`);
                    }
                }
            } while (this._dirty && !this._stopped);
        } finally {
            this._busy = false;
        }
    }

    async _restorePointer() {
        if (!this.current?.id || !this._attempted)
            return;
        const file = this.root.get_child(POINTER);
        try {
            const {bytes, etag} = await new Promise((resolve, reject) => file.load_contents_async(null, (source, result) => {
                try {
                    const [, data, tag] = source.load_contents_finish(result);
                    resolve({bytes: data, etag: tag});
                } catch (e) {
                    reject(e);
                }
            }));
            if (JSON.parse(new TextDecoder().decode(bytes)).release !== this._attempted)
                return;
            const data = new TextEncoder().encode(JSON.stringify({format: 1, release: this.current.id}));
            await new Promise((resolve, reject) => file.replace_contents_async(data, etag, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null, (source, result) => {
                    try {
                        source.replace_contents_finish(result);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }));
        } catch (e) {
            // A newer installation wins over rollback. Its monitor event will
            // trigger another check; never overwrite it with the old pointer.
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.WRONG_ETAG))
                console.error(`Grand Central Desktop could not restore its release pointer: ${e.message}`);
        }
    }

    async _readRelease() {
        const raw = await contents(this.root.get_child(POINTER), this._cancellable);
        const pointer = JSON.parse(new TextDecoder().decode(raw));
        if (pointer.format !== 1 || !HASH.test(pointer.release ?? ''))
            throw new Error('Invalid installed release pointer');
        if (pointer.release === this.current?.id || pointer.release === this._attempted)
            return null;
        this._attempted = pointer.release;
        const directory = this.root.resolve_relative_path(`runtime-builds/${pointer.release}`);
        const indexBytes = await contents(directory.get_child('release.json'), this._cancellable);
        if (digest(indexBytes) !== pointer.release)
            throw new Error('Release index checksum mismatch');
        const index = JSON.parse(new TextDecoder().decode(indexBytes));
        if (index.format !== 1 || index.metadata?.uuid !== this.owner.uuid || !index.files?.['runtime.js'])
            throw new Error('Release metadata does not match Grand Central Desktop');
        if (!index.metadata['shell-version']?.includes(Config.PACKAGE_VERSION.split('.')[0]))
            throw new Error('Release does not support this GNOME Shell version');
        const files = Object.entries(index.files);
        if (files.length > 256)
            throw new Error('Too many files in the release');
        await Promise.all(files.map(async ([name, expected]) => {
            if (!/^[a-zA-Z0-9_./@-]+$/.test(name) || name.startsWith('/') || name.split('/').includes('..') || !HASH.test(expected))
                throw new Error('Invalid release file');
            if (digest(await contents(directory.resolve_relative_path(name), this._cancellable)) !== expected)
                throw new Error(`Release file checksum mismatch: ${name}`);
        }));
        return {id: pointer.release, directory, index};
    }

    async _applyLatest() {
        const release = await this._readRelease();
        if (!release || this._stopped)
            return;
        // All relative imports now resolve inside this immutable release.
        const module = await import(`${release.directory.get_uri()}/runtime.js`);
        if (this._stopped)
            return;
        const candidate = new module.default({...release.index.metadata,
            dir: release.directory, path: release.directory.get_path()});
        if (typeof candidate.enable !== 'function' || typeof candidate.disable !== 'function')
            throw new Error('Release does not implement the extension lifecycle');
        const previous = this.current;
        const uri = await browserUri(previous?.instance, this._cancellable);
        if (this._stopped)
            return;
        const retainBrowser = previous?.index?.browserFingerprint === release.index.browserFingerprint;
        const focus = global.stage.get_key_focus();
        if (focus && previous?.instance._root?.contains(focus))
            global.stage.set_key_focus(null);
        const state = previous ? previous.instance.captureReloadState(retainBrowser, uri) : {};
        candidate.adoptReloadState?.(state);
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        const css = release.directory.get_child('stylesheet.css');
        let stylesheetLoaded = false;
        let previousStopped = false;
        let candidateStarted = false;
        try {
            theme.load_stylesheet(css);
            stylesheetLoaded = true;
            if (previous) {
                previousStopped = true;
                previous.disable();
            }
            candidateStarted = true;
            candidate.enable();
        } catch (e) {
            // Return a retained browser to the previous runtime before cleanup.
            if (state.browser && candidate._panels?.includes(state.browser))
                candidate.captureReloadState?.(true, uri);
            if (candidateStarted) {
                try {
                    candidate.disable();
                } catch (cleanupError) {
                    console.error(`Grand Central Desktop failed update cleanup: ${cleanupError.message}`);
                }
            }
            if (stylesheetLoaded)
                theme.unload_stylesheet(css);
            if (previousStopped) {
                previous.instance.adoptReloadState?.(state);
                previous.enable();
            } else if (state.browser && previous?.instance._root) {
                previous.instance._root.add_child(state.browser.actor);
                previous.instance._reloadRetainedBrowser = null;
            }
            throw e;
        }
        if (previous?.css)
            theme.unload_stylesheet(previous.css);
        this.current = {...release, instance: candidate, css,
            enable: () => candidate.enable(), disable: () => candidate.disable()};
        this.runtime = candidate;
        const entry = Main.extensionManager.lookup(this.owner.uuid);
        if (entry?.stateObj === this.owner) {
            for (const key of ['name', 'description', 'version', 'version-name']) {
                if (release.index.metadata[key] !== undefined)
                    entry.metadata[key] = release.index.metadata[key];
            }
            Main.extensionManager.emit('extension-state-changed', entry);
        }
        this._status('active', release.id);
    }

    _status(state, release, error = null) {
        const data = JSON.stringify({state, release: release ?? null, attempted: this._attempted,
            error, version: this.current?.index?.metadata.version ?? null});
        this.root.get_child(STATUS).replace_contents_async(new TextEncoder().encode(data), null, false,
            Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null, (file, result) => {
                try {
                    file.replace_contents_finish(result);
                } catch (e) {
                    console.error(`Grand Central Desktop could not record update status: ${e.message}`);
                }
            });
    }

    stop() {
        this._stopped = true;
        this._cancellable?.cancel();
        this._monitor?.cancel();
        this._monitor = null;
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
        this.current?.disable();
        if (this.current?.css)
            St.ThemeContext.get_for_stage(global.stage).get_theme().unload_stylesheet(this.current.css);
        this.current = null;
        this.runtime = null;
        this._attempted = null;
        this._status('disabled', null);
    }
}
