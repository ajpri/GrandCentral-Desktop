// SPDX-License-Identifier: GPL-3.0-or-later
import {NoteStore} from './noteStore.js';
import GLib from 'gi://GLib';

// All display editors in this runtime share one document and one writer.
let document = null;
export function acquireNoteDocument() {
    if (!document) {
        const current = {listeners: new Set(), references: 0, undo: null, timer: 0};
        current.notify = () => { for (const changed of current.listeners) changed(); };
        current.clearUndo = () => {
            if (current.timer) GLib.Source.remove(current.timer);
            current.timer = 0; current.undo = null;
        };
        current.store = new NoteStore(undefined, () => {
            if (current.undo && current.store.text !== current.undo.loaded) current.clearUndo();
            current.notify();
        });
        current.store.load();
        document = current;
    }
    const current = document;
    current.references++;
    return {
        store: current.store,
        subscribe(callback) { current.listeners.add(callback); return () => current.listeners.delete(callback); },
        canUndo() { return Boolean(current.undo); },
        rememberLoad(text, loaded) {
            current.clearUndo();
            if (text === loaded) { current.notify(); return; }
            current.undo = {text, loaded};
            current.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8000, () => {
                current.timer = 0; current.undo = null; current.notify(); return GLib.SOURCE_REMOVE;
            });
            current.notify();
        },
        undoLoad() {
            if (!current.undo) return;
            const text = current.undo.text;
            current.clearUndo();
            current.store.setText(text);
            current.store.save();
        },
        release() {
            if (--current.references === 0) { current.clearUndo(); current.store.destroy(); if (document === current) document = null; }
        },
    };
}
