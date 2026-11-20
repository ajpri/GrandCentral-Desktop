#!/usr/bin/env python3
"""Run the extension in a disposable headless GNOME 51 session.

Uses installed GNOME tools only. Does not install or enable the extension in
the user's session. Screenshots and logs are kept in the printed /tmp folder.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import time
import zipfile
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'tools'))
from install import install

ROOT = Path(__file__).resolve().parent.parent


def session(output):
    env = os.environ.copy()
    for kind in ['DATA', 'CONFIG', 'CACHE', 'STATE']:
        path = output / kind.lower()
        path.mkdir(exist_ok=True)
        env[f'XDG_{kind}_HOME'] = str(path)
    env.update(GSETTINGS_BACKEND='keyfile', LIBGL_ALWAYS_SOFTWARE='1',
               GRAND_CENTRAL_DESKTOP_TEST_OUTPUT=str(output), GRAND_CENTRAL_DESKTOP_TEST_ROOT=str(ROOT), GNOME_SHELL_SLOWDOWN_FACTOR='0.01')
    env['GI_TYPELIB_PATH'] = '/usr/lib64/gnome-shell/girepository-1.0:' + env.get('GI_TYPELIB_PATH', '')
    env['LD_LIBRARY_PATH'] = '/usr/lib64/gnome-shell:' + env.get('LD_LIBRARY_PATH', '')
    env.pop('WAYLAND_DISPLAY', None)
    env.pop('DISPLAY', None)
    extensions = output / 'data/gnome-shell/extensions'
    extensions.mkdir(parents=True)
    target = extensions / 'grand-central-desktop@grandcentral-desktop'
    install(ROOT, target)
    shutil.copytree(ROOT / 'tests/probe', extensions / 'grand-central-desktop-test@local')
    # Exercise the user's real sorter when available, isolated from its live
    # settings and files. The rest of the suite also checks manual grid order.
    sorter_id = 'AlphabeticalAppGrid@stuarthayhurst'
    sorter = Path.home() / '.local/share/gnome-shell/extensions' / sorter_id
    enabled = ['grand-central-desktop@grandcentral-desktop', 'grand-central-desktop-test@local']
    if sorter.is_dir() and not env.get('GRAND_CENTRAL_DESKTOP_TEST_WITHOUT_SORTER'):
        shutil.copytree(sorter, extensions / sorter_id)
        enabled.insert(0, sorter_id)
        env['GRAND_CENTRAL_DESKTOP_TEST_APP_SORT'] = sorter_id
    env['GSETTINGS_SCHEMA_DIR'] = str(target / 'schemas')
    subprocess.run(['dbus-update-activation-environment', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME',
                    'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'GSETTINGS_BACKEND', 'GSETTINGS_SCHEMA_DIR'], env=env, check=True)
    desktop = output / 'Desktop'
    desktop.mkdir()
    for i in range(20):
        (desktop / f'Project {i + 1:02d}.txt').write_text(f'Test document {i + 1}\n')
    def setting(schema, key, value):
        subprocess.run(['gsettings', 'set', schema, key, value], env=env, check=True)
    setting('org.gnome.shell', 'enabled-extensions', repr(enabled))
    setting('org.gnome.shell', 'disable-user-extensions', 'false')
    setting('org.gnome.shell', 'welcome-dialog-last-shown-version', '99.0')
    setting('org.gnome.shell.extensions.grand-central-desktop', 'desktop-directory', str(desktop))
    setting('org.gnome.desktop.privacy', 'remember-app-usage', 'true')
    setting('org.gnome.desktop.privacy', 'remember-recent-files', 'true')
    setting('org.gnome.desktop.privacy', 'recent-files-max-age', '-1')
    setting('org.gnome.desktop.interface', 'color-scheme', 'prefer-dark')
    setting('org.gnome.desktop.notifications', 'show-banners', 'false')
    setting('org.gnome.shell', 'favorite-apps', "['org.gnome.Settings.desktop']")
    setting('org.gnome.desktop.app-folders', 'folder-children', "['GrandCentralDesktopTest']")
    folder = 'org.gnome.desktop.app-folders.folder:/org/gnome/desktop/app-folders/folders/GrandCentralDesktopTest/'
    setting(folder, 'name', 'Applications')
    setting(folder, 'apps', "['org.gnome.Nautilus.desktop', 'org.gnome.Calculator.desktop']")
    pages = output / 'pages'
    pages.mkdir()
    (pages / 'index.html').write_text('<!doctype html><html><meta name="viewport" content="width=device-width"><title>Grand Central Desktop browser test</title><body style="background:#f6f5f4;padding:16px;font:18px sans-serif"><h2>Browser home</h2><a href="second.html">Open second page</a><p>A real WebKit browser inside your desktop.</p></body></html>')
    (pages / 'second.html').write_text('<!doctype html><html><title>Second page</title><body><h1>Second page</h1><a href="index.html">Home link</a></body></html>')
    for name, css, content in [
        ('root', 'html{background:#204060}body{background:transparent}', ''),
        ('wrapper', 'html,body{margin:0}#app{position:fixed;inset:0;background:#34243d}article{margin:30%;background:white}',
         '<div id="app"><article>Content card</article></div>'),
        ('alpha', 'html{background:#204060}body{margin:0;min-height:100vh;background:rgba(0,0,0,.5)}', ''),
        ('transparent', 'html,body{background:transparent}', ''),
        ('gradient', 'body{background-color:#202b3b;background-image:linear-gradient(black,white);min-height:100vh}', ''),
        ('spa', 'body{background:#204060}', '''<script>setTimeout(() => {
history.pushState(null, '', '#next'); document.body.style.backgroundColor = '#34243d';
document.title = 'Color spa next';
}, 1500);</script>'''),
    ]:
        (pages / f'color-{name}.html').write_text(
            f'<!doctype html><html><meta name="viewport" content="width=device-width"><title>Color {name}</title>'
            f'<style>{css}</style><body>{content}</body></html>')
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(pages), **kwargs)
        def log_message(self, *_args):
            pass
        def do_GET(self):
            path = self.path.split('?', 1)[0]
            if path == '/slow':
                time.sleep(3)
                payload = b'<!doctype html><title>Slow page</title>Slow page'
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                try: self.wfile.write(payload)
                except (BrokenPipeError, ConnectionResetError): pass
                return
            if path == '/color-redirect':
                self.send_response(302)
                self.send_header('Location', '/color-wrapper.html')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            if path == '/user-agent':
                mobile = 'Mobile/' in self.headers.get('User-Agent', '')
                payload = f'''<!doctype html><html><meta name="viewport" content="width=device-width">
<title>Checking user agent</title><body><script>
const serverMobile = {json.dumps(mobile)};
const browserMobile = /Mobile\\//.test(navigator.userAgent);
document.title = serverMobile === browserMobile ? `User agent ${{serverMobile ? 'mobile' : 'desktop'}}` : 'User agent mismatch';
</script></body></html>'''.encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            if path == '/profile-cache.js':
                count_file = output / 'cache-request-count.txt'
                count = int(count_file.read_text()) if count_file.exists() else 0
                count_file.write_text(str(count + 1))
                payload = b'window.profileCacheLoaded = true;\n' + b' ' * 4096
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            if path == '/signout':
                payload = b'''<!doctype html><html><title>Signing out</title><body><script>
localStorage.removeItem('desk-auth');
const request = indexedDB.deleteDatabase('desk-auth');
request.onsuccess = () => document.title = 'Fixture signed out';
</script></body></html>'''
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Set-Cookie', 'desk_persistent=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax')
                self.send_header('Set-Cookie', 'desk_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            if path in ['/signin', '/protected']:
                cookies = self.headers.get('Cookie', '')
                authorized = 'desk_persistent=fixture' in cookies and 'desk_session=fixture' in cookies
                signing_in = path == '/signin'
                script = '''
const signingIn = SIGNING_IN;
const authorized = AUTHORIZED;
if (signingIn) localStorage.setItem('desk-auth', 'fixture');
const open = indexedDB.open('desk-auth', 1);
open.onupgradeneeded = () => open.result.createObjectStore('tokens');
open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction('tokens', signingIn ? 'readwrite' : 'readonly');
    const store = tx.objectStore('tokens');
    const request = signingIn ? store.put('fixture', 'token') : store.get('token');
    let token;
    request.onsuccess = () => token = signingIn ? 'fixture' : request.result;
    tx.oncomplete = () => {
        const ok = token === 'fixture' && localStorage.getItem('desk-auth') === 'fixture' && window.profileCacheLoaded;
        document.title = signingIn && ok ? 'Fixture signed in' : authorized && ok ? 'Fixture sign-in restored' : 'Fixture sign-in missing';
        document.body.textContent = document.title;
        db.close();
    };
};'''.replace('SIGNING_IN', 'true' if signing_in else 'false').replace('AUTHORIZED', 'true' if authorized else 'false')
                payload = ('<!doctype html><html><meta charset="utf-8"><title>Checking fixture</title><body>'
                           '<script src="/profile-cache.js"></script><script>' + script + '</script></body></html>').encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                if signing_in:
                    self.send_header('Set-Cookie', 'desk_persistent=fixture; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax')
                    self.send_header('Set-Cookie', 'desk_session=fixture; Path=/; HttpOnly; SameSite=Strict')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            super().do_GET()
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    setting('org.gnome.shell.extensions.grand-central-desktop.browser', 'home-url', f'http://127.0.0.1:{server.server_port}/index.html')
    # Minimal standard XBEL records for the document panel.
    bookmarks = []
    for i in [1, 2]:
        bookmarks.append(f'''<bookmark href="{(desktop / f'Project {i:02d}.txt').as_uri()}" added="2026-11-17T10:00:00Z" modified="2026-11-17T11:00:00Z" visited="2026-11-17T12:00:00Z"><title>Project {i:02d}.txt</title><info><metadata owner="http://freedesktop.org"><mime:mime-type type="text/plain"/><bookmark:applications><bookmark:application name="Test" exec="true %u" modified="2026-11-17T12:00:00Z" count="1"/></bookmark:applications></metadata></info></bookmark>''')
    (output / 'data/recently-used.xbel').write_text('''<?xml version="1.0"?><xbel version="1.0" xmlns:bookmark="http://www.freedesktop.org/standards/desktop-bookmarks" xmlns:mime="http://www.freedesktop.org/standards/shared-mime-info">''' + ''.join(bookmarks) + '</xbel>')
    with (output / 'shell.log').open('w') as log:
        displays = ['--virtual-monitor', '1440x1000']
        if env.get('GRAND_CENTRAL_DESKTOP_TEST_MULTIMONITOR'):
            displays += ['--virtual-monitor', '2560x1800']
        shell = subprocess.Popen(['gnome-shell', '--headless', '--wayland',
                                  '--wayland-display', 'grand-central-desktop-test', *displays],
                                 env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 150
            while time.monotonic() < deadline and not (output / 'result.json').exists():
                if shell.poll() is not None:
                    raise RuntimeError(f'GNOME exited with {shell.returncode}; see {output}/shell.log')
                time.sleep(.2)
            if not (output / 'result.json').exists():
                raise RuntimeError(f'Probe timed out; see {output}/shell.log')
            result = json.loads((output / 'result.json').read_text())
            print(json.dumps(result, indent=2), flush=True)
            if not result['ok']:
                return 1
            env['WAYLAND_DISPLAY'] = 'grand-central-desktop-test'
            with (output / 'browser-menu.log').open('w') as menu_log:
                menu_env = dict(env, GDK_BACKEND='wayland')
                subprocess.run(['gjs', '-m', str(ROOT / 'tests/browserMenu.js')], env=menu_env,
                               stdout=menu_log, stderr=subprocess.STDOUT, timeout=15, check=True)
            with (output / 'preferences.log').open('w') as prefslog:
                prefs = subprocess.run(['gjs', '-m', str(ROOT / 'tests/preferences.js')], env=env,
                                       stdout=prefslog, stderr=subprocess.STDOUT, timeout=30)
            if prefs.returncode or not (output / 'preferences.json').exists():
                raise RuntimeError(f'Preferences failed; see {output}/preferences.log')
            print('Native preferences window opened successfully.', flush=True)
            return 0
        finally:
            shell.terminate()
            try:
                shell.wait(timeout=5)
            except subprocess.TimeoutExpired:
                shell.kill()
                shell.wait()


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--session':
        sys.exit(session(Path(sys.argv[2])))
    output = Path(tempfile.mkdtemp(prefix='grand-central-desktop-integration-'))
    print(f'Isolated test output: {output}', flush=True)
    with (output / 'session.log').open('w') as log:
        result = subprocess.call(['dbus-run-session', '--', sys.executable, __file__, '--session', str(output)],
                                 stdout=log, stderr=subprocess.STDOUT)
    print((output / 'result.json').read_text() if (output / 'result.json').exists() else (output / 'session.log').read_text()[-2500:])
    if (output / 'preferences.log').exists():
        print((output / 'preferences.log').read_text()[-2500:])
    sys.exit(result)
