// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';
import {panelColors} from './model.js';
import {calculate, formatResult} from './calculator.js';
import {Lifetime} from './lifetime.js';

export class CalculatorPanel {
    constructor(settings) {
        this.id = 'calculator';
        this.settings = settings;
        this._memory = 0;
        this._solved = false;
        this.actor = new St.BoxLayout({name: 'desk-panel-calculator', style_class: 'dp-panel dp-calculator',
            orientation: Clutter.Orientation.VERTICAL, reactive: true});
        this._inputLife = new Lifetime();
        this.actor.connect('destroy', () => this._inputLife.destroy());
        const header = new St.BoxLayout({style_class: 'dp-header'});
        this.title = new St.Label({style_class: 'dp-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        header.add_child(this.title);
        this.actor.add_child(header);
        this.history = new St.Label({text: '', opacity: 0, style_class: 'dp-calculator-history'});
        this.history.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.history.clutter_text.set_single_line_mode(true);
        this.history.connect('notify::text', () => { this.history.opacity = this.history.text ? 255 : 0; });
        this.actor.add_child(this.history);
        this.entry = new St.Entry({hint_text: '0', can_focus: true, style_class: 'dp-calculator-display',
            accessible_name: 'Calculator expression'});
        this.actor.add_child(this.entry);
        ShellEntry.addContextMenu(this.entry);
        this._inputLife.connect(this.actor, 'captured-event', (_actor, event) => {
            if ((event.type() === Clutter.EventType.BUTTON_RELEASE && event.get_button() === 1) ||
                event.type() === Clutter.EventType.TOUCH_END)
                this._queueEntryFocus();
            return Clutter.EVENT_PROPAGATE;
        });
        this.entry.clutter_text.connect('activate', () => this.solve());
        this.entry.clutter_text.connect('text-changed', () => {
            this._solved = false;
            if (this._error) { this._error = false; this.history.text = ''; }
            this.entry.remove_style_class_name('dp-error');
        });
        this.entry.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this.clear();
                return Clutter.EVENT_STOP;
            }
            if (event.get_key_symbol() === Clutter.KEY_equal) {
                this.solve();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        const advancedLabel = new St.BoxLayout({style_class: 'dp-calc-advanced-label'});
        advancedLabel.add_child(new St.Label({text: 'Advanced'}));
        this._advancedIcon = new St.Icon({icon_name: 'pan-down-symbolic', icon_size: 12});
        advancedLabel.add_child(this._advancedIcon);
        this.advancedToggle = new St.Button({child: advancedLabel, toggle_mode: true, can_focus: true,
            x_align: Clutter.ActorAlign.END, accessible_name: 'Advanced calculator controls',
            style_class: 'dp-calc-advanced-toggle'});
        this.actor.add_child(this.advancedToggle);
        const keyButton = (label, style = '') => {
            const button = new St.Button({label, can_focus: true, x_expand: true, y_expand: true,
                accessible_name: ({'⌫': 'Backspace', '√': 'Square root', 'x²': 'Square', '=': 'Equals',
                    '1/x': 'Reciprocal', '±': 'Change sign', 'MC': 'Memory clear', 'MR': 'Memory recall',
                    'M+': 'Memory add', 'M−': 'Memory subtract'})[label] ?? label,
                style_class: `dp-calc-key ${style}`});
            button.connect('clicked', () => this.press(label));
            return button;
        };
        this.advancedKeys = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'dp-calc-advanced-keys', visible: false});
        for (const labels of [['MC', 'MR', 'M+', 'M−'], ['(', ')', '√', 'x²', '1/x']]) {
            const row = new St.BoxLayout({style_class: 'dp-calc-advanced-row'});
            for (const label of labels)
                row.add_child(keyButton(label, 'dp-calc-advanced-key'));
            this.advancedKeys.add_child(row);
        }
        this.actor.add_child(this.advancedKeys);
        const layout = new Clutter.GridLayout({column_homogeneous: true, row_homogeneous: true,
            column_spacing: 6, row_spacing: 6});
        this.keys = new St.Widget({layout_manager: layout, style_class: 'dp-calculator-keys',
            x_expand: true, y_expand: true});
        this.actor.add_child(this.keys);
        const labels = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−',
            '1', '2', '3', '+', '⌫', '0', '.', '='];
        labels.forEach((label, i) => {
            const style = label === '=' ? 'dp-calc-equals' : ['÷', '×', '−', '+'].includes(label)
                ? 'dp-calc-operator' : '';
            const button = keyButton(label, style);
            layout.attach(button, i % 4, Math.floor(i / 4), 1, 1);
        });
        this.status = new St.Label({text: '', visible: false, style_class: 'dp-caption dp-calc-status'});
        this.status.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.actor.add_child(this.status);
        this.status.connect('notify::text', () => this._syncAdvanced());
        this.advancedToggle.connect('notify::checked', () => this._syncAdvanced());
        settings.bind('show-advanced', this.advancedToggle, 'checked', Gio.SettingsBindFlags.DEFAULT);
        this._syncAdvanced();
    }

    _queueEntryFocus() {
        if (this._focusQueued)
            return;
        this._focusQueued = true;
        // Let the clicked control finish before returning keyboard input to the display.
        this._inputLife.idle(() => {
            this._focusQueued = false;
            if (this.actor.is_mapped() && global.stage.get_key_focus() !== this.entry.clutter_text)
                this.entry.grab_key_focus();
        });
    }

    _syncAdvanced() {
        this.advancedKeys.visible = this.advancedToggle.checked;
        this._advancedIcon.icon_name = this.advancedToggle.checked ? 'pan-up-symbolic' : 'pan-down-symbolic';
        this.status.visible = this.advancedToggle.checked && Boolean(this.status.text);
    }

    updateStyle() {
        const colors = panelColors(this.settings.get_string('background-color'));
        this.title.text = this.settings.get_string('title');
        this.actor.set_style(`background-color: ${colors.background}; color: ${colors.foreground};
            border-color: ${colors.border}; border-radius: ${this.settings.get_int('corner-radius')}px;`);
        this.history.set_style(`color: ${colors.muted};`);
        this.status.set_style(`color: ${colors.muted};`);
    }

    setGeometry(box) {
        this.actor.set_position(box.x, box.y);
        this.actor.set_size(box.width, box.height);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        if (box.height < 520 * scale || box.width < 300 * scale)
            this.actor.add_style_class_name('dp-calculator-compact');
        else
            this.actor.remove_style_class_name('dp-calculator-compact');
    }

    clear() {
        this.entry.set_text('');
        this.history.text = '';
        this.entry.grab_key_focus();
    }

    solve() {
        try {
            const expression = this.entry.get_text() || '0';
            const result = formatResult(calculate(expression));
            this.entry.set_text(result);
            this.history.text = `${expression} =`;
            this._solved = true;
            this.entry.clutter_text.set_cursor_position(-1);
        } catch (e) {
            this._error = true;
            this.history.text = e.message;
            this.entry.add_style_class_name('dp-error');
        }
        this.entry.grab_key_focus();
    }

    press(key) {
        if (key === '=') {
            this.solve();
            return;
        }
        const text = this.entry.get_text();
        if (key === 'C') {
            this.clear();
            return;
        }
        try {
            if (key === 'MC') {
                this._memory = 0;
                this.status.text = 'Memory cleared';
            } else if (key === 'MR') {
                this.entry.set_text(formatResult(this._memory));
            } else if (key === 'M+' || key === 'M−') {
                const next = this._memory + (key === 'M+' ? 1 : -1) * calculate(text || '0');
                if (!Number.isFinite(next))
                    throw new Error('Memory is outside the supported range');
                this._memory = next;
                this.status.text = `Memory: ${formatResult(this._memory)}`;
            } else if (key === '⌫') {
                this.entry.clutter_text.delete_selection() || this.entry.clutter_text.delete_text(
                    Math.max(0, (this.entry.clutter_text.cursor_position < 0 ? text.length : this.entry.clutter_text.cursor_position) - 1),
                    this.entry.clutter_text.cursor_position < 0 ? text.length : this.entry.clutter_text.cursor_position);
            } else if (['√', 'x²', '1/x', '±'].includes(key)) {
                const expression = text || '0';
                this.entry.set_text(({'√': `sqrt(${expression})`, 'x²': `(${expression})^2`,
                    '1/x': `1/(${expression})`, '±': `-(${expression})`})[key]);
                this.solve();
                return;
            } else {
                if (this._solved && /^[\d.]$/.test(key))
                    this.entry.set_text('');
                this.entry.clutter_text.delete_selection();
                this.entry.clutter_text.insert_text(key, this.entry.clutter_text.cursor_position);
            }
        } catch (e) {
            this._error = true;
            this.history.text = e.message;
        }
        this.entry.grab_key_focus();
    }

    destroy() {
        this.actor.destroy();
    }
}
