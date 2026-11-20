// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';
import {SearchState} from './searchState.js';

// Keep both icons allocated even when Clear is inactive, so text/focus changes
// cannot change the preferred height of this permanent search row.
export class PanelSearch {
    constructor(panel, {hint, accessibleName, changed}, restored = null) {
        this.state = new SearchState(restored);
        const query = this.state.query;
        const entry = new St.Entry({style_class: 'dp-search', x_expand: true,
            can_focus: true, hint_text: hint, accessible_name: accessibleName});
        this.entry = entry;
        entry.set_text(query);
        entry.set_primary_icon(new St.Icon({icon_name: 'system-search-symbolic', icon_size: 16}));
        const clear = new St.Icon({icon_name: 'edit-clear-symbolic', icon_size: 16,
            accessible_name: 'Clear search', opacity: query ? 255 : 0});
        entry.set_secondary_icon(clear);
        ShellEntry.addContextMenu(entry);
        entry.connect('primary-icon-clicked', () => entry.grab_key_focus());
        entry.clutter_text.connect('text-changed', () => {
            clear.opacity = entry.get_text() ? 255 : 0;
            const page = this.state.change(entry.get_text(), panel._page);
            if (page === null)
                return;
            panel._page = page;
            delete panel._restorePage;
            changed();
        });
        entry.clutter_text.connect('activate', () => {
            if (this.state.active && panel._items.length)
                panel._activate(panel._items[0]);
        });
        entry.connect('secondary-icon-clicked', () => {
            entry.set_text('');
            entry.grab_key_focus();
        });
        panel.actor.insert_child_at_index(entry, 1);
        panel.actor.connect('key-press-event', (_actor, event) => {
            if ((event.get_state() & Clutter.ModifierType.CONTROL_MASK) &&
                [Clutter.KEY_f, Clutter.KEY_F].includes(event.get_key_symbol())) {
                entry.grab_key_focus();
                return Clutter.EVENT_STOP;
            }
            if (event.get_key_symbol() === Clutter.KEY_Escape && (this.state.query || this.focused)) {
                entry.set_text('');
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    get focused() {
        const focus = global.stage.get_key_focus();
        return Boolean(focus && this.entry.contains(focus));
    }

    get height() {
        return this.entry.visible
            ? this.entry.get_preferred_height(-1)[1] / St.ThemeContext.get_for_stage(global.stage).scale_factor : 0;
    }
}
