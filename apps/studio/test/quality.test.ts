/**
 * Quality in Chrome: the Studio under its own Content Security Policy (nothing blocked through a whole workflow,
 * the policy in the page and from `libka studio`), forced colours (Guard on the views, states that stay visible), and
 * touch (handles shown without hover, taps, a long press for a block's menu) on a tablet and a phone.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContextOptions, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveStatic, type Served } from '@libka/cli/src/serve.ts';
import { guardPage, launchBrowser, type GuardReport } from '@libka/guard';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

let browser: Browser;
let served: Served;
type Studio = { source: string; selection: string; checks: { violations: unknown[] }[] | null; placeCaret(text: string, where?: string): boolean };

async function open(options: BrowserContextOptions = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true, ...options });
  await ctx.addInitScript(() => {
    localStorage.setItem('libka-studio:toured', '1');
    // every policy violation, in the Studio and in its frames, is collected on the Studio's window
    document.addEventListener('securitypolicyviolation', (e) => {
      const top = window.top as unknown as { violations?: string[] };
      (top.violations ??= []).push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
  const page = await ctx.newPage();
  await page.goto(served.url);
  await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
  return page;
}
const studio = (page: Page) => page.evaluate(() => {
  const h = (window as unknown as { libkaStudio: Studio }).libkaStudio;
  return { source: h.source, selection: h.selection, checks: h.checks };
});
const findings = (report: GuardReport) => report.checks.flatMap((c) => c.violations).filter((v) => !(v.rule === 'no-inline-style' && /\.cm-/.test(v.target)));

describe.skipIf(!chrome)('LibKa Studio: policy, forced colours, touch', () => {
  beforeAll(async () => {
    served = await serveStatic(join(here, '..', 'dist'));
    browser = await launchBrowser();
  }, 60000);
  afterAll(async () => {
    await browser?.close();
    await served?.close();
  });

  it('runs under its own strict policy: nothing is blocked through a whole workflow', async () => {
    const res = await fetch(served.url);
    const header = res.headers.get('content-security-policy') ?? '';
    expect(header).toMatch(/^default-src 'self'; script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+; style-src/);
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).not.toContain('unsafe-eval');
    expect(header).not.toMatch(/script-src[^;]*unsafe-inline/);
    const html = await res.text();
    expect(html).toContain('<meta http-equiv="Content-Security-Policy"');

    const page = await open();
    // the checks ran in their frames (the frame agent and axe are the Studio's own files)
    const checks = (await studio(page)).checks!;
    expect(checks.length).toBe(9);
    expect(checks.every((c) => c.violations.length === 0)).toBe(true);
    // slides, a Word file, a diagram typed in, Split, the palette, the tutorial (a picture), Czech
    await page.click('[data-device="slides"]');
    await page.waitForTimeout(1000);
    await page.click('#file-menu summary');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-command="export.docx"]')]);
    expect(download.suggestedFilename()).toBe('guide.docx');
    await page.click('.st-mode [data-mode="source"]');
    await page.click('.cm-content');
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('```mermaid\naccTitle: Flow\naccDescr: A goes to B.\nflowchart LR\n  A --> B\n```\n');
    await page.waitForFunction(() => document.documentElement.dataset.guard !== 'done', null, { timeout: 10000 });
    await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
    expect(await page.evaluate(() => (document.getElementById('preview') as HTMLIFrameElement).contentDocument?.querySelectorAll('svg').length)).toBeGreaterThan(0);
    await page.keyboard.press('F1');
    await page.keyboard.type('split');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.st-split');
    await page.click('#help-menu summary');
    await page.click('[data-command="tutorial.open"]');
    await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
    await page.click('button[data-lang="cs"]');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { violations?: string[] }).violations ?? [])).toEqual([]);
    await page.context().close();
  }, 180000);

  it('keeps every state visible in forced colours, and passes Guard there (light and dark)', async () => {
    for (const colorScheme of ['light', 'dark'] as const) {
      const page = await open({ forcedColors: 'active', colorScheme });
      // pressed toggles and the selected tab use the system's Highlight colours
      const pressed = await page.evaluate(() => {
        const b = document.querySelector('.st-mode [aria-pressed="true"]')!;
        const plain = document.querySelector('.st-mode [aria-pressed="false"]')!;
        return [getComputedStyle(b).backgroundColor, getComputedStyle(plain).backgroundColor];
      });
      expect(pressed[0]).not.toBe(pressed[1]);
      await page.keyboard.press('F1');
      await page.keyboard.type('ch');
      const option = await page.evaluate(() => getComputedStyle(document.querySelector('.st-cmdk-opt[aria-selected="true"]')!).backgroundColor);
      const other = await page.evaluate(() => getComputedStyle(document.querySelector('.st-cmdk-opt[aria-selected="false"]')!).backgroundColor);
      expect(option).not.toBe(other);
      expect(findings(await guardPage(page)).map((v) => `${colorScheme} palette: ${v.rule} ${v.target}`)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog', { state: 'detached' });
      expect(findings(await guardPage(page)).map((v) => `${colorScheme} editor: ${v.rule} ${v.target}`)).toEqual([]);
      await page.context().close();
    }
  }, 180000);

  it('gives every text field a boundary of 3:1 (WCAG 1.4.11), in light, dark and high contrast', async () => {
    for (const [colorScheme, contrast] of [['light', 'no-preference'], ['dark', 'no-preference'], ['light', 'more'], ['dark', 'more']] as const) {
      const page = await open({ colorScheme, contrast });
      const low: string[] = [];
      const measure = async (view: string) => {
        low.push(...(await page.evaluate(() => {
          const parse = (c: string) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]; };
          const lum = (rgb: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]!) + 0.7152 * f(rgb[1]!) + 0.0722 * f(rgb[2]!); };
          const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          const over = (t: number[], u: number[]) => [0, 1, 2].map((i) => t[i]! * t[3]! + u[i]! * (1 - t[3]!));
          const bgOf = (el: Element | null) => {
            const layers: number[][] = [];
            for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3]! > 0) { layers.push(c); if (c[3]! >= 1) break; } }
            let base = [255, 255, 255];
            for (const l of layers.reverse()) base = over(l, base);
            return base;
          };
          const out: string[] = [];
          for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')) {
            if (!el.checkVisibility() || el.getBoundingClientRect().width < 2) continue;
            const cs = getComputedStyle(el);
            const border = parse(cs.borderTopColor);
            const own = bgOf(el), around = bgOf(el.parentElement);
            const b = parseFloat(cs.borderTopWidth) > 0 && border && border[3]! > 0 ? ratio(over(border, own), around) : 0;
            const best = Math.max(b, ratio(own, around));
            if (best < 3) out.push(`${el.tagName.toLowerCase()}#${el.id || el.className}: ${best.toFixed(2)}:1`);
          }
          return out;
        })).map((x) => `${colorScheme}/${contrast} ${view}: ${x}`));
      };
      await measure('editor');
      await page.evaluate(() => (window as unknown as { libkaStudio: Studio }).libkaStudio.placeCaret('Install the workspace once'));
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.click('#tab-inspector');
      await measure('inspector');
      await page.keyboard.press('F1');
      await page.waitForSelector('.st-cmdk-input');
      await measure('palette');
      await page.keyboard.type('preferences');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.st-dialog--prefs[open]');
      await measure('preferences');
      expect(low).toEqual([]);
      await page.context().close();
    }
  }, 240000);

  it('shows the accessibility statement from Help, in both languages, and it passes Guard', async () => {
    const page = await open();
    for (const lang of ['en', 'cs'] as const) {
      await page.click(`button[data-lang="${lang}"]`);
      await page.click('#help-menu summary');
      await page.click('[data-command="a11y.open"]');
      await page.waitForSelector('.st-dialog--accessibility[open]');
      const text = await page.textContent('.st-a11y');
      expect(text).toMatch(lang === 'en' ? /found 45 of the 45 criteria that apply met; 10 do not apply/ : /splněných 45 z 45 kritérií/);
      expect(findings(await guardPage(page)).map((v) => `${lang}: ${v.rule} ${v.target} ${v.message}`)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog', { state: 'detached' });
    }
    await page.context().close();
  }, 120000);

  it('says what it is under Help → About: the licence, the third-party notices (served), and that documents stay here; it passes Guard', async () => {
    const page = await open();
    for (const lang of ['en', 'cs'] as const) {
      await page.click(`button[data-lang="${lang}"]`);
      await page.click('#help-menu summary');
      await page.click('[data-command="about.open"]');
      await page.waitForSelector('.st-dialog--about[open]');
      const text = await page.textContent('.st-about');
      expect(text).toMatch(lang === 'en' ? /Apache License 2\.0[\s\S]*sends none of your text or pictures anywhere[\s\S]*no analytics/ : /Apache 2\.0[\s\S]*nikam neposílá váš text ani obrázky/);
      // an ordinary build provides no hosted copy's links
      expect(await page.locator('.st-about h3').count()).toBe(1);
      const notices = await page.getAttribute('.st-about a[href="THIRD-PARTY-NOTICES.txt"]', 'href');
      const response = await page.request.get(new URL(notices!, served.url).href);
      expect(response.status()).toBe(200);
      expect(await response.text()).toMatch(/^LibKa Studio includes the following third-party software/);
      expect(findings(await guardPage(page)).map((v) => `${lang}: ${v.rule} ${v.target} ${v.message}`)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog', { state: 'detached' });
    }
    await page.context().close();
  }, 120000);

  it('names the window after the document and reads the document text in its own language (WCAG 2.4.2, 3.1.2)', async () => {
    const page = await open();
    await page.waitForFunction(() => document.title === 'Writing a LibKa manual – LibKa Studio');
    await page.waitForFunction(() => document.querySelector('.ed-root')?.getAttribute('lang') === 'en');
    // a Czech document in the English interface: its text is Czech, the editor's own words stay English
    await page.click('button[data-lang="cs"]');
    await page.click('#help-menu summary');
    await page.click('[data-command="tutorial.open"]');
    await page.waitForFunction(() => document.title === 'Můj první dokument v LibKa – LibKa Studio');
    await page.click('button[data-lang="en"]');
    // the document's text was Czech before the click too: wait for the interface's switch, not only for that
    await page.waitForFunction(() => document.documentElement.lang === 'en' && document.querySelector('.ed-handles')?.getAttribute('lang') === 'en');
    expect(await page.getAttribute('.ed-root', 'lang')).toBe('cs');
    await page.click('#library-toggle');
    await page.waitForFunction(() => document.title === 'LibKa Studio');
    await page.context().close();
  }, 90000);

  it('names every labelled control with its visible text (WCAG 2.5.3)', async () => {
    const page = await open();
    const views: [string, () => Promise<unknown>][] = [
      ['editor', async () => {}],
      ['inspector', async () => { await page.evaluate(() => (window as unknown as { libkaStudio: Studio }).libkaStudio.placeCaret('Install the workspace once')); await page.keyboard.press('Escape'); await page.click('#tab-inspector'); }],
      ['palette', async () => { await page.keyboard.press('F1'); await page.waitForSelector('.st-cmdk-input'); }],
    ];
    const wrong: string[] = [];
    for (const [view, go] of views) {
      await go();
      wrong.push(...(await page.evaluate(() => [...document.querySelectorAll('button[aria-label], a[aria-label], input[aria-label], select[aria-label], summary[aria-label], [role=tab][aria-label], [role=option][aria-label], [role=menuitem][aria-label], [role=treeitem][aria-label], [role=switch][aria-label]')].filter((el) => el.checkVisibility()).flatMap((el) => {
        // the visible text: the element's text without what is hidden from sight (screen-reader-only words)
        const visible = [...el.querySelectorAll('*')].reduce((s, n) => (n.checkVisibility() && (n as HTMLElement).offsetWidth > 1 ? s : s.replace(n.textContent ?? '', '')), el.textContent ?? '').trim();
        if (!visible || visible.length < 2 || !/\p{L}/u.test(visible)) return [];
        const name = el.getAttribute('aria-label')!.toLowerCase();
        return name.includes(visible.toLowerCase()) ? [] : [`${el.tagName.toLowerCase()}: name "${name}", visible "${visible}"`];
      }))).map((x) => `${view}: ${x}`));
    }
    expect(wrong).toEqual([]);
    await page.context().close();
  }, 90000);

  it('reflows at 320 px wide without scrolling sideways (WCAG 1.4.10), in the library and the editor', async () => {
    const page = await open({ viewport: { width: 320, height: 640 } });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.click('#library-toggle');
    await page.waitForSelector('#library-title');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.context().close();
  }, 90000);

  it('keeps every label whole with more text spacing (WCAG 1.4.12)', async () => {
    const page = await open();
    await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
    await page.waitForTimeout(300);
    const cut = await page.evaluate(() => [...document.querySelectorAll('button, [role="tab"], summary, label, .st-insp-heading, h2, h3')]
      .filter((el) => el.checkVisibility() && el.textContent?.trim())
      .filter((el) => { const cs = getComputedStyle(el); return (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1; })
      .map((el) => `${el.tagName.toLowerCase()} "${el.textContent!.trim().slice(0, 30)}"`));
    expect(cut).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1600);
    await page.context().close();
  }, 90000);

  it('never hides the focused control behind something else while tabbing through (WCAG 2.4.11)', async () => {
    const page = await open();
    const hidden: string[] = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const rect = el.getBoundingClientRect();
        const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}"`;
        if (rect.width === 0 || rect.height === 0) return `${name}: no size`;
        // some point of it shows: its centre or a corner is the element itself (or inside it)
        const points = [[rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + 2, rect.top + 2], [rect.right - 2, rect.bottom - 2]];
        const seen = points.some(([x, y]) => { const at = document.elementFromPoint(x!, y!); return at && (at === el || el.contains(at) || at.contains(el)); });
        // inside a frame (the preview) the frame itself is what the Studio shows
        return seen || el.tagName === 'IFRAME' ? null : `${name}: covered`;
      });
      if (r) hidden.push(r);
    }
    expect(hidden).toEqual([]);
    await page.context().close();
  }, 120000);

  for (const [name, viewport, isMobile] of [['tablet', { width: 1024, height: 768 }, false], ['phone', { width: 390, height: 844 }, true]] as const) {
    it(`works by touch on a ${name}: handles shown, tapped, a long press opens a block's menu`, async () => {
      const page = await open({ viewport, hasTouch: true, isMobile });
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ed-handles')!).opacity)).toBe('1');
      await page.locator('.ed-plus').nth(3).tap();
      await page.waitForSelector('#st-insert');
      await page.keyboard.press('Escape');
      await page.locator('.ed-grip').nth(3).tap();
      await page.waitForSelector('#st-blockmenu');
      await page.keyboard.press('Escape');
      const p = page.locator('.ed-root p').first();
      await p.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(200);
      const box = (await p.boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 40, y: box.y + 10 }] });
      // hold until the menu opens, as a person does: on a loaded machine the press timer can fire after a fixed wait
      await page.waitForSelector('#st-blockmenu [role="menuitem"]', { timeout: 10000 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      expect(await page.locator('#st-blockmenu [role="menuitem"]').count()).toBeGreaterThan(5);
      expect((await studio(page)).selection).toMatch(/^You write a manual/);
      await page.context().close();
    }, 90000);
  }
});
