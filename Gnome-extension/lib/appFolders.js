// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function folderContains(folder, app) {
    const id = app.get_id();
    if (folder.excluded.includes(id))
        return false;
    const categories = (app.get_app_info?.()?.get_categories() ?? '').split(';');
    return folder.apps.includes(id) || folder.categories.some(category => categories.includes(category));
}

// These are GNOME's folders, not extension-specific copies.
export class AppFolders {
    constructor() {
        this.settings = new Gio.Settings({schema_id: 'org.gnome.desktop.app-folders'});
    }

    folder(id) {
        if (!/^[A-Za-z0-9_.-]+$/.test(id))
            throw new Error('Invalid application folder.');
        return new Gio.Settings({schema_id: 'org.gnome.desktop.app-folders.folder',
            path: `${this.settings.path}folders/${id}/`});
    }

    descriptors() {
        return this.settings.get_strv('folder-children').map(id => {
            const settings = this.folder(id);
            return {id, name: settings.get_string('name'), apps: settings.get_strv('apps'),
                categories: settings.get_strv('categories'), excluded: settings.get_strv('excluded-apps')};
        });
    }

    _commit(changes) {
        const staged = changes.map(([settings, key, value]) => {
            if (!settings.is_writable(key))
                throw new Error('Application folders are locked by your system settings.');
            const before = settings.get_value(key);
            return {settings, key, before, after: new GLib.Variant(before.get_type_string(), value)};
        });
        try {
            for (const {settings, key, after} of staged) {
                if (!settings.set_value(key, after))
                    throw new Error('Unable to update application folders.');
            }
        } catch (error) {
            for (const {settings, key, before} of staged)
                settings.set_value(key, before);
            throw error;
        }
    }

    _remove(apps, except = null) {
        const changes = [];
        const empty = new Set();
        for (const folder of this.descriptors()) {
            if (folder.id === except)
                continue;
            const removed = apps.filter(app => folderContains(folder, app)).map(app => app.get_id());
            if (!removed.length)
                continue;
            const settings = this.folder(folder.id);
            changes.push([settings, 'apps', folder.apps.filter(id => !removed.includes(id))]);
            // Category folders would otherwise immediately add the moved app back.
            if (folder.categories.length)
                changes.push([settings, 'excluded-apps', [...new Set([...folder.excluded, ...removed])]]);
            else if (folder.apps.every(id => removed.includes(id)))
                empty.add(folder.id);
        }
        if (empty.size)
            changes.push([this.settings, 'folder-children', this.settings.get_strv('folder-children').filter(id => !empty.has(id))]);
        return changes;
    }

    create(first, second) {
        if (!first || !second || first.get_id() === second.get_id())
            return false;
        const id = GLib.uuid_string_random();
        const folder = this.folder(id);
        const changes = this._remove([first, second]);
        const children = changes.find(([settings, key]) => settings === this.settings && key === 'folder-children')?.[2]
            ?? this.settings.get_strv('folder-children');
        this._commit([...changes.filter(([settings]) => settings !== this.settings),
            [folder, 'name', 'Unnamed Folder'], [folder, 'translate', false],
            [folder, 'apps', [first.get_id(), second.get_id()]],
            [this.settings, 'folder-children', [...children, id]]]);
        return id;
    }

    add(id, app) {
        if (!app || !this.settings.get_strv('folder-children').includes(id))
            return false;
        const folder = this.folder(id);
        const apps = [...new Set([...folder.get_strv('apps'), app.get_id()])];
        this._commit([...this._remove([app], id), [folder, 'apps', apps],
            [folder, 'excluded-apps', folder.get_strv('excluded-apps').filter(value => value !== app.get_id())]]);
        return true;
    }

    remove(app) {
        if (!app)
            return false;
        this._commit(this._remove([app]));
        return true;
    }

    rename(id, name) {
        name = name.trim();
        if (!name || !this.settings.get_strv('folder-children').includes(id))
            return false;
        const folder = this.folder(id);
        this._commit([[folder, 'name', name], [folder, 'translate', false]]);
        return true;
    }
}
