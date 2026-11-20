// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {ConfigurationControls} from './lib/configurationControls.js';
import {PANEL_IDS, panelOrder} from './lib/panels.js';
import {group, subpage, link, shortcuts, spin, toggle, advanced, monitorSelector,
    PANEL_PALETTE as palette} from './lib/preferencesControls.js';
import {buildPanelPage, buildPanelRow} from './lib/preferencesPanels.js';

function buildDesktopPage(settings, watch, cleanup) {
    const desktop = subpage('Desktop layout');
    const sizing = group(desktop.page);
    const size = new Adw.ComboRow({title: 'Panel size', model: Gtk.StringList.new(['Small', 'Medium', 'Large', 'Custom'])});
    sizing.add(size);
    monitorSelector(sizing, settings, watch, cleanup);
    const exact = advanced(desktop.page);
    spin(exact, settings, 'panel-width', 'Width (px)', 220, 900);
    spin(exact, settings, 'panel-height', 'Height (px)', 420, 1200);
    spin(exact, settings, 'panel-gap', 'Space between panels', 0, 100);
    spin(exact, settings, 'outer-margin', 'Outer margin', 0, 200);
    const presets = [[300, 520], [420, 660], [520, 820]];
    let syncingSize = false;
    const syncSize = () => {
        if (syncingSize) return;
        const index = presets.findIndex(([width, height]) => width === settings.get_int('panel-width') && height === settings.get_int('panel-height'));
        syncingSize = true;
        size.selected = index < 0 ? 3 : index;
        syncingSize = false;
    };
    syncSize();
    watch(settings, 'changed::panel-width', syncSize);
    watch(settings, 'changed::panel-height', syncSize);
    size.connect('notify::selected', () => {
        if (syncingSize) return;
        if (size.selected === 3) {
            exact.row.expanded = true;
            return;
        }
        const preset = presets[size.selected];
        if (!preset) return;
        syncingSize = true;
        settings.set_int('panel-width', preset[0]);
        settings.set_int('panel-height', preset[1]);
        syncingSize = false;
        syncSize();
    });

    return desktop;
}

export function buildPreferences(window, settings) {
    window.title = 'Grand Central Desktop Settings';
    window.set_default_size(680, 780);
    const cleanup = [];
    const watch = (object, signal, callback) => {
        const id = object.connect(signal, callback);
        cleanup.push(() => object.disconnect(id));
    };
    window.connect('close-request', () => {
        cleanup.splice(0).forEach(dispose => dispose());
        return false;
    });
    const css = new Gtk.CssProvider();
    css.load_from_string(`
        .dp-color-swatch { min-width: 24px; min-height: 24px; padding: 0; border-radius: 99px; border: 2px solid alpha(currentColor,0.25); }
        .dp-color-swatch.selected { outline: 2px solid @accent_color; outline-offset: 2px; }
        .dp-drop-before { border-top: 2px solid @accent_color; }
        .dp-drop-after { border-bottom: 2px solid @accent_color; }
        ${palette.map(([, hex], i) => `.dp-swatch-${i} { background: ${hex}; }`).join('\n')}
    `);
    const display = window.get_display();
    Gtk.StyleContext.add_provider_for_display(display, css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    cleanup.push(() => Gtk.StyleContext.remove_provider_for_display(display, css));

    const overview = new Adw.PreferencesPage({title: 'Overview', icon_name: 'view-grid-symbolic'});
    window.add(overview);
    const panels = group(overview, 'Panels');
    const orderRows = new Map();
    for (const id of PANEL_IDS) {
        const navigation = buildPanelPage(id, settings, window, watch);
        orderRows.set(id, buildPanelRow(id, settings, window, navigation));
    }
    const syncOrder = () => {
        for (const row of orderRows.values()) {
            if (row.get_parent()) panels.remove(row);
        }
        for (const id of panelOrder(settings.get_strv('panel-order')))
            panels.add(orderRows.get(id));
    };
    watch(settings, 'changed::panel-order', syncOrder);
    syncOrder();

    const desktop = buildDesktopPage(settings, watch, cleanup);
    const calendar = subpage('Calendar');
    const events = group(calendar.page);
    toggle(events, settings, 'show-calendar', 'Show calendar');
    const days = new Adw.SpinRow({title: 'Days ahead', subtitle: '0: today only',
        adjustment: new Gtk.Adjustment({lower: 0, upper: 365, step_increment: 1, page_increment: 7})});
    days.value = settings.get_int('calendar-days') - 1;
    days.connect('notify::value', () => settings.set_int('calendar-days', Math.round(days.value) + 1));
    watch(settings, 'changed::calendar-days', () => { days.value = settings.get_int('calendar-days') - 1; });
    events.add(days);
    spin(events, settings, 'calendar-max-events', 'Maximum events', 1, 3);

    const more = subpage('Advanced');
    shortcuts(group(more.page, 'Keyboard shortcuts'), settings, window, watch);
    window._configurationControls = new ConfigurationControls(window, settings, group(more.page, 'Configuration'));
    const desktopLinks = group(overview, 'Desktop');
    link(desktopLinks, 'Desktop layout', () => window.push_subpage(desktop.navigation), 'video-display-symbolic');
    link(desktopLinks, 'Calendar', () => window.push_subpage(calendar.navigation), 'x-office-calendar-symbolic');
    link(group(overview), 'Advanced', () => window.push_subpage(more.navigation));
}

export default class GrandCentralDesktopPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._grandCentralDesktopSettings = this.getSettings();
        buildPreferences(window, window._grandCentralDesktopSettings);
    }
}
