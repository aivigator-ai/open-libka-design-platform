"""Tests for libka_tokens: the DTCG source validates, resolves per theme, and
every rule the loader enforces fails the build when it is broken."""
import json, os, shutil, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import libka_tokens as lt


class Workspace:
    """A temp copy of the resolver and token files that a test may break."""

    def __enter__(self):
        self.dir = tempfile.mkdtemp(prefix='libka-tokens-test-')
        shutil.copy(os.path.join(ROOT, 'libka.resolver.json'), self.dir)
        shutil.copytree(os.path.join(ROOT, 'tokens'), os.path.join(self.dir, 'tokens'))
        self.resolver = os.path.join(self.dir, 'libka.resolver.json')
        return self

    def __exit__(self, *exc):
        shutil.rmtree(self.dir, ignore_errors=True)

    def edit(self, rel, change):
        path = os.path.join(self.dir, rel)
        with open(path, encoding='utf-8') as f:
            doc = json.load(f)
        change(doc)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(doc, f)


class SourceIsValid(unittest.TestCase):
    def test_every_theme_validates(self):
        counts = lt.validate()
        self.assertEqual(counts['theme=light'], counts['theme=dark'])
        self.assertGreater(counts['theme=light'], 200)

    def test_theme_modifier_applies_dark_overrides(self):
        light, dark = lt.tokens({'theme': 'light'}), lt.tokens({'theme': 'dark'})
        self.assertEqual(light['color.semantic.bg.canvas'].value['hex'], '#F6F7F9')
        self.assertEqual(dark['color.semantic.bg.canvas'].value['hex'], '#111723')
        self.assertEqual(lt.tokens({})['color.semantic.bg.canvas'].value['hex'], '#F6F7F9')  # default = light

    def test_high_contrast_contexts(self):
        lhc = lt.tokens({'theme': 'light-high-contrast'})
        dhc = lt.tokens({'theme': 'dark-high-contrast'})
        dark = lt.tokens({'theme': 'dark'})
        self.assertEqual(lt.css(lhc['color.semantic.bg.canvas'], lhc), '#FFFFFF')
        self.assertEqual(lt.css(dhc['color.semantic.bg.canvas'], dhc), '#000000')
        # dark high contrast stacks on the dark theme: non-color dark values carry over
        self.assertEqual(lt.css(dhc['shadow.2'], dhc), lt.css(dark['shadow.2'], dark))
        # component aliases follow the high-contrast semantic values
        self.assertEqual(lt.css(lhc['color.component.button.accent.background'], lhc),
                         lt.css(lhc['color.semantic.action.accent-strong'], lhc))

    def test_aliases_follow_the_theme(self):
        dark = lt.tokens({'theme': 'dark'})
        self.assertEqual(lt.css(dark['color.component.button.accent.background'], dark), '#20C7D9')

    def test_css_text_matches_v13(self):
        light, dark = lt.tokens({'theme': 'light'}), lt.tokens({'theme': 'dark'})
        self.assertEqual(lt.css(light['shadow.2'], light),
                         '0 4px 16px rgb(17 23 35 / .07), 0 1px 3px rgb(17 23 35 / .05)')
        self.assertEqual(lt.css(dark['shadow.2'], dark), '0 4px 16px rgb(0 0 0 / .40), 0 1px 3px rgb(0 0 0 / .30)')
        self.assertEqual(lt.css(light['shadow.0'], light), 'none')
        self.assertEqual(lt.css(light['motion.ease.sharp'], light), 'cubic-bezier(.4,0,.2,1)')
        self.assertEqual(lt.css(light['spacing.0_5'], light), '2px')
        self.assertEqual(lt.css(light['typography.font.brand'], light), '"Fraunces", "Instrument Serif", Georgia, serif')

    def test_legacy_view_keeps_v13_shape(self):
        view = lt.legacy_view()
        self.assertEqual(view['spacing']['0.5'], '2px')
        self.assertEqual(view['color']['component']['button']['primary']['hover.background'],
                         {'light': '#2A3345', 'dark': '#ECEFF3'})
        self.assertEqual(view['color']['component']['button']['ghost']['background'], {'fixed': 'transparent'})
        self.assertEqual(view['typography']['scale']['display.xl']['size'], 'clamp(3.8rem, 8vw, 7rem)')
        self.assertEqual(view['typography']['scale']['display.xl']['family'], 'brand')
        self.assertEqual(view['motion']['preset']['fade.in']['duration'], 'base')


class RulesAreEnforced(unittest.TestCase):
    def assertRejected(self, rel, change, message):
        with Workspace() as ws:
            if rel:
                ws.edit(rel, change)
            else:
                change(ws)
            with self.assertRaises(lt.TokenError) as ctx:
                lt.validate(ws.resolver)
            self.assertIn(message, str(ctx.exception))

    def test_dot_in_name(self):
        self.assertRejected('tokens/foundation.tokens.json',
                            lambda d: d['spacing'].update({'0.5': d['spacing']['0_5']}), 'invalid name')

    def test_hex_must_match_components(self):
        def change(d):
            d['color']['primitive']['ink']['950']['$value']['hex'] = '#000000'
        self.assertRejected('tokens/primitive.tokens.json', change, 'invalid color value')

    def test_dimension_unit_must_be_px_or_rem(self):
        def change(d):
            d['radius']['md']['$value']['unit'] = 'em'
        self.assertRejected('tokens/foundation.tokens.json', change, 'invalid dimension value')

    def test_alias_to_missing_token(self):
        def change(d):
            d['color']['component']['card']['background']['$value'] = '{color.semantic.bg.nowhere}'
        self.assertRejected('tokens/component.tokens.json', change, 'points to no token')

    def test_alias_cycle(self):
        def change(d):
            d['icon']['color']['primary']['$value'] = '{icon.color.secondary}'
            d['icon']['color']['secondary']['$value'] = '{icon.color.primary}'
        self.assertRejected('tokens/foundation.tokens.json', change, 'alias cycle')

    def test_alias_type_must_match(self):
        def change(d):
            d['color']['component']['card']['shadow']['$value'] = '{color.semantic.bg.surface}'
        self.assertRejected('tokens/component.tokens.json', change, 'does not match alias target')

    def test_composite_alias_type(self):
        def change(d):
            d['typography']['scale']['caption']['$value']['fontSize'] = '{color.semantic.bg.canvas}'
        self.assertRejected('tokens/foundation.tokens.json', change, "expected 'dimension'")

    def test_token_needs_a_type(self):
        def change(d):
            del d['opacity']['$type']
        self.assertRejected('tokens/foundation.tokens.json', change, 'no $type')

    def test_resolver_version(self):
        self.assertRejected('libka.resolver.json', lambda d: d.update({'version': '2024.01'}), "version must be '2025.10'")

    def test_unknown_theme_context(self):
        with Workspace() as ws:
            with self.assertRaises(lt.TokenError) as ctx:
                lt.tokens({'theme': 'sepia'}, ws.resolver)
            self.assertIn('unknown context', str(ctx.exception))


if __name__ == '__main__':
    unittest.main()
