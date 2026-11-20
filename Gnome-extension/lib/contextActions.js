// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {desktopDirectory} from './files.js';

function contains(parent, actor) {
    return Boolean(parent && actor && (parent === actor || parent.contains(actor)));
}

// Only item-specific commands belong here; carousel controls stay beside panels.
export class ContextActions {
    constructor(host) {
        this._host = host;
        this._cancel = new Gio.Cancellable();
    }

    forActor(actor) {
        const host = this._host;
        const calculator = host.panel('calculator');
        if (contains(calculator.entry, actor))
            return null; // Let GNOME's entry Copy/Paste menu handle this click.
        if (contains(host.panel('notes')?.entry, actor))
            return null;
        const apps = host.panel('apps');
        if (contains(apps?._nameEntry, actor) || host._panels.some(panel => contains(panel.searchEntry, actor)))
            return null;
        let item;
        for (let current = actor; current; current = current.get_parent()) {
            item ??= current._grandCentralDesktopItem;
            const panel = current._grandCentralDesktopPanel;
            if (panel) {
                if (panel.id === 'notes')
                    return [{label: 'Copy Note', activate: () => panel.copyNote()},
                        {label: 'Load from File…', activate: () => panel.fileAction(false)},
                        {label: 'Export to File…', activate: () => panel.fileAction(true)}];
                if (item?.children)
                    return [{label: 'Open Folder', activate: () => panel._activate(item)},
                        {label: 'Rename Folder', activate: () => panel.renameFolder(item)}];
                if (item?.app)
                    return this._appActions(item);
                if (item?.uri)
                    return this._fileActions(item);
                if (panel.id === 'desktop') {
                    const uri = Gio.File.new_for_path(desktopDirectory(host._settings)).get_uri();
                    return [{label: 'Open Desktop Folder', activate: () => host._activate({uri})}, ...this._displayActions()];
                }
                if (panel.id === 'apps' && panel._folderId && !panel._isSearching())
                    return [{label: 'Rename Folder', activate: () => panel.renameFolder()}];
                return [];
            }
        }
        if (contains(host._weather?.actor, actor))
            return [{label: 'Open Weather', activate: () => host._weather.source.activate()}];
        if (contains(host._calendar?.actor, actor)) {
            const app = host._appSystem.lookup_app('org.gnome.Calendar.desktop');
            return app ? [{label: 'Open Calendar', activate: () => app.activate()}] : [];
        }
        if (contains(host._media?.actor, actor))
            return host._media.button.reactive
                ? [{label: host._media.button.accessible_name, activate: () => host._media.source.playPause()}] : [];
        return contains(host._root, actor) && !contains(host._carousel, actor) ? this._displayActions() : [];
    }

    _displayActions() {
        if (!Main.sessionMode.allowSettings)
            return [];
        const app = this._host._appSystem.lookup_app('gnome-display-panel.desktop');
        return app ? [{label: 'Display Settings', activate: () => {
            Main.overview.hide();
            Main.panel.closeQuickSettings();
            app.activate();
        }}] : [];
    }

    _appActions(item) {
        const app = item.app;
        const actions = [{label: 'Open', activate: () => this._host._activate(item)}];
        if (app.state === Shell.AppState.RUNNING && app.can_open_new_window()) {
            const declared = app.get_app_info()?.list_actions() ?? [];
            actions.push({label: 'New Window', activate: () => declared.includes('new-window')
                ? app.launch_action('new-window', global.get_current_time(), -1) : app.open_new_window(-1)});
        }
        if (this._host._appSystem.lookup_app('org.gnome.Software.desktop')) {
            actions.push({label: 'Show Details', activate: () => this._call('org.gnome.Software', '/org/gnome/Software',
                'org.gtk.Actions', 'Activate', new GLib.Variant('(sava{sv})',
                    ['details', [new GLib.Variant('(ss)', [app.get_id(), ''])], {}]))});
        }
        return actions;
    }

    _fileActions(item) {
        const actions = [{label: item.directory && !item.mountedDrive ? 'Open Folder' : 'Open',
            activate: () => this._host._activate(item)}];
        // Files provides these standard methods; don't offer dead commands without it.
        if (this._host._appSystem.lookup_app('org.gnome.Nautilus.desktop')) {
            if (!item.mountedDrive)
                actions.push({label: 'Show in Files', activate: () => this._fileManager('ShowItems', item.uri)});
            actions.push({label: 'Properties', activate: () => this._fileManager('ShowItemProperties', item.uri)});
        }
        return actions;
    }

    _fileManager(method, uri) {
        return this._call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1', method, new GLib.Variant('(ass)', [[uri], '']));
    }

    _call(name, path, iface, method, parameters) {
        Gio.DBus.session.call(name, path, iface, method, parameters, null, Gio.DBusCallFlags.NONE,
            5000, this._cancel, (connection, result) => {
                try { connection.call_finish(result); } catch (e) {
                    if (!this._cancel.is_cancelled())
                        Main.notify('Grand Central Desktop', e.message);
                }
            });
    }

    run(action) {
        try { action.activate(); } catch (e) { Main.notify('Grand Central Desktop', e.message); }
    }

    destroy() {
        this._cancel.cancel();
        this._host = null;
    }
}
