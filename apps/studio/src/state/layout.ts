/**
 * The Studio's layout (since 2.0.3): the mode (Psaní / Write, Bloky / Blocks; Fokus / Focus is the `focus` preference on
 * top of either), and for each mode which tab the left pane and the companion pane show, or that they are closed.
 * Each mode remembers its own panes; the companion's width is shared. Kept per browser (`libka-studio:layout`), like
 * the other interface preferences, never per document: people expect their workspace to stay put.
 */
import { computed, signal } from '@preact/signals';
import * as s from './store.ts';
import { editorPrefs, setPref } from './prefs.ts';

export type StudioMode = 'write' | 'blocks';
export type LeftTab = 'catalog' | 'outline';
/** The left pane's tabs, in order. */
export const LEFT_TABS: readonly LeftTab[] = ['catalog', 'outline'];

export interface ModeLayout {
  left: LeftTab | null;
  /** A companion panel's id (`preview`, `checks`, `properties`, or an extension's), or null when it is closed. */
  comp: string | null;
}
export interface Layout {
  mode: StudioMode;
  write: ModeLayout;
  blocks: ModeLayout;
  /** The companion's width in CSS pixels, set with the splitter (null: the default for the window). */
  width: number | null;
  /** The Outline shows every block (the tree), not only the headings. */
  outlineAll: boolean;
}

export const DEFAULT_LAYOUT: Layout = {
  mode: 'write',
  write: { left: null, comp: 'preview' },
  blocks: { left: 'catalog', comp: 'properties' },
  width: null,
  outlineAll: false,
};

/** The companion's limits: never narrower than this, never more than this share of the window. */
export const COMP_MIN = 280;
export const COMP_MAX_SHARE = 0.6;

function modeLayout(raw: unknown, fallback: ModeLayout): ModeLayout {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ModeLayout>;
  return {
    left: o.left === null || LEFT_TABS.includes(o.left as LeftTab) ? (o.left ?? null) : fallback.left,
    comp: o.comp === null || (typeof o.comp === 'string' && o.comp) ? (o.comp ?? null) : fallback.comp,
  };
}

/** The saved layout, with anything unknown or broken replaced by the default. */
export function readLayout(raw: string | null): Layout {
  try {
    const o = JSON.parse(raw ?? '{}') as Partial<Layout>;
    return {
      mode: o.mode === 'blocks' ? 'blocks' : 'write',
      write: modeLayout(o.write, DEFAULT_LAYOUT.write),
      blocks: modeLayout(o.blocks, DEFAULT_LAYOUT.blocks),
      width: typeof o.width === 'number' && Number.isFinite(o.width) && o.width >= COMP_MIN ? Math.round(o.width) : null,
      outlineAll: o.outlineAll === true,
    };
  } catch { return structuredClone(DEFAULT_LAYOUT); }
}

export const layout = signal<Layout>(readLayout(s.prefs.get('layout')));

/** Versions open as a companion tab of their own, until closed; the tab they replaced comes back then. */
export const versionsOpen = signal(false);
let beforeVersions: string | null = null;

function save(l: Layout): void {
  // Versions are not kept open across a reload: the tab they replaced is kept instead
  const keep = (m: ModeLayout): ModeLayout => (m.comp === 'versions' ? { ...m, comp: beforeVersions ?? 'preview' } : m);
  s.prefs.set('layout', JSON.stringify({ ...l, write: keep(l.write), blocks: keep(l.blocks), v: 1 }));
}

function update(next: Layout): void {
  layout.value = next;
  save(next);
}

/** The panes of the mode shown now. */
export const panes = computed<ModeLayout>(() => layout.value[layout.value.mode]);
/** The mode the switch shows: Fokus when the focus preference is on. */
export const shownLayout = computed<StudioMode | 'focus'>(() => (editorPrefs.value.focus ? 'focus' : layout.value.mode));

function setPanes(change: Partial<ModeLayout>): void {
  const l = layout.value;
  update({ ...l, [l.mode]: { ...l[l.mode], ...change } });
}

/** Switches the mode (and leaves Fokus). */
export function setStudioMode(mode: StudioMode | 'focus'): void {
  if (mode === 'focus') { if (!editorPrefs.value.focus) setPref('focus', true); return; }
  if (editorPrefs.value.focus) setPref('focus', false);
  if (layout.value.mode !== mode) update({ ...layout.value, mode });
}

/** Opens the left pane on a tab, or closes it (null). */
export function openLeft(tab: LeftTab | null): void { setPanes({ left: tab }); }
/** Opens the companion on a tab, or closes it (null). */
export function openComp(tab: string | null): void {
  if (tab !== 'versions' && versionsOpen.value && panes.value.comp === 'versions') versionsOpen.value = false;
  setPanes({ comp: tab });
}
export function setCompWidth(width: number | null): void { update({ ...layout.value, width: width === null ? null : Math.round(width) }); }

/**
 * The right pane's widths in View ▾ (a resize without dragging, WCAG 2.5.7): Narrow and Wide are fixed widths (kept
 * within the window's limits when drawn), Medium is the default for the mode and the window.
 */
export type WidthChoice = 'narrow' | 'medium' | 'wide';
export const WIDTHS: Record<Exclude<WidthChoice, 'medium'>, number> = { narrow: 300, wide: 600 };
export function widthChoice(width: number | null): WidthChoice | null {
  return width === null ? 'medium' : width === WIDTHS.narrow ? 'narrow' : width === WIDTHS.wide ? 'wide' : null;
}
/** Sets one of the widths, opening the right pane when it is closed (the author wants to see it). */
export function chooseWidth(choice: WidthChoice): void {
  setCompWidth(choice === 'medium' ? null : WIDTHS[choice]);
  if (!panes.value.comp) openComp(DEFAULT_LAYOUT[layout.value.mode].comp);
}

/** View ▸ Reset this mode's layout: the mode's panes as they come, and the right pane's default width. */
export function resetLayout(): void {
  if (versionsOpen.value) { versionsOpen.value = false; beforeVersions = null; }
  const l = layout.value;
  update({ ...l, [l.mode]: { ...DEFAULT_LAYOUT[l.mode] }, width: null });
}
export function setOutlineAll(all: boolean): void { update({ ...layout.value, outlineAll: all }); }

export function openVersions(): void {
  if (!versionsOpen.value || panes.value.comp !== 'versions') beforeVersions = panes.value.comp === 'versions' ? beforeVersions : panes.value.comp;
  versionsOpen.value = true;
  setPanes({ comp: 'versions' });
}
export function closeVersions(): void {
  versionsOpen.value = false;
  setPanes({ comp: beforeVersions ?? 'preview' });
  beforeVersions = null;
}

/**
 * Shows a panel and, on a phone, the pane it is in; Fokus ends, because it hides the panes. The focus moves to the
 * element with the given id once it has rendered (two frames: the pane opens, then its tab renders).
 */
export function showPanel(tab: string, focusId?: string): void {
  if (editorPrefs.value.focus) setPref('focus', false);
  if (LEFT_TABS.includes(tab as LeftTab)) { openLeft(tab as LeftTab); s.pane.value = 'left'; }
  else { openComp(tab); s.pane.value = 'companion'; }
  if (focusId) requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(focusId)?.focus()));
}

/** Back to the text (on a phone, the editor's pane). */
export function showEditor(): void { s.pane.value = 'write'; }

/** Which items Checks shows: all of them, or the selected block's ("This block"). */
export const checksFilter = signal<'all' | 'block'>('all');

/** Opens Checks on the whole list (the readiness chip), the focus on its first item. */
export function showChecks(): void {
  checksFilter.value = 'all';
  showPanel('checks');
  requestAnimationFrame(() => requestAnimationFrame(() => (document.querySelector<HTMLElement>('#checks-list .st-item') ?? document.getElementById('checks-all'))?.focus()));
}

/** Opens Checks on the selected block (the visual editor's "!n" marks, Properties' link), the focus on its first fix. */
export function showBlockChecks(): void {
  checksFilter.value = 'block';
  showPanel('checks');
  const focus = () => {
    if (document.activeElement?.closest('#checks-list')) return;
    // (one by one: a list of selectors would find the first match in the page's order, the item before its fix)
    for (const q of ['#checks-list .st-fix', '#checks-list .st-item', '#checks-block']) {
      const el = document.querySelector<HTMLElement>(q);
      if (el) { el.focus(); return; }
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(focus));
  // (again once the click that opened it is over: the visual editor takes the focus back on a click in it)
  setTimeout(focus, 150);
}
