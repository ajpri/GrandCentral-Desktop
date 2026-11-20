// SPDX-License-Identifier: GPL-3.0-or-later
// This module is also used by the headless GJS tests.
export const PANEL_IDS = ['programs', 'desktop', 'documents', 'calculator', 'browser'];

export function validHomeUrl(value) {
    return value === 'about:blank' || /^https?:\/\/[^\s/]+(?:[^\s]*)$/i.test(value);
}

export function recentFirst(history, id, limit = 100) {
    return [id, ...history.filter(item => item !== id)].slice(0, limit);
}

export function insetCornerRadius(radius, inset, width, height) {
    return Math.max(0, Math.min(radius - inset, width / 2, height / 2));
}

export function pageItems(items, page, capacity) {
    capacity = Math.max(1, capacity);
    const count = Math.max(1, Math.ceil(items.length / capacity));
    const current = Math.max(0, Math.min(page, count - 1));
    return {items: items.slice(current * capacity, (current + 1) * capacity),
        page: current, count};
}

export function panelColors(value) {
    const background = /^#[0-9a-f]{6}$/i.test(value) ? value : '#181818';
    const channels = [1, 3, 5].map(i => {
        const c = parseInt(background.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const light = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179;
    return {background, foreground: light ? '#181818' : '#ffffff',
        muted: light ? '#505050' : '#b8b8b8',
        hover: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)',
        border: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)'};
}

// Keep all three panels in one row as in the sketch. On smaller displays,
// each panel reduces its effective column count instead of clipping icons.
export function layoutPanels(area, count, options) {
    if (!count)
        return [];
    const margin = Math.min(options.margin, area.width / 20, area.height / 20);
    const gap = Math.min(options.gap, area.width / 30);
    const width = Math.max(1, Math.min(options.width,
        (area.width - margin * 2 - gap * (count - 1)) / count));
    const height = Math.max(1, Math.min(options.height, area.height - margin * 2));
    const left = area.x + (area.width - width * count - gap * (count - 1)) / 2;
    return Array.from({length: count}, (_, i) => ({
        x: Math.round(left + i * (width + gap)),
        y: Math.round(area.y + (area.height - height) / 2),
        width: Math.floor(width), height: Math.floor(height),
    }));
}

export function gridGeometry(width, height, options) {
    const icon = Math.min(options.iconSize, Math.max(16, width - 48));
    const cellWidth = icon + 24;
    const cellHeight = icon + (options.showLabels ? 46 : 22);
    const columns = Math.max(1, Math.min(options.columns, Math.floor((width - 36) / cellWidth)));
    const rows = Math.max(1, Math.min(options.rows, Math.floor((height - 138) / cellHeight)));
    return {columns, rows, icon, capacity: columns * rows};
}
