/**
 * Smoke tests in Firefox and WebKit (Safari's engine): the Studio starts, renders and checks the example, keeps an edit
 * across a reload, and shows the library and the history. Skipped with a message where Playwright's browsers are not
 * installed (`npx playwright-core install firefox webkit`, see docs/admin/studio.md); CI installs them.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox, webkit, type BrowserType } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveStatic, type Served } from '@libka/cli/src/serve.ts';

const here = dirname(fileURLToPath(import.meta.url));
const engines: [string, BrowserType][] = [['Firefox', firefox], ['WebKit', webkit]];
const installed = (b: BrowserType) => { try { return existsSync(b.executablePath()); } catch { return false; } };
let served: Served;

// CI sets LIBKA_REQUIRE_BROWSERS=1: a missing browser fails there instead of being skipped
const required = process.env.LIBKA_REQUIRE_BROWSERS === '1';
for (const [name] of engines.filter(([, b]) => !installed(b))) {
  console.warn(`LibKa Studio: ${name} is not installed for Playwright, so its smoke test is skipped (npx playwright-core install firefox webkit)`);
}
it.runIf(required)('has Firefox and WebKit installed for Playwright', () => {
  expect(engines.filter(([, b]) => !installed(b)).map(([name]) => name)).toEqual([]);
});

describe.skipIf(engines.every(([, b]) => !installed(b)))('LibKa Studio in other browsers', () => {
  beforeAll(async () => { served = await serveStatic(join(here, '..', 'dist')); });
  afterAll(async () => { await served?.close(); });

  for (const [name, type] of engines) {
    it.skipIf(!installed(type))(`works in ${name}: renders, checks, keeps an edit, shows the library and the history`, async () => {
      const browser = await type.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(served.url);
        await page.waitForSelector('html[data-guard="done"]', { timeout: 90000 });
        // the tour on the first visit, skipped with Escape
        await page.waitForSelector('#st-tour');
        await page.waitForFunction(() => document.activeElement?.id === 'st-tour-title');
        await page.keyboard.press('Escape');
        expect(await page.locator('#st-tour').count()).toBe(0);
        const checks = await page.evaluate(() => (window as unknown as { libkaStudio: { checks: { id: string; checked: number }[] } }).libkaStudio.checks);
        expect(checks.map((c) => c.id)).toEqual(['axe', 'contrast', 'structure', 'contrast', 'axe', 'contrast', 'structure', 'contrast', 'docx']);
        expect(checks.every((c) => c.checked > 0)).toBe(true);
        expect(await page.evaluate(() => (document.querySelector('#preview') as HTMLIFrameElement).contentDocument?.querySelector('h1')?.textContent)).toBe('Writing a LibKa manual');

        // visual mode: type at the end of a paragraph, insert a block with "/"
        type Hook = { source: string; mode: string; placeCaret(t: string): boolean };
        const studio = () => page.evaluate(() => { const h = (window as unknown as { libkaStudio: Hook }).libkaStudio; return { source: h.source, mode: h.mode }; });
        expect((await studio()).mode).toBe('visual');
        expect(await page.evaluate(() => (window as unknown as { libkaStudio: Hook }).libkaStudio.placeCaret('so you never set them yourself'))).toBe(true);
        await page.keyboard.type(` Edited in ${name}.`);
        await page.keyboard.press('Enter');
        await page.keyboard.type('/');
        await page.waitForSelector('#st-insert');
        await page.keyboard.type('summary');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('#save-state')?.getAttribute('data-state') === 'saved' && (window as unknown as { libkaStudio: Hook }).libkaStudio.source.includes(':::summary'));
        // and the source editor
        await page.click('[data-mode="source"]');
        await page.waitForSelector('.cm-content');
        await page.reload();
        await page.waitForSelector('html[data-guard="done"]', { timeout: 90000 });
        const after = await studio();
        expect(after.mode).toBe('source');
        expect(after.source).toContain(`so you never set them yourself. Edited in ${name}.\n\n:::summary`);

        await page.click('#tab-history');
        expect(await page.locator('.st-version').count()).toBeGreaterThan(0);
        await page.click('#library-toggle');
        expect(await page.locator('.st-card').count()).toBe(1);
        // no folder access outside Chrome and Edge: the zip is the way to disk
        expect(await page.locator('.st-library-actions [data-command="folder.open"]').count()).toBe(0);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    }, 180000);
  }
});
