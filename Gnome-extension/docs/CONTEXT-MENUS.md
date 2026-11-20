# Context-menu audit

The previous shared menu appeared over icons and empty panels alike. It offered Grand Central Desktop Settings, Show / restore desktop, Previous panels, and Next panels, while omitting actions for the selected item. Desktop and carousel controls already have keyboard shortcuts and visible arrows.

The replacement chooses actions from the clicked icon or panel. Settings remains at the bottom, separated from item actions. Menus are rebuilt for each target so an earlier selection cannot supply another item's commands.

| Target | Actions |
| --- | --- |
| Empty desktop background | Display Settings; Grand Central Desktop Settings |
| Empty non-Desktop panel | Grand Central Desktop Settings |
| Empty Desktop panel | Open Desktop Folder; Display Settings; Grand Central Desktop Settings |
| Desktop file or recent document | Open; Show in Files; Properties; Grand Central Desktop Settings |
| Filesystem folder | Open Folder; Show in Files; Properties; Grand Central Desktop Settings |
| Mounted drive or share | Open; Properties; Grand Central Desktop Settings |
| Programs or All Apps application | Open; New Window when running and supported; Show Details; Grand Central Desktop Settings |
| All Apps folder | Open Folder; Rename Folder; Grand Central Desktop Settings |
| Empty area inside an All Apps folder | Rename Folder; Grand Central Desktop Settings |
| Calculator expression entry | GNOME's native Copy / Paste menu |
| All Apps / Recent Documents search or folder-name entry | GNOME's native Copy / Paste menu |
| Weather | Open Weather; Grand Central Desktop Settings |
| Calendar | Open Calendar; Grand Central Desktop Settings |
| Media | Play or Pause when supported; Grand Central Desktop Settings |
| Quick Notes editor | Native text selection/Copy/Paste; file button and Settings available outside the editor |
| Quick Notes background | Copy Note, Load from File…, Export to File…, and Settings |
| Browser page | Native relevant Copy/Cut/Paste/Delete/Select All, Open Link and Copy Link; then Expand / Restore, Match page color, and Grand Central Desktop Settings. Desktop commands remain available with the toolbar hidden. |

Show in Files and Properties appear when GNOME Files is installed. They dispatch the selected URI through `org.freedesktop.FileManager1.ShowItems` and `ShowItemProperties`. Folder recognition reuses enumeration metadata; no synchronous filesystem probing is added when opening a menu. Mounted roots omit the redundant Show in Files command.

Display Settings opens the native `gnome-display-panel.desktop` application, using the same activation path as GNOME's background menu. It appears only on blank desktop space and empty Desktop panel areas, when the Displays panel exists and the session allows Settings. It does not apply display changes itself or appear on icons, other panels, or navigation controls.

Show Details appears when GNOME Software is installed and activates its standard `details` action with the selected desktop application ID. New Window is offered only for running applications that support it; stopped applications already have Open. All Apps collections open inside Grand Central Desktop and are not treated as filesystem directories.

Open reuses the existing activation path, including trust checks for Desktop application shortcuts. All Apps folder renaming edits GNOME's shared folder name, not a filesystem directory. Its inline entry retains the native Copy/Paste menu. File deletion, unmounting, uninstalling, and history clearing are not context-menu actions. Browser color matching changes only the saved frame color, preserving its live process and page.

The shared menu also supports the Menu key and Shift+F10. The calculator entry delegates to its native clipboard menu. Context menus close on carousel navigation and are destroyed during extension cleanup; pending service requests are cancelled.

## Verification

The disposable GNOME session verifies target-specific labels, selected-file and folder activation, folder enumeration, configured Desktop paths, file-manager URI dispatch, application activation, GNOME Software details dispatch, missing-Software behavior, All Apps folder opening and nested apps, native calculator clipboard menus, and background display/settings access. Display Settings activation is intercepted on the native Displays app to verify the exact target without opening a real settings window; missing-panel behavior and absence from unrelated menus are also checked. Files and Software requests reach real fixture D-Bus services on the isolated bus. No user files are changed and no app-store or file-manager windows are launched by these fixtures.

Verification includes the desktop and native preferences integration suite, core assertions, isolated app-folder checks, and installer tests. All Apps and Recent Documents search entries, plus folder-name entries, delegate clipboard actions to their native text menus. Filtered result icons retain their application/file actions. Native drag tests exercise GNOME's drag engine, target picking, drop dispatch, and cancellation using captured pointer events and explicit coordinates. Physical gesture thresholds remain a headless-test limitation; menus are opened at actual item geometry through the same context-menu builder.

References: [GNOME application-menu integration](https://github.com/GNOME/gnome-shell/blob/main/js/ui/appMenu.js), [GNOME Files interface implementation](https://github.com/GNOME/nautilus/blob/main/src/nautilus-freedesktop-dbus.c).
