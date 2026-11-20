// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {layoutPanels, panelColors} from './model.js';
import {cornerGeometry} from './weatherModel.js';
import {calendarGeometry} from './calendarModel.js';
import {Tooltip} from './tooltip.js';

export function attachDesktopLayer(root, lifetime) {
    const backgrounds = Main.layoutManager._backgroundGroup;
    if (root.get_parent() !== backgrounds) {
        root.get_parent()?.remove_child(root);
        backgrounds.add_child(root);
    }
    root.reactive = true;
    if (root._grandCentralDesktopLayerAttached)
        return;
    root._grandCentralDesktopLayerAttached = true;
    // Mutter restacks window_group's children. A desktop overlay must live
    // inside the background layer, outside the managed application stack.
    const aboveWallpaper = () => backgrounds.set_child_above_sibling(root, null);
    lifetime.connect(backgrounds, 'child-added', (_group, child) => {
        if (child !== root)
            aboveWallpaper();
    });
    aboveWallpaper();
}

export function buildDesktopControls(extension) {
    extension._carousel = new St.Widget({name: 'grand-central-desktop-navigation',
        layout_manager: new Clutter.FixedLayout()});
    extension._previous = new St.Button({style_class: 'dp-small-button', can_focus: true,
        accessible_name: 'Show previous panels', child: new St.Icon({icon_name: 'go-previous-symbolic', icon_size: 18})});
    extension._next = new St.Button({style_class: 'dp-small-button', can_focus: true,
        accessible_name: 'Show next panels', child: new St.Icon({icon_name: 'go-next-symbolic', icon_size: 18})});
    extension._restoreBrowser = new St.Button({name: 'grand-central-desktop-restore-browser',
        style_class: 'dp-small-button dp-browser-restore', can_focus: true, visible: false,
        accessible_name: 'Restore browser', child: new St.Icon({icon_name: 'view-restore-symbolic', icon_size: 18})});
    extension._restoreBrowser.connect('clicked', () => extension.panel('browser').settings.set_boolean('expanded', false));
    new Tooltip(extension._previous, 'Previous panels');
    new Tooltip(extension._next, 'Next panels');
    new Tooltip(extension._restoreBrowser, 'Restore browser');
    extension._root.add_child(extension._restoreBrowser);
    extension._carouselLabel = null;
    extension._settingsButton = null;
    extension._previous.connect('clicked', () => extension._turnPanels(-1));
    extension._next.connect('clicked', () => extension._turnPanels(1));
    for (const child of [extension._previous, extension._next]) {
        // Inline style also works for a live update with the previous stylesheet.
        child.set_style('background-color: #181818; color: #fafafa; border: 1px solid rgba(255,255,255,0.12); border-radius: 22px;');
        extension._carousel.add_child(child);
    }
    let scroll = 0;
    extension._carousel.connect('scroll-event', (_actor, event) => {
        const direction = event.get_scroll_direction();
        if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.LEFT)
            extension._turnPanels(-1);
        else if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.RIGHT)
            extension._turnPanels(1);
        else if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();
            scroll += Math.abs(dx) > Math.abs(dy) ? dx : dy;
            if (Math.abs(scroll) >= 1) {
                extension._turnPanels(Math.sign(scroll));
                scroll = 0;
            }
        }
        return Clutter.EVENT_STOP;
    });
    // DND picks nonreactive actors too. Keep this full-desktop container
    // below panel contents so its empty area cannot mask their drop targets.
    extension._root.insert_child_at_index(extension._carousel, 0);
}

export function layoutDesktop(extension) {
    if (!extension._root || !Main.layoutManager.primaryMonitor)
        return;
    attachDesktopLayer(extension._root, extension._life);
    const settings = extension._settings;
    if (extension._active === false || !extension._monitorSpec) {
        extension._root.hide();
        extension.panel('browser')?.setVisible(false);
        extension._contextMenu?.close();
        return;
    }
    extension._root.show();
    const index = extension._monitorSpec.index;
    const monitor = extension._monitorSpec;
    extension._root.set_clip(monitor.x, monitor.y, monitor.width, monitor.height);
    const workArea = Main.layoutManager.getWorkAreaForMonitor(index);
    const area = {x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height};
    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    extension._root.set_size(global.stage.width, global.stage.height);
    const enabled = extension._panelOrder.map(id => extension.panel(id))
        .filter(panel => panel.settings.get_boolean('enabled'));
    const count = Math.min(3, enabled.length);
    extension._start = enabled.length ? ((extension._start % enabled.length) + enabled.length) % enabled.length : 0;
    const indices = Array.from({length: count}, (_, offset) => (extension._start + offset) % enabled.length);
    const visible = indices.map(i => enabled[i]);
    const expanded = visible.find(panel => panel.id === 'browser' && panel.settings.get_boolean('expanded'));
    const slotCount = expanded ? 3 : count;
    const buttonSize = 44 * scale;
    const buttonGap = 8 * scale;
    const gutter = enabled.length > 1 ? buttonSize + buttonGap : 0;
    let panelArea = {...area, x: area.x + gutter, width: Math.max(1, area.width - gutter * 2)};
    const options = {
        width: settings.get_int('panel-width') * scale,
        height: settings.get_int('panel-height') * scale,
        margin: settings.get_int('outer-margin') * scale,
        gap: settings.get_int('panel-gap') * scale,
    };
    let boxes = layoutPanels(panelArea, slotCount, options);
    let top = area.y;
    let bottom = area.y + area.height;
    let calendarBox;
    let restoreTop;
    if (extension._calendar?.actor.visible) {
        calendarBox = calendarGeometry(area, scale, settings.get_int('outer-margin'), extension._calendar.cards.length);
        extension._calendar.setGeometry(calendarBox);
        top = calendarBox.y + calendarBox.height + 12 * scale - options.margin;
    }
    if (expanded) {
        // Reserve space above tall panels so Restore stays outside web content,
        // below the calendar, and inside the monitor's work area.
        restoreTop = calendarBox ? calendarBox.y + calendarBox.height + buttonGap : area.y + buttonGap;
        top = Math.max(top, restoreTop + buttonSize + buttonGap - options.margin);
    }
    if (extension._media || extension._weather) {
        const corners = cornerGeometry(area, scale, settings.get_int('outer-margin'),
            extension._weather?.actor.visible, extension._media?.actor.visible);
        extension._media?.setGeometry(corners.media);
        extension._weather?.setGeometry(corners.weather);
        const rowVisible = extension._media?.actor.visible || extension._weather?.actor.visible;
        if (rowVisible)
            bottom = corners.media.y - 12 * scale + options.margin;
    }
    if (boxes.some(box => box.y < top + options.margin || box.y + box.height > bottom - options.margin)) {
        panelArea = {...panelArea, y: top, height: Math.max(1, bottom - top)};
        boxes = layoutPanels(panelArea, slotCount, options);
    }
    if (expanded && boxes[0].y < restoreTop + buttonSize + buttonGap) {
        // layoutPanels can reduce margins on small monitors. Keep the Restore
        // band even then, retaining the bottom edge of the expanded footprint.
        const offset = Math.ceil(restoreTop + buttonSize + buttonGap - boxes[0].y);
        boxes = boxes.map(box => ({...box, y: box.y + offset, height: Math.max(1, box.height - offset)}));
    }
    const shown = expanded ? [expanded] : visible;
    for (const panel of extension._panels) {
        panel.actor.visible = shown.includes(panel);
        if (panel.id === 'browser')
            panel.setVisible(shown.includes(panel));
    }
    if (expanded) {
        const first = boxes[0];
        const last = boxes.at(-1);
        expanded.setGeometry({...first, width: last.x + last.width - first.x});
    } else {
        visible.forEach((panel, i) => panel.setGeometry(boxes[i]));
    }
    const arrowsVisible = enabled.length > 1 && !expanded;
    extension._carousel.visible = arrowsVisible;
    extension._carousel.set_position(0, 0);
    extension._carousel.set_size(global.stage.width, global.stage.height);
    extension._previous.visible = extension._next.visible = arrowsVisible;
    extension._previous.reactive = extension._previous.can_focus = arrowsVisible;
    extension._next.reactive = extension._next.can_focus = arrowsVisible;
    extension._restoreBrowser.visible = Boolean(expanded);
    extension._restoreBrowser.reactive = extension._restoreBrowser.can_focus = Boolean(expanded);
    if (expanded) {
        const box = expanded._geometry;
        const colors = panelColors(expanded.settings.get_string('background-color'));
        extension._restoreBrowser.set_style(`background-color: ${colors.background}; color: ${colors.foreground};
            border: 1px solid ${colors.border}; border-radius: 22px;`);
        extension._restoreBrowser.set_size(buttonSize, buttonSize);
        extension._restoreBrowser.set_position(Math.round(box.x + box.width - buttonSize),
            Math.round(box.y - buttonSize - buttonGap));
    }
    if (boxes.length) {
        const first = boxes[0];
        const last = boxes.at(-1);
        const y = Math.round(first.y + (first.height - buttonSize) / 2);
        extension._previous.set_size(buttonSize, buttonSize);
        extension._next.set_size(buttonSize, buttonSize);
        extension._previous.set_position(Math.round(first.x - buttonSize - buttonGap), y);
        extension._next.set_position(Math.round(last.x + last.width + buttonGap), y);
    }
}
