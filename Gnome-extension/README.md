# Grand Central Desktop

Version **0.1**.

A GNOME Shell extension for a customizable desktop carousel. Three rounded, solid-color panels are visible at once; outer left/right arrows move through seven panels:

1. **Recent Programs** — applications ordered by the last time you launch or focus them.
2. **Desktop** — files, folders, and application shortcuts from your Desktop folder, with optional mounted drives.
3. **Recent Documents** — local recent files reported by applications to GNOME.
4. **Calculator** — keyboard and mouse input, arithmetic, parentheses, powers, square root, percentages, and memory.
5. **Web Browser** — a real interactive WebKit view with Back, Home, Refresh, Forward, and an Expand/Restore button at the top.
6. **All Apps** — every available application, following GNOME Show Apps and your active app-grid sorting extension.
7. **Quick Notes** — one automatically saved plain-text note.

Panels sit inside GNOME's background layer, above the wallpaper and below application windows. The normal top bar and Activities overview remain available. Navigation arrows sit beside the outermost visible panels, centered vertically. Right-click and choose **Grand Central Desktop Settings** to customize the extension; the browser has the same command in its right-click menu. Settings can also be opened through the Extensions app or the command below.

A compact media widget sits in the bottom-right corner, with artwork, title, artist, and one Play/Pause button. It uses the same MPRIS interface as GNOME’s media controls, so compatible music apps and browser websites work automatically. Playing media takes priority; the most recently started player is selected. Paused tracks keep a resume button. Stopped players and closed apps disappear automatically. The widget stays below application windows and leaves room beneath the panels on shorter screens.

A matching weather widget sits at the bottom-left, with the same width as the media widget. It shares GNOME’s existing Weather client, shows GNOME Weather’s color condition icon, temperature rounded to the nearest whole degree in GNOME’s units, and location, and opens GNOME Weather when clicked. A light gray “Last refreshed” line at the widget’s bottom-right appears only when GNOME’s last completed refresh is more than 16 minutes old and updates each minute. With no configured location or available reading, it shows “—”; it stays clickable to open Weather. It hides if GNOME Weather is unavailable. It refreshes stale shared data every 15 minutes while online and follows GNOME location/unit changes without requesting a separate geolocation permission or API key.

A calendar pill sits at the top center, expanding automatically for one, two, or three events. It reads the selected calendars used by GNOME Calendar, includes ongoing, all-day, and recurring events, and hides when none remain. Ongoing timed events show a lighter charcoal card, a thin edge in the GNOME accent color, and a Now label. Click an event to open GNOME Calendar. **Calendar** controls visibility, **Days ahead** (0–365), and the maximum number of events (1–3). Today is always included: 0 shows today only, 1 includes tomorrow, and 7 includes today plus the next seven days. It defaults to one day ahead with up to three events. Changes apply immediately.

## Install and run

Supports GNOME Shell **49, 50, and 51**; integration-tested on **51.1**. Versions 49 and 50 are declared compatible but have not been run here.

From this project directory:

```sh
python3 tools/install.py
```

For a first installation, log out and back in so GNOME discovers the extension, then enable it:

```sh
gnome-extensions enable grand-central-desktop@grandcentral-desktop
```

Press **Super+Alt+D** to show the desktop. Right-click → **Grand Central Desktop Settings**. Set your URL in **Browser → Home URL** and press Apply. The browser starts when you first reveal its panel. Its default home page makes no network requests.

You can also open settings directly:

```sh
gnome-extensions prefs grand-central-desktop@grandcentral-desktop
```

GNOME discovers the new extension ID at login. Once installed and discovered, future updates apply automatically after `python3 tools/install.py`; no Looking Glass command is needed.

### Automatic installed updates

The editable project and installed extension remain independent. The loader watches **only** `active-release.json` inside the installed extension, never development files. The installer copies a complete release into `runtime-builds/<SHA-256>/`, compiles its schema, and publishes the pointer atomically. All relative module imports have new release paths, so changes in nested JavaScript modules are refreshed too.

Every release file is checked before loading. If loading or enabling an update fails, the previous panels are restored and the installed pointer is returned to the working release. Calculator input/memory, icon pages, and carousel position are retained. Preferences follow the working release, including after a rejected update. Previous release directories remain available for recovery. Identical installs do not rebuild the UI.

If browser code, its dependencies, or its settings schema change, the helper restarts and reopens its current URL. Saved cookies, website storage, and cache survive that restart; back/forward history is still process-local. Changes to unrelated panels retain the existing browser process. Disabling Grand Central Desktop stops the watcher and the browser; an installed update does not enable a disabled extension.

`extension.js`, `prefs.js`, and `lib/runtimeLoader.js` are deliberately small, stable host files. Application changes go in `runtime.js`, `runtime-prefs.js`, and the application modules. Changing the stable loader itself requires a new session; the installer refuses partial host upgrades. No migration bridge or legacy aliases are shipped.

### Name, version, and compatibility

The extension is **Grand Central Desktop 0.1**. GNOME's `version-name` is `0.1`; its required whole-number submission/build `version` has been reset to `1`. These are separate metadata fields.

The clean extension identity is `grand-central-desktop@grandcentral-desktop`, with schema `org.gnome.shell.extensions.grand-central-desktop` and browser data under `$XDG_DATA_HOME/grand-central-desktop/browser`. There is no legacy-ID or migration code. The source checkout and installed release are separate. See [installation and updates](docs/INSTALLATION.md) for both locations.

### Configuration export and import

Open **Grand Central Desktop Settings → Advanced → Configuration**. **Export Configuration** saves a private JSON file containing general and per-panel settings, including layout, colors, grids, shortcuts, calendar options, program history, and browser preferences. **Import Configuration** validates the entire file before applying it and provides **Undo**. Invalid, unsupported, unknown, or out-of-range values leave settings unchanged. Browser cookies, cache, and website sign-ins are not included in configuration exports.

### Dependencies

The extension and preferences use GNOME's existing GJS, Shell, GTK 4, and Libadwaita libraries. Calendar events use the Evolution Data Server introspection libraries (ECal 2.0, EDataServer 1.2, and ICalGLib 3.0) supplied with GNOME Calendar; if unavailable, the calendar pill stays hidden. There are no npm or Python runtime dependencies for the extension.

The **browser panel additionally requires GTK 3, WebKit2GTK 4.1, and Xwayland**. Nothing is automatically installed. If your distribution does not include them, install them explicitly using its package manager. For Fedora:

```sh
sudo dnf install gjs gtk3 webkit2gtk4.1 xorg-x11-server-Xwayland
```

On Debian/Ubuntu the corresponding packages are `gjs`, `gir1.2-gtk-3.0`, `gir1.2-webkit2-4.1`, and `xwayland`. A session with Xwayland disabled cannot run the browser panel; the other panels continue working.

The browser helper uses an Xwayland desktop-type window so Mutter keeps it behind normal windows, on all workspaces, and out of Alt+Tab. WebKit runs outside GNOME Shell. This is why the helper uses GTK 3/WebKit2 4.1 rather than a GTK 4 window. Its process is stopped when the extension is disabled.

If Desktop Icons NG or another desktop replacement is enabled, disable it yourself to avoid overlapping desktop surfaces. Grand Central Desktop does not change other extensions or your wallpaper.

## Customize

Each panel has its own visibility, color, title, and corner radius. Dark gray (`#181818`) is the default; pure black and other preset or custom colors are available. Text contrast adapts to the chosen background.

The settings open to one overview. In **Panels**, use the switches to show or hide panels, drag a handle to reorder, or focus a handle and press **Alt+Up/Down**. Select the arrow beside a panel to customize it. Changes apply immediately and persist across restarts. Disabled panels keep their saved position. The default order keeps Programs, Desktop, and Documents visible first; All Apps is appended after Browser.

The four icon panels independently support preferred row/column counts, icon size, labels, item limits, and page navigation. Their footers page **icons inside that panel**; the outer navigation moves **between panels**, wrapping continuously in either direction. For example, with the default order, scrolling left from Programs shows Quick Notes, Programs, Desktop. Use or scroll over the side arrows, or use the shortcuts below. Scroll over an icon panel or use Page Up/Page Down while focused to change its icon page. On small displays, grids use fewer rows or columns to fit the available area. Single-page arrows are hidden with their space reserved; counts use the correct singular/plural. Refreshes and resizing keep the focused icon selected, while deliberate paging keeps its requested destination. Icon controls have hover/keyboard tooltips, and clipped names reveal their full text on hover.

**Desktop layout** offers Small (300 × 520), Medium (420 × 660), Large (520 × 820), and Custom panel sizes, plus a named monitor selector. **Advanced** holds exact dimensions, gaps, and margins; existing custom values are preserved. Primary display follows GNOME’s primary monitor. Disconnected saved monitors remain available without resetting their selection. The carousel appears on every workspace.

Panel customization shows color swatches, a custom color picker, and everyday content controls. Each panel’s **Advanced** section contains its title, corner radius, icon rows/columns and item limits where applicable, and Reset. Programs also keeps its history-clearing action there; Desktop keeps custom folder and hidden-file controls there. Keyboard shortcuts are on the overview’s **Advanced** page.

| Default shortcut | Action |
| --- | --- |
| Super+Alt+D | Minimize visible applications / restore windows minimized by this command |
| Super+Ctrl+Alt+Right | Move to the next three-panel view |
| Super+Ctrl+Alt+Left | Move to the previous three-panel view |

All three shortcuts can be changed or disabled in settings. Ctrl+F inside All Apps or Recent Documents focuses its existing search field; it is not a global shortcut.

### Right-click menus

Right-click an icon for its own actions. Files and folders offer Open/Open Folder, Show in Files, and Properties through GNOME Files. Programs and All Apps offer Open, New Window for running apps that support it, and Show Details through GNOME Software when installed. All Apps folders offer Open Folder inside the panel. Empty Desktop space offers Open Desktop Folder; other empty space offers Grand Central Desktop Settings. Redundant desktop/carousel commands have been removed from these menus. Settings remains at the bottom of item menus.

Weather, Calendar, and media menus offer their relevant open/playback action. The calculator entry uses GNOME’s Copy/Paste menu. Browser Expand/Restore and Settings remain available. The Menu key or Shift+F10 opens the focused item's menu. See the [context-menu audit](docs/CONTEXT-MENUS.md).

Right-click blank desktop space or an empty area of the Desktop panel for **Display Settings**, which opens GNOME's Displays settings. **Grand Central Desktop Settings** remains a separate menu item.

### Desktop and history

- Desktop contents are watched for changes. A custom absolute folder path or `~/…` path can be used instead. Files and folders open in their default application. Executable or trusted `.desktop` application shortcuts can be launched; untrusted shortcuts display an explanation.
- This is a launcher grid, not a full file manager: moving, renaming, deleting, and arranging files by drag-and-drop are done in Files.
- All Apps reads the live Show Apps grid, so Alphabetical App Grid and other grid sorters also control this panel. Folders appear at their Show Apps positions, with GNOME names and app previews. Click one to open its apps inside the panel; use Back or Escape to return to the main grid. Folder contents retain GNOME’s ordering and update live. The main-grid page and open folder are retained during automatic updates. GNOME hides pinned favorites from Show Apps; this panel includes them using the grid’s active sorting rules. Hidden applications and parental controls are respected. There is no item limit for All Apps.
- **Desktop → Content → Show mounted drives** optionally adds user-visible mounted drives and connected shares before Desktop files. It is off by default. Icons update when mounts are added, removed, or renamed, and open their root in your default file manager. Drives and files share the Desktop item limit; this option does not mount or unmount devices.
- Program history starts when this extension is enabled, persists in its settings, and stores at most 500 application IDs. GNOME's app-usage privacy setting is respected; turning it off clears this extension's history. Clear just this history from **Programs → Advanced**.
- Documents use `$XDG_DATA_HOME/recently-used.xbel`. Apps that do not publish recent files will not appear. Private entries and remote URLs are excluded. GNOME's recent-file privacy and retention settings are respected. A file that has subsequently moved or been deleted may remain in GNOME's list until it expires; opening it reports the error.

Drag one **All Apps** application onto another to create a folder, or onto an existing folder to add it. To move an app back out, open its folder and drag it onto **Back**. Rename a folder with its header's pencil button or right-click → **Rename Folder**; Enter saves, Escape cancels, and a blank name keeps the old name. These edits update GNOME's actual Show Apps folders, so both views stay in sync. Pinned apps retain their folder membership here. Dragging does not launch the app, and dropping an icon onto itself does nothing.

The search bar in **All Apps** stays visible above the grid, including inside folders. Click the field or its magnifying glass and type a program name. Results update as you type, ignoring case and accents; Enter opens the first match. The clear icon or Escape clears the query and restores your folder/page. Focusing, typing, and clearing keep the icons in place; Escape on an empty field leaves the bar visible. Search keeps its state while moving between panels and during automatic updates. Filtered results keep normal app actions; clear the query before organizing folders.

**Recent Documents** has the same permanent search bar. Type a filename or document title to filter the recent list, with its newest-first order and privacy/item limits preserved. Enter opens the first match; Clear or Escape restores the list and your previous page. The icons stay in place, file context actions remain available, and the query survives carousel moves and automatic updates. This searches recent names, not file contents or the rest of your filesystem.

### Calculator

The basic keypad has 20 buttons: digits, decimal point, arithmetic, percent, sign change, clear, backspace, and equals. **Advanced** reveals memory controls, parentheses, square root, square, and reciprocal. The toggle starts collapsed and remembers your choice; collapsing it preserves your expression and memory. Type an expression and press Enter or `=`. Escape clears. Keyboard expressions also accept parentheses, `^`, `sqrt()`, and scientific notation, even with Advanced collapsed. Clicking the calculator panel returns keyboard focus to the expression entry without intercepting button actions. The history line stays allocated and becomes transparent when empty, so showing or clearing equations and errors does not move the keypad. Only calculation history, errors, and relevant memory status appear; there are no permanent help captions.

Percent is the mathematical postfix operator: `10% = 0.1`, `200 × 10% = 20`, and `200 × (1 + 10%) = 220`. `100 + 10%` therefore gives `100.1`. Powers are right-associative; `-2^2 = -4`.

MC clears memory, MR recalls it, M+ adds the current expression's result, and M− subtracts it. Calculator state lasts until the extension is disabled. Results use JavaScript floating-point arithmetic and display up to 12 significant digits. Invalid expressions and division by zero show an error without discarding the expression.

### Quick Notes

One plain-text note lives on the Quick Notes panel. The placeholder and text stay at the top left while typing and saving. Click or tap the editing area to start typing. Text wraps and scrolls inside the panel; there is no Preview/Edit button or Markdown rendering. Existing formatting characters remain literal text. **Settings → Quick Notes → Font size** changes note text from 8–36 logical pixels (default 14) and applies immediately on every display. The setting persists and travels with configuration export/import.

Hover over the bottom file button for **Load or export note**. **Note files** (the folder button) offers **Load from File…** and **Export to File…**; the background right-click menu also offers these and **Copy Note**. Load replaces the working note with a copy of the selected text file, including existing `.md` files treated as plain text. Later edits save locally and leave that source file unchanged. Export saves the current text to a chosen filename/location, defaulting to `note.txt`. Cancelling or selecting invalid input leaves the note intact.

The footer shows save status and offers Retry after a failure. Saved fades after two seconds; Saving and errors remain visible while relevant. After loading a file, Undo is available for eight seconds across note views. A new edit, another load, expiry, or closing the last view dismisses it; previous text is kept only in memory. Autosave runs after a brief pause. The existing private UTF-8 storage path remains `$XDG_DATA_HOME/grand-central-desktop/notes/note.md` (normally `~/.local/share/grand-central-desktop/notes/note.md`), preserving saved notes; the extension of this internal file does not enable formatting. Pending edits flush on shutdown and automatic updates. Resetting/hiding the panel or importing settings preserves its note. Back up that file separately to transfer its contents; configuration exports do not include the text. The note limit is 1 MiB; failed or oversized writes retain the draft and previous saved file.

### Browser

Set an `https://…` or `http://…` home URL in settings. Home opens that URL, Refresh reloads the current page, and links navigate within the panel, including links requesting a new window. The toolbar has Back, Home, Refresh, Forward, Match page color, and Expand/Restore; there are no tabs or address bar.

**Match page color** (the color-picker button beside Expand) sets the browser frame to the current page's background, with readable control colors. It also appears in the right-click menu when controls are hidden. The color is saved in Browser settings and configuration exports. This is a one-time match; click again after changing pages or website themes. Transparent backgrounds are resolved against their backdrop; images and gradients use a solid fallback. Matching retains the current page and browser session.

**Browser → Show color picker** hides or restores that toolbar button independently of the other controls. It defaults to on and applies immediately without reloading. The right-click **Match page color** action remains available. The choice is saved across restarts and included in configuration export/import.

**Browser → Automatically match page color** matches the panel frame after navigation, including Back/Forward, Refresh, redirects, and URL changes within web apps. It defaults to off; enabling it also matches the current loaded page. It works with the toolbar or color picker hidden, keeps the existing page/session, and is saved in configuration exports. Turning it off retains the last color. A manual color choice stays until the next navigation while automatic matching is on; theme changes without navigation can still be matched manually.

**Browser → Page zoom (%)** adjusts the page from **25% to 300%**, in 5% steps; the default is **100%**. **Show browser controls** hides or restores the navigation toolbar, giving the page more vertical space. Both settings apply immediately and persist when you navigate or hide and reveal the panel. Refresh becomes Stop loading during navigation and returns to Refresh when loading ends or is cancelled. The page's right-click settings command remains available with the toolbar hidden.

The web viewport is clipped to rounded corners that follow **Browser → Advanced → Corner radius**, with an inset curve that matches the surrounding frame. Set the radius to zero for square corners. Rounding follows resizing, expansion, zoom, and toolbar visibility. Radius and frame-color changes preserve the current page and browser process; website CSS is unchanged.

**Expand browser** (the rightmost toolbar button) widens the browser across all three panel slots, temporarily hiding the other two panels and carousel arrows. Carousel shortcuts and scrolling are inactive while expanded. A separate floating **Restore browser** button sits above the top-right edge and stays available with browser controls hidden. It matches the browser frame color and stays below the calendar and inside the screen, making room above tall panels as needed. Restore returns to the same panel arrangement; the toolbar and right-click menu also offer Restore. Resizing keeps the same browser process, page, website data, and back/forward history. Expanded mode follows layout/monitor changes and survives unrelated automatic updates; foreground-window stacking and corner widgets are preserved.

**Browser → Request mobile site** sends a mobile user agent to websites. It defaults to off. Changing it reloads the current URL using the same profile and cookies, retaining zoom, toolbar visibility, and history. The choice is saved and included in configuration export/import. Expanding or restoring never changes it. Sites can still choose their layout using the available width, so this requests a mobile version without forcing a phone-sized page.

Website data is saved in a dedicated, persistent browser profile at `$XDG_DATA_HOME/grand-central-desktop/browser` (normally `~/.local/share/grand-central-desktop/browser`). WebKit keeps persistent cookies, localStorage, IndexedDB, and other website data there; HTTP cache uses `$XDG_CACHE_HOME/grand-central-desktop/browser`. These locations are independent of installed releases and are not included in extension packages.

Session cookies are restored across helper restarts using a private, atomically written session snapshot. HttpOnly, Secure, and SameSite flags are retained; explicit cookie expiry and website logout are respected. Helpers save before closing, and the next helper waits for the previous one to exit. Cookies and snapshots are never exposed through the helper's status interface or logs.

Hiding the carousel panel keeps its process, page, and navigation history. Disabling the extension closes the helper but preserves saved website data. Uninstalling the extension does not erase its separate website profile. A site can still expire or revoke its own login session. Downloads and camera/microphone/device permission requests remain disabled. Browser content retains website styling; the panel color setting changes its frame and controls.

## Multiple monitors

**Desktop layout → Monitor** offers Primary display, All monitors, or a named display. All monitors gives each screen its own three-panel carousel. Carousel arrows affect that screen; keyboard carousel shortcuts target the monitor under the pointer. Positions are remembered by hardware/connector identity. An unavailable selected display falls back to primary while retaining the saved selection.

Each screen keeps independent searches, paging, calculator input, and browser navigation. **Browser → Per-monitor browser settings** overrides that display's home URL, zoom, mobile mode, controls, color, and other browser appearance; Reset restores inheritance from the shared Browser defaults. Expand/Restore stays on its own screen. Browser views share one persistent profile, so signing in or out affects the shared account while pages, history, and scroll position remain independent. Display rows show Using defaults or Customized and use the same friendly names as the monitor selector. Views start when first shown and stay alive while hidden on a connected display. Disconnecting closes the removed screen's view; reconnect restores its last URL and layout using the same profile.

Quick Notes is still one note: edits and file loads synchronize live across screens through one autosave writer. Weather, media, and calendar information appears on each enabled monitor. Mode, display identities, positions, and browser overrides are included in configuration export/import.

## Build and verify

The runtime addresses panels by stable ID through one registry; `lib/panelFactory.js` constructs specialized panel types. Generic icon grids live in `lib/panel.js`, while calculator rendering lives in `lib/calculatorPanel.js`. Both searches share `lib/searchEntry.js` and the independently testable `lib/searchState.js`. Preferences use `lib/preferencesControls.js` and `lib/preferencesPanels.js`; `runtime-prefs.js` assembles the overview and layout page. Integration scenarios live under `tests/probe/scenarios/`, with fixtures/input helpers in `tests/probe/helpers.js` and a small entry point in `tests/probe/extension.js`.

No dependency installation or build launcher is required. With the standard GNOME development tools already installed:

```sh
glib-compile-schemas --strict schemas
gjs -m tests/run.js
gjs -m tests/notes.js
GSETTINGS_BACKEND=memory gjs -m tests/monitors.js
GSETTINGS_BACKEND=memory gjs -m tests/appFolders.js
python3 tests/test_installer.py
python3 tools/install.py
```

For distribution, package the complete tree generated by the installer, including `active-release.json` and `runtime-builds/`. Keep frozen recovery packages outside Git. Use the installer for routine live updates; force-replacing the entire directory with `gnome-extensions install` can invalidate its directory monitor and is intended for recovery or first installation.

For an isolated end-to-end test on GNOME 51:

```sh
python3 tests/integration.py
```

The integration test launches a separate headless GNOME session with temporary settings, Desktop and local calendar fixtures, and a local HTTP server. It does not install or enable Grand Central Desktop in your current desktop. When Alphabetical App Grid is installed, a separate copy is enabled inside the test session to verify compatibility; its live files and settings are untouched. It saves logs, results, and actual GNOME screenshots in the printed `/tmp/grand-central-desktop-integration-…` folder. It requires permission to open a separate display/session bus and uses the system's GNOME/WebKit libraries. `tests/preferences.js` contains Fedora's standard library paths; adjust them on another distribution. For focused settings work, use `GRAND_CENTRAL_DESKTOP_TEST_PREFERENCES_ONLY=1 python3 tests/integration.py`; this still runs in a separate GNOME session and saves native screenshots.

## Disable or remove

```sh
gnome-extensions disable grand-central-desktop@grandcentral-desktop
gnome-extensions uninstall grand-central-desktop@grandcentral-desktop
```

Disabling removes panel actors, menus, keyboard bindings, file monitors, and the browser helper. It leaves your files and saved preferences intact. Windows already minimized by the show-desktop action can be restored normally through GNOME.

Licensed under GPL-3.0-or-later. See [COPYING](COPYING). GNOME development references: [extension structure](https://gjs.guide/extensions/overview/anatomy.html), [preferences](https://gjs.guide/extensions/development/preferences.html), and [testing](https://gjs.guide/extensions/development/creating.html).

### Small interaction improvements

Browser page context menus preserve native text editing and link-copy/open actions where relevant, plus Expand/Restore, Match page color, and Settings. A failed browser helper offers Retry, reopening its display views at their last URLs with the persistent profile. This does not reset cookies or restart the desktop extension.

Invalid URL and folder-path fields show a short explanation below the field after Apply; valid corrections clear it. Calculator errors clear when editing resumes, retaining the history row and keypad positions. Weather distinguishes Choose a location, Loading…, and Unavailable while preserving valid readings and the existing sixteen-minute age-label rule. Long song and calendar titles have hover details; ongoing timed events use the lighter card described above.
