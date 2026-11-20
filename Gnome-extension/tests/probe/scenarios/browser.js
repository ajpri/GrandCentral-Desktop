import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {pause, output, readBrowserState, screenshot} from '../helpers.js';

export const browserScenarios = {
    async checkViewportCorners(browser, assert, name, radius = 19, color = [24, 24, 24]) {
        await pause(100);
        const state = await readBrowserState(browser);
        const viewport = state.viewport;
        assert(viewport?.radius === radius && viewport.width > radius * 2 && viewport.height > radius * 2,
            `${name}: viewport radius matches the panel inner curve`);
        await screenshot(name);
        const pixbuf = GdkPixbuf.Pixbuf.new_from_file(`${output}/${name}.png`);
        const data = pixbuf.get_pixels();
        const stride = pixbuf.get_rowstride();
        const channels = pixbuf.get_n_channels();
        const pixel = (x, y) => {
            const px = Math.round(state.geometry[0] + (viewport.x + x) * viewport.scale);
            const py = Math.round(state.geometry[1] + (viewport.y + y) * viewport.scale);
            const offset = py * stride + px * channels;
            return [...data.slice(offset, offset + 3)];
        };
        const corners = [[2, 2], [viewport.width - 3, 2], [2, viewport.height - 3],
            [viewport.width - 3, viewport.height - 3]].map(([x, y]) => pixel(x, y));
        assert(corners.every(rgb => radius ? rgb.every((value, i) => Math.abs(value - color[i]) <= 8)
            : rgb.every(value => value > 180)), `${name}: rendered page corners are ${radius ? 'clipped to the panel color' : 'square'}`);
        assert(pixel(viewport.width / 2, 2).every(value => value > 180),
            `${name}: clipping preserves visible web content between corners`);
    },

    async checkBrowser(extension, assert) {
        extension._turnPanels(2);
        const browser = extension._panels[4];
        for (let i = 0; i < 60 && !browser._proxy; i++)
            await pause(150);
        assert(Boolean(browser._proxy), 'browser helper connects');
        const browserState = () => readBrowserState(browser);
        let state;
        for (let i = 0; i < 60; i++) {
            state = await browserState();
            if (state.loaded && state.title === 'Grand Central Desktop browser test')
                break;
            await pause(150);
        }
        assert(state.loaded && state.title === 'Grand Central Desktop browser test', 'browser loads configured home URL');
        assert(state.persistentProfile, 'browser uses a persistent website data profile');
        assert(state.controls === 6 && state.buttons.at(-2).label === 'Match page color' &&
            state.buttons.at(-1).label === 'Expand browser', 'browser has navigation, page color, and expand controls');
        assert(state.zoom === 1, 'browser defaults to 100 percent zoom');
        const initialProcess = browser._process;
        await this.checkColorPickerVisibility(extension, assert);
        await this.checkViewportCorners(browser, assert, 'browser-rounded');
        browser.settings.set_int('corner-radius', 0);
        await this.checkViewportCorners(browser, assert, 'browser-square', 0);
        browser.settings.set_int('corner-radius', 48);
        browser.settings.set_string('background-color', '#34243d');
        await this.checkViewportCorners(browser, assert, 'browser-rounded-custom', 35, [52, 36, 61]);
        assert(browser._process === initialProcess && (await browserState()).title === state.title,
            'changing viewport radius and color retains the browser process and page');
        browser.settings.reset('corner-radius');
        browser.settings.reset('background-color');
        browser.settings.set_int('zoom-percent', 150);
        await pause(250);
        assert((await browserState()).zoom === 1.5, 'browser zoom changes to 150 percent immediately');
        browser.settings.set_int('zoom-percent', 75);
        await pause(250);
        assert((await browserState()).zoom === 0.75, 'browser zoom supports smaller percentages');
        browser.settings.set_boolean('show-controls', false);
        await pause(250);
        assert(!(await browserState()).controlsVisible, 'browser toolbar can be hidden');
        extension._turnPanels(-1);
        extension._turnPanels(1);
        await pause(250);
        assert(!(await browserState()).controlsVisible, 'toolbar stays hidden after carousel changes');
        await this.checkViewportCorners(browser, assert, 'browser-rounded-controls-hidden');
        await screenshot('browser-toolbar-hidden');
        browser.settings.set_boolean('show-controls', true);
        browser.settings.set_int('zoom-percent', 100);
        await pause(250);
        state = await browserState();
        assert(state.controlsVisible && state.zoom === 1, 'browser controls and normal zoom can be restored');
        assert(state.buttons.every((button, i) => !i || button.x >= state.buttons[i - 1].x + state.buttons[i - 1].width), 'browser controls do not overlap');
        const browserWindow = global.get_window_actors().map(actor => actor.meta_window)
            .find(window => window.get_title() === 'Grand Central Desktop Browser');
        assert(Boolean(browserWindow) && browserWindow.get_window_type() === 1, 'browser is a desktop window');
        const processBeforeExpand = browser._process;
        const normalGeometry = {...browser._geometry};
        const normalPanels = extension._panels.filter(panel => panel.actor.visible);
        const spanStart = Math.min(...normalPanels.map(panel => panel.actor.x));
        const spanEnd = Math.max(...normalPanels.map(panel => panel.actor.x + panel.actor.width));
        browser._call('Navigate', '(s)', ['toggle-expanded']);
        await pause(400);
        state = await browserState();
        assert(state.expanded && state.expandLabel === 'Restore browser' && state.buttons.at(-1).label === 'Restore browser',
            'browser expansion action switches to a labeled restore control');
        assert(extension._panels.filter(panel => panel.actor.visible).map(panel => panel.id).join() === 'browser' &&
            browser._geometry.x === spanStart && browser._geometry.width === spanEnd - spanStart &&
            browser._geometry.height === normalGeometry.height, 'expanded browser occupies the complete three-panel footprint');
        assert(state.geometry[2] === browser._geometry.width && browserWindow.get_frame_rect().width === browser._geometry.width,
            'native browser window follows the expanded desktop geometry');
        assert(browser._process === processBeforeExpand && state.title === 'Grand Central Desktop browser test',
            'expanding resizes the existing browser without restarting or navigating');
        await this.checkViewportCorners(browser, assert, 'browser-rounded-expanded');
        assert(!extension._previous.visible && !extension._next.visible && !extension._previous.reactive &&
            !extension._next.can_focus, 'expanded browser hides and deactivates carousel arrows');
        const restore = extension._restoreBrowser;
        assert(restore.visible && restore.reactive && restore.can_focus && restore.y >= 0 &&
            restore.y + restore.height < browser._geometry.y &&
            restore.x + restore.width === browser._geometry.x + browser._geometry.width,
        'floating Restore is accessible above the expanded browser right edge, outside web content');
        const picked = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,
            restore.x + restore.width / 2, restore.y + restore.height / 2);
        assert(picked === restore || restore.contains(picked), 'floating Restore receives pointer input');
        const expandedStart = extension._start;
        extension._previous.emit('clicked', 1);
        extension._next.emit('clicked', 1);
        extension._turnPanels(-1);
        assert(extension._start === expandedStart && browser.settings.get_boolean('expanded'),
            'carousel actions and shortcuts cannot navigate away while expanded');
        await screenshot('browser-expanded');
        browser.settings.set_boolean('show-controls', false);
        await pause(150);
        assert(restore.visible, 'floating Restore remains visible when browser controls are hidden');
        const height = extension._settings.get_int('panel-height');
        extension._settings.set_int('panel-height', 1200);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        assert(restore.y >= workArea.y && restore.y + restore.height < browser._geometry.y,
            'floating Restore stays inside the work area and above tall expanded panels');
        extension._settings.set_int('panel-height', height);
        browser.settings.set_string('background-color', '#f6f5f4');
        assert(restore.get_style().includes('#f6f5f4') && restore.get_style().includes('#181818'),
            'floating Restore follows the browser frame color and readable contrast');
        browser.settings.reset('background-color');
        restore.emit('clicked', 1);
        await pause(300);
        state = await browserState();
        assert(!state.expanded && !state.controlsVisible && browser._geometry.width === normalGeometry.width &&
            extension._panels.filter(panel => panel.actor.visible).length === 3, 'browser restores the normal layout while toolbar controls are hidden');
        assert(extension._start === expandedStart && !restore.visible && extension._previous.visible && extension._next.visible &&
            browser._process === processBeforeExpand && state.title === 'Grand Central Desktop browser test',
        'floating Restore retains the carousel arrangement and browser page, and restores arrows');
        browser._call('Navigate', '(s)', ['toggle-expanded']);
        await pause(300);
        assert((await browserState()).expanded && !(await browserState()).controlsVisible,
            'expansion remains available through the shared action with the toolbar hidden');
        restore.emit('clicked', 1);
        await pause(200);
        assert(!browser.settings.get_boolean('expanded') && extension._panels.filter(panel => panel.actor.visible).length === 3,
            'floating Restore exits expanded mode without carousel navigation');
        browser.settings.set_boolean('show-controls', true);
        await pause(200);
        const widthSetting = extension._settings.get_int('panel-width');
        extension._settings.set_int('panel-width', 220);
        await pause(300);
        state = await browserState();
        const controlsFit = state.buttons.every(button => button.x >= 0 && button.x + button.width <= state.geometry[2]);
        assert(controlsFit, `all six browser controls fit the minimum panel width${controlsFit ? '' : `: ${JSON.stringify(state.buttons)}`}`);
        extension._settings.set_int('panel-width', widthSetting);
        await pause(200);
        const second = browser.settings.get_string('home-url').replace('index.html', 'second.html');
        browser.settings.set_string('home-url', second);
        for (let i = 0; i < 30; i++) {
            state = await browserState();
            if (state.loaded && state.title === 'Second page')
                break;
            await pause(150);
        }
        assert(state.title === 'Second page' && state.canGoBack, 'browser navigates and records back history');
        browser._call('Navigate', '(s)', ['back']);
        await pause(600);
        state = await browserState();
        assert(state.title === 'Grand Central Desktop browser test' && state.canGoForward, 'browser Back control works');
        browser._call('Navigate', '(s)', ['forward']);
        await pause(600);
        assert((await browserState()).title === 'Second page', 'browser Forward control works');
        browser._call('Navigate', '(s)', ['toggle-expanded']);
        await pause(200);
        assert((await browserState()).canGoBack && browser._process === processBeforeExpand,
            'expanding preserves the existing browser navigation history');
        browser._call('Navigate', '(s)', ['toggle-expanded']);
        browser._call('Navigate', '(s)', ['home']);
        browser._call('Navigate', '(s)', ['refresh']);
        await pause(600);
        assert((await browserState()).title === 'Second page', 'browser Home and Refresh controls work');
        browser.settings.set_string('home-url', second.replace('second.html', 'index.html'));
        await pause(500);
        await screenshot('browser');
        await this.checkPageColors(extension, assert);
        await this.checkMobileSite(extension, assert);
        await this.checkAutomaticPageColors(extension, assert);
        extension._turnPanels(-1);
        await pause(300);
        assert(!(await browserState()).visible, 'browser hides outside visible carousel');
    },
    async waitForBrowserColor(browser, color, title) {
        for (let i = 0; i < 100; i++) {
            const state = await readBrowserState(browser);
            if (state.loaded && state.colorMatchEnabled && state.backgroundColor === color && state.title === title)
                return state;
            await pause(50);
        }
        throw new Error(`Browser did not match ${color} for ${title}: ${JSON.stringify(await readBrowserState(browser))}`);
    },
    async checkAutomaticPageColors(runtime, assert) {
        const browser = runtime.panel('browser');
        const settings = browser.settings;
        const originalHome = settings.get_string('home-url');
        const originalColor = settings.get_string('background-color');
        const origin = originalHome.replace(/\/[^/]*$/, '');
        const process = browser._process;
        const otherColors = () => runtime._panels.filter(panel => panel.id !== 'browser')
            .map(panel => panel.settings.get_string('background-color')).join();
        const otherPanelColors = otherColors();
        assert(!(await readBrowserState(browser)).autoMatchPageColor, 'automatic page-color matching defaults to off');
        settings.set_boolean('show-controls', false);
        settings.set_boolean('show-color-picker', false);
        settings.set_boolean('auto-match-page-color', true);
        let state = await this.waitForBrowserColor(browser, '#f6f5f4', 'Grand Central Desktop browser test');
        assert(state.autoMatchPageColor && !state.controlsVisible && !state.colorPickerVisible && browser._process === process,
            'enabling automatic matching immediately matches the loaded page with controls and picker hidden');
        for (const [page, color, title] of [['root', '#204060', 'Color root'], ['alpha', '#102030', 'Color alpha']]) {
            settings.set_string('home-url', `${origin}/color-${page}.html`);
            await this.waitForBrowserColor(browser, color, title);
            assert(true, `automatic navigation matches ${title} without a manual action`);
        }
        browser._call('Navigate', '(s)', ['back']);
        await this.waitForBrowserColor(browser, '#204060', 'Color root');
        assert(true, 'automatic matching follows Back navigation');
        browser._call('Navigate', '(s)', ['forward']);
        await this.waitForBrowserColor(browser, '#102030', 'Color alpha');
        assert(true, 'automatic matching follows Forward navigation');
        settings.set_string('background-color', '#123456');
        await pause(200);
        assert((await readBrowserState(browser)).backgroundColor === '#123456',
            'a manual color choice remains until the next navigation with automatic matching enabled');
        browser._call('Navigate', '(s)', ['refresh']);
        await this.waitForBrowserColor(browser, '#102030', 'Color alpha');
        assert(true, 'automatic matching runs after refreshing the same URL');
        settings.set_string('home-url', `${origin}/color-redirect`);
        state = await this.waitForBrowserColor(browser, '#34243d', 'Color wrapper');
        assert(state.uri.endsWith('/color-wrapper.html'), 'automatic matching uses the final redirected page');
        settings.set_string('home-url', `${origin}/color-spa.html`);
        await this.waitForBrowserColor(browser, '#204060', 'Color spa');
        state = await this.waitForBrowserColor(browser, '#34243d', 'Color spa next');
        assert(state.uri.endsWith('#next'), 'automatic matching follows single-page app URL changes');
        settings.set_boolean('auto-match-page-color', false);
        await pause(100);
        settings.set_string('background-color', '#123456');
        settings.set_boolean('auto-match-page-color', true);
        for (let i = 0; i < 60 && !(await readBrowserState(browser)).autoMatchPageColor; i++)
            await pause(20);
        settings.set_boolean('auto-match-page-color', false);
        await pause(300);
        assert((await readBrowserState(browser)).backgroundColor === '#123456',
            'turning automatic matching off cancels its queued color update');
        settings.set_string('home-url', `${origin}/color-root.html`);
        await this.waitForBrowser(runtime, 'Color root');
        await pause(200);
        assert((await readBrowserState(browser)).backgroundColor === '#123456',
            'disabled automatic matching keeps the saved color on subsequent navigation');
        browser._call('Navigate', '(s)', ['match-page-color']);
        await this.waitForBrowserColor(browser, '#204060', 'Color root');
        assert(true, 'manual color matching still works after disabling automatic matching');
        assert(browser._process === process && otherColors() === otherPanelColors,
            'automatic color matching retains the browser process and other panels colors');
        settings.reset('show-controls');
        settings.reset('show-color-picker');
        settings.set_string('background-color', originalColor);
        settings.set_string('home-url', originalHome);
        await this.waitForBrowser(runtime, 'Grand Central Desktop browser test');
    },
    async checkColorPickerVisibility(runtime, assert) {
        const browser = runtime.panel('browser');
        const settings = browser.settings;
        const before = await readBrowserState(browser);
        const process = browser._process;
        assert(before.colorPickerVisible, 'browser color-picker button defaults to visible');
        settings.set_boolean('show-color-picker', false);
        await pause(200);
        let state = await readBrowserState(browser);
        assert(state.controlsVisible && !state.colorPickerVisible && state.buttons.length === 5 &&
            !state.buttons.some(button => button.label === 'Match page color'),
        'hiding the color picker removes only its toolbar button and space');
        runtime._turnPanels(-1);
        runtime._turnPanels(1);
        await pause(200);
        assert(!(await readBrowserState(browser)).colorPickerVisible,
            'hidden color picker stays hidden after carousel reveals');
        settings.set_boolean('show-controls', false);
        await pause(100);
        settings.set_boolean('show-controls', true);
        await pause(150);
        state = await readBrowserState(browser);
        assert(state.controlsVisible && !state.colorPickerVisible,
            'restoring the browser toolbar respects the independent color-picker preference');
        browser._call('Navigate', '(s)', ['toggle-expanded']);
        await pause(200);
        state = await readBrowserState(browser);
        assert(state.expanded && !state.colorPickerVisible && state.buttons.at(-1).label === 'Restore browser',
            'expanded browser retains hidden color picker and visible Restore');
        runtime._restoreBrowser.emit('clicked', 1);
        browser._call('Navigate', '(s)', ['match-page-color']);
        for (let i = 0; i < 60; i++) {
            state = await readBrowserState(browser);
            if (state.backgroundColor === '#f6f5f4' && state.colorMatchEnabled)
                break;
            await pause(50);
        }
        assert(state.backgroundColor === '#f6f5f4' && !state.colorPickerVisible,
            'shared right-click color action still works with its toolbar button hidden');
        assert(browser._process === process && state.uri === before.uri && state.title === before.title &&
            state.canGoBack === before.canGoBack && state.canGoForward === before.canGoForward,
        'color-picker visibility changes preserve the browser process, page, and history');
        settings.set_string('background-color', before.backgroundColor);
        settings.reset('show-color-picker');
        await pause(200);
        state = await readBrowserState(browser);
        assert(state.colorPickerVisible && state.buttons.length === 6,
            'color picker can be restored without restarting the browser');
    },
    async checkMobileSite(runtime, assert) {
        let browser = runtime.panel('browser');
        const settings = browser.settings;
        const originalHome = settings.get_string('home-url');
        const origin = originalHome.replace(/\/[^/]*$/, '');
        settings.set_string('home-url', `${origin}/user-agent`);
        browser = await this.waitForBrowser(runtime, 'User agent desktop');
        const original = await readBrowserState(browser);
        const process = browser._process;
        assert(!original.requestMobileSite && !/Mobile\//.test(original.userAgent),
            'browser defaults to its native desktop user agent in HTTP requests and navigator');
        settings.set_int('zoom-percent', 125);
        settings.set_boolean('show-controls', false);
        settings.set_boolean('request-mobile-site', true);
        await this.waitForBrowser(runtime, 'User agent mobile');
        let state = await readBrowserState(browser);
        assert(state.requestMobileSite && /Mobile\//.test(state.userAgent),
            'enabling Request mobile site reloads with matching mobile HTTP and navigator user agents');
        assert(state.uri === original.uri && browser._process === process && state.zoom === 1.25 &&
            !state.controlsVisible && state.canGoBack === original.canGoBack,
        'mobile-site changes retain the current URL, browser process, zoom, controls, and history');
        browser._call('Navigate', '(s)', ['toggle-expanded']);
        await pause(200);
        state = await readBrowserState(browser);
        assert(state.expanded && state.requestMobileSite && state.title === 'User agent mobile' && runtime._restoreBrowser.visible,
            'expansion retains mobile mode and exposes floating Restore with controls hidden');
        runtime._restoreBrowser.emit('clicked', 1);
        await pause(150);
        assert((await readBrowserState(browser)).requestMobileSite, 'restoring browser size retains mobile mode');
        settings.set_boolean('request-mobile-site', false);
        await this.waitForBrowser(runtime, 'User agent desktop');
        state = await readBrowserState(browser);
        assert(state.userAgent === original.userAgent && browser._process === process,
            'turning mobile requests off restores the exact native desktop user agent');
        settings.set_int('zoom-percent', 100);
        settings.set_boolean('show-controls', true);
        settings.set_string('home-url', originalHome);
        await this.waitForBrowser(runtime, 'Grand Central Desktop browser test');
    },
    async checkPageColors(runtime, assert) {
        let browser = runtime._panels[4];
        const settings = browser.settings;
        const originalHome = settings.get_string('home-url');
        const originalColor = settings.get_string('background-color');
        const origin = originalHome.replace(/\/[^/]*$/, '');
        const process = browser._process;
        let previousColor = originalColor;
        for (const [page, title, expected, foreground] of [
            ['index.html', 'Grand Central Desktop browser test', '#f6f5f4', '#181818'],
            ['color-root.html', 'Color root', '#204060', '#ffffff'],
            ['color-wrapper.html', 'Color wrapper', '#34243d', '#ffffff'],
            ['color-alpha.html', 'Color alpha', '#102030', '#ffffff'],
            ['color-transparent.html', 'Color transparent', '#ffffff', '#181818'],
            ['color-gradient.html', 'Color gradient', '#202b3b', '#ffffff'],
        ]) {
            settings.set_string('home-url', `${origin}/${page}`);
            browser = await this.waitForBrowser(runtime, title);
            const before = await readBrowserState(browser);
            assert(before.backgroundColor === previousColor && before.colorMatchEnabled,
                `${title}: navigation keeps the saved frame color until explicitly matched`);
            if (page === 'color-wrapper.html')
                settings.set_boolean('show-controls', false);
            browser._call('Navigate', '(s)', ['match-page-color']);
            let state;
            for (let i = 0; i < 60; i++) {
                state = await readBrowserState(browser);
                if (state.backgroundColor === expected && state.colorMatchEnabled)
                    break;
                await pause(50);
            }
            assert(state.backgroundColor === expected && settings.get_string('background-color') === expected,
                `${title}: color matching saves the current effective page backdrop`);
            assert(state.foregroundColor === foreground && browser._process === process &&
                state.uri === before.uri && state.title === before.title && state.canGoBack === before.canGoBack &&
                state.canGoForward === before.canGoForward,
            `${title}: contrast adapts without replacing the browser or changing its page/history`);
            if (page === 'index.html')
                await this.checkViewportCorners(browser, assert, 'browser-color-matched', 19, [246, 245, 244]);
            if (page === 'color-wrapper.html') {
                assert(!state.controlsVisible, 'page color matching remains available with controls hidden');
                settings.set_boolean('show-controls', true);
            }
            previousColor = expected;
        }
        browser._call('Navigate', '(s)', ['match-page-color']);
        settings.set_string('background-color', '#123456');
        await pause(200);
        assert((await readBrowserState(browser)).backgroundColor === '#123456',
            'a manual color choice supersedes an in-flight page color request');
        settings.set_string('home-url', originalHome);
        await this.waitForBrowser(runtime, 'Grand Central Desktop browser test');
        assert((await readBrowserState(browser)).backgroundColor === '#123456',
            'navigation does not automatically recolor the panel');
        settings.set_string('background-color', originalColor);
    },
    async waitForBrowser(runtime, title) {
        const browser = runtime._panels[4];
        for (let i = 0; i < 100; i++) {
            if (browser._proxy?.get_name_owner()) {
                const state = await readBrowserState(browser);
                if (state.loaded && state.title === title)
                    return browser;
            }
            await pause(100);
        }
        throw new Error(`Browser did not load fixture: ${title}`);
    },
    async checkBrowserPersistence(owner, runtime, assert) {
        const settings = runtime._panels[4].settings;
        const originalHome = settings.get_string('home-url');
        const originalColor = settings.get_string('background-color');
        const origin = originalHome.replace(/\/[^/]*$/, '');
        settings.set_string('home-url', `${origin}/signin`);
        runtime._start = 2;
        runtime._layout();
        await this.waitForBrowser(runtime, 'Fixture signed in');
        settings.set_string('home-url', `${origin}/protected`);
        let browser = await this.waitForBrowser(runtime, 'Fixture sign-in restored');
        assert(true, 'login fixture has persistent and session HttpOnly cookies, localStorage, and IndexedDB');
        const sessionPath = `${GLib.get_user_data_dir()}/grand-central-desktop/browser/session-cookies.json`;
        let session;
        for (let i = 0; i < 40; i++) {
            try {
                const [, data] = GLib.file_get_contents(sessionPath);
                session = JSON.parse(new TextDecoder().decode(data));
                if (session.cookies.some(cookie => cookie.name === 'desk_session'))
                    break;
            } catch (_e) { /* Initial async snapshot may still be pending. */ }
            await pause(100);
        }
        const saved = session?.cookies.find(cookie => cookie.name === 'desk_session');
        assert(saved?.httpOnly && saved.sameSite === 2, 'session restoration preserves HttpOnly and SameSite flags');
        const file = Gio.File.new_for_path(sessionPath);
        assert((file.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode') & 0o777) === 0o600,
            'session cookie snapshot is private to the user');
        await pause(1000);
        const [, countBytes] = GLib.file_get_contents(`${output}/cache-request-count.txt`);
        const requests = new TextDecoder().decode(countBytes);
        const firstProcess = browser._process;
        settings.set_boolean('show-color-picker', false);
        settings.set_boolean('request-mobile-site', true);
        settings.set_boolean('auto-match-page-color', true);
        for (let i = 0; i < 60; i++) {
            const state = await readBrowserState(browser);
            if (state.requestMobileSite && state.loaded && state.title === 'Fixture sign-in restored')
                break;
            await pause(50);
        }
        assert((await readBrowserState(browser)).requestMobileSite,
            'mobile-site mode can be changed while retaining an authenticated website profile');
        runtime.disable();
        runtime.enable();
        runtime._start = 2;
        runtime._layout();
        browser = await this.waitForBrowser(runtime, 'Fixture sign-in restored');
        assert(browser._process !== firstProcess, 'login and website storage survive a complete browser helper restart');
        const autoState = await this.waitForBrowserColor(browser, '#ffffff', 'Fixture sign-in restored');
        assert(autoState.autoMatchPageColor, 'automatic page-color matching survives restart and matches the reopened page');
        assert(!(await readBrowserState(browser)).colorPickerVisible &&
            !(await readBrowserState(browser)).buttons.some(button => button.label === 'Match page color'),
            'hidden color-picker preference survives browser helper restart');
        assert((await readBrowserState(browser)).requestMobileSite && /Mobile\//.test((await readBrowserState(browser)).userAgent),
            'mobile-site preference and authenticated website storage survive browser restart');
        const [, cachedBytes] = GLib.file_get_contents(`${output}/cache-request-count.txt`);
        assert(new TextDecoder().decode(cachedBytes) === requests, 'HTTP cache survives browser helper restart');
        browser._process.force_exit();
        for (let i = 0; i < 60 && !browser._retry.visible; i++) await pause(50);
        assert(browser._retry.visible, 'a failed browser helper exposes Retry without an extension restart');
        browser._retry.emit('clicked', 1);
        browser = await this.waitForBrowser(runtime, 'Fixture sign-in restored');
        assert(Boolean(browser), 'saved login survives an abrupt helper termination');
        const before = owner._grandCentralDesktopLoader.runtime;
        await this.publish(owner, 'browser');
        for (let i = 0; i < 80 && owner._grandCentralDesktopLoader.runtime === before; i++)
            await pause(100);
        runtime = owner._grandCentralDesktopLoader.runtime;
        await this.waitForBrowser(runtime, 'Fixture sign-in restored');
        assert(runtime !== before, 'login survives an automatic update that restarts browser code');
        await this.publish(owner, 'baseline');
        for (let i = 0; i < 80 && owner._grandCentralDesktopLoader.runtime === runtime; i++)
            await pause(100);
        runtime = owner._grandCentralDesktopLoader.runtime;
        await this.waitForBrowser(runtime, 'Fixture sign-in restored');
        runtime._panels[4].settings.set_string('home-url', `${origin}/signout`);
        await this.waitForBrowser(runtime, 'Fixture signed out');
        runtime._panels[4].settings.set_string('home-url', `${origin}/protected`);
        await this.waitForBrowser(runtime, 'Fixture sign-in missing');
        runtime.disable();
        runtime.enable();
        runtime._start = 2;
        runtime._layout();
        await this.waitForBrowser(runtime, 'Fixture sign-in missing');
        assert(true, 'logging out removes saved login data and stays logged out after restart');
        runtime._panels[4].settings.set_boolean('request-mobile-site', false);
        runtime._panels[4].settings.reset('show-color-picker');
        runtime._panels[4].settings.reset('auto-match-page-color');
        runtime._panels[4].settings.set_string('background-color', originalColor);
        runtime._panels[4].settings.set_string('home-url', originalHome);
        await this.waitForBrowser(runtime, 'Grand Central Desktop browser test');
        return runtime;
    },
};
