// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {decodeNote, noteBytes, MAX_NOTE_BYTES} from './noteStore.js';

const PORTAL = 'org.freedesktop.portal.Desktop';
const REQUEST = 'org.freedesktop.portal.Request';

export class NoteFileChooser {
    constructor(destination = PORTAL) { this._destination = destination; }

    choose(save) {
        if (this._cancel)
            return Promise.reject(new Error('A note file dialog is already open'));
        const cancel = new Gio.Cancellable();
        this._cancel = cancel;
        const token = `gcd_notes_${GLib.uuid_string_random().replaceAll('-', '')}`;
        const sender = Gio.DBus.session.get_unique_name().slice(1).replaceAll('.', '_');
        let path = `/org/freedesktop/portal/desktop/request/${sender}/${token}`;
        return new Promise((resolve, reject) => {
            let settled = false;
            let subscription = 0;
            const finish = (file, error = null) => {
                if (settled) return;
                settled = true;
                if (subscription) Gio.DBus.session.signal_unsubscribe(subscription);
                this._cancel = null;
                this._close = null;
                if (error) reject(error); else resolve(file);
            };
            const subscribe = () => Gio.DBus.session.signal_subscribe(this._destination, REQUEST, 'Response', path, null,
                Gio.DBusSignalFlags.NONE, (_connection, _sender, _path, _interface, _signal, parameters) => {
                    const [response, results] = parameters.deep_unpack();
                    const uri = results.uris?.deep_unpack()?.[0];
                    if (response === 1) finish(null);
                    else if (response || !uri) finish(null, new Error('Note file selection failed'));
                    else finish(Gio.File.new_for_uri(uri));
                });
            subscription = subscribe();
            this._close = () => {
                cancel.cancel();
                Gio.DBus.session.call(this._destination, path, REQUEST, 'Close', null, null, Gio.DBusCallFlags.NONE,
                    1000, null, null);
                finish(null);
            };
            const options = {
                handle_token: new GLib.Variant('s', token),
                accept_label: new GLib.Variant('s', save ? 'Export' : 'Load'),
                filters: new GLib.Variant('a(sa(us))', [['Text files', [[0, '*.[tT][xX][tT]'], [0, '*.[mM][dD]']]],
                    ['All files', [[0, '*']]]]),
            };
            if (save) options.current_name = new GLib.Variant('s', 'note.txt');
            Gio.DBus.session.call(this._destination, '/org/freedesktop/portal/desktop', 'org.freedesktop.portal.FileChooser',
                save ? 'SaveFile' : 'OpenFile', new GLib.Variant('(ssa{sv})', ['', save ? 'Export Note' : 'Load Note', options]),
                new GLib.VariantType('(o)'), Gio.DBusCallFlags.NONE, 30000, cancel, (connection, result) => {
                    try {
                        const [actual] = connection.call_finish(result).deep_unpack();
                        if (settled) return;
                        if (actual !== path) {
                            Gio.DBus.session.signal_unsubscribe(subscription);
                            path = actual;
                            subscription = subscribe();
                        }
                    } catch (error) { finish(null, error); }
                });
        });
    }

    destroy() { this._close?.(); }
}

export async function readNoteFile(file, cancel = null) {
    const info = await new Promise((resolve, reject) => file.query_info_async('standard::size',
        Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancel, (source, result) => {
            try { resolve(source.query_info_finish(result)); } catch (error) { reject(error); }
        }));
    if (info.get_size() > MAX_NOTE_BYTES) throw new Error('Note exceeds 1 MB');
    return new Promise((resolve, reject) => file.load_contents_async(cancel, (source, result) => {
        try { resolve(decodeNote(source.load_contents_finish(result)[1])); } catch (error) { reject(error); }
    }));
}

export async function exportNoteFile(file, text, cancel = null) {
    const bytes = noteBytes(text);
    // GJS marshals a zero-length async buffer as NULL. The synchronous UTF-8
    // string path handles an intentionally empty file without hanging GIO.
    if (!text.length) {
        file.replace_contents('', null, false,
            Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, cancel);
        return;
    }
    await new Promise((resolve, reject) => file.replace_contents_bytes_async(GLib.Bytes.new(bytes), null, false,
        Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, cancel, (source, result) => {
            try { source.replace_contents_finish(result); resolve(); } catch (error) { reject(error); }
        }));
}
