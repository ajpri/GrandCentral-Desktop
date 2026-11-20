// SPDX-License-Identifier: GPL-3.0-or-later

function normalized(text) {
    return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export function searchNames(items, query, name = item => item.label) {
    const words = normalized(query).trim().split(/\s+/).filter(Boolean);
    return items.filter(item => {
        const text = normalized(name(item));
        return words.every(word => text.includes(word));
    });
}
