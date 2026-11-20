// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Lifetime} from './lifetime.js';
import {Tooltip} from './tooltip.js';
import {panelColors} from './model.js';
import {acquireNoteDocument} from './noteDocument.js';
import {NoteFileChooser, readNoteFile, exportNoteFile} from './noteFiles.js';

export class NotesPanel {
    constructor(settings, restored = null) {
        this.id = 'notes';
        this.settings = settings;
        this._life = new Lifetime();
        this.actor = new St.BoxLayout({name: 'desk-panel-notes', style_class: 'dp-panel dp-notes',
            orientation: Clutter.Orientation.VERTICAL, reactive: true});
        this.title = new St.Label({style_class: 'dp-title', x_expand: true});
        const header = new St.BoxLayout({style_class: 'dp-header'});
        header.add_child(this.title);
        this.actor.add_child(header);
        this.entry = new St.Entry({hint_text: 'Write a note…', style_class: 'dp-notes-editor', can_focus: true,
            x_expand: true, y_expand: false, y_align: Clutter.ActorAlign.START, accessible_name: 'Quick Notes editor'});
        const text = this.entry.clutter_text;
        text.set_single_line_mode(false);
        text.set_activatable(false);
        text.set_line_wrap(true);
        text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        text.set_line_alignment(Pango.Alignment.LEFT);
        ShellEntry.addContextMenu(this.entry);
        this.entry.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS ||
                ![Clutter.KEY_Return, Clutter.KEY_KP_Enter].includes(event.get_key_symbol()) || !this.store.ready)
                return Clutter.EVENT_PROPAGATE;
            text.delete_selection();
            const position = text.cursor_position < 0 ? [...text.text].length : text.cursor_position;
            text.insert_text('\n', position);
            text.set_cursor_position(position + 1);
            text.set_selection_bound(position + 1);
            return Clutter.EVENT_STOP;
        });
        this.editorScroll = new St.ScrollView({x_expand: true, y_expand: true, reactive: true,
            style_class: 'dp-notes-area', hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC});
        const editorBox = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_expand: true});
        editorBox.add_child(this.entry);
        this.editorScroll.set_child(editorBox);
        this.actor.add_child(this.editorScroll);
        this._life.connect(this.editorScroll, 'captured-event', (_actor, event) => {
            if ((event.type() === Clutter.EventType.BUTTON_RELEASE && event.get_button() === 1) ||
                event.type() === Clutter.EventType.TOUCH_END)
                this._queueEntryFocus();
            return Clutter.EVENT_PROPAGATE;
        });
        const footer = new St.BoxLayout({style_class: 'dp-footer', x_expand: true});
        this.status = new St.Label({style_class: 'dp-caption', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        this.status.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.retry = new St.Button({label: 'Retry', can_focus: true, style_class: 'dp-small-button', visible: false});
        this.fileButton = new St.Button({child: new St.Icon({icon_name: 'document-open-symbolic', icon_size: 16}),
            can_focus: true, style_class: 'dp-small-button', accessible_name: 'Note files'});
        this.undoButton = new St.Button({label: 'Undo', can_focus: true, style_class: 'dp-small-button',
            visible: false, accessible_name: 'Undo loaded note'});
        this.undoButton.connect('clicked', () => this._document.undoLoad());
        for (const child of [this.status, this.retry, this.undoButton, this.fileButton]) footer.add_child(child);
        this.actor.add_child(footer);
        this.fileChooser = new NoteFileChooser();
        this._fileCancel = new Gio.Cancellable();
        this.fileMenu = new PopupMenu.PopupMenu(this.fileButton, 0, St.Side.BOTTOM);
        Main.uiGroup.add_child(this.fileMenu.actor);
        this.fileMenu.actor.hide();
        this.fileMenu.addAction('Load from File…', () => this.fileAction(false));
        this.fileMenu.addAction('Export to File…', () => this.fileAction(true));
        this._fileMenuManager = new PopupMenu.PopupMenuManager(this.fileButton);
        this._fileMenuManager.addMenu(this.fileMenu);
        this.fileButton.connect('clicked', () => this.fileMenu.toggle());
        this._fileTooltip = new Tooltip(this.fileButton, 'Load or export note', () => this.fileMenu.isOpen);
        this._life.connect(this.fileMenu, 'open-state-changed', () => this._fileTooltip.sync());
        this._document = acquireNoteDocument();
        this.store = this._document.store;
        this._unsubscribeDocument = this._document.subscribe(() => this._syncDocument());
        this.entry.set_text(this.store.ready ? restored?.text ?? this.store.text : '');
        if (this.store.ready && restored)
            this.store.setText(restored.text);
        this._life.connect(text, 'text-changed', () => {
            if (!this._syncingDocument) this.store.setText(this.entry.get_text());
        });
        this._life.connect(text, 'notify::cursor-position', () => this._queueCursorScroll());
        this.retry.connect('clicked', () => {
            if (this.store.ready) this.store.save();
            else if (this.store.load()) this.entry.set_text(this.store.text);
        });
        this.actor.connect('destroy', () => {
            this._disposed = true;
            if (this._savedTimer) GLib.Source.remove(this._savedTimer);
            this._savedTimer = 0;
            this._fileCancel.cancel();
            this.fileChooser.destroy();
            this._fileTooltip.destroy();
            this.fileMenu.destroy();
            this._life.destroy();
            this._unsubscribeDocument();
            this._document.release();
        });
        this._syncStatus();
        if (restored) {
            this._life.idle(() => {
                text.set_cursor_position(restored.cursor);
                text.set_selection_bound(restored.selection);
                this.editorScroll.vadjustment.value = restored.editorScroll ?? 0;
            });
        }
    }

    _syncStatus() {
        if (this._disposed) return;
        this.entry.clutter_text.editable = this.store.ready;
        this.fileButton.reactive = this.fileButton.can_focus = this.store.ready && !this._fileBusy;
        this.retry.visible = Boolean(this.store.error);
        this.undoButton.visible = this._document.canUndo();
        const message = this.store.error?.message === 'Note exceeds 1 MB' ? this.store.error.message
            : this.store.error ? this.store.ready ? 'Couldn’t save note' : 'Couldn’t load note'
            : this.store.dirty ? 'Saving…' : this.undoButton.visible ? 'Note loaded' : 'Saved';
        this._setStatus(message, message === 'Saved');
        this.status.accessible_name = this.store.error?.message ?? this.status.text;
    }

    _setStatus(message, quiet = false) {
        if (this._statusMessage === message) return;
        this._statusMessage = message;
        if (this._savedTimer) GLib.Source.remove(this._savedTimer);
        this._savedTimer = 0;
        this.status.remove_all_transitions();
        this.status.opacity = 255;
        this.status.text = message;
        if (quiet) this._savedTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            this._savedTimer = 0;
            this.status.ease({opacity: 0, duration: 180});
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncDocument() {
        if (this._disposed) return;
        if (this.entry.get_text() !== this.store.text && this.store.ready) {
            const text = this.entry.clutter_text;
            const cursor = text.cursor_position;
            const selection = text.selection_bound;
            this._syncingDocument = true;
            this.entry.set_text(this.store.text);
            text.set_cursor_position(cursor);
            text.set_selection_bound(selection);
            this._syncingDocument = false;
        }
        this._syncStatus();
    }

    _queueEntryFocus() {
        if (this._focusQueued) return;
        this._focusQueued = true;
        // Let the pointer place the caret or finish selection first. Empty
        // entry padding and its hint must also focus the text entry.
        this._life.idle(() => {
            this._focusQueued = false;
            if (this.store.ready && !this._fileBusy && this.editorScroll.visible && this.entry.is_mapped() &&
                global.stage.get_key_focus() !== this.entry.clutter_text)
                this.entry.grab_key_focus();
        });
    }

    copyNote() {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this.entry.get_text());
    }

    async fileAction(save) {
        if (this._fileBusy || !this.store.ready || this._disposed) return;
        this._fileBusy = true;
        this._syncStatus();
        try {
            const file = await this.fileChooser.choose(save);
            if (!file || this._disposed) return;
            if (save) {
                await exportNoteFile(file, this.entry.get_text(), this._fileCancel);
                if (!this._disposed) this._setStatus('Exported', true);
            } else {
                const before = this.entry.get_text();
                const text = await readNoteFile(file, this._fileCancel);
                if (this._disposed) return;
                if (before !== this.entry.get_text()) throw new Error('Note changed; load the file again');
                if (!this.store.save()) throw new Error('Save the current draft before loading a file');
                this.entry.set_text(text);
                this.store.save();
                this._document.rememberLoad(before, text);
            }
        } catch (error) {
            if (!this._disposed) {
                this._setStatus(save ? 'Couldn’t export note' : 'Couldn’t load file');
                this.status.accessible_name = error.message;
            }
        } finally {
            this._fileBusy = false;
            if (!this._disposed) this.fileButton.reactive = this.fileButton.can_focus = this.store.ready;
        }
    }

    _queueCursorScroll() {
        if (this._cursorQueued) return;
        this._cursorQueued = true;
        this._life.idle(() => {
            this._cursorQueued = false;
            if (!this.editorScroll.visible || !this.entry.is_mapped()) return;
            const rect = this.entry.clutter_text.get_cursor_rect();
            const y = this.entry.y + this.entry.clutter_text.y + rect.origin.y;
            const adjustment = this.editorScroll.vadjustment;
            if (y < adjustment.value) adjustment.value = y;
            else if (y + rect.size.height > adjustment.value + adjustment.page_size)
                adjustment.value = y + rect.size.height - adjustment.page_size;
        });
    }

    updateStyle() {
        this.title.text = this.settings.get_string('title');
        const colors = panelColors(this.settings.get_string('background-color'));
        this.actor.set_style(`background-color: ${colors.background}; color: ${colors.foreground};
            border-color: ${colors.border}; border-radius: ${this.settings.get_int('corner-radius')}px;`);
        this.entry.set_style(`color: ${colors.foreground}; caret-color: ${colors.foreground};
            font-size: ${this.settings.get_int('font-size')}px;`);
        this._queueCursorScroll();
        this.status.set_style(`color: ${colors.muted};`);
    }

    setGeometry(box) {
        if (this.actor.x !== box.x || this.actor.y !== box.y || this.actor.width !== box.width || this.actor.height !== box.height)
            this._fileTooltip.hide();
        this.actor.set_position(box.x, box.y);
        this.actor.set_size(box.width, box.height);
    }

    captureState() {
        this.store.save();
        return {text: this.entry.get_text(), cursor: this.entry.clutter_text.cursor_position,
            selection: this.entry.clutter_text.selection_bound,
            editorScroll: this.editorScroll.vadjustment.value};
    }
}
