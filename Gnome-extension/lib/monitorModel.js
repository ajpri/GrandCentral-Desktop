// SPDX-License-Identifier: GPL-3.0-or-later
export const BROWSER_OVERRIDE_KEYS = ['home-url', 'zoom-percent', 'show-controls', 'show-color-picker',
    'auto-match-page-color', 'request-mobile-site', 'background-color', 'expanded', 'title', 'corner-radius'];

export function monitorIdentity(specs) {
    return JSON.stringify(specs.map(spec => spec.map(value => value ?? ''))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export function monitorRecords(monitors, logical) {
    return logical.map((item, index) => ({index, x: item[0], y: item[1], scale: item[2], primary: item[4],
        id: monitorIdentity(item[5]),
        name: `${index + 1} · ${item[5].map(spec => {
            const value = monitors.find(record => record[0][0] === spec[0])?.[2]?.['display-name'];
            const name = value?.deep_unpack?.() ?? value;
            return `${name || spec[2] || 'Display'} (${spec[0]})`;
        }).join(' + ')}`}));
}

export function readMonitorMap(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid monitor settings');
    return data;
}

export function validateMonitorMap(settings, key, text) {
    const data = readMonitorMap(text);
    const schema = settings.get_child('browser').settings_schema;
    for (const [id, values] of Object.entries(data)) {
        if (!id || id.length > 1024 || !values || typeof values !== 'object' || Array.isArray(values))
            throw new Error('Invalid monitor settings');
        for (const [name, value] of Object.entries(values)) {
            if (key === 'monitor-layouts') {
                if (name !== 'start' || !Number.isSafeInteger(value) || value < 0 || value > 100)
                    throw new Error('Invalid monitor layout');
                continue;
            }
            if (!BROWSER_OVERRIDE_KEYS.includes(name)) throw new Error('Unknown monitor browser setting');
            const type = schema.get_key(name).get_value_type().dup_string();
            if ((type === 'b' && typeof value !== 'boolean') || (type === 'i' && !Number.isSafeInteger(value)) ||
                (type === 's' && typeof value !== 'string')) throw new Error('Invalid monitor browser value');
            if (name === 'zoom-percent' && (value < 25 || value > 300)) throw new Error('Invalid browser zoom');
            if (name === 'corner-radius' && (value < 0 || value > 80)) throw new Error('Invalid browser radius');
            if (name === 'title' && value.length > 200) throw new Error('Invalid browser title');
            if (name === 'background-color' && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid browser color');
            if (name === 'home-url' && value !== 'about:blank' && !/^https?:\/\/[^\s/]+(?:[^\s]*)$/i.test(value))
                throw new Error('Invalid browser home URL');
        }
    }
    return data;
}
