// SPDX-License-Identifier: GPL-3.0-or-later
// Private browser helper, invoked by the extension only when its panel is shown.
import Gdk from 'gi://Gdk?version=3.0';
import GdkX11 from 'gi://GdkX11?version=3.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import WebKit from 'gi://WebKit2?version=4.1';
import {panelColors, validHomeUrl} from './model.js';
import {BrowserViewport} from './browserViewport.js';
import {PAGE_BACKGROUND_SCRIPT} from './pageColor.js';
import {polishBrowserMenu} from './browserMenu.js';

const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export function createBrowserView({app, profile, settings, initialUri, title, styleId, uriChanged, uuid}) {
    let window;
    let web;
    let viewport;
    let back;
    let forward;
    let refresh;
    let toolbar;
    let expand;
    let matchColor;
    let colorAction;
    let colorRequest = null;
    let autoColorTimeout = 0;
    let colorApplyTimeout = 0;
    let visible = false;
    let geometry = [0, 0, 420, 660];
    let loaded = false;
    let cssProvider;
    let closing = false;
    let geometryIdle = 0;
    let coordinateScale = 1;

    function applyGeometry() {
        const scale = window.get_scale_factor();
        const [x, y, width, height] = geometry.map(v => Math.round(v * coordinateScale / scale));
        const compact = width < 270;
        const tiny = width < 220;
        toolbar.get_style_context()[compact ? 'add_class' : 'remove_class']('compact');
        toolbar.get_style_context()[tiny ? 'add_class' : 'remove_class']('tiny');
        toolbar.spacing = tiny ? 2 : compact ? 4 : 6;
        window.move(x, y);
        if (geometryIdle)
            GLib.Source.remove(geometryIdle);
        // Let GTK validate compact CSS first; otherwise resize is clamped to the
        // previous, wider toolbar's minimum and stays wider than the panel.
        geometryIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            geometryIdle = 0;
            if (!closing)
                window.resize(Math.max(160, width), Math.max(200, height));
            return GLib.SOURCE_REMOVE;
        });
    }

    function home() {
        if (!profile.initialized) {
            profile.ready.then(home);
            return;
        }
        const url = settings.get_string('home-url').trim();
        if (!validHomeUrl(url) || url === 'about:blank') {
            web.load_html('<!doctype html><html><meta name="viewport" content="width=device-width"><body style="font:16px sans-serif;background:#181818;color:#ddd;padding:24px;line-height:1.5"><h2>Your browser panel</h2><p>Right-click and choose <b>Grand Central Desktop Settings</b>, then set a home URL under Browser.</p></body></html>', 'about:blank');
        } else {
            web.load_uri(url);
        }
    }

    function navigate(action) {
        if (action === 'toggle-expanded')
            settings.set_boolean('expanded', !settings.get_boolean('expanded'));
        else if (action === 'match-page-color')
            matchPageColor();
        else if (action === 'back' && web.can_go_back())
            web.go_back();
        else if (action === 'forward' && web.can_go_forward())
            web.go_forward();
        else if (action === 'home')
            home();
        else if (action === 'refresh') {
            if (web.is_loading) web.stop_loading(); else web.reload();
        }
    }

    function syncColorAction() {
        const enabled = loaded && !closing && !colorRequest;
        matchColor.sensitive = enabled;
        colorAction?.set_enabled(enabled);
    }

    function syncControls() {
        toolbar.visible = settings.get_boolean('show-controls');
        matchColor.visible = settings.get_boolean('show-color-picker');
    }

    function cancelColorRequest() {
        if (colorApplyTimeout) {
            GLib.Source.remove(colorApplyTimeout);
            colorApplyTimeout = 0;
        }
        if (autoColorTimeout) {
            GLib.Source.remove(autoColorTimeout);
            autoColorTimeout = 0;
        }
        colorRequest?.cancel();
        colorRequest = null;
        syncColorAction();
    }

    function scheduleAutoColorMatch() {
        if (!loaded || closing || !settings.get_boolean('auto-match-page-color'))
            return;
        if (autoColorTimeout)
            GLib.Source.remove(autoColorTimeout);
        // Give the new page/SPA route a moment to apply its styles. No polling or
        // page mutation observer is needed for navigation-triggered matching.
        autoColorTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            autoColorTimeout = 0;
            matchPageColor();
            return GLib.SOURCE_REMOVE;
        });
    }

    function matchPageColor() {
        if (!loaded || closing)
            return;
        cancelColorRequest();
        const request = new Gio.Cancellable();
        const previousColor = settings.get_string('background-color');
        colorRequest = request;
        syncColorAction();
        web.evaluate_javascript(PAGE_BACKGROUND_SCRIPT, -1, 'grand-central-desktop-color', null, request, (view, result) => {
            let color;
            try {
                color = view.evaluate_javascript_finish(result)?.to_string();
            } catch (_error) {
                // A navigation or a closed page can invalidate an inspection.
            }
            if (colorRequest !== request)
                return;
            if (request.is_cancelled() || !/^#[0-9a-f]{6}$/i.test(color ?? '')) {
                colorRequest = null;
                syncColorAction();
                return;
            }
            // Deliver pending cross-process settings notifications before
            // committing a sampled color; a newer manual choice wins.
            colorApplyTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                colorApplyTimeout = 0;
                if (colorRequest !== request) return GLib.SOURCE_REMOVE;
                colorRequest = null;
                if (!request.is_cancelled() && settings.get_string('background-color') === previousColor)
                    settings.set_string('background-color', color.toLowerCase());
                syncColorAction();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    function expansionLabel() {
        return settings.get_boolean('expanded') ? 'Restore browser' : 'Expand browser';
    }

    function syncExpansion() {
        const expanded = settings.get_boolean('expanded');
        expand.set_image(new Gtk.Image({icon_name: expanded ? 'view-restore-symbolic' : 'view-fullscreen-symbolic',
            icon_size: Gtk.IconSize.BUTTON}));
        expand.tooltip_text = expansionLabel();
        expand.get_accessible().set_name(expansionLabel());
    }

    function style() {
        const colors = panelColors(settings.get_string('background-color'));
        if (cssProvider)
            Gtk.StyleContext.remove_provider_for_screen(window.get_screen(), cssProvider);
        cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(`window { background-color: transparent; }
            .${styleId} { background-color: ${colors.background}; color: ${colors.foreground};
                border: 1px solid ${colors.border}; border-radius: ${settings.get_int('corner-radius')}px; padding: 12px; }
            .${styleId} button { background: transparent; color: ${colors.foreground}; border: none; box-shadow: none; padding: 6px; min-width: 20px; min-height: 20px; border-radius: 10px; }
            .${styleId} button:hover { background: ${colors.hover}; }
            .${styleId} button:disabled { opacity: 0.35; }
            .${styleId} .desk-browser-toolbar { padding-bottom: 12px; }
            .${styleId} .desk-browser-toolbar.compact button { padding: 4px; min-width: 16px; }
            .${styleId} .desk-browser-toolbar.tiny button { padding: 2px; min-width: 12px; min-height: 16px; }`);
        Gtk.StyleContext.add_provider_for_screen(window.get_screen(), cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        viewport.setRadius(settings.get_int('corner-radius'));
    }

    window = new Gtk.ApplicationWindow({application: app, title,
        decorated: false, resizable: true, skip_taskbar_hint: true, skip_pager_hint: true,
        type_hint: Gdk.WindowTypeHint.DESKTOP, default_width: 420, default_height: 660});
    window.set_keep_below(true);
    window.stick();
    const visual = window.get_screen().get_rgba_visual();
    if (visual)
        window.set_visual(visual);
    const root = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    root.get_style_context().add_class('desk-browser');
    root.get_style_context().add_class(styleId);
    window.connect('notify::scale-factor', () => applyGeometry());
    window.add(root);
    toolbar = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 6});
    toolbar.get_style_context().add_class('desk-browser-toolbar');
    root.pack_start(toolbar, false, false, 0);
    const context = profile.context;
    web = WebKit.WebView.new_with_context(context);
    web.set_zoom_level(settings.get_int('zoom-percent') / 100);
    const webSettings = web.get_settings();
    webSettings.enable_developer_extras = false;
    webSettings.set_user_agent(settings.get_boolean('request-mobile-site') ? MOBILE_USER_AGENT : null);
    const controls = [['back', 'go-previous-symbolic', 'Back'], ['home', 'go-home-symbolic', 'Home'],
        ['refresh', 'view-refresh-symbolic', 'Refresh'], ['forward', 'go-next-symbolic', 'Forward'],
        ['match-page-color', 'color-select-symbolic', 'Match page color']];
    for (const [action, icon, label] of controls) {
        const button = new Gtk.Button({image: new Gtk.Image({icon_name: icon, icon_size: Gtk.IconSize.BUTTON}), tooltip_text: label});
        button.get_accessible().set_name(label);
        button.connect('clicked', () => navigate(action));
        toolbar.pack_start(button, false, false, 0);
        if (action === 'back')
            back = button;
        if (action === 'forward')
            forward = button;
        if (action === 'refresh') refresh = button;
        if (action === 'match-page-color')
            matchColor = button;
    }
    // Carousel reveals call show_all(); keep this independently hidden button
    // under its own preference rather than GTK's recursive visibility reset.
    matchColor.no_show_all = true;
    syncControls();
    expand = new Gtk.Button();
    expand.connect('clicked', () => navigate('toggle-expanded'));
    toolbar.pack_end(expand, false, false, 0);
    syncExpansion();
    viewport = new BrowserViewport();
    viewport.add(web);
    root.pack_start(viewport, true, true, 0);
    web.connect('load-changed', (_view, event) => {
        loaded = event === WebKit.LoadEvent.FINISHED;
        if (event === WebKit.LoadEvent.STARTED)
            cancelColorRequest();
        syncColorAction();
        back.sensitive = web.can_go_back();
        forward.sensitive = web.can_go_forward();
        if (loaded)
            scheduleAutoColorMatch();
    });
    web.connect('notify::is-loading', () => {
        const loading = web.is_loading;
        refresh.set_image(new Gtk.Image({icon_name: loading ? 'process-stop-symbolic' : 'view-refresh-symbolic', icon_size: Gtk.IconSize.BUTTON}));
        refresh.tooltip_text = loading ? 'Stop loading' : 'Refresh';
        refresh.get_accessible().set_name(refresh.tooltip_text);
    });
    web.connect('notify::uri', () => {
        uriChanged(web.get_uri());
        cancelColorRequest();
        scheduleAutoColorMatch();
    });
    web.connect('permission-request', (_view, request) => {
        request.deny();
        return true;
    });
    web.connect('decide-policy', (_view, decision, type) => {
        if (type === WebKit.PolicyDecisionType.NEW_WINDOW_ACTION) {
            const uri = decision.get_navigation_action().get_request().get_uri();
            if (validHomeUrl(uri))
                web.load_uri(uri);
            decision.ignore();
            return true;
        }
        if (type === WebKit.PolicyDecisionType.NAVIGATION_ACTION) {
            const uri = decision.get_navigation_action().get_request().get_uri();
            if (!validHomeUrl(uri) && !uri.startsWith('about:')) {
                decision.ignore();
                return true;
            }
        }
        return false;
    });
    const preferences = new Gio.SimpleAction({name: 'deskpanel-settings'});
    preferences.connect('activate', () => Gio.Subprocess.new(['gnome-extensions', 'prefs', uuid], Gio.SubprocessFlags.NONE));
    const expansion = new Gio.SimpleAction({name: 'expand-browser'});
    expansion.connect('activate', () => navigate('toggle-expanded'));
    colorAction = new Gio.SimpleAction({name: 'match-page-color'});
    colorAction.connect('activate', matchPageColor);
    syncColorAction();
    const menuItems = () => [[expansion, expansionLabel()], [colorAction, 'Match page color'],
        [preferences, 'Grand Central Desktop Settings']];
    web.connect('context-menu', (_view, menu, _event, hit) => {
        polishBrowserMenu(menu, hit?.get_link_uri(), uri => web.load_uri(uri));
        for (const [action, label] of menuItems())
            menu.append(WebKit.ContextMenuItem.new_from_gaction(action, label, null));
        return false;
    });
    toolbar.connect('button-press-event', (_widget, event) => {
        if (event.get_button()[1] !== 3)
            return false;
        const menu = new Gtk.Menu();
        for (const [action, label] of menuItems()) {
            const item = new Gtk.MenuItem({label});
            item.sensitive = action.get_enabled();
            item.connect('activate', () => action.activate(null));
            menu.append(item);
        }
        menu.show_all();
        menu.popup_at_pointer(event);
        return true;
    });
    const settingsSignal = settings.connect('changed', (_settings, key) => {
        if (key === 'background-color')
            cancelColorRequest();
        if (key === 'auto-match-page-color') {
            cancelColorRequest();
            scheduleAutoColorMatch();
        }
        style();
        if (key === 'home-url')
            home();
        if (key === 'zoom-percent')
            web.set_zoom_level(settings.get_int('zoom-percent') / 100);
        if (key === 'request-mobile-site') {
            webSettings.set_user_agent(settings.get_boolean('request-mobile-site') ? MOBILE_USER_AGENT : null);
            if (profile.initialized && web.get_uri())
                web.reload();
        }
        if (key === 'show-controls' || key === 'show-color-picker')
            syncControls();
        if (key === 'expanded')
            syncExpansion();
    });
    style();
    profile.ready.then(() => {
        if (closing)
            return;
        const restoreUri = initialUri;
        if (restoreUri && validHomeUrl(restoreUri) && restoreUri !== 'about:blank')
            web.load_uri(restoreUri);
        else
            home();
    });
    const api = {
        SetCoordinateScale(scale) {
            if (!Number.isInteger(scale) || scale < 1 || scale > 4) throw new Error('Invalid browser coordinate scale');
            if (coordinateScale === scale && window.get_scale_factor() === scale) return;
            coordinateScale = scale;
            GdkX11.X11Display.prototype.set_window_scale.call(window.get_display(), scale);
            applyGeometry();
        },
        SetGeometry(x, y, width, height) {
            geometry = [x, y, width, height];
            applyGeometry();
        },
        SetVisible(show) {
            visible = show;
            if (show) {
                window.show_all();
                syncControls();
                applyGeometry();
                window.get_window()?.lower();
            } else {
                window.hide();
            }
        },
        Navigate: navigate,
        GetState() {
            return JSON.stringify({uri: web.get_uri(), title: web.get_title(), loaded, loading: web.is_loading, refreshLabel: refresh.tooltip_text,
                canGoBack: web.can_go_back(), canGoForward: web.can_go_forward(),
                visible, geometry, coordinateScale, controls: toolbar.get_children().length,
                zoom: web.get_zoom_level(), controlsVisible: toolbar.visible,
                colorPickerVisible: toolbar.visible && matchColor.visible,
                autoMatchPageColor: settings.get_boolean('auto-match-page-color'),
                requestMobileSite: settings.get_boolean('request-mobile-site'), userAgent: webSettings.get_user_agent(),
                expanded: settings.get_boolean('expanded'), expandLabel: expansionLabel(),
                backgroundColor: settings.get_string('background-color'),
                foregroundColor: panelColors(settings.get_string('background-color')).foreground,
                colorMatchEnabled: colorAction.get_enabled(),
                persistentProfile: !context.is_ephemeral(),
                viewport: (() => {
                    const [, x, y] = viewport.translate_coordinates(window.get_child(), 0, 0);
                    return {x, y, width: viewport.get_allocated_width(), height: viewport.get_allocated_height(),
                        radius: viewport.radius, scale: window.get_scale_factor() / coordinateScale};
                })(),
                buttons: toolbar.get_children().filter(button => button.visible).map(button => {
                    const [, x, y] = button.translate_coordinates(window.get_child(), 0, 0);
                    const allocation = button.get_allocation();
                    return {x, y, width: allocation.width, height: allocation.height, label: button.tooltip_text};
                })});
        },
        destroy() {
            closing = true;
            cancelColorRequest();
            web.stop_loading();
            for (const id of [geometryIdle, autoColorTimeout, colorApplyTimeout]) if (id) GLib.Source.remove(id);
            settings.disconnect(settingsSignal);
            Gtk.StyleContext.remove_provider_for_screen(window.get_screen(), cssProvider);
            window.destroy();
        },
        stop() { closing = true; cancelColorRequest(); web.stop_loading(); },
    };
    return api;
}
