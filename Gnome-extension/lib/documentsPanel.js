// SPDX-License-Identifier: GPL-3.0-or-later
import {Panel} from './panel.js';
import {searchNames} from './nameSearch.js';
import {PanelSearch} from './searchEntry.js';

export class DocumentsPanel extends Panel {
    constructor(settings, activate, restored = null) {
        super('documents', settings, activate);
        this._allItems = [];
        this._sourceMessage = 'Loading…';
        this.search = new PanelSearch(this, {
            hint: 'Search recent files…', accessibleName: 'Search recent files by name',
            changed: () => this.setItems(this._allItems, this._sourceMessage)}, restored);
        this.searchEntry = this.search.entry;
    }

    _isSearching() {
        return this.search.state.active;
    }

    setItems(items, message) {
        this._allItems = items;
        this._sourceMessage = message;
        const matches = this._isSearching()
            ? searchNames(items, this.search.state.query, item => `${item.label} ${item.filename ?? ''}`) : items;
        // Preserve privacy/source errors rather than disguising them as an
        // unmatched query. Search only receives the already eligible list.
        super.setItems(matches, this._isSearching() && items.length ? 'No matching files.' : message);
    }

    _gridHeightAdjustment() {
        return this.search.height;
    }

    captureNavigation() {
        return this.search.state.capture();
    }
}
