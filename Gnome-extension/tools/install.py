#!/usr/bin/env python3
"""Publish a complete local release, then atomically activate its pointer.

Only an explicit invocation installs code. Editing the development folder
never changes or triggers the running copy. Uses Python and GLib tools only.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
UUID = 'grand-central-desktop@grandcentral-desktop'



def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n').encode()


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.grand-central-desktop-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def install(source, target):
    source, target = Path(source).resolve(), Path(target).absolute()
    if target.is_symlink():
        raise ValueError('The installed extension directory must be an independent copy, not a symlink')
    metadata = json.loads((source / 'metadata.json').read_text())
    if metadata['uuid'] != UUID:
        raise ValueError('Unexpected extension UUID')
    # An explicit update of an existing installation retains its Shell identity.
    if (target / 'active-release.json').is_file():
        installed = json.loads((target / 'metadata.json').read_text())
        if any(installed.get(key) != metadata[key] for key in ['name', 'settings-schema']):
            raise ValueError('Target is not a Grand Central Desktop installation')
        metadata['uuid'] = installed['uuid']
    target.mkdir(parents=True, exist_ok=True)
    builds = target / 'runtime-builds'
    builds.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.staging-', dir=builds) as staging:
        stage = Path(staging)
        names = ['runtime.js', 'runtime-prefs.js', 'browser.js', 'stylesheet.css']
        names += [str(p.relative_to(source)) for p in sorted((source / 'lib').glob('*.js')) if p.name != 'runtimeLoader.js']
        names += [str(p.relative_to(source)) for p in sorted((source / 'schemas').glob('*.gschema.xml'))]
        for name in names:
            destination = stage / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / name, destination)
        subprocess.run(['glib-compile-schemas', '--strict', str(stage / 'schemas')], check=True)
        names.append('schemas/gschemas.compiled')
        files = {name: hashlib.sha256((stage / name).read_bytes()).hexdigest() for name in sorted(names)}
        browser_parts = {n: files[n] for n in ['browser.js', 'lib/browserPanel.js', 'lib/browserProfile.js',
                                            'lib/browserViewport.js', 'lib/pageColor.js', 'lib/model.js',
                                            'lib/browserView.js', 'lib/browserService.js', 'lib/browserSettings.js',
                                            'lib/monitorModel.js', 'lib/browserMenu.js']}
        for name in names:
            if name.endswith('.gschema.xml'):
                schema = ET.parse(stage / name).getroot().find("schema[@id='org.gnome.shell.extensions.grand-central-desktop.browser']")
                if schema is not None:
                    browser_parts['browser-schema'] = hashlib.sha256(ET.tostring(schema)).hexdigest()
        fingerprint = hashlib.sha256(canonical(browser_parts)).hexdigest()
        index = dict(format=1, metadata=metadata, files=files, browserFingerprint=fingerprint)
        index_bytes = canonical(index)
        release = hashlib.sha256(index_bytes).hexdigest()
        (stage / 'release.json').write_bytes(index_bytes)
        destination = builds / release
        if destination.exists():
            if (destination / 'release.json').read_bytes() != index_bytes:
                raise ValueError('Installed release index is inconsistent')
            for name, expected in files.items():
                if hashlib.sha256((destination / name).read_bytes()).hexdigest() != expected:
                    raise ValueError(f'Installed release is corrupted: {name}')
        else:
            os.rename(stage, destination)
            # TemporaryDirectory still needs a directory to clean up.
            stage.mkdir()
    # These small host files are deliberately stable. They contain no UI code.
    host_files = ['extension.js', 'lib/runtimeLoader.js', 'prefs.js', 'metadata.json']
    for name in host_files:
        path = target / name
        incoming = (source / name).read_bytes()
        if name not in ['metadata.json'] and path.exists() and (target / 'active-release.json').exists():
            if path.read_bytes() != incoming:
                raise ValueError(f'Stable loader file changed: {name}; activate the new loader at the next login')
    for name in host_files + ['README.md', 'COPYING']:
        data = canonical(metadata) if name == 'metadata.json' else (source / name).read_bytes()
        atomic_write(target / name, data)
    # Keep the conventional root schema available to the extensions tools.
    root_schemas = target / 'schemas'
    root_schemas.mkdir(exist_ok=True)
    for name in names:
        if name.startswith('schemas/'):
            atomic_write(target / name, (destination / name).read_bytes())
    atomic_write(target / 'stylesheet.css', b'/* Runtime stylesheets are loaded per installed release. */\n')
    atomic_write(target / 'active-release.json', canonical(dict(format=1, release=release)))
    return release


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT)
    data = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
    parser.add_argument('--target', type=Path, default=data / 'gnome-shell/extensions' / UUID)
    parser.add_argument('--wait', type=float, default=5, help='Seconds to wait for an active loader to acknowledge the release')
    args = parser.parse_args()
    release = install(args.source, args.target)
    metadata = json.loads((args.source / 'metadata.json').read_text())
    version = metadata.get('version-name', metadata['version'])
    print(f'Installed {metadata["name"]} {version}: independent release {release[:12]} at {args.target}', flush=True)
    deadline = time.monotonic() + max(0, args.wait)
    while time.monotonic() < deadline:
        try:
            status = json.loads((args.target / '.update-status.json').read_text())
            if status.get('release') == release and status.get('state') == 'active':
                print('Applied automatically in the running GNOME session.')
                return
            if status.get('state') == 'error' and status.get('attempted') == release:
                print(f'Previous runtime retained: {status.get("error")}')
                return 1
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        time.sleep(.1)
    print('Release published. Enable the extension if disabled; a first installation may require signing out and back in.')


if __name__ == '__main__':
    sys.exit(main() or 0)
