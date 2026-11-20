import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, screenshot} from '../helpers.js';

export const calculatorScenarios = {
    async checkCalculator(extension, assert) {
        extension._next.emit('clicked', 1);
        await pause(300);
        assert(extension._panels.filter(p => p.actor.visible).map(p => p.id).join(',') === 'desktop,documents,calculator', 'outer arrow reveals calculator');
        const calculator = extension._panels[3];
        const basicButtons = calculator.keys.get_children();
        const basic = label => basicButtons.find(button => button.label === label);
        const advanced = label => calculator.advancedKeys.get_children().flatMap(row => row.get_children())
            .find(button => button.label === label);
        assert(basicButtons.map(button => button.label).join() === 'C,±,%,÷,7,8,9,×,4,5,6,−,1,2,3,+,⌫,0,.,=',
            'calculator has the simplified twenty-button keypad');
        assert(!calculator.advancedKeys.visible && calculator.history.visible && calculator.history.opacity === 0 && !calculator.status.visible,
            'calculator reserves a transparent history line with advanced controls hidden');
        const keyGeometry = () => basicButtons.map(button => [...button.get_transformed_position(), ...button.get_transformed_size()]);
        const initialKeyGeometry = JSON.stringify(keyGeometry());
        for (const key of ['2', '0', '0', '×', '1', '0', '%'])
            basic(key).emit('clicked', 1);
        basic('=').emit('clicked', 1);
        assert(calculator.entry.get_text() === '20', 'calculator buttons produce result');
        await pause(150);
        assert(calculator.history.opacity === 255 && JSON.stringify(keyGeometry()) === initialKeyGeometry,
            'showing equation history does not move or resize calculator buttons');
        calculator.clear();
        await pause(100);
        assert(calculator.history.opacity === 0 && JSON.stringify(keyGeometry()) === initialKeyGeometry,
            'clearing equation history preserves the same keypad geometry');
        const seat = global.stage.get_context().get_backend().get_default_seat();
        const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        let releaseEvent;
        const capture = global.stage.connect('captured-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_RELEASE && event.get_button() === 1) {
                releaseEvent = event.copy();
                return Clutter.EVENT_STOP;
            }
            if (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === 1)
                return Clutter.EVENT_STOP;
            return Clutter.EVENT_PROPAGATE;
        });
        try {
            // Capture a real native event without relying on headless pointer positioning.
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.PRESSED);
            await pause(50);
            pointer.notify_button(GLib.get_monotonic_time(), 1, Clutter.ButtonState.RELEASED);
            await pause(150);
        } finally {
            global.stage.disconnect(capture);
            pointer.run_dispose();
        }
        assert(Boolean(releaseEvent), 'calculator focus test captures a native primary-button release');
        Main.overview.hide();
        await pause(200);
        calculator.advancedToggle.grab_key_focus();
        const propagated = calculator.actor.emit('captured-event', releaseEvent);
        await pause(100);
        assert(propagated === Clutter.EVENT_PROPAGATE && global.stage.get_key_focus() === calculator.entry.clutter_text,
            'captured calculator clicks focus the expression entry without consuming button actions');
        calculator.entry.set_text('12345');
        calculator.entry.clutter_text.set_cursor_position(2);
        calculator.actor.emit('captured-event', releaseEvent);
        await pause(100);
        assert(calculator.entry.clutter_text.cursor_position === 2,
            'click focus preserves the caret when the entry is already focused');
        calculator.advancedToggle.checked = true;
        calculator.advancedToggle.grab_key_focus();
        calculator.actor.emit('captured-event', releaseEvent);
        await pause(100);
        assert(calculator.advancedKeys.visible && global.stage.get_key_focus() === calculator.entry.clutter_text,
            'Advanced controls remain expanded when click focus returns to the entry');
        calculator.advancedToggle.checked = false;
        calculator.entry.set_text('200*10%');
        calculator.solve();
        await pause(100);
        await screenshot('calculator');
        calculator.advancedToggle.checked = true;
        assert(calculator.advancedKeys.visible && calculator.settings.get_boolean('show-advanced'),
            'Advanced toggle reveals the controls and saves its state');
        advanced('M+').emit('clicked', 1);
        basic('C').emit('clicked', 1);
        advanced('MR').emit('clicked', 1);
        assert(calculator.entry.get_text() === '20', 'calculator memory round trip');
        assert(calculator.status.visible && calculator.status.text.includes('20'), 'advanced controls show memory status when used');
        calculator.advancedToggle.checked = false;
        assert(!calculator.advancedKeys.visible && !calculator.status.visible && calculator._memory === 20,
            'collapsing Advanced keeps memory and hides supplemental controls');
        calculator.entry.set_text('9');
        calculator.entry.clutter_text.set_cursor_position(-1);
        basic('±').emit('clicked', 1);
        assert(calculator.entry.get_text() === '-9', 'basic sign control remains available');
        basic('C').emit('clicked', 1);
        basic('1').emit('clicked', 1);
        basic('2').emit('clicked', 1);
        basic('⌫').emit('clicked', 1);
        assert(calculator.entry.get_text() === '1', 'basic backspace button edits the expression');
        calculator.advancedToggle.checked = true;
        calculator.entry.set_text('9');
        advanced('√').emit('clicked', 1);
        assert(calculator.entry.get_text() === '3', 'advanced square-root button remains functional');
        calculator.entry.set_text('(8 + 4) / 3');
        calculator.entry.clutter_text.emit('activate');
        assert(calculator.entry.get_text() === '4', 'calculator keyboard activation');
        calculator.entry.set_text('1/0');
        calculator.solve();
        assert(calculator.history.text.includes('zero'), 'calculator shows useful errors');
        await pause(100);
        const errorGeometry = JSON.stringify(keyGeometry());
        calculator.clear();
        await pause(100);
        assert(JSON.stringify(keyGeometry()) === errorGeometry, 'error history also reserves the same keypad space');
        calculator.entry.set_text('sqrt(144) + 7^2');
        calculator.solve();
        assert(calculator.entry.get_text() === '61', 'calculator scientific operations');
        await pause(300);
        await screenshot('calculator-advanced');
        const panelHeight = extension._settings.get_int('panel-height');
        extension._settings.set_int('panel-height', 420);
        await pause(150);
        const insidePanel = actor => {
            const [x, y] = actor.get_transformed_position();
            const [width, height] = actor.get_transformed_size();
            const [px, py] = calculator.actor.get_transformed_position();
            return x >= px && y >= py && x + width <= px + calculator.actor.width + 1 &&
                y + height <= py + calculator.actor.height + 1;
        };
        assert([...basicButtons, ...calculator.advancedKeys.get_children().flatMap(row => row.get_children()), calculator.status]
            .every(insidePanel), 'expanded calculator controls fit the minimum panel height');
        extension._settings.set_int('panel-height', panelHeight);
        calculator.settings.set_boolean('show-advanced', false);
        assert(!calculator.advancedToggle.checked && !calculator.advancedKeys.visible,
            'Advanced toggle follows external settings changes');
    },
};
