/**
 * Determinism across engines: the solver's arithmetic uses only operations ECMAScript specifies exactly, so a seeded
 * corpus of brands solves to the same palettes, byte for byte, in Node, in Chrome and in Firefox. The corpus runs in
 * each browser from an esbuild bundle of the package; a browser that is not installed is skipped with a message
 * (CI sets LIBKA_REQUIRE_BROWSERS=1, where a missing Firefox fails).
 *
 * Also here: the package stays browser-safe (no Node API in src/ but the lock writer).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, type Browser } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { corpusDigest } from './corpus.ts';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');

describe('browser-safe', () => {
  it('src/ uses no Node API (build-locks.ts, the lock writer, is the one Node script)', () => {
    for (const f of readdirSync(src).filter((f) => f.endsWith('.ts') && f !== 'build-locks.ts')) {
      const text = readFileSync(join(src, f), 'utf8');
      expect(text, f).not.toMatch(/from 'node:|\bprocess\.|\brequire\(/);
    }
  });
  it('uses no Math.pow, cbrt, exp, log or trigonometry in the colour arithmetic', () => {
    for (const f of ['color.ts', 'gates.ts', 'solver.ts']) {
      const code = readFileSync(join(src, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.(pow|cbrt|exp|log\w*|sin|cos|tan|a?tan2|acos|asin|hypot)\b|\*\*/);
    }
  });
});

async function bundle(): Promise<string> {
  const out = await build({ entryPoints: [join(here, 'corpus.ts')], bundle: true, format: 'iife', globalName: 'libkaCorpus', write: false, platform: 'browser', target: 'es2022' });
  return out.outputFiles[0]!.text;
}

async function inBrowser(browser: Browser, code: string): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.addScriptTag({ content: code });
    return await page.evaluate(() => (globalThis as unknown as { libkaCorpus: { corpusDigest(): string } }).libkaCorpus.corpusDigest());
  } finally {
    await page.close();
  }
}

const firefoxInstalled = (() => { try { return existsSync(firefox.executablePath()); } catch { return false; } })();
if (!firefoxInstalled) console.warn('LibKa design: Firefox is not installed for Playwright, so its determinism test is skipped (npx playwright-core install firefox)');

describe('the same palettes in every engine', { timeout: 120000 }, () => {
  const node = corpusDigest();

  // the installed Chrome (or LIBKA_BROWSER), as Guard uses it; one that cannot start is reported and skipped
  it('Chrome solves the corpus to the same bytes as Node', async () => {
    const executablePath = process.env.LIBKA_BROWSER;
    let browser: Browser;
    try {
      browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
    } catch (e) {
      console.warn(`LibKa design: Chrome could not start, so its determinism test is skipped (${(e as Error).message.split('\n')[0]})`);
      return;
    }
    try { expect(await inBrowser(browser, await bundle())).toBe(node); } finally { await browser.close(); }
  });
  it.runIf(process.env.LIBKA_REQUIRE_BROWSERS === '1')('has Firefox installed for Playwright', () => expect(firefoxInstalled).toBe(true));
  it.skipIf(!firefoxInstalled)('Firefox solves the corpus to the same bytes as Node', async () => {
    const browser = await firefox.launch();
    try { expect(await inBrowser(browser, await bundle())).toBe(node); } finally { await browser.close(); }
  });
});
