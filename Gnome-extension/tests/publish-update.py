"""Install controlled fixtures in the disposable GNOME integration session."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from install import atomic_write, canonical, install

parser = argparse.ArgumentParser()
parser.add_argument('target', type=Path)
parser.add_argument('mode', choices=['good', 'bad', 'style', 'browser', 'corrupt', 'same', 'baseline'])
args = parser.parse_args()
if args.mode == 'same':
    pointer = json.loads((args.target / 'active-release.json').read_text())
    atomic_write(args.target / 'active-release.json', canonical(pointer))
    sys.exit(0)
if args.mode == 'baseline':
    print(install(ROOT, args.target))
    sys.exit(0)
with tempfile.TemporaryDirectory(prefix='grand-central-desktop-update-fixture-') as temp:
    source = Path(temp) / 'source'
    source.mkdir()
    for name in ['runtime.js', 'runtime-prefs.js', 'extension.js', 'prefs.js',
                 'browser.js', 'stylesheet.css', 'metadata.json', 'README.md', 'COPYING']:
        shutil.copy2(ROOT / name, source / name)
    for name in ['lib', 'schemas']:
        shutil.copytree(ROOT / name, source / name)
    model = source / 'lib/calculator.js'
    with model.open('a') as stream:
        stream.write(f"\nexport const UPDATE_TEST_MARKER = '{args.mode}-nested-module';\n")
    runtime = source / 'runtime.js'
    code = runtime.read_text().replace("import Clutter from", "import {UPDATE_TEST_MARKER} from './lib/calculator.js';\nimport Clutter from", 1)
    code = code.replace('    enable() {', '    enable() {\n        this._liveUpdateMarker = UPDATE_TEST_MARKER;', 1)
    if args.mode == 'bad':
        code = code.replace('        this._layout();\n    }\n\n    _buildCarousel()',
                            "        this._layout();\n        throw new Error('Intentional update fixture failure');\n    }\n\n    _buildCarousel()", 1)
    runtime.write_text(code)
    if args.mode == 'browser':
        with (source / 'browser.js').open('a') as stream:
            stream.write('\n// Browser-code update fixture\n')
    if args.mode != 'corrupt':
        release = install(source, args.target)
    else:
        staging = Path(temp) / 'installed'
        release = install(source, staging)
        build = staging / 'runtime-builds' / release
        with (build / 'lib/calculator.js').open('a') as stream:
            stream.write('// Intentional post-build corruption\n')
        shutil.copytree(build, args.target / 'runtime-builds' / release)
        atomic_write(args.target / 'active-release.json', canonical(dict(format=1, release=release)))
    print(release)
