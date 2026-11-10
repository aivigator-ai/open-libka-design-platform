/**
 * F6 and Shift+F6: the focus moves to the next or the previous region of the Studio that is shown (the app bar, the
 * left pane, the editor, the companion, the phone's bottom bar, the status bar; in the library its list), skipping
 * the closed ones. In a pane the focus goes to its selected tab, in the editor to the text, elsewhere to the first
 * control (or to the region itself, as the status bar has none).
 */
import { bridge } from './project.ts';

const REGIONS = ['.st-top', '#left-pane', '#main', '#library', '#companion', '.st-phone-bar', '.st-statusbar'];
const TABBABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';

function shown(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && !el.closest('[hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

export function regions(): HTMLElement[] {
  return REGIONS.map((q) => document.querySelector(q)).filter(shown);
}

function enter(region: HTMLElement): void {
  if (region.id === 'main' && bridge.editor) { bridge.editor.focus(); return; }
  const target = region.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    ?? Array.from(region.querySelectorAll<HTMLElement>(TABBABLE)).find((el) => shown(el) && el.tabIndex >= 0);
  if (target) { target.focus(); return; }
  if (!region.hasAttribute('tabindex')) region.tabIndex = -1;
  region.focus();
}

/** Moves the focus one region on (1) or back (-1). */
export function cycleRegion(dir: 1 | -1): void {
  const list = regions();
  if (!list.length) return;
  const at = list.findIndex((r) => r.contains(document.activeElement));
  const next = at < 0 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length;
  enter(list[next]!);
}
