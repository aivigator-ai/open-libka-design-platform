/**
 * The frame agent: the functions the Studio runs inside its hidden frames (Guard's scans, settling, slide measuring),
 * loaded into a frame as a file of the Studio's own (assets/frame-agent.js). Under the Studio's Content Security Policy
 * no code is made from text (no eval, no new Function), so the Studio calls these by name: `win.libkaAgent.scanContrast(…)`.
 * They are the same self-contained functions the CLI passes to Chrome, so both apply exactly the same rules.
 */
import { expandPage, scanContrast, scanReflow, scanStructure, settle } from '@libka/guard/scan';
import { measureSlides } from '@libka/render/fit';

/**
 * A frame measures a page as built, as the CLI's fresh Chrome does. A srcdoc frame shares the Studio's origin, so its
 * page would read what readers stored there: a deck's mode, contrast and letter shortcuts (`libka-deck:*`), a page's
 * remembered tab (`libka:tab`). This script loads in the page's head, before the page's own runtime, and gives the
 * frame empty storage of its own for that.
 */
class FrameStorage implements Storage {
  private items = new Map<string, string>();
  get length(): number { return this.items.size; }
  clear(): void { this.items.clear(); }
  getItem(key: string): string | null { return this.items.get(key) ?? null; }
  key(i: number): string | null { return [...this.items.keys()][i] ?? null; }
  removeItem(key: string): void { this.items.delete(key); }
  setItem(key: string, value: string): void { this.items.set(key, String(value)); }
}
// Each step in its own try: a browser that refused one still runs the agent, and says so in the console.
try {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(window, name, { value: new FrameStorage(), configurable: true });
  }
} catch (e) { console.warn('LibKa Studio: a checking frame keeps the browser\'s storage', e); }
// The system's contrast setting, which a deck's runtime reads to press its C button: the CLI's Chrome asks for more
// contrast only in its more-contrast passes, which frames.ts marks (forceHighContrast) and loads with the page's own
// rules applied; anywhere else the answer is no (frames.ts takes the same setting out of the page's CSS).
// The queries are answered as the CLI's Chrome answers them: more contrast only where marked, no other contrast
// preference, and no forced colours.
try {
  const matchMedia = window.matchMedia.bind(window);
  const more = () => document.querySelector('meta[name="libka-frame-contrast"]') !== null;
  const asCli = (query: string): string => {
    const q = query.replace(/\s+/g, '').toLowerCase();
    if (q === '(prefers-contrast:more)') return more() ? 'all' : 'not all';
    if (q === '(prefers-contrast:no-preference)') return more() ? 'not all' : 'all';
    if (q === '(forced-colors:active)' || q === '(prefers-contrast:less)' || q === '(prefers-contrast:custom)') return 'not all';
    if (q === '(forced-colors:none)') return 'all';
    return query;
  };
  window.matchMedia = (query: string) => matchMedia(asCli(query));
} catch (e) { console.warn('LibKa Studio: a checking frame keeps the system\'s contrast setting', e); }
// And the system's forced colours (a Windows contrast theme), which the CLI's Chrome never has: the page's own colours
// are measured and drawn. On every element and with priority, so it holds where the Word file's pictures serialise the
// page into an SVG (whose :root is not the page's) and over the page's own rules (LibKa's set none; only a page rule
// of its own with !important on a more specific selector would bring forcing back).
try {
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { forced-color-adjust: none !important; }';
  document.head.append(style);
} catch (e) { console.warn('LibKa Studio: a checking frame keeps the system\'s forced colours', e); }

const agent = {
  settle,
  expandPage,
  scanContrast,
  scanStructure,
  scanReflow,
  measureSlides: () => measureSlides(document),
};

export type FrameAgent = typeof agent;
(window as unknown as { libkaAgent: FrameAgent }).libkaAgent = agent;
