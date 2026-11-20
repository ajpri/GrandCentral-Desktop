import GLib from 'gi://GLib';
import {AppFolders} from '../lib/appFolders.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory')
    throw new Error('Run with GSETTINGS_BACKEND=memory; this test changes GNOME app folders.');
const folders = new AppFolders();
let count = 0;
function check(value, label) {
    if (!value) throw new Error(label);
    count++;
}
const app = id => ({get_id: () => `${id}.desktop`, get_app_info: () => ({get_categories: () => 'Utility;'})});
const a = app('alpha'), b = app('beta'), c = app('charlie');
folders.settings.set_strv('folder-children', []);
check(!folders.create(a, a), 'self-drop does not create a folder');
const id = folders.create(a, b);
check(folders.settings.get_strv('folder-children').includes(id), 'creation publishes a shared GNOME folder');
check(folders.folder(id).get_strv('apps').join() === 'alpha.desktop,beta.desktop', 'created folder has both apps');
check(folders.rename(id, '  My apps  '), 'folder can be renamed');
check(folders.folder(id).get_string('name') === 'My apps' && !folders.folder(id).get_boolean('translate'), 'rename trims and disables translation');
check(!folders.rename(id, '   ') && folders.folder(id).get_string('name') === 'My apps', 'blank names preserve the original');
folders.add(id, a);
check(folders.folder(id).get_strv('apps').length === 2, 'adding an existing app does not duplicate it');
const other = folders.create(c, a);
check(folders.folder(id).get_strv('apps').join() === 'beta.desktop', 'moving an app removes previous explicit membership');
folders.add(other, b);
check(!folders.settings.get_strv('folder-children').includes(id), 'moving the final app removes the empty folder');
check(folders.folder(other).get_strv('apps').length === 3, 'existing folder accepts another app');
folders.remove(a);
check(!folders.folder(other).get_strv('apps').includes(a.get_id()), 'moving out removes explicit membership');
const category = 'Category';
folders.settings.set_strv('folder-children', [...folders.settings.get_strv('folder-children'), category]);
folders.folder(category).set_strv('categories', ['Utility']);
folders.add(other, a);
check(folders.folder(category).get_strv('excluded-apps').includes(a.get_id()), 'category membership is excluded when moving to another folder');
folders.add(category, a);
check(!folders.folder(category).get_strv('excluded-apps').includes(a.get_id()), 'adding back clears category exclusion');
check(!folders.folder(other).get_strv('apps').includes(a.get_id()), 'moving to category folder removes previous folder membership');
check(!folders.add('missing', a) && !folders.rename('missing', 'Name'), 'stale folder operations cannot recreate deleted folders');
const before = folders.folder(category).get_string('name');
const original = folders.folder.bind(folders);
folders.folder = id => {
    const setting = original(id);
    setting.is_writable = key => key !== 'translate';
    return setting;
};
let failed = false;
try { folders.rename(category, 'Blocked'); } catch { failed = true; }
check(failed && original(category).get_string('name') === before, 'locked settings are checked before any write');
const failing = original(category);
const setValue = failing.set_value.bind(failing);
let failOnce = true;
failing.set_value = (key, value) => {
    if (key === 'translate' && failOnce) {
        failOnce = false;
        return false;
    }
    return setValue(key, value);
};
folders.folder = id => id === category ? failing : original(id);
failed = false;
try { folders.rename(category, 'Must roll back'); } catch { failed = true; }
check(failed && original(category).get_string('name') === before, 'a later write failure rolls back the earlier name change');
print(`Passed ${count} app-folder checks.`);
