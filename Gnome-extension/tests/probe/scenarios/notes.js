import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, pressKey, screenshot, output} from '../helpers.js';

export const notesScenarios = {
    async checkNotes(runtime, assert) {
        let notes = runtime.panel('notes');
        const start = runtime._start;
        runtime._start = 5;
        runtime._layout();
        await pause(100);
        assert(notes.actor.visible && notes.title.text === 'Quick Notes' && notes.editorScroll.visible,
            'Quick Notes opens as a single centered-title editor panel');
        assert(!notes.entry.clutter_text.single_line_mode && !notes.entry.clutter_text.activatable && notes.entry.menu,
            'note editor supports multiline text and native Copy/Paste');
        assert(runtime._contextActions.forActor(notes.entry.clutter_text) === null,
            'desktop context handling preserves the note editor native menu');
        const pointer = global.stage.get_context().get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const releases = new Map();
        const capture = global.stage.connect('captured-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_RELEASE) releases.set(event.get_button(), event.copy());
            if ([Clutter.EventType.BUTTON_PRESS, Clutter.EventType.BUTTON_RELEASE].includes(event.type()))
                return Clutter.EVENT_STOP;
            return Clutter.EVENT_PROPAGATE;
        });
        try {
            for (const button of [1, 3]) {
                pointer.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.PRESSED);
                await pause(40);
                pointer.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.RELEASED);
                await pause(40);
            }
        } finally {
            global.stage.disconnect(capture);
            pointer.run_dispose();
        }
        assert(releases.has(1) && releases.has(3), 'note focus tests capture real primary and secondary release events');
        Main.overview.hide();
        await pause(100);
        notes.entry.set_text('');
        notes.fileButton.grab_key_focus();
        const propagated = notes.editorScroll.emit('captured-event', releases.get(1));
        await pause(100);
        assert(propagated === Clutter.EVENT_PROPAGATE && global.stage.get_key_focus() === notes.entry.clutter_text,
            'clicking the empty editor focuses text without a Preview/Edit workaround or consuming pointer input');
        await pressKey(Clutter.KEY_a);
        assert(notes.entry.get_text() === 'a', 'native typing reaches the editor after its click-focus handler');
        notes.entry.set_text('12345');
        notes.entry.clutter_text.set_cursor_position(2);
        notes.entry.clutter_text.set_selection_bound(4);
        notes.editorScroll.emit('captured-event', releases.get(1));
        await pause(60);
        assert(notes.entry.clutter_text.cursor_position === 2 && notes.entry.clutter_text.selection_bound === 4,
            'click focus preserves the editor caret and selection');
        notes.fileButton.grab_key_focus();
        notes.editorScroll.emit('captured-event', releases.get(3));
        await pause(60);
        assert(global.stage.get_key_focus() === notes.fileButton, 'right-click leaves focus and native clipboard routing alone');
        notes.editorScroll.emit('captured-event', releases.get(1));
        notes.actor.hide();
        await pause(60);
        assert(global.stage.get_key_focus() !== notes.entry.clutter_text,
            'a hidden editor cannot steal focus from a pending click');
        runtime._layout();
        notes.entry.set_text('');
        await pause(80);
        const topLeft = notes.entry.clutter_text.get_transformed_position();
        const area = notes.editorScroll.get_transformed_position();
        assert(topLeft[0] >= area[0] && topLeft[0] - area[0] <= 20 &&
            topLeft[1] >= area[1] && topLeft[1] - area[1] <= 20,
            'the empty note starts at the top left of the editing area');
        assert(!notes.modeButton && !notes.previewLabel && !notes.previewScroll,
            'Quick Notes has one editor with no Preview or Edit controls');
        notes.settings.set_boolean('preview', true);
        assert(notes.editorScroll.visible && notes.entry.clutter_text.editable,
            'a previously saved preview preference cannot hide the plain-text editor');
        await screenshot('quick-notes-empty');
        const source = '# My note\n\n**Bold** and *italic*\n- [ ] First task\n- [x] Done\n\n[Example](https://example.com/)\n\n```\n<raw>& code\n```';
        notes.entry.set_text(source);
        notes.entry.grab_key_focus();
        notes.entry.clutter_text.set_cursor_position(-1);
        await pressKey(Clutter.KEY_Return);
        assert(notes.entry.get_text() === `${source}\n`, `Return inserts a newline instead of activating the note: ${JSON.stringify(notes.entry.get_text())}`);
        await pause(450);
        const content = notes.entry.get_text();
        assert(notes.status.text === 'Saved' && !notes.store.dirty &&
            new TextDecoder().decode(notes.store.file.load_contents(null)[1]) === content,
            'note edits automatically save as a lossless local text file');
        assert((notes.store.file.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o077) === 0,
            'the saved note is private to the user');
        await screenshot('quick-notes-edit');
        assert(runtime._contextActions.forActor(notes.actor).map(action => action.label).join() === 'Copy Note,Load from File…,Export to File…',
            'note background offers copy and file actions without mode switching');
        const afterSave = notes.entry.clutter_text.get_transformed_position();
        assert(JSON.stringify(afterSave) === JSON.stringify(topLeft),
            'typing and autosave keep the first line at the same top-left position');
        assert(notes.entry.get_text().includes('**Bold**') && notes.entry.get_text().includes('<raw>'),
            'formatting characters and markup remain literal editable text');
        const originalFont = notes.settings.get_int('font-size');
        const smallFont = notes.entry.get_theme_node().get_font().get_size();
        const cursor = notes.entry.clutter_text.cursor_position;
        notes.settings.set_int('font-size', 24);
        await pause(100);
        assert(notes.entry.get_theme_node().get_font().get_size() > smallFont && notes.entry.get_text() === content &&
            notes.entry.clutter_text.cursor_position === cursor && global.stage.get_key_focus() === notes.entry.clutter_text,
            'font size changes the rendered editor live without replacing text, caret, or focus');
        notes.settings.set_int('font-size', 8);
        await pause(60);
        assert(notes.entry.get_theme_node().get_font().get_size() < smallFont,
            'the minimum font size is applied to the actual editor');
        notes.settings.set_int('font-size', originalFont);
        notes.fileButton.grab_key_focus();
        await pause(600);
        const tip = notes._fileTooltip.label;
        const [tipX, tipY] = tip.get_transformed_position();
        assert(tip.visible && tip.text === 'Load or export note' && !tip.reactive &&
            tipX >= 0 && tipY >= 0 && tipX + tip.width <= global.stage.width && tipY + tip.height <= global.stage.height,
            'file-button tooltip describes load/export, stays onscreen, and cannot intercept clicks');
        await screenshot('quick-notes-tooltip');
        notes.fileButton.emit('clicked', 1);
        assert(notes.fileMenu.isOpen && !tip.visible, 'opening the note file menu hides its tooltip');
        notes.fileMenu.close();
        notes.entry.grab_key_focus();
        assert(!tip.visible && notes._fileTooltip._timer === 0, 'leaving the file button hides its tooltip and cancels delayed display');
        const height = runtime._settings.get_int('panel-height');
        const width = runtime._settings.get_int('panel-width');
        runtime._settings.set_int('panel-width', 220);
        runtime._settings.set_int('panel-height', 420);
        notes.entry.set_text(Array.from({length: 80}, (_, i) => `Line ${i + 1}: a longer note that wraps`).join('\n'));
        await pause(180);
        assert(notes.editorScroll.vadjustment.upper > notes.editorScroll.vadjustment.page_size &&
            notes.fileButton.get_transformed_position()[1] + notes.fileButton.height <= notes.actor.y + notes.actor.height,
            'long notes scroll inside the smallest panel while controls stay visible');
        notes.settings.set_string('background-color', '#f6f5f4');
        assert(notes.actor.get_style().includes('#181818') && notes.entry.get_style().includes('#181818'),
            'notes adapt editor contrast to the selected panel color');
        const textBeforeReset = notes.entry.get_text();
        for (const key of notes.settings.settings_schema.list_keys()) notes.settings.reset(key);
        assert(notes.entry.get_text() === textBeforeReset && !notes.settings.get_boolean('preview'),
            'resetting the notes panel restores appearance without erasing the note');
        runtime._settings.set_int('panel-width', width);
        runtime._settings.set_int('panel-height', height);
        notes.entry.set_text(content);
        runtime._turnPanels(1);
        runtime._turnPanels(-1);
        assert(notes.entry.get_text() === content, 'carousel navigation preserves the single note');
        const {NoteFileFixture} = await import(`file://${GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_ROOT')}/tests/noteFileFixture.js`);
        const {NoteFileChooser} = await import(`file://${runtime.path}/lib/noteFiles.js`);
        const fixture = new NoteFileFixture();
        await fixture.ready;
        notes.fileChooser.destroy();
        notes.fileChooser = new NoteFileChooser(fixture.name);
        const external = Gio.File.new_for_path(`${output}/chosen-note.md`);
        fixture.nextFile = external;
        await notes.fileAction(true);
        assert(new TextDecoder().decode(external.load_contents(null)[1]) === content && notes.entry.get_text() === content,
            'Export to File writes a selected text copy without changing the working note');
        assert(fixture.requests.at(-1).save && fixture.requests.at(-1).title === 'Export Note' &&
            fixture.requests.at(-1).options.current_name.deep_unpack() === 'note.txt',
            'note file menu uses the native SaveFile request and text filename');
        external.replace_contents('# Loaded file\n**External** text', null, false, Gio.FileCreateFlags.PRIVATE, null);
        await notes.fileAction(false);
        assert(notes.entry.get_text() === '# Loaded file\n**External** text' &&
            new TextDecoder().decode(notes.store.file.load_contents(null)[1]) === notes.entry.get_text(),
            'Load from File replaces the single note and automatically saves it locally');
        assert(notes.undoButton.visible, 'loading a replacement note offers a brief Undo action');
        notes.undoButton.emit('clicked', 1);
        assert(notes.entry.get_text() === content && !notes.undoButton.visible &&
            new TextDecoder().decode(notes.store.file.load_contents(null)[1]) === content,
            'Undo restores the previous note and its autosaved file');
        await notes.fileAction(false);
        notes.entry.set_text('Edited after loading'); notes.store.save();
        assert(!notes.undoButton.visible, 'editing a loaded note dismisses Undo rather than overwriting a newer draft');
        assert(new TextDecoder().decode(external.load_contents(null)[1]) === '# Loaded file\n**External** text',
            'editing a loaded note does not overwrite the external source file');
        fixture.nextFile = null;
        await notes.fileAction(false);
        assert(notes.entry.get_text() === 'Edited after loading', 'cancelling a note file dialog leaves the note unchanged');
        external.replace_contents(new Uint8Array([0xff]), null, false, Gio.FileCreateFlags.PRIVATE, null);
        fixture.nextFile = external;
        await notes.fileAction(false);
        assert(notes.entry.get_text() === 'Edited after loading' && notes.status.text === 'Couldn’t load file' &&
            new TextDecoder().decode(notes.store.file.load_contents(null)[1]) === 'Edited after loading',
            'invalid loaded files leave the current note and saved file intact');
        notes.settings.set_boolean('preview', true);
        notes.entry.set_text('Pending **final** draft');
        notes.settings.set_int('font-size', 19);
        fixture.hold = true;
        const requestCount = fixture.requests.length;
        const pendingDialog = notes.fileAction(true);
        for (let i = 0; i < 60 && fixture.requests.length === requestCount; i++) await pause(20);
        const store = notes.store;
        notes._queueEntryFocus();
        const inputLife = notes._life;
        runtime.disable();
        assert(notes._fileTooltip._timer === 0 && !notes._fileTooltip.label,
            'disabling removes the tooltip actor and pending timer');
        assert(inputLife._sources.size === 0, 'disabling cancels pending note focus and cursor scrolling');
        await pendingDialog;
        await pause(100);
        assert(fixture.closed === 1 && !notes.fileChooser._cancel && !notes._fileBusy,
            'disabling closes a pending native note file dialog and cancels its subscriptions');
        fixture.destroy();
        assert(store._timer === 0 && !store.dirty, 'disabling flushes a pending note and removes the save timer');
        runtime.enable();
        notes = runtime.panel('notes');
        assert(notes.entry.get_text() === 'Pending **final** draft' && notes.editorScroll.visible,
            'literal note contents survive disable and re-enable in the editor');
        assert(notes.settings.get_int('font-size') === 19 && notes.entry.get_style().includes('font-size: 19px'),
            'note font size persists through a runtime restart');
        notes.settings.set_int('font-size', originalFont);
        notes.settings.set_boolean('enabled', false);
        notes.settings.set_boolean('enabled', true);
        assert(notes.entry.get_text() === 'Pending **final** draft', 'hiding and showing Quick Notes retains its saved contents');
        runtime._start = start;
        runtime._layout();
    },
};
