// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {validHomeUrl} from './model.js';
import {validateMonitorMap} from './monitorModel.js';

const PRODUCT = 'grand-central-desktop';
const MAX_BYTES = 1024 * 1024;
function sections(settings) {
    return new Map([['general', settings], ...settings.list_children().sort().map(name => [name, settings.get_child(name)])]);
}

export function exportConfiguration(settings) {
    const values = {};
    for (const [name, group] of sections(settings)) {
        values[name] = {};
        for (const key of group.settings_schema.list_keys().sort())
            values[name][key] = group.get_value(key).deep_unpack();
    }
    return JSON.stringify({product: PRODUCT, format: 1, settings: values}, null, 2) + '\n';
}

function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateConfiguration(settings, text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BYTES)
        throw new Error('Configuration file is too large.');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('The configuration file is not valid JSON.'); }
    if (!object(data) || data.product !== PRODUCT || data.format !== 1 || !object(data.settings) || !Object.keys(data.settings).length)
        throw new Error('Unsupported configuration file.');
    const known = sections(settings);
    const prepared = [];
    for (const [name, values] of Object.entries(data.settings)) {
        const group = known.get(name);
        if (!group || !object(values)) throw new Error(`Unknown settings section: ${name}`);
        for (const [key, value] of Object.entries(values)) {
            if (!group.settings_schema.has_key(key)) throw new Error(`Unknown setting: ${name}.${key}`);
            const schema = group.settings_schema.get_key(key);
            const type = schema.get_value_type().dup_string();
            const valid = type === 'b' ? typeof value === 'boolean'
                : type === 'i' ? Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647
                    : type === 's' ? typeof value === 'string'
                        : type === 'as' && Array.isArray(value) && value.every(item => typeof item === 'string');
            if (!valid) throw new Error(`Invalid value for ${name}.${key}`);
            const variant = new GLib.Variant(type, value);
            if (!schema.range_check(variant)) throw new Error(`Out-of-range value for ${name}.${key}`);
            if (!group.is_writable(key)) throw new Error(`Setting is locked: ${name}.${key}`);
            if (key === 'background-color' && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid panel color.');
            if (name === 'browser' && key === 'home-url' && !validHomeUrl(value)) throw new Error('Invalid browser home URL.');
            if (name === 'general' && ['monitor-layouts', 'monitor-browser-overrides'].includes(key))
                validateMonitorMap(settings, key, value);
            prepared.push({group, key, value: variant});
        }
    }
    if (!prepared.length) throw new Error('The configuration has no settings.');
    return prepared;
}

export function importConfiguration(settings, text) {
    // Validate every key before staging any write. No unknown keys are ignored.
    const prepared = validateConfiguration(settings, text);
    const groups = new Map();
    try {
        for (const entry of prepared) {
            const path = entry.group.path;
            if (!groups.has(path)) {
                const target = new Gio.Settings({settings_schema: entry.group.settings_schema,
                    path, backend: entry.group.backend});
                target.delay();
                groups.set(path, target);
            }
            if (!groups.get(path).set_value(entry.key, entry.value))
                throw new Error(`Unable to set ${entry.key}`);
        }
    } catch (e) {
        for (const group of groups.values()) group.revert();
        throw e;
    }
    for (const group of groups.values()) group.apply();
}

export async function writeConfiguration(file, text) {
    await new Promise((resolve, reject) => file.replace_contents_async(new TextEncoder().encode(text), null,
        false, Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null, (target, result) => {
            try { target.replace_contents_finish(result); resolve(); } catch (e) { reject(e); }
        }));
}

export async function readConfiguration(file) {
    const info = await new Promise((resolve, reject) => file.query_info_async('standard::size',
        Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (source, result) => {
            try { resolve(source.query_info_finish(result)); } catch (e) { reject(e); }
        }));
    if (info.get_size() > MAX_BYTES) throw new Error('Configuration file is too large.');
    const bytes = await new Promise((resolve, reject) => file.load_contents_async(null, (source, result) => {
        try { resolve(source.load_contents_finish(result)[1]); } catch (e) { reject(e); }
    }));
    if (bytes.length > MAX_BYTES) throw new Error('Configuration file is too large.');
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
}
