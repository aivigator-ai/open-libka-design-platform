import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { FONTS, lockName, themeFile, type Theme } from '@libka/design';
import { findVeraPdf } from '@libka/pdf/verapdf';
import { parse } from '@libka/model';
import { build, lint, verify } from '../src/libka.ts';
import { chooseDesign, findProjectBrand } from '../src/design.ts';

const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));
// poppler's pdftotext, for the text round trip (its -v exits non-zero; only a missing program counts)
const pdftotext = spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error === undefined;

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
/** A project folder (with .libka/, so it is the project's root) holding these files. */
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'libka-design-'));
  dirs.push(dir);
  mkdirSync(join(dir, '.libka'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}
const doc = (fm = '') => `---\ntitle: Designs\nlang: en\n${fm}---\n\n## One\n\nText with *emphasis* and a [link](https://example.com).\n\n:::callout[Note]{variant=info}\nA note.\n:::\n`;
const choose = (dir: string, file = 'docs/guide.md') => chooseDesign(join(dir, file), parse(readFileSync(join(dir, file), 'utf8')).document, { writeLock: false });
const BRAND = 'meta:\n  name: Sunny Lane\ncolor:\n  primary: "#FFD400"\ndefaults:\n  libka:\n    id: sunny\n    theme: modern\n';

describe('the design a document is built with', () => {
  it('is LibKa\'s brand and Classic without a brand file or front matter', () => {
    const dir = project({ 'docs/guide.md': doc() });
    const c = choose(dir);
    expect(c.problems).toEqual([]);
    expect(c.design!.isDefault).toBe(true);
    expect(c.notes).toEqual([]);
  });

  it('takes the project\'s _brand.yml from the document\'s folder or above, up to the project\'s root, and its theme', () => {
    const dir = project({ '_brand.yml': BRAND, 'docs/deep/guide.md': doc() });
    expect(findProjectBrand(join(dir, 'docs', 'deep', 'guide.md'))).toBe(join(dir, '_brand.yml'));
    const c = choose(dir, 'docs/deep/guide.md');
    expect(c.problems).toEqual([]);
    expect(c.design!.design.brand.id).toBe('sunny');
    expect(c.design!.design.theme.id).toBe('modern');
    expect(c.design!.isDefault).toBe(false);
    // the solver's result, in words
    expect(c.notes.join('\n')).toMatch(/the primary colour #FFD400: .*links and accent text use #[0-9A-F]{6} to reach 4\.5:1/);
    // which design, from where, and what Word takes for its fonts
    expect(c.notes[0]).toMatch(/guide\.md: the design is the brand in .*_brand\.yml \(the project's, found by itself\) with the Modern theme \(from defaults\.libka\.theme in .*_brand\.yml\)$/);
    expect(c.notes.at(-1)).toMatch(/type: Space Grotesk headings over Inter text \(the Modern theme's\); a Word file uses Arial for both in their place$/);
    // a link colour takes links and accent text from the primary colour
    const linked = project({ '_brand.yml': `${BRAND}typography:\n  link:\n    color: "#1D4E89"\n`, 'guide.md': doc() });
    expect(choose(linked, 'guide.md').notes.join('\n')).toMatch(/the link colour #1D4E89 passes as it is: links and accent text use it/);
    // a _brand.yml above the project's root is not the project's
    const outer = project({ '_brand.yml': BRAND, 'inner/.libka/x': '', 'inner/guide.md': doc() });
    expect(findProjectBrand(join(outer, 'inner', 'guide.md'))).toBeUndefined();
  });

  it('lets the front matter choose: its theme over the brand\'s, its brand over the project\'s, libka for LibKa\'s own', () => {
    const dir = project({ '_brand.yml': BRAND, 'docs/guide.md': doc('theme: classic\n'), 'docs/b.md': doc('brand: libka\n'),
      'docs/c.md': doc('brand: ../brands/other.yml\ntheme: ../themes/house.theme.json\n'), 'brands/other.yml': 'color:\n  primary: "#1D4ED8"\n',
      'themes/house.theme.json': themeFile({ ...THEME, id: 'house' }, './theme-1.schema.json') });
    expect(choose(dir).design!.design.theme.id).toBe('classic');
    expect(choose(dir).design!.design.brand.id).toBe('sunny');
    expect(choose(dir, 'docs/b.md').design!.isDefault).toBe(true);
    const c = choose(dir, 'docs/c.md');
    expect(c.problems).toEqual([]);
    expect(c.design!.design.brand.color.primary).toBe('#1D4ED8');
    expect(c.design!.design.theme.id).toBe('house');
    expect(c.themeFile).toBe(join(dir, 'themes', 'house.theme.json'));
  });

  it('stops on a missing file or a file with errors, each with its code, and says the rest in notes', () => {
    const dir = project({ 'docs/guide.md': doc('brand: missing.yml\ntheme: none.theme.json\n'),
      'docs/bad.md': doc('brand: bad.yml\n'), 'docs/bad.yml': 'colour:\n  primary: "#FFD400"\nmeta:\n  name: X\n  description: Y\n' });
    const c = choose(dir);
    expect(c.design).toBeNull();
    expect(c.problems.map((p) => p.code)).toEqual(['brand-unknown', 'theme-unknown']);
    expect(c.problems[0]!.message).toMatch(/the brand file missing\.yml was not found \(the path is relative to the document\)$/);
    // a file outside the project is refused, so a project builds the same wherever it is copied
    const out = project({ 'p/.libka/x': '', 'p/guide.md': doc('brand: ../../elsewhere.yml\n') });
    expect(choose(out, 'p/guide.md').problems).toEqual([{ code: 'brand-unknown', message: expect.stringMatching(/the brand file \.\.\/\.\.\/elsewhere\.yml is outside the project/) }]);
    const bad = choose(dir, 'docs/bad.md');
    expect(bad.problems).toEqual([{ code: 'brand-key-unknown', message: expect.stringMatching(/bad\.yml: "colour" is not a brand\.yml section\. Did you mean "color"\?$/) }]);
    expect(bad.notes).toEqual([expect.stringMatching(/bad\.yml: LibKa does not use meta\.description\.$/)]);
    // lint reads the files when it knows where the document is
    const r = lint(readFileSync(join(dir, 'docs', 'bad.md'), 'utf8'), undefined, join(dir, 'docs', 'bad.md'));
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.objectContaining({ code: 'brand-key-unknown', line: 1 })]);
    // and says when it does not
    expect(lint(doc('brand: _brand.yml\n')).design.notes).toEqual(['the brand file _brand.yml is read when the document is built (or checked) from its folder']);
  });

  it('writes the design\'s lock next to the brand file once, and again only when the design changes', () => {
    const dir = project({ '_brand.yml': BRAND, 'guide.md': doc() });
    const lock = join(dir, lockName('sunny', 'modern'));
    const first = chooseDesign(join(dir, 'guide.md'), parse(doc()).document);
    expect(readFileSync(lock, 'utf8')).toBe(first.design!.lock);
    expect(first.notes.at(-1)).toMatch(/sunny\.modern\.design\.lock\.json: wrote the design's lock; commit it with the brand file$/);
    expect(chooseDesign(join(dir, 'guide.md'), parse(doc()).document).notes.some((n) => n.includes('lock'))).toBe(false);
    writeFileSync(join(dir, '_brand.yml'), BRAND.replace('#FFD400', '#E85D04'));
    expect(chooseDesign(join(dir, 'guide.md'), parse(doc()).document).notes.at(-1)).toMatch(/the brand, the theme or LibKa's solver changed, so the design was solved again and its lock rewritten; commit it$/);
  });

  it.skipIf(!chrome)('builds a branded page and deck that pass Guard, with the logo, and names the design in the manifest', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#FFD400"/></svg>';
    const dir = project({ '_brand.yml': `${BRAND}logo: logo.svg\n`, 'logo.svg': svg, 'guide.md': doc('outputs: [web, deck]\n') });
    const r = await build(join(dir, 'guide.md'), { out: join(dir, 'dist') });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.notes?.some((n) => n.includes('the primary colour #FFD400'))).toBe(true);
    // the build says the logo was used, and the new signing key, in its notes (the MCP server returns them)
    expect(r.notes?.some((n) => /the logo logo\.svg \(alt text "Sunny Lane"\) goes above the title of the page/.test(n))).toBe(true);
    expect(r.notes?.some((n) => /^created a signing key in /.test(n))).toBe(true);
    const html = readFileSync(r.html!, 'utf8');
    expect(html).toContain('<div class="lk-logo"><img class="lk-logo-light" src="data:image/svg+xml;base64,');
    expect(html).toContain('alt="Sunny Lane"');
    expect(html).toContain('--lk-font-brand: "Space Grotesk"');
    const v = verify(r.html!);
    expect(v.problems).toEqual([]);
    expect(v.manifest!.design).toMatchObject({ brand: { id: 'sunny' }, theme: { id: 'modern' }, solver: 'libka-solver/1' });
    expect(v.manifest!.design!.lock).toMatch(/^[0-9a-f]{64}$/);
    // the Word file takes the design too: its colours, Office fonts and the logo, and says what it cannot take
    const w = await build(join(dir, 'guide.md'), { out: join(dir, 'dist'), outputs: ['web', 'docx'] });
    expect(w.problems).toEqual([]);
    expect(w.ok).toBe(true);
    const files = unzipSync(readFileSync(w.docx!));
    const xml = strFromU8(files['word/document.xml']!);
    expect(xml.indexOf('descr="Sunny Lane"')).toBeGreaterThan(0);
    expect(xml.indexOf('descr="Sunny Lane"')).toBeLessThan(xml.indexOf('w:val="Title"'));
    expect(strFromU8(files['word/theme/theme1.xml']!)).toContain('<a:clrScheme name="LibKa">');
    expect(readFileSync(w.conformance!, 'utf8')).toContain('its fonts as Office fonts (Space Grotesk as Arial, Inter as Arial, JetBrains Mono as Consolas)');
    expect(verify(w.html!, undefined, w.docx).problems).toEqual([]);
  }, 120000);
});

const THEME: Theme = { id: 'fonts', name: { en: 'Fonts', cs: 'Písma' }, fonts: { heading: 'fraunces', body: 'inter' }, scale: 'standard', headings: 'standard', density: 'comfortable', radius: 'medium' };
const LINE = 'office flight affirm Il1 O0 Příliš žluťoučký kůň úpěl ďábelské ódy';

describe('every font LibKa ships, in a PDF', () => {
  // headings and body text in every family (italics where the family has them), with ligatures, Czech and look-alikes;
  // veraPDF (in the build) needs a Unicode value for every glyph, and the text must come back out of the PDF
  const pairs: [string, string][] = [['fraunces', 'inter'], ['space-grotesk', 'literata'], ['bitter', 'atkinson-hyperlegible-next'], ['public-sans', 'public-sans']];
  it('covers every font on the list', () => {
    expect(new Set(pairs.flat().concat('jetbrains-mono'))).toEqual(new Set(FONTS.map((f) => f.id)));
  });
  it.skipIf(!chrome || !findVeraPdf() || !pdftotext)('passes veraPDF and gives its text back, for each pair', async () => {
    for (const [heading, body] of pairs) {
      const dir = project({
        'fonts.theme.json': themeFile({ ...THEME, fonts: { heading, body } }, './theme-1.schema.json'),
        'guide.md': `---\ntitle: ${LINE}\nlang: cs\ntheme: fonts.theme.json\noutputs: [web, pdf]\n---\n\n## ${LINE}\n\n${LINE}.\n\n*${LINE}.*\n\n**${LINE}.**\n\n\`${LINE}\`\n`,
      });
      const r = await build(join(dir, 'guide.md'), { out: join(dir, 'dist') });
      expect(r.problems, `${heading} + ${body}`).toEqual([]);
      expect(r.pdfua, `${heading} + ${body}`).toMatchObject({ ua1: true });
      const text = execFileSync('pdftotext', ['-enc', 'UTF-8', r.pdf!, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
      expect(text.split(LINE).length - 1, `${heading} + ${body}: the line comes back from the PDF`).toBeGreaterThanOrEqual(5);
    }
  }, 300000);
});
