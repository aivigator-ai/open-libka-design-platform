/**
 * The visual editor in Chrome: documents edited as they look, blocks as objects, by keyboard alone; the Markdown kept
 * byte for byte where it was not changed; the Inspector, the palette, the menus, the structure tree, the preferences
 * and the shortcut list; Guard on every view, in standard and high contrast.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from '@libka/model';
import { serveStatic, type Served } from '@libka/cli/src/serve.ts';
import { guardPage, launchBrowser, type GuardReport } from '@libka/guard';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const example = readFileSync(join(root, 'examples', 'manual', 'guide.md'), 'utf8');
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

interface Hook { source: string; selection: string; mode: string; problems: unknown[] }
let browser: Browser;
let served: Served;

async function open(prefs?: Record<string, unknown>, width = 1440): Promise<Page> {
  const ctx: BrowserContext = await browser.newContext({ viewport: { width, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  // the first-visit tour has its own tests (onboarding.test.ts)
  await ctx.addInitScript(() => { localStorage.setItem('libka-studio:toured', '1'); });
  if (prefs) await ctx.addInitScript((p) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('libka-studio:editor', JSON.stringify(p)); } }, prefs);
  const page = await ctx.newPage();
  await page.goto(served.url);
  await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
  await page.waitForSelector('.ed-root, .cm-content');
  return page;
}
const hook = (page: Page): Promise<Hook> => page.evaluate(() => {
  const h = (window as unknown as { libkaStudio: Hook }).libkaStudio;
  return { source: h.source, selection: h.selection, mode: h.mode, problems: h.problems };
});
/** Waits until the editor has written its latest text (it follows a moment after typing). */
async function settled(page: Page): Promise<Hook> {
  let last = '';
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const now = (await hook(page)).source;
    if (now === last) break;
    last = now;
  }
  await page.waitForFunction(() => document.querySelector('#save-state')?.getAttribute('data-state') === 'saved');
  return hook(page);
}
/** Puts the cursor at the end of the text block that holds `text` (setup; the keys under test are pressed for real). */
async function caretIn(page: Page, text: string): Promise<void> {
  const ok = await page.evaluate((t) => (window as unknown as { libkaStudio: { placeCaret(t: string): boolean } }).libkaStudio.placeCaret(t), text);
  expect(ok).toBe(true);
}
const findings = (report: GuardReport) => report.checks.flatMap((c) => c.violations);
const lines = (s: string) => s.split('\n');

describe.skipIf(!chrome)('LibKa Studio, visual mode', () => {
  beforeAll(async () => {
    served = await serveStatic(join(here, '..', 'dist'));
    browser = await launchBrowser();
  }, 60000);
  afterAll(async () => {
    await browser?.close();
    await served?.close();
  });

  it('opens a new document in Visual, as blocks, and keeps the Markdown byte for byte while untouched', async () => {
    const page = await open();
    const h = await hook(page);
    expect(h.mode).toBe('visual');
    expect(h.source).toBe(example);
    expect(await page.locator('.ed-directive[data-name="callout"]').count()).toBeGreaterThan(0);
    expect(await page.textContent('.ed-front-matter')).toContain('Writing a LibKa manual');
    // switching to Source and back changes nothing
    await page.click('[data-mode="source"]');
    await page.waitForSelector('.cm-content');
    expect((await hook(page)).source).toBe(example);
    await page.click('[data-mode="visual"]');
    await page.waitForSelector('.ed-root');
    expect((await settled(page)).source).toBe(example);
    await page.context().close();
  }, 90000);

  it('an edit rewrites only its own block; switching modes keeps the place', async () => {
    const page = await open();
    await caretIn(page, 'You write a manual as one LibKa Markdown file');
    await page.keyboard.type(' Edited here.');
    const after = (await settled(page)).source;
    const changed = lines(after).filter((l, i) => l !== lines(example)[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatch(/so you never set them yourself\. Edited here\.$/);
    await page.click('[data-mode="source"]');
    await page.waitForSelector('.cm-content');
    // the source editor starts at the block that was being edited
    await page.waitForFunction(() => /^Ln (1[0-9]|9),/.test(document.querySelector('#sb-position')?.textContent ?? ''));
    await page.context().close();
  }, 90000);

  it('works by keyboard alone: select, climb, go in, move, extend, duplicate, delete, undo; moves are announced', async () => {
    const page = await open();
    await caretIn(page, 'Install the workspace once');
    await page.keyboard.press('Escape');
    expect((await hook(page)).selection).toMatch(/^Install the workspace once/);
    await page.keyboard.press('Escape');
    expect((await hook(page)).selection).toMatch(/^:::callout\[You need Node\.js 22\.18 or newer\]\{variant=info\}/);
    await page.keyboard.press('Enter');   // into its title
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // move the callout above the paragraph before it
    await page.keyboard.press('Control+Shift+ArrowUp');
    await page.waitForFunction(() => /moved/.test(document.querySelector('#announcer')?.textContent ?? ''));
    expect(await page.textContent('#announcer')).toMatch(/^Callout moved to position \d+ of \d+/);
    let src = (await settled(page)).source;
    expect(src.indexOf(':::callout[You need')).toBeLessThan(src.indexOf('You write a manual as one LibKa Markdown file'));
    // the block (and every other) is still written exactly as before, only in another order
    expect(src.length).toBe(example.length);
    await page.keyboard.press('Control+z');
    src = (await settled(page)).source;
    expect(src).toBe(example);
    // a run of blocks: the heading above and the callout, duplicated, then deleted again
    await caretIn(page, 'You write a manual as one LibKa Markdown file');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Control+d');
    src = (await settled(page)).source;
    expect(src.split(':::callout[You need Node.js 22.18 or newer]').length).toBe(3);
    await page.keyboard.press('Delete');
    expect((await settled(page)).source).toBe(example);
    await page.context().close();
  }, 90000);

  it('inserts a block with "/", typing straight into the menu, and the result parses without problems', async () => {
    const page = await open();
    await caretIn(page, 'You write a manual as one LibKa Markdown file');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/summary');   // typed at once: the keys before the menu's focus go to its search too
    await page.waitForSelector('#st-insert');
    expect(await page.inputValue('#st-insert input')).toBe('summary');
    expect(await page.textContent('#st-insert-opt-0')).toContain('Summary');
    await page.keyboard.press('Enter');
    const src = (await settled(page)).source;
    expect(src).toMatch(/so you never set them yourself\.\n\n:::summary/);
    expect(parse(src).problems).toEqual([]);
    // the menu remembers it: next time it is listed first, under Recent
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Control+Shift+Enter');
    await page.waitForSelector('#st-insert');
    expect(await page.textContent('#st-insert-opt-0')).toContain('Summary');
    await page.keyboard.press('Escape');
    await page.context().close();
  }, 90000);

  it('the Inspector edits a block\'s settings and the document\'s properties, keeping the rest as written', async () => {
    const page = await open();
    await caretIn(page, 'Install the workspace once');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.click('#tab-inspector');
    expect(await page.textContent('.st-insp-title')).toBe('Callout');
    await page.selectOption('#attr-variant', 'warning');   // eight tones: a drop-down
    let src = (await settled(page)).source;
    expect(src).toContain(':::callout[You need Node.js 22.18 or newer]{variant=warning}');
    expect(lines(src).filter((l, i) => l !== lines(example)[i])).toHaveLength(1);
    // "Document" in the path: the front matter's fields
    await page.click('.st-insp-path button:has-text("Document")');
    await page.waitForSelector('#docprop-title');
    await page.fill('#docprop-title', 'Writing a LibKa guide');
    await page.press('#docprop-title', 'Enter');
    src = (await settled(page)).source;
    expect(src).toContain('title: Writing a LibKa guide\n');
    expect(lines(src).filter((l, i) => l !== lines(example)[i]).length).toBe(2);   // the title, and the variant before
    // a picture's alternative text and caption are required fields
    await page.click('.ed-image');
    await page.waitForSelector('#img-alt');
    expect(await page.textContent('.st-insp-section:has(#img-alt) .st-insp-heading')).toBe('Required for accessibility');
    await page.context().close();
  }, 90000);

  it('keys and badges inside text are objects too: written in Source, edited in the Inspector', async () => {
    const page = await open();
    await page.click('[data-mode="source"]');
    await page.waitForSelector('.cm-content');
    await page.click('.cm-content');
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Press :kbd[Ctrl+S] to save. Export :badge[Beta]{variant=info}\n');
    await page.click('[data-mode="visual"]');
    await page.waitForSelector('.ed-inline.ed-badge');
    await page.click('.ed-inline.ed-badge');
    await page.click('#tab-inspector');
    expect(await page.textContent('.st-insp-title')).toBe('Badge');
    await page.selectOption('#inline-variant', 'warning');
    await page.fill('#inline-label', 'Preview');
    await page.press('#inline-label', 'Enter');
    expect((await settled(page)).source).toContain('Press :kbd[Ctrl+S] to save. Export :badge[Preview]{variant=warning}');
    await page.context().close();
  }, 90000);

  it('the handle\'s menu changes a block\'s type and copies it as Markdown; the palette inserts by click and by drag', async () => {
    const page = await open();
    const para = page.locator('.ed-root > p', { hasText: 'You write a manual as one LibKa Markdown file' });
    await para.hover();
    await page.locator('.ed-handles:has(+ p:has-text("You write a manual as one LibKa Markdown file")) .ed-grip').click();
    await page.waitForSelector('#st-blockmenu');
    await page.click('#st-blockmenu [data-item="type"]');
    await page.click('#st-blockmenu [data-item="type-heading3"]');
    let src = (await settled(page)).source;
    expect(src).toContain('### You write a manual as one LibKa Markdown file.');
    await page.locator('.ed-root h3', { hasText: 'You write a manual' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+F10');
    await page.click('#st-blockmenu [data-item="copy"]');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('### You write a manual as one LibKa Markdown file. LibKa turns it into a self-contained web page and, if you ask for them, an A4 PDF, a slide deck and an editable Word file. Colors, type and spacing come from the LibKa tokens, so you never set them yourself.');
    // the palette: a click inserts after the selected block
    await page.click('.st-palette-item[data-block="statement"]');
    src = (await settled(page)).source;
    expect(src).toMatch(/so you never set them yourself\.\n\n:::statement/);
    // dragging a block from the palette onto the document
    await page.dragAndDrop('.st-palette-item[data-block="cta"]', '.ed-root h2 >> nth=1');
    src = (await settled(page)).source;
    expect(src).toContain(':::cta');
    expect(parse(src).problems).toEqual([]);
    await page.context().close();
  }, 90000);

  it('a GitHub alert keeps its marker line when pasted and typed into; a new interface language renames every block', async () => {
    const page = await open();
    await caretIn(page, 'so you never set them yourself.');
    await page.keyboard.press('Enter');
    await page.evaluate(() => navigator.clipboard.writeText('> [!TIP]\n> Typed later.'));
    await page.keyboard.press('Control+V');
    let src = (await settled(page)).source;
    expect(src).toContain('\n> [!TIP]\n> Typed later.\n');
    await caretIn(page, 'Typed later.');
    await page.keyboard.type(' More.');
    src = (await settled(page)).source;
    expect(src).toContain('\n> [!TIP]\n> Typed later. More.\n');
    expect(parse(src).problems).toEqual([]);
    // the names above the blocks, the document's properties among them, follow the interface language
    await page.click('[data-lang="cs"]');
    await page.waitForFunction(() => document.querySelector('.ed-fm-kind')?.textContent === 'Vlastnosti dokumentu');
    expect(await page.textContent('.ed-directive[data-name="callout"] .ed-dhead')).toBe('Zvýraznění');
    await page.context().close();
  }, 90000);

  it('the structure tree follows the selection and is driven by keyboard', async () => {
    const page = await open();
    await page.click('#tab-structure');
    const items = page.locator('.st-tree [role="treeitem"]');
    expect(await items.count()).toBeGreaterThan(15);
    await items.first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect((await hook(page)).selection).toMatch(/^:::callout\[You need Node\.js/);
    expect(await page.getAttribute('.st-tree [aria-selected="true"]', 'aria-expanded')).toBe('true');
    await page.click('#tab-structure');
    await page.locator('.st-tree [aria-selected="true"]').focus();
    await page.keyboard.press('ArrowLeft');   // collapses it
    expect(await page.getAttribute('.st-tree [aria-selected="true"]', 'aria-expanded')).toBe('false');
    await page.context().close();
  }, 60000);

  it('preferences switch each ability on and off, and are remembered', async () => {
    const page = await open();
    await page.click('#file-menu summary');
    await page.click('[data-command="prefs.open"]');
    await page.click('#pref-palette');
    await page.click('#pref-labels');
    await page.click('input[name="pref-handles"] >> nth=1');
    await page.click('#pref-shortcuts');
    await page.click('input[name="pref-announce"] >> nth=1');
    await page.keyboard.press('Escape');
    expect(await page.locator('.st-palette').count()).toBe(0);
    expect(await page.getAttribute('.st-visual', 'data-handles')).toBe('always');
    expect(await page.$eval('.st-format-bold .st-format-text', (el) => (el as HTMLElement).offsetWidth)).toBeLessThanOrEqual(1);   // icons only (the word stays for screen readers)
    // Markdown shortcuts off: "## " stays text
    await caretIn(page, 'You write a manual as one LibKa Markdown file');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## not a heading');
    expect((await settled(page)).source).toContain('\\## not a heading');
    // brief announcements
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Shift+ArrowUp');
    await page.waitForFunction(() => document.querySelector('#announcer')?.textContent === 'Moved');
    // focus mode hides the preview and the side panel
    await page.keyboard.press('Control+Shift+F');
    expect(await page.isVisible('.st-preview-pane')).toBe(false);
    await page.reload();
    await page.waitForSelector('.ed-root');
    expect(await page.locator('.st-palette').count()).toBe(0);
    expect(await page.isVisible('.st-preview-pane')).toBe(false);
    await page.keyboard.press('Control+Shift+F');
    expect(await page.isVisible('.st-preview-pane')).toBe(true);
    await page.context().close();
  }, 90000);

  it('Markdown shortcuts make blocks as you type; new documents follow the default mode', async () => {
    const page = await open();
    await caretIn(page, 'You write a manual as one LibKa Markdown file');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## A new section');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- first point');
    const src = (await settled(page)).source;
    expect(src).toContain('yourself.\n\n## A new section\n\n- first point\n');
    await page.context().close();
    const sourceFirst = await open({ defaultMode: 'source' });
    await sourceFirst.click('#library-toggle');
    await sourceFirst.click('.st-library-actions [data-command="project.new"]');
    await sourceFirst.waitForSelector('.cm-content');
    expect((await hook(sourceFirst)).mode).toBe('source');
    await sourceFirst.context().close();
  }, 90000);

  it('lists the shortcuts on "?" and Shift+Alt+H, searchable', async () => {
    const page = await open();
    await caretIn(page, 'Install the workspace once');
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await page.waitForSelector('.st-dialog--shortcuts[open]');
    await page.fill('.st-keys input', 'duplicate');
    expect(await page.locator('.st-keys tbody tr').count()).toBe(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+Alt+H');
    await page.waitForSelector('.st-dialog--shortcuts[open]');
    await page.context().close();
  }, 60000);

  it('restoring a version in Visual replaces only what differs, and undo takes it back', async () => {
    const page = await open();
    await page.click('#tab-history');
    await page.click('#save-version');
    await page.fill('.st-dialog input', 'Before');
    await page.click('.st-dialog button[type="submit"]');
    await page.waitForSelector('.st-version[data-kind="named"]');
    await caretIn(page, 'You write a manual as one LibKa Markdown file');
    await page.keyboard.type(' Later text.');
    await settled(page);
    await page.click('.st-version[data-kind="named"] button:has-text("Restore")');
    await page.waitForFunction(() => !(window as unknown as { libkaStudio: Hook }).libkaStudio.source.includes('Later text.'));
    expect((await settled(page)).source).toBe(example);
    await page.locator('.ed-root h2').first().click();
    await page.keyboard.press('Control+z');
    expect((await settled(page)).source).toContain('Later text.');
    await page.context().close();
  }, 90000);

  it('passes Guard on every view: editor, "/" menu, block menu, Inspector, structure, preferences, shortcuts (standard and high contrast)', async () => {
    const page = await open();
    const views: [string, () => Promise<unknown>][] = [
      ['editor', async () => {}],
      ['insert menu', async () => { await caretIn(page, 'You write a manual'); await page.keyboard.press('Control+Shift+Enter'); await page.waitForSelector('#st-insert'); }],
      ['block menu', async () => { await page.keyboard.press('Escape'); await caretIn(page, 'Install the workspace'); await page.keyboard.press('Escape'); await page.keyboard.press('Shift+F10'); await page.waitForSelector('#st-blockmenu'); }],
      ['inspector', async () => { await page.keyboard.press('Escape'); await page.click('#tab-inspector'); }],
      ['structure', async () => { await page.click('#tab-structure'); }],
      ['preferences', async () => { await page.click('#file-menu summary'); await page.click('[data-command="prefs.open"]'); await page.waitForSelector('.st-dialog--prefs[open]'); }],
      ['shortcuts', async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Shift+Alt+H'); await page.waitForSelector('.st-dialog--shortcuts[open]'); }],
    ];
    for (const [name, go] of views) {
      await go();
      expect(findings(await guardPage(page)).map((v) => `${name}: ${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    }
    await page.context().close();
  }, 120000);

  it('fits a phone screen in visual mode', async () => {
    const page = await open(undefined, 390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await page.isVisible('.ed-root')).toBe(true);
    await page.context().close();
  }, 60000);
});
