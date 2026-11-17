import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { builtinTheme, LIBKA_BRAND, parseBrand, resolveDesign, validateTheme } from '@libka/design';
import { parse } from '@libka/model';
import { docxTheme, renderDocx, THEME } from '../src/index.ts';

describe('the Word theme of a design', () => {
  it('is generate.py\'s theme for LibKa\'s default design, key for key and in order', () => {
    expect(docxTheme()).toBe(THEME);
    expect(JSON.stringify(docxTheme(resolveDesign()))).toBe(JSON.stringify(THEME));
  });
  it('takes the fonts\' Office fallbacks and the light mode\'s solved colours', () => {
    expect(docxTheme(resolveDesign(LIBKA_BRAND, builtinTheme('modern')!)).fonts).toEqual({ brand: 'Arial', ui: 'Arial', mono: 'Consolas' });
    const { brand } = parseBrand('color:\n  primary: "#FFD400"\ntypography:\n  headings: Literata\n');
    const theme = docxTheme(resolveDesign(brand!));
    expect(theme.fonts.brand).toBe('Georgia');
    expect(theme.colors['text-accent']).not.toBe(THEME.colors['text-accent']);
    expect(theme.colors['text-primary']).toBe(THEME.colors['text-primary']);
    expect(Object.keys(theme.colors)).toEqual(Object.keys(THEME.colors));
  });
  it('is the Word file\'s: its styles, its fonts and its theme\'s colours, with the logo above the title', async () => {
    const { document } = parse('---\ntitle: Designs\n---\n\nText with a [link](https://example.com).\n\n:::callout[Note]{variant=info}\nA note.\n:::\n');
    expect(await renderDocx(document, { design: resolveDesign() })).toEqual(await renderDocx(document));
    const { brand } = parseBrand('meta:\n  name: Sunny\ncolor:\n  primary: "#FFD400"\ntypography:\n  headings: Literata\n');
    const design = resolveDesign(brand!);
    const theme = docxTheme(design);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
    const files = unzipSync(await renderDocx(document, { design, logo: { picture: { data: png, type: 'png', width: 400, height: 100 }, alt: 'Sunny' } }));
    const xml = strFromU8(files['word/document.xml']!);
    const styles = strFromU8(files['word/styles.xml']!);
    const themeXml = strFromU8(files['word/theme/theme1.xml']!);
    expect(styles).toContain(`w:ascii="${theme.fonts.brand}"`);
    expect(styles).toContain(`w:val="${theme.colors['text-accent']}"`);
    expect(themeXml).toContain(`<a:accent1><a:srgbClr val="${theme.colors['text-accent']}"/></a:accent1>`);
    expect(themeXml).toContain('<a:clrScheme name="LibKa">');
    expect(themeXml).toContain('<a:latin typeface="Georgia"/>');
    // the logo first, at most 48 px high, named by the brand; then the title
    expect(xml.indexOf('descr="Sunny"')).toBeGreaterThan(0);
    expect(xml.indexOf('descr="Sunny"')).toBeLessThan(xml.indexOf('w:val="Title"'));
    // no theme colour references anywhere: the text keeps its proven colours whatever Word's theme becomes
    expect(`${xml}${styles}`).not.toMatch(/w:themeColor=/);
  });

  it('takes a large scale as larger reading sizes', () => {
    const { theme } = validateTheme({ $schema: './theme-1.schema.json', id: 'big', name: { en: 'Big', cs: 'Velký' }, fonts: { heading: 'fraunces', body: 'inter' }, scale: 'large', headings: 'standard', density: 'comfortable', radius: 'medium' });
    expect(docxTheme(resolveDesign(LIBKA_BRAND, theme!)).sizes).toMatchObject({ body: 27, small: 24, caption: 21, h2: THEME.sizes.h2 });
  });
});
