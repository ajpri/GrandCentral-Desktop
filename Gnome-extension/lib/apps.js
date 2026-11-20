// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Lifetime} from './lifetime.js';
import {appGridItems} from './appOrder.js';
import {AppFolders} from './appFolders.js';

export class AppSource {
    constructor(changed) {
        this._life = new Lifetime();
        this._folders = new Map();
        this.folders = new AppFolders();
        this._folderWatches = new Map();
        this._destroyedViews = new WeakSet();
        this._changed = changed;
        this._appSystem = Shell.AppSystem.get_default();
        const controls = Main.overview._overview.controls ?? Main.overview._overview._controls;
        this._view = controls.appDisplay ?? controls._appDisplay;
        this._life.connect(this._view, 'view-loaded', () => this._queue());
        this._life.connect(this._view, 'destroy', () => this.destroy());
        this._life.connect(this._appSystem, 'installed-changed', () => this._queue());
        for (const key of ['app-picker-layout', 'favorite-apps'])
            this._life.connect(global.settings, `changed::${key}`, () => this._queue());
        this._folderSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.app-folders'});
        this._life.connect(this._folderSettings, 'changed::folder-children', () => {
            // GNOME defers this work while its grid is hidden. Our desktop
            // panel still needs the new folder list immediately.
            this._life.idle(() => {
                if (!this._view.mapped)
                    this._redisplay();
                this._queue();
            });
        });
        this._life.idle(() => {
            // Populate the hidden view through its current implementation,
            // including the user's app-grid extensions, without opening it.
            if (!this._view.getAllItems().length)
                this._redisplay();
            this._queue();
        });
    }

    _queue() {
        if (this._destroyed || this._queued)
            return;
        this._queued = true;
        this._life.idle(() => {
            this._queued = false;
            this._watchFolders();
            this._changed();
        });
    }

    _redisplay() {
        // A folder can become empty in GNOME when its last unpinned app is
        // moved out. Remove that hidden icon from the grid before redisplay:
        // GNOME's _loadApps otherwise destroys it before a sorter tries to
        // remove it a second time. Our descriptor still represents pinned apps.
        const hidden = this._view.getAllItems().filter(item => item.view && !item.visible);
        for (const item of hidden) {
            this._view._removeItem(item);
            this._view._folderIcons = this._view._folderIcons.filter(icon => icon !== item);
            item.destroy();
        }
        this._view._redisplay();
    }

    _watchFolders() {
        const ids = new Set(this.folders.settings.get_strv('folder-children'));
        for (const [id, life] of this._folderWatches) {
            if (!ids.has(id)) {
                life.destroy();
                this._folderWatches.delete(id);
            }
        }
        for (const id of ids) {
            if (this._folderWatches.has(id))
                continue;
            const life = new Lifetime();
            life.connect(this.folders.folder(id), 'changed', () => {
                life.idle(() => {
                    if (!this._view.mapped)
                        this._redisplay();
                    this._queue();
                });
            });
            this._folderWatches.set(id, life);
        }
        const views = new Set(this._view.getAllItems().filter(item =>
            item.view && !this._destroyedViews.has(item.view)).map(item => item.view));
        for (const [view, life] of this._folders) {
            if (!views.has(view)) {
                life.destroy();
                this._folders.delete(view);
            }
        }
        for (const view of views) {
            if (this._folders.has(view))
                continue;
            const life = new Lifetime();
            life.connect(view, 'view-loaded', () => this._queue());
            if (view._folder)
                life.connect(view._folder, 'changed', () => this._queue());
            life.connect(view, 'destroy', () => {
                this._destroyedViews.add(view);
                life.destroy();
                this._folders.delete(view);
                this._queue();
            });
            this._folders.set(view, life);
        }
    }

    items() {
        const apps = this._appSystem.get_installed().filter(info => {
            try {
                return info.get_id() && info.should_show() &&
                    this._view._parentalControlsManager.shouldShowApp(info);
            } catch {
                return false;
            }
        }).map(info => this._appSystem.lookup_app(info.get_id())).filter(Boolean);
        const folders = this.folders.descriptors().map(folder => {
            const settings = this.folders.folder(folder.id);
            if (settings.get_boolean('translate'))
                folder.name = Shell.util_get_translated_folder_name(folder.name) ?? folder.name;
            return folder;
        });
        return appGridItems(this._view, apps, folders);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._life.destroy();
        for (const life of this._folders.values())
            life.destroy();
        this._folders.clear();
        for (const life of this._folderWatches.values())
            life.destroy();
        this._folderWatches.clear();
    }
}
