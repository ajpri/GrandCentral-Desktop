# Grand Central Desktop development and installation

- The editable source is this project. The installed GNOME extension must remain an independent copy. Do not symlink it to this folder or watch unfinished source edits.
- Application behavior lives in `runtime.js`, `runtime-prefs.js`, `browser.js`, `stylesheet.css`, `schemas/`, and the application modules in `lib/`.
- `extension.js`, `prefs.js`, and `lib/runtimeLoader.js` form the small stable loader. Change these only when the loader itself needs work; GNOME caches them for the session.
- After completing and checking an authorized update, publish it with `python3 tools/install.py`. This compiles schemas, creates an immutable release, and atomically switches the installed pointer. The running loader applies it automatically. Do not overwrite the installed tree with a development checkout or use `gnome-extensions install --force` for routine live updates.
- Keep earlier release directories and frozen recovery ZIPs. Settings are not reset during installation.
- Core verification: `gjs -m tests/run.js` and `python3 tests/test_installer.py`. For runtime/lifecycle changes use `python3 tests/integration.py`; it launches an isolated GNOME session.
- No global Shell unsafe mode, arbitrary-code D-Bus endpoint, system service, dependency installation, or launcher is needed for this workflow.

- Product identity is Grand Central Desktop (`grand-central-desktop@grandcentral-desktop`), with matching schema/profile/service names. Release version is metadata `version-name` (currently 0.1); GNOME `version` is an integer (1). Do not add legacy aliases or migration code. Configuration transfer uses export/import. Preserve historical immutable archives.
- Configuration verification: `GSETTINGS_BACKEND=memory gjs -m tests/configuration.js` after compiling schemas; never run these configuration tests against user settings.
- Whenever features are added or changed, update `SPEC-windows.md` in the same task, including affected behavior, settings, persistence, and acceptance criteria. Keep it a standalone Windows product specification: describe Windows behavior directly, without GNOME comparisons or dependencies on this project's source files, screenshots, or other documents. State Windows integration requirements and limitations explicitly.
