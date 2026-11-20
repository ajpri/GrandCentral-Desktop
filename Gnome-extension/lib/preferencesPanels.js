// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {panelColors, validHomeUrl} from './model.js';
import {PANEL_IDS, PANEL_NAMES, movePanel, insertPanel} from './panels.js';
import {toggle, spin, entry, group, advanced, subpage, PANEL_PALETTE as palette} from './preferencesControls.js';
import {browserMonitorPreferences} from './monitorPreferences.js';

export function buildPanelPage(id, settings, window, watch, perDisplay = false) {
    const panel = settings.get_child(id);
    const {page, navigation} = subpage(PANEL_NAMES[id]);
    const appearance = group(page, 'Appearance');
    const colorRow = new Adw.ActionRow({title: 'Color'});
    const colors = new Gtk.Box({spacing: 10, valign: Gtk.Align.CENTER});
    const buttons = palette.map(([label, hex], i) => {
        const button = new Gtk.Button({tooltip_text: label, css_classes: ['dp-color-swatch', `dp-swatch-${i}`],
            valign: Gtk.Align.CENTER});
        button.update_property([Gtk.AccessibleProperty.LABEL], [label]);
        button.connect('clicked', () => panel.set_string('background-color', hex));
        colors.append(button);
        return button;
    });
    const color = new Gtk.ColorDialogButton({dialog: new Gtk.ColorDialog({with_alpha: false}),
        tooltip_text: 'Custom color', valign: Gtk.Align.CENTER});
    let syncingColor = false;
    color.connect('notify::rgba', () => {
        if (syncingColor) return;
        const value = color.rgba;
        const hex = [value.red, value.green, value.blue].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
        if (panel.get_string('background-color').toLowerCase() !== `#${hex}`)
            panel.set_string('background-color', `#${hex}`);
    });
    colors.append(color);
    const syncColor = () => {
        syncingColor = true;
        const rgba = new Gdk.RGBA();
        const hex = panelColors(panel.get_string('background-color')).background;
        rgba.parse(hex);
        if (!rgba.equal(color.rgba))
            color.rgba = rgba;
        buttons.forEach((button, i) => {
            if (palette[i][1] === hex.toLowerCase()) button.add_css_class('selected');
            else button.remove_css_class('selected');
        });
        syncingColor = false;
    };
    watch(panel, 'changed::background-color', syncColor);
    syncColor();
    colorRow.add_suffix(colors);
    appearance.add(colorRow);
    if (!['calculator', 'browser', 'notes'].includes(id)) {
        spin(appearance, panel, 'icon-size', 'Icon size', 24, 96);
        toggle(appearance, panel, 'show-labels', 'Show labels');
    }
    if (id === 'notes') spin(appearance, panel, 'font-size', 'Font size', 8, 36);
    const extra = advanced(page);
    entry(extra, panel, 'title', 'Panel title');
    spin(extra, panel, 'corner-radius', 'Corner radius', 0, 80);
    if (!['calculator', 'browser', 'notes'].includes(id)) {
        spin(extra, panel, 'columns', 'Icon columns', 1, 8);
        spin(extra, panel, 'rows', 'Icon rows', 1, 8);
        if (id !== 'apps')
            spin(extra, panel, 'item-limit', 'Maximum items', 8, 500);
    }
    if (id === 'desktop') {
        const content = group(page, 'Content');
        toggle(content, panel, 'show-mounts', 'Show mounted drives');
        const sort = new Adw.ComboRow({title: 'Sort order', model: Gtk.StringList.new(['Name', 'Recently modified'])});
        sort.selected = settings.get_string('desktop-sort') === 'modified' ? 1 : 0;
        sort.connect('notify::selected', () => settings.set_string('desktop-sort', sort.selected === 1 ? 'modified' : 'name'));
        watch(settings, 'changed::desktop-sort', () => { sort.selected = settings.get_string('desktop-sort') === 'modified' ? 1 : 0; });
        content.add(sort);
        entry(extra, settings, 'desktop-directory', 'Folder path (blank uses Desktop)',
            path => !path || path.startsWith('/') || path === '~' || path.startsWith('~/'),
            'Use an absolute path or ~/folder. Leave blank to use Desktop.');
        toggle(extra, settings, 'show-hidden', 'Show hidden files');
    } else if (id === 'browser') {
        const content = group(page, 'Browser');
        entry(content, panel, 'home-url', 'Home URL', validHomeUrl, 'Use an http:// or https:// URL, or about:blank.');
        spin(content, panel, 'zoom-percent', 'Page zoom (%)', 25, 300, 5);
        toggle(content, panel, 'show-controls', 'Show browser controls');
        toggle(content, panel, 'show-color-picker', 'Show color picker');
        toggle(content, panel, 'auto-match-page-color', 'Automatically match page color');
        toggle(content, panel, 'request-mobile-site', 'Request mobile site');
        if (!perDisplay) browserMonitorPreferences(content, settings, window, watch, buildPanelPage);
    } else if (id === 'calculator') {
        toggle(appearance, panel, 'show-advanced', 'Show advanced calculator controls');
    } else if (id === 'programs') {
        const clear = new Adw.ActionRow({title: 'Clear program history'});
        const button = new Gtk.Button({label: 'Clear', valign: Gtk.Align.CENTER});
        button.connect('clicked', () => settings.set_strv('recent-programs', []));
        clear.add_suffix(button);
        extra.add(clear);
    }
    const reset = new Adw.ActionRow({title: 'Reset this panel'});
    const resetButton = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
    resetButton.connect('clicked', () => {
        for (const key of panel.settings_schema.list_keys())
            panel.reset(key);
        window.add_toast(new Adw.Toast({title: 'Panel reset'}));
    });
    reset.add_suffix(resetButton);
    extra.add(reset);
    // Advanced follows everyday controls, even when Content was added afterward.
    page.remove(extra.group);
    page.add(extra.group);

    return navigation;
}

export function buildPanelRow(id, settings, window, navigation) {
    const panel = settings.get_child(id);
    const row = new Adw.ActionRow({title: PANEL_NAMES[id]});
    const handle = new Gtk.Button({icon_name: 'list-drag-handle-symbolic', valign: Gtk.Align.CENTER,
        name: `reorder-${id}`, css_classes: ['flat'],
        tooltip_text: `Drag to reorder ${PANEL_NAMES[id]} · Alt+↑/↓ to move`});
    handle.update_property([Gtk.AccessibleProperty.LABEL], [`Reorder ${PANEL_NAMES[id]}`]);
    const keys = new Gtk.EventControllerKey({name: `move-${id}`});
    keys.connect('key-pressed', (_controller, keyval, _code, state) => {
        if (!(state & Gdk.ModifierType.ALT_MASK) || ![Gdk.KEY_Up, Gdk.KEY_Down].includes(keyval))
            return false;
        settings.set_strv('panel-order', movePanel(settings.get_strv('panel-order'), id, keyval === Gdk.KEY_Up ? -1 : 1));
        handle.grab_focus();
        return true;
    });
    handle.add_controller(keys);
    const drag = new Gtk.DragSource({actions: Gdk.DragAction.MOVE, name: `drag-${id}`});
    drag.connect('prepare', () => {
        const value = new GObject.Value();
        value.init(GObject.TYPE_STRING);
        value.set_string(`grand-central-desktop:${id}`);
        return Gdk.ContentProvider.new_for_value(value);
    });
    drag.connect('drag-begin', () => drag.set_icon(Gtk.WidgetPaintable.new(row), 0, 0));
    handle.add_controller(drag);
    row.add_prefix(handle);
    const enabled = new Gtk.Switch({valign: Gtk.Align.CENTER, tooltip_text: `Show ${PANEL_NAMES[id]}`});
    enabled.update_property([Gtk.AccessibleProperty.LABEL], [`Show ${PANEL_NAMES[id]}`]);
    panel.bind('enabled', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(enabled);
    const edit = new Gtk.Button({icon_name: 'go-next-symbolic', valign: Gtk.Align.CENTER,
        tooltip_text: `Customize ${PANEL_NAMES[id]}`, css_classes: ['flat']});
    edit.update_property([Gtk.AccessibleProperty.LABEL], [`Customize ${PANEL_NAMES[id]}`]);
    edit.connect('clicked', () => window.push_subpage(navigation));
    row.add_suffix(edit);
    row.activatable_widget = edit;
    const drop = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE);
    drop.name = `drop-${id}`;
    const clearDrop = () => { row.remove_css_class('dp-drop-before'); row.remove_css_class('dp-drop-after'); };
    drop.connect('motion', (_target, _x, y) => {
        clearDrop();
        row.add_css_class(y < row.get_height() / 2 ? 'dp-drop-before' : 'dp-drop-after');
        return Gdk.DragAction.MOVE;
    });
    drop.connect('leave', clearDrop);
    drop.connect('drop', (_target, value, _x, y) => {
        clearDrop();
        if (typeof value !== 'string' || !value.startsWith('grand-central-desktop:'))
            return false;
        const source = value.slice('grand-central-desktop:'.length);
        if (!PANEL_IDS.includes(source) || source === id)
            return false;
        settings.set_strv('panel-order', insertPanel(settings.get_strv('panel-order'), source, id, y >= row.get_height() / 2));
        return true;
    });
    row.add_controller(drop);
    return row;
}
