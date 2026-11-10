/**
 * A row of tabs (the WAI-ARIA tabs pattern, activated by the arrow keys, Home and End): the companion's, the left
 * pane's and the Checks tab's own. The tab of `id` is `#tab-<id>` and controls `#tp-<id>`; the caller draws the panels.
 */
import { t } from '../state/text.ts';
import type { Key } from '../i18n.ts';

export interface TabDef {
  id: string;
  title: Key;
  /** The number on the tab (null: not known yet; undefined: no number). */
  count?: number | null;
}

export function TabList({ tabs, current, label, onSelect, class: cls = 'st-tabs' }: {
  tabs: readonly TabDef[]; current: string; label: string; onSelect(id: string): void; class?: string;
}) {
  const select = (id: string, focus: boolean) => {
    onSelect(id);
    if (focus) requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
  };
  const key = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length]!.id, true);
  };
  return (
    <div class={cls} role="tablist" aria-label={label}>
      {tabs.map((p, i) => {
        const on = p.id === current;
        const n = p.count;
        return (
          <button key={p.id} type="button" role="tab" id={`tab-${p.id}`} aria-controls={`tp-${p.id}`} aria-selected={on} tabIndex={on ? 0 : -1}
            onClick={() => select(p.id, false)} onKeyDown={(e) => key(e, i)}>
            <span>{t(p.title)}</span>
            {n !== undefined ? <span class="st-count" id={`count-${p.id}`} data-tone={n === null ? '' : n ? 'error' : 'ok'}>{n === null ? '–' : n}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
