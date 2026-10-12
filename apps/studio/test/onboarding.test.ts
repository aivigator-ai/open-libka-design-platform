/**
 * Onboarding in Chrome: the guided tour (first visit, by keyboard, skippable, again from Help) and the tutorial, a
 * learn-by-doing document whose steps tick themselves, done end to end until the document is ready to publish and
 * exported; in English and Czech; Guard on both.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveStatic, type Served } from '@libka/cli/src/serve.ts';
import { guardPage, launchBrowser, type GuardReport } from '@libka/guard';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

let browser: Browser;
let served: Served;

/** A first visit: nothing in the browser's storage yet (the language may be chosen). */
async function firstVisit(lang?: 'cs'): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  if (lang) await ctx.addInitScript((l) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('libka-studio:lang', l); } }, lang);
  const page = await ctx.newPage();
  await page.goto(served.url);
  await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
  return page;
}
const findings = (report: GuardReport) => report.checks.flatMap((c) => c.violations).filter((v) => !(v.rule === 'no-inline-style' && /\.cm-/.test(v.target)));
const steps = (page: Page) => page.locator('.st-tutorial-step').evaluateAll((l) => Object.fromEntries(l.map((x) => [(x as HTMLElement).dataset.step, (x as HTMLElement).dataset.done === 'true'])));
const caretIn = async (page: Page, text: string) => {
  expect(await page.evaluate((t) => (window as unknown as { libkaStudio: { placeCaret(t: string): boolean } }).libkaStudio.placeCaret(t), text)).toBe(true);
  await page.waitForTimeout(100);
};

describe.skipIf(!chrome)('LibKa Studio onboarding', () => {
  beforeAll(async () => {
    served = await serveStatic(join(here, '..', 'dist'));
    browser = await launchBrowser();
  }, 60000);
  afterAll(async () => {
    await browser?.close();
    await served?.close();
  });

  it('shows the tour on the first visit, by keyboard, pointing at each part; skipped, it stays away; Help brings it back', async () => {
    const page = await firstVisit();
    await page.waitForSelector('#st-tour');
    // the focus moves to the step's heading once the step has marked its part (an effect after painting)
    await page.waitForFunction(() => document.activeElement?.id === 'st-tour-title');
    expect(await page.getAttribute('#st-tour', 'role')).toBe('dialog');
    const seen: [string, string | null][] = [];
    for (let i = 0; i < 9; i++) {
      await page.waitForFunction((n) => document.querySelector('.st-tour-count')?.textContent === `Step ${n} of 9`, i + 1);
      await page.waitForFunction(() => document.activeElement?.id === 'st-tour-title');
      seen.push([await page.textContent('#st-tour-title') ?? '', await page.evaluate(() => {
        const el = document.querySelector('.st-tour-target');
        return el ? (el.id || el.classList[0]!) : null;
      })]);
      if (i < 8) {
        // Tab goes through the step's buttons in reading order; the primary one moves on
        await page.locator('#st-tour .st-btn--primary').focus();
        await page.keyboard.press('Enter');
      }
    }
    expect(seen).toEqual([
      ['Welcome to LibKa Studio', null], ['Three ways to edit', 'st-seg'], ['Write here', 'editor'], ['Blocks', 'st-blocks'],
      ['Preview', 'st-pane'], ['Problems, checks and properties', 'st-tabs'], ['Ready to publish', 'status-chip'], ['Export', 'file-menu'], ['Find anything', null],
    ]);
    await page.locator('#st-tour button', { hasText: 'Back' }).click();
    await page.waitForFunction(() => document.querySelector('.st-tour-count')?.textContent === 'Step 8 of 9');
    await page.waitForFunction(() => document.activeElement?.id === 'st-tour-title');
    await page.keyboard.press('Escape');
    expect(await page.locator('#st-tour').count()).toBe(0);
    expect(await page.locator('.st-tour-target').count()).toBe(0);
    await page.reload();
    await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
    await page.waitForTimeout(500);
    expect(await page.locator('#st-tour').count()).toBe(0);
    await page.click('#help-menu summary');
    await page.click('[data-command="tour.start"]');
    await page.waitForSelector('#st-tour');
    expect(await page.textContent('#st-tour-title')).toBe('Welcome to LibKa Studio');
    await page.click('.st-tour-skip');
    expect(await page.locator('#st-tour').count()).toBe(0);
    await page.context().close();
  }, 120000);

  it('the tutorial: every step ticks itself as it is done, until the document is ready to publish and exported', async () => {
    const page = await firstVisit();
    await page.waitForSelector('#st-tour');
    for (let i = 0; i < 8; i++) await page.locator('#st-tour .st-btn--primary').click();
    await page.locator('#st-tour .st-btn--primary', { hasText: 'Open the tutorial' }).click();
    await page.waitForSelector('.st-tutorial');
    expect(await page.textContent('#tutorial-progress')).toBe('0 of 9 steps done');
    expect(await page.evaluate(() => (window as unknown as { libkaStudio: { project: { name: string } } }).libkaStudio.project.name)).toBe('first-document.md');
    // the quick fix
    await page.click('#tab-problems');
    await page.locator('#tp-problems .st-fix[data-fix="rename-block"]').click();
    await page.waitForFunction(() => !(window as unknown as { libkaStudio: { problems: { code: string }[] } }).libkaStudio.problems.some((p) => p.code === 'block-unknown'));
    // the picture's alt text and caption, in the Inspector
    await page.click('#tab-problems');
    await page.locator('#tp-problems .st-fix', { hasText: 'Write the alt text' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'img-alt');
    await page.keyboard.type('A lighthouse on the coast on a sunny day');
    await page.keyboard.press('Tab');
    await page.fill('#img-caption', 'A lighthouse shows the way');
    await page.keyboard.press('Tab');
    // the title
    await page.locator('.ed-front-matter').click();
    await page.click('#tab-inspector');
    await page.fill('#docprop-title', 'My guide');
    await page.keyboard.press('Tab');
    // a section and a block
    await caretIn(page, 'from the "/" menu');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## My section');
    await page.keyboard.press('Enter');
    await page.keyboard.type('I wrote this myself.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.waitForSelector('#st-insert');
    await page.keyboard.type('steps');
    await page.keyboard.press('Enter');
    // Split and back, and the palette
    await page.click('.st-mode [data-mode="split"]');
    await page.waitForSelector('.st-split');
    await page.click('.st-mode [data-mode="visual"]');
    await page.keyboard.press('F1');
    await page.waitForSelector('.st-cmdk-input');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog', { state: 'detached' });
    // ready to publish
    await page.click('#tab-tutorial');
    await page.waitForFunction(() => document.querySelector('[data-step="ready"]')?.getAttribute('data-done') === 'true', null, { timeout: 90000 }).catch(async (e) => {
      console.log(JSON.stringify(await steps(page)), await page.getAttribute('#status-chip', 'data-state'), JSON.stringify(await page.evaluate(() => (window as unknown as { libkaStudio: { problems: unknown; source: string; checks: unknown } }).libkaStudio)));
      throw e;
    });
    expect(await steps(page)).toEqual({ title: true, fix: true, picture: true, section: true, block: true, mode: true, palette: true, ready: true, export: false });
    // exported
    await page.click('#file-menu summary');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-command="export.html"]')]);
    expect(download.suggestedFilename()).toBe('first-document.html');
    await page.click('#tab-tutorial');
    await page.waitForSelector('.st-tutorial-finished');
    expect(await page.textContent('#tutorial-progress')).toBe('9 of 9 steps done');
    expect(await page.textContent('.st-tutorial-finished')).toContain('libka build');
    expect(findings(await guardPage(page)).map((v) => `tutorial: ${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    await page.context().close();
  }, 180000);

  it('in Czech: the tour, the tutorial document and its steps; Guard passes on the tour', async () => {
    const page = await firstVisit('cs');
    await page.waitForSelector('#st-tour');
    expect(await page.textContent('#st-tour-title')).toBe('Vítejte v LibKa Studiu');
    await page.locator('#st-tour .st-btn--primary').click();
    expect(findings(await guardPage(page)).map((v) => `tour: ${v.rule} ${v.target} ${v.message}`)).toEqual([]);
    await page.waitForFunction(() => document.activeElement?.id === 'st-tour-title');
    await page.keyboard.press('Escape');
    await page.click('#help-menu summary');
    await page.click('[data-command="tutorial.open"]');
    await page.waitForSelector('.st-tutorial');
    expect(await page.textContent('#tutorial-progress')).toBe('Hotovo kroků: 0 z 9');
    expect(await page.textContent('[data-step="fix"] .st-tutorial-title')).toMatch(/^Opravte blok s překlepem rychlou opravou/);
    const h = await page.evaluate(() => (window as unknown as { libkaStudio: { source: string; project: { name: string } } }).libkaStudio);
    expect(h.project.name).toBe('prvni-dokument.md');
    expect(h.source).toContain('title: Můj první dokument v LibKa');
    await page.context().close();
  }, 120000);
});
