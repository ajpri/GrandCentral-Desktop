import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, output, screenshot} from './helpers.js';
import {desktopScenarios} from './scenarios/desktop.js';
import {calculatorScenarios} from './scenarios/calculator.js';
import {polishScenarios} from './scenarios/polish.js';
import {notesScenarios} from './scenarios/notes.js';
import {monitorScenarios} from './scenarios/monitors.js';
import {browserScenarios} from './scenarios/browser.js';
import {updatesScenarios} from './scenarios/updates.js';
import {contextScenarios} from './scenarios/context.js';
import {mediaScenarios} from './scenarios/media.js';
import {weatherScenarios} from './scenarios/weather.js';
import {calendarScenarios} from './scenarios/calendar.js';
import {mountsScenarios} from './scenarios/mounts.js';
import {appsScenarios} from './scenarios/apps.js';
import {searchScenarios} from './scenarios/search.js';
import {appFoldersScenarios} from './scenarios/appFolders.js';

export default class Probe extends Extension {
    enable() {
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3500, () => {
            this._timer = 0;
            this.run().catch(e => {
                logError(e);
                GLib.file_set_contents(`${output}/result.json`, JSON.stringify({ok: false, error: `${e.message}\n${e.stack}`}));
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    async run() {
        const owner = Extension.lookupByUUID('grand-central-desktop@grandcentral-desktop');
        let extension = owner._grandCentralDesktopLoader?.runtime ?? owner;
        const checks = [];
        const assert = (condition, name) => {
            if (!condition)
                throw new Error(name);
            checks.push(name);
        };
        if (GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_PREFERENCES_ONLY') === '1') {
            Main.overview.hide();
            await pause(200);
            GLib.file_set_contents(`${output}/result.json`, JSON.stringify({ok: true, checks}));
            await this.capturePreferences();
            return;
        }
        assert(extension?._panels?.length === 7, 'seven panels loaded');
        assert(extension._panels.every(panel => extension.panel(panel.id) === panel),
            'named panel registry returns the same instances used for ordered layout');
        const metadata = Main.extensionManager.lookup(owner.uuid).metadata;
        assert(metadata.name === 'Grand Central Desktop' && metadata['version-name'] === '0.1' && metadata.version === 1,
            'GNOME metadata shows Grand Central Desktop version 0.1');
        assert(extension._contextMenu._getMenuItems()[0].label.text === 'Grand Central Desktop Settings', 'right-click settings menu');
        assert(extension._settingsButton === null && extension._carouselLabel === null, 'bottom Settings and page indicator removed');
        Main.overview.hide();
        await pause(700);
        assert(extension._panels.filter(p => p.actor.visible).map(p => p.id).join(',') === 'programs,desktop,documents', 'initial three panels');
        assert(extension._panels[1]._items.length === 20, 'Desktop files loaded asynchronously');
        assert(extension._panels[2]._items.length === 2, 'recent documents loaded');
        if (GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_MULTIMONITOR') === '1') {
            await this.checkMonitors(owner, assert);
            GLib.file_set_contents(`${output}/result.json`, JSON.stringify({ok: true, checks}));
            await this.capturePreferences();
            return;
        }
        if (GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_APPS_ONLY') === '1') {
            await this.checkApps(extension, assert);
            GLib.file_set_contents(`${output}/result.json`, JSON.stringify({ok: true, checks}));
            await this.capturePreferences();
            return;
        }
        if (GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_BROWSER_ONLY') === '1') {
            await this.checkBrowser(extension, assert);
            if (GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_POLISH_ONLY') === '1') await this.checkPolish(extension, assert);
            GLib.file_set_contents(`${output}/result.json`, JSON.stringify({ok: true, checks}));
            await this.capturePreferences();
            return;
        }
        if (GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_POLISH_ONLY') === '1') {
            await this.checkPolish(extension, assert);
            GLib.file_set_contents(`${output}/result.json`, JSON.stringify({ok: true, checks}));
            await this.capturePreferences();
            return;
        }
        if (GLib.getenv('GRAND_CENTRAL_DESKTOP_TEST_NOTES_ONLY') === '1') {
            await this.checkNotes(extension, assert);
            GLib.file_set_contents(`${output}/result.json`, JSON.stringify({ok: true, checks}));
            await this.capturePreferences();
            return;
        }
        await this.checkDocumentSearch(extension, assert);
        await this.checkApps(extension, assert);
        const visible = extension._panels.filter(panel => panel.actor.visible).sort((a, b) => a.actor.x - b.actor.x);
        assert(extension._previous.x + extension._previous.width < visible[0].actor.x, 'left arrow is beside the leftmost panel');
        assert(extension._next.x > visible.at(-1).actor.x + visible.at(-1).actor.width, 'right arrow is beside the rightmost panel');
        assert(Math.abs(extension._previous.y + extension._previous.height / 2 - visible[0].actor.y - visible[0].actor.height / 2) <= 1,
            'navigation arrows are vertically centered beside panels');
        extension._settings.set_strv('recent-programs', ['org.gnome.Nautilus.desktop', 'org.gnome.Calculator.desktop', 'org.gnome.Settings.desktop']);
        await pause(200);
        assert(extension._panels[0]._items.length > 0, 'program app icons resolved');
        await screenshot('desktop');
        await this.checkWindowStack(extension, assert);
        await this.checkMedia(extension, assert);
        await this.checkCalendar(extension, assert);
        await this.checkContextMenus(extension, assert);
        await this.checkDesktopFiles(extension, assert);
        await this.checkCalculator(extension, assert);
        await this.checkLifecycle(extension, assert);
        await this.checkNotes(extension, assert);
        await this.checkBrowser(extension, assert);
        await this.checkPolish(extension, assert);
        await this.checkCarousel(extension, assert);
        extension = await this.checkBrowserPersistence(owner, extension, assert);
        await this.checkAutomaticUpdates(owner, assert);
        GLib.file_set_contents(`${output}/result.json`, JSON.stringify({ok: true, checks}, null, 2));
        await this.capturePreferences();
    }

    async capturePreferences() {
        let captured = '';
        for (let i = 0; i < 600; i++) {
            const request = Gio.File.new_for_path(`${output}/preferences-capture-request.json`);
            if (request.query_exists(null)) {
                const [, bytes] = request.load_contents(null);
                const name = JSON.parse(new TextDecoder().decode(bytes));
                if (name !== captured && /^preferences(?:-[a-z]+)?$/.test(name)) {
                    await pause(200);
                    await screenshot(name);
                    captured = name;
                }
            }
            if (Gio.File.new_for_path(`${output}/preferences.json`).query_exists(null))
                break;
            await pause(50);
        }
    }

    disable() {
        if (this._timer)
            GLib.Source.remove(this._timer);
    }

}

Object.assign(Probe.prototype,
    desktopScenarios,
    calculatorScenarios,
    notesScenarios,
    polishScenarios,
    monitorScenarios,
    browserScenarios,
    updatesScenarios,
    contextScenarios,
    mediaScenarios,
    weatherScenarios,
    calendarScenarios,
    mountsScenarios,
    appsScenarios,
    searchScenarios,
    appFoldersScenarios);
