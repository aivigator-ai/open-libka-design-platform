/** A drop-down menu on a native details element: Escape closes it and returns focus, a click outside closes it. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface MenuProps {
  id: string;
  className?: string;
  summary: ComponentChildren;
  summaryClass?: string;
  listClass?: string;
  label?: string;
  children: ComponentChildren;
}

/** The smallest target WCAG 2.5.8 allows, in CSS pixels. */
const MIN_TARGET = 24;
/** How far a list may move from where it opens, in CSS pixels. */
const MAX_SHIFT = 96;
const TARGETS = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [tabindex="0"]';
/** How often an open menu measures again, in milliseconds (the bar can change under it while it is open). */
const REFIT_MS = 200;
/** One rule per open menu that had to move (a style element, as the companion's width: no inline styles). */
const moved = new Map<string, string>();
/** The shift each moved menu has now, in CSS pixels. */
const shifts = new Map<string, number>();
const moveSheet = typeof document !== 'undefined' ? document.head.appendChild(document.createElement('style')) : null;
const writeMoves = () => { if (moveSheet) moveSheet.textContent = [...moved.values()].join('\n'); };

/**
 * An open list is drawn over the controls under it. A click outside closes the menu and still reaches the control it
 * lands on, so a control the list's items cover all but a sliver of is a target smaller than 24 px (WCAG 2.5.8; axe's
 * `target-size` flagged the editor's Source button under View ▾ at 1024 px, the Code button under the Czech
 * Document ▾ and the Preview's buttons under Help ▾ and Export ▾). Each control under the list's left or right edge
 * rules out the edge positions that would leave it less than 24 px; the list keeps its width and moves sideways by the
 * smallest step that leaves every control either covered or with 24 px of its own (within 96 px, inside the window).
 * Measured each time the menu opens, since what lies under it depends on the window, the panes and the language, and
 * again while it stays open: what lies under an open list can move after it opened (a toolbar that wraps another way,
 * a text that takes another width; a sliver CI measured at 1024 px in Czech and that never showed locally).
 * A measurement takes the list where it opens (its current shift taken off), and the rule changes only when the answer
 * does, so measuring again while open costs no style change.
 */
function clearSlivers(id: string, details: HTMLDetailsElement, list: HTMLElement): void {
  const current = shifts.get(id) ?? 0;
  const best = bestShift(details, list, current);
  if (best === current) return;
  // (only while open: a closed menu is never moved, whatever order the events come in; each opening measures again)
  if (best) {
    shifts.set(id, best);
    moved.set(id, `#${CSS.escape(id)}[open] > .st-menu-list { transform: translateX(${best}px); }`);
  } else {
    shifts.delete(id);
    moved.delete(id);
  }
  writeMoves();
}

/** The smallest sideways shift that leaves no control under the list a sliver (0 when none is needed or none fits). */
function bestShift(details: HTMLDetailsElement, list: HTMLElement, current: number): number {
  const shown = list.getBoundingClientRect();
  if (!shown.width) return 0;
  // where the list opens: its box and its items' without the shift it has now
  const m = { left: shown.left - current, right: shown.right - current, top: shown.top, bottom: shown.bottom };
  const items = [...list.querySelectorAll<HTMLElement>(TARGETS)].map((e) => e.getBoundingClientRect()).filter((r) => r.width);
  // the items' edges, which is what covers a control (the list's padding is not a target)
  const left = (items.length ? Math.min(...items.map((r) => r.left)) : shown.left) - current;
  const right = (items.length ? Math.max(...items.map((r) => r.right)) : shown.right) - current;
  const below = [...document.querySelectorAll<HTMLElement>(TARGETS)]
    // (another menu's closed list keeps a box while hidden: only what is shown counts)
    .filter((t) => !details.contains(t) && t.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
    .map((t) => t.getBoundingClientRect())
    .filter((r) => r.width && r.height && r.bottom > m.top && r.top < m.bottom);
  // an edge at x leaves a control [a, b] a sliver when it falls inside it less than 24 px from the control's outer side
  const sliver = (dx: number) => below.some((r) => {
    const l = left + dx;
    const rt = right + dx;
    return (l > r.left && l < r.right && l - r.left < MIN_TARGET) || (rt > r.left && rt < r.right && r.right - rt < MIN_TARGET);
  });
  if (!sliver(0)) return 0;
  // the steps that put an edge just outside a sliver's range: the only places the answer can change
  const steps = new Set<number>();
  for (const r of below) {
    for (const x of [r.left, r.left + MIN_TARGET, r.right - MIN_TARGET, r.right]) {
      steps.add(Math.floor(x - left)); steps.add(Math.ceil(x - left));
      steps.add(Math.floor(x - right)); steps.add(Math.ceil(x - right));
    }
  }
  const fits = (dx: number) => Math.abs(dx) <= MAX_SHIFT && m.left + dx >= 4 && m.right + dx <= innerWidth - 4 && !sliver(dx);
  return [...steps].filter(fits).sort((x, y) => Math.abs(x) - Math.abs(y) || x - y)[0] ?? 0;
}

export function Menu(p: MenuProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const outside = (e: MouseEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && el.open) { el.open = false; el.querySelector('summary')!.focus(); } };
    let refit: ReturnType<typeof setInterval> | undefined;
    const fit = () => {
      if (el.open) {
        clearSlivers(p.id, el, listRef.current!);
        // while open, measured again: what lies under the list can move after it opened
        refit ??= setInterval(() => { if (el.open) clearSlivers(p.id, el, listRef.current!); }, REFIT_MS);
      } else {
        if (refit !== undefined) { clearInterval(refit); refit = undefined; }
        shifts.delete(p.id);
        if (moved.delete(p.id)) writeMoves();
      }
    };
    // placed when `open` changes, before the next paint (the toggle event can come frames later while the Studio is busy)
    const opened = new MutationObserver(fit);
    opened.observe(el, { attributes: true, attributeFilter: ['open'] });
    document.addEventListener('click', outside);
    el.addEventListener('keydown', key);
    addEventListener('resize', fit);
    return () => {
      if (refit !== undefined) clearInterval(refit);
      document.removeEventListener('click', outside); el.removeEventListener('keydown', key); opened.disconnect(); removeEventListener('resize', fit);
    };
  }, []);
  // a choice in the menu closes it
  const close = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('button')) ref.current!.open = false; };
  return (
    <details class={`st-menu ${p.className ?? ''}`} id={p.id} ref={ref}>
      <summary class={p.summaryClass}>{p.summary}</summary>
      <div class={`st-menu-list ${p.listClass ?? ''}`} ref={listRef} role="group" aria-label={p.label} onClick={close}>{p.children}</div>
    </details>
  );
}
