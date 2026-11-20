import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {calculate, formatResult} from '../lib/calculator.js';
import {FileSource, readDesktop, readDocuments} from '../lib/files.js';
import {gridGeometry, layoutPanels, pageItems, panelColors, recentFirst, validHomeUrl, insetCornerRadius} from '../lib/model.js';
import {PANEL_IDS, panelOrder, movePanel, insertPanel} from '../lib/panels.js';
import {orderedApps, appGridItems} from '../lib/appOrder.js';
import {searchApps} from '../lib/appSearch.js';
import {searchNames} from '../lib/nameSearch.js';
import {SearchState} from '../lib/searchState.js';
import {mountedItems, desktopItems} from '../lib/mounts.js';
import {mediaState, selectMedia, mediaGeometry} from '../lib/mediaModel.js';
import {weatherState, cornerGeometry} from '../lib/weatherModel.js';
import {calendarRange, upcomingEvents, eventTime, isOngoing, calendarGeometry} from '../lib/calendarModel.js';

let assertions = 0;
function equal(actual, expected, label) {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function rejects(expression, message) {
    assertions++;
    try {
        calculate(expression);
    } catch (e) {
        if (e.message.includes(message))
            return;
        throw e;
    }
    throw new Error(`Expected rejection: ${expression}`);
}

for (const [expression, result] of [
    ['', '0'], ['2 + 3 * 4', '14'], ['(2 + 3) × 4', '20'],
    ['200 * 10%', '20'], ['200 * (1 + 10%)', '220'], ['100 + 10%', '100.1'],
    ['sqrt(81) + 2^3', '17'], ['2^3^2', '512'], ['-2^2', '-4'],
    ['2^-2', '0.25'], ['(-2)^2', '4'], ['.5 + 1.5', '2'],
    ['0.1 + 0.2', '0.3'], ['1e-4 * 10000', '1'], ['1 ÷ 4', '0.25'],
    ['1/3', '0.333333333333'], ['-0', '0'],
])
    equal(formatResult(calculate(expression)), result, expression);
rejects('1/0', 'zero');
rejects('sqrt(-1)', 'negative');
rejects('2 +', 'number');
rejects('(2+3', 'parenthesis');
rejects('2 3', 'operators');
rejects('globalThis', 'arithmetic');
rejects('2**3', 'number');
rejects('9^999', 'range');
rejects('1'.repeat(513), 'long');
equal(recentFirst(['b', 'a', 'c'], 'a'), ['a', 'b', 'c'], 'MRU deduplicates');
equal(recentFirst(['b', 'c'], 'a', 2), ['a', 'b'], 'MRU bounded');
equal(pageItems([1, 2, 3, 4, 5], 4, 2), {items: [5], page: 2, count: 3}, 'page clamps after removal');
equal(pageItems([], 3, 16), {items: [], page: 0, count: 1}, 'empty pages');
const searchState = new SearchState();
equal(searchState.change('   ', 3), 3, 'whitespace search retains the browsing page');
equal(searchState.active, false, 'whitespace search is inactive');
equal(searchState.change('report', 3), 0, 'first query starts at the first results page');
equal(searchState.change('budget', 1), 0, 'changed query resets results without replacing the browsing page');
equal(searchState.change('', 1), 3, 'clear restores the page before searching');
equal(searchState.change('', 0), null, 'unchanged query does not reset pagination');
equal(new SearchState({query: 'report', browsePage: 2}).capture(), {query: 'report', browsePage: 2},
    'search state restores the query and original page without changing saved data');
equal(panelColors('red; color: pink').background, '#181818', 'invalid color safely falls back');
equal(panelColors('#ffffff').foreground, '#181818', 'light color contrast');
equal(panelColors('#000000').foreground, '#ffffff', 'dark color contrast');
equal(insetCornerRadius(32, 13, 394, 580), 19, 'browser viewport follows the frame inner corner');
equal(insetCornerRadius(0, 13, 394, 580), 0, 'square panel keeps a square viewport');
equal(insetCornerRadius(80, 13, 100, 40), 20, 'rounded viewport radius fits compact dimensions');
for (const url of ['https://example.com', 'http://localhost:8080/home', 'about:blank'])
    equal(validHomeUrl(url), true, 'supported home URL');
for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://', 'hello world'])
    equal(validHomeUrl(url), false, 'unsupported home URL');
for (const width of [800, 1024, 1366, 1920, 3840]) {
    const area = {x: -1920, y: 32, width, height: 900};
    const boxes = layoutPanels(area, 3, {margin: 36, gap: 24, width: 420, height: 660});
    equal(boxes.length, 3, 'three visible');
    equal(boxes.every(box => box.x >= area.x && box.x + box.width <= area.x + width), true, `fits ${width}`);
    for (const box of boxes) {
        const grid = gridGeometry(box.width, box.height, {columns: 4, rows: 4, iconSize: 48, showLabels: true});
        equal(grid.capacity >= 1 && grid.columns <= 4 && grid.rows <= 4, true, 'adaptive grid');
    }
}
equal(layoutPanels({x: 0, y: 0, width: 1000, height: 900}, 0, {}), [], 'all panels disabled');
equal(panelOrder(['browser', 'browser', 'unknown', 'desktop']),
    ['browser', 'desktop', 'programs', 'documents', 'calculator', 'apps', 'notes'], 'saved order repairs duplicates and appends new panels');
equal(movePanel(PANEL_IDS, 'apps', -1).slice(-3), ['apps', 'browser', 'notes'], 'move panel earlier');
equal(movePanel(PANEL_IDS, 'programs', -1), PANEL_IDS, 'first panel cannot move before start');
equal(movePanel(PANEL_IDS, 'notes', 1), PANEL_IDS, 'last panel cannot move past end');
equal(insertPanel(PANEL_IDS, 'apps', 'desktop').slice(0, 4), ['programs', 'apps', 'desktop', 'documents'], 'dragging before a panel preserves other relative positions');
equal(insertPanel(PANEL_IDS, 'programs', 'notes', true).slice(-2), ['notes', 'programs'], 'dragging after the last panel moves to the end');
equal(insertPanel(PANEL_IDS, 'unknown', 'apps'), PANEL_IDS, 'invalid drag source leaves panel order intact');
const app = name => ({get_id: () => `${name}.desktop`, get_name: () => name});
const [a, b, c, d] = ['Alpha', 'beta', 'Charlie', 'Delta'].map(app);
const node = app => ({id: app.get_id(), name: app.get_name(), app});
const folder = {id: 'folder', name: 'Folder', view: {getAllItems: () => [node(d), node(b)]}};
const grid = {getAllItems: () => [node(c), folder, node(a)], _compareItems: () => 0};
const grouped = appGridItems(grid, [a, b, c, d]);
const searchItems = [{id: a.get_id(), label: 'Alpha Browser', app: a},
    {id: 'folder:tools', label: 'Tools', children: [{id: b.get_id(), label: 'Éditeur de Texte', app: b},
        {id: c.get_id(), label: 'Calculator', app: c}]},
    {id: a.get_id(), label: 'Alpha Browser', app: a}];
equal(searchApps(searchItems, 'BROW').map(item => item.id), [a.get_id()], 'search matches program names without case sensitivity');
equal(searchApps(searchItems, 'editeur texte').map(item => item.id), [b.get_id()], 'search folds accents and matches multiple words inside folders');
equal(searchApps(searchItems, '   CALC  ').map(item => item.id), [c.get_id()], 'search trims whitespace and includes folder apps');
equal(searchApps(searchItems, 'Tools'), [], 'folder titles are not program search results');
equal(searchApps(searchItems, 'unknown'), [], 'unmatched program query returns no results');
equal(searchApps(searchItems, '').map(item => item.id), [a.get_id(), b.get_id(), c.get_id()], 'empty search flattens apps once in existing grid order');
equal(searchApps(searchItems, 'alpha texte'), [], 'all search words must match the same program name');
const documents = [{label: 'Annual report', filename: 'Résumé 2026.pdf', uri: 'file:///first'},
    {label: 'Budget 2026.csv', filename: 'Budget 2026.csv', uri: 'file:///second'}];
const documentNames = item => `${item.label} ${item.filename}`;
equal(searchNames(documents, 'resume PDF', documentNames).map(item => item.uri), ['file:///first'], 'file search matches actual filenames with accents and mixed case');
equal(searchNames(documents, 'annual report', documentNames).map(item => item.uri), ['file:///first'], 'file search also matches displayed document titles');
equal(searchNames(documents, '2026', documentNames).map(item => item.uri), ['file:///first', 'file:///second'], 'file search preserves recent-file order');
equal(searchNames(documents, 'annual budget', documentNames), [], 'search words must belong to one file');
equal(searchNames(documents, '  ', documentNames), documents, 'blank file query retains the eligible list');
equal(searchNames(documents, '[', documentNames), [], 'file queries are plain text rather than regular expressions');
equal(grouped.map(item => item.label), ['Charlie', 'Folder', 'Alpha'], 'app grid preserves folders at their GNOME positions');
equal(grouped[1].children.map(item => item.label), ['Delta', 'beta'], 'folder membership and internal ordering match GNOME');
equal(appGridItems(grid, [a, c]).map(item => item.label), ['Charlie', 'Alpha'], 'empty or ineligible folders are excluded');
equal(orderedApps(grid, [a, b, c, d]).map(app => app.get_name()),
    ['Charlie', 'Delta', 'beta', 'Alpha'], 'manual grid order with folders expanded in place');
equal(orderedApps(grid, [a, c, d]).map(app => app.get_name()),
    ['Charlie', 'Delta', 'Alpha'], 'ineligible apps are excluded');
grid.getAllItems = () => [node(a), node(c), node(d), node(c)];
grid._compareItems = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
equal(orderedApps(grid, [a, b, c, d]).map(app => app.get_name()),
    ['Alpha', 'beta', 'Charlie', 'Delta'], 'pinned apps use active extension comparator and duplicates are removed');
grid.getAllItems = () => [node(d), node(c), node(a)];
grid._compareItems = (a, b) => b.name.toLowerCase().localeCompare(a.name.toLowerCase());
equal(orderedApps(grid, [a, b, c, d]).map(app => app.get_name()),
    ['Delta', 'Charlie', 'beta', 'Alpha'], 'changed grid sorting is followed');
const pinnedFolder = {id: 'pinned', name: 'Pinned folder', apps: [b.get_id()], categories: [], excluded: []};
const pinnedItems = appGridItems(grid, [a, b, c, d], [pinnedFolder]);
equal(pinnedItems.find(item => item.folderId === 'pinned')?.children.map(item => item.id),
    [b.get_id()], 'a folder containing only a pinned app remains visible');
equal(pinnedItems.some(item => item.id === b.get_id()), false, 'pinned folder members do not also appear at the root');

const temp = GLib.dir_make_tmp('grand-central-desktop-test-XXXXXX');
const calendarNow = new Date(2026, 10, 17, 12, 0);
const range = calendarRange(calendarNow, 2);
equal([range.start.getDate(), range.start.getHours(), range.end.getDate()], [17, 0, 19], 'calendar range follows local day boundaries');
const event = (id, start, end) => ({id, start: new Date(2026, 10, 17, start).getTime(), end: new Date(2026, 10, 17, end).getTime()});
const calendarEvents = [event('past', 9, 10), event('ongoing', 11, 13), event('later', 14, 15), event('tomorrow', 33, 34), event('too-late', 58, 59)];
equal(upcomingEvents(calendarEvents, calendarNow, 2, 3).map(item => item.id), ['ongoing', 'later', 'tomorrow'], 'calendar selects ongoing then upcoming events and skips completed events');
equal(upcomingEvents(calendarEvents, calendarNow, 1, 3).map(item => item.id), ['ongoing', 'later'], 'calendar today-only selection excludes tomorrow');
equal(upcomingEvents(calendarEvents, calendarNow, 2, 1).length, 1, 'calendar maximum is applied without empty slots');
equal(eventTime({...calendarEvents[1], allDay: true}, calendarNow, '24h'), 'Today · All day', 'calendar labels all-day events');
const meeting = calendarEvents[1];
equal(isOngoing(meeting, new Date(meeting.start - 1)), false, 'calendar highlight does not start early');
equal(isOngoing(meeting, new Date(meeting.start)), true, 'calendar highlight starts at the event boundary');
equal(isOngoing(meeting, new Date(meeting.end)), false, 'calendar highlight ends at the exclusive end boundary');
equal(isOngoing({...meeting, allDay: true}, calendarNow), false, 'all-day events have no active card');
equal(eventTime(meeting, calendarNow, '24h').startsWith('Now · '), true, 'ongoing timed events are labeled Now');
const laterDate = new Date(2026, 10, 20);
const laterLabel = new Intl.DateTimeFormat(undefined, {weekday: 'short', month: 'short', day: 'numeric'}).format(laterDate);
equal(eventTime({...event('future-day', 72, 73), allDay: true}, calendarNow, '24h'), `${laterLabel} · All day`, 'events beyond tomorrow show their date');
equal(upcomingEvents([event('last-day', 7 * 24 + 9, 7 * 24 + 10), event('outside', 8 * 24, 8 * 24 + 1)], calendarNow, 8, 3).map(item => item.id), ['last-day'], 'seven days ahead includes the full seventh day and excludes the next');
const pill1 = calendarGeometry({x: 0, y: 32, width: 1440, height: 968}, 1, 36, 1);
const pill3 = calendarGeometry({x: 0, y: 32, width: 1440, height: 968}, 1, 36, 3);
equal(pill3.width > pill1.width && pill3.x + pill3.width / 2 === 720, true, 'calendar pill expands and stays centered');
const weatherNow = 1805500000;
const weatherInfo = (temperature, timestamp = weatherNow, valid = true) => ({
    is_valid: () => valid, get_value_temp: () => [valid, temperature], get_temp: () => `${temperature} °C`,
    get_symbolic_icon_name: () => 'weather-clear-symbolic', get_value_update: () => [true, timestamp],
    get_icon_name: () => 'weather-clear',
    get_location: () => ({get_city_name: () => 'Test City', get_name: () => 'Test station'}),
    get_location_name: () => 'Test station', get_forecast_list: () => [],
});
const weatherClient = {available: true, hasLocation: true, info: weatherInfo(22)};
equal(weatherState(weatherClient, 1, weatherNow), {visible: true, temperature: '22 °C', location: 'Test City',
    icon: 'weather-clear-large', refreshed: ''}, 'weather uses GNOME units, city, and full-color condition icon');
for (const [value, rounded] of [[69.8, 70], [69.2, 69], [-4.8, -5], [-0.2, 0]]) {
    weatherClient.info = weatherInfo(value);
    equal(weatherState(weatherClient, 1, weatherNow).temperature, `${rounded} °C`, 'weather rounds to nearest whole degree without negative zero');
}
weatherClient.info = weatherInfo(69.8);
weatherClient.info.get_temp = () => '69,8 °F';
equal(weatherState(weatherClient, 1, weatherNow).temperature, '70 °F', 'rounding preserves localized unit spacing and Fahrenheit');
equal(weatherState(null, 1).visible, false, 'missing GNOME Weather integration stays hidden');
equal(weatherState({available: true, hasLocation: false}, 1).temperature, '—', 'unconfigured weather shows a placeholder');
weatherClient.info = weatherInfo(0, weatherNow, false);
equal(weatherState(weatherClient, 1, weatherNow).temperature, 'Unavailable', 'unavailable weather does not invent a temperature');
weatherClient.info.get_forecast_list = () => [weatherInfo(99, weatherNow + 24 * 3600),
    weatherInfo(24, weatherNow + 3600), weatherInfo(21, weatherNow - 600)];
equal(weatherState(weatherClient, 1, weatherNow).temperature, '21 °C', 'forecast-only providers use the nearest current-hour temperature');
weatherClient.info.get_forecast_list = () => [weatherInfo(99, weatherNow + 24 * 3600)];
equal(weatherState(weatherClient, 1, weatherNow).temperature, 'Unavailable', 'distant forecast temperatures are not shown as current conditions');
weatherClient.info = weatherInfo(NaN);
equal(weatherState(weatherClient, 1, weatherNow).temperature, 'Unavailable', 'invalid numeric temperatures are ignored');
for (const [width, height, scale] of [[1440, 1000, 1], [800, 600, 1], [1920, 1080, 2], [800, 600, 2]]) {
    const area = {x: -1920, y: 32, width, height};
    const boxes = cornerGeometry(area, scale, 36, true, true);
    equal(boxes.weather.x >= area.x && boxes.weather.x + boxes.weather.width + 11 * scale <= boxes.media.x &&
        boxes.media.x + boxes.media.width <= area.x + width, true, 'weather and media fit side by side inside the work area');
    equal(boxes.weather.y === boxes.media.y && boxes.weather.height === boxes.media.height && boxes.weather.width === boxes.media.width,
        true, 'corner widgets share a bottom row and equal dimensions');
}
const mediaValues = {PlaybackStatus: new GLib.Variant('s', 'Playing'),
    Metadata: new GLib.Variant('a{sv}', {'xesam:title': new GLib.Variant('s', '<Test song>'),
        'xesam:artist': new GLib.Variant('as', ['One', 'Two']),
        'mpris:artUrl': new GLib.Variant('s', 'https://example.com/cover.jpg')}),
    CanPlay: new GLib.Variant('b', true), CanPause: new GLib.Variant('b', true)};
const media = mediaState(key => mediaValues[key]);
equal([media.title, media.artist, media.art, media.status],
    ['<Test song>', 'One, Two', 'https://example.com/cover.jpg', 'Playing'], 'MPRIS variants provide plain-text title, artists and artwork');
const brokenMedia = mediaState(key => key === 'Metadata' ? {'xesam:title': 42, 'xesam:artist': 'wrong',
    'mpris:artUrl': 'javascript:wrong'} : undefined);
equal([brokenMedia.title, brokenMedia.artist, brokenMedia.art, brokenMedia.hasTrack],
    ['Unknown title', '', '', false], 'malformed or missing media metadata falls back safely');
const playing = {state: {...media, status: 'Playing'}, started: 1};
const paused = {state: {...media, status: 'Paused'}, started: 2};
equal(selectMedia([paused, playing]) === playing, true, 'playing media takes priority over paused media');
const newer = {state: {...media, status: 'Playing'}, started: 3};
equal(selectMedia([playing, newer]) === newer, true, 'latest started player takes priority');
equal(selectMedia([paused]) === paused, true, 'paused track keeps resume control available');
equal(selectMedia([{state: {status: 'Stopped'}, started: 5}]), null, 'stopped player is hidden');
equal(selectMedia([{state: {status: 'Paused', hasTrack: false}, started: 0}]), null, 'idle player without track is hidden');
for (const [width, height, scale] of [[1440, 1000, 1], [800, 600, 1], [1920, 1080, 2]]) {
    const area = {x: -1920, y: 32, width, height};
    const box = mediaGeometry(area, scale, 36);
    equal(box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + width &&
        box.y + box.height <= area.y + height, true, 'media stays inside work area at each scale and monitor origin');
}
const mount = (name, uri, shadowed = false) => ({
    get_name: () => name, get_root: () => Gio.File.new_for_uri(uri),
    get_icon: () => null, is_shadowed: () => shadowed,
});
const mounts = mountedItems([mount('USB', 'file:///run/media/test/USB'),
    mount('Hidden', 'file:///hidden', true), mount('Backup', 'file:///mnt/backup'),
    mount('Duplicate', 'file:///mnt/backup'), {is_shadowed() { throw new Error('Unmounted'); }}]);
equal(mounts.map(item => item.label), ['Backup', 'USB'], 'mounts skip shadowed, duplicate, and disappearing drives and sort by name');
equal(mounts[0].gicon.to_string(), 'drive-harddisk', 'mounts have a fallback drive icon');
equal(mountedItems([mount('Share', 'smb://server/share')])[0].uri, 'smb://server/share', 'mounted shares preserve their launch URI without probing');
equal(desktopItems([{uri: 'file:///mnt/backup'}, {uri: 'file:///Desktop/file'}], mounts, 100).map(item => item.uri),
    ['file:///mnt/backup', 'file:///run/media/test/USB', 'file:///Desktop/file'], 'drives precede files and duplicate roots are removed');
equal(desktopItems([{uri: 'file:///Desktop/file'}], mounts, 2).length, 2, 'Desktop item limit includes drives');
const loop = new GLib.MainLoop(null, false);
let failed = false;
async function fileTests() {
    const cancellable = new Gio.Cancellable();
    GLib.file_set_contents(`${temp}/zebra.txt`, 'z');
    GLib.file_set_contents(`${temp}/alpha.txt`, 'a');
    GLib.file_set_contents(`${temp}/.hidden`, 'hidden');
    const desktop = await readDesktop(temp, false, 'name', 100, cancellable);
    equal(desktop.items.map(item => item.label), ['alpha.txt', 'zebra.txt'], 'Desktop enumerates and hides dotfiles');
    equal((await readDesktop(temp, true, 'name', 2, cancellable)).items.length, 2, 'Desktop limit');
    GLib.file_set_contents(`${temp}/shortcut.desktop`, '[Desktop Entry]\nType=Application\nName=My Application\nIcon=utilities-terminal\nExec=true\n');
    const shortcut = (await readDesktop(temp, false, 'name', 100, cancellable)).items.find(item => item.desktopFile);
    equal(shortcut.label, 'My Application', 'Desktop shortcuts use application names');
    equal(shortcut.gicon.to_string(), 'utilities-terminal', 'Desktop shortcuts use application icons');
    equal(shortcut.trusted, false, 'Untrusted Desktop shortcuts are identified');
    const bookmarks = new GLib.BookmarkFile();
    const now = GLib.DateTime.new_now_utc();
    for (const [name, private_, days, remote] of [['public', false, 0, false], ['private', true, 0, false],
        ['old', false, 50, false], ['remote', false, 0, true]]) {
        const uri = remote ? 'https://example.org/document' : Gio.File.new_for_path(`${temp}/${name}.txt`).get_uri();
        bookmarks.set_title(uri, `${name}.txt`);
        bookmarks.set_mime_type(uri, 'text/plain');
        bookmarks.add_application(uri, 'Grand Central Desktop Tests', 'true %u');
        bookmarks.set_is_private(uri, private_);
        bookmarks.set_modified_date_time(uri, now.add_days(-days));
        bookmarks.set_visited_date_time(uri, now.add_days(-days));
    }
    bookmarks.to_file(`${temp}/recently-used.xbel`);
    const recent = await readDocuments(Gio.File.new_for_path(`${temp}/recently-used.xbel`), 100, 30, cancellable);
    equal(recent.items.map(item => item.label), ['public.txt'], 'documents respect privacy, age, and local sources');
    equal(recent.items[0].filename, 'public.txt', 'recent files expose their basename without probing file contents');
    const source = new FileSource(() => {});
    let finish;
    const obsolete = source.refresh(() => new Promise(resolve => { finish = resolve; }));
    equal(await source.refresh(async () => ({items: ['new']})), {items: ['new']}, 'newest read wins');
    finish({items: ['old']});
    equal(await obsolete, null, 'stale read discarded');
    const pending = source.refresh(() => new Promise(resolve => { finish = resolve; }));
    source.destroy();
    finish({items: ['late']});
    equal(await pending, null, 'disabled source discards callbacks');
}
fileTests().catch(e => {
    logError(e);
    failed = true;
}).finally(() => loop.quit());
loop.run();
for (const file of ['zebra.txt', 'alpha.txt', '.hidden', 'shortcut.desktop', 'recently-used.xbel'])
    GLib.unlink(`${temp}/${file}`);
GLib.rmdir(temp);
if (failed)
    throw new Error('File-source tests failed');
print(`Passed ${assertions} assertions.`);
