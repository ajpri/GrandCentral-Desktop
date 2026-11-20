// SPDX-License-Identifier: GPL-3.0-or-later
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {monitorIdentity} from './monitorModel.js';

export function connectedMonitors() {
    const manager = global.backend.get_monitor_manager();
    const physical = manager.get_monitors?.() ?? [];
    return Main.layoutManager.monitors.map((monitor, index) => {
        const displays = physical.filter(display => manager.get_monitor_for_connector(display.get_connector()) === index);
        const specs = displays.map(display => [display.get_connector(), display.get_vendor(), display.get_product(), display.get_serial()]);
        return {...monitor, index, id: specs.length ? monitorIdentity(specs) : `display-${index}`,
            primary: index === Main.layoutManager.primaryIndex,
            name: displays.map(display => `${display.get_display_name()} (${display.get_connector()})`).join(' + ') || `Display ${index + 1}`};
    });
}

export function selectedMonitors(settings, monitors) {
    if (settings.get_int('monitor') === -2) return monitors;
    if (settings.get_int('monitor') >= 0) {
        const id = settings.get_string('monitor-id');
        const selected = id ? monitors.find(monitor => monitor.id === id) : monitors[settings.get_int('monitor')];
        if (selected) return [selected];
    }
    return monitors.filter(monitor => monitor.primary).slice(0, 1);
}
