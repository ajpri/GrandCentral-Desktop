// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {monitorRecords} from './monitorModel.js';

export const PANEL_PALETTE = [['GNOME dark', '#181818'], ['Black', '#000000'], ['Slate', '#202b3b'],
    ['Plum', '#34243d'], ['Light', '#f6f5f4']];

export function toggle(group, settings, key, title) {
    const row = new Adw.SwitchRow({title});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
}

export function spin(group, settings, key, title, min, max, step = 1) {
    const row = new Adw.SpinRow({title,
        adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: step, page_increment: step * 10})});
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
}

export function entry(group, settings, key, title, validate = () => true, message = 'Enter a valid value.') {
    const row = new Adw.EntryRow({title, show_apply_button: true});
    const error = new Gtk.Label({label: message, visible: false, wrap: true, xalign: 0,
        margin_start: 12, margin_end: 12, margin_top: 4, margin_bottom: 4, css_classes: ['error']});
    row._validationMessage = error;
    settings.bind(key, row, 'text', Gio.SettingsBindFlags.GET);
    row.connect('notify::text', () => {
        if (validate(row.text.trim())) { row.remove_css_class('error'); error.hide(); }
    });
    row.connect('apply', () => {
        const value = row.text.trim();
        if (!validate(value)) {
            row.add_css_class('error');
            error.show();
            return;
        }
        row.remove_css_class('error');
        error.hide();
        settings.set_string(key, value);
    });
    group.add(row);
    group.add(error);
    return row;
}

export function group(page, title = '') {
    const result = new Adw.PreferencesGroup({title});
    page.add(result);
    return result;
}

export function advanced(page) {
    const row = new Adw.ExpanderRow({title: 'Advanced'});
    // Keep add() uniform for preference groups and their collapsed rows.
    const container = group(page);
    container.add(row);
    return {row, group: container, add: child => row.add_row(child)};
}

export function subpage(title) {
    const page = new Adw.PreferencesPage();
    const toolbar = new Adw.ToolbarView({content: page});
    toolbar.add_top_bar(new Adw.HeaderBar());
    return {page, navigation: new Adw.NavigationPage({title, child: toolbar})};
}

export function link(group, title, activate, icon = null) {
    const row = new Adw.ActionRow({title, activatable: true});
    if (icon)
        row.add_prefix(new Gtk.Image({icon_name: icon}));
    row.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    row.connect('activated', activate);
    group.add(row);
    return row;
}

export function shortcuts(group, settings, window, watch) {
    for (const [key, title] of [['grand-central-desktop-show-desktop', 'Show / restore desktop'],
        ['grand-central-desktop-previous', 'Previous panels'], ['grand-central-desktop-next', 'Next panels']]) {
        const row = new Adw.ActionRow({title});
        const button = new Gtk.Button({valign: Gtk.Align.CENTER});
        const update = () => {
            const accel = settings.get_strv(key)[0];
            const [, keyval, mods] = Gtk.accelerator_parse(accel || '');
            button.label = accel ? Gtk.accelerator_get_label(keyval, mods) : 'Disabled';
        };
        update();
        watch(settings, `changed::${key}`, update);
        button.connect('clicked', () => {
            const dialog = new Adw.Window({application: window.application, transient_for: window, modal: true,
                title: 'Set shortcut', default_width: 380, default_height: 180});
            dialog.set_content(new Gtk.Label({label: 'Press a shortcut with Super, Ctrl, or Alt.\nEscape cancels. Backspace disables.',
                margin_start: 24, margin_end: 24, margin_top: 24, margin_bottom: 24}));
            const controller = new Gtk.EventControllerKey();
            controller.connect('key-pressed', (_controller, keyval, _keycode, state) => {
                if (keyval === Gdk.KEY_Escape) {
                    dialog.close();
                    return true;
                }
                if (keyval === Gdk.KEY_BackSpace) {
                    settings.set_strv(key, []);
                    dialog.close();
                    return true;
                }
                const mods = state & (Gdk.ModifierType.SHIFT_MASK | Gdk.ModifierType.CONTROL_MASK |
                    Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK);
                if (!(mods & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK)) ||
                    !Gtk.accelerator_valid(keyval, mods))
                    return false;
                settings.set_strv(key, [Gtk.accelerator_name(keyval, mods)]);
                dialog.close();
                return true;
            });
            dialog.add_controller(controller);
            dialog.present();
        });
        row.add_suffix(button);
        row.activatable_widget = button;
        group.add(row);
    }
}

export function monitorSelector(group, settings, watch, cleanup) {
    const row = new Adw.ComboRow({title: 'Monitor'});
    group.add(row);
    let names = [];
    let identities = [];
    let values = [];
    let syncing = false;
    const update = (rebuild = false) => {
        const saved = settings.get_int('monitor');
        const savedId = settings.get_string('monitor-id');
        const selected = saved >= 0 && savedId ? (identities.includes(savedId) ? identities.indexOf(savedId) : 'unavailable') : saved;
        syncing = true;
        if (rebuild || !values.includes(selected)) {
            values = [-1, -2, ...names.map((_name, i) => i)];
            const labels = ['Primary display', 'All monitors', ...names];
            if (!values.includes(selected)) {
                values.push(selected);
                labels.push(selected === 'unavailable' ? 'Selected display (unavailable)' : `Monitor ${saved + 1} (unavailable)`);
            }
            row.model = Gtk.StringList.new(labels);
        }
        row.selected = values.indexOf(selected);
        syncing = false;
    };
    watch(settings, 'changed::monitor', () => update());
    watch(settings, 'changed::monitor-id', () => update());
    row.connect('notify::selected', () => {
        const value = values[row.selected];
        if (!syncing && Number.isInteger(value) && (settings.get_int('monitor') !== value ||
            (value >= 0 && settings.get_string('monitor-id') !== identities[value]))) {
            settings.set_string('monitor-id', value >= 0 ? identities[value] ?? '' : '');
            settings.set_int('monitor', value);
        }
    });
    update();
    const cancel = new Gio.Cancellable();
    let request = 0;
    const refresh = () => {
        const current = ++request;
        Gio.DBus.session.call('org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig', 'GetCurrentState', null, null, Gio.DBusCallFlags.NONE, 3000, cancel,
            (connection, result) => {
                try {
                    const [, monitors, logical] = connection.call_finish(result).deep_unpack();
                    if (cancel.is_cancelled() || current !== request)
                        return;
                    // Mutter numbers logical monitors in this order, including mirrored displays.
                    const records = monitorRecords(monitors, logical);
                    identities = records.map(monitor => monitor.id);
                    names = records.map(monitor => monitor.name);
                    update(true);
                } catch (e) {
                    if (!cancel.is_cancelled())
                        console.warn(`Grand Central Desktop monitor names: ${e.message}`);
                }
            });
    };
    const subscription = Gio.DBus.session.signal_subscribe('org.gnome.Mutter.DisplayConfig',
        'org.gnome.Mutter.DisplayConfig', 'MonitorsChanged', '/org/gnome/Mutter/DisplayConfig', null,
        Gio.DBusSignalFlags.NONE, refresh);
    cleanup.push(() => { cancel.cancel(); Gio.DBus.session.signal_unsubscribe(subscription); });
    refresh();
}
