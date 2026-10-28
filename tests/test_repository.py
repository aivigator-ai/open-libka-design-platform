"""Repository-wide rules that no single build script owns."""
import os, re, subprocess, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def tracked(*exts):
    out = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True).stdout.split()
    return [p for p in out if p.endswith(exts)]


class SelfHostedFonts(unittest.TestCase):
    def test_no_third_party_font_hosts(self):
        """Fonts are self-hosted in fonts/; pages must not call a font CDN (offline use, EU privacy)."""
        hits = []
        for path in tracked('.html', '.js', '.css'):
            with open(os.path.join(ROOT, path), encoding='utf-8', errors='replace') as f:
                for n, line in enumerate(f, 1):
                    if re.search(r'fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|fonts\.bunny\.net', line):
                        hits.append(f'{path}:{n}')
        self.assertEqual(hits, [], 'third-party font hosts referenced')

    def test_font_files_and_licenses_present(self):
        css = open(os.path.join(ROOT, 'fonts', 'libka-fonts.css'), encoding='utf-8').read()
        for url in re.findall(r"url\('([^']+)'\)", css):
            path = os.path.join(ROOT, 'fonts', url)
            self.assertTrue(os.path.isfile(path), url)
            with open(path, 'rb') as f:
                self.assertEqual(f.read(4), b'wOF2', url)
        for family in ('fraunces', 'inter', 'jetbrains-mono'):
            text = open(os.path.join(ROOT, 'fonts', 'licenses', f'OFL-{family}.txt'), encoding='utf-8').read()
            self.assertIn('SIL OPEN FONT LICENSE', text.upper())


class SharedPictures(unittest.TestCase):
    def test_the_manual_example_shows_the_docs_pipeline_picture(self):
        """The manual example (also the Studio's sample) has its own copy of the docs' pipeline picture: the same file."""
        with open(os.path.join(ROOT, 'docs', 'images', 'pipeline.svg'), 'rb') as a, \
                open(os.path.join(ROOT, 'examples', 'manual', 'images', 'pipeline.svg'), 'rb') as b:
            self.assertEqual(b.read(), a.read(), 'copy docs/images/pipeline.svg to examples/manual/images/')


class CheckFailureOutput(unittest.TestCase):
    def test_a_failed_run_shows_the_difference_and_the_end(self):
        """check.py shows the first failure's lines and the last ones: the end alone loses what differed."""
        import sys
        sys.path.insert(0, ROOT)
        from check import failure_lines
        out = ['ok'] * 100 + [' FAIL  test/a.test.ts > step', 'AssertionError: expected', '- Expected', '+ Received'] + ['log'] * 100 + ['Failed']
        shown = failure_lines(out)
        self.assertEqual(shown[:4], [' FAIL  test/a.test.ts > step', 'AssertionError: expected', '- Expected', '+ Received'])
        self.assertEqual(shown[-1], 'Failed')
        self.assertIn('…', shown)
        self.assertEqual(failure_lines(['a', 'b', 'Failed']), ['a', 'b', 'Failed'])
        # a failure already within the last lines is shown once
        short = ['ok'] * 50 + [' FAIL  x', 'Failed']
        self.assertEqual(failure_lines(short), short[-25:])


class PinnedActions(unittest.TestCase):
    def test_every_action_is_pinned_to_a_commit(self):
        """A tag can be moved to other code; a commit cannot. Every action is used by its full commit SHA, with the
        release it is in as a comment (`uses: owner/action@<40 hex> # vX.Y.Z`), in the workflows and the starter's."""
        found, loose = pinned_actions(['.github/workflows', 'packages/create-libka/templates'])
        self.assertGreater(found, 0)
        self.assertEqual(loose, [], 'actions not pinned to a commit SHA with its version')


def pinned_actions(folders):
    """The `uses:` lines in the workflow files under the folders: how many, and those not pinned to a commit."""
    found, loose = 0, []
    for folder in folders:
        for base, _, files in os.walk(os.path.join(ROOT, folder)):
            for name in files:
                if not name.endswith(('.yml', '.yaml')):
                    continue
                path = os.path.join(base, name)
                for n, line in enumerate(open(path, encoding='utf-8'), 1):
                    m = re.search(r'uses:\s*(\S+)', line)
                    if not m or m.group(1).startswith('./'):
                        continue
                    found += 1
                    # the starter's Guard action names its owner as {{owner}}, filled in when a project is created
                    if not re.fullmatch(r'[\w.-]+/[\w./-]+@[0-9a-f]{40}', m.group(1).replace('{{owner}}', 'owner')) or not re.search(r'#\s*v\d+(\.\d+)*\s*$', line):
                        loose.append(f'{os.path.relpath(path, ROOT)}:{n}: {line.strip()}')
    return found, loose


if __name__ == '__main__':
    unittest.main()
