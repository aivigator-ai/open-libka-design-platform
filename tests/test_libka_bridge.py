"""The token bridge (libka_bridge.py): what generate.py writes to lk-bridge.css."""
import os, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import libka_bridge


def read(name):
    with open(os.path.join(ROOT, name), encoding='utf-8') as f:
        return f.read()


class Bridge(unittest.TestCase):
    def test_matches_the_committed_file(self):
        """lk-bridge.css is exactly what the bridge makes from the current tokens."""
        self.assertEqual(libka_bridge.bridge_css(read('libka-tokens.css')), read('lk-bridge.css'))

    def test_no_new_hex_values(self):
        """Extensions are references or mixes of existing tokens, never new colours."""
        for name, (value, _why) in libka_bridge.EXTENSIONS.items():
            self.assertNotRegex(value, r'#[0-9A-Fa-f]{3,8}\b', name)

    def test_an_undefined_reference_fails(self):
        """A var(--lk-*) that neither the tokens nor the bridge define is reported."""
        css = libka_bridge.bridge_css(read('libka-tokens.css'))
        self.assertEqual(libka_bridge.undefined_references('a { color: var(--lk-nope); }', read('libka-tokens.css'), css),
                         {'--lk-nope'})
        self.assertEqual(libka_bridge.undefined_references(css, read('libka-tokens.css'), css), set())


if __name__ == '__main__':
    unittest.main()
