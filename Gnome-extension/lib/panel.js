// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {gridGeometry, pageItems, panelColors} from './model.js';
import {Tooltip, clippedText} from './tooltip.js';

function iconButton(iconName, name, callback) {
    const button = new St.Button({style_class: 'dp-small-button', can_focus: true,
        accessible_name: name, child: new St.Icon({icon_name: iconName, icon_size: 16})});
    button.connect('clicked', callback);
    new Tooltip(button, name);
    return button;
}

export class Panel {
    constructor(id, settings, activate) {
        this.id = id;
        this.settings = settings;
        this._activate = activate;
        this._items = [];
        this._message = 'Loading…';
        this._page = 0;
        this._buttons = [];
        this.actor = new St.BoxLayout({name: `desk-panel-${id}`, style_class: 'dp-panel',
            orientation: Clutter.Orientation.VERTICAL, reactive: true});
        this.header = new St.BoxLayout({style_class: 'dp-header'});
        this.title = new St.Label({style_class: 'dp-title', x_expand: true,
            y_align: Clutter.ActorAlign.CENTER});
        this.header.add_child(this.title);
        this.actor.add_child(this.header);
        this.body = new St.Widget({x_expand: true, y_expand: true,
            layout_manager: new Clutter.BinLayout()});
        this.actor.add_child(this.body);
        this.footer = new St.BoxLayout({style_class: 'dp-footer'});
        this.previous = iconButton('go-previous-symbolic', 'Previous icon page', () => this.turn(-1));
        this.next = iconButton('go-next-symbolic', 'Next icon page', () => this.turn(1));
        this.pageLabel = new St.Label({x_expand: true, style_class: 'dp-caption',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        this.footer.add_child(this.previous);
        this.footer.add_child(this.pageLabel);
        this.footer.add_child(this.next);
        this.actor.add_child(this.footer);
        this.actor.connect('scroll-event', (_actor, event) => {
            const direction = event.get_scroll_direction();
            if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.LEFT)
                this.turn(-1);
            else if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.RIGHT)
                this.turn(1);
            else if (direction === Clutter.ScrollDirection.SMOOTH) {
                const [dx, dy] = event.get_scroll_delta();
                this._scroll = (this._scroll ?? 0) + (Math.abs(dx) > Math.abs(dy) ? dx : dy);
                if (Math.abs(this._scroll) >= 1) {
                    this.turn(Math.sign(this._scroll));
                    this._scroll = 0;
                }
            }
            return Clutter.EVENT_STOP;
        });
        this.actor.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Page_Down)
                this.turn(1);
            else if (event.get_key_symbol() === Clutter.KEY_Page_Up)
                this.turn(-1);
            else
                return Clutter.EVENT_PROPAGATE;
            return Clutter.EVENT_STOP;
        });
    }

    updateStyle() {
        this.title.text = this.settings.get_string('title');
        const colors = panelColors(this.settings.get_string('background-color'));
        this.colors = colors;
        this.actor.set_style(`background-color: ${colors.background}; color: ${colors.foreground};
            border-color: ${colors.border}; border-radius: ${this.settings.get_int('corner-radius')}px;`);
        this.pageLabel.set_style(`color: ${colors.muted};`);
        this.render();
    }

    setGeometry(box) {
        this.actor.set_position(box.x, box.y);
        this.actor.set_size(box.width, box.height);
        this._geometry = box;
        this.render();
    }

    setItems(items, message) {
        this._items = items;
        this._message = message;
        if (this._restorePage !== undefined) {
            this._page = this._restorePage;
            delete this._restorePage;
        }
        this.render();
    }

    turn(delta) {
        const old = this._page;
        this._page = Math.max(0, Math.min(this._page + delta, (this._pageCount ?? 1) - 1));
        if (this._page !== old) {
            this._turning = true;
            this.render();
            this._turning = false;
            const focus = global.stage.get_key_focus();
            if (!focus || !this.body.contains(focus)) this._buttons[0]?.grab_key_focus();
        }
    }

    _createIcon(item, size) {
        return item.app ? item.app.create_icon_texture(size)
            : new St.Icon({gicon: item.gicon, icon_size: size,
                fallback_icon_name: 'text-x-generic', x_align: Clutter.ActorAlign.CENTER});
    }

    render() {
        if (!this._geometry || !this.colors)
            return;
        const focus = global.stage.get_key_focus();
        const focusedIndex = global.display.focus_window ? -1 : this._buttons.findIndex(button => button === focus || (focus && button.contains(focus)));
        const focused = this._buttons[focusedIndex]?._grandCentralDesktopItem;
        const preservingPage = this._page === this._renderedPage && !this._turning;
        const identity = item => item?.id ?? item?.uri;
        const wanted = focused ? this._items.findIndex(item => identity(item) === identity(focused)) : -1;
        this.body.destroy_all_children();
        this._buttons = [];
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const geometry = gridGeometry(this._geometry.width / scale,
            this._geometry.height / scale - (this._gridHeightAdjustment?.() ?? 0), {
            columns: this.settings.get_int('columns'), rows: this.settings.get_int('rows'),
            iconSize: this.settings.get_int('icon-size'), showLabels: this.settings.get_boolean('show-labels'),
        });
        if (focused && preservingPage && wanted >= 0) this._page = Math.floor(wanted / geometry.capacity);
        const page = pageItems(this._items, this._page, geometry.capacity);
        this._page = page.page;
        this._renderedPage = page.page;
        this._pageCount = page.count;
        this.previous.reactive = this.previous.can_focus = page.page > 0;
        this.next.reactive = this.next.can_focus = page.page < page.count - 1;
        this.previous.opacity = page.count > 1 ? this.previous.reactive ? 255 : 60 : 0;
        this.next.opacity = page.count > 1 ? this.next.reactive ? 255 : 60 : 0;
        this.pageLabel.text = this._items.length ? `${page.page + 1} / ${page.count}  ·  ${this._items.length} ${this._items.length === 1 ? 'item' : 'items'}` : '0 items';
        if (!this._items.length) {
            const empty = new St.Label({text: this._message, style_class: 'dp-empty',
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
                style: `color: ${this.colors.muted};`});
            empty.clutter_text.line_wrap = true;
            empty.clutter_text.line_alignment = Pango.Alignment.CENTER;
            this.body.add_child(empty);
            return;
        }
        const layout = new Clutter.GridLayout({column_homogeneous: true, row_homogeneous: true,
            column_spacing: 4, row_spacing: 4});
        const grid = new St.Widget({layout_manager: layout, x_expand: true, y_expand: true});
        this.body.add_child(grid);
        for (let i = 0; i < geometry.capacity; i++) {
            const item = page.items[i];
            if (!item) {
                layout.attach(new St.Widget(), i % geometry.columns, Math.floor(i / geometry.columns), 1, 1);
                continue;
            }
            const content = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
                style_class: 'dp-item-content'});
            content.add_child(this._createIcon(item, geometry.icon));
            let label;
            if (this.settings.get_boolean('show-labels')) {
                label = new St.Label({text: item.label, style_class: 'dp-item-label',
                    width: Math.max(16, (this._geometry.width - 48 * scale) / geometry.columns - 12 * scale),
                    x_align: Clutter.ActorAlign.CENTER});
                label.clutter_text.line_wrap = true;
                label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
                label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                label.clutter_text.line_alignment = Pango.Alignment.CENTER;
                content.add_child(label);
            }
            const button = new St.Button({child: content, style_class: 'dp-item',
                can_focus: true, x_expand: true, y_expand: true, accessible_name: item.label});
            button._grandCentralDesktopItem = item;
            this._buttons.push(button);
            new Tooltip(button, item.label, () => this._dragging || (label && !clippedText(label)));
            button.connect('notify::hover', () => button.set_style(button.hover ? `background-color: ${this.colors.hover};` : ''));
            button.connect('clicked', () => this._activate(item));
            this._configureItem?.(button, item, geometry.icon);
            layout.attach(button, i % geometry.columns, Math.floor(i / geometry.columns), 1, 1);
        }
        if (focused && this.actor.is_mapped()) {
            const target = preservingPage && wanted >= 0 ? wanted % geometry.capacity : Math.min(focusedIndex, this._buttons.length - 1);
            this._buttons[target]?.grab_key_focus();
        }
    }

    destroy() {
        this.actor.destroy();
    }
}
