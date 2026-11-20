// SPDX-License-Identifier: GPL-3.0-or-later
// Used only by the GTK browser helper, never inside GNOME Shell.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import WebKit from 'gi://WebKit2?version=4.1';

function allCookies(manager) {
    return new Promise((resolve, reject) => manager.get_all_cookies(null, (source, result) => {
        try {
            resolve(source.get_all_cookies_finish(result));
        } catch (e) {
            reject(e);
        }
    }));
}

function identity(cookie) {
    return JSON.stringify([cookie.get_name(), cookie.get_domain(), cookie.get_path()]);
}

export class BrowserProfile {
    constructor() {
        this.dataDirectory = GLib.build_filenamev([GLib.get_user_data_dir(), 'grand-central-desktop', 'browser']);
        const cache = GLib.build_filenamev([GLib.get_user_cache_dir(), 'grand-central-desktop', 'browser']);
        for (const path of [this.dataDirectory, cache]) {
            if (GLib.mkdir_with_parents(path, 0o700) !== 0)
                throw new Error('Cannot create the browser profile directory');
        }
        this.dataManager = new WebKit.WebsiteDataManager({base_data_directory: this.dataDirectory,
            base_cache_directory: cache});
        this.context = WebKit.WebContext.new_with_website_data_manager(this.dataManager);
        this.context.set_cache_model(WebKit.CacheModel.WEB_BROWSER);
        this.cookies = this.context.get_cookie_manager();
        this.cookies.set_persistent_storage(`${this.dataDirectory}/cookies.sqlite`, WebKit.CookiePersistentStorage.SQLITE);
        this._sessionFile = Gio.File.new_for_path(`${this.dataDirectory}/session-cookies.json`);
        this.initialized = false;
        this._dirty = false;
        this.ready = this._restoreSessions().catch(e => {
            // Never log cookie names, values, or request headers.
            console.warn(`Browser session restore unavailable: ${e.message}`);
        }).then(() => {
            this.initialized = true;
            this.cookies.connect('changed', () => this.save().catch(e => {
                console.warn(`Browser session save unavailable: ${e.message}`);
            }));
        });
    }

    async _restoreSessions() {
        let bytes;
        try {
            bytes = await new Promise((resolve, reject) => this._sessionFile.load_contents_async(null, (file, result) => {
                try {
                    resolve(file.load_contents_finish(result)[1]);
                } catch (e) {
                    reject(e);
                }
            }));
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return;
            throw e;
        }
        const saved = JSON.parse(new TextDecoder().decode(bytes));
        if (saved.format !== 1 || !Array.isArray(saved.cookies))
            throw new Error('Invalid saved browser session');
        // Native persistent cookies take precedence over a session snapshot.
        const existing = new Set((await allCookies(this.cookies)).map(identity));
        for (const record of saved.cookies) {
            if (!['name', 'value', 'domain', 'path'].every(key => typeof record[key] === 'string') ||
                !record.domain || !record.path.startsWith('/'))
                continue;
            const cookie = Soup.Cookie.new(record.name, record.value, record.domain, record.path, -1);
            if (existing.has(identity(cookie)))
                continue;
            cookie.set_secure(Boolean(record.secure));
            cookie.set_http_only(Boolean(record.httpOnly));
            if ([0, 1, 2].includes(record.sameSite))
                cookie.set_same_site_policy(record.sameSite);
            await new Promise((resolve, reject) => this.cookies.add_cookie(cookie, null, (manager, result) => {
                try {
                    manager.add_cookie_finish(result);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            }));
        }
    }

    async save() {
        await this.ready;
        this._dirty = true;
        if (this._saving)
            return this._saving;
        this._saving = this._saveLoop();
        try {
            await this._saving;
        } finally {
            this._saving = null;
        }
    }

    async _saveLoop() {
        do {
            this._dirty = false;
            // WebKit's SQLite store saves non-session cookies. Keep session
            // cookies as private session-restoration data for helper restarts.
            // Do not extend an explicit expiry or resurrect deleted cookies.
            const cookies = (await allCookies(this.cookies)).filter(cookie => cookie.get_expires() === null)
                .map(cookie => ({name: cookie.get_name(), value: cookie.get_value(), domain: cookie.get_domain(),
                    path: cookie.get_path(), secure: cookie.get_secure(), httpOnly: cookie.get_http_only(),
                    sameSite: cookie.get_same_site_policy()}));
            const bytes = new TextEncoder().encode(JSON.stringify({format: 1, cookies}));
            await new Promise((resolve, reject) => this._sessionFile.replace_contents_async(bytes, null, false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null, (file, result) => {
                    try {
                        file.replace_contents_finish(result);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }));
        } while (this._dirty);
    }
}
