// SPDX-License-Identifier: GPL-3.0-or-later

import {searchNames} from './nameSearch.js';

// Search display names across the entire app grid, retaining its live order.
export function searchApps(items, query) {
    const seen = new Set();
    const result = [];
    function collect(entries) {
        for (const item of entries) {
            if (item.children) {
                collect(item.children);
            } else if (item.app && !seen.has(item.id)) {
                seen.add(item.id);
                result.push(item);
            }
        }
    }
    collect(items);
    return searchNames(result, query);
}
