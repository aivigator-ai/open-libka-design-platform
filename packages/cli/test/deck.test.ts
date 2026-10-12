import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '@libka/guard';
import { build, verify, type BuildResult } from '../src/libka.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const example = join(root, 'examples', 'manual', 'guide.md');
const out = mkdtempSync(join(tmpdir(), 'libka-deck-test-'));
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

describe.skipIf(!chrome)('libka build --deck', () => {
  let result: BuildResult;
  let browser: Browser;
  let page: Page;
  const count = () => page.textContent('.lk-deck-count');

  beforeAll(async () => {
    result = await build(example, { out, outputs: ['web', 'pdf', 'deck'] });
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(pathToFileURL(result.deck!.html).href);
  }, 120000);
  afterAll(async () => {
    await browser?.close();
    rmSync(out, { recursive: true, force: true });
  });

  it('writes a checked, signed deck and a 16:9 PDF with one page per slide', () => {
    expect(result.problems).toEqual([]);
    const slides = readFileSync(result.deck!.html, 'utf8').match(/class="lk-deck-frame"/g)!.length;
    const pdf = readFileSync(result.deck!.pdf!).toString('latin1');
    expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(slides);
    expect(pdf).toMatch(/\/MediaBox \[\s*0 0 960 540\s*\]/);
    const v = verify(result.deck!.html, result.deck!.pdf);
    expect(v.problems).toEqual([]);
    expect(v.manifest!.target).toBe('deck');
    expect(verify(result.html!).manifest!.target).toBe('manual');
  });

  it('moves with the keys, announces the slide and links to it', async () => {
    const total = await page.evaluate(() => (window as unknown as { libkaDeck: { total: number } }).libkaDeck.total);
    expect(await count()).toBe(`1 / ${total}`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    expect(await count()).toBe(`3 / ${total}`);
    expect(await page.evaluate(() => location.hash)).toBe('#3');
    expect(await page.textContent('.lk-deck-live')).toMatch(/^Slide 3 of \d+: Write your first manual$/);
    await page.keyboard.press('End');
    expect(await count()).toBe(`${total} / ${total}`);
    expect(await page.isDisabled('[data-deck="next"]')).toBe(true);
    await page.keyboard.press('Home');
    await page.keyboard.press('Control+ArrowRight');   // with a modifier: left to the browser
    expect(await count()).toBe(`1 / ${total}`);
    await page.evaluate(() => { location.hash = '#4'; });
    await page.waitForFunction(() => document.querySelector('.lk-deck-count')!.textContent!.startsWith('4 '));
  });

  it('opens at the slide a link points to', async () => {
    const other = await browser.newPage();
    await other.goto(`${pathToFileURL(result.deck!.html).href}#5`);
    expect(await other.textContent('.lk-deck-count')).toMatch(/^5 \//);
    expect(await other.evaluate(() => location.hash)).toBe('#5');
    await other.close();
  });

  it('shows the speaker notes of the current slide', async () => {
    await page.evaluate(() => { location.hash = '#3'; });
    await page.waitForFunction(() => document.querySelector('.lk-deck-count')!.textContent!.startsWith('3 '));
    await page.keyboard.press('n');
    expect(await page.isVisible('.lk-deck-notes')).toBe(true);
    expect(await page.textContent('.lk-deck-notes-body')).toMatch(/Show the four steps on screen/);
    await page.keyboard.press('ArrowRight');
    expect(await page.textContent('.lk-deck-notes-body')).toMatch(/No speaker notes for this slide/);
    await page.keyboard.press('Escape');
    expect(await page.isVisible('.lk-deck-notes')).toBe(false);
  });

  it('lets the letter shortcuts be turned off, and remembers it (WCAG 2.1.4)', async () => {
    const other = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await other.goto(pathToFileURL(result.deck!.html).href);
    expect(await other.getAttribute('[data-deck="letters"]', 'aria-pressed')).toBe('true');
    await other.click('[data-deck="letters"]');
    expect(await other.getAttribute('[data-deck="letters"]', 'aria-pressed')).toBe('false');
    expect(await other.isVisible('[data-deck="notes"] .lk-deck-key')).toBe(false);   // no letter hints while off
    await other.keyboard.press('n');
    await other.keyboard.press('o');
    expect(await other.isVisible('.lk-deck-notes')).toBe(false);
    expect(await other.getAttribute('.lk-deck', 'data-mode')).toBe('slides');
    await other.keyboard.press('ArrowRight');                                      // arrows still move
    expect(await other.textContent('.lk-deck-count')).toMatch(/^2 \//);
    await other.reload();
    expect(await other.getAttribute('[data-deck="letters"]', 'aria-pressed')).toBe('false');
    await other.click('[data-deck="letters"]');                                     // on again for the other tests
    await other.keyboard.press('n');
    expect(await other.isVisible('.lk-deck-notes')).toBe(true);
    await other.close();
  });

  it('opens an overview to pick a slide with the keyboard', async () => {
    await page.keyboard.press('Home');
    await page.keyboard.press('o');
    expect(await page.getAttribute('.lk-deck', 'data-mode')).toBe('overview');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^Go to slide 1: /);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    expect(await page.getAttribute('.lk-deck', 'data-mode')).toBe('slides');
    expect(await count()).toMatch(/^3 \//);
  });

  it('keeps a presenter view in sync both ways', async () => {
    const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')]);
    await presenter.waitForFunction(() => document.querySelector('.lk-deck-count')!.textContent!.startsWith('3 '));
    expect(await presenter.isVisible('.lk-deck-timer')).toBe(true);
    expect(await presenter.isVisible('.lk-deck-next')).toBe(true);
    expect(await presenter.isVisible('[data-deck="presenter"]')).toBe(false);
    await presenter.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.lk-deck-count')!.textContent!.startsWith('4 '));
    await page.keyboard.press('ArrowRight');
    await presenter.waitForFunction(() => document.querySelector('.lk-deck-count')!.textContent!.startsWith('5 '));
    await presenter.close();
  });
});
