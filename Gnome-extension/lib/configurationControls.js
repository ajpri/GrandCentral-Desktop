// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {exportConfiguration, importConfiguration, readConfiguration, writeConfiguration} from './configuration.js';

export class ConfigurationControls {
    constructor(window, settings, group) {
        this._window = window;
        this._settings = settings;
        this._cancel = new Gio.Cancellable();
        window.connect('close-request', () => { this._cancel.cancel(); return false; });
        const row = (title, label, action) => {
            const widget = new Adw.ActionRow({title});
            const button = new Gtk.Button({label, valign: Gtk.Align.CENTER});
            button.connect('clicked', action);
            widget.add_suffix(button);
            widget.activatable_widget = button;
            group.add(widget);
        };
        row('Export Configuration', 'Export…', () => this._choose(true));
        row('Import Configuration', 'Import…', () => this._choose(false));
    }

    _choose(saving) {
        const filter = new Gtk.FileFilter({name: 'Configuration files (*.json)'});
        filter.add_pattern('*.json');
        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        filters.append(filter);
        const dialog = new Gtk.FileDialog({title: saving ? 'Export Configuration' : 'Import Configuration',
            filters, default_filter: filter, initial_name: saving ? 'grand-central-desktop-config.json' : null});
        const done = async (source, result) => {
            try {
                const file = saving ? source.save_finish(result) : source.open_finish(result);
                if (saving) await this.exportTo(file);
                else await this.importFrom(file);
            } catch (e) {
                if (e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED) || this._cancel.is_cancelled()) return;
                const alert = new Adw.AlertDialog({heading: saving ? 'Export failed' : 'Import failed', body: e.message});
                alert.add_response('close', 'Close');
                alert.present(this._window);
            }
        };
        if (saving) dialog.save(this._window, this._cancel, done);
        else dialog.open(this._window, this._cancel, done);
    }

    async exportTo(file) {
        await writeConfiguration(file, exportConfiguration(this._settings));
        this._window.add_toast(new Adw.Toast({title: 'Configuration exported'}));
    }

    async importFrom(file) {
        const text = await readConfiguration(file);
        const previous = exportConfiguration(this._settings);
        importConfiguration(this._settings, text);
        const toast = new Adw.Toast({title: 'Configuration imported', button_label: 'Undo'});
        toast.connect('button-clicked', () => importConfiguration(this._settings, previous));
        this._window.add_toast(toast);
        return toast;
    }
}
