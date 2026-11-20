import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const {default: Preferences} = await import('../prefs.js');
const app = new Adw.Application({application_id: 'local.GrandCentralDesktop.PreferencesTest'});
const output = GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_OUTPUT');
const checks = [];
let failure = null;
const pause = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
function descendants(widget) {
    const result = [];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        result.push(child, ...descendants(child));
    return result;
}
function assert(condition, message) {
    if (!condition) throw new Error(message);
    checks.push(message);
    print(message);
}
function controllers(widget) {
    const list = widget.observe_controllers();
    return Array.from({length: list.get_n_items()}, (_, i) => list.get_item(i));
}
async function capture(name) {
    GLib.file_set_contents(`${output}/preferences-capture-request.json`, JSON.stringify(name));
    for (let i = 0; i < 60; i++) {
        if (Gio.File.new_for_path(`${output}/${name}.png`).query_exists(null)) return;
        await pause(50);
    }
    throw new Error(`Screenshot was not captured: ${name}`);
}
app.connect('activate', () => {
    (async () => {
        const window = new Adw.PreferencesWindow({application: app});
        const settings = new Gio.Settings({schema_id: 'org.gnome.shell.extensions.grand-central-desktop'});
        settings.reset('panel-order');
        settings.set_int('panel-width', 333);
        settings.set_int('panel-height', 777);
        settings.set_int('monitor', 9);
        settings.get_child('desktop').set_string('background-color', '#202b3b');
        const saved = settings.get_strv('panel-order');
        const directory = Gio.File.new_for_path(`${GLib.getenv('XDG_DATA_HOME')}/gnome-shell/extensions/grand-central-desktop@grandcentral-desktop`);
        const preferences = new Preferences({uuid: 'grand-central-desktop@grandcentral-desktop', name: 'Grand Central Desktop',
            'settings-schema': 'org.gnome.shell.extensions.grand-central-desktop', dir: directory, path: directory.get_path()});
        await preferences.fillPreferencesWindow(window);
        window.present();
        assert(window.title === 'Grand Central Desktop Settings', 'Preferences uses the new extension name');
        await pause(150);
        const find = (Type, title) => descendants(window).find(widget => widget instanceof Type && widget.title === title);
        const tooltip = text => descendants(window).find(widget => widget.tooltip_text === text);
        const open = async title => { find(Adw.ActionRow, title).emit('activated'); await pause(180); };
        const back = async () => { assert(window.pop_subpage(), 'Back returns from a settings page'); await pause(180); };
        const panels = find(Adw.PreferencesGroup, 'Panels');
        const rows = () => descendants(panels).filter(widget => widget instanceof Adw.ActionRow);
        assert(window.get_visible_page().title === 'Overview' && descendants(window).filter(widget => widget instanceof Adw.PreferencesPage && widget.title).length === 1,
            'Settings opens to one overview instead of seven tabs');
        assert(rows().map(row => row.title).join() === 'Programs,Desktop,Documents,Calculator,Browser,All Apps,Quick Notes', 'Overview retains panel order');
        const programs = tooltip('Show Programs');
        programs.active = false;
        assert(!settings.get_child('programs').get_boolean('enabled'), 'Overview switches control panel visibility');
        settings.get_child('programs').reset('enabled');
        assert(programs.active, 'Overview switches follow external settings changes');
        const apps = rows().find(row => row.title === 'All Apps');
        const targetRow = rows().find(row => row.title === 'Desktop');
        const drop = controllers(targetRow).find(controller => controller instanceof Gtk.DropTarget);
        assert(drop.emit('drop', 'grand-central-desktop:apps', 0, 0), 'Panel rows accept an internal drag before another panel');
        assert(settings.get_strv('panel-order').slice(0, 3).join() === 'programs,apps,desktop', 'Drag reordering saves the new panel order');
        assert(rows()[1] === apps, 'Overview rows follow drag reordering immediately');
        const source = controllers(descendants(apps).find(widget => widget.name === 'reorder-apps'))
            .find(controller => controller instanceof Gtk.DragSource);
        assert(Boolean(source.emit('prepare', 0, 0)), 'Drag handle provides native GTK drag content');
        assert(!drop.emit('drop', 'external text', 0, 0), 'Unrelated dropped data cannot change panel order');
        settings.set_strv('panel-order', saved);
        const handle = descendants(apps).find(widget => widget.name === 'reorder-apps');
        const key = controllers(handle).find(controller => controller instanceof Gtk.EventControllerKey && controller.name === 'move-apps');
        key.emit('key-pressed', Gdk.KEY_Up, 0, Gdk.ModifierType.ALT_MASK);
        assert(settings.get_strv('panel-order').slice(-3).join() === 'apps,browser,notes', 'Alt+Up provides keyboard panel reordering');
        key.emit('key-pressed', Gdk.KEY_Down, 0, Gdk.ModifierType.ALT_MASK);
        assert(settings.get_strv('panel-order').join() === saved.join(), 'Alt+Down restores order');
        const notesHandle = descendants(rows().find(row => row.title === 'Quick Notes')).find(widget => widget.name === 'reorder-notes');
        const notesKeys = controllers(notesHandle).find(controller => controller.name === 'move-notes');
        notesKeys.emit('key-pressed', Gdk.KEY_Down, 0, Gdk.ModifierType.ALT_MASK);
        assert(settings.get_strv('panel-order').join() === saved.join(), 'Keyboard reordering respects list boundaries');
        await capture('preferences');

        await open('Desktop layout');
        const size = find(Adw.ComboRow, 'Panel size');
        assert(size.selected === 3 && settings.get_int('panel-width') === 333 && settings.get_int('panel-height') === 777,
            'Existing custom panel dimensions are preserved on opening settings');
        const exact = find(Adw.ExpanderRow, 'Advanced');
        assert(!exact.expanded, 'Exact dimensions and spacing start collapsed');
        size.selected = 0;
        assert(settings.get_int('panel-width') === 300 && settings.get_int('panel-height') === 520, 'Small size preset writes both dimensions');
        settings.set_int('panel-width', 349);
        assert(size.selected === 3, 'Custom dimension changes update the size selector');
        size.selected = 1;
        assert(settings.get_int('panel-width') === 420 && settings.get_int('panel-height') === 660, 'Medium size preset restores the standard dimensions');
        size.selected = 3;
        assert(exact.expanded && settings.get_int('panel-width') === 420, 'Custom reveals exact dimensions without changing them');
        const monitor = find(Adw.ComboRow, 'Monitor');
        await pause(100);
        assert(monitor.selected_item.string.includes('10 (unavailable)') && settings.get_int('monitor') === 9,
            'Unavailable saved monitor remains selected without resetting it');
        monitor.selected = 0;
        assert(settings.get_int('monitor') === -1, 'Primary display selection retains follow-primary behavior');
        assert(monitor.model.get_n_items() >= 2, 'Monitor selector discovers the active GNOME logical display');
        monitor.selected = 1;
        assert(settings.get_int('monitor') === -2, 'All monitors is available in the monitor selector');
        monitor.selected = 0;
        exact.expanded = false;
        await capture('preferences-layout');
        await back();

        await open('Calendar');
        const showCalendar = find(Adw.SwitchRow, 'Show calendar');
        showCalendar.active = false;
        assert(!settings.get_boolean('show-calendar'), 'Calendar visibility switch saves its setting');
        settings.reset('show-calendar');
        assert(showCalendar.active, 'Calendar visibility follows external settings changes');
        const dayRange = find(Adw.SpinRow, 'Days ahead');
        assert(dayRange.value === 1, 'Existing today-and-tomorrow preference remains one day ahead');
        dayRange.value = 0;
        assert(settings.get_int('calendar-days') === 1, 'Zero days ahead includes today');
        dayRange.value = 7;
        assert(settings.get_int('calendar-days') === 8, 'Days ahead adds the selected days after today');
        settings.set_int('calendar-days', 31);
        assert(dayRange.value === 30, 'Days ahead follows external settings changes');
        settings.reset('calendar-days');
        await back();

        tooltip('Customize Desktop').emit('clicked');
        await pause(180);
        const desktop = settings.get_child('desktop');
        const mounts = find(Adw.SwitchRow, 'Show mounted drives');
        mounts.active = true;
        assert(desktop.get_boolean('show-mounts'), 'Desktop content settings remain available');
        desktop.reset('show-mounts');
        assert(!mounts.active, 'Content settings follow external resets');
        assert(tooltip('Slate').has_css_class('selected'), 'Existing panel color is reflected in compact swatches');
        tooltip('Plum').emit('clicked');
        assert(desktop.get_string('background-color') === '#34243d', 'Compact color swatches change only their panel');
        desktop.set_string('background-color', '#123456');
        const color = tooltip('Custom color').rgba;
        assert(Math.round(color.red * 255) === 0x12, 'Custom color control follows external colors');
        const advanced = find(Adw.ExpanderRow, 'Advanced');
        assert(!advanced.expanded, 'Panel title, grid tuning, and reset start collapsed');
        advanced.expanded = true;
        const title = find(Adw.EntryRow, 'Panel title');
        title.text = 'My files'; title.emit('apply');
        assert(desktop.get_string('title') === 'My files', 'Advanced title customization remains functional');
        find(Adw.SpinRow, 'Icon columns').value = 6;
        assert(desktop.get_int('columns') === 6, 'Advanced icon-grid tuning remains functional');
        const reset = find(Adw.ActionRow, 'Reset this panel');
        descendants(reset).find(widget => widget instanceof Gtk.Button && widget.label === 'Reset').emit('clicked');
        assert(title.text === 'Desktop' && desktop.get_int('columns') === 4 && tooltip('GNOME dark').has_css_class('selected'),
            'Panel reset updates entry, grid, and color controls together');
        assert(settings.get_child('browser').get_string('background-color') === '#181818', 'Per-panel customization stays independent');
        await back();

        tooltip('Customize Quick Notes').emit('clicked');
        await pause(180);
        const notes = settings.get_child('notes');
        assert(find(Adw.ActionRow, 'Color') && !find(Adw.SpinRow, 'Icon size') && !find(Adw.SpinRow, 'Icon columns'),
            'Quick Notes settings show appearance without icon-grid controls');
        const fontSize = find(Adw.SpinRow, 'Font size');
        assert(fontSize?.value === 14, 'Quick Notes exposes the default font size on its main settings page');
        fontSize.value = 20;
        assert(notes.get_int('font-size') === 20, 'Quick Notes font size saves from its settings control');
        notes.set_int('font-size', 18);
        assert(fontSize.value === 18, 'Font-size control follows external settings changes');
        const noteFile = Gio.File.new_for_path(`${GLib.get_user_data_dir()}/grand-central-desktop/notes/note.md`);
        const savedNote = noteFile.query_exists(null) ? new TextDecoder().decode(noteFile.load_contents(null)[1]) : null;
        notes.set_boolean('preview', true);
        const notesAdvanced = find(Adw.ExpanderRow, 'Advanced');
        notesAdvanced.expanded = true;
        const resetNotes = find(Adw.ActionRow, 'Reset this panel');
        descendants(resetNotes).find(widget => widget instanceof Gtk.Button && widget.label === 'Reset').emit('clicked');
        assert(!notes.get_boolean('preview') && notes.get_string('title') === 'Quick Notes' && fontSize.value === 14,
            'Reset Quick Notes restores its default appearance');
        assert(savedNote === null || new TextDecoder().decode(noteFile.load_contents(null)[1]) === savedNote,
            'Reset Quick Notes never deletes or changes its saved text file');
        await capture('preferences-notes');
        await back();

        tooltip('Customize Browser').emit('clicked');
        await pause(180);
        const browser = settings.get_child('browser');
        const home = find(Adw.EntryRow, 'Home URL');
        const originalHome = browser.get_string('home-url');
        home.text = 'javascript:alert(1)'; home.emit('apply');
        assert(home.has_css_class('error') && browser.get_string('home-url') === originalHome, 'Browser URL validation is preserved');
        assert(home._validationMessage.visible && home._validationMessage.label.includes('https://'),
            'invalid URLs have a concise explanation below the field');
        const validHome = `${originalHome}?preferences-test`;
        home.text = validHome;
        assert(!home._validationMessage.visible && !home.has_css_class('error'),
            'correcting a field clears its warning before Apply');
        home.text = validHome; home.emit('apply');
        assert(browser.get_string('home-url') === validHome && !home.has_css_class('error'), 'Browser home URL remains configurable');
        find(Adw.SpinRow, 'Page zoom (%)').value = 150;
        assert(browser.get_int('zoom-percent') === 150, 'Browser zoom remains on its main settings page');
        const controls = find(Adw.SwitchRow, 'Show browser controls');
        controls.active = false;
        assert(!browser.get_boolean('show-controls'), 'Browser navigation visibility remains configurable');
        const picker = find(Adw.SwitchRow, 'Show color picker');
        assert(picker.active, 'Browser color picker is shown by default');
        picker.active = false;
        assert(!browser.get_boolean('show-color-picker'), 'Browser color-picker visibility can be changed independently');
        browser.reset('show-color-picker');
        assert(picker.active, 'Color-picker switch follows external settings changes');
        const autoColor = find(Adw.SwitchRow, 'Automatically match page color');
        assert(!autoColor.active, 'Automatic page-color matching defaults to off');
        autoColor.active = true;
        assert(browser.get_boolean('auto-match-page-color'), 'Automatic page-color matching can be enabled from Browser settings');
        browser.reset('auto-match-page-color');
        assert(!autoColor.active, 'Automatic page-color matching follows external settings changes');
        const mobile = find(Adw.SwitchRow, 'Request mobile site');
        assert(!mobile.active, 'Browser mobile-site requests default to off');
        mobile.active = true;
        assert(browser.get_boolean('request-mobile-site'), 'Mobile-site requests can be enabled from Browser settings');
        browser.reset('request-mobile-site');
        assert(!mobile.active, 'Mobile-site switch follows external settings changes');
        browser.set_string('home-url', originalHome);
        browser.reset('zoom-percent'); browser.reset('show-controls');
        await capture('preferences-browser');
        find(Adw.ActionRow, 'Per-monitor browser settings').emit('activated');
        await pause(200);
        const displaysGroup = find(Adw.PreferencesGroup, 'Displays');
        const displayRow = descendants(displaysGroup).find(widget => widget instanceof Adw.ActionRow);
        assert(Boolean(displayRow), 'Per-monitor browser settings lists connected displays');
        assert(displayRow.subtitle === 'Using defaults', 'uncustomized monitor browsers are labeled Using defaults');
        displayRow.emit('activated');
        await pause(150);
        const displayPage = descendants(window).find(widget => widget instanceof Adw.NavigationPage && widget._monitorSettings);
        const scoped = displayPage._monitorSettings;
        const localHome = descendants(displayPage).find(widget => widget instanceof Adw.EntryRow && widget.title === 'Home URL');
        localHome.text = 'https://example.com/display'; localHome.emit('apply');
        assert(scoped.get_string('home-url') === 'https://example.com/display' && browser.get_string('home-url') === originalHome,
            'Display-specific home URL leaves the shared default unchanged');
        for (let i = 0; i < 40 && displayRow.subtitle !== 'Customized'; i++) await pause(50);
        assert(displayRow.subtitle === 'Customized', 'monitor status updates live after creating an override');
        const localZoom = descendants(displayPage).find(widget => widget instanceof Adw.SpinRow && widget.title === 'Page zoom (%)');
        localZoom.value = 125;
        assert(scoped.get_int('zoom-percent') === 125 && browser.get_int('zoom-percent') === 100,
            'Display-specific zoom is independent of the global Browser setting');
        const localReset = descendants(displayPage).find(widget => widget instanceof Adw.ActionRow && widget.title === 'Reset this panel');
        descendants(localReset).find(widget => widget instanceof Gtk.Button && widget.label === 'Reset').emit('clicked');
        assert(scoped.get_string('home-url') === originalHome && scoped.get_int('zoom-percent') === 100,
            'Reset display browser removes overrides and restores inherited defaults');
        for (let i = 0; i < 40 && displayRow.subtitle !== 'Using defaults'; i++) await pause(50);
        assert(displayRow.subtitle === 'Using defaults', 'resetting a monitor browser restores its default status');
        await back();
        await back();
        await back();

        await open('Advanced');
        assert(find(Adw.ActionRow, 'Export Configuration') && find(Adw.ActionRow, 'Import Configuration'),
            'Advanced settings expose configuration export and import');
        const saveDialog = Gtk.FileDialog.prototype.save;
        const openDialog = Gtk.FileDialog.prototype.open;
        let chooser;
        try {
            Gtk.FileDialog.prototype.save = function () { chooser = this; };
            find(Adw.ActionRow, 'Export Configuration').activatable_widget.emit('clicked');
            assert(chooser?.title === 'Export Configuration' && chooser.initial_name.endsWith('.json'),
                'Export button opens a JSON save chooser');
            Gtk.FileDialog.prototype.open = function () { chooser = this; };
            find(Adw.ActionRow, 'Import Configuration').activatable_widget.emit('clicked');
            assert(chooser?.title === 'Import Configuration', 'Import button opens a configuration chooser');
        } finally {
            Gtk.FileDialog.prototype.save = saveDialog;
            Gtk.FileDialog.prototype.open = openDialog;
        }
        await capture('preferences-configuration');
        const configurationFile = Gio.File.new_for_path(`${output}/exported-configuration.json`);
        await window._configurationControls.exportTo(configurationFile);
        const [, configurationBytes] = configurationFile.load_contents(null);
        const exported = JSON.parse(new TextDecoder().decode(configurationBytes));
        assert(exported.product === 'grand-central-desktop' && exported.settings.browser['zoom-percent'] === 100,
            'Native export writes the current panel settings to JSON');
        settings.set_int('calendar-days', 8);
        const undo = await window._configurationControls.importFrom(configurationFile);
        assert(settings.get_int('calendar-days') === exported.settings.general['calendar-days'],
            'Native import restores saved configuration');
        undo.emit('button-clicked');
        assert(settings.get_int('calendar-days') === 8, 'Import provides Undo for the previous configuration');
        await window._configurationControls.importFrom(configurationFile);
        const invalid = Gio.File.new_for_path(`${output}/invalid-configuration.json`);
        GLib.file_set_contents(invalid.get_path(), '{"product":"grand-central-desktop","format":1,"settings":{"general":{"panel-width":100}}}');
        const widthBefore = settings.get_int('panel-width');
        let rejected = false;
        try { await window._configurationControls.importFrom(invalid); } catch { rejected = true; }
        assert(rejected && settings.get_int('panel-width') === widthBefore, 'Invalid imports leave live preferences intact');
        const shortcut = find(Adw.ActionRow, 'Next panels');
        const shortcutButton = descendants(shortcut).find(widget => widget instanceof Gtk.Button);
        settings.set_strv('grand-central-desktop-next', []);
        assert(shortcutButton.label === 'Disabled', 'Shortcut labels follow external changes');
        settings.reset('grand-central-desktop-next');
        assert(shortcutButton.label !== 'Disabled', 'Shortcut reset restores its readable accelerator');
        shortcutButton.emit('clicked');
        await pause(100);
        const windows = app.get_windows();
        const dialog = windows.find(widget => widget !== window);
        const controller = controllers(dialog).find(widget => widget instanceof Gtk.EventControllerKey);
        controller.emit('key-pressed', Gdk.KEY_n, 0, Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK);
        assert(settings.get_strv('grand-central-desktop-next')[0] === '<Control><Alt>n', 'Shortcut capture retains modifier handling');
        settings.reset('grand-central-desktop-next');
        await back();
        await open('Desktop layout');
        assert(find(Adw.ComboRow, 'Panel size').selected === 1 && settings.get_int('panel-width') === 420 && settings.get_int('panel-height') === 660,
            'Settings pages reopen with imported values intact');
        await back();
        GLib.file_set_contents(`${output}/preferences.json`, JSON.stringify({ok: true, checks}, null, 2));
        await pause(300);
        window.close();
        app.quit();
    })().catch(e => { failure = e; logError(e); app.quit(); });
});
await app.runAsync([]);
if (failure) throw failure;
