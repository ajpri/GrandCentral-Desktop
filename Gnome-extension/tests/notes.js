import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {NoteStore, MAX_NOTE_BYTES} from '../lib/noteStore.js';
import {readNoteFile, exportNoteFile} from '../lib/noteFiles.js';

let count = 0;
function assert(ok, name) { if (!ok) throw new Error(name); count++; }
const pause = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
const root = GLib.dir_make_tmp('grand-central-notes-XXXXXX');
const file = Gio.File.new_for_path(`${root}/notes/note.md`);
const store = new NoteStore(file);
assert(store.load() && store.text === '', 'Missing notes start empty without an error');
store.setText('# One note\nUnicode 🎵\n');
assert(store.dirty && !file.query_exists(null), 'Edits are queued before the debounce');
await pause(450);
assert(!store.dirty && store.savedText === store.text, 'Typing automatically saves after a short pause');
assert(new TextDecoder().decode(file.load_contents(null)[1]) === store.text, 'Text is saved losslessly as UTF-8');
assert((file.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o777) === 0o600,
    'The note file is private to its user');
assert((file.get_parent().query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o777) === 0o700,
    'The notes folder is private');
store.setText('Final pending edit');
store.destroy();
const reopened = new NoteStore(file);
assert(reopened.load() && reopened.text === 'Final pending edit' && store._timer === 0,
    'Shutdown flushes pending text and cancels its timer');
file.set_attribute_uint32('unix::mode', 0o644, Gio.FileQueryInfoFlags.NONE, null);
reopened.setText('Another edit'); reopened.save();
const elsewhere = Gio.File.new_for_path(`${root}/elsewhere.md`);
await exportNoteFile(elsewhere, '# Exported\n🎵 exact Markdown');
assert(await readNoteFile(elsewhere) === '# Exported\n🎵 exact Markdown', 'External file load/export preserves literal text and Unicode');
await exportNoteFile(elsewhere, '');
assert(await readNoteFile(elsewhere) === '', 'Empty notes can be exported and loaded');
assert(reopened.text === 'Another edit', 'File exports leave the working note unchanged');
elsewhere.delete(null);
assert((file.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o077) === 0,
    'Replacing a note preserves private permissions');
reopened.setText('x'.repeat(MAX_NOTE_BYTES + 1));
assert(!reopened.save() && reopened.dirty && reopened.text.length > MAX_NOTE_BYTES &&
    new TextDecoder().decode(file.load_contents(null)[1]) === 'Another edit',
    'Oversized drafts stay in memory and leave the saved note intact');
reopened.setText(''); reopened.save();
assert(file.load_contents(null)[1].length === 0, 'Deleting all text saves an empty note');
reopened.destroy();
file.replace_contents(new Uint8Array([0xff]), null, false, Gio.FileCreateFlags.PRIVATE, null);
const invalid = new NoteStore(file);
assert(!invalid.load() && !invalid.ready && !invalid.save() && file.load_contents(null)[1][0] === 0xff,
    'Unreadable note contents cannot be silently overwritten');
invalid.destroy();
file.replace_contents(new TextEncoder().encode('Recovered'), null, false, Gio.FileCreateFlags.PRIVATE, null);
assert(invalid.load() && invalid.text === 'Recovered', 'Loading can be retried after the file is repaired');
invalid.destroy();
const directoryFile = new NoteStore(file.get_parent());
assert(!directoryFile.load() && !directoryFile.save(), 'A read failure disables saving without replacing existing paths');
directoryFile.destroy();
file.delete(null); file.get_parent().delete(null); Gio.File.new_for_path(root).delete(null);
print(`Passed ${count} Quick Notes assertions.`);
