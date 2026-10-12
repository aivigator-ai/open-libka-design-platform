/**
 * Visual mode: the editor host, its formatting toolbar, the block palette, the "/" menu and the block menu. Every
 * action here is also on the keyboard (see Shortcuts.tsx); menus follow the WAI-ARIA menu and combobox patterns.
 */
import { effect, signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { toggleMark } from 'prosemirror-commands';
import { NodeSelection } from 'prosemirror-state';
import { GROUPS, type BlockGroup } from '@libka/blocks';
import {
  blockInfo, BlockSelection, blockTitle, changeType, groupTitle, conversionsFor, duplicateBlocks, insertables, insertBlock, markdownOf, matches, moveBlocks, objectRange, schema,
  selectedObject, unwrap, wrapIn, deleteBlocks, type Conversion,
} from '@libka/editor';
import type { Key } from '../i18n.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { editorPrefs, noteRecent, recentBlocks } from '../state/prefs.ts';
import { addImages, bridge, edited } from '../app/project.ts';
import { createVisualEditor, type VisualEditor } from '../visual/view.ts';
import * as split from '../app/split.ts';
import type { ActiveEditor } from '../editor/active.ts';

/** The visual editor of the open document (null in source mode). */
export const visual: { editor: VisualEditor | null } = { editor: null };

/* ---------- popovers: placed by a generated stylesheet rule (the Studio writes no style attributes) ---------- */
const placement = typeof document !== 'undefined' ? document.head.appendChild(document.createElement('style')) : null;
function place(id: string, at: { left: number; top: number }): void {
  if (!placement) return;
  const left = Math.max(8, Math.min(at.left, innerWidth - 340)), top = Math.max(8, Math.min(at.top + 4, innerHeight - 420));
  placement.textContent = `#${id}{left:${Math.round(left)}px;top:${Math.round(top)}px}`;
}

type Popover = { kind: 'insert' | 'block'; at: { left: number; top: number } } | null;
/** The open popover: the "/" menu or the block menu. */
const open = signal<Popover>(null);
/** The "/" menu's search text (keys typed before its field has the focus are added here too). */
const insertQuery = signal('');
/** When a popover last opened. */
let openedAt = 0;
effect(() => { if (open.value) openedAt = performance.now(); });
/** Opens the selected block's menu (the structure tree uses it). */
export function openBlockMenu(at: { left: number; top: number }): void { open.value = { kind: 'block', at }; }

export function announce(brief: string, full: string): void {
  s.announcement.value = '';
  requestAnimationFrame(() => { s.announcement.value = editorPrefs.value.announce === 'brief' ? brief : full; });
}

/* ---------- the "/" menu: a combobox with a list of blocks ---------- */
interface Option { name: string; title: string; summary: string; group: string; words: string }

function InsertMenu({ at }: { at: { left: number; top: number } }) {
  const query = insertQuery.value;
  const setQuery = (q: string) => { insertQuery.value = q; };
  const [active, setActive] = useState(0);
  // no option is named active until the person types or moves: a screen reader first says the field's name, not an option
  const [engaged, setEngaged] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { place('st-insert', at); input.current?.focus(); }, []);
  const options = useMemo<Option[]>(() => {
    const groupLabel = (g: BlockGroup) => groupTitle(g, s.lang.value);
    const all = insertables(s.lang.value).map((b) => ({ name: b.name, title: b.title, summary: b.summary, group: groupLabel(b.group), words: b.words }));
    const recent = recentBlocks.value.map((n) => all.find((o) => o.name === n)).filter((o): o is Option => Boolean(o)).map((o) => ({ ...o, group: t('insert.recent') }));
    const q = query.trim();
    const list = [...(q ? [] : recent), ...all];
    // either language, accents optional: "zvyrazneni" and "callout" both find the callout
    return q ? list.filter((o) => matches(q, o.title, o.words, o.group)) : list;
  }, [query, s.lang.value]);
  const close = () => { open.value = null; bridge.editor?.focus(); };
  const choose = (o: Option | undefined) => {
    if (!o) return;
    open.value = null;
    visual.editor?.run(insertBlock(o.name));
    noteRecent(o.name);
    announce(t('announce.insertedBrief'), t('announce.inserted', { name: o.title }));
  };
  const key = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) setEngaged(true);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(options[active]); }
    else if (e.key === 'Escape' || (e.key === 'Backspace' && !query)) { e.preventDefault(); close(); }
  };
  useEffect(() => { document.getElementById(`st-insert-opt-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
  return (
    <div class="st-pop st-insert" id="st-insert" role="dialog" aria-label={t('insert.title')}>
      <input ref={input} type="text" role="combobox" aria-expanded="true" aria-controls="st-insert-list" aria-autocomplete="list"
        aria-activedescendant={engaged && options.length ? `st-insert-opt-${active}` : undefined} aria-label={t('insert.search')} placeholder={t('insert.search')}
        value={query} onInput={(e) => { setQuery(e.currentTarget.value); setActive(0); setEngaged(true); }} onKeyDown={key} onBlur={(e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest('#st-insert')) setTimeout(() => { if (open.value?.kind === 'insert') open.value = null; }, 150); }} />
      <ul class="st-insert-list" id="st-insert-list" role="listbox" aria-label={t('insert.title')}>
        {options.length ? options.map((o, i) => (
          <li key={`${o.group}-${o.name}`} id={`st-insert-opt-${i}`} role="option" aria-selected={i === active} class="st-insert-opt"
            onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseMove={() => setActive(i)}>
            {i === 0 || options[i - 1]!.group !== o.group ? <span class="st-insert-group" aria-hidden="true">{o.group}</span> : null}
            <span class="st-insert-name">{o.title}</span>
            <span class="st-insert-summary">{o.summary}</span>
          </li>
        )) : <li class="st-insert-none" role="option" aria-selected="false" aria-disabled="true">{t('insert.none')}</li>}
      </ul>
    </div>
  );
}

/* ---------- the block menu: the selected block's actions ---------- */
export interface Item { id: string; label: string; detail?: string; run?(): void; sub?: Item[]; disabled?: boolean }

const WRAPS = ['callout', 'summary', 'notes'];

export function blockItems(): Item[] {
  const v = visual.editor;
  if (!v) return [];
  const state = v.view.state;
  // a dry run; a command that fails on an unexpected selection is simply not offered
  const can = (c: Parameters<VisualEditor['run']>[0]) => { try { return c(state); } catch (e) { console.warn('LibKa Studio: a block action could not be checked', e); return false; } };
  const o = selectedObject(state);
  const r = objectRange(state);
  const conversions: Conversion[] = o ? conversionsFor(o.node, s.lang.value) : [];
  const runAndSay = (c: Parameters<VisualEditor['run']>[0], brief: string, full: string) => () => { v.run(c); announce(brief, full); };
  const name = o ? blockInfo(o.node, o.parent, s.lang.value).title : '';
  return [
    { id: 'up', label: t('block.moveUp'), disabled: !can(moveBlocks(-1)), run: runAndSay(moveBlocks(-1), t('announce.movedBrief'), t('announce.moved', { name })) },
    { id: 'down', label: t('block.moveDown'), disabled: !can(moveBlocks(1)), run: runAndSay(moveBlocks(1), t('announce.movedBrief'), t('announce.moved', { name })) },
    { id: 'duplicate', label: t('block.duplicate'), disabled: !can(duplicateBlocks), run: runAndSay(duplicateBlocks, t('announce.duplicatedBrief'), t('announce.duplicated', { name })) },
    {
      id: 'type', label: t('block.changeType'), disabled: !conversions.length,
      sub: conversions.map((c) => ({ id: `type-${c.key}`, label: c.title, ...(c.lost.length ? { detail: t('block.loses', { what: c.lost.join(', ') }) } : {}), run: () => { v.run(changeType(c.key)); announce(t('announce.changedBrief'), t('announce.changed', { name: c.title })); } })),
    },
    {
      id: 'wrap', label: t('block.wrap'), disabled: !r,
      sub: WRAPS.map((w) => ({ id: `wrap-${w}`, label: blockTitle(w, s.lang.value), disabled: !can(wrapIn(w)), run: () => v.run(wrapIn(w)) })),
    },
    { id: 'unwrap', label: t('block.unwrap'), disabled: !can(unwrap), run: () => v.run(unwrap) },
    {
      id: 'copy', label: t('block.copyMarkdown'), disabled: !r, run: () => {
        void navigator.clipboard?.writeText(markdownOf(state.selection.content(), state.selection.$from)).then(() => s.toast(t('block.copied')), () => s.toast(t('block.copyFailed')));
      },
    },
    { id: 'properties', label: t('block.properties'), run: () => { s.panelTab.value = 'inspector' as s.PanelTab; s.pane.value = 'checks'; requestAnimationFrame(() => document.getElementById('tp-inspector')?.focus()); } },
    { id: 'delete', label: t('block.delete'), disabled: !can(deleteBlocks), run: runAndSay(deleteBlocks, t('announce.deletedBrief'), t('announce.deleted', { name })) },
  ];
}

function BlockMenu({ at }: { at: { left: number; top: number } }) {
  const [sub, setSub] = useState<Item | null>(null);
  const items = sub ? [{ id: 'back', label: `‹ ${t('block.back')}` } as Item, ...(sub.sub ?? [])] : blockItems();
  const list = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => { place('st-blockmenu', at); }, []);
  useEffect(() => { (list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active])?.focus(); }, [active, sub]);
  const close = () => { open.value = null; bridge.editor?.focus(); };
  const activate = (item: Item) => {
    if (item.disabled) return;
    if (item.id === 'back') { setSub(null); setActive(0); return; }
    if (item.sub) { setSub(item); setActive(1); return; }
    open.value = null;
    item.run?.();
    if (item.id !== 'properties') bridge.editor?.focus();
  };
  const key = (e: KeyboardEvent) => {
    const n = items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + n) % n); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'ArrowRight' && items[active]?.sub) { e.preventDefault(); activate(items[active]!); }
    else if (e.key === 'ArrowLeft' && sub) { e.preventDefault(); setSub(null); setActive(0); }
    else if (e.key === 'Escape') { e.preventDefault(); if (sub) { setSub(null); setActive(0); } else close(); }
    else if (e.key === 'Tab') { e.preventDefault(); close(); }
  };
  return (
    <div class="st-pop st-blockmenu" id="st-blockmenu">
      <ul ref={list} role="menu" aria-label={sub ? sub.label : t('block.menu')} onKeyDown={key}>
        {items.map((item, i) => (
          <li key={item.id} role="menuitem" tabIndex={i === active ? 0 : -1} aria-disabled={item.disabled ? 'true' : undefined} aria-haspopup={item.sub ? 'menu' : undefined}
            class="st-menuitem" data-item={item.id} onClick={() => activate(item)} onMouseMove={() => setActive(i)}>
            <span>{item.label}{item.sub ? ' ›' : ''}</span>
            {item.detail ? <span class="st-menuitem-detail">{item.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Closes a popover when the pointer goes down outside it. */
function useOutside(): void {
  useEffect(() => {
    // (not in the moment after it opened: lifting the finger after a long press sends the browser's mouse events)
    const down = (e: MouseEvent) => { if (open.value && performance.now() - openedAt > 600 && !(e.target as HTMLElement).closest('.st-pop')) open.value = null; };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);
}

/* ---------- the palette ---------- */
function Palette() {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const all = insertables(s.lang.value);
  const groups = (Object.keys(GROUPS) as BlockGroup[]).map((g) => ({ g, blocks: all.filter((b) => b.group === g && (!q || matches(q, b.title, b.words))) })).filter((x) => x.blocks.length);
  return (
    <aside class="st-palette" aria-label={t('palette.title')}>
      <input type="search" class="st-palette-search" aria-label={t('palette.search')} placeholder={t('palette.search')} value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      <div class="st-palette-list">
        {groups.map(({ g, blocks }) => (
          <section key={g} aria-labelledby={`pal-${g}`}>
            <h3 class="st-palette-group" id={`pal-${g}`}>{groupTitle(g, s.lang.value)}</h3>
            <ul>
              {blocks.map((b) => (
                <li key={b.name}>
                  <button type="button" class="st-palette-item" draggable data-block={b.name} title={b.summary}
                    onClick={() => { visual.editor?.run(insertBlock(b.name)); noteRecent(b.name); announce(t('announce.insertedBrief'), t('announce.inserted', { name: b.title })); }}
                    onDragStart={(e) => { e.dataTransfer?.setData('text/plain', b.markdown); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'; }}>
                    {b.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}

/* ---------- the toolbar ---------- */
const MARKS: [string, 'strong' | 'em' | 'code' | 'strike', string, Key][] = [['bold', 'strong', 'B', 'format.bold'], ['italic', 'em', 'I', 'format.italic'], ['code', 'code', '<>', 'format.code'], ['strike', 'strike', 'S', 'format.strike']];

export function VisualToolbar() {
  void s.selectionTick.value;
  const state = visual.editor?.view.state;
  const isOn = (m: 'strong' | 'em' | 'code' | 'strike') => {
    // a selected block is not text: no mark is shown as on
    if (!state || state.selection instanceof NodeSelection || state.selection instanceof BlockSelection) return false;
    const type = schema.marks[m]!;
    const { from, $from, to, empty } = state.selection;
    return empty ? Boolean(type.isInSet(state.storedMarks ?? $from.marks())) : state.doc.rangeHasMark(from, to, type);
  };
  return (
    <div class="st-format" role="toolbar" aria-label={t('format.title')}>
      {MARKS.map(([id, mark, glyph, key]) => (
        <button key={id} type="button" class={`st-format-btn st-format-${id}`} aria-pressed={isOn(mark)} title={t(key)}
          onMouseDown={(e) => e.preventDefault()} onClick={() => visual.editor?.run(toggleMark(schema.marks[mark]!))}>
          <span class="st-format-glyph" aria-hidden="true">{glyph}</span><span class="st-format-text">{t(key)}</span>
        </button>
      ))}
      <button type="button" class="st-format-btn st-format-link" title={t('format.link')} onMouseDown={(e) => e.preventDefault()} onClick={() => void linkPrompt(visual.editor)}>
        <span class="st-format-glyph" aria-hidden="true">↗</span><span class="st-format-text">{t('format.link')}</span>
      </button>
    </div>
  );
}

/** Ctrl/Cmd+K on selected text: a link around it (an empty address removes it). Either editor; the toolbar's is the visual one. */
export async function linkPrompt(editor: ActiveEditor | null = bridge.editor): Promise<void> {
  if (!editor) return;
  if (!editor.textSelected()) { editor.focus(); return; }
  const href = await s.promptFor({ title: 'format.linkTitle', label: 'format.linkLabel', value: editor.linkHref() ?? 'https://', confirm: 'format.linkApply' });
  if (href !== null) editor.setLink(href.trim() && href.trim() !== 'https://' ? href.trim() : null);
  editor.focus();
}

/* ---------- the host ---------- */
export function VisualEditorHost() {
  const host = useRef<HTMLDivElement>(null);
  useOutside();
  useEffect(() => {
    const editor = createVisualEditor({
      parent: host.current!,
      text: s.source.value,
      label: t('editor.labelVisual'),
      place: s.place.value,
      prefs: editorPrefs.value,
      onChange: (text) => { edited(text); split.changed('visual', text); },
      onSelection: () => { s.selectionTick.value++; if (visual.editor?.view.hasFocus()) split.placed('visual'); },   // a change from the other side moves nothing there
      onFocus: () => split.focused('visual'),
      onFiles: (list) => void addImages(list),
      onInsertMenu: (at) => { insertQuery.value = ''; open.value = { kind: 'insert', at }; },
      menuKey: (key) => { if (open.value?.kind !== 'insert') return false; insertQuery.value += key; return true; },
      onBlockMenu: (at) => { open.value = { kind: 'block', at }; },
      onLink: () => void linkPrompt(visual.editor),
      onHelp: () => { s.dialog.value = { kind: 'shortcuts' }; },
      announce,
      fileUrl: (path) => s.files.value.get(path.replace(/^\.\//, ''))?.url,
      lang: () => s.lang.value,
      docLang: () => s.doc.value?.meta.lang ?? s.lang.value,
      say: (key, vars) => t(`view.${key}` as Key, vars),
      onProblems: () => {
        s.panelTab.value = 'inspector';
        s.pane.value = 'checks';
        requestAnimationFrame(() => requestAnimationFrame(() => (document.querySelector('#insp-problems + ul .st-fix, #tp-inspector') as HTMLElement | null)?.focus()));
      },
    });
    visual.editor = editor;
    bridge.editor = editor;
    const detach = split.attach(editor);
    s.selectionTick.value++;
    return () => { editor.flush(); detach(); if (bridge.editor === editor) bridge.editor = null; visual.editor = null; editor.destroy(); };
  }, []);
  const problems = s.problems.value;
  useEffect(() => { visual.editor?.showProblems(problems); }, [problems]);
  const label = t('editor.labelVisual');
  useEffect(() => { visual.editor?.setLabel(label); }, [label]);
  const p = editorPrefs.value;
  useEffect(() => { visual.editor?.setPrefs(p); }, [p]);
  const pop = open.value;
  return (
    <div class="st-visual" data-palette={String(p.palette)} data-handles={p.handles} data-density={p.density}>
      {p.palette ? <Palette /> : null}
      <div class="st-editor st-visual-editor" id="editor" ref={host} />
      {pop?.kind === 'insert' ? <InsertMenu at={pop.at} /> : null}
      {pop?.kind === 'block' ? <BlockMenu at={pop.at} /> : null}
    </div>
  );
}
