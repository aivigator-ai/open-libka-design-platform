/**
 * Present: the current deck full screen in the Studio's own window, as an audience sees it, and on P the presenter view
 * (notes, the next slide, the timer) in a second window. The deck is the one the Preview shows, fitted as the build
 * fits it. It runs in a frame like the Preview's (the Studio's policy allows no other frame); the presenter view is
 * the same deck opened from a blob: address, which the Studio pairs with the frame (`libkaDeck.link`), so the two
 * windows keep the slide in step as the exported deck's do.
 *
 * Esc ends it (a full-screen exit the browser makes ends it too, unless the presenter view is open: then the author
 * may be moving windows between screens), and the Preview shows the slide it ended on.
 */
import { signal } from '@preact/signals';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { withoutCsp } from '@libka/render/csp';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { registry } from '../state/commands.ts';
import { keysOf, matchesKeys } from '../state/keys.ts';
import { bridge } from './project.ts';

interface Deck { go(n: number): void; readonly current: number; readonly total: number; link(w: Window): void }
type DeckWindow = Window & { libkaDeck?: Deck };

interface Show { html: string; from: number }
/** The presentation running now. */
export const presenting = signal<Show | null>(null);
/** The slide the last presentation ended on: the Preview shows it. */
export const lastShown = signal<number | null>(null);

let popup: DeckWindow | null = null;
let popupUrl = '';
let returnTo: HTMLElement | null = null;
/** A full-screen exit the Studio asked for (F in the deck, or the end): the presentation goes on, or is over already. */
let leaving = false;

const frameWin = (): DeckWindow | null => (document.getElementById('present-frame') as HTMLIFrameElement | null)?.contentWindow as DeckWindow | null;
const previewWin = (): DeckWindow | null => (document.getElementById('preview') as HTMLIFrameElement | null)?.contentWindow as DeckWindow | null;
const deckOf = (w: Window | null): Deck | undefined => { try { return (w as DeckWindow | null)?.libkaDeck; } catch { return undefined; } };

/**
 * The slide that shows a source line: the last slide that starts at or before it. A slide starts at the line of the
 * block that made it (its heading, say); a continuation at its first block; the title slide at the top.
 */
export function slideOfLine(html: string, line: number): number {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let slide = 0;
  doc.querySelectorAll('.lk-deck-frame').forEach((f, i) => {
    const start = Number(f.getAttribute('data-lk-slide-line'))
      || Math.min(...Array.from(f.querySelectorAll('[data-lk-line]'), (e) => Number(e.getAttribute('data-lk-line'))));
    if (i > 0 && start <= line) slide = i;   // (the Notes and References slides at the end start nowhere: Infinity)
  });
  return slide;
}

/**
 * Starts the presentation at a slide (0: the first). Called in the author's press itself: a browser goes full screen
 * or opens a window only then. With the presenter view, the window takes that press, and the deck fills the Studio's
 * window instead (F makes it full screen).
 */
export function present(o: { from?: number; presenter?: boolean } = {}): void {
  if (presenting.value || !s.project.value || !s.deckHtml.value) return;
  const html = withoutCsp(s.deckHtml.value);
  const active = document.activeElement as HTMLElement | null;
  returnTo = active && active !== document.body ? active : null;
  if (o.presenter) openPresenter(html);
  else fullScreen(true);
  presenting.value = { html, from: Math.max(0, o.from ?? 0) };
}

/** Ends the presentation: back where the author was, the Preview on the slide it ended on. */
export function endPresent(): void {
  const show = presenting.value;
  if (!show) return;
  const last = deckOf(frameWin())?.current ?? show.from;
  presenting.value = null;
  if (popup && !popup.closed) popup.close();
  popup = null;
  if (popupUrl) { URL.revokeObjectURL(popupUrl); popupUrl = ''; }
  if (document.fullscreenElement) fullScreen(false);
  lastShown.value = last;
  deckOf(previewWin())?.go(last);
  // the dialog closes now (the rest of the Studio is inert while it is open), then the focus goes back
  (document.getElementById('present') as HTMLDialogElement | null)?.close();
  const back = returnTo;
  returnTo = null;
  // (a menu's item is gone or hidden by now: back to the text)
  if (back?.isConnected && back.checkVisibility?.() !== false) back.focus(); else bridge.editor?.focus();
}

function fullScreen(on: boolean): void {
  if (on) void document.documentElement.requestFullscreen?.().catch(() => { /* not allowed here: the deck fills the window */ });
  else { leaving = true; void document.exitFullscreen().catch(() => { leaving = false; }); }
}

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    if (leaving) { leaving = false; return; }
    // the browser left full screen (Esc): the presentation is over, unless the presenter view is open
    if (presenting.value && !(popup && !popup.closed)) endPresent();
  });
}

/** The presenter view: the same deck in a second window, paired with the deck in the Studio once both have loaded. */
function openPresenter(html: string): void {
  if (popup && !popup.closed) { popup.focus(); return; }
  if (!popupUrl) {
    // (a blob: page resolves nothing against its own address: the fonts and pictures resolve against the Studio's)
    const base = `<base href="${document.baseURI.replace(/"/g, '%22')}">`;
    popupUrl = URL.createObjectURL(new Blob([html.replace(/<head>/i, () => `<head>\n${base}`)], { type: 'text/html' }));
  }
  popup = window.open(`${popupUrl}#presenter`, 'libka-presenter', 'popup,width=1280,height=800') as DeckWindow | null;
  if (!popup) { s.announcement.value = t('present.popupBlocked'); return; }
  pair(popup);
}

function pair(w: DeckWindow, tries = 0): void {
  if (w !== popup || w.closed || !presenting.value && tries > 0) return;
  const a = deckOf(w), b = deckOf(frameWin());
  if (a && b) {
    a.link(frameWin()!);
    b.link(w);
    b.go(b.current);   // the presenter view to the slide shown
    return;
  }
  if (tries < 150) setTimeout(() => pair(w, tries + 1), 100);
}

type Action = 'fullscreen' | 'presenter' | 'start' | 'here';

/**
 * The deck's own full-screen and presenter controls (its buttons, F and P), and Present's keys (F5, Shift+F5), in a
 * deck the Studio shows: in the Preview they start Present from the slide shown (P with the presenter view); while
 * presenting, F toggles full screen and P opens the presenter view. Esc in the deck ends the presentation once the
 * deck has nothing of its own to close.
 */
export function deckControls(win: Window, where: 'preview' | 'present'): void {
  const doc = win.document;
  const shown = () => deckOf(win)?.current ?? 0;
  const run = (what: Action) => {
    if (where === 'preview') present({ from: what === 'start' ? 0 : shown(), presenter: what === 'presenter' });
    else if (what === 'fullscreen') fullScreen(!document.fullscreenElement);
    else if (what === 'presenter') openPresenter(presenting.value!.html);
    // (F5 while presenting: nothing, and no reload)
  };
  doc.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest?.('[data-deck="fullscreen"], [data-deck="presenter"]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    run(b.getAttribute('data-deck') as Action);
  }, true);
  doc.addEventListener('keydown', (e) => {
    const key = (id: string) => { const c = registry.command(id); const k = c && keysOf(c); return Boolean(k && matchesKeys(k, e)); };
    let what: Action | null = key('present.start') ? 'start' : key('present.here') ? 'here' : null;
    if (!what && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')
      && doc.querySelector('.lk-deck')?.getAttribute('data-letters') !== 'off') {
      what = e.key === 'f' || e.key === 'F' ? 'fullscreen' : e.key === 'p' || e.key === 'P' ? 'presenter' : null;
    }
    if (!what) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    run(what);
  }, true);
  if (where === 'present') {
    // after the deck's own handler: Esc closes its overview or notes first
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); endPresent(); } });
  }
}

/** The deck while presenting: the Studio's whole window (full screen when allowed), above everything else. */
export function PresentHost() {
  const show = presenting.value;
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useLayoutEffect(() => {
    if (!show) return;
    const d = dialog.current!, f = frame.current!;
    if (!d.open) d.showModal();
    f.addEventListener('load', () => {
      const win = f.contentWindow as DeckWindow;
      deckOf(win)?.go(show.from);
      // the Studio's End in the deck's bar (on a phone or a touch screen there is no Esc)
      const doc = win.document;
      const end = doc.createElement('button');
      end.type = 'button';
      end.className = 'lk-deck-btn';
      end.id = 'present-end';
      end.append(t('present.end'), ' ');
      end.append(Object.assign(doc.createElement('span'), { className: 'lk-deck-key', textContent: 'Esc' }));
      end.lastElementChild!.setAttribute('aria-hidden', 'true');
      end.addEventListener('click', endPresent);
      doc.querySelector('[data-deck="letters"]')?.after(end);
      deckControls(win, 'present');
      f.focus();
      if (popup && !popup.closed) pair(popup);
      document.documentElement.dataset.present = 'ready';   // for tests and automation
    }, { once: true });
    f.srcdoc = show.html;
    return () => { delete document.documentElement.dataset.present; };
  }, [show]);
  if (!show) return null;
  const title = s.doc.value?.meta.title ?? '';
  return (
    <dialog class="st-present" id="present" ref={dialog} aria-label={t('present.title')}
      onCancel={(e) => { e.preventDefault(); endPresent(); }}>
      <iframe id="present-frame" ref={frame} title={t('present.frame', { title })} />
    </dialog>
  );
}
