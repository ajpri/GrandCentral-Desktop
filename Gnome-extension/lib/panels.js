// SPDX-License-Identifier: GPL-3.0-or-later
import {PANEL_IDS as ORIGINAL_PANEL_IDS} from './model.js';

export const PANEL_IDS = [...ORIGINAL_PANEL_IDS, 'apps', 'notes'];
export const PANEL_NAMES = {programs: 'Programs', desktop: 'Desktop', documents: 'Documents',
    calculator: 'Calculator', browser: 'Browser', apps: 'All Apps', notes: 'Quick Notes'};

export function panelOrder(saved) {
    return [...new Set([...saved, ...PANEL_IDS])].filter(id => PANEL_IDS.includes(id));
}

export function movePanel(saved, id, delta) {
    const order = panelOrder(saved);
    const from = order.indexOf(id);
    const to = from + delta;
    if (from >= 0 && to >= 0 && to < order.length)
        [order[from], order[to]] = [order[to], order[from]];
    return order;
}

export function insertPanel(saved, id, target, after = false) {
    const order = panelOrder(saved);
    if (id === target || !order.includes(id) || !order.includes(target))
        return order;
    order.splice(order.indexOf(id), 1);
    order.splice(order.indexOf(target) + Number(after), 0, id);
    return order;
}
