# Release 0.1 — clean Grand Central Desktop installation

- Add private JSON configuration export/import under Advanced → Configuration, with full validation before writes and Undo after import.
- Use `grand-central-desktop@grandcentral-desktop`, matching schema/service/profile names, and clean internal identifiers. Preserve the display version 0.1 and GNOME build 1 for the new installation.
- Remove bootstrap bridges, legacy desktop modules, old-loader fallback state, pinned loader migrations, and migration-only tests. Keep normal automatic updates and rollback.
- Save configuration and browser-profile backups before uninstalling the former identity, reinstall cleanly, and restore through the configuration importer. Exports do not include website credentials.

## Earlier transitional development releases

# Release 0.1 — Grand Central Desktop (GNOME build 1)

- Rename the extension and all current product text, menus, preferences, notifications, helper windows, and documentation to Grand Central Desktop.
- Reset the displayed version to 0.1 using GNOME's version-name and reset the whole-number build version to 1.
- Refresh GNOME's cached name/version metadata during installed updates, including sessions running the previous loader. Permit only the exact checksum-pinned compatible loader migration; reject arbitrary host changes as before.
- Preserve the installed UUID, schema IDs, shortcuts, browser service/data identities, saved settings, and previous immutable recovery releases. Rebrand the current distribution archive.

## Preserved development history

# Release 1.0.23 (extension version 24)

- Replace global right-click commands with menus for the clicked file, folder, application, All Apps collection, widget, or empty area. Remove duplicate desktop and carousel navigation actions.
- Add Open, Show in Files, and Properties for files/folders. Open Desktop Folder respects the configured path. Mounted roots omit redundant reveal actions.
- Add app Open, supported New Window actions for running apps, and GNOME Software Show Details. App collections open inside All Apps and do not receive filesystem properties.
- Keep Settings at the bottom, add Menu/Shift+F10 access, and delegate calculator text to GNOME’s Copy/Paste menu.
- Preserve activation/trust checks, configuration, folder state, and the existing browser process. Add an audit document and isolated D-Bus dispatch tests.

# Release 1.0.22 (extension version 23)

- Focus the calculator entry after primary pointer clicks or touch releases anywhere inside the panel, while preserving normal button/toggle actions and entry selection.
- Keep an allocated single-line history label and hide empty text with transparency. Showing, clearing, or replacing equation/error history keeps the keypad in place.
- Cancel deferred focus when the panel is destroyed and avoid focusing it after it leaves the visible carousel. Keep the browser helper running during this update.

# Release 1.0.21 (extension version 22)

- Add an Expand/Restore button at the right of the browser toolbar and the same action to page and toolbar context menus.
- Expand the existing browser across the complete three-panel footprint, hide adjacent panels temporarily, and keep the outer carousel arrows. Restore returns to the normal panel layout; carousel navigation also exits expanded mode.
- Preserve the browser process, page, and navigation history when toggling. Keep context-menu access with hidden controls and fit all five buttons at the minimum width. Preserve expanded mode across unrelated updates.
- This browser-code/schema update restarts the helper once and restores its URL and saved website data; back/forward history resets for that installation.

# Release 1.0.20 (extension version 21)

- Replace seven preferences tabs with a single overview: panel visibility switches, drag handles, customization arrows, Desktop layout, Calendar, and Advanced.
- Support drag-to-reorder with before/after drop indicators and Alt+Up/Down keyboard reordering. Preserve saved ordering and disabled-panel positions.
- Add Small/Medium/Large/Custom size choices and named logical-monitor selection. Preserve exact existing dimensions and disconnected monitor choices.
- Keep everyday panel controls visible, with compact color swatches and a custom picker. Collapse exact grid tuning, titles, radii, history clearing, custom Desktop paths, hidden-file controls, and resets under Advanced.
- Keep calendar options on a focused page and shortcuts on the overview’s Advanced page. Preserve URL validation, independent colors, external-setting updates, reset behavior, and browser sessions.
- Add native settings coverage and screenshots plus a focused, isolated preferences test mode.

# Release 1.0.19 (extension version 20)

- Simplify the calculator to a 20-button, four-column keypad with equals in the bottom-right corner. Use neutral numbers, distinct operators, and a blue equals button.
- Move memory controls, parentheses, square root, square, and reciprocal behind a compact Advanced toggle. Remember the choice across reloads and restarts; preserve expression and memory when collapsed.
- Remove the Ready message and permanent keyboard-help footer. Keep calculation history, errors, and contextual memory status. Preserve keyboard support and input/memory during automatic updates.
- Adapt spacing and text for smaller calculator panels, including the minimum height with Advanced expanded.

# Release 1.0.18 (extension version 19)

- Replace Calendar’s two-choice Days shown menu with Days ahead (0–365). Always include today; 0 means today only, 1 includes tomorrow, and 7 includes the next seven days.
- Preserve saved day ranges and the one-day-ahead default. Update the live calendar query when the value changes.
- Show dates for events beyond tomorrow, including date labels for overnight events.

# Release 1.0.17 (extension version 18)

- Add a top-center calendar pill that automatically grows for one to three ongoing or upcoming events. Hide it when empty.
- Add Layout → Calendar settings for visibility, Today/Today and tomorrow, and maximum event count.
- Read selected GNOME calendars through independent, read-only Evolution Data Server views, including recurring and all-day events, without changing the top-bar calendar range. Follow event and calendar-selection changes live.
- Respect GNOME’s clock format, open Calendar on click, and leave room above tall desktop panels.
- Stop calendar subscriptions and timers when hidden or disabled. Preserve browser sessions during the update.

# Release 1.0.16 (extension version 17)

- Keep folder preview tiles square and centered independently of label width.

# Release 1.0.15 (extension version 16)

- Show GNOME Show Apps folders in All Apps instead of flattening their contents.
- Preserve folder names, membership, ordering, and alphabetical-extension behavior. Render app previews on folder tiles.
- Open folder contents inside the panel with a centered folder heading, Back button, independent paging, and Escape/Backspace navigation.
- Follow live folder renaming and membership changes, and return to All Apps if the open folder disappears.
- Preserve the open folder and main-grid page during automatic updates. Keep existing app visibility/parental-control checks, pinned favorites, and browser sessions.

# Release 1.0.14 (extension version 15)

- Show the weather refresh-age caption only when the last refresh is more than 16 minutes old.
- Hide the caption for fresh readings and unknown timestamps, including from the button’s accessible name.

# Release 1.0.13 (extension version 14)

- Right-align the refresh-age caption at the weather widget’s bottom-right.
- Capitalize its label as “Last refreshed: …”.

# Release 1.0.12 (extension version 13)

- Add a light gray “last refreshed: x minutes ago” line beneath the weather location.
- Update its age each minute using GNOME’s shared refresh timestamp, without increasing the weather-data refresh rate. Show a dash when no valid reading or timestamp is available.
- Keep the existing equal-sized corner widgets and remove the timer/listeners when disabled.

# Release 1.0.11 (extension version 12)

- Round weather temperatures to the nearest whole degree in the selected GNOME unit, preserving localized unit labels and spacing.
- Use GNOME Weather’s full-color condition icons.
- Match the weather widget width to the music widget, shrinking both equally when needed.

# Release 1.0.10 (extension version 11)

- Add a matching bottom-left weather widget with condition icon, temperature, and location. Clicking it opens GNOME Weather.
- Reuse the calendar menu’s existing Weather client and GWeather temperature units, including GNOME’s existing automatic-location permissions.
- Follow location/unit changes, refresh stale data while online, and retain an honest placeholder when readings are unavailable. No independent weather API or geolocation service is added.
- Share the bottom row with media controls, fit both widgets on smaller work areas, and keep tall panels clear of the row.
- Disconnect the extension’s listeners/timer when disabled while leaving GNOME’s shared Weather client running. Preserve installed panel settings and browser sessions.

# Release 1.0.9 (extension version 10)

- Add a rounded dark media widget at the bottom-right of the selected monitor’s work area, with artwork, title, artist, and one Play/Pause button.
- Discover existing and newly started MPRIS players asynchronously using the session bus, matching GNOME’s app/browser media protocol.
- Follow the latest started playing source, fall back to remaining media when it closes, retain paused tracks for resuming, and hide stopped/closed players.
- Respect player control capabilities, ellipsize long metadata, and use a music icon when artwork is unavailable.
- Keep the widget below application windows and reserve space beneath tall panels. Disconnect player signals, cancel pending operations, and remove the widget when disabled or reloaded.
- Preserve existing panel settings and the browser process during this update.

# Release 1.0.8 (extension version 9)

- Add Desktop → Show mounted drives, off by default.
- Display user-visible mounts before Desktop files, with drive names and icons. Open mount roots through the default file manager.
- Update icons on mount, unmount, and mount changes; hide shadowed/duplicate mounts and keep icons available even if the Desktop folder is missing.
- Preserve file ordering, the combined Desktop item limit, all existing settings, and the running browser process.

# Release 1.0.7 (extension version 8)

- Center the title text on all six panels.

# Release 1.0.6 (extension version 7)

- Remove the settings introduction and explanatory rows, descriptions, and redundant subtitles.
- Keep setting labels, actionable controls, and essential input hints.

# Release 1.0.5 (extension version 6)

- Add an All Apps panel that reads the live GNOME Show Apps order, including Alphabetical App Grid and app folders. Include pinned favorites using the grid’s current comparison rules.
- Update the panel when apps are installed, grid sorting changes, or folders change. Respect hidden applications and parental controls; show every available app across independently paged icons.
- Add Layout → Panel order with up/down buttons for all six panels. Apply changes immediately, preserve the leftmost visible panel, and retain order across updates and restarts.
- Keep existing panel settings, browser data, and the running browser process during this update. The initial three panels remain Programs, Desktop, and Documents; All Apps is appended after Browser.
- Publish through the existing automatic-update loader; retain all earlier installed builds and frozen packages.

# Release 1.0.4 (extension version 5)

- Replace the ephemeral browser context with a persistent website data and cache profile outside versioned extension releases.
- Store persistent cookies in SQLite, and restore session cookies from a private snapshot while preserving HttpOnly, Secure, and SameSite flags. Website logout and explicit expiry are respected.
- Preserve localStorage and IndexedDB across helper restarts, browser code updates, extension disabling, and login sessions.
- Save cookie state on orderly helper shutdown and wait for the prior helper to close before starting its replacement.
- Keep the existing automatic-update workflow; no stable loader change is required.

# Release 1.0.3 (extension version 4)

- Add automatic reloads of explicitly installed releases, including nested module changes.
- Keep the source checkout separate from the installed copy. Only atomic publication of a complete installed release triggers the watcher.
- Check every installed file before loading; roll back failed updates and restore the working pointer.
- Preserve calculator state, icon pages, and carousel position. Retain the browser process for unrelated updates; reopen its URL when browser code changes.
- Add `tools/install.py` as the ordinary installation/update command. No dependency installation, launcher, service, scheduled task, Shell unsafe mode, or code-execution RPC is added.
- Add a one-time migration from the already cached older extension. Once activated, future application updates require no Looking Glass commands.
- Keep all earlier frozen release packages for recovery.

# Release 1.0.2 (extension version 3)

- Remove the bottom Settings button and page indicator.
- Put navigation arrows beside the outermost visible panels, centered vertically, with space reserved so they remain on screen.
- Keep the circular carousel and application stacking fixes.
- Add Browser Page zoom (%) from 25% to 300%, defaulting to 100%.
- Add Show browser controls to hide or restore the browser toolbar. Hidden controls stay hidden when the panel is revealed again.
- Include a live update for versions 1 and 2. An older running browser helper is restarted to support the new preferences and reopens its current URL; its ephemeral cookies and navigation history reset during this one-time upgrade.

# Release 1.0.1 (extension version 2)

- Put panel actors inside GNOME's background group, so application window restacking cannot move them over foreground windows.
- Keep panels above replaced wallpaper actors, while remaining below applications.
- Add a persistent bottom Settings button, including when every panel is hidden.
- Make the carousel wrap continuously in both directions, with accurate panel numbers at the wrap boundary. Scrolling over the bottom controls also navigates the carousel.
- Make the desktop root reactive for its context menu.
- Include a one-time live update function for the already imported version 1 module; this uses the same layout and controls as normal version 2 startup.

Release 1.0.0 is retained unchanged for recovery. Existing preferences, Desktop files, and browser configuration are preserved.
