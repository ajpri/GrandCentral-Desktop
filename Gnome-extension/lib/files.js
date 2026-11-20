// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function desktopDirectory(settings) {
    const custom = settings.get_string('desktop-directory').trim();
    if (custom)
        return custom === '~' ? GLib.get_home_dir() : custom.replace(/^~\//, `${GLib.get_home_dir()}/`);
    const desktop = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
    // A disabled XDG Desktop may resolve to HOME. Do not display all of HOME.
    return desktop && desktop !== GLib.get_home_dir()
        ? desktop : GLib.build_filenamev([GLib.get_home_dir(), 'Desktop']);
}

function isCancelled(error) {
    return error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

function loadContents(file, cancellable) {
    return new Promise((resolve, reject) => {
        file.load_contents_async(cancellable, (source, result) => {
            try {
                const [, bytes] = source.load_contents_finish(result);
                resolve(bytes);
            } catch (e) {
                reject(e);
            }
        });
    });
}

function enumerate(file, cancellable) {
    return new Promise((resolve, reject) => {
        file.enumerate_children_async('standard::name,standard::display-name,standard::icon,standard::is-hidden,standard::type,standard::size,time::modified,access::can-execute,metadata::trusted',
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
                try {
                    resolve(source.enumerate_children_finish(result));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

function nextFiles(enumerator, cancellable) {
    return new Promise((resolve, reject) => {
        enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
            try {
                resolve(source.next_files_finish(result));
            } catch (e) {
                reject(e);
            }
        });
    });
}

// Monitor the parent as well, so creation/replacement of a missing folder or
// atomic replacement of recently-used.xbel is observed without polling.
export class FileSource {
    constructor(onChange) {
        this._onChange = onChange;
        this._monitors = [];
        this._serial = 0;
        this._pending = 0;
        this._destroyed = false;
    }

    watch(file, directory = false) {
        for (const monitor of this._monitors)
            monitor.cancel();
        this._monitors = [];
        for (const target of [file.get_parent(), ...(directory ? [file] : [])]) {
            if (!target)
                continue;
            try {
                const monitor = target.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
                monitor.connect('changed', (_monitor, changed, other) => {
                    if (!target.equal(file) && !changed.equal(file) && !other?.equal(file))
                        return;
                    if (this._pending)
                        GLib.Source.remove(this._pending);
                    this._pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                        this._pending = 0;
                        if (!this._destroyed)
                            this._onChange();
                        return GLib.SOURCE_REMOVE;
                    });
                });
                this._monitors.push(monitor);
            } catch (_e) {
                // Missing directories have a useful empty state; parent watches
                // will catch their creation where the parent exists.
            }
        }
    }

    async refresh(loader) {
        this._cancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        const serial = ++this._serial;
        try {
            const result = await loader(cancellable);
            return !this._destroyed && serial === this._serial ? result : null;
        } catch (e) {
            if (this._destroyed || serial !== this._serial || isCancelled(e))
                return null;
            return {items: [], message: e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)
                ? 'Nothing here yet.' : `Unable to read this source: ${e.message}`};
        }
    }

    destroy() {
        this._destroyed = true;
        this._serial++;
        this._cancellable?.cancel();
        for (const monitor of this._monitors)
            monitor.cancel();
        this._monitors = [];
        if (this._pending)
            GLib.Source.remove(this._pending);
        this._pending = 0;
    }
}

export async function readDesktop(path, showHidden, sort, limit, cancellable) {
    const directory = Gio.File.new_for_path(path);
    const enumerator = await enumerate(directory, cancellable);
    const items = [];
    try {
        let batch;
        while ((batch = await nextFiles(enumerator, cancellable)).length) {
            for (const info of batch) {
                if (!showHidden && info.get_is_hidden())
                    continue;
                const file = directory.get_child(info.get_name());
                const item = {id: file.get_uri(), uri: file.get_uri(),
                    label: info.get_display_name(), gicon: info.get_icon(),
                    directory: info.get_file_type() === Gio.FileType.DIRECTORY,
                    modified: Number(info.get_attribute_uint64('time::modified')),
                    desktopFile: info.get_name().endsWith('.desktop') && info.get_file_type() === Gio.FileType.REGULAR,
                    trusted: info.get_attribute_string('metadata::trusted') === 'true' ||
                        info.get_attribute_boolean('access::can-execute')};
                if (item.desktopFile && info.get_size() <= 524288) {
                    try {
                        const contents = await loadContents(file, cancellable);
                        const entry = new GLib.KeyFile();
                        entry.load_from_data(new TextDecoder().decode(contents), contents.length, GLib.KeyFileFlags.NONE);
                        item.label = entry.get_locale_string('Desktop Entry', 'Name', null) || item.label;
                        const icon = entry.get_string('Desktop Entry', 'Icon');
                        if (icon)
                            item.gicon = Gio.icon_new_for_string(icon);
                    } catch (e) {
                        if (isCancelled(e))
                            throw e;
                        // Invalid shortcuts remain visible with their file icon.
                    }
                }
                items.push(item);
            }
        }
    } finally {
        // Always close, including after cancellation.
        await new Promise(resolve => enumerator.close_async(GLib.PRIORITY_DEFAULT, null, (source, result) => {
            try {
                source.close_finish(result);
            } catch (_e) { /* The original read error is more useful. */ }
            resolve();
        }));
    }
    items.sort((a, b) => (sort === 'modified' ? b.modified - a.modified : 0) || a.label.localeCompare(b.label));
    return {items: items.slice(0, limit), message: 'Your Desktop folder is empty.\nAdd files or application shortcuts to get started.'};
}

export async function readDocuments(file, limit, maxAge, cancellable) {
    const bytes = await loadContents(file, cancellable);
    const bookmarks = new GLib.BookmarkFile();
    bookmarks.load_from_data(new TextDecoder().decode(bytes));
    const cutoff = maxAge > 0 ? GLib.DateTime.new_now_utc().to_unix() - maxAge * 86400 : 0;
    const items = [];
    for (const uri of bookmarks.get_uris()) {
        try {
            if (bookmarks.get_is_private(uri))
                continue;
            // Do not probe network resources from the compositor.
            if (!uri.startsWith('file://'))
                continue;
            const modified = bookmarks.get_modified_date_time(uri)?.to_unix() ?? 0;
            const visited = bookmarks.get_visited_date_time(uri)?.to_unix() ?? 0;
            const timestamp = Math.max(modified, visited);
            if (timestamp < cutoff)
                continue;
            const target = Gio.File.new_for_uri(uri);
            const mime = bookmarks.get_mime_type(uri) || 'application/octet-stream';
            items.push({id: uri, uri, label: bookmarks.get_title(uri) || target.get_basename(), filename: target.get_basename(),
                directory: mime === 'inode/directory',
                gicon: Gio.content_type_get_icon(mime), timestamp});
        } catch (_e) {
            // A broken bookmark must not hide every other document.
        }
    }
    items.sort((a, b) => b.timestamp - a.timestamp || a.label.localeCompare(b.label));
    return {items: items.slice(0, limit), message: 'No recent documents.\nFiles opened in supported apps will appear here.'};
}
