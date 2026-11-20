// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const MAX_NOTE_BYTES = 1024 * 1024;

export function noteBytes(text) {
    if (text.includes('\0'))
        throw new Error('Note contains invalid text');
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_NOTE_BYTES)
        throw new Error('Note exceeds 1 MB');
    return bytes;
}

export function decodeNote(bytes) {
    if (bytes.length > MAX_NOTE_BYTES)
        throw new Error('Note exceeds 1 MB');
    const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    noteBytes(text);
    return text;
}

export class NoteStore {
    constructor(file = Gio.File.new_for_path(`${GLib.get_user_data_dir()}/grand-central-desktop/notes/note.md`), changed = () => {}) {
        this.file = file;
        this.changed = changed;
        this.text = this.savedText = '';
        this.ready = this.dirty = false;
        this.error = null;
        this._timer = 0;
    }

    load() {
        try {
            let bytes;
            try {
                [, bytes] = this.file.load_contents(null);
            } catch (error) {
                if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    throw error;
                bytes = new Uint8Array();
            }
            const text = decodeNote(bytes);
            this.text = this.savedText = text;
            this.ready = true;
            this.dirty = false;
            this.error = null;
        } catch (error) {
            this.error = error;
            this.ready = false;
        }
        this.changed();
        return this.ready;
    }

    setText(text) {
        if (!this.ready)
            return;
        this.text = text;
        this.dirty = text !== this.savedText;
        this.error = null;
        this._cancelTimer();
        if (this.dirty) {
            this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                this._timer = 0;
                this.save();
                return GLib.SOURCE_REMOVE;
            });
        }
        this.changed();
    }

    _cancelTimer() {
        if (this._timer)
            GLib.Source.remove(this._timer);
        this._timer = 0;
    }

    save() {
        this._cancelTimer();
        if (!this.ready)
            return false;
        if (!this.dirty)
            return true;
        try {
            noteBytes(this.text);
            const directory = this.file.get_parent().get_path();
            if (GLib.mkdir_with_parents(directory, 0o700) !== 0)
                throw new Error('Cannot create notes folder');
            // GJS marshals an empty Uint8Array as NULL; a UTF-8 string also
            // handles the deliberate empty-note save correctly.
            this.file.replace_contents(this.text, null, false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            this.savedText = this.text;
            this.dirty = false;
            this.error = null;
        } catch (error) {
            this.error = error;
        }
        this.changed();
        return !this.error;
    }

    destroy() {
        this.save();
        this._cancelTimer();
        this.changed = () => {};
    }
}
