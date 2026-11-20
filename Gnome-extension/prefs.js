// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GrandCentralDesktopPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const [, bytes] = this.dir.get_child('active-release.json').load_contents(null);
        const pointer = JSON.parse(new TextDecoder().decode(bytes));
        try {
            const [, statusBytes] = this.dir.get_child('.update-status.json').load_contents(null);
            const status = JSON.parse(new TextDecoder().decode(statusBytes));
            if (['active', 'error'].includes(status.state) && /^[a-f0-9]{64}$/.test(status.release ?? ''))
                pointer.release = status.release;
        } catch (_e) { /* Preferences also work before the first activation. */ }
        if (pointer.format !== 1 || !/^[a-f0-9]{64}$/.test(pointer.release ?? ''))
            throw new Error('Invalid installed release pointer');
        const directory = this.dir.resolve_relative_path(`runtime-builds/${pointer.release}`);
        const [, indexBytes] = directory.get_child('release.json').load_contents(null);
        const digest = data => GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, new GLib.Bytes(data));
        if (digest(indexBytes) !== pointer.release)
            throw new Error('Release index checksum mismatch');
        const index = JSON.parse(new TextDecoder().decode(indexBytes));
        for (const [name, expected] of Object.entries(index.files)) {
            if (!/^[a-zA-Z0-9_./@-]+$/.test(name) || name.startsWith('/') || name.split('/').includes('..'))
                throw new Error('Invalid release file');
            const [, fileBytes] = directory.resolve_relative_path(name).load_contents(null);
            if (digest(fileBytes) !== expected)
                throw new Error(`Release file checksum mismatch: ${name}`);
        }
        const module = await import(`${directory.get_uri()}/runtime-prefs.js`);
        window._runtimePreferences = new module.default({...index.metadata, dir: directory, path: directory.get_path()});
        await window._runtimePreferences.fillPreferencesWindow(window);
    }
}
