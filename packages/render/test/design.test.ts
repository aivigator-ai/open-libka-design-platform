import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES, builtinTheme, cssName, LIBKA_BRAND, MODE_SELECTORS, MODES, parseBrand, resolveDesign, validateTheme } from '@libka/design';
import { BUILTIN_THEME_IDS, parse } from '@libka/model';
import { renderManual, withDesign, type ManualStyles } from '../src/index.ts';
import { renderDeck } from '../src/deck.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const styles: ManualStyles = {
  tokens: read('libka-tokens.css'), bridge: read('lk-bridge.css'),
  components: read('packages/render/src/components.css'), manual: read('packages/render/src/manual.css'),
};
const deckStyles = { ...styles, deck: read('packages/render/src/deck.css') };
const { document } = parse('---\ntitle: Designs\n---\n\n## One\n\n:::callout[Note]{variant=info}\nText.\n:::\n');
const modern = resolveDesign(LIBKA_BRAND, builtinTheme('modern')!);
const yellow = resolveDesign(parseBrand('meta:\n  name: Sunny\ncolor:\n  primary: "#FFD400"\n').brand!);

/** A custom property's value in one block of a stylesheet. */
function value(css: string, selector: string, name: string): string | undefined {
  const start = css.startsWith(`${selector} {\n`) ? 0 : css.indexOf(`\n${selector} {\n`) + 1;
  const body = css.slice(start, css.indexOf('\n}', start));
  return new RegExp(`^\\s+${name}: (.+);$`, 'm').exec(body)?.[1];
}

describe('the built-in themes', () => {
  it('are the same in the model (front matter) and in @libka/design', () => {
    expect([...BUILTIN_THEME_IDS]).toEqual(BUILTIN_THEMES.map((t) => t.id));
  });
});

describe('the design of a page', () => {
  it('in LibKa\'s default changes no byte', () => {
    const design = resolveDesign();
    expect(withDesign(styles, design)).toBe(styles);
    expect(renderManual(document, { styles, design })).toBe(renderManual(document, { styles }));
    expect(renderDeck(document, { styles: deckStyles, design })).toBe(renderDeck(document, { styles: deckStyles }));
  });

  it('gives every solved colour in every mode, however the cascade reaches the mode', () => {
    const s = withDesign(styles, yellow);
    // the blocks that apply, in order: by attribute, by the reader's "more contrast", and a page's own order
    const blocks = (css: string, list: [string, string][]) => Object.assign({}, ...list.map(([sel, indent]) => {
      const head = `\n${indent}${sel} {\n`;
      const start = css.startsWith(head.slice(1)) ? 0 : css.indexOf(head) + 1;
      expect(start, sel).toBeGreaterThanOrEqual(0);
      return Object.fromEntries([...css.slice(start, css.indexOf(`\n${indent}}`, start)).matchAll(/^\s+(--[\w-]+): (.+);$/gm)].map((m) => [m[1], m[2]]));
    })) as Record<string, string>;
    const R: [string, string] = [':root', ''], D: [string, string] = ['[data-theme="dark"]', ''], H: [string, string] = ['[data-contrast="high"]', ''];
    const DH: [string, string] = ['[data-theme="dark"][data-contrast="high"]', ''];
    const MH: [string, string] = [':root:not([data-contrast="standard"])', '  '], MDH: [string, string] = ['[data-theme="dark"]:not([data-contrast="standard"])', '  '];
    const ways = { light: [[R]], dark: [[R, D]], 'light-high-contrast': [[R, H], [R, MH]], 'dark-high-contrast': [[R, D, H, DH], [R, H, D, DH], [R, D, MH, MDH]] } as const;
    for (const mode of MODES) {
      for (const way of ways[mode]) {
        const vars = blocks(s.tokens, way as unknown as [string, string][]);
        const resolve = (name: string): string | undefined => { const v = vars[name]; return v?.startsWith('var(') ? resolve(v.slice(4, -1)) : v; };
        for (const [key, v] of Object.entries(yellow.design.palette[mode])) expect(resolve(cssName(key))?.toUpperCase(), `${mode} via ${way.map((w) => w[0]).join(' ')}: ${key}`).toBe(v.toUpperCase());
      }
    }
    // aliases stay aliases, so a mode that changes the colour they name still reaches them
    expect(value(s.tokens, ':root', '--lk-badge-info-text')).toBe('var(--lk-text-info)');
    expect(MODE_SELECTORS.dark).toBe('[data-theme="dark"]');
    expect(value(s.tokens, ':root', '--lk-text-accent')).not.toBe(value(styles.tokens, ':root', '--lk-text-accent'));
    // the statement's bar: the brand's bright accent
    expect(value(s.tokens, ':root', '--lk-aqua-500')).toBe(yellow.design.palette.dark['semantic.action.accent']);
    // LibKa's brand keeps LibKa's colours in another theme
    const m = withDesign(styles, modern);
    expect(value(m.tokens, ':root', '--lk-text-accent')).toBe(value(styles.tokens, ':root', '--lk-text-accent'));
  });

  it('takes the theme\'s fonts, heading weight, radius, density and scale', () => {
    const m = withDesign(styles, modern);
    expect(value(m.bridge, ':root', '--lk-font-brand')).toBe('"Space Grotesk", "Inter", system-ui, sans-serif');
    expect(value(m.bridge, ':root', '--lk-font-ui')).toBe(value(styles.bridge, ':root', '--lk-font-ui'));
    expect(value(m.bridge, ':root', '--lk-type-heading-h2-weight')).toBe('700');
    expect(value(m.tokens, ':root', '--lk-radius-md')).toBe('10px');
    expect(value(m.tokens, ':root', '--lk-radius-full')).toBe('999px');
    expect(value(m.bridge, ':root', '--lk-density-row-height')).toBe('44px');
    const { theme } = validateTheme({ $schema: './theme-1.schema.json', id: 'dense', name: { en: 'Dense', cs: 'Hustý' },
      fonts: { heading: 'bitter', body: 'public-sans' }, scale: 'large', headings: 'standard', density: 'compact', radius: 'none' });
    const d = withDesign(styles, resolveDesign(LIBKA_BRAND, theme!));
    expect(value(d.bridge, ':root', '--lk-density-row-height')).toBe('36px');
    expect(value(d.bridge, ':root', '--lk-type-body-md-size')).toBe('1.125rem');
    expect(value(d.tokens, ':root', '--lk-radius-lg')).toBe('0px');
    expect(value(d.bridge, ':root', '--lk-font-ui')).toBe('"Public Sans", system-ui, sans-serif');
  });

  it('reaches the page and the deck, and setting it twice changes nothing more', () => {
    const page = renderManual(document, { styles, design: yellow });
    expect(page).toContain(`--lk-text-accent: ${yellow.design.palette.light['semantic.text.accent']};`);
    expect(withDesign(withDesign(styles, yellow), yellow)).toEqual(withDesign(styles, yellow));
    const deck = renderDeck(document, { styles: deckStyles, design: modern });
    expect(deck).toContain('--lk-font-brand: "Space Grotesk"');
  });

  it('shows the brand\'s logo above the title, with its alt text and dark variant', () => {
    const logo = { src: 'data:image/svg+xml;base64,PHN2Zy8+', alt: 'Sunny', darkSrc: 'data:image/svg+xml;base64,PHN2ZyAvPg==' };
    const page = renderManual(document, { styles, design: yellow, logo });
    expect(page).toMatch(/<header class="lk-block lk-doc-header">\n  <div class="lk-logo"><img class="lk-logo-light" src="data:image\/svg\+xml;base64,PHN2Zy8\+" alt="Sunny"><img class="lk-logo-dark" [^>]+><\/div>\n  <h1/);
    expect(page).toContain('.lk-logo .lk-logo-dark { display: none; }');
    const deck = renderDeck(document, { styles: deckStyles, design: yellow, logo: { src: logo.src, alt: 'Sunny' } });
    expect(deck).toMatch(/<div class="lk-slide lk-slide--title">\n    <div class="lk-logo"><img class="lk-logo-light" [^>]+alt="Sunny"><\/div>\n    <h1/);
    expect(deck).not.toContain('lk-logo-dark');
    expect(renderManual(document, { styles, design: yellow })).not.toContain('lk-logo');
  });
});
