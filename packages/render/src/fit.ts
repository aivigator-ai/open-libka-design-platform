/**
 * Slide fitting shared by the build (Chrome) and the Studio (the author's browser): measure the slides of a
 * rendered deck, then decide the next layout. Repeat until nothing changes: a slide that overflows a little is
 * shrunk (95, 90 or 85%), one that needs more is continued on a new slide between blocks, and a block that alone
 * is too tall continues item by item. A block that cannot be split stays as it is, and Guard reports it.
 */
import { expandBody, FIT_LEVELS, isSplittable, itemCount, type DeckLayout, type Slide } from './deck.ts';

/** One slide as measured, in slide pixels (1280×720 canvas). */
export interface SlideFit { base: number; part: number; blocks: number; over: number; available: number; content: number; bottoms: number[]; items: number[] }

/**
 * Runs in the deck's document (serialised into the build's Chrome page, called directly in the Studio's frame):
 * how far each slide overflows, the room its body has, and where its blocks and its first block's items end.
 */
export function measureSlides(doc: Document): SlideFit[] {
  return [...doc.querySelectorAll<HTMLElement>('.lk-deck-frame[data-base]')].flatMap((frame) => {
    const slide = frame.querySelector<HTMLElement>(':scope > .lk-slide');
    const body = slide?.querySelector<HTMLElement>(':scope > .lk-slide-body');
    if (!slide || !body) return [];
    const box = slide.getBoundingClientRect();
    const scale = slide.offsetWidth ? box.width / slide.offsetWidth : 1;
    const cs = doc.defaultView!.getComputedStyle(slide);
    const bottom = box.top + (slide.clientTop + slide.clientHeight - parseFloat(cs.paddingBottom)) * scale;
    const top = body.getBoundingClientRect().top;
    let lowest = top;
    slide.querySelectorAll('*').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.height) lowest = Math.max(lowest, r.bottom); });
    let content = 0;
    body.querySelectorAll('*').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.height) content = Math.max(content, r.bottom - top); });
    const f = body.children[0];
    const items = !f ? [] : f.matches('ol, ul') ? f.querySelectorAll(':scope > li') : f.matches('dl') ? f.querySelectorAll(':scope > div')
      : f.querySelector('tbody') ? f.querySelectorAll('tbody > tr') : f.matches('figure') && f.querySelector(':scope > dl') ? f.querySelectorAll(':scope > dl > div')
      : f.matches('.lk-accordion') ? f.querySelectorAll(':scope > details') : f.matches('.lk-toc') ? f.querySelectorAll(':scope > ol > li') : [];
    return [{
      base: Number(frame.dataset.base), part: Number(frame.dataset.part), blocks: Number(frame.dataset.blocks),
      over: (lowest - bottom) / scale, available: (bottom - top) / scale, content: content / scale,
      bottoms: [...body.children].map((c) => (c.getBoundingClientRect().bottom - top) / scale),
      items: [...items].map((e) => (e.getBoundingClientRect().bottom - top) / scale),
    }];
  });
}

/** A layout being fitted: the same shape as DeckLayout, but mutable. */
export interface Fitting { breaks: Record<number, number[]>; fit: Record<string, number>; items: Record<string, number[]>; open: Record<string, number[]> }
export const emptyFitting = (): Fitting => ({ breaks: {}, fit: {}, items: {}, open: {} });

/** One fitting step: updates the layout from the measurements and says whether anything changed. */
export function fitStep(base: Slide[], layout: Fitting, measured: SlideFit[]): boolean {
  const { breaks, fit, items, open } = layout;
  const reset = (b: number) => {   // part and piece numbers shift: measure this slide again from scratch
    delete breaks[b];
    for (const f of Object.keys(fit)) if (f.startsWith(`${b}.`)) delete fit[f];
  };
  let changed = false;
  const touched = new Set<number>();   // slides laid out anew this round: their other parts were measured before the change
  for (const s of measured) {
    if (touched.has(s.base) || s.over <= 1 || s.bottoms.length !== s.blocks) continue;
    const key = `${s.base}.${s.part}`;
    const current = fit[key] ?? 100;
    const level = FIT_LEVELS.find((l) => l < current && (s.content / (current / 100)) * (l / 100) <= s.available);
    if (level) { fit[key] = level; changed = true; continue; }
    const start = s.part === 0 ? 0 : breaks[s.base]![s.part - 1]!;
    const pieces = expandBody(base[s.base]!.body, s.base, items, open);
    const full = (b: number) => b / (current / 100);   // measured at the current shrink level, compared at full size
    if (full(s.bottoms[0]!) <= s.available) {
      // continue on new slides: as many whole blocks on each as fit at full size, all breaks at once
      const cuts = slices(s.bottoms.map(full), s.available)
        // an opened question's subheading goes with its answer, not alone at the bottom of a slide
        .map((c, i, all) => (c - 1 > (all[i - 1] ?? 0) && pieces[start + c - 1]?.block.type === 'heading' ? c - 1 : c));
      if (!cuts.length) continue;
      breaks[s.base] = [...new Set([...(breaks[s.base] ?? []), ...cuts.map((c) => start + c)])].sort((a, b) => a - b);
      for (const f of Object.keys(fit)) if (f.startsWith(`${s.base}.`)) delete fit[f];
      touched.add(s.base);
      changed = true;
      continue;
    }
    // the first block alone is too tall: continue its items (steps, rows, terms ...) on the next slides
    const piece = pieces[start];
    const m = s.items.filter((b) => full(b) <= s.available).length;
    if (piece?.block.type === 'accordion' && m === 0 && s.items.length === itemCount(piece.block)) {
      // its first question alone is taller than a slide: open it, so the answer continues block by block
      const at = `${s.base}:${piece.orig}`;
      const item = piece.offset + piece.from;
      if ((open[at] ?? []).includes(item)) continue;
      open[at] = [...(open[at] ?? []), item];
      for (const c of Object.keys(items)) if (c.startsWith(`${s.base}:`)) delete items[c];
      reset(s.base);
      touched.add(s.base);
      changed = true;
      continue;
    }
    if (!piece || !isSplittable(piece.block) || s.items.length !== itemCount(piece.block) || m === 0 || m >= s.items.length) continue;
    const cut = `${s.base}:${piece.index}`;
    // every cut the measurements predict at once (a long table becomes all its slides in one round)
    items[cut] = [...new Set([...(items[cut] ?? []), ...slices(s.items.map(full), s.available).map((c) => piece.from + c)])];
    reset(s.base);
    touched.add(s.base);
    changed = true;
  }
  return changed;
}

/**
 * Where new slides start so that each holds what fits in `room`, from the bottoms of consecutive blocks or items
 * measured from the top of the first: greedy, never before the first, and an item taller than the room alone stays whole.
 */
export function slices(bottoms: number[], room: number): number[] {
  const cuts: number[] = [];
  let top = 0;
  for (let i = 1; i < bottoms.length; i++) {
    if (bottoms[i]! - top > room && i > (cuts[cuts.length - 1] ?? 0)) { cuts.push(i); top = bottoms[i - 1]!; }
  }
  return cuts;
}

/** How many measure-and-fit rounds a deck gets before the layout is taken as it is. */
export const FIT_ROUNDS = 16;

export type { DeckLayout };
