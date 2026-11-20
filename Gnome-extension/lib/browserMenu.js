// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import WebKit from 'gi://WebKit2?version=4.1';
import {validHomeUrl} from './model.js';

export function polishBrowserMenu(menu, uri, openLink) {
    const allowed = new Set(['COPY', 'CUT', 'PASTE', 'DELETE', 'SELECT_ALL', 'OPEN_LINK',
        'COPY_LINK_TO_CLIPBOARD'].map(name => WebKit.ContextMenuAction[name]));
    for (const item of [...menu.get_items()]) {
        if (!allowed.has(item.get_stock_action())) menu.remove(item);
    }
    if (uri && validHomeUrl(uri) && !menu.get_items().some(item => item.get_stock_action() === WebKit.ContextMenuAction.OPEN_LINK)) {
        const open = new Gio.SimpleAction({name: 'open-link'});
        open.connect('activate', () => openLink(uri));
        menu.prepend(WebKit.ContextMenuItem.new_from_gaction(open, 'Open Link', null));
    }
    if (menu.get_items().length) menu.append(WebKit.ContextMenuItem.new_separator());
}
