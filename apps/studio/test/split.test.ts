/**
 * In Chrome: Split (both editors in step, each with its own undo, the edited block marked on both sides),
 * quick fixes in both modes (every text fix kind, fields to fill, CodeMirror's actions), Guard findings explained,
 * the command palette (its keys, its sources, links on selected text), changeable keys, Czech throughout, and Guard
 * on the new views.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveStatic, type Served } from '@libka/cli/src/serve.ts';
import { guardPage, launchBrowser, type GuardReport } from '@libka/guard';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const example = readFileSync(join(root, 'examples', 'manual', 'guide.md'), 'utf8');
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

interface Problem { line: number; code: string; fixes?: { kind: string }[] }
interface Hook { source: string; mode: string; selection: string; problems: Problem[]; sides: { visual?: string; source?: string } }
let browser: Browser;
let served: Served;

async function open(o: { mode?: string; lang?: 'en' | 'cs'; width?: number } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: o.width ?? 1600, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript((p) => {
    localStorage.setItem('libka-studio:toured', '1');
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('libka-studio:editor', JSON.stringify({ defaultMode: p.mode }));
    if (p.lang) localStorage.setItem('libka-studio:lang', p.lang);
  }, { mode: o.mode ?? 'visual', lang: o.lang });
  const page = await ctx.newPage();
  await page.goto(served.url);
  await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
  await page.waitForSelector('.ed-root, .cm-content');
  return page;
}
const hook = (page: Page): Promise<Hook> => page.evaluate(() => {
  const h = (window as unknown as { libkaStudio: Hook }).libkaStudio;
  return { source: h.source, mode: h.mode, selection: h.selection, problems: h.problems, sides: h.sides };
});
/** Waits until the editors have written their latest text and it is saved. */
async function settled(page: Page): Promise<Hook> {
  let last = '';
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const now = (await hook(page)).source;
    if (now === last) break;
    last = now;
  }
  await page.waitForFunction(() => document.querySelector('#save-state')?.getAttribute('data-state') === 'saved');
  return hook(page);
}
const caretIn = async (page: Page, text: string, where: 'start' | 'end' = 'end') => {
  expect(await page.evaluate(([t, w]) => (window as unknown as { libkaStudio: { placeCaret(t: string, w: string): boolean } }).libkaStudio.placeCaret(t!, w!), [text, where])).toBe(true);
  await page.waitForTimeout(100);   // the editor reads a new selection a moment later
};
/** Replaces the whole text in the source editor. */
async function setSource(page: Page, text: string, editor = '.cm-content'): Promise<void> {
  await page.click(editor);
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(text);
  await settled(page);
}
const findings = (report: GuardReport) => report.checks.flatMap((c) => c.violations).filter((v) => !(v.rule === 'no-inline-style' && /\.cm-/.test(v.target)));
/** Escape closes the open dialog; the next step waits until it is gone (the focus is back where it was). */
async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
}
const codes = async (page: Page) => (await hook(page)).problems.map((p) => p.code);

describe.skipIf(!chrome)('LibKa Studio: Split, quick fixes, the palette, Czech', () => {
  beforeAll(async () => {
    served = await serveStatic(join(here, '..', 'dist'));
    browser = await launchBrowser();
  }, 60000);
  afterAll(async () => {
    await browser?.close();
    await served?.close();
  });

  it('Split: both editors in step both ways, each with its own undo, the edited block marked on both sides', async () => {
    const page = await open({ mode: 'split' });
    await page.waitForSelector('.st-split .ed-root');
    await page.waitForSelector('.st-split #editor-source .cm-content');
    expect((await hook(page)).mode).toBe('split');
    // visual → source
    await caretIn(page, 'so you never set them yourself');
    await page.keyboard.type(' Typed in visual.');
    await page.waitForFunction(() => (window as unknown as { libkaStudio: Hook }).libkaStudio.sides.source?.includes('Typed in visual.'));
    // the block is marked on both sides
    expect(await page.locator('.st-split .ed-linked').count()).toBe(1);
    expect(await page.locator('.st-split .cm-lk-linked').count()).toBeGreaterThan(0);
    // source → visual
    await page.click('#editor-source .cm-content');
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Typed in source.');
    await page.waitForFunction(() => (window as unknown as { libkaStudio: Hook }).libkaStudio.sides.visual?.includes('Typed in source.'));
    let h = await settled(page);
    expect(h.sides.visual).toBe(h.sides.source);
    expect(h.source).toBe(h.sides.source);
    // undo in the source undoes only what was typed there
    for (let i = 0; i < 10; i++) await page.keyboard.press('Control+z');
    await page.waitForFunction(() => !(window as unknown as { libkaStudio: Hook }).libkaStudio.sides.visual?.includes('Typed in source.'));
    h = await settled(page);
    expect(h.source).toContain('Typed in visual.');
    expect(h.sides.visual).toBe(h.sides.source);
    // and undo in the visual editor undoes its own typing
    await caretIn(page, 'Typed in visual.');
    await page.keyboard.press('Control+z');
    h = await settled(page);
    expect(h.source).toBe(example);
    expect(h.sides.visual).toBe(example);
    expect(h.sides.source).toBe(example);
    await page.context().close();
  }, 120000);

  it('offers Split on wide screens only (a narrower window shows the document in Visual)', async () => {
    const page = await open({ mode: 'split', width: 1100 });
    expect(await page.locator('.st-mode [data-mode="split"]').count()).toBe(0);
    expect(await page.locator('.st-split').count()).toBe(0);
    expect(await page.isVisible('.ed-root')).toBe(true);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForSelector('.st-split .ed-root');
    await page.context().close();
  }, 90000);

  it('applies every kind of text fix from the Problems tab in Source mode, each one undoable step', async () => {
    const page = await open({ mode: 'source' });
    const doc = [
      '---', 'title: Fixes', 'lang: en', 'outputs: [web, slides]', '---', '',
      '## Start', '',
      ':::calout[Heads up]{variant=info}', 'Text.', ':::', '',
      ':::callout[Note]{varient=warning}', 'More.', ':::', '',
      ':::callout[Colour]{variant=info colour=red}', 'Even more.', ':::', '',
      ':::callout[Wrong]{variant=warnign}', 'Still more.', ':::', '',
      '### Sub', '', 'Text.', '', '##### Too deep', '',
      ':::summary', '1. One', '2. Two', '3. Three', ':::', '',
      '- [ ] open', '- [x] done', '',
    ].join('\n');
    await setSource(page, doc);
    // the checks' messages are English in both interfaces, and say so (WCAG 3.1.2)
    await page.waitForSelector('.st-item-msg');
    expect(await page.$$eval('.st-item-msg', (els) => [...new Set(els.map((e) => e.getAttribute('lang')))])).toEqual(['en']);
    const fixes: [string, string, (src: string) => boolean][] = [
      ['outputs-unknown', 'set-front-matter', (src) => src.includes('outputs: [web, deck]')],
      ['block-unknown', 'rename-block', (src) => src.includes(':::callout[Heads up]{variant=info}')],
      ['unknown-attribute', 'rename-attribute', (src) => src.includes(':::callout[Note]{variant=warning}')],
      ['unknown-attribute', 'remove-attribute', (src) => src.includes(':::callout[Colour]{variant=info}')],
      ['invalid-value', 'set-attribute', (src) => src.includes(':::callout[Wrong]{variant=warning}')],
      ['heading-too-deep', 'heading-level', (src) => src.includes('\n#### Too deep\n')],
      ['summary-numbered', 'list-type', (src) => src.includes(':::summary\n- One\n- Two\n- Three\n:::')],
      ['task-list-outside-checklist', 'wrap', (src) => src.includes(':::checklist\n- [ ] open\n- [x] done\n:::')],
    ];
    for (const [code, kind, ok] of fixes) {
      const before = (await hook(page)).source;
      await page.click('#tab-problems');
      const row = page.locator('#tp-problems .st-item-row', { has: page.locator(`.st-fix[data-fix="${kind}"]`) }).first();
      await row.locator(`.st-fix[data-fix="${kind}"]`).click();
      const after = (await settled(page)).source;
      expect(ok(after), `${code} ${kind}:\n${after}`).toBe(true);
      // one step of the editor's undo, and back
      await page.click('.cm-content');
      await page.keyboard.press('Control+z');
      expect((await settled(page)).source, `${kind} undo`).toBe(before);
      await page.keyboard.press('Control+y');
      expect((await settled(page)).source).toBe(after);
    }
    expect(await codes(page)).toEqual([]);
    await page.context().close();
  }, 150000);

  it('offers the fixes as CodeMirror actions on the problem\'s line', async () => {
    const page = await open({ mode: 'source' });
    await setSource(page, '---\ntitle: Actions\nlang: en\n---\n\n:::calout[Heads up]{variant=info}\nText.\n:::\n');
    await page.locator('.cm-lintRange-error').first().hover();
    const action = page.locator('.cm-tooltip-lint .cm-diagnosticAction').first();
    await action.waitFor();
    expect(await action.textContent()).toBe('Change to "callout" (Callout)');
    await action.click();
    expect((await settled(page)).source).toContain(':::callout[Heads up]{variant=info}');
    await page.context().close();
  }, 90000);

  it('in Visual mode: problem marks on blocks, fixes in the Inspector, and fields to fill (never made-up text)', async () => {
    const page = await open({ mode: 'source' });
    await setSource(page, '---\ntitle: Visual fixes\nlang: en\n---\n\n## Start\n\n:::callout{variant=info}\nNo title yet.\n:::\n\n![](images/pipeline.svg "")\n');
    await page.click('.st-mode [data-mode="visual"]');
    await page.waitForSelector('.ed-root');
    await page.waitForSelector('.ed-problem-mark');
    expect(await page.locator('.ed-problem-mark').count()).toBe(2);
    // the picture's mark: its fixes in the Inspector take the author to the empty fields
    await page.locator('.ed-problem-mark').last().click();
    await page.waitForSelector('#tp-inspector .st-fix');
    expect(await page.locator('#tp-inspector .st-fix').allTextContents()).toEqual(['Write the alt text', 'Write the caption']);
    await page.locator('#tp-inspector .st-fix', { hasText: 'Write the alt text' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'img-alt');
    expect(await page.inputValue('#img-alt')).toBe('');
    await page.keyboard.type('The pipeline from Markdown to outputs');
    await page.keyboard.press('Tab');
    expect((await settled(page)).source).toContain('![The pipeline from Markdown to outputs](images/pipeline.svg');
    // the callout's missing title: the cursor goes into an empty title to write
    await page.click('#tab-problems');
    await page.locator('#tp-problems .st-fix', { hasText: 'Write the title' }).click();
    await page.waitForTimeout(150);
    await page.keyboard.type('Read this first');
    expect((await settled(page)).source).toContain(':::callout[Read this first]{variant=info}\nNo title yet.\n:::');
    await page.context().close();
  }, 120000);

  it('explains Guard findings in plain words, with a way to the text', async () => {
    const page = await open({ mode: 'source' });
    await setSource(page, '---\ntitle: Chart\nlang: en\noutputs: [web]\n---\n\n## One\n\n:::chart{type=bar caption="Sales by region"}\n| Region | Sales |\n|---|---|\n| A region with an extremely long name that will never fit in any chart label area at all | 10 |\n| B | 20 |\n:::\n');
    await page.waitForFunction(() => document.querySelector('#status-chip')?.getAttribute('data-state') === 'fix', null, { timeout: 60000 });
    await page.click('#tab-guard');
    const explain = page.locator('#tp-guard .st-explain').first();
    await explain.waitFor();
    expect(await explain.textContent()).toMatch(/Why it matters: A chart's labels must be readable in full\.How to fix it: Shorten the labels/);
    await page.locator('#tp-guard .st-gotext').first().click();
    await page.waitForFunction(() => /^Ln (9|1[0-4]),/.test(document.querySelector('#sb-position')?.textContent ?? ''));
    await page.click('button[data-lang="cs"]');
    expect(await explain.textContent()).toMatch(/^Proč na tom záleží: Popisky grafu musí být čitelné celé\./);
    await page.context().close();
  }, 120000);

  it('the command palette: Ctrl+K and F1, commands with their keys, blocks, places, settings and documents', async () => {
    const page = await open();
    await caretIn(page, 'You write a manual');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.st-cmdk-input');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('st-cmdk-input'))).toBe(true);
    expect(await page.locator('.st-cmdk-group').allTextContents()).toEqual(['Commands', 'Insert a block', 'Places in the document', 'Settings']);
    expect(await page.locator('.st-cmdk-opt[data-item="cmd:save"] .st-cmdk-keys').textContent()).toBe('Ctrl+S');
    // a place: goes there
    await page.keyboard.type('before you publish');
    expect(await page.locator('.st-cmdk-label').first().textContent()).toBe('Before you publish');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (window as unknown as { libkaStudio: Hook }).libkaStudio.selection.startsWith('## Before you publish'));
    // a block: inserted after the selected one
    await page.keyboard.press('F1');
    await page.keyboard.type('checklist');
    await page.keyboard.press('Enter');
    expect((await settled(page)).source).toMatch(/## Before you publish\n\n:::checklist\n/);
    // a setting
    await page.keyboard.press('F1');
    await page.keyboard.type('focus mode');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.st-work[data-focus="true"]');
    await page.keyboard.press('Control+Shift+f');
    // a command that opens a dialog (it opens after the palette has closed)
    await page.keyboard.press('F1');
    await page.keyboard.type('preferences');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.st-dialog--prefs[open]');
    await closeDialog(page);
    // a document of the library
    await page.click('#file-menu summary');
    await page.click('[data-command="project.new"]');
    await page.waitForFunction(() => (window as unknown as { libkaStudio: { project: { name: string } } }).libkaStudio.project?.name === 'untitled.md');
    await page.keyboard.press('F1');
    await page.keyboard.type('writing a libka');
    expect(await page.locator('.st-cmdk-group').allTextContents()).toEqual(['Documents']);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (window as unknown as { libkaStudio: { project: { name: string } } }).libkaStudio.project?.name === 'guide.md');
    await page.context().close();
  }, 120000);

  it('Ctrl+K on selected text makes a link, in both editors', async () => {
    const page = await open();
    await caretIn(page, 'You write a manual', 'start');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.st-dialog--prompt[open]');
    expect(await page.locator('.st-cmdk-input').count()).toBe(0);
    await page.fill('.st-dialog--prompt input', 'https://example.org');
    await page.keyboard.press('Enter');
    expect((await settled(page)).source).toContain('[You](https://example.org) write a manual');
    await page.click('.st-mode [data-mode="source"]');
    await page.waitForSelector('.cm-content');
    await page.click('.cm-content');
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Read the guide.');
    // select by character: with line wrapping, Shift+Home finds the line's start from the drawn layout, which a
    // loaded machine may not have measured yet
    for (let i = 0; i < 'Read the guide.'.length; i++) await page.keyboard.press('Shift+ArrowLeft');
    // with nothing selected Ctrl+K opens the command palette: wait until the editor holds the selection Ctrl+K reads
    // (its own state, not the page's drawn selection, which a loaded machine may draw later or not at all)
    await page.waitForFunction(() => (window as unknown as { libkaStudio: { selection: string } }).libkaStudio.selection === 'Read the guide.');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.st-dialog--prompt[open]');
    await page.fill('.st-dialog--prompt input', 'guide.md');
    await page.keyboard.press('Enter');
    expect((await settled(page)).source).toMatch(/\[Read the guide\.\]\(guide\.md\)\n?$/);
    await page.context().close();
  }, 90000);

  it('changes the keys of commands in Preferences: conflicts named, kept in the browser', async () => {
    const page = await open({ mode: 'source' });
    await page.click('.cm-content');
    await page.keyboard.press('F1');
    await page.keyboard.type('preferences');
    await page.keyboard.press('Enter');
    const row = page.locator('.st-keys-edit tr[data-command="palette.open"]');
    await row.locator('button', { hasText: 'Change' }).click();
    await page.keyboard.press('Control+s');
    expect(await row.locator('[role="status"]').textContent()).toBe('Ctrl+S is already used by: Save. Choose other keys.');
    await row.locator('button', { hasText: 'Change' }).click();
    await page.keyboard.press('Control+b');
    expect(await row.locator('[role="status"]').textContent()).toBe('Ctrl+B is already used by: the editors. Choose other keys.');
    await row.locator('button', { hasText: 'Change' }).click();
    await page.keyboard.press('Control+Shift+p');
    expect(await row.locator('kbd').textContent()).toBe('Ctrl+Shift+P');
    await closeDialog(page);
    await page.reload();
    await page.waitForSelector('.cm-content');
    await page.click('.cm-content');
    await page.keyboard.press('Control+Shift+p');
    await page.waitForSelector('.st-cmdk-input');
    expect(await page.locator('.st-cmdk-opt[data-item="cmd:save"] .st-cmdk-keys').textContent()).toBe('Ctrl+S');
    await closeDialog(page);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(200);
    expect(await page.locator('.st-cmdk-input').count()).toBe(0);
    await page.context().close();
  }, 90000);

  it('works in Czech: names, summaries and help from the registry; search in either language, accents optional', async () => {
    const page = await open({ lang: 'cs' });
    expect(await page.locator('.st-palette-item[data-block="callout"]').textContent()).toBe('Zvýraznění');
    expect(await page.locator('.ed-directive[data-name="callout"]').first().getAttribute('aria-label')).toBe('Zvýraznění');
    await caretIn(page, 'Install the workspace once');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.click('#tab-inspector');
    expect(await page.textContent('.st-insp-title')).toBe('Zvýraznění');
    expect(await page.textContent('#attr-variant-help')).toBe('Význam sdělení.');
    expect(await page.textContent('.st-insp-section select#attr-variant option[value="warning"], .st-seg-option:has(input[value="warning"]) span')).toMatch(/Varování/);
    // the palette and the "/" menu find blocks in either language, accents optional
    await page.keyboard.press('F1');
    await page.keyboard.type('zvyrazneni');
    expect(await page.locator('.st-cmdk-label').first().textContent()).toBe('Zvýraznění');
    await closeDialog(page);
    await caretIn(page, 'so you never set them yourself');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.waitForSelector('#st-insert');
    await page.keyboard.type('checklist');
    expect(await page.locator('.st-insert-name').first().textContent()).toBe('Kontrolní seznam');
    await page.context().close();
  }, 90000);

  it('passes Guard on the new views: Split, the palette, fixes, explained findings, key settings (standard and high contrast)', async () => {
    const page = await open({ mode: 'split' });
    await page.waitForSelector('.st-split .ed-root');
    const views: [string, () => Promise<unknown>][] = [
      ['split', async () => { await caretIn(page, 'You write a manual'); }],
      ['palette', async () => { await page.keyboard.press('F1'); await page.waitForSelector('.st-cmdk-input'); await page.keyboard.type('a'); }],
      ['problems with fixes', async () => {
        await closeDialog(page);
        await page.click('.st-mode [data-mode="source"]');
        await setSource(page, '---\ntitle: G\nlang: en\noutputs: [web]\n---\n\n## One\n\n:::calout[T]{variant=info}\nX.\n:::\n\n:::chart{type=bar caption="Sales"}\n| Region | Sales |\n|---|---|\n| A region with an extremely long name that will never fit in any chart label area at all | 10 |\n| B | 20 |\n:::\n');
        await page.click('#tab-problems');
      }],
      ['explained findings', async () => { await page.waitForSelector('#count-guard[data-tone="error"]', { timeout: 60000 }); await page.click('#tab-guard'); }],
      ['visual with marks', async () => { await page.click('.st-mode [data-mode="visual"]'); await page.waitForSelector('.ed-problem-mark'); }],
      ['key settings', async () => { await page.keyboard.press('F1'); await page.keyboard.type('preferences'); await page.keyboard.press('Enter'); await page.waitForSelector('.st-keys-edit'); }],
    ];
    for (const [name, go] of views) {
      await go();
      // the document's own findings (the clipped chart label) are not the Studio's
      expect(findings(await guardPage(page)).map((v) => `${name}: ${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    }
    await page.context().close();
  }, 180000);
});
