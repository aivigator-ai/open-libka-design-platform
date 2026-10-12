/**
 * The Studio with a real screen reader: NVDA (Guidepup's portable copy, set up by `node scripts/screen-reader-setup.mjs`,
 * silent) listens while Chrome runs the Studio, and each flow is checked by what NVDA says: the Studio's own names,
 * labels and announcements, in English and in Czech. NVDA's own words (roles such as "dialog") follow NVDA's language,
 * so they are not asserted. Keys go through NVDA (real key presses, as a user's would): Guidepup records the speech that
 * follows its own actions; Playwright only sets things up.
 *
 * NVDA takes over the keyboard and Chrome runs in a window while this runs, so it runs only when asked for:
 * LIBKA_SCREEN_READER=1 npx vitest run test/screen-reader.test.ts (on Windows, with nobody using the machine).
 */
/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveStatic, type Served } from '@libka/cli/src/serve.ts';
import { STRINGS, type Key, type Lang } from '../src/i18n.ts';

const here = dirname(fileURLToPath(import.meta.url));
const wanted = process.env.LIBKA_SCREEN_READER === '1' && process.platform === 'win32';

type Nvda = {
  start(options?: { capture?: 'initial' | 'all' }): Promise<void>; stop(): Promise<void>;
  press(keys: string): Promise<void>; type(text: string): Promise<void>;
  perform(command: unknown): Promise<void>; keyboardCommands: Record<string, unknown>;
  spokenPhraseLog(): Promise<string[]>; clearSpokenPhraseLog(): Promise<void>;
};
let nvda: Nvda;
let browser: Browser;
let served: Served;

const say = (lang: Lang, key: Key, vars: Record<string, string | number> = {}) =>
  STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

/** Whether NVDA said a text: NVDA splits words at capitals ("Lib Ka"), so spaces and case do not count. */
const said = (spoken: string, text: string) => expect(spoken.replace(/\s+/g, '').toLowerCase(), spoken).toContain(text.replace(/\s+/g, '').toLowerCase());

/**
 * What NVDA said after an action of its own (a key press, a command), once it has gone quiet: a live region's polite
 * announcement comes after what NVDA says about the focus, sometimes after Guidepup's own capture has ended.
 */
async function heard(action: () => Promise<unknown>): Promise<string> {
  await nvda.clearSpokenPhraseLog();
  await action();
  let log = await nvda.spokenPhraseLog();
  for (let quiet = 0, waited = 0; quiet < 3 && waited < 20; waited++) {
    await new Promise((r) => setTimeout(r, 250));
    const now = await nvda.spokenPhraseLog();
    quiet = now.length === log.length ? quiet + 1 : 0;
    log = now;
  }
  return log.join(' | ');
}
/** What NVDA says when asked about the focused element (NVDA+Tab). */
const focusSpoken = () => heard(() => nvda.perform(nvda.keyboardCommands.reportCurrentFocus));
/**
 * Whether NVDA names the focus with a text, asked up to five times: Guidepup's keys toggle Num Lock, and a keyboard
 * utility's on-screen display can hold the focus for a moment (NVDA then names that window).
 */
async function focusSays(page: Page, text: string): Promise<void> {
  let spoken = '';
  for (let i = 0; i < 5; i++) {
    spoken = await focusSpoken();
    if (spoken.replace(/\s+/g, '').toLowerCase().includes(text.replace(/\s+/g, '').toLowerCase())) break;
    // the display goes away; Chrome is brought back to the front when the display kept the focus
    await new Promise((r) => setTimeout(r, 1500));
    await page.bringToFront();
    await new Promise((r) => setTimeout(r, 1000));
  }
  said(spoken, text);
}

async function open(lang: Lang): Promise<Page> {
  const ctx = await browser.newContext({ viewport: null });
  await ctx.addInitScript((l) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('libka-studio:lang', l);
    localStorage.setItem('libka-studio:editor', JSON.stringify({ defaultMode: 'visual' }));
  }, lang);
  const page = await ctx.newPage();
  await page.bringToFront();
  return page;
}
const placeCaret = (page: Page, text: string) =>
  page.evaluate((t) => (window as unknown as { libkaStudio: { placeCaret(t: string): boolean } }).libkaStudio.placeCaret(t), text);

describe.skipIf(!wanted)('LibKa Studio with NVDA', () => {
  beforeAll(async () => {
    served = await serveStatic(join(here, '..', 'dist'));
    const { chromium } = await import('playwright-core');
    // a real window (NVDA reads what Windows shows), with the accessibility tree always on
    browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--force-renderer-accessibility', '--start-maximized'] });
    ({ nvda } = (await import('@guidepup/guidepup')) as unknown as { nvda: Nvda });
    await nvda.start({ capture: 'all' });   // everything NVDA says after an action, not only its first phrase
  }, 120000);
  afterAll(async () => {
    try { await nvda?.stop(); } finally {
      await browser?.close();
      await served?.close();
      // NVDA must not stay running and holding the keyboard: Guidepup asks it to quit, and once it was seen still
      // running minutes later, so its copy is asked again until it has gone (never an NVDA of the machine's own)
      for (let i = 0; i < 30; i++) {
        const left = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "Name='nvda.exe'").ExecutablePath`], { encoding: 'utf8' })
          .split(/\r?\n/).filter((p) => /guidepup/i.test(p));
        if (!left.length) break;
        if (i % 10 === 5) for (const p of left) execFileSync(p, ['-q']);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }, 60000);

  for (const lang of ['en', 'cs'] as const) {
    it(`speaks the Studio in ${lang === 'en' ? 'English' : 'Czech'}: the tour, the editor, moving a block, the "/" menu, tabs, the palette, a dialog`, async () => {
      const page = await open(lang);
      await page.goto(served.url);
      await page.waitForSelector('#st-tour');
      await page.waitForFunction(() => document.activeElement?.id === 'st-tour-title');
      // the tour's heading has the focus on the first visit
      await focusSays(page, say(lang, 'tour.welcome'));
      // Escape ends it; the focus goes to the editor, named
      said(await heard(() => nvda.press('Escape')), say(lang, 'editor.labelVisual'));
      await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
      // focus mode set by hand (NVDA+Space), as the Studio's accessibility statement (Help) tells NVDA users: in the focus mode NVDA switches
      // on by itself, Escape is NVDA's own key back to browse mode and never reaches the editor
      // (NVDA's own words, "focus mode", are those of an English NVDA)
      for (let i = 0; i < 2 && !/focus mode/i.test(await heard(() => nvda.perform(nvda.keyboardCommands.toggleBetweenBrowseAndFocusMode))); i++);

      // a block selected and moved: the move is announced with the block's name and place
      await placeCaret(page, 'Install the workspace once');
      await page.waitForTimeout(300);
      await nvda.press('Escape');
      await nvda.press('Escape');
      expect(await page.locator('.ProseMirror-selectednode').count()).toBe(1);
      expect(await heard(() => nvda.press('Control+Shift+ArrowUp'))).toMatch(lang === 'en' ? /moved to position \d+ of \d+/ : /Posunuto: .+ na pozici \d+ z \d+/);
      await nvda.press('Control+z');

      // the "/" menu: a combobox named for searching blocks
      await placeCaret(page, 'so you never set them yourself');
      await page.waitForTimeout(300);
      await nvda.press('Enter');
      // (names are checked by asking NVDA for the focus: Guidepup's keys toggle Num Lock, and a keyboard utility's
      // on-screen display can take the focus for a moment and cut NVDA short)
      await page.keyboard.type('/');
      await page.waitForSelector('#st-insert');
      await focusSays(page, say(lang, 'insert.search'));
      await nvda.press('Escape');
      await nvda.press('Backspace');

      // a tab of the side panel, by its name
      await page.click('#tab-inspector');
      await focusSays(page, say(lang, 'panel.inspector'));

      // the command palette: its search field is named; its results are counted as they change
      await nvda.press('F1');
      await page.waitForSelector('.st-cmdk-input');
      await focusSays(page, say(lang, 'cmdk.search'));
      const word = lang === 'en' ? 'preferences' : 'předvolby';
      await page.keyboard.type(word.slice(0, -1));
      expect(await heard(() => nvda.type(word.slice(-1)))).toMatch(lang === 'en' ? /Results: \d+/ : /Výsledků: \d+/);
      // a dialog, by its name
      // (a second try when a keyboard utility's on-screen display took the focus in between and NVDA spoke the
      // window again instead: Chrome's own tree names the dialog either way)
      let spoken = await heard(() => nvda.press('Enter'));
      if (/window/.test(spoken) && !spoken.replace(/\s+/g, '').toLowerCase().includes(say(lang, 'prefs.title').replace(/\s+/g, '').toLowerCase())) {
        await nvda.press('Escape');
        await page.waitForSelector('.st-dialog--prefs', { state: 'detached' });
        await nvda.press('F1');
        await page.waitForSelector('.st-cmdk-input');
        await page.keyboard.type(word);
        spoken = await heard(() => nvda.press('Enter'));
      }
      said(spoken, say(lang, 'prefs.title'));
      await nvda.press('Escape');
      await page.context().close();
    }, 240000);
  }
});
