/**
 * The command palette (Ctrl/Cmd+K, or F1): one search over everything the Studio can do. What it finds comes from the
 * extensions' palette sources (commands, blocks to insert, places in the document, settings, documents), so a later
 * extension adds its own. It follows the WAI-ARIA combobox pattern: the focus stays in the search field, arrows move
 * through the results, Enter runs one, Escape closes. Both languages are searched, accents optional.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { fold, matches } from '@libka/editor';
import { registry, type PaletteItem } from '../state/commands.ts';
import { keyText } from '../state/keys.ts';
import { t } from '../state/text.ts';

/** Results per group: all commands, a few of the rest until the author types. */
const SHOWN = (source: string, searching: boolean) => (searching ? 12 : source === 'commands' ? 60 : 5);

export function CommandPalette({ onRun }: { onRun(item: PaletteItem): void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // no result is named active until the person types or moves: a screen reader first says the field's name, not a result
  const [moved, setMoved] = useState(false);
  // what the sources offer is read once, when the palette opens
  const sources = useMemo(() => registry.paletteSources().map((src) => ({ src, items: src.items() })), []);
  const q = query.trim();
  const results = useMemo(() => {
    const out: { group: string; item: PaletteItem }[] = [];
    const start = fold(q);
    for (const { src, items } of sources) {
      const hits = q ? items.filter((i) => matches(q, i.label, i.detail, i.words)) : items;
      // names that start with the query first
      if (q) hits.sort((a, b) => Number(!fold(a.label).startsWith(start)) - Number(!fold(b.label).startsWith(start)));
      for (const item of hits.slice(0, SHOWN(src.id, Boolean(q)))) out.push({ group: t(src.title), item });
    }
    return out;
  }, [q, sources]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { document.getElementById(`cmdk-opt-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const key = (e: KeyboardEvent) => {
    const n = results.length;
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) setMoved(true);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (n ? (a + 1) % n : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (n ? (a - 1 + n) % n : 0)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setActive((a) => Math.min(n - 1, a + 8)); }
    else if (e.key === 'PageUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 8)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[active]; if (r) onRun(r.item); }
  };
  return (
    <div class="st-cmdk">
      <input type="text" class="st-cmdk-input" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"
        aria-activedescendant={(q || moved) && results.length ? `cmdk-opt-${active}` : undefined} aria-label={t('cmdk.search')} placeholder={t('cmdk.search')}
        value={query} onInput={(e) => setQuery(e.currentTarget.value)} onKeyDown={key} autoFocus spellcheck={false} autocomplete="off" />
      <ul class="st-cmdk-list" id="cmdk-list" role="listbox" aria-label={t('cmdk.title')}>
        {results.length ? results.map(({ group, item }, i) => (
          <li key={item.id} id={`cmdk-opt-${i}`} role="option" aria-selected={i === active} class="st-cmdk-opt" data-item={item.id}
            onMouseDown={(e) => e.preventDefault()} onClick={() => onRun(item)} onMouseMove={() => setActive(i)}>
            {i === 0 || results[i - 1]!.group !== group ? <span class="st-cmdk-group" aria-hidden="true">{group}</span> : null}
            <span class="st-cmdk-label">{item.label}</span>
            {item.keys ? <kbd class="st-cmdk-keys">{keyText(item.keys)}</kbd> : null}
            {item.detail ? <span class="st-cmdk-detail">{item.detail}</span> : null}
          </li>
        )) : <li class="st-cmdk-none" role="option" aria-selected="false" aria-disabled="true">{t('cmdk.none')}</li>}
      </ul>
      <p class="st-cmdk-hint" aria-hidden="true">{t('cmdk.hint')}</p>
      <p class="st-visually-hidden" role="status">{q ? t('cmdk.count', { n: results.length }) : ''}</p>
    </div>
  );
}
