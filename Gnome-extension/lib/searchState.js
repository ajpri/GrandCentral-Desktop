// SPDX-License-Identifier: GPL-3.0-or-later

export class SearchState {
    constructor(restored = null) {
        this.query = restored?.query ?? '';
        this.browsePage = restored?.browsePage ?? 0;
    }

    get active() {
        return Boolean(this.query.trim());
    }

    change(query, page) {
        if (query === this.query)
            return null;
        const wasSearching = this.active;
        this.query = query;
        if (this.active) {
            if (!wasSearching)
                this.browsePage = page;
            return 0;
        }
        return wasSearching ? this.browsePage : page;
    }

    capture() {
        return {query: this.query, browsePage: this.browsePage};
    }
}
