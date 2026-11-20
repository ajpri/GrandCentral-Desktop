// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {recentFirst} from './lib/model.js';
import {PANEL_IDS, panelOrder} from './lib/panels.js';
import {AppSource} from './lib/apps.js';
import {createPanel} from './lib/panelFactory.js';
import {Lifetime} from './lib/lifetime.js';
import {BrowserSettings} from './lib/browserSettings.js';
import {connectedMonitors, selectedMonitors} from './lib/monitors.js';
import {readMonitorMap} from './lib/monitorModel.js';
import {FileSource, desktopDirectory, readDesktop, readDocuments} from './lib/files.js';
import {MountSource, desktopItems} from './lib/mounts.js';
import {MediaWidget} from './lib/mediaWidget.js';
import {WeatherWidget} from './lib/weatherWidget.js';
import {CalendarWidget} from './lib/calendarWidget.js';
import {ContextActions} from './lib/contextActions.js';
import {attachDesktopLayer, buildDesktopControls, layoutDesktop} from './lib/desktop.js';

export default class GrandCentralDesktop extends Extension {
    // Preserve ordered iteration for layout/tests while keeping a single
    // authoritative registry for construction and named lookup.
    get _panels() {
        return this._panelsById ? [...this._panelsById.values()] : null;
    }

    panel(id) {
        return this._panelsById?.get(id);
    }

    enable() {
        const restored = this._reloadState;
        this._reloadState = null;
        this._reloadRetainedBrowser = null;
        this._pendingCalculatorState = restored?.calculator ?? null;
        this._life = new Lifetime();
        this._settings = this.getSettings();
        const monitors = connectedMonitors();
        this._monitorKey = restored?.monitorKey ?? this._monitorKey ??
            (selectedMonitors(this._settings, monitors)[0] ?? monitors[0])?.id ?? 'default';
        this._monitorSpec = monitors.find(monitor => monitor.id === this._monitorKey) ?? this._monitorSpec;
        this._active = this._secondaryHost ? this._active : true;
        this._extraSurfaces = new Map();
        this._savedMonitorStates = restored?.monitors ?? {};
        if (this._browserService?._disposed) this._browserService = null;
        this._browserService ??= restored?.browser?._service;
        let savedStart = 0;
        try { savedStart = readMonitorMap(this._settings.get_string('monitor-layouts'))[this._monitorKey]?.start ?? 0; } catch (_error) { /* Defaults remain usable. */ }

        this._privacy = new Gio.Settings({schema_id: 'org.gnome.desktop.privacy'});
        this._appSystem = Shell.AppSystem.get_default();
        this._windowTracker = Shell.WindowTracker.get_default();
        this._start = restored?.start ?? savedStart;
        this._minimized = restored?.minimized ?? [];
        this._panelsById = new Map();
        this._panelOrder = panelOrder(this._settings.get_strv('panel-order'));
        this._root = new St.Widget({name: 'grand-central-desktop-desktop', layout_manager: new Clutter.FixedLayout()});
        attachDesktopLayer(this._root, this._life);
        Main.layoutManager.trackChrome(this._root, {affectsStruts: false});
        for (const id of PANEL_IDS) {
            const baseSettings = this._settings.get_child(id);
            const settings = id === 'browser' ? restored?.browser?.settings ?? new BrowserSettings(this._settings, baseSettings, this._monitorKey,
                !this._secondaryHost) : baseSettings;
            const panel = createPanel(id, settings, this, restored);
            this._panelsById.set(id, panel);
            panel.actor._grandCentralDesktopPanel = panel;
            if (restored?.pages?.[id] !== undefined)
                panel._restorePage = restored.pages[id];
            this._root.add_child(panel.actor);
            this._life.connect(settings, 'changed', (_settings, key) => {
                panel.updateStyle();
                this._layout();
                if (key === 'item-limit')
                    this._refreshSources();
                if (id === 'desktop' && key === 'show-mounts')
                    this._refreshDesktop();
            });
            panel.updateStyle();
        }
        this._buildCarousel();
        this._media = new MediaWidget(() => this._layout());
        this._root.add_child(this._media.actor);
        this._weather = new WeatherWidget(() => this._layout());
        this._root.add_child(this._weather.actor);
        this._calendar = new CalendarWidget(this._settings, () => this._layout());
        this._root.add_child(this._calendar.actor);
        this._buildContextMenu();
        this._appsSource = new AppSource(() => this._refreshApps());
        this._desktopSource = new FileSource(() => this._refreshDesktop(true));
        this._mountSource = new MountSource(() => {
            if (this.panel('desktop').settings.get_boolean('show-mounts'))
                this._refreshDesktop();
        });
        this._documentsSource = new FileSource(() => this._refreshDocuments());
        this._recentFile = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']));
        this._documentsSource.watch(this._recentFile);
        this._watchDesktop();
        this._life.connect(this._settings, 'changed', (_settings, key) => {
            if (key === 'panel-order') {
                const previous = this._panelOrder.filter(id =>
                    this.panel(id).settings.get_boolean('enabled'));
                const first = previous[this._start];
                this._panelOrder = panelOrder(this._settings.get_strv('panel-order'));
                const next = this._panelOrder.filter(id =>
                    this.panel(id).settings.get_boolean('enabled'));
                this._start = Math.max(0, next.indexOf(first));
                this._persistStart();
            }
            if (key === 'recent-programs') {
                this._refreshPrograms();
                return;
            }
            if (key === 'desktop-directory')
                this._watchDesktop();
            if (['desktop-directory', 'show-hidden', 'desktop-sort'].includes(key))
                this._refreshDesktop();
            this._layout();
        });
        this._life.connect(this._privacy, 'changed', () => {
            if (!this._privacy.get_boolean('remember-app-usage'))
                this._settings.set_strv('recent-programs', []);
            this._refreshPrograms();
            this._refreshDocuments();
        });
        this._life.connect(this._appSystem, 'installed-changed', () => this._refreshPrograms());
        this._life.connect(this._appSystem, 'app-state-changed', (_system, app) => {
            if (app.get_state() === Shell.AppState.RUNNING)
                this._rememberApp(app);
        });
        this._life.connect(global.display, 'notify::focus-window', () => {
            const window = global.display.focus_window;
            if (window)
                this._rememberApp(this._windowTracker.get_window_app(window));
        });
        this._life.connect(Main.layoutManager, 'monitors-changed', () => this._layout());
        this._life.connect(St.ThemeContext.get_for_stage(global.stage), 'notify::scale-factor', () => this._layout());
        this._life.connect(global.display, 'workareas-changed', () => this._layout());
        this._life.connect(global.window_manager, 'switch-workspace', () => {
            this._minimized = [];
            this._layout();
        });
        for (const [name, action] of [
            ['grand-central-desktop-show-desktop', () => this._showDesktop()],
            ['grand-central-desktop-next', () => this._turnPanelsAtPointer(1)],
            ['grand-central-desktop-previous', () => this._turnPanelsAtPointer(-1)],
        ])
            if (!this._secondaryHost) Main.wm.addKeybinding(name, this._settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, action);
        if (!this._privacy.get_boolean('remember-app-usage'))
            this._settings.set_strv('recent-programs', []);
        const focused = global.display.focus_window;
        if (focused)
            this._rememberApp(this._windowTracker.get_window_app(focused));
        this._refreshSources();
        if (restored?.calculator) {
            this._life.idle(() => {
                const panel = this.panel('calculator');
                const state = restored.calculator;
                panel.entry.set_text(state.text);
                panel.history.text = state.history;
                panel.status.text = state.status;
                panel._memory = state.memory;
                panel._solved = state.solved;
                panel._error = Boolean(state.error);
                if (panel._error) panel.entry.add_style_class_name('dp-error');
                this._pendingCalculatorState = null;
            });
        }
        this._ready = true;
        this._layout();
    }

    _buildCarousel() {
        buildDesktopControls(this);
    }

    _buildContextMenu() {
        this._contextActions = new ContextActions(this);
        this._menuAnchor = new St.Widget({width: 1, height: 1});
        Main.uiGroup.add_child(this._menuAnchor);
        this._contextMenu = new PopupMenu.PopupMenu(this._menuAnchor, 0, St.Side.TOP);
        Main.uiGroup.add_child(this._contextMenu.actor);
        this._contextMenu.actor.hide();
        // Shell may destroy uiGroup before emitting its final work-area change.
        this._life.connect(this._contextMenu.actor, 'destroy', () => { this._contextMenu = null; });
        this._contextMenu.addAction('Grand Central Desktop Settings', () => this.openPreferences());
        this._menuManager = new PopupMenu.PopupMenuManager(this._menuAnchor);
        this._menuManager.addMenu(this._contextMenu);
        this._life.connect(this._root, 'captured-event', (_actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === 3) {
                const [x, y] = event.get_coords();
                return this._openContextMenu(x, y) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._life.connect(this._root, 'key-press-event', (_actor, event) => {
            const key = event.get_key_symbol();
            if (key !== Clutter.KEY_Menu && !(key === Clutter.KEY_F10 && (event.get_state() & Clutter.ModifierType.SHIFT_MASK)))
                return Clutter.EVENT_PROPAGATE;
            const actor = global.stage.get_key_focus();
            if (!actor || !this._root.contains(actor))
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = actor.get_transformed_position();
            const [width, height] = actor.get_transformed_size();
            return this._openContextMenu(x + width / 2, y + height / 2, actor)
                ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        });
    }

    _openContextMenu(x, y, actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y)) {
        const actions = this._contextActions.forActor(actor);
        if (actions === null)
            return false;
        this._contextMenu.close();
        this._contextMenu.removeAll();
        for (const action of actions)
            this._contextMenu.addAction(action.label, () => this._contextActions.run(action));
        if (actions.length)
            this._contextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._contextMenu.addAction('Grand Central Desktop Settings', () => this.openPreferences());
        this._menuAnchor.set_position(Math.round(x), Math.round(y));
        this._contextMenu.open();
        return true;
    }

    _layout() {
        if (!this._root) return;
        if (this._secondaryHost || !this._ready) {
            layoutDesktop(this);
            if (this._ready) this._persistStart();
            return;
        }
        if (this._syncingDisplays) return;
        this._syncingDisplays = true;
        try {
            const monitors = connectedMonitors();
            const selected = new Set(selectedMonitors(this._settings, monitors).map(monitor => monitor.id));
            const candidates = new Map(monitors.filter(monitor => selected.has(monitor.id)).map(monitor => [monitor.id, monitor]));
            for (const [id, state] of Object.entries(this._savedMonitorStates)) {
                if (state.browser?._alive && !candidates.has(id)) candidates.set(id, state.monitorSpec ?? {id});
            }
            for (const monitor of candidates.values()) {
                if (monitor.id === this._monitorKey || this._extraSurfaces.has(monitor.id)) continue;
                const surface = new this.constructor({...this.metadata, dir: this.dir, path: this.path});
                surface._secondaryHost = this;
                surface._monitorKey = monitor.id;
                surface._monitorSpec = monitor;
                surface._active = selected.has(monitor.id);
                surface._browserService = this._browserService;
                surface.adoptReloadState(this._savedMonitorStates[monitor.id]);
                this._extraSurfaces.set(monitor.id, surface);
                surface.enable();
                delete this._savedMonitorStates[monitor.id];
            }
            for (const surface of [this, ...this._extraSurfaces.values()]) {
                const wasConnected = Boolean(surface._monitorSpec);
                surface._monitorSpec = monitors.find(monitor => monitor.id === surface._monitorKey);
                if (!surface._monitorSpec && surface._secondaryHost) {
                    this._savedMonitorStates[surface._monitorKey] = surface.captureReloadState(false, surface.panel('browser')?._lastUri);
                    surface.disable();
                    this._extraSurfaces.delete(surface._monitorKey);
                    continue;
                }
                surface._active = Boolean(surface._monitorSpec && selected.has(surface._monitorKey));
                layoutDesktop(surface);
                if (!surface._monitorSpec && wasConnected) {
                    const browser = surface.panel('browser');
                    browser._service.suspend(browser);
                }
                surface._persistStart();
            }
        } finally { this._syncingDisplays = false; }
    }

    _persistStart() {
        if (!this._settings || !this._monitorKey) return;
        let map;
        try { map = readMonitorMap(this._settings.get_string('monitor-layouts')); } catch (_error) { map = {}; }
        const count = this._panelOrder.filter(id => this.panel(id).settings.get_boolean('enabled')).length;
        const start = count ? ((this._start % count) + count) % count : 0;
        if (map[this._monitorKey]?.start === start) return;
        map[this._monitorKey] = {start};
        this._settings.set_string('monitor-layouts', JSON.stringify(map));
    }

    _surfaceAt(x, y) {
        return [this, ...this._extraSurfaces.values()].find(surface => {
            const monitor = surface._monitorSpec;
            return surface._active && monitor && x >= monitor.x && x < monitor.x + monitor.width &&
                y >= monitor.y && y < monitor.y + monitor.height;
        });
    }

    _turnPanelsAtPointer(delta) {
        const [x, y] = global.get_pointer();
        (this._surfaceAt(x, y) ?? [this, ...this._extraSurfaces.values()].find(surface => surface._active))?._turnPanels(delta);
    }

    _turnPanels(delta) {
        this._contextMenu?.close();
        const browser = this.panel('browser');
        if (browser.actor.visible && browser.settings.get_boolean('expanded'))
            return;
        this._start += delta;
        this._persistStart();
        this._layout();
    }

    _rememberApp(app) {
        if (!app || !this._privacy.get_boolean('remember-app-usage'))
            return;
        const id = app.get_id();
        if (!id || !app.get_app_info()?.should_show())
            return;
        const history = this._settings.get_strv('recent-programs');
        if (history[0] !== id)
            this._settings.set_strv('recent-programs', recentFirst(history, id, 500));
    }

    _refreshPrograms() {
        const panel = this.panel('programs');
        if (!this._privacy.get_boolean('remember-app-usage')) {
            panel.setItems([], 'App history is disabled in\nGNOME Privacy settings.');
            return;
        }
        const items = this._settings.get_strv('recent-programs').map(id => this._appSystem.lookup_app(id))
            .filter(app => app?.get_app_info()?.should_show()).map(app => ({id: app.get_id(), label: app.get_name(), app}));
        panel.setItems(items.slice(0, panel.settings.get_int('item-limit')),
            'Your recent programs will appear here\nas you open or switch to apps.');
    }

    _watchDesktop() {
        this._desktopPath = desktopDirectory(this._settings);
        this._desktopSource.watch(Gio.File.new_for_path(this._desktopPath), true);
    }

    async _refreshDesktop(rewatch = false) {
        if (rewatch)
            this._watchDesktop();
        const source = this._desktopSource;
        const panel = this.panel('desktop');
        const result = await source.refresh(cancellable => readDesktop(this._desktopPath,
            this._settings.get_boolean('show-hidden'), this._settings.get_string('desktop-sort'),
            panel.settings.get_int('item-limit'), cancellable));
        if (result) {
            const mounts = panel.settings.get_boolean('show-mounts') ? this._mountSource.items() : [];
            panel.setItems(desktopItems(result.items, mounts, panel.settings.get_int('item-limit')), result.message);
        }
    }

    async _refreshDocuments() {
        const source = this._documentsSource;
        const panel = this.panel('documents');
        // Cancel an in-flight read before changing privacy state.
        const result = await source.refresh(async cancellable => {
            if (!this._privacy.get_boolean('remember-recent-files') || this._privacy.get_int('recent-files-max-age') === 0)
                return {items: [], message: 'Recent files are disabled in\nGNOME Privacy settings.'};
            return readDocuments(this._recentFile, panel.settings.get_int('item-limit'),
                this._privacy.get_int('recent-files-max-age'), cancellable);
        });
        if (result)
            panel.setItems(result.items, result.message);
    }

    _refreshSources() {
        this._refreshPrograms();
        this._refreshDesktop();
        this._refreshDocuments();
        this._refreshApps();
    }

    _refreshApps() {
        this.panel('apps').setItems(this._appsSource.items(),
            'No applications are available.');
    }

    _activate(item) {
        try {
            if (item.app) {
                item.app.activate();
            } else if (item.desktopFile) {
                if (!item.trusted)
                    throw new Error('This application shortcut is not trusted. Mark it executable in Files before launching it.');
                const file = Gio.File.new_for_uri(item.uri);
                const app = Gio.DesktopAppInfo.new_from_filename(file.get_path());
                if (!app)
                    throw new Error('This application shortcut is invalid.');
                app.launch([], global.create_app_launch_context(0, -1));
            } else {
                Gio.AppInfo.launch_default_for_uri_async(item.uri, global.create_app_launch_context(0, -1), null,
                    (_source, result) => {
                        try {
                            Gio.AppInfo.launch_default_for_uri_finish(result);
                        } catch (e) {
                            Main.notify('Grand Central Desktop', e.message);
                        }
                    });
            }
        } catch (e) {
            Main.notify('Grand Central Desktop', e.message);
        }
    }

    _showDesktop() {
        const workspace = global.workspace_manager.get_active_workspace();
        if (this._minimized.length) {
            for (const window of this._minimized) {
                if (window.get_compositor_private() && window.get_workspace() === workspace)
                    window.unminimize();
            }
            this._minimized = [];
            return;
        }
        this._minimized = workspace.list_windows().filter(window =>
            !window.skip_taskbar && !window.minimized && window.can_minimize());
        for (const window of this._minimized)
            window.minimize();
        Main.overview.hide();
    }

    adoptReloadState(state) {
        this._reloadState = state;
    }

    captureReloadState(retainBrowser, browserUri = null) {
        const calculator = this.panel('calculator');
        const browser = this.panel('browser');
        const state = {
            start: this._start,
            monitorKey: this._monitorKey,
            monitorSpec: this._monitorSpec,
            monitors: {...this._savedMonitorStates, ...Object.fromEntries([...this._extraSurfaces].map(([key, surface]) => [key,
                surface.captureReloadState(retainBrowser, surface.panel('browser')?._lastUri)]))},
            minimized: this._minimized,
            pages: Object.fromEntries((this._panels ?? []).filter(panel => panel._page !== undefined)
                .map(panel => [panel.id, panel._page])),
            apps: this.panel('apps')?.captureNavigation(),
            documents: this.panel('documents')?.captureNavigation(),
            notes: this.panel('notes')?.captureState(),
            calculator: this._pendingCalculatorState ?? (calculator ? {text: calculator.entry.get_text(), history: calculator.history.text,
                status: calculator.status.text, memory: calculator._memory, solved: calculator._solved, error: Boolean(calculator._error)} : null),
            browserUri: browserUri ?? browser?._lastUri,
            browser: retainBrowser && browser?._alive ? browser : null,
        };
        if (state.browser && !this._secondaryHost) {
            this._reloadRetainedBrowser = browser;
            browser.actor.get_parent()?.remove_child(browser.actor);
        }
        return state;
    }

    disable() {
        this._ready = false;
        for (const surface of this._extraSurfaces?.values() ?? []) {
            if (this._reloadRetainedBrowser) surface._reloadRetainedBrowser = surface.panel('browser');
            surface.disable();
        }
        this._extraSurfaces?.clear();
        for (const name of ['grand-central-desktop-show-desktop', 'grand-central-desktop-next', 'grand-central-desktop-previous'])
            if (!this._secondaryHost) Main.wm.removeKeybinding(name);
        this._life?.destroy();
        this._desktopSource?.destroy();
        this._mountSource?.destroy();
        this._documentsSource?.destroy();
        this._appsSource?.destroy();
        this._media?.destroy();
        this._weather?.destroy();
        this._calendar?.destroy();
        this._contextActions?.destroy();
        this._contextMenu?.destroy();
        this._menuAnchor?.destroy();
        const browser = this.panel('browser');
        if (browser !== this._reloadRetainedBrowser)
            browser?.destroy();
        else
            browser?.actor.get_parent()?.remove_child(browser.actor);
        this._reloadRetainedBrowser = null;
        if (this._root) {
            Main.layoutManager.untrackChrome(this._root);
            this._root.destroy();
        }
        this._root = null;
        this._contextMenu = null;
        this._contextActions = null;
        this._menuAnchor = null;
        this._menuManager = null;
        this._panelsById = null;
        this._settings = null;
        this._privacy = null;
        this._life = null;
        this._desktopSource = null;
        this._mountSource = null;
        this._documentsSource = null;
        this._appsSource = null;
        this._media = null;
        this._weather = null;
        this._calendar = null;
        this._panelOrder = null;
        this._recentFile = null;
        this._appSystem = null;
        this._windowTracker = null;
        this._minimized = null;
        this._carousel = null;
        this._previous = null;
        this._next = null;
        this._restoreBrowser = null;
        this._carouselLabel = null;
        this._settingsButton = null;
    }
}
