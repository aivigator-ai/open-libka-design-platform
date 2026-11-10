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
import { BLOCKS } from '@libka/blocks';
import { serveStatic, type Served } from '@libka/cli/src/serve.ts';

/** The interface language, chosen in View ▾. */
async function chooseLang(page: Page, l: string): Promise<void> {
  await page.click('#view-menu > summary');
  await page.click(`#view-menu button[data-lang="${l}"]`);
}
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
    await caretIn(page, 'Run LibKa with');
    await page.keyboard.press('Escape');
    expect((await hook(page)).selection).toMatch(/^Run LibKa with/);
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

  it('the toolbar shows a mark as on only when all of the selected text has it, and a click marks all of it', async () => {
    const page = await open();
    const code = () => page.getAttribute('.st-format-code', 'aria-pressed');
    const paragraph = 'Run LibKa with npx -y @libka/cli, so there is nothing else to install first. The PDF uses the Chrome already installed on your computer.';
    await caretIn(page, 'Run LibKa with');
    // the whole paragraph, with a little code in it; selected again until the editor has taken it (an editor update
    // still under way writes its own selection back, which under the export's full run kept the caret for 30 s)
    await page.waitForFunction(() => {
      if ((window as unknown as { libkaStudio: Hook }).libkaStudio.selection.startsWith('Run LibKa with')) return true;
      const p = [...document.querySelectorAll('.ed-root p')].find((x) => x.textContent!.startsWith('Run LibKa with'))!;
      const range = document.createRange();
      range.selectNodeContents(p);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return false;
    }, undefined, { polling: 250 });
    expect(await code()).toBe('false');
    await page.keyboard.press('Control+e');
    expect((await settled(page)).source).toContain(`\`${paragraph}\``);
    expect(await code()).toBe('true');
    await page.click('.st-format-code');
    expect((await settled(page)).source).toContain(`\n${paragraph}\n`);
    expect(await code()).toBe('false');
    await page.context().close();
  }, 60000);

  it('the Inspector edits a block\'s settings and the document\'s properties, keeping the rest as written', async () => {
    const page = await open();
    await caretIn(page, 'Run LibKa with');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.click('#tab-properties');
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
    // the authors: one line in the field, a list of people in the front matter
    if (!(await page.$('#docprop-author'))) await page.click('.st-insp-path button:has-text("Document")');
    await page.fill('#docprop-author', 'Ann Novak (Security lead); Petr Svoboda');
    await page.press('#docprop-author', 'Enter');
    src = (await settled(page)).source;
    expect(src).toContain('author:\n  - name: Ann Novak\n    role: Security lead\n  - name: Petr Svoboda\n');
    if (!(await page.$('#docprop-author'))) await page.click('.st-insp-path button:has-text("Document")');
    expect(await page.inputValue('#docprop-author')).toBe('Ann Novak (Security lead); Petr Svoboda');
    // how AI took part: short while it is only the use, fields once someone reviewed it, the label as a switch
    await page.click('label.st-seg-option:has(input[name="docprop-ai-use"][value="ai-generated"])');
    src = (await settled(page)).source;
    expect(src).toContain('ai: ai-generated\n');
    if (!(await page.$('#docprop-ai-reviewed-by'))) await page.click('.st-insp-path button:has-text("Document")');
    await page.fill('#docprop-ai-reviewed-by', 'Ann Novak');
    await page.press('#docprop-ai-reviewed-by', 'Enter');
    if (!(await page.$('#docprop-ai-show'))) await page.click('.st-insp-path button:has-text("Document")');
    await page.click('#docprop-ai-show');   // a switch (role="switch"), which page.check does not take
    src = (await settled(page)).source;
    expect(src).toContain('ai:\n  use: ai-generated\n  reviewed-by: Ann Novak\n  label: true\n');
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
    await page.click('#tab-properties');
    expect(await page.textContent('.st-insp-title')).toBe('Badge');
    await page.selectOption('#inline-variant', 'warning');
    await page.fill('#inline-label', 'Preview');
    await page.press('#inline-label', 'Enter');
    expect((await settled(page)).source).toContain('Press :kbd[Ctrl+S] to save. Export :badge[Preview]{variant=warning}');
    await page.context().close();
  }, 90000);

  it('blocks with a layout look like their output; "+" and the block menu add a part, up to the registry\'s limit', async () => {
    const laid = ['matrix', 'flow', 'pros-cons', 'cards', 'metrics', 'timeline', 'steps', 'compare'];
    const page = await open();
    await page.click('[data-mode="source"]');
    await page.waitForSelector('.cm-content');
    await page.click('.cm-content');
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(`---\ntitle: Laid out\n---\n\n${laid.map((n) => `## ${n}\n\n${BLOCKS.find((b) => b.name === n)!.example.trim()}\n`).join('\n')}`);
    await page.click('[data-mode="visual"]');
    await page.waitForSelector('.ed-matrix.ed-laid');
    // the arrangement: a matrix's quadrants two by two with its axes, a flow's stages in a row, figures as tiles
    const columns = (q: string) => page.locator(q).evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
    expect(await columns('.ed-matrix .ed-q')).toBe(2);
    expect(await columns('.ed-flow li')).toBe(4);
    expect(await columns('.ed-metrics li')).toBe(3);
    expect(await columns('.ed-pros-cons > .ed-dbody > .ed-directive')).toBe(2);
    expect(await page.textContent('.ed-matrix > .ed-dmark--after')).toMatch(/^Effort.*→$/);
    expect(await page.textContent('.ed-card > .ed-dmark--before:not([hidden])')).toBe('New');
    expect(await page.getAttribute('.ed-timeline li.ed-current', 'data-current')).toBe('Now');
    // a quadrant's handle is inside it, at its corner
    const [q, h] = await Promise.all([page.locator('.ed-q').first().boundingBox(), page.locator('.ed-q .ed-handles').first().boundingBox()]);
    expect(h!.x).toBeGreaterThan(q!.x + q!.width / 2);
    expect(h!.y).toBeLessThan(q!.y + 40);
    // the matrix has its four quadrants and no "+"; the flow's "+" adds a stage, the cursor in it
    expect(await page.isVisible('.ed-matrix > .ed-addpart')).toBe(false);
    await page.click('.ed-flow > .ed-addpart');
    await page.keyboard.type('The case is closed');
    expect((await settled(page)).source).toMatch(/4\. The customer confirms it is solved\n5\. The case is closed\n:::/);
    await page.waitForFunction(() => document.querySelector('#announcer')?.textContent === 'Added: Stage');
    // the keyboard's way: the block menu (Shift+F10) in a card offers one more card
    await caretIn(page, 'Bar, line and donut charts');
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector('#st-blockmenu');
    await page.locator('#st-blockmenu [role="menuitem"]', { hasText: 'Add: Card' }).click();
    await page.keyboard.type('Diagrams');
    expect((await settled(page)).source).toMatch(/:::card\[Diagrams\]/);
    // at the registry's limit (a flow holds six stages) the "+" goes and the menu says why
    await page.click('.ed-flow > .ed-addpart');
    await page.keyboard.type('Six');
    await page.waitForSelector('.ed-flow > .ed-addpart', { state: 'hidden' });
    await caretIn(page, 'Six');
    await page.keyboard.press('Shift+F10');
    const item = page.locator('#st-blockmenu [role="menuitem"]', { hasText: 'Add: Stage' });
    expect(await item.getAttribute('aria-disabled')).toBe('true');
    expect(await item.textContent()).toContain('Process has the most it can hold');
    await page.keyboard.press('Escape');
    expect(findings(await guardPage(page)).map((v) => `${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    // a narrow editor stacks them as the outputs do
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => columns('.ed-matrix .ed-q')).toBe(1);
    expect(await columns('.ed-flow li')).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.context().close();
  }, 120000);

  it('tabs, accordion, comparison, decision, release and a UI specimen look like their output too', async () => {
    const laid = ['tabs', 'accordion', 'comparison', 'decision', 'release', 'ui'];
    const page = await open();
    await page.click('[data-mode="source"]');
    await page.waitForSelector('.cm-content');
    await page.click('.cm-content');
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(`---\ntitle: Laid out\n---\n\n${laid.map((n) => `## ${n}\n\n${BLOCKS.find((b) => b.name === n)!.example.trim()}\n`).join('\n')}`);
    await page.click('[data-mode="visual"]');
    await page.waitForSelector('.ed-comparison.ed-laid');
    // the comparison's recommended column (its heading and every cell) with its badge; yes, no and partial marked
    expect(await page.locator('.ed-comparison td.ed-hl').count()).toBe(5);
    expect(await page.getAttribute('.ed-comparison td.ed-hl-head', 'data-badge')).toBe('Recommended');
    expect(await page.locator('.ed-comparison td[data-mark="yes"]').count()).toBe(6);
    expect(await page.locator('.ed-comparison td[data-mark="partial"]').count()).toBe(1);
    // a decision's status, date and who decided; a release's date; a specimen's caption and its components in a row
    expect(await page.textContent('.ed-decision > .ed-dmark--before')).toBe('Accepted · 2026-10-01 · Architecture board');
    expect(await page.getAttribute('.ed-decision', 'data-status')).toBe('accepted');
    expect(await page.textContent('.ed-release > .ed-dmark--before')).toBe('2026-10-01');
    expect(await page.textContent('.ed-ui > .ed-dmark--before')).toBe('Saving a draft: one primary action');
    const tops = await page.locator('.ed-ui .ed-button').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
    expect(tops).toBe(1);
    expect(await page.getAttribute('.ed-ui .ed-button >> nth=2', 'data-state')).toBe('disabled');
    // tabs and the accordion add one more by "+", the cursor in its name
    await page.click('.ed-tabs > .ed-addpart');
    await page.keyboard.type('Linux');
    await page.click('.ed-accordion > .ed-addpart');
    await page.keyboard.type('Is it free?');
    const source = (await settled(page)).source;
    expect(source).toMatch(/:::tab\[Linux\]/);
    expect(source).toMatch(/:::item\[Is it free\?\]/);
    expect(findings(await guardPage(page)).map((v) => `${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    // in Czech, the decision's status and the badge as the outputs write them
    await chooseLang(page, 'cs');
    await expect.poll(() => page.textContent('.ed-decision > .ed-dmark--before')).toMatch(/^Přijato · /);
    expect(await page.getAttribute('.ed-comparison td.ed-hl-head', 'data-badge')).toBe('Doporučeno');
    await page.context().close();
  }, 120000);

  it('the handle\'s menu changes a block\'s type and copies it as Markdown; the Catalog inserts by click and by drag', async () => {
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
    // Bloky (Alt+2) opens the Catalog on the left: a click inserts after the selected block
    await page.keyboard.press('Alt+2');
    await page.waitForSelector('#left-pane .st-catalog-item');
    expect(await page.getAttribute('.st-layout [data-layout="blocks"]', 'aria-pressed')).toBe('true');
    expect(await page.getAttribute('#tab-properties', 'aria-selected')).toBe('true');
    await page.click('.st-catalog-item[data-block="statement"]');
    src = (await settled(page)).source;
    expect(src).toMatch(/so you never set them yourself\.\n\n:::statement/);
    // dragging a block from the Catalog onto the document
    await page.dragAndDrop('.st-catalog-item[data-block="cta"]', '.ed-root h2 >> nth=1');
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
    await chooseLang(page, 'cs');
    await page.waitForFunction(() => document.querySelector('.ed-fm-kind')?.textContent === 'Vlastnosti dokumentu');
    expect(await page.textContent('.ed-directive[data-name="callout"] .ed-dhead')).toBe('Zvýraznění');
    await page.context().close();
  }, 90000);

  it('the Outline lists the headings; every block as a tree, which follows the selection and is driven by keyboard', async () => {
    const page = await open();
    await page.click('#rail-outline');
    expect(await page.locator('#tp-outline .st-outline button').first().textContent()).toBe('Before you start');
    await page.click('#outline-all');
    const items = page.locator('.st-tree [role="treeitem"]');
    expect(await items.count()).toBeGreaterThan(15);
    await items.first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect((await hook(page)).selection).toMatch(/^:::callout\[You need Node\.js/);
    expect(await page.getAttribute('.st-tree [aria-selected="true"]', 'aria-expanded')).toBe('true');
    await page.click('#tab-outline');
    await page.locator('.st-tree [aria-selected="true"]').focus();
    await page.keyboard.press('ArrowLeft');   // collapses it
    expect(await page.getAttribute('.st-tree [aria-selected="true"]', 'aria-expanded')).toBe('false');
    await page.context().close();
  }, 60000);

  it('preferences switch each ability on and off, and are remembered', async () => {
    const page = await open();
    await page.click('#view-menu summary');
    await page.click('[data-command="prefs.open"]');
    // it opens at its top: the heading has the focus, Tab goes on to the first preference (Close is at the end)
    await page.waitForSelector('.st-dialog--prefs[open]');
    expect(await page.evaluate(() => [document.activeElement?.id, document.querySelector('.st-dialog--prefs .st-dialog-body')!.scrollTop])).toEqual(['dialog-title', 0]);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('pref-shortcuts');
    await page.click('#pref-labels');
    await page.click('input[name="pref-handles"] >> nth=1');
    await page.click('#pref-shortcuts');
    await page.click('input[name="pref-announce"] >> nth=1');
    await page.keyboard.press('Escape');
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
    // Fokus hides the panes, and the mode switch says so; it is remembered
    await page.keyboard.press('Control+Shift+F');
    expect(await page.isVisible('#companion')).toBe(false);
    expect(await page.locator('.st-rail').count()).toBe(0);
    await page.reload();
    await page.waitForSelector('.ed-root');
    expect(await page.isVisible('#companion')).toBe(false);
    expect(await page.getAttribute('.st-layout [data-layout="focus"]', 'aria-pressed')).toBe('true');
    await page.keyboard.press('Control+Shift+F');
    expect(await page.isVisible('#companion')).toBe(true);
    expect(await page.getAttribute('.st-layout [data-layout="write"]', 'aria-pressed')).toBe('true');
    await page.context().close();
  }, 90000);

  it('Markdown shortcuts make blocks as you type; new documents follow the default mode', async () => {
    const page = await open();
    await caretIn(page, 'You write a manual as one LibKa Markdown file');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## A new section');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- first point');
    let src = (await settled(page)).source;
    expect(src).toContain('yourself.\n\n## A new section\n\n- first point\n');
    // "---" stays text: a horizontal rule shows in no output
    await caretIn(page, 'You write a manual as one LibKa Markdown file');
    await page.keyboard.press('Enter');
    await page.keyboard.type('---');
    src = (await settled(page)).source;
    expect(await page.locator('.ed-root hr').count()).toBe(0);
    const typed = lines(src).find((l) => l.endsWith('---') && l !== '---')!;
    expect(parse(src).hints).toEqual([]);
    expect(parse(src).document.blocks.some((b) => b.type === 'paragraph' && JSON.stringify(b).includes('---'))).toBe(true);
    expect(typed).toBeTruthy();
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
    await caretIn(page, 'Run LibKa with');
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
    await page.click('#doc-menu summary');
    await page.click('[data-command="versions.open"]');
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

  it('the block bar offers the block the cursor is in: its setting, one more part, Move, ⋯ and Properties; in Focus in the dock, on a phone above the bottom bar', async () => {
    const md = `---\ntitle: Bar\nlang: en\n---\n\nPlain text.\n\n:::callout[Back up first]{variant=warning}\nExport your data.\n:::\n\n${BLOCKS.find((b) => b.name === 'flow')!.example}\n\n![A chart of the year](chart.png "Sales by month")\n\n![](empty.png "No alt text yet")\n`;
    const page = await open();
    await page.click('.st-editor-pane [data-mode="source"]');
    await page.waitForSelector('.cm-content');
    await page.click('.cm-content');
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(md);
    await page.click('.st-editor-pane [data-mode="visual"]');
    await page.waitForSelector('.ed-root');
    const original = (await settled(page)).source;
    const head = () => page.locator('.st-editor-pane > .st-pane-head').evaluate((e) => e.getBoundingClientRect().height);
    // plain text has no bar, and the toolbar keeps its height when one comes
    await caretIn(page, 'Plain text.');
    expect(await page.locator('.st-blockbar').count()).toBe(0);
    const plain = await head();
    await caretIn(page, 'Export your data.');
    const bar = page.locator('#bar-toolbar-bar');
    expect(await bar.getAttribute('aria-label')).toBe('Block: Callout');
    expect(await head()).toBe(plain);
    // the setting the registry marks: changed from the keyboard, the focus stays in the list, one line changes
    const setting = page.locator('#bar-toolbar-setting');
    expect(await setting.inputValue()).toBe('warning');
    await setting.focus();
    await page.keyboard.press('ArrowDown');
    const changed = (await settled(page)).source;
    expect(changed).toBe(original.replace('{variant=warning}', '{variant=error}'));
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('bar-toolbar-setting');
    // a process: "+ Stage" adds one, the cursor in it
    await caretIn(page, 'Support sorts it by urgency');
    expect(await page.textContent('#bar-toolbar-part')).toBe('Stage');
    expect(await page.getAttribute('#bar-toolbar-part', 'aria-label')).toBe('Add: Stage');
    await page.click('#bar-toolbar-part');
    await page.keyboard.type('Closed');
    expect((await settled(page)).source).toMatch(/4\. The customer confirms it is solved\n5\. Closed\n:::/);
    // Move up: the process goes above the callout, the focus stays on the button, the move is announced
    await page.click('#bar-toolbar-up');
    expect((await settled(page)).source.indexOf(':::flow')).toBeLessThan((await hook(page)).source.indexOf(':::callout'));
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('bar-toolbar-up');
    await page.waitForFunction(() => document.querySelector('#announcer')?.textContent === 'Process moved');
    expect(await page.getAttribute('#bar-toolbar-up', 'aria-disabled')).toBe(null);
    // ⋯: the whole block menu, for this block
    await page.click('#bar-toolbar-more');
    await page.waitForSelector('#st-blockmenu');
    expect(await page.locator('#st-blockmenu [role="menuitem"]').allTextContents()).toEqual(expect.arrayContaining(['Duplicate', 'Change type ›', 'Delete']));
    expect(findings(await guardPage(page)).map((v) => `${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    await page.keyboard.press('Escape');
    // Properties: the block's own
    await page.click('#bar-toolbar-props');
    await page.waitForSelector('#companion .st-inspector[data-target="flow"]');
    // a figure: its alt text, missing said in words; the button goes to the field
    await page.click('.ed-root img.ed-image[alt="A chart of the year"]');
    expect(await page.textContent('#bar-toolbar-alt')).toBe('Alt text done');
    await page.click('.ed-root img.ed-image[alt=""]');
    expect(await page.textContent('#bar-toolbar-alt')).toBe('Write alt text');
    await page.click('#bar-toolbar-alt');
    await page.waitForFunction(() => document.activeElement?.id === 'img-alt');
    expect(findings(await guardPage(page)).map((v) => `${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    // Focus: the bar joins the dock
    await caretIn(page, 'Export your data.');
    await page.keyboard.press('Control+Shift+F');
    await page.waitForSelector('#focus-dock #bar-dock-bar');
    expect(await page.locator('.st-blockbar').count()).toBe(1);
    expect(findings(await guardPage(page)).map((v) => `${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    await page.keyboard.press('Control+Shift+F');
    // Czech: the block's and the setting's names and the values
    await chooseLang(page, 'cs');
    await caretIn(page, 'Export your data.');
    expect(await page.getAttribute('#bar-toolbar-bar', 'aria-label')).toBe('Blok: Zvýraznění');
    expect(await page.locator('#bar-toolbar-setting option:checked').textContent()).toBe('Chyba');
    // a phone: a row above the bottom bar, nothing wider than the screen
    await page.setViewportSize({ width: 390, height: 844 });
    // (Properties, opened above, is the phone's companion region: the bar goes with the text)
    expect(await page.locator('#bar-phone-bar').count()).toBe(0);
    await page.click('.st-phone-bar [data-pane="write"]');
    await page.waitForSelector('#bar-phone-bar');
    const [row, tabs] = await Promise.all([page.locator('#bar-phone-bar').boundingBox(), page.locator('.st-phone-bar').boundingBox()]);
    expect(row!.y + row!.height).toBeLessThanOrEqual(tabs!.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(findings(await guardPage(page)).map((v) => `${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    await page.context().close();
  }, 120000);

  it('passes Guard on every view: editor, "/" menu, block menu, Properties, Outline, Bloky, Versions, preferences, shortcuts (standard and high contrast)', async () => {
    const page = await open();
    const views: [string, () => Promise<unknown>][] = [
      ['editor', async () => {}],
      ['insert menu', async () => { await caretIn(page, 'You write a manual'); await page.keyboard.press('Control+Shift+Enter'); await page.waitForSelector('#st-insert'); }],
      ['block menu', async () => { await page.keyboard.press('Escape'); await caretIn(page, 'Run LibKa with'); await page.keyboard.press('Escape'); await page.keyboard.press('Shift+F10'); await page.waitForSelector('#st-blockmenu'); }],
      ['properties', async () => { await page.keyboard.press('Escape'); await page.click('#tab-properties'); }],
      ['outline', async () => { await page.click('#rail-outline'); await page.click('#outline-all'); await page.waitForSelector('.st-tree'); }],
      ['blocks', async () => { await page.click('.st-layout [data-layout="blocks"]'); await page.waitForSelector('#left-pane .st-catalog'); }],
      ['versions', async () => { await page.click('#doc-menu summary'); await page.click('[data-command="versions.open"]'); await page.waitForSelector('#tp-versions'); }],
      ['preferences', async () => { await page.click('#view-menu summary'); await page.click('[data-command="prefs.open"]'); await page.waitForSelector('.st-dialog--prefs[open]'); }],
      ['shortcuts', async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Shift+Alt+H'); await page.waitForSelector('.st-dialog--shortcuts[open]'); }],
    ];
    for (const [name, go] of views) {
      await go();
      expect(findings(await guardPage(page)).map((v) => `${name}: ${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    }
    await page.context().close();
  }, 120000);

  it('switching from Source back to Visual shows the place the author was at, not the top of the document', async () => {
    const page = await open();
    // a real scroll and click near the end, as an author would
    await page.mouse.move(500, 500);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(50); }
    await page.locator('.ed-root p').filter({ hasText: 'The build checks the rendered pages' }).first().click();
    const before = await page.evaluate(() => document.querySelector('#editor')!.scrollTop);
    expect(before).toBeGreaterThan(500);
    await page.click('.st-mode [data-mode="source"]');
    await page.waitForSelector('.cm-content');
    await page.click('.st-mode [data-mode="visual"]');
    await page.waitForSelector('.ed-root');
    // the paragraph is in view again (it was at the top before the scroll fix)
    await page.waitForFunction(() => {
      const p = [...document.querySelectorAll('.ed-root p')].find((x) => x.textContent!.startsWith('The build checks the rendered pages'));
      const r = p?.getBoundingClientRect();
      return Boolean(r && r.bottom > 0 && r.top < innerHeight);
    }, undefined, { timeout: 5000 });
    await page.context().close();
  }, 90000);

  it('opens the menus of the top bar without leaving a control under them a sliver (2.5.8), at 1024 to 1280 px in both languages', async () => {
    for (const width of [1024, 1100, 1279, 1280]) {
      const page = await open(undefined, width);
      for (const lang of ['en', 'cs']) {
        if (lang === 'cs') {
          await page.evaluate(() => localStorage.setItem('libka-studio:lang', 'cs'));
          await page.reload();
          await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
          await page.waitForSelector('.ed-root');
        }
        // the layout settled before a menu opens: a menu is placed when it opens, and under the full run's load the
        // Source button still moved after the Czech reload (a 15.7 px sliver measured once, never when run alone)
        await page.evaluate(async () => {
          await document.fonts.ready;
          const at = () => JSON.stringify(document.querySelector('.st-mode [data-mode="source"]')?.getBoundingClientRect());
          const frame = () => new Promise((r) => requestAnimationFrame(r));
          for (let last = '', still = 0; still < 5;) { await frame(); const now = at(); still = now === last ? still + 1 : 0; last = now; }
        });
        for (const id of ['doc-menu', 'view-menu', 'help-menu', 'export-menu']) {
          await page.click(`#${id} summary`);
          // the list is placed on the details element's toggle event, which follows the click
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          // under View ▾ at 1024 px, the editor's Source button kept 10 px before (axe's target-size)
          const left = await page.evaluate((i) => {
            const items = [...document.querySelectorAll(`#${i} .st-menu-list button`)].map((b) => b.getBoundingClientRect()).filter((r) => r.width);
            return Math.min(...items.map((r) => r.left));
          }, id);
          const source = await page.locator('.st-mode [data-mode="source"]').boundingBox();
          if (id === 'view-menu' && source && left > source.x && left < source.x + source.width) expect(left - source.x, `${width} ${lang}`).toBeGreaterThanOrEqual(24);
          expect(findings(await guardPage(page)).map((v) => `${width} ${lang} ${id}: ${v.rule} ${v.target} ${v.message}`)).toEqual([]);
          await page.keyboard.press('Escape');
          // closed, the menu keeps no rule that moves its list (the next opening measures again)
          expect(await page.evaluate((i) => [(document.querySelector(`#${i}`) as HTMLDetailsElement).open,
            [...document.querySelectorAll('style')].some((s) => s.textContent!.includes(`#${i}[open]`))], id), `${width} ${lang} ${id}`).toEqual([false, false]);
        }
      }
      await page.context().close();
    }
  }, 240000);

  it('presents the deck: View ▾ and F5 full screen from the first slide, Shift+F5 from the cursor\'s slide, Esc and End back to the text, the Preview\'s P with the presenter view in step', async () => {
    const page = await open();
    type DeckWin = Window & { libkaDeck: { current: number } };
    const state = () => page.evaluate(() => ({
      open: Boolean(document.querySelector('#present[open]')),
      full: Boolean(document.fullscreenElement),
      slide: ((document.querySelector('#present-frame') as HTMLIFrameElement | null)?.contentWindow as DeckWin | null)?.libkaDeck?.current ?? null,
      inText: Boolean(document.activeElement?.closest('.ed-root')),
    }));
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.present === 'ready');
    // View ▾ → Present: the first slide, full screen, the keys go to the deck
    await page.click('#view-menu > summary');
    expect(await page.getAttribute('[data-command="present.start"]', 'aria-keyshortcuts')).toBe('F5');
    await page.click('[data-command="present.start"]');
    await ready();
    expect(await state()).toEqual({ open: true, full: true, slide: 0, inText: false });
    await page.keyboard.press('ArrowRight');
    expect((await state()).slide).toBe(1);
    expect(findings(await guardPage(page)).map((v) => `${v.rule} ${v.target}`)).toEqual([]);
    // Esc: back to the text
    await page.keyboard.press('Escape');
    await page.waitForSelector('#present', { state: 'detached' });
    expect(await state()).toEqual({ open: false, full: false, slide: null, inText: true });
    // Shift+F5 from the cursor's slide (the second section's text: slide 3), and End in the deck's bar
    await caretIn(page, 'Start with a few lines of front matter');
    await page.keyboard.press('Shift+F5');
    await ready();
    expect((await state()).slide).toBe(2);
    // F in the deck leaves full screen and goes on presenting
    await page.keyboard.press('f');
    await page.waitForFunction(() => !document.fullscreenElement);
    expect((await state()).open).toBe(true);
    await page.frameLocator('#present-frame').locator('#present-end').click();
    await page.waitForSelector('#present', { state: 'detached' });
    expect((await state()).inText).toBe(true);
    // F5 from the text starts at the first slide
    await page.keyboard.press('F5');
    await ready();
    expect((await state()).slide).toBe(0);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#present', { state: 'detached' });
    // the Preview's slides: P there opens the presenter view, the deck fills the window, the two keep in step
    await page.click('[data-device="slides"]');
    await page.waitForFunction(() => Boolean(((document.querySelector('#preview') as HTMLIFrameElement).contentWindow as DeckWin | null)?.libkaDeck));
    await page.frameLocator('#preview').locator('.lk-deck-viewport').click();
    await page.keyboard.press('ArrowRight');
    const opened = page.context().waitForEvent('page');
    await page.keyboard.press('p');
    const presenter = await opened;
    await ready();
    expect(await state()).toMatchObject({ open: true, full: false, slide: 1 });
    await presenter.waitForFunction(() => (window as unknown as DeckWin).libkaDeck && document.querySelector('.lk-deck')?.getAttribute('data-presenter') === 'true');
    await presenter.waitForFunction(() => (window as unknown as DeckWin).libkaDeck.current === 1);
    await page.keyboard.press('ArrowRight');
    await presenter.waitForFunction(() => (window as unknown as DeckWin).libkaDeck.current === 2);
    await presenter.keyboard.press('ArrowRight');
    await page.waitForFunction(() => ((document.querySelector('#present-frame') as HTMLIFrameElement).contentWindow as DeckWin).libkaDeck.current === 3);
    // Esc ends it: the presenter view closes, the Preview shows the slide it ended on
    const closed = presenter.waitForEvent('close');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#present', { state: 'detached' });
    await closed;
    expect(await page.evaluate(() => ((document.querySelector('#preview') as HTMLIFrameElement).contentWindow as DeckWin).libkaDeck.current)).toBe(3);
    // the Preview's Present button, in Czech
    await chooseLang(page, 'cs');
    await page.keyboard.press('Escape');
    expect(await page.textContent('#preview-present')).toBe('Prezentovat');
    await page.click('#preview-present');
    await ready();
    expect((await state()).slide).toBe(3);
    expect(await page.frameLocator('#present-frame').locator('#present-end').innerText()).toMatch(/^Ukončit/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#present', { state: 'detached' });
    await page.context().close();
  }, 120000);

  it('fits a phone screen in visual mode', async () => {
    const page = await open(undefined, 390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await page.isVisible('.ed-root')).toBe(true);
    await page.context().close();
  }, 60000);
});
