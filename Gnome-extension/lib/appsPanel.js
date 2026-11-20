// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';
import {Panel} from './panel.js';
import {AppFolders} from './appFolders.js';
import {Lifetime} from './lifetime.js';
import {searchApps} from './appSearch.js';
import {PanelSearch} from './searchEntry.js';
import {Tooltip} from './tooltip.js';

export class AppsPanel extends Panel {
    constructor(settings, launch, restored = null) {
        super('apps', settings, item => this._openItem(item));
        this._launch = launch;
        this._life = new Lifetime();
        this._folders = new AppFolders();
        this._rootItems = [];
        this._folderId = restored?.folderId ?? null;
        this._rootPage = restored?.rootPage ?? 0;
        this.back = new St.Button({style_class: 'dp-small-button', can_focus: true, visible: false,
            accessible_name: 'Back to All Apps', child: new St.Icon({icon_name: 'go-previous-symbolic', icon_size: 16})});
        this._renameButton = new St.Button({style_class: 'dp-small-button', can_focus: true, visible: false,
            accessible_name: 'Rename Folder', child: new St.Icon({icon_name: 'document-edit-symbolic', icon_size: 16})});
        new Tooltip(this.back, 'Back to All Apps', () => this._dragging);
        new Tooltip(this._renameButton, 'Rename folder', () => this._dragging);
        this._nameEntry = new St.Entry({style_class: 'dp-folder-name-entry', x_expand: true,
            can_focus: true, visible: false, accessible_name: 'Folder name'});
        ShellEntry.addContextMenu(this._nameEntry);
        // Fixed slots preserve title alignment and header height when a query
        // temporarily hides folder actions. Search never moves the grid.
        const left = new St.Bin({style_class: 'dp-app-header-slot', child: this.back});
        const right = new St.Bin({style_class: 'dp-app-header-slot', child: this._renameButton});
        this.header.insert_child_at_index(left, 0);
        this.header.insert_child_at_index(this._nameEntry, 2);
        this.header.add_child(right);
        this.search = new PanelSearch(this, {
            hint: 'Search apps…', accessibleName: 'Search apps by name',
            changed: () => this._syncItems()}, restored);
        this.searchEntry = this.search.entry;
        this._renameButton.connect('clicked', () => this.renameFolder());
        this._nameEntry.clutter_text.connect('activate', () => this._finishRename(true));
        this._nameEntry.clutter_text.connect('key-focus-out', () => this._finishRename(true, false));
        this._nameEntry.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this._finishRename(false);
            return Clutter.EVENT_STOP;
        });
        this.back.connect('clicked', () => this.goBack());
        this.back._delegate = {
            handleDragOver: source => this._canMoveOut(source) ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.NO_DROP,
            acceptDrop: source => {
                if (!this._canMoveOut(source))
                    return false;
                return this._edit(() => {
                    this._folders.remove(source.app);
                    this._life.idle(() => this.goBack());
                    return true;
                });
            },
        };
        this.actor.connect('destroy', () => {
            this._destroyed = true;
            this._clearDropTarget();
            // Destroying our drag clone lets GNOME cancel its modal drag grab.
            this._dragIcon?.destroy();
            if (this._dragMonitor)
                DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
            this._life.destroy();
        });
        this.actor.connect('key-press-event', (_actor, event) => {
            if (this._renaming)
                return Clutter.EVENT_PROPAGATE;
            if (this.search.focused || this._isSearching())
                return Clutter.EVENT_PROPAGATE;
            if (this._folderId && [Clutter.KEY_Escape, Clutter.KEY_BackSpace].includes(event.get_key_symbol())) {
                this.goBack();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    updateStyle() {
        super.updateStyle();
        this._syncHeading();
    }

    setItems(items, message) {
        this._rootItems = items;
        this._rootMessage = message;
        const folder = items.find(item => item.id === this._folderId && item.children);
        if (this._folderId && !folder) {
            this._folderId = null;
            if (this._isSearching())
                this.search.state.browsePage = this._rootPage;
            else {
                this._page = this._rootPage;
                delete this._restorePage;
            }
        }
        this._syncItems();
    }

    _syncItems() {
        const folder = this._rootItems.find(item => item.id === this._folderId && item.children);
        super.setItems(this._isSearching() ? searchApps(this._rootItems, this.search.state.query) : folder ? folder.children : this._rootItems,
            this._isSearching() ? 'No matching apps.' : folder ? 'This folder is empty.' : this._rootMessage);
        this._syncHeading();
    }

    _syncHeading() {
        const folder = !this._isSearching() && this._rootItems.find(item => item.id === this._folderId);
        this.title.text = folder ? folder.label : this.settings.get_string('title');
        this.back.visible = this._renameButton.visible = Boolean(folder);
        if (!this._rootItems.some(item => item.id === this._folderId) && this._renaming)
            this._finishRename(false, false);
    }

    _openItem(item) {
        if (this._dragging || this._suppressActivation)
            return;
        this._finishRename(true, false);
        if (!item.children) {
            this._launch(item);
            return;
        }
        this._rootPage = this._page;
        this._folderId = item.id;
        this._page = 0;
        super.setItems(item.children, 'This folder is empty.');
        this._syncHeading();
        if (this.actor.mapped)
            this.back.grab_key_focus();
    }

    goBack() {
        if (!this._folderId)
            return;
        this._finishRename(true, false);
        this._folderId = null;
        this._page = this._rootPage;
        super.setItems(this._rootItems, this._rootMessage);
        this._syncHeading();
        if (this.actor.mapped)
            this.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }

    captureNavigation() {
        return {folderId: this._folderId, rootPage: this._folderId ? this._rootPage : this._isSearching() ? this.search.state.browsePage : this._page,
            ...this.search.state.capture()};
    }

    _isSearching() {
        return this.search.state.active;
    }

    _gridHeightAdjustment() {
        return this.search?.height ?? 0;
    }

    renameFolder(item = this._rootItems.find(item => item.id === this._folderId)) {
        if (!item?.children)
            return;
        if (this.search.state.query)
            this.searchEntry.set_text('');
        if (this._folderId !== item.id)
            this._openItem(item);
        this._renaming = item.folderId;
        this._nameEntry.set_text(item.label);
        this.title.hide();
        this._nameEntry.show();
        this._nameEntry.grab_key_focus();
        this._nameEntry.clutter_text.set_selection(0, -1);
    }

    _finishRename(save, focus = true) {
        if (!this._renaming)
            return;
        const id = this._renaming;
        this._renaming = null;
        if (save)
            this._edit(() => this._folders.rename(id, this._nameEntry.get_text()));
        this._nameEntry.hide();
        this.title.show();
        if (focus && this.actor.mapped)
            this._renameButton.grab_key_focus();
    }

    _edit(action) {
        try { return action(); } catch (error) {
            Main.notify('Grand Central Desktop', error.message);
            return false;
        }
    }

    _canMoveOut(source) {
        return !this._isSearching() && source?.panel === this && Boolean(this._folderId) && Boolean(source.app);
    }

    _canDrop(source, item) {
        if (this._isSearching() || source?.panel !== this || !source.app || source.id === item.id)
            return false;
        if (item.children)
            return !item.children.some(child => child.id === source.id);
        // GNOME has one folder level; dropping inside a folder cannot nest it.
        return !this._folderId && Boolean(item.app);
    }

    _clearDropTarget() {
        this._dropTarget?.remove_style_pseudo_class('drop');
        this._dropTarget = null;
    }

    _configureItem(button, item, size) {
        button._delegate = {
            panel: this, id: item.id, app: item.app,
            getDragActor: () => {
                const icon = this._createIcon(item, size);
                this._dragIcon = icon;
                icon.connect('destroy', () => { this._dragIcon = null; });
                return icon;
            },
            getDragActorSource: () => button,
            handleDragOver: source => {
                this._clearDropTarget();
                if (!this._canDrop(source, item))
                    return DND.DragMotionResult.NO_DROP;
                this._dropTarget = button;
                button.add_style_pseudo_class('drop');
                return DND.DragMotionResult.MOVE_DROP;
            },
            acceptDrop: source => {
                this._clearDropTarget();
                if (!this._canDrop(source, item))
                    return false;
                return Boolean(this._edit(() => item.children ? this._folders.add(item.folderId, source.app)
                    : this._folders.create(item.app, source.app)));
            },
        };
        button.connect('destroy', () => {
            if (this._dropTarget === button)
                this._dropTarget = null;
        });
        if (!item.app || this._isSearching())
            return;
        const draggable = DND.makeDraggable(button, {restoreOnSuccess: false,
            dragActorMaxSize: size, dragActorOpacity: 200});
        button._grandCentralDesktopDraggable = draggable;
        draggable.connect('drag-begin', () => {
            this._dragging = this._suppressActivation = true;
            for (const actor of [...this._buttons, this.back, this._renameButton]) actor._grandCentralDesktopTooltip?.hide();
            this._dragMonitor = {dragMotion: event => {
                if (this._dropTarget && !this._dropTarget.contains(event.targetActor))
                    this._clearDropTarget();
                return DND.DragMotionResult.CONTINUE;
            }};
            DND.addDragMonitor(this._dragMonitor);
        });
        draggable.connect('drag-end', () => {
            this._clearDropTarget();
            if (this._dragMonitor)
                DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
            if (this._destroyed)
                return;
            // The DND engine still owns the source until this signal returns.
            this._life.idle(() => {
                this._dragging = this._suppressActivation = false;
                this.render();
            });
        });
    }

    render() {
        // Source/settings updates can arrive while DND owns an icon. Defer
        // rebuilding its actor until GNOME has finished/cancelled the drag.
        if (!this._dragging && !this._destroyed)
            super.render();
    }

    _createIcon(item, size) {
        if (!item.children)
            return super._createIcon(item, size);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const layout = new Clutter.GridLayout({column_homogeneous: true, row_homogeneous: true,
            column_spacing: 2 * scale, row_spacing: 2 * scale});
        const preview = new St.Widget({style_class: 'dp-app-folder', layout_manager: layout,
            width: size * scale, height: size * scale, x_align: Clutter.ActorAlign.CENTER});
        const iconSize = Math.max(4, Math.floor((size - 12) / 2));
        for (let index = 0; index < 4; index++) {
            const child = item.children[index];
            layout.attach(child ? this._createIcon(child, iconSize) : new St.Widget(),
                index % 2, Math.floor(index / 2), 1, 1);
        }
        return preview;
    }
}
