# Source, installation, and updates

The editable source is `Gnome-extension/` inside your Git checkout, for example `~/Projects/GrandCentral-Desktop/Gnome-extension`. Run the installer from that directory after testing a change.

```sh
cd ~/Projects/GrandCentral-Desktop/Gnome-extension
python3 tools/install.py
```

On a first install, GNOME uses `${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/grand-central-desktop@grandcentral-desktop/`. Sign out and back in if GNOME has not discovered the extension yet, then enable it in the Extensions app.

The installer compiles schemas and copies the tested source into a separate immutable `runtime-builds/<release-hash>/` directory within the installed extension. It then switches `active-release.json` atomically. GNOME watches that installed pointer and loads the new build when the extension is active. Editing the checkout cannot change the installed copy. Failed runtime updates restore the previous working release. The installer keeps previous builds for recovery.

To update an existing installation at a different location, pass its extension directory to `python3 tools/install.py --target PATH`. The installer preserves that installation's Shell UUID. See `gnome-extensions list` for installed IDs. Use an independent directory for `PATH`.

The browser profile lives under `~/.local/share/grand-central-desktop/browser`, its cache under `~/.cache/grand-central-desktop/browser`, and the note under `~/.local/share/grand-central-desktop/notes/` with the default XDG paths. Browser updates may restart the helper and reopen the current URL. Settings and user data stay outside the installed release tree. **Settings → Advanced → Configuration** exports settings separately. Keep recovery archives and configuration exports outside Git.
