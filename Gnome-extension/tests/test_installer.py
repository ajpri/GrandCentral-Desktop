"""Tests for complete, independent, atomically published local releases."""
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from install import install


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='grand-central-desktop-installer-')
        self.source = Path(self.temp.name) / 'source'
        self.target = Path(self.temp.name) / 'installed'
        self.source.mkdir()
        for name in ['runtime.js', 'runtime-prefs.js', 'extension.js', 'prefs.js',
                     'browser.js', 'stylesheet.css', 'metadata.json', 'README.md', 'COPYING']:
            shutil.copy2(ROOT / name, self.source / name)
        for name in ['lib', 'schemas']:
            shutil.copytree(ROOT / name, self.source / name)

    def tearDown(self):
        self.temp.cleanup()

    def test_independent_snapshot_and_identical_install(self):
        release = install(self.source, self.target)
        self.assertEqual(release, install(self.source, self.target))
        runtime = self.target / 'runtime-builds' / release / 'runtime.js'
        original = runtime.read_bytes()
        (self.source / 'runtime.js').write_text('// incomplete source edit')
        self.assertEqual(runtime.read_bytes(), original)
        self.assertFalse(runtime.samefile(self.source / 'runtime.js'))

    def test_changed_runtime_publishes_new_release_and_keeps_previous(self):
        first = install(self.source, self.target)
        with (self.source / 'lib/model.js').open('a') as stream:
            stream.write('\n// Deliberate complete update\n')
        second = install(self.source, self.target)
        self.assertNotEqual(first, second)
        self.assertTrue((self.target / 'runtime-builds' / first).is_dir())
        self.assertEqual(json.loads((self.target / 'active-release.json').read_text())['release'], second)

    def test_update_keeps_existing_shell_uuid(self):
        install(self.source, self.target)
        metadata_path = self.target / 'metadata.json'
        metadata = json.loads(metadata_path.read_text())
        metadata['uuid'] = 'grand-central-desktop@example.test'
        metadata_path.write_text(json.dumps(metadata))
        release = install(self.source, self.target)
        release_index = self.target / 'runtime-builds' / release / 'release.json'
        self.assertEqual(json.loads(release_index.read_text())['metadata']['uuid'], metadata['uuid'])
        self.assertEqual(json.loads(metadata_path.read_text())['uuid'], metadata['uuid'])

    def test_schema_error_does_not_publish_partial_release(self):
        install(self.source, self.target)
        before = (self.target / 'active-release.json').read_bytes()
        schema = next((self.source / 'schemas').glob('*.gschema.xml'))
        schema.write_text('<broken')
        with self.assertRaises(Exception):
            install(self.source, self.target)
        self.assertEqual((self.target / 'active-release.json').read_bytes(), before)

    def test_browser_module_changes_update_browser_fingerprint(self):
        def fingerprint(release):
            return json.loads((self.target / 'runtime-builds' / release / 'release.json').read_text())['browserFingerprint']
        for name in ['browserViewport.js', 'pageColor.js']:
            with self.subTest(module=name):
                first = install(self.source, self.target)
                with (self.source / 'lib' / name).open('a') as stream:
                    stream.write('\n// Browser module update\n')
                second = install(self.source, self.target)
                self.assertNotEqual(fingerprint(first), fingerprint(second))

    def test_stable_host_change_does_not_replace_running_host(self):
        install(self.source, self.target)
        before = (self.target / 'active-release.json').read_bytes()
        host = (self.target / 'extension.js').read_bytes()
        (self.source / 'extension.js').write_text('// changed loader')
        with self.assertRaisesRegex(ValueError, 'Stable loader file changed'):
            install(self.source, self.target)
        self.assertEqual((self.target / 'extension.js').read_bytes(), host)
        self.assertEqual((self.target / 'active-release.json').read_bytes(), before)

    def test_symlink_install_is_rejected(self):
        actual = Path(self.temp.name) / 'actual'
        actual.mkdir()
        self.target.symlink_to(actual, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'independent copy'):
            install(self.source, self.target)


if __name__ == '__main__':
    unittest.main()
