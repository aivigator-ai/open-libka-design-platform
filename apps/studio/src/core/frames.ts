/** Hidden frames: the Studio loads rendered pages into them to measure, check and draw, as the CLI does in Chrome. */
import { withoutCsp } from '@libka/render/csp';
import type { FrameAgent } from '../frame-agent.ts';

export type FrameId = 'guard-frame' | 'fit-frame' | 'docx-frame';
export const frame = (id: FrameId): HTMLIFrameElement => document.getElementById(id) as HTMLIFrameElement;

/**
 * Loads a page into a frame with the frame agent (and axe-core for Guard), and waits for its fonts and transitions; a
 * deck shows every slide unless asked not to. The page runs under the Studio's policy (a srcdoc frame takes it over),
 * which allows the agent and axe as the Studio's own files; the page's own policy is for the exports.
 */
export function load(f: HTMLIFrameElement, html: string, o: { showAll?: boolean; axe?: boolean } = {}): Promise<Window> {
  const scripts = `<script src="assets/frame-agent.js"></script>${o.axe ? '<script src="assets/axe.min.js"></script>' : ''}`;
  return new Promise((resolve, reject) => {
    f.addEventListener('load', async () => {
      try {
        const win = f.contentWindow! as Window & { libkaDeck?: { showAll(): void } };
        // (the page saw empty storage of its own, so a reader's stored choices never reach it: frame-agent.ts)
        await win.document.fonts.ready;
        if (o.showAll ?? true) win.libkaDeck?.showAll();   // a deck: check every slide, as the CLI does
        await agent(win).settle();
        resolve(win);
      } catch (e) { reject(e); }
    }, { once: true });
    // as built, whatever the Studio's own system asks for: a page's more-contrast rules apply only where Guard forces
    // them (forceHighContrast, which has already replaced these), as the CLI's Chrome asks for them only then
    const asBuilt = inStyles(html, '@media not all');
    f.srcdoc = withoutCsp(asBuilt).replace('</head>', () => `${scripts}\n</head>`);
  });
}

/** The frame agent of a loaded frame: Guard's scans and slide measuring, called by name (no code made from text). */
export function agent(win: Window): FrameAgent {
  const a = (win as unknown as { libkaAgent?: FrameAgent }).libkaAgent;
  if (!a) throw new Error('LibKa Studio: the frame agent did not load (assets/frame-agent.js)');
  return a;
}

/**
 * The page's more-contrast rules (`@media (prefers-contrast: more)`) turned into `media`, in its style elements only:
 * a document that shows that line as text (in code) keeps it.
 */
function inStyles(html: string, media: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (style) => style.replaceAll('@media (prefers-contrast: more)', media));
}

/**
 * What a reader whose system asks for more contrast gets: the page's own high-contrast rules, applied, and the page
 * told so (the frame agent then answers yes to prefers-contrast: more, as the CLI's Chrome does in that pass, so a
 * deck's C button shows pressed there too).
 */
export const forceHighContrast = (html: string): string =>
  inStyles(html, '@media all').replace('<head>', '<head>\n<meta name="libka-frame-contrast" content="more">');
