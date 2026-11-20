# Grand Central Desktop — Windows Application Specification

- **Product** Grand Central Desktop
- **Product version** 0.1
- **Specification date** November 20, 2026
- **Target deliverable** A portable Windows executable

## 1. Purpose and scope

Build Grand Central Desktop as a portable Windows application that turns the desktop into a customizable home screen of application launchers, documents, interactive tools, and compact information widgets. This specification defines the product, interactions, persistence, Windows integrations, packaging, and acceptance criteria in full. Implementation does not require another application, source repository, or platform-specific specification as a reference.

The desktop becomes a quiet, customizable home screen: three large rounded panels are visible at once, with arrows that move continuously through seven available panels. Calendar events sit above them. Weather and media controls occupy the bottom corners. Ordinary application windows always appear in front.

The application must run by opening `GrandCentralDesktop.exe`, without an installer, administrator privileges, a Windows service, or replacing Explorer as the Windows shell. A writable data directory and browser runtime are still necessary; executable portability does not mean stateless operation.

This document describes required product behavior. Passages labeled **Recommendation** propose implementation choices; **Prototype gate** identifies feasibility checks that must be resolved before release. **Windows integration** describes platform-specific requirements and constraints. The specification does not assert that an implementation exists or has been tested.

### 1.1 Release scope

The first complete Windows version includes all seven panels, per-panel customization and ordering, persistent browser sessions, configuration export/import, media controls, weather, and the calendar pill. Weather and calendar require usable Windows providers, not fabricated readings or demonstration events. Optional account integrations may follow later; local calendar feeds and a configured weather provider form the baseline.

Out of scope: replacing the taskbar or Start menu, a complete file manager, a full browser with tabs and an address bar, a calendar editor, a media library, cloud synchronization of settings, and automatic conversion of settings from other products or platforms.

## 2. Overall screen and visual design

```text
                         ┌───────────────────────────────┐
                         │  Calendar: 1–3 event sections │
                         └───────────────────────────────┘

       ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
       │ Recent Programs│  │    Desktop     │  │Recent Documents│
       │                │  │                │  │                │
   (‹) │   Icon grid    │  │   Icon grid    │  │   Icon grid    │ (›)
       │                │  │                │  │                │
       │ ‹  page  ›     │  │ ‹  page  ›     │  │ ‹  page  ›     │
       └────────────────┘  └────────────────┘  └────────────────┘

 ┌─────────────────────────┐                 ┌─────────────────────────┐
 │ Color icon  70°F         │                 │ Artwork  Song title   ❚❚│
 │ Location   Last refreshed│                 │          Artist         │
 └─────────────────────────┘                 └─────────────────────────┘
                  Windows taskbar retains its normal behavior
```

The sketch illustrates placement, not literal proportions. The refresh label appears only when stale, as specified below.

### 2.1 Desktop placement and stacking

- Render above the wallpaper and below ordinary application windows, including Firefox, File Explorer, dialogs, and maximized windows.
- Retain the Windows taskbar, Start menu, notification area, lock screen, and normal window switching.
- Keep background desktop surfaces out of Alt+Tab and the taskbar. Settings is a normal foreground window.
- Offer **Primary monitor**, **Selected monitor**, and **All monitors**. Keep the current one-monitor selection by default. Show an independent three-panel carousel on every enabled monitor in All monitors mode, on every virtual desktop where supported by the desktop host.
- Empty areas outside controls should allow normal desktop interaction rather than swallowing all mouse input. Interactive panels must still receive clicks, context menus, scrolling, and keyboard input.
- Never continuously steal focus or raise the panels above foreground applications. Clicking a panel may focus that control; launching an application brings the application forward.
- Recover after Explorer restarts, display changes, sleep/resume, and lock/unlock without losing configuration or creating duplicate surfaces.
- Show Desktop must reveal usable panels. It must not permanently minimize the host, leave a browser window floating above other apps, or break ordinary window restoration.

**Prototype gate — desktop hosting:** Windows desktop embedding is the highest-risk part of the application. A `WorkerW`/`Progman` host may be practical, but the desktop attachment mechanisms commonly used for this are undocumented Explorer internals. Isolate them behind a replaceable `DesktopHost` interface. Test the actual supported Windows builds before committing the rest of the renderer to that backend.

`SetWindowPos(HWND_BOTTOM)` alone is not a proven desktop host. A blanket `WS_EX_NOACTIVATE` policy is also insufficient because the calculator and browser need keyboard focus. Cross-process parenting introduces DPI-awareness constraints; Microsoft explicitly documents possible DPI resets and errors with `SetParent`. See [SetParent](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setparent) and [SetWindowPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos).

Before feature development, prove that a calculator entry and a real WebView2 page can accept keyboard input while all foreground windows remain above them. If embedding fails, offer an explicitly labeled ordinary-window preview or disable the desktop surface with an actionable diagnostic. A preview does not satisfy the release requirement for desktop behavior.

Native Explorer icons may overlap a replacement desktop. Do not silently hide them, terminate Explorer, or change wallpaper settings. The initial version may require the user to turn off Windows' desktop icons themselves. Document that setup step and test that panel icons remain usable with native icons hidden.

### 2.2 Multiple monitors

Each enabled logical monitor owns its own desktop surface, three visible panel slots, carousel position, panel pagination, searches/open app folder, calculator input/history/memory, and browser view. Shared global defaults provide panel order, visibility, dimensions, appearance, shortcuts, and content sources. Moving a carousel, paging/searching a panel, or expanding a browser affects only that monitor. Carousel keyboard shortcuts target the enabled monitor under the pointer, falling back to an enabled primary/first surface. Keep the existing Show Desktop behavior consistent across the workspace.

Use stable hardware-and-connector identities rather than enumeration indices for saved selections and positions; disambiguate identical displays. Treat an operating-system mirrored display group as one logical surface. Preserve unavailable selections/overrides in configuration. If a selected display disappears, temporarily use the primary display and return to the selected identity when it reconnects. Other displays must retain their state. Recompute each surface against its own work area, taskbar/strut exclusions, orientation, and DPI. Clip desktop/input surfaces to their own monitor so an invisible full-desktop container cannot intercept another screen's controls. Keep all surfaces and browser windows below foreground applications.

Browser views share one persistent profile/environment and one profile owner, including cookies, cache, localStorage, and IndexedDB. A sign-in is shared; signing out is respected in every view. Each view has its own current URL, back/forward history, forms, scroll position, zoom, mobile-site request mode, controls, frame color, and expanded state. Start with shared Browser defaults and offer **Per-monitor browser settings** for overrides. Unset overrides continue inheriting changes to defaults; resetting a display browser removes its overrides without changing other displays or global defaults. Existing overrides remain editable after changing monitor mode. Serialize concurrent settings changes from views and settings windows so one display cannot overwrite another display's latest values. Independent account profiles and page mirroring are outside this feature.

Create browser views lazily when first shown. Hiding a carousel/browser or changing monitor mode while the display remains connected keeps that view/page alive. Expanding occupies only that display's three slots, with its own floating Restore button and hidden carousel arrows. Matching page color updates that view's frame only. On physical display removal, close that display's browser view and retain its last URL and carousel/control state; reconnect reopens the page in the shared profile. A closed view's unsaved form contents and process-local navigation history are not guaranteed after disconnect. Preserve all connected views through unrelated updates, and restore each view's own URL after a required browser-helper restart.

Quick Notes remains **one document** across every display, with one shared writer. Edits and file loads propagate live to all note views; preserve caret/selection where possible and do not let separate autosave timers overwrite one another. Notes file operations always operate on that shared document. Programs, files, folders, mounted drives, and All Apps share the same underlying data while browsing/search state stays local. Weather, media, and calendar show the same information on each enabled monitor, positioned within that monitor's work area.

Persist monitor mode, stable selected identity, carousel positions, and per-monitor Browser overrides; include them in configuration export/import and Undo with strict type/range/key validation. Preserve unknown/disconnected display records for later reconnect. Keep transient calculator/search state through live updates and in-session disconnect/reconnect; full-application restart persistence is required for explicitly saved preferences and note/browser data only. Shutdown removes every surface, browser view, file/input hook, and subscription exactly once.

### 2.3 Dimensions and appearance

All dimensions below are device-independent pixels (DIPs), not physical pixels. Respect Windows display scaling and mixed-DPI monitors.

| Setting | Default | Allowed range / behavior |
| --- | --- | --- |
| Preferred panel width | 420 | 220–900 |
| Preferred panel height | 660 | 420–1200 |
| Panel gap | 24 | 0–100 |
| Outer margin | 36 | 0–200 |
| Corner radius, independently per panel | 32 | 0–80 |
| Background, independently per panel | `#181818` | Solid `#RRGGBB` |
| Grid columns / rows | 4 / 4 | Each 1–8, reduced as needed to fit |
| Icon size | 48 | 24–96 |
| Icon labels | On | Per icon panel |
| Item limit | 100 | 8–500 for Programs, Desktop, Documents |

Presets: Small **300 × 520**, Medium **420 × 660**, Large **520 × 820**, and Custom. Selecting Custom must retain existing dimensions. All Apps has no item limit.

Use rounded panels, restrained shadows, a consistent font hierarchy, and centered titles. Offer Dark (`#181818`), Black (`#000000`), Slate (`#202b3b`), Plum (`#34243d`), Light (`#f6f5f4`), and a custom color picker. Adapt text, muted text, hover, and focus colors for readable contrast. Color changes apply to browser framing and controls; website content retains its own styling.

Fit the row into the selected monitor's work area, excluding the taskbar. Center it horizontally and vertically within the space left by visible widgets. Reserve the calendar area above and corner-widget area below so panels cannot overlap them. Reduce effective panel width/height and grid capacity on smaller screens instead of clipping icons. Recompute on monitor, scale, taskbar, and widget visibility changes.

Keep weather and media the same width, even when one is hidden. Their preferred size is **360 × 80**. When both are visible on a narrow display, reduce both widths equally, retaining a gap between them. The calendar is approximately **260 × event count** wide and **80** high, capped to available width. Extremely small work areas must retain reachable controls; allow internal content scrolling rather than pushing controls offscreen.

Do not add a tagline, onboarding paragraph, permanent calculator instructions, or a bottom Settings button to the desktop.

### 2.4 Control feedback and keyboard polish

Icon-only carousel/page arrows, folder Back/Rename, floating browser Restore, and media Play/Pause expose concise tooltips after a short hover or keyboard-focus delay. Keep tooltips inside the control's display, noninteractive, and dismiss them on focus/hover loss, menus, display changes, or disposal. Truncated app/file names, song titles/artists, and calendar titles/times reveal their complete text on hover. Hidden text must not trigger a tooltip. Dismiss icon tooltips before app-folder dragging starts and suppress them throughout the drag so they cannot obstruct target picking. Tooltips add no saved setting. Use modestly larger hit areas (approximately 36 DIPs for small desktop buttons) while keeping glyphs unchanged; retain compact browser controls where required to fit a narrow panel.

Grid refreshes and resizing preserve the focused item's stable identity, following it to the appropriate page when capacity/order changes. Intentional page changes retain their requested destination and focus a corresponding available icon. If the item disappears, choose a nearby remaining item. Never take focus away from a search field, editor, dialog, or another application during a background refresh. These are transient focus values, not exported configuration.

Hide icon-page arrows when all items fit one page, reserving their layout slots so the grid and footer stay stationary. Show correct singular/plural item counts. Ctrl+F focuses the existing search field only when All Apps or Recent Documents has keyboard focus; it creates no global shortcut and leaves the permanent search layout unchanged.

## 3. Carousel and navigation

Use stable panel IDs independent of titles:

| Default order | ID | Default title |
| --- | --- | --- |
| 1 | `programs` | Recent Programs |
| 2 | `desktop` | Desktop |
| 3 | `documents` | Recent Documents |
| 4 | `calculator` | Calculator |
| 5 | `browser` | Web Browser |
| 6 | `apps` | All Apps |
| 7 | `notes` | Quick Notes |

At startup, show Programs, Desktop, Documents. Each outer arrow advances the starting position by **one panel**, wrapping in either direction. For example, moving left once shows Quick Notes, Programs, Desktop; moving right once from the default shows Desktop, Documents, Calculator. This is a cyclic carousel, not an infinitely growing list.

Place left/right buttons outside the outermost visible panels, vertically centered. Scrolling over these buttons also moves the carousel, with smooth-scroll accumulation/debouncing to avoid skipping many positions accidentally. While the Browser is expanded, hide these buttons and suspend carousel scrolling/previous/next shortcuts until Restore; page scrolling and browser history navigation continue normally.

Panel content pagination is separate. Footer arrows, scrolling over an icon grid, or Page Up/Page Down while that panel is focused change that panel's icon page. They do not move the carousel. Retain each panel's page when it leaves and returns to the visible row; clamp pages if items disappear.

Settings allows reordering and independently hiding panels. Disabled panels retain their saved order and customization. Use drag handles and keyboard Alt+Up/Down. Preserve the currently selected leftmost panel when possible after changes. With fewer than three enabled panels, show each enabled panel once and center the group; never duplicate it to fill slots. With no enabled panels, retain Settings access from the tray. Hide unnecessary carousel arrows when every enabled panel already fits.

## 4. Icon panels

### 4.1 Shared interaction

Icons show real Windows application/file icons and localized display names where available. Clicking or activating with Enter opens the item. Tooltips expose truncated names. Support keyboard focus, arrow-key grid navigation, and the Menu key or Shift+F10 for context menus.

Resolve icons, shortcuts, and metadata asynchronously. An inaccessible file, damaged shortcut, slow network location, or shell extension must not freeze the desktop. Bound background work and cache icons by stable identity. Preserve selection where possible through refreshes. Report launch errors briefly near the action or through a normal error dialog.

### 4.2 Recent Programs

Show applications in most recently launched/focused order, newest first. Repeated use moves an application to the front without duplicates. Track while Grand Central Desktop is running and persist at most **500** application identities. The display item limit is independently configurable. This is not a list of recently installed applications.

**Windows integration:** observe foreground application changes and launches initiated by this app. A recommended event source is `SetWinEventHook` for foreground events with `WINEVENT_OUTOFCONTEXT`, excluding the application's own processes. This avoids injecting code into other processes. See [SetWinEventHook](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook).

Use a stable application identity: an AUMID for packaged apps, or an appropriate executable/shortcut identity for Win32 apps. Do not collapse every hosted application into the host process, or merge unrelated browser-installed apps merely because they use the same executable. Ignore Explorer's desktop host, this app's settings/browser helper, and transient system surfaces. History records app identity and recency, not keystrokes, window contents, or browsing activity.

Include a tracking switch and Clear History action. Turning tracking off clears this app's stored history and stops collection. Respect relevant Windows privacy controls when they can be reliably determined. Explain source limitations in documentation: preexisting historical use cannot be reconstructed reliably from this observer.

### 4.3 Desktop

Read the Windows Desktop using Known Folder APIs so redirected and OneDrive desktops work. Include the public/common Desktop when using the normal Windows Desktop view; merge identical shell items without losing two distinct files that share a name. A custom folder replaces that source and uses only the selected directory.

Show files, folders, `.lnk` shortcuts, and `.url` shortcuts. Launch through shell associations/activation rather than building command strings. Resolve the shell item's display name and icon. Honor Windows security prompts and shortcut behavior; do not bypass security to launch an untrusted download.

Settings includes a custom directory picker, Show hidden files (off by default), and Name/Modified sorting. Watch changes and debounce refreshes. Default alphabetical sorting uses the Windows locale. A missing custom path produces a clear unavailable state without silently overwriting the preference.

**Show mounted drives**, off by default, prepends available user-visible mounted drive roots and connected shares. Refresh after insertion, removal, renaming, and network-share changes. Open the root in File Explorer. Do not mount, unmount, format, or eject devices as a side effect. Drives share the Desktop item limit. Avoid duplicate roots and handle removable drives with no media gracefully.

This remains a launcher panel. Renaming, deleting, moving, and file drag-and-drop organization take place in File Explorer.

### 4.4 Recent Documents

Show local document targets reported to Windows recent items, newest first, resolving shortcuts and deduplicating targets. A baseline source is `FOLDERID_Recent`; `SHAddToRecentDocs` documents how cooperating apps populate it. Do not enumerate private application databases or undocumented Windows activity databases. See [Known Folder IDs](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid) and [SHAddToRecentDocs](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shaddtorecentdocs).

The panel cannot promise every document from every app. Applications that do not publish recent items may be absent. Exclude web URLs and private entries when identified. Default to local file targets; do not synchronously probe disconnected network locations. Respect the app's recent-document visibility setting and applicable supported Windows privacy policy. Disabling the panel stops its source watcher; it does not delete the user's Windows recent items.

Watch for updates, respect the configured item limit, and handle stale/moved/deleted targets without crashing. Do not rewrite the Windows recent list just to clean this panel.

#### 4.4.1 Recent-file search

Keep a permanent **Search recent files…** entry beneath the Recent Documents title, styled consistently with the All Apps search field in §4.5.2. Include a magnifying-glass focus affordance and a clear control. Reserve their layout space even when the query is empty. Focusing, typing, clearing, and pressing Escape must not move the header, grid, or pagination. Account for the search row when fitting icons in compact layouts; do not steal keyboard focus when the panel becomes visible.

Filter the current eligible recent-file list as the user types. Match the displayed document title and actual target filename, including its extension, without case or accent sensitivity. Ignore surrounding whitespace and require every query word to occur within the names of the same file. Use plain-text matching. Preserve the source's newest-first order; do not alphabetize the results. The search operates within the configured item limit and existing privacy/retention rules. It does not scan the filesystem, read document contents, search the network, or reveal entries omitted by the recent-file source.

Result icons keep their normal Open, Show in File Explorer, and Properties actions. Enter in a nonempty query opens the first match through its default application; no matches means no action. Display **No matching files.** when a populated eligible list has no match. If the source itself is empty, disabled by privacy settings, or unavailable, preserve its appropriate status/error message instead. Respect privacy changes immediately while a query is active.

Clear or Escape restores the unfiltered list and the browsing page used before searching, clamped if items disappeared. Escape in an already empty field leaves the permanent bar visible and focused. Backspace edits the query normally. Results have independent pagination; changing the query resets their page to the first. Refresh matches when recent items change while retaining the query and input focus. All Apps and Recent Documents searches remain independent.

Retain the query, result page, and underlying browsing page through carousel moves and live application updates. These are transient session values, excluded from configuration export, and may reset on a full application restart. Searching or clearing must not alter the system's recent-item history or display preferences. Share the field's visual/keyboard behavior and name-matching rules with All Apps so the two searches remain consistent.

### 4.5 All Apps and folders

Show launchable applications, including Win32 and packaged applications. Recommended discovery combines the Shell Applications virtual folder (`FOLDERID_AppsFolder`, commonly accessed as `shell:AppsFolder`) with user/common Start Menu shortcuts as needed for hierarchy and coverage. Deduplicate by activation identity. An uninstall-registry scan alone is inadequate because it includes nonlaunchable components and misses other apps.

**Windows integration:** show **alphabetical applications with folders derived from Start Menu shortcut directories**, using localized names. User-created folders and local organization overrides are specified below. The application is not required to reproduce Windows Start's pinned order or pinned folders; use supported application discovery rather than private Start layout databases. Preserve a full application inventory even when an app has no Start Menu folder.

Folder tiles contain previews of up to four app icons. Clicking opens the folder inside the same panel, with a centered folder title and Back button. Escape or Backspace returns to its parent; Backspace must not escape while editing a text field elsewhere. Nested Start Menu directories may form nested folders. Keep the root grid page when entering/leaving a folder. Updates preserve the open folder when it still exists.

Prefer one canonical listing per app: a folder placement wins over an otherwise duplicated root entry. Distinct shortcuts with different launch arguments may be separate launch targets. Changes to installed apps and Start Menu folders refresh the inventory. Respect hidden/nonlaunchable shell entries and launch restrictions; do not bypass Windows policy.

#### 4.5.1 Creating and editing folders

Support these direct organization gestures:

- Drag an app onto another app in the root All Apps grid to create a folder containing both. Use **Unnamed Folder** initially and show the usual preview icons. A valid drop target receives a visible highlight.
- Drag an app onto an existing folder to move it into that folder. Remove its previous placement so it appears only once. Dropping onto itself or into its current folder does nothing; dragging never launches the app.
- Open a folder and drag an app onto **Back** to move it to the root All Apps grid. Preserve an explicit root placement so rediscovering its original Start Menu directory does not immediately put it back.
- Rename through the folder header's pencil button, **right-click → Rename Folder** on a folder tile, or the same action on empty space inside the open folder. Edit inline in the centered header, with focus and the existing name selected. Enter saves, Escape cancels, and leaving the entry commits a valid name. Trim whitespace; a blank name keeps the previous name. Backspace edits text while renaming rather than navigating out.
- Folder names and membership update immediately in previews and the open panel and persist across application restarts, portable release replacement, and configuration export/import. Removing the final assigned app removes an empty user-created folder. If apps are merely unavailable/uninstalled, retain their saved assignments for recovery while hiding empty tiles.

User-created folders have one level; app-on-app drops inside a folder must not create nested folders. This does not remove nested directories discovered from the Windows Start Menu. Keep the root page when entering/leaving folders and clamp pages after membership changes.

**Windows integration:** maintain an application-owned organization layer over the discovered inventory. Folder creation, renaming, and membership changes affect Grand Central Desktop's All Apps view. They must not rename/move Start Menu directories or shortcuts, alter Windows Start pins, or require administrator privileges. An existing discovered folder can receive a local name/membership override. Unmodified folders continue following their source. Preserve stable application identities so an inventory refresh cannot undo a user placement or create duplicates. Apps pinned to Windows Start or the taskbar remain available for grouping here.

Persist folder overrides and explicit app placements as preferences, separately from transient grid pages. See §12.2. A missing source folder or application must not erase these preferences; use a safe root fallback for an unavailable destination while retaining the saved assignment.

Use the chosen Windows UI framework's drag/drop facilities and an application-specific payload of stable app IDs. Reject unrelated or stale payloads. Cancellation, Escape, an invalid drop, or leaving the desktop without completing a drop must leave organization unchanged. Release pointer capture and remove previews/highlights on completion, cancellation, or shutdown. Source refreshes and layout changes must not destroy the active drag actor/control before its drag lifecycle finishes. Invisible layout containers and side-arrow containers must not intercept app drop targets.

#### 4.5.2 Program search

Keep a compact **Search apps…** entry permanently visible beneath the All Apps header, both at the root and inside folders. Include a magnifying-glass icon in the entry and a clear control; a separate show/hide button is unnecessary. Clicking the field or its search icon focuses the entry. Merely revealing the panel must not steal keyboard focus from another application.

Reserve the search row's space from initial layout. Focusing the entry, typing, clearing, and pressing Escape must not move the header, grid, or pagination. Reserve balanced, fixed-size header slots for folder actions so hiding those actions during filtering also leaves the grid stationary. Keep the title centered. The search row uses the panel's color scheme; account for its height when fitting the grid and footer, including compact layouts. The clear control must retain its layout space when inactive.

Filter immediately as the user types, searching program display names across the entire eligible inventory, including every folder and apps pinned elsewhere in Windows. Match name substrings without case or accent sensitivity; ignore surrounding whitespace and require every whitespace-separated query word to appear in the same program name. Use plain text matching, not regular-expression or command evaluation. Results are a flat, deduplicated app grid in the inventory's existing traversal order; folder names are not program results. Continue respecting hidden/nonlaunchable entries and launch restrictions.

A nonempty query temporarily replaces folder browsing with global results and the normal All Apps title. Hide folder-specific Back/Rename controls in this view. Result icons retain their usual launch and application context-menu actions. Enter in the search entry launches the first match; with no matches it does nothing. Show **No matching apps.** for an empty result set. Empty or whitespace-only queries show the normal root/folder grid.

Provide normal clipboard/text-editing support. Escape clears a nonempty query and restores the underlying grid. Pressing Escape in an already empty search field leaves it visible and focused. Backspace edits the search text rather than navigating out of a folder. Outside the search field, ordinary folder-grid Back/Escape navigation remains available when the query is empty. Preserve the underlying folder and page while filtering, reset results to the first page when the query changes, and restore browsing when clearing. Pagination applies to filtered results independently of other panels. Starting a folder rename clears any query before displaying the name entry, while keeping the search row in place.

Search must not change folder membership or organization. Disable folder drag/regroup operations while displaying a nonempty query; normal organization gestures return when the query clears. Inventory changes update results live, without clearing the query or stealing keyboard focus. Retain the query, result page, and underlying browsing context through carousel moves and live application updates. These values are transient session state, excluded from configuration exports; they may reset on a full application restart. The search bar remains permanently visible regardless of query or restored session state.

## 5. Calculator

Use a simplified basic keypad with exactly these 20 buttons, plus an **Advanced** toggle:

```text
 C    ±    %    ÷
 7    8    9    ×
 4    5    6    −
 1    2    3    +
 ⌫    0    .    =
```

The expression entry and reserved history/error line sit above the keypad. The history line always occupies its layout space and becomes invisible when empty. Showing a result, error, or history must not shift the buttons downward. Numbers are visually neutral; operators have a modestly stronger treatment and equals uses the accent color.

Advanced starts collapsed, remembers its setting, and reveals memory controls **MC, MR, M+, M−**, plus **(, ), √, x², 1/x**. Collapsing does not clear expression or memory. It may change the layout once when toggled; subsequent calculations must not shift it.

Clicking inside the calculator panel focuses the expression entry after the clicked action runs. Preserve normal caret placement, text selection, clipboard menus, and the Advanced toggle's activation. Clicking a keypad button must both perform the operation and leave keyboard entry ready.

Support mouse input and keyboard expressions: decimal numbers, scientific notation, `+ - * /`, displayed multiplication/division symbols, parentheses, exponentiation `^`, `sqrt(...)`, postfix `%`, unary signs. Enter or `=` calculates; Escape clears the expression. Use a real parser, never arbitrary language evaluation.

Required arithmetic semantics:

- Normal precedence, right-associative powers, and `-2^2 = -4`.
- Percent is mathematical postfix division by 100: `10% = 0.1`, `200 × 10% = 20`, `100 + 10% = 100.1`, and `200 × (1 + 10%) = 220`.
- Square, square root, reciprocal, and sign change act predictably on the current operand/expression.
- MC clears memory; MR inserts/recalls memory; M+ and M− add/subtract the current expression result. C clears the expression, not memory.
- Display up to 12 significant digits using double-precision arithmetic. Normalize negative zero. Invalid expressions, invalid square roots, overflow, and division by zero show a concise error without discarding the input.
- Expression, history, and memory survive carousel moves and unrelated settings changes. They may reset when the application exits. Advanced visibility persists across restarts.

Keep permanent explanatory text out of the panel. Only expression/result, history/errors, relevant memory status, keypad, and Advanced are needed. The compact layout must remain usable at the Small preset.

## 6. Web Browser

Keep context-sensitive native Copy/Cut/Paste/Delete/Select All and link-copy/open actions where the web target supports them, alongside the desktop browser commands. Do not replace editable-page clipboard menus with desktop-only actions. Open Link loads the chosen HTTP(S) target in the current view; do not offer misleading new-window or unsupported download commands.

While a page is loading, the existing Refresh control becomes Stop loading; activating it cancels the request and returns the control to Refresh. Keep the toolbar footprint fixed, including when it is hidden. If the browser helper fails, show a Retry action in its panel. Retry recovers the helper and its display views at their last known URLs with the existing profile, cookies, cache, and website storage. It does not restart the desktop application or reset the profile. Browser history/form state lost in a failed helper is not guaranteed to survive. Retry adds no persisted setting.

### 6.1 View and controls

Embed a real interactive browser, recommended **Microsoft Edge WebView2**, with a user-configured home URL. Accept `http://`, `https://`, and `about:blank`; reject malformed or executable navigation schemes in the home setting. Default to `about:blank` without making a home-page network request.

Round the **web viewport itself** on all four corners, matching the panel frame. Clip the actual rendered page surface, including accelerated content; a rounded decorative background alone is insufficient. Use native/composition clipping compatible with the chosen browser host, without injecting website CSS or changing page layout. The curve follows the existing Browser corner-radius setting. Derive the inner radius from the outer radius minus the frame's content inset, clamped to zero and half the viewport's width/height. With 12 DIP padding and a 1 DIP border, the default outer radius of 32 gives an inner radius of 19. An outer radius of zero produces square corners.

Keep the clip correct after resizing, display-scale changes, page zoom, navigation, Expand/Restore, and hiding/showing browser controls. The exposed corner areas show the selected panel color. Radius/color changes must redraw the frame and viewport without reloading the page, recreating the browser, or losing forms, scroll position, history, focus behavior, or website data. Verify actual page pixels against contrasting frame colors rather than relying only on configured style properties. No additional rounding preference is required.

The default toolbar contains **Back, Home, Refresh, Forward, Match page color**, and **Expand/Restore** at the right. Use a color-picker icon with an accessible name and tooltip for Match page color. Keep all six buttons usable without overlap at the minimum panel width, reducing padding and spacing when necessary. Disable unavailable Back/Forward actions. There is no address bar or tab strip. Normal links, including requests for new windows, navigate in the same view. External application protocols require an explicit user action and confirmation through Windows; do not execute arbitrary shell commands from page content.

**Match page color** reads the current page's solid CSS backdrop and saves it as this Browser panel's background color. Inspect root/body backgrounds and visible perimeter elements so a full-page application wrapper can supply the color without a centered content card taking priority. Resolve transparent layers against their underlying colors, using the browser's default white canvas when the page has no background. Use a representative solid fallback for gradients and background images; this action does not reproduce images or gradients. Inspect the live DOM through a fixed, read-only host operation, without changing website CSS, creating visible page elements, reading credentials, or accepting executable script from page content or an external control endpoint.

Apply the matched color to the frame and controls, adapt foreground colors for contrast, and retain the existing browser instance, page, forms, scroll position, history, and website data. Save through the existing per-panel background-color preference, including normal restart persistence and configuration export/import. The manual Match page color action performs one match. With automatic matching off, subsequent navigation or page-theme changes keep the saved color until the user matches again or changes it in settings. Disable the manual action while loading or inspecting the page. On inspection failure leave the saved color intact. Cancel stale requests on navigation, shutdown, or a newer manual color choice so an old result cannot overwrite the current choice.

Settings provides:

- Home URL with Apply/validation.
- Page zoom: **25%–300%**, in **5%** steps, default **100%**.
- Show browser controls: on by default. Turning it off removes the toolbar and gives its space to the page.
- Show color picker: on by default. Independently show or hide the toolbar's Match page color button and reclaim its space. Apply immediately without reloading the page or recreating the browser. Keep Match page color in the context menu regardless of this setting or toolbar visibility. Hiding/showing the toolbar, carousel reveals, navigation, expansion/Restore, updates, and restarts must respect this saved choice. Include the boolean in configuration export/import and Undo; Reset this panel restores it to on.
- Automatically match page color: off by default. When enabled, match the currently loaded page immediately, or wait for its load to finish. Thereafter match after each completed navigation, including Home, Refresh, Back/Forward, final redirect destinations, and URL changes within single-page applications. Briefly debounce to allow the new page/route styles to render and combine duplicate navigation notifications. Reuse the same background detection, contrast, solid fallback, and safe inspection behavior as the manual action. Work independently of the toolbar and color-picker visibility and while the browser panel is hidden. Keep the preference across restarts/updates and include it in configuration export/import and Undo; Reset this panel restores it to off.

Automatic matching updates only this Browser panel's saved background color and does not reload or recreate the browser. Keep manual matching available in either mode. A manual color choice cancels pending inspection and stays until the next navigation when automatic matching is enabled. Turning automatic matching off cancels queued/in-flight matching and retains the last saved color. Navigation and shutdown also cancel stale work. Match again when reopening a page after a browser restart with this option enabled. This is navigation-triggered matching; arbitrary theme/content changes without navigation are not continuously monitored.
- Request mobile site: off by default. Use a mobile browser user agent when enabled, and the engine's normal desktop user agent when disabled. Apply before the first page request on startup. Changing this preference reloads the **current URL**, retaining the same browser/profile, cookies, website storage, history, page zoom, and toolbar visibility. A reload can reset transient page state such as forms and scroll position. Persist this boolean and include it in configuration export/import and Undo.

Mobile mode must affect both HTTP User-Agent headers and `navigator.userAgent` consistently. Use a mobile identity compatible with the rendering engine; avoid claiming unsupported browser capabilities. It requests a mobile site rather than emulating a phone: it does not force touch input, a fixed phone-sized viewport, or mobile CSS. Sites using responsive width rules can still choose a wider layout in expanded mode. Expansion/Restore never switches the user agent or reloads the page. Do not create a separate mobile profile or clear website data when changing modes.

Zoom and toolbar visibility apply immediately and persist across navigation, carousel moves, and restarts. The page context menu always includes Expand/Restore, Match page color, and **Grand Central Desktop Settings**, including with controls hidden. Preserve useful native page actions such as Copy/Paste and Open Link only where relevant; do not fill the menu with developer commands.

Downloads and camera/microphone/device permissions are disabled in the baseline. Do not grant them silently. Browser failure must leave the other panels usable and expose a concise retry action.

### 6.2 Extra-wide mode

Expand occupies the union of the three normal panel slots on its own monitor, including their gaps, at the same height when space permits. Temporarily hide the other two panel contents and the outer carousel arrows. Suspend carousel previous/next actions and shortcuts while expanded. Corner/calendar widgets remain available. This is desktop panel expansion, not maximizing a foreground application window.

Show an independent floating **Restore browser** button above the expanded panel's top-right edge, outside the page and separate from the browser toolbar. Use a rounded 44 DIP button with a restore icon, accessible name, visible keyboard focus, and the Browser panel's background/foreground contrast. Keep it visible and interactive when browser controls are hidden. Reserve space below the calendar and inside the monitor's work area, reducing an oversized panel's height when necessary; never cover web content or place Restore off-screen. Keep this desktop control behind foreground application windows. Hide it outside expanded mode and remove it on shutdown; retain it through application updates and recompute its position for monitor, DPI, size, and widget changes.

Restore returns to the same previous three-panel arrangement without advancing the carousel, hides the floating button, and re-enables the arrows/shortcuts. The toolbar and browser context menu also retain Restore. Keep the same browser instance, page, forms, scroll position, cookies, back/forward history, and mobile-site preference during either transition. Expansion follows monitor/layout changes and survives unrelated settings updates. Persist expanded state per display; restore it when that browser is next shown. A newly added display starts unexpanded.

### 6.3 Profile and login persistence

Use one profile-owning browser service with independent monitor WebViews. Create one dedicated, stable WebView2 user-data folder, such as `Data/Browser/`. It must not depend on executable version, development checkout, temporary extraction path, or a randomly generated helper instance. Do not use InPrivate mode. WebView2 stores cookies and website storage in its user-data folder; choose its location explicitly. See [Manage user data folders](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder).

Hiding, restoring, expanding, reordering, changing colors, or updating another panel must not recreate the browser environment or clear website data. Keep the page alive while hidden. Closing/restarting the application preserves persistent cookies, localStorage, IndexedDB, and other site data. Reopen the most recent URL when available; Home remains a separate configured destination. Back/forward history may be process-local after a full application restart.

**Login persistence requirement:** normal browser-helper restarts should not unnecessarily log the user out, including sites that rely on session cookies. First test the selected WebView2 runtime's actual behavior with session cookies. A persistent profile alone is not proof that they survive process exit. If necessary, implement a protected session-cookie snapshot using supported APIs, preserving domain/path, expiry, HttpOnly, Secure, and SameSite semantics. Never restore expired, explicitly removed, or logged-out cookies. Serialize helper shutdown/startup so stale snapshots cannot overwrite newer logouts.

Credential material must never appear in logs, configuration exports, status IPC, or release packages. Prefer the browser's own storage and Windows protection; a separate snapshot needs equivalent per-user protection and restricted file access. A site may expire or revoke a login server-side; the app cannot promise perpetual authentication.

Moving the EXE and its data to another Windows account or computer does not guarantee that browser encryption or account tokens remain usable. Distinguish portable software/settings from portable authenticated sessions. Do not weaken credential protection to make sign-ins roam.

Calculator errors clear as soon as the expression is edited again. Retain the history row's allocation so clearing an error never moves the keypad; successful equation history continues to follow the existing calculator behavior.

## 7. Quick Notes

Provide exactly one note in one panel, with stable ID `notes` and default title **Quick Notes**. Append it after All Apps in the default carousel order, leaving Programs, Desktop, and Documents visible at startup. Offer the same independent visibility, position, title, color, and corner-radius settings as other panels, without icon-grid controls. There is no note list, notebook selector, or multi-note workflow.

Use one always-visible, multiline **plain-text editor**, with no Markdown rendering, Preview/Edit button, or mode-switching context action. Keep the empty **Write a note…** hint and all text at the **top left** with consistent padding. Text must not move vertically or horizontally when focus changes, the first character is entered, autosave completes, or an existing note is loaded. Keep the panel title centered. Formatting characters, links, HTML, and Markdown syntax remain literal text; do not interpret or automatically launch them.

Offer **Font size** on the Quick Notes settings page, default **14 DIPs**, integer range **8–36**. Apply it immediately to note text and the empty hint on every enabled display, keeping the title and footer sizes unchanged. Reflow wrapping and scrolling while preserving text, caret/selection, and keyboard focus. Save the choice across restarts and include it in configuration export/import and Undo. Reset this panel restores 14 without altering the note file. Reject invalid types and out-of-range imports before writing settings.

Clicking or tapping the hint, text, or blank editor area focuses the text entry immediately. Preserve the pointer's caret placement and selection when ensuring focus. Only the activated monitor's editor takes focus; footer controls and file dialogs retain their own focus. A hidden, disposed, or unavailable editor must not take focus. Preserve normal selection, Copy/Paste, Unicode, multiline paste, Enter/keypad Enter for newlines, caret navigation, and text input methods. Typing must not navigate the carousel or activate a separate application window. Long notes wrap and scroll within the panel while the centered title, compact save status, Retry, and file button remain stationary. Preserve text, caret/selection, and scroll state during unrelated settings changes and application updates.

Show Saving and errors while relevant; after a successful save, fade Saved after about two seconds while reserving its footer space. File-export success also fades.

Save changes automatically after a short typing pause (approximately 350 ms), and flush pending edits before application shutdown or an update. Write one plain UTF-8 file at `Notes/note.txt` under the chosen persistent application data root, with atomic replacement and per-user restricted access. Store it outside immutable release/extraction directories and reload it on application startup. Existing note text must remain byte-for-byte intact when changing the editor implementation. Emptying the editor intentionally saves an empty file. Hiding the panel, changing its appearance, resetting panel preferences, importing configuration, and replacing the executable retain the note. Configuration export/import includes note appearance, **not personal contents**; document the text file's location for separate backup.

The editor retains the native text context menu. The note background offers **Copy Note**, **Load from File…**, **Export to File…**, and Settings. Copy Note copies the complete literal text. A compact file button provides the two file actions, with the tooltip **Load or export note** on hover or keyboard focus after a short delay. Keep it inside the button's monitor and noninteractive. Dismiss it on leaving the button, opening its menu/dialog, hiding the panel, activating another application, or shutdown; remove its timer and visual on disposal. Do not add mode buttons, rich-text tools, unrelated file-management actions, or application-launcher commands.

**Load/export files:** use native Windows Open/Save dialogs with text-file and unrestricted-file options. Existing `.md` files may be loaded as literal text. Export defaults to `note.txt`; let the user choose a folder, filename, and confirmed overwrite. Export the latest complete text, including pending edits, without changing the working note or its autosave destination. Support empty notes and preserve UTF-8/Unicode. Load validates the complete chosen file before replacing the single note, then saves a copy to the normal local autosave file. Later edits leave the external source file unchanged. After a successful file load, show a brief Undo action (about eight seconds) that restores and autosaves the previous note. Share this single Undo across monitor views. Expire it immediately on a newer edit or subsequent load, on timeout, or when the last note view is disposed. Keep its previous text in memory only and exclude it from configuration and backups created by the application. Undo is optional for the user and must never overwrite edits made after the load. Reject invalid/oversized/unreadable input without changing the current note or saved file. If the user edits during asynchronous reading, retain the newer draft and ask them to load again. Cancelling either dialog changes nothing. Report load/export failures and permit another attempt. Close pending file dialogs and cancel I/O on shutdown/update; late callbacks must not replace a newer or disposed note.

Bound the note to 1 MiB of UTF-8 data. Refuse oversized or invalid/unreadable files without truncating or replacing them. If saving fails, retain the in-memory draft and last saved file, display a meaningful error, and provide Retry. If initial loading fails, disable editing/saving until loading succeeds so an unseen existing note cannot be overwritten. Updates/rollback must carry an unsaved draft even when disk saving failed. Remove save timers and input subscriptions on disposal; hiding/showing must not create duplicate saves or editors.

## 8. Media playback widget

Position at the bottom right, using the same rounded solid-color design as the panels and weather. Show artwork or a small fallback icon, song title, artist, and one Play/Pause button. No previous/next, seek bar, volume slider, or playback queue.

Use the media sessions Windows detects through **Global System Media Transport Controls** (`Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`), not separate integrations for Spotify, a particular browser, or a website. Compatible websites work when their browser publishes a media session. See [GSMTC session manager](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager).

Selection rules: playing sessions take priority over paused sessions; among playing sessions, prefer the most recently started. Retain a stable current session on ties. A paused session with a current track remains visible with Play so the user can resume. Stopped/closed sessions disappear, and the widget hides when no eligible session remains.

Respect per-session playback capabilities. Disable an unavailable action rather than sending repeated commands. Update metadata, artwork, playback state, and session selection from events, including when apps close or another session starts. Bound artwork dimensions/downloads and handle missing titles without displaying broken controls.

**Prototype gate:** Microsoft lists the `globalMediaControl` capability for the manager. Verify access from the actual unpackaged portable executable and chosen language/runtime on a clean Windows account. Documentation of the API is not proof that every deployment model is interchangeable. Do not silently turn the deliverable into an MSIX/Store installation to satisfy an integration. If an identity requirement emerges, resolve it explicitly while retaining the portable requirement.

## 9. Weather widget

Use Choose a location when no location is configured, Loading… while awaiting an initial reading, and Unavailable when a configured location has no valid current reading. Keep the location name and clickable weather-app action. Valid offline readings and the existing sixteen-minute stale-refresh label rule remain unchanged. These labels do not change or store provider data.

Position at the bottom left, with the same width, height, radius, and color treatment as media. Show a **full-color weather-condition icon**, whole-degree temperature with unit, and location name. `69.8°F` becomes `70°F`. Round with `floor(value + 0.5)`, including negative halfway values, and never show negative zero. Provide Celsius/Fahrenheit in settings; infer an initial unit from regional preferences where reliable.

Clicking opens the configured weather application or weather-provider page for that location. If no compatible app is available, use a browser destination; do not assume the Windows Weather app is installed or has a stable supported deep link. The widget is clickable even while an enabled/configured source has no current reading (Unavailable). Hide it when disabled or its provider is unavailable.

Place light/muted text at the widget's **bottom right** using exactly the capitalization **Last refreshed: 17 minutes ago**. Show it only when the last successful refresh was **more than 16 minutes** ago. At exactly 16 minutes it is hidden. Use whole elapsed minutes, update the wording once a minute, and distinguish successful retrieval time from the provider's observation/forecast timestamp. Failed fetches do not reset the refresh age.

Refresh in the background every **15 minutes while online**, and after resume/reconnection when stale. Coalesce requests, enforce timeouts, and back off on errors/rate limits. Keep a last valid reading during transient failures with its truthful age; do not present arbitrary old hourly forecasts as current observations. Settings should show unavailable-provider errors without putting technical explanations on the desktop.

**Windows integration:** use an explicit city/location and a weather-provider adapter. Do not rely on Windows Weather's private storage or an undocumented shared cache. Location is entered by the user; automatic location requires a separate opt-in permission and must not be required for portability.

**Recommendation:** Open-Meteo is a suitable initial provider for a personal/noncommercial build: request current temperature, weather code, and day/night for stored coordinates; map codes to bundled, properly licensed color icons. Provide provider attribution in Settings/About. Its free endpoint has noncommercial terms and request limits; commercial distribution needs a suitable plan or another provider. Verify terms at release time. See [Forecast API](https://open-meteo.com/en/docs) and [provider terms](https://open-meteo.com/en/terms). No provider key or location request should be needed before the user configures weather.

## 10. Calendar event pill

Place a single rounded pill at the top center. It grows automatically for **one, two, or three** adjacent event sections; the user does not manually resize it. Each section shows an event title and compact time/day information. A timed event is active from its start through the instant before its end. Use a lighter charcoal background, a thin edge in the Windows accent color, and a `Now ·` time label. Visible overlapping timed events can each be active. All-day and zero-duration events use the neutral style. Update at event boundaries and after resume without shifting surviving card geometry. This state is derived from event times and has no saved preference. Hide the entire pill when disabled or no eligible events remain.

Settings uses **Show calendar**, **Days ahead**, and **Maximum events**. Today is always included:

| Days ahead | Included dates |
| --- | --- |
| 0 | Today only |
| 1, default | Today and tomorrow |
| 7 | Today plus the next seven days |

Allow 0–365 days ahead and 1–3 events, default 3. Store days ahead directly: `daysAhead: 1` includes today and tomorrow.

Query from the start of today through the exclusive start of the day after the final included date, using the user's local time zone. Advance calendar dates, not multiples of 24 hours, so daylight-saving transitions are correct. Include ongoing events that began before today. Exclude finished and cancelled events; future zero-duration events are eligible. Expand recurring events and exceptions in the query interval. Interpret all-day end dates as exclusive.

Sort ongoing events first, then by start time, with stable tie-breaking by end time and provider event/occurrence ID. Deduplicate occurrences by source calendar and occurrence identity, not merely by title. A changed or cancelled occurrence must update promptly. Limit the result after filtering/sorting.

Use Today, Tomorrow, or a localized date, and the Windows 12/24-hour preference. Show All day where applicable. Show an end-day label for events crossing dates. Truncate long titles without changing pill geometry; expose the full title through accessibility/tooltip. Clicking an event opens its provider's event URL or the configured calendar app. Do not pretend a local ICS occurrence has an Outlook-specific event ID.

**Windows integration:** baseline sources are selected **local `.ics` files and read-only HTTPS calendar feeds**. Use an established iCalendar library for time zones, recurrence, exceptions, and bounded expansion. Watch local files; refresh remote feeds at a provider-appropriate interval, recommended 15 minutes, with conditional requests and backoff. Refilter the display every minute and at local midnight. Source/visibility/day-range changes apply immediately.

Account-based Outlook integration is optional. A future Microsoft Graph adapter should use delegated sign-in, a public-client OAuth flow with PKCE, minimum read permissions, protected token storage, and `calendarView` to obtain expanded occurrences. Never embed a client secret. Microsoft's [calendarView API](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0) documents occurrences/exceptions and read permissions. Windows' [AppointmentManager](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.appointments.appointmentmanager.requeststoreasync) has its own capability requirements; neither it nor Outlook COM should be treated as guaranteed access to every user's calendars from a portable app.

Calendar data is read-only. Disabling the feature stops subscriptions and hides the pill. Distinguish an empty calendar from a failed source in Settings. Cache data with a bounded lifetime, and avoid showing stale events indefinitely after a remote source becomes unavailable. Private feed URLs often contain credentials: store them as secrets and exclude them from ordinary configuration exports.

## 11. Settings and context menus

### 11.1 Settings organization

Open Settings from **Grand Central Desktop Settings** in desktop/panel context menus, browser context menus, or the notification-area icon. Keep one Settings window per running instance. Changes apply immediately, except text fields with an explicit Apply action. Do not rebuild unrelated panels or reset browser state when applying a preference.

Keep the overview short:

1. **Panels** — seven rows, each with reorder handle, title, visibility switch, and a customization arrow.
2. **Desktop layout** — size preset, named monitor, and Advanced dimensions/gaps/margins.
3. **Calendar** — visibility, days ahead, maximum events, and sources.
4. **Weather** — visibility, location, unit, and provider/open destination.
5. **Advanced** — keyboard shortcuts, history/privacy controls, configuration export/import, and About/diagnostics.

Media appears automatically when eligible; an optional Show media switch belongs in Advanced rather than adding another large section. Weather/media use the default dark widget palette, consistently across both. Independent widget color customization is not required by the current product.

Text fields with invalid URLs or folder-path syntax show a short explanation immediately below the field when applied. Do not change stored values on failure. Clear the error outline and explanation as soon as the edited value is valid. Keep Enter/Apply behavior consistent with existing controls; valid typing alone does not unexpectedly navigate a browser.

Use the same friendly display names and connector suffixes in desktop selection and per-display Browser settings. Mark each Browser display as Using defaults or Customized from its actual saved overrides, updating immediately after edits/import/reset without recreating the focused row. Derived status labels are not separately persisted.

Panel detail pages expose color swatches/custom color and everyday controls first: icon size/labels for icon panels, mounted drives for Desktop, and browser URL/zoom/controls/mobile-site requests for Browser. A collapsed Advanced section holds custom title, corner radius, rows/columns/item limit where applicable, and Reset this panel. Desktop's custom folder/hidden-file/sorting settings and Programs' Clear History belong there. Avoid showing icon-grid controls on Calculator, Browser, or Quick Notes.

Monitor selection uses friendly names and stable hardware-and-connector identities, not just enumeration indices. Include Primary monitor, All monitors, and individually selected displays. Browser settings include a separate Per-monitor browser settings page listing connected and saved unavailable displays, with inherited defaults until customized. If a selected monitor disconnects, use the primary display temporarily while retaining the saved selection. Reconnecting returns the surface to that monitor. Importing an unknown monitor ID follows the same fallback rule.

### 11.2 Context-menu audit contract

Actions depend on the clicked object and actual capabilities. Settings is the final app-provided item, separated from content actions. Avoid repeated carousel commands, irrelevant file operations on app groups, and disabled clutter.

| Target | Relevant actions |
| --- | --- |
| Empty desktop background | Display Settings; Grand Central Desktop Settings |
| Empty non-Desktop panel | Grand Central Desktop Settings |
| Empty Desktop panel | Open Desktop Folder; Display Settings; Settings |
| File | Open; Show in File Explorer; Properties; Settings |
| Filesystem folder / mounted root | Open Folder; Show in File Explorer where meaningful; Properties if supported; Settings |
| App in Programs or All Apps | Open; New Window only when supported; Show Details when available; Settings |
| Logical All Apps folder | Open Folder inside panel; Rename Folder; Settings |
| Empty space inside an All Apps folder | Rename Folder; Settings |
| Quick Notes editor | Native text selection/Copy/Paste; file actions and Settings available outside the editor |
| Quick Notes background | Copy Note; Load from File; Export to File; Settings |
| Calculator text entry | Native text editing/Copy/Paste; Settings accessible from panel background |
| All Apps / Recent Documents search entry | Native text editing/Copy/Paste; Settings accessible from panel background |
| Browser page | Relevant native page/text actions; Expand/Restore; Match page color; Settings |
| Weather | Open Weather; Settings |
| Calendar event | Open Calendar / event; Settings |
| Media | Play or Pause as applicable; Open Player when supported; Settings |

**Windows integration:** Show Details uses a supported app-specific settings/details destination or executable/shortcut Properties. Do not assume every app has a Microsoft Store identity or an app-specific `ms-settings:` URI. Omit the action when no meaningful destination exists. A logical app folder is not necessarily a filesystem directory and must not receive fake file Properties actions.

**Display Settings** opens Windows **System → Display** using the supported `ms-settings:display` URI and standard Windows URI activation. Keep it separate from Grand Central Desktop Settings. Offer it on blank desktop background and empty Desktop panel areas; omit it from file/app icons, other panels, and navigation controls. Opening the system page must not itself change display configuration, require elevation, or add application preferences. If activation is unavailable or blocked, show a concise error and keep the desktop usable. See [Launch Windows Settings](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings).

Use Windows shell APIs for launching, revealing, and Properties rather than shell-interpolated command lines. Native browser/text menus can keep their normal relevant editing options; the goal is appropriate actions, not an identical menu for every surface.

### 11.3 Keyboard and accessibility

Provide configurable/disableable shortcuts for Show/Restore Desktop and previous/next carousel view. Suggested mappings are Win+Alt+D, Win+Ctrl+Alt+Left, and Win+Ctrl+Alt+Right. These are proposals, not guaranteed available Windows chords. Attempt supported registration, report conflicts in Settings, and let the user choose another chord; never seize existing OS shortcuts. Standard Win+D must continue to work independently.

If implementing a custom Show/Restore command, track only windows this command minimized and restore only those still eligible. Do not restore unrelated windows the user had already minimized, or perform a blanket minimize/restore across other virtual desktops.

All actionable controls need keyboard focus, accessible names, visible focus indicators, and UI Automation exposure. Menus work through Menu/Shift+F10. Respect text scaling, reduced motion, high contrast, and screen-reader output. Tooltips supplement labels, not replace accessible names. Carousel movement must not steal focus from a foreground application when caused by a data refresh.

## 12. Configuration and state

### 12.1 Storage categories

Separate preferences, transient state, cached source data, and credentials:

| Category | Examples | Lifetime / transfer |
| --- | --- | --- |
| Preferences | Panel order/colors/grids, URL/zoom, widget options, monitor, shortcuts | Persistent; exported |
| Program history | Bounded app identity/recency list | Persistent; exported; clearable |
| Session state | Carousel position, pages, current app folder, independent All Apps and Recent Documents search queries/results pages/browsing contexts, calculator input/memory | Retain during live changes; excluded from configuration export; restart restoration optional except explicit preferences |
| Browser profile | Cookies, website storage, browser cache, protected session snapshot | Persistent; never part of configuration export |
| Quick Note | One UTF-8 plain-text file, `Notes/note.txt` | Persistent user data; excluded from configuration export; retained on reset/update |
| Provider cache | Weather sample, calendar occurrences, icon cache | Bounded/rebuildable; not exported |
| Secrets | OAuth tokens, API keys, private calendar feed URLs | Protected per user; never exported as plain settings |

Do not store configuration only in the registry. Use a versioned JSON file and atomic replacement. Changes must survive a crash without leaving truncated JSON. Retain a last known good configuration and report recovery instead of silently discarding a damaged profile.

### 12.2 Windows export/import format

Use UTF-8 JSON, maximum **1 MiB**, with `product: "grand-central-desktop"`, `platform: "windows"`, `format: 1`, and `settings`. Product release version and configuration format version are separate.

Accept only the product, platform, and format defined here. Files from another platform, product, or unsupported format must be rejected with a clear message; never reinterpret incompatible paths, hotkeys, app identities, monitor IDs, or provider settings. No legacy aliases or automatic migration code are required. A future explicit conversion tool is a separate feature.

Required setting groups and contracts:

| Group | Fields |
| --- | --- |
| `general` | `panelWidth`, `panelHeight`, `panelGap`, `outerMargin` with §2 ranges; `monitorMode` enum `primary`/`selected`/`all` (default `primary`); `monitorId` stable identity or empty; `monitorLayouts` object keyed by identity with nonnegative carousel start positions; `monitorBrowserOverrides` object keyed by identity containing only validated Browser setting overrides; `panelOrder` containing all seven unique IDs; `desktopDirectory` string (empty = Known Folder); `showHidden` boolean; `desktopSort` enum `name`/`modified`; `trackPrograms` boolean; `recentPrograms` bounded array; `shortcuts` action-to-chord mapping |
| Each of seven panel IDs | `enabled` boolean; `title` string; `backgroundColor` `#RRGGBB`; `cornerRadius` integer 0–80 |
| `programs`, `desktop`, `documents`, `apps` | `columns`, `rows`, `iconSize`, `showLabels` with §2 defaults/ranges |
| `apps` | `folderOverrides` array, default empty, with stable folder ID, local name, and optional source-folder identity; `appPlacements` map, default empty, from stable app ID to folder ID or `root` |
| `programs`, `desktop`, `documents` | `itemLimit`, default 100, range 8–500 |
| `desktop` | `showMounts`, default false |
| `calculator` | `showAdvanced`, default false |
| `notes` | `fontSize`, integer 8–36, default 14; shared panel appearance and visibility settings; note contents are separate user data |
| `browser` | `homeUrl`, default `about:blank`; `zoomPercent` integer 25–300 divisible by 5; `showControls`, default true; `showColorPicker`, default true; `autoMatchPageColor`, default false; `requestMobileSite`, default false; `expanded`, default false |
| `calendar` | `enabled`, default true; `daysAhead` integer 0–365, default 1; `maxEvents` integer 1–3, default 3; source descriptors with local path or secret reference; optional open destination |
| `weather` | `enabled`, default true; provider ID; configured location name/coordinates or null; `unit` enum `celsius`/`fahrenheit`; open destination; credential reference if needed |
| `media` | `enabled`, default true |

The seven panel defaults are all enabled, with titles from §3 and visuals from §2. History entries use stable app IDs and recency, with a maximum of 500. Validate title/path/chord/source string lengths and source counts with explicit schema bounds; recommended limits are title 200 characters, path/URL 4096 characters, 32 calendar sources, and no embedded NUL characters. Credentials referenced by ID may be absent after import; mark the provider as needing reconnection rather than erasing other preferences.

All Apps organization is included in configuration exports and Undo. Give custom folders stable UUID-based IDs, independent of their names. Validate unique folder IDs, nonblank names, placement value types, and one explicit placement per app; reject cycles/nesting among custom folders. Import restores a local organization overlay only and never writes to Windows' Start Menu. Unknown app/source IDs may be retained as unavailable references, consistent with other machine-specific settings. Apply the same 1 MiB file limit to organization data.

This is a valid **partial-import example**, not a complete exported file. An exporter includes every defined preference. An importer may merge a nonempty subset into current settings, after validating the complete resulting configuration:

```json
{
  "product": "grand-central-desktop",
  "platform": "windows",
  "format": 1,
  "settings": {
    "general": {
      "panelWidth": 420,
      "panelHeight": 660,
      "panelOrder": ["programs", "desktop", "documents", "calculator", "browser", "apps", "notes"]
    },
    "browser": {
      "homeUrl": "https://example.com/",
      "zoomPercent": 100,
      "showControls": true,
      "showColorPicker": true,
      "autoMatchPageColor": false,
      "requestMobileSite": false
    },
    "calendar": {
      "enabled": true,
      "daysAhead": 1,
      "maxEvents": 3
    }
  }
}
```

Validate types, numeric ranges, colors, URLs, uniqueness/completeness of panel order, and cross-field constraints before changing anything. Reject unknown keys/groups, wrong platform/product/format, duplicate JSON property names, invalid UTF-8, oversized input, and invalid values. Never silently ignore unknown fields or execute imported content. Unavailable local paths/app IDs are valid references with an unavailable state, not grounds for destroying the rest of an otherwise valid configuration.

Stage changes, write atomically, and commit the UI update as one operation. Failure leaves previous settings intact. Import provides **Undo**, backed by a pre-import snapshot. Undo reverses configuration/history changes, not browser logouts or external application activity. Do not include cookies, passwords, tokens, cache, or private feed URLs in exported JSON. Exported home URLs and application history may still be personal; save only to the destination the user chooses.

## 13. Windows architecture and packaging

### 13.1 Recommended implementation

**Recommendation:** a C# desktop application using a supported .NET LTS release, WPF for the native UI, Win32 interop for desktop hosting/Shell operations, WinRT interop for media sessions, and WebView2 for the browser. Pin a tested SDK/runtime version in the application's build configuration. A native C++ implementation is also acceptable if it meets the same contract.

Keep domain logic independent of WPF and OS APIs. Suggested components:

```text
GrandCentralDesktop.exe
 ├─ Application lifecycle / single instance / notification-area menu
 ├─ DesktopHost                 Explorer attachment, z-order, input, DPI
 ├─ Layout + Carousel          panel geometry, order, enabled slots, pages
 ├─ Panel renderers            Programs / Desktop / Documents / Calculator / Browser / Apps
 ├─ Widgets                    Calendar / Weather / Media
 ├─ Windows adapters           Shell inventory, recent items, file watches, GSMTC
 ├─ Providers                  ICS, optional account calendars, weather
 ├─ BrowserHost                one shared WebView2 profile/environment owner, independent display views
 ├─ ConfigurationStore         schema, validation, atomic writes, import/undo
 └─ Core models                calculator parser, sorting, ranges, selection rules
```

Use asynchronous adapters and cancellable subscriptions. Visibility changes should not multiply watchers. Shutdown removes hooks, hotkeys, tray icons, file watchers, and timers. Handle callbacks arriving after disposal. Browser crash/recovery stays within the browser feature; a broken source must not terminate the desktop.

Use a panel registry keyed by the stable IDs in §3 and an explicit factory for specialized panel types. Keep carousel order separate from panel identity; source refresh, settings changes, and state capture must address panels by ID rather than numeric position. Register each constructed panel immediately so partial startup failure can dispose everything already created.

Share the permanent-search field and its query/page/Escape controller between All Apps and Recent Documents, with independent state per panel. Keep name matching and search-state transitions testable without UI or operating-system services. Keep the calculator renderer separate from generic icon-grid rendering. Build settings pages from shared controls and focused page/row builders while preserving the same validation, defaults, navigation, reset, and import/Undo behavior.

Organize integration tests into feature scenarios with shared fixture/input helpers and a small runner. Internal cleanup must preserve the full acceptance coverage, saved-setting identifiers/formats, browser profile, session restoration, and update recovery behavior. Reorganization alone does not require a settings migration or reset.

Browser rendering may require a native child/composition control or a separate helper to satisfy desktop input/stacking constraints. Choose based on the prototype, not convenience. Any helper uses a narrow, same-user authenticated IPC channel with allowlisted commands such as resize, navigate, zoom, visibility, and shutdown. Do not expose an arbitrary-code endpoint or trust page messages to control host settings/files. Prefer one executable with an internal helper mode over a separate user-facing launcher if a helper is needed.

### 13.2 Portable executable contract

Ship a release the user can copy to a writable folder and launch directly. Do not require .NET to be installed separately: publish self-contained for the target architecture. A single-file .NET publish can bundle managed components and extract native libraries; it is not a promise of zero disk extraction. See Microsoft's [single-file deployment documentation](https://learn.microsoft.com/en-us/dotnet/core/deploying/single-file/overview).

**Target baseline:** supported Windows 11 x64 releases, tested and named in the release notes. ARM64 is a separate build/test target. Windows 10 support is optional and must not be implied by the use of APIs originally introduced there. Development needs build tools; the end-user release must not.

WebView2 remains a runtime dependency. Choose and clearly label one of these distributions:

| Distribution | Behavior |
| --- | --- |
| Small portable EXE | Uses an already installed compatible Evergreen WebView2 Runtime. Detect missing runtime and offer an explicit download/setup choice; never silently install it or request elevation. Other panels continue working. |
| Self-contained portable release | Bundle a Fixed Version WebView2 Runtime, either as sidecar files in a portable ZIP or embedded in the EXE and extracted to an app-controlled versioned runtime directory. This is the preferred fully offline option. |

A one-download EXE may extract a runtime/data tree on first launch; document the footprint. Bundling Fixed Version makes the publisher responsible for browser security updates. It does not use the installed Edge browser as a substitute runtime. See [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution). Final packaging must comply with the runtime's redistribution terms and work without administrator rights.

### 13.3 Files and portability

Suggested portable directory:

```text
GrandCentralDesktop/
  GrandCentralDesktop.exe
  Runtime/                     optional bundled/extracted WebView2 version
  Data/
    settings.json
    settings.previous.json
    State/                     pages, optional session recovery
    Browser/                   dedicated WebView2 user-data folder
    Notes/note.txt             the single automatically saved plain-text note
    Cache/                     icons, weather, calendar
    Secrets/                   per-user protected provider/session material
    Logs/                      bounded diagnostic logs, no credentials
  README.txt                   run, exit, dependencies, data location, recovery
  LICENSES/                    required notices and third-party licenses
```

Keep the profile stable when replacing/updating the EXE. Do not point the browser into an extracted release directory that gets deleted on upgrade. Relative custom paths, if supported, resolve against the portable application directory, never the caller's working directory. Known Folder paths continue to resolve for the current Windows user.

If the directory is read-only, do not silently create a new empty profile on every launch. Explain the issue and offer a writable folder or an explicit per-user `%LOCALAPPDATA%\GrandCentralDesktop` profile. Display the active data location in Advanced. Moving a profile while WebView2 is running is prohibited; stop its sessions first. Local storage is the supported baseline; network-hosted browser profiles are not.

Use Windows protection for secrets and appropriate filesystem permissions. A removable FAT/exFAT drive may lack per-user ACL protection; account-bound protection may also prevent sign-ins roaming. File portability must not imply that sensitive profiles are safe to share.

Run once per selected user/profile. A second invocation opens existing Settings or brings up a small existing-instance command without spawning duplicate panels. Use a named mutex and a restricted local channel if necessary. Expose a small notification-area menu: Settings, Show/Hide Desktop Panels, Exit. Exit must work even if the desktop backend fails.

No startup registration by default. An optional Launch at sign-in setting must be explicit, current-user only, removable, and preserve settings when toggled. Do not add scheduled tasks, services, or shell replacement registry changes. Closing Settings leaves the desktop app running; Exit shuts it down cleanly. Removing the portable folder while stopped removes its portable data too, so README must explain how to retain `Data/` first.

### 13.4 Development and updates

The production portable folder must be independent of the editable source tree. Do not watch unfinished source edits or load DLLs/resources directly from the checkout. Publish a complete tested release artifact before replacing a working copy.

For version 0.1, a complete release replacement while stopped is acceptable; preference changes still apply live. If an updater is added, use verified artifacts, stage the complete version, exit gracefully, switch atomically where possible, restart, and retain a working rollback copy. Handle locked EXEs rather than overwriting a running binary. Never delete `Data/` on upgrade. Network auto-update is optional and requires an explicit setting; no update service is required.

Release metadata should say Grand Central Desktop 0.1. Windows executable file version may be `0.1.0.0`; configuration format remains independently versioned. Keep recoverable earlier releases and document a simple rollback procedure. Product identity, file version, and configuration format must remain explicit and consistent across packages and diagnostics.

## 14. Performance, privacy, and failure behavior

- Show the initial shell/panels promptly, then populate slow providers asynchronously. Proposed development budgets: usable shell within 3 seconds on a documented reference PC, excluding first-run runtime extraction; idle host CPU below 1% averaged over a minute. Measure and publish actual results before treating these as guarantees.
- Measure host and browser costs separately. A heavy website can consume substantial memory/CPU; report that accurately rather than claiming a fixed budget for arbitrary pages.
- Use system events/file notifications for app, mount, media, display, and desktop changes. Avoid repeated full inventories on animation frames or tight polling loops. Debounce bursts. Weather's 15-minute fetch and once-per-minute age update are distinct timers.
- Pause unnecessary visual work while hidden/locked. Keep browser session state intact. Resume stale providers once, without overlapping requests.
- Bound histories, caches, recurrence expansion, request sizes, artwork sizes, and log growth. Do not fetch all recurrences of an unbounded series.
- No telemetry by default. No keyboard/content logging, account scraping, global unsafe mode, code injection into Explorer, or administrator requirement.
- Only configured weather/calendar providers and explicitly navigated websites make application-originated network requests. Browser runtime servicing may have its own documented behavior. No network request is needed to display the local file/app/calculator panels.
- Never log browser cookies, auth headers, private feed URLs, tokens, or document contents. Diagnostics should identify the failing component and safe error category.
- If a monitor disappears, a source denies access, a shortcut is missing, or a browser process crashes, preserve preferences and keep the remaining desktop functional. Settings and Exit must always remain reachable.

## 15. Acceptance criteria

These are release checks, not a demand to duplicate UI implementation in unit tests. Use pure tests for logic and real Windows sessions for platform behavior. Mock adapters alone cannot validate desktop stacking, WebView2 persistence, or unpackaged media access.

| Area | Required verification |
| --- | --- |
| Portable startup | On a clean standard-user account, copy release and double-click EXE. No installer/admin/service/.NET setup needed. Verify both declared WebView2 distribution modes and missing-runtime behavior. |
| Desktop stacking | Place Firefox, Explorer, another app, a modal dialog, and a maximized window across panels/widgets/browser. All remain in front. Focus changes and source refreshes never raise the desktop. |
| Desktop input | Type into calculator and a web form, select text, use menus, navigate with keyboard, then switch to a normal window. No focus trap or floating browser helper. |
| Shell lifecycle | Win+D twice, custom Show/Restore, virtual desktop changes, full-screen app, lock/unlock, sleep/resume, Explorer restart, app exit/relaunch. No orphan/duplicate panels or lost tray exit. |
| Displays | Primary/Selected/All modes; two independent three-panel carousels; pointer-targeted shortcuts; separate searches, pagination, calculators, and browser histories; synchronized one-note edits/file loads; consistent corner/top widgets. Verify stable identities after enumeration changes, identical/mirrored displays, selected-display fallback, unplug/reconnect positions and URLs, all-view update/rollback retention, and complete shutdown cleanup. Test mixed 100%/150%/200% scaling, browser native/frame/input geometry and compact toolbar fit, primary changes, taskbar/autohide, small work areas, and orientation changes. No cross-screen input interception, overlap, or unreachable controls. |
| Carousel | Both directions wrap; default left gives Apps/Programs/Desktop; icon paging stays independent. Reorder/hide/show, 0–2 enabled panels, and arrow scrolling preserve correct state. |
| Desktop/files | Redirected/OneDrive Desktop, common Desktop, custom missing folder, hidden files, Unicode names, `.lnk`/`.url`, bad associations, mounted/unmounted/removable/shared roots. No filesystem mutation beyond explicit normal opening. |
| Applications | Win32, packaged app, hosted app, browser-installed app, different-argument shortcuts, folders/nested folders, install/uninstall updates. No unintended duplicates or missing activation targets. |
| All Apps folder editing | App-on-app creation, adding to an existing folder, moving out through Back, last-app cleanup, pencil/context-menu rename, Enter/Escape/focus loss, blank names, and Backspace during editing. Verify preview/title refresh, pinned apps, inventory changes, restart/export/import/Undo persistence, and unavailable references. Confirm Start Menu files/pins remain untouched. Exercise actual drag hit testing, pointer capture, cancellation, shutdown during drag, and live refresh during drag; invisible navigation containers must not block drops. |
| All Apps search | Permanent entry at root/in folders, search-icon focus, centered header, instant name filtering across all folders, case/accent/multiword matching, deduplication/order, no matches, Enter launch/no-op, clipboard/Backspace, clear/Escape behavior, result pagination, compact layout, restoration of folder/page, inventory updates, carousel/live-update state retention, and no folder mutations or extra provider/network searches. Compare header/search/grid/footer geometry before focus, while typing, after clear/Escape, and when folder actions hide: positions must stay fixed. Empty Escape never hides the bar. |
| Program/doc history | MRU focus ordering and bounds; tracking opt-out/clear; recent-item additions and stale targets; private/unavailable data handled without probing or freezing the desktop. |
| Recent-file search | Permanent field, fixed header/search/grid/footer geometry during focus/typing/clear/Escape, compact layout, filename/extension and display-title matching, case/accent/multiword queries, newest-first order, no matches, Enter open/no-op, native clipboard/Backspace, result paging, browsing-page restoration, inventory changes, and carousel/live-update retention. Check privacy and source-status changes while filtering, configured item limits, independent All Apps query state, original file context actions, and absence of filesystem/content/network searches or history mutations. |
| Calculator | Parser precedence, right-associative powers, negative powers, percent examples, memory, invalid input, zero division, nonfinite results, focus after clicks, no history-related keypad movement. |
| Quick Notes | One plain-text editor with no Preview/Edit controls or Markdown rendering. Verify font sizes 8–36, default/reset 14, immediate reflow without text/caret/focus loss, shared-display updates, restart and configuration/Undo persistence, and rejected invalid imports. Verify the file tooltip on hover/keyboard focus, monitor bounds, menu/leave/hide dismissal, and timer/actor cleanup. Verify hint and first line stay top-left before/after typing, focus, autosave, loading, and restart; centered title and stationary footer; literal formatting/markup, multiline input/clipboard, caret/selection, click/tap focus and cancellation, per-display synchronization, and compact scrolling. Native Load/Export supports UTF-8, empty files, `note.txt` default, overwrite/cancellation, separate autosave destination, unchanged external files, invalid input, and concurrent edits/shutdown. Verify private atomic autosave, pending-edit flush, restart/hide/reorder/update/rollback retention, failed-read protection, save Retry, size limits, and reset/import preserving the saved text. |
| Browser behavior | URL validation, native navigation, new-window links, zoom extremes, hidden toolbar context menu, expanded union of slots, hidden/deactivated carousel arrows and shortcuts, and independent floating Restore. Verify Restore pointer/keyboard access with controls hidden, placement below the calendar/inside the work area for tall panels and display changes, live frame colors, same-arrangement restoration, update retention, and shutdown cleanup. Verify all four viewport corners on a bright page with dark/custom frame colors, zero/default/custom radii, compact/expanded sizes, display scaling, and visible/hidden controls. Actual rendered pixels must show the clip while adjacent page content remains intact. Forms/scroll/history and the same browser instance survive resizing and radius/color changes. |
| Mobile-site requests | Default desktop requests; enable/disable through settings; matching HTTP and navigator user agents; reload the current URL using the same browser/profile/history; preserve zoom, hidden controls, cookies, and website storage. Verify persisted choice before the first request after restart, configuration transfer/Undo/type validation, and unchanged user agent/page during expansion/Restore. Document that responsive sites may still choose their layout by viewport width. |
| Automatic browser color | Default off; enabling matches the current loaded page without navigation/reload. Verify automatic colors after Home, Refresh of the same URL, Back/Forward, redirects, single-page route URL changes, and reopening after helper restart. Match with the toolbar/picker hidden and panel off the carousel. Turning off cancels pending work and subsequent navigation retains the saved color; manual matching remains usable. Verify manual-choice cancellation, independent panel colors, preserved browser/profile, configuration round-trip/Undo/boolean validation, reset synchronization, and update/shutdown cleanup. |
| Browser color matching | All six toolbar controls fit the minimum panel width. Match light/dark root and body colors, full-page wrappers, transparent/alpha layers, default white, and solid fallbacks for gradients/images. Verify actual frame pixels and readable controls, one-time behavior across navigation/theme changes, settings/export persistence, hidden-toolbar context access, unchanged page/browser/history, failed inspection retaining the prior color, and navigation/manual-choice cancellation of stale results. Show color picker defaults on; toggling it hides only that toolbar button and space while context matching still works. Verify independent toolbar visibility, carousel reveals, expansion/Restore, helper restart/update retention, configuration round-trip/Undo/boolean validation, and reset synchronization. |
| Browser persistence | Confirm different display views share cookies/storage/sign-in and respect logout while retaining separate URLs/history/controls/colors and one profile owner. Test persistent and session-cookie sites across hide/show, expand/restore, color changes, EXE update, graceful helper restart, app restart, crash, explicit logout, cookie expiry, and rapid restart. Same-user profile retains expected sign-in; logout is never undone. |
| Media | Real native app and browser website; play, pause/resume, stop, close, missing artwork, two competing sessions, unsupported control, unpackaged standard-user access. Hide/show according to §8. |
| Weather | 69.8 → 70, negative/near-zero readings, color conditions/day-night, location/unit changes, same width as media. Age absent at 16 minutes and present after; failed fetch does not reset age. Offline/resume and click destination work. |
| Calendar | Today+0/+1/+7, DST transitions, ongoing/midnight/multi-day/all-day/zero-duration events, active card contrast/accent and Now label, independent overlap, exact start/end transitions, unchanged card geometry, recurrence exceptions/cancellation, multiple sources, duplicate titles, empty/failed provider, 1–3 sections, local-time formatting. |
| Settings | Concise overview, centered panel titles, per-panel independent styling, accessible reorder, reset scope, immediate changes without browser restart. No unwanted footer/tagline. |
| Context menus | Test every target in §11.2, pointer and keyboard activation, capability-dependent actions, hidden browser toolbar. Blank desktop and empty Desktop panel offer Display Settings and launch `ms-settings:display`; verify missing/blocked activation is handled and display configuration/preferences remain unchanged until the user edits them in Windows Settings. No display action on icons, unrelated panels, or navigation controls; no file actions on logical folders or irrelevant app actions on documents. |
| Configuration | Export/import round trip; partial merge; unknown key/type/platform/version; duplicate JSON keys; oversized/malformed file; invalid order/URL/color; write failure; Undo; missing secret/path/monitor. All invalid imports leave settings unchanged. |
| Recovery/data | Kill during settings write; restart after corrupt configuration; retain profile across release replacement/rollback; read-only directory; second invocation; removable-drive loss. No silent settings reset or browser-profile deletion. |
| Accessibility/performance | Keyboard-only use, UI Automation/screen reader, contrast, text scaling/reduced motion; measured idle CPU/startup; no full inventory polling loop. |

Foreground-window stacking, keyboard input, Explorer recovery, and browser cookie persistence are release-blocking requirements. Desktop mode is ready only when these checks pass on the declared supported Windows builds.

### Polish acceptance

Verify native browser text/link menu actions, real delayed-load Stop/Refresh, helper-crash Retry and shared-profile preservation; focus through grid/source/size changes and deliberate page changes; all icon tooltips and truncated-name details; small-control hit areas and compact toolbar fit; single-page stationary pagination and singular counts; scoped Ctrl+F; calculator error clearing without keypad movement; Saved fading with persistent errors; shared note-load Undo, timeout/new-edit dismissal and disposal; field explanations/correction; matching display names and live default/customized status; and configured/unconfigured/loading/unavailable weather labels. Check cleanup during automatic updates, hide/show, and display removal.

## 16. Suggested implementation sequence

1. **Prove Windows integration risks:** minimal desktop host with focusable input and real WebView2, ordinary windows above it, Win+D, Explorer recovery, mixed DPI, and GSMTC access from the final unpackaged deployment model. Record tested Windows builds and unsupported cases.
2. **Build the portable foundation:** lifecycle/tray/Exit, stable data folder, atomic settings and schema, pure carousel/layout/calculator models, and release packaging. Establish source/release separation.
3. **Implement the visible desktop:** seven panel containers, independent styling, centered titles, outer arrows, grid paging, settings overview, reorder/hide, calculator and Advanced layout, and one autosaved plain-text note with top-left text and file load/export.
4. **Connect Windows content:** Desktop/drives, recent documents with permanent filename search, app inventory/folders, program-name search across folders, drag-to-create/add/move-out, inline folder renaming and persistent organization overrides, program history, shell launch/reveal/details actions, and context-menu audit.
5. **Complete browser behavior:** real navigation, hidden controls, zoom, expansion, stable profile and session-cookie/logout tests. Verify profile survival across release replacement before relying on daily sign-ins.
6. **Connect corner/top widgets:** media session selection, configured weather provider, ICS calendar sources, refresh/staleness behavior, responsive geometry, and provider configuration.
7. **Complete export/import and release checks:** all settings, strict validation/Undo, failure recovery, accessibility, reference-PC measurements, clean-user portable/offline package tests, and recovery documentation.

Stages may produce useful previews. Completion means the acceptance contract is met, with unavailable integrations clearly identified rather than populated with mock data. Optional Graph sign-in, additional weather providers, auto-update, and ARM64 can follow without changing the core desktop concept.

## 17. Release deliverables and handoff

A complete release includes:

- The portable executable and any declared bundled browser runtime, with architecture and version clearly identified.
- A short README explaining how to run, open Settings, exit, configure providers, find/back up the data folder, replace a release, and roll back. Explain the desktop-icon setup requirement and any tested Windows build limitations.
- A reproducible build configuration with pinned dependencies and third-party license/asset notices.
- The configuration schema, documented defaults, and valid export examples, including All Apps folder organization.
- Automated logic/configuration test results and a Windows integration report covering §15, including the actual OS builds, display scaling, runtime distribution, and standard-user deployment tested.
- Windows screenshots of the normal desktop, app folder and rename entry, calculator with Advanced collapsed/expanded, normal/expanded browser, Settings, and each widget. These record the delivered UI; they are not prerequisites for implementing the behavior defined here.

Keep this specification with the Windows project as its product contract. A developer must be able to implement and review the application from this document and the cited Windows/provider API documentation without access to another platform's code or screenshots.
