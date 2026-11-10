/**
 * Visual mode: the editor host, its formatting toolbar, the block Catalog, the "/" menu and the block menu. Every
 * action here is also on the keyboard (see Shortcuts.tsx); menus follow the WAI-ARIA menu and combobox patterns.
 */
import { effect, signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { GROUPS, type BlockGroup } from '@libka/blocks';
import {
  blockInfo, blockTitle, changeType, groupTitle, conversionsFor, duplicateBlocks, insertables, insertBlock, markActive, markdownOf, matches, moveBlocks, objectRange, schema,
  selectedObject, toggleFormat, unwrap, wrapIn, deleteBlocks, addPart, canAddPart, partHolder, partName, type Conversion,
  barPartHolder, barTarget, quickSetting, selectBlockAt, setBlockAttribute,
} from '@libka/editor';
import { NodeSelection } from 'prosemirror-state';
import type { Key } from '../i18n.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { editorPrefs, noteRecent, recentBlocks } from '../state/prefs.ts';
import { ariaKeys } from '../state/keys.ts';
import { showBlockChecks, showPanel } from '../state/layout.ts';
import { addImages, bridge, edited, insertBlock as insertSource } from '../app/project.ts';
import { Thumb } from './thumbs.tsx';
import { createVisualEditor, type VisualEditor } from '../visual/view.ts';
import * as split from '../app/split.ts';
import type { ActiveEditor } from '../editor/active.ts';

/** The visual editor of the open document (null in source mode). */
export const visual: { editor: VisualEditor | null } = { editor: null };

/* ---------- popovers: placed by a generated stylesheet rule (the Studio writes no style attributes) ---------- */
const placement = typeof document !== 'undefined' ? document.head.appendChild(document.createElement('style')) : null;
function place(id: string, at: { left: number; top: number }): void {
  if (!placement) return;
  const left = Math.max(8, Math.min(at.left, innerWidth - 380)), top = Math.max(8, Math.min(at.top + 4, innerHeight - 420));
  placement.textContent = `#${id}{left:${Math.round(left)}px;top:${Math.round(top)}px}`;
}

type Popover = { kind: 'insert' | 'block'; at: { left: number; top: number }; from?: HTMLElement | null } | null;
/** The open popover: the block picker (from "/" or "+ Block") or the block menu. */
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

/** The source line of the block the author is in: the visual editor's selected top-level block, or Source's cursor. */
export function selectedLine(): number {
  void s.selectionTick.value;
  const v = visual.editor;
  if (v && s.shownMode.value !== 'source') {
    const i = v.view.state.selection.$from.index(0);
    const { text, ranges } = v.current();
    const r = ranges[i];
    return r ? text.slice(0, r.from).split('\n').length : 1;
  }
  return s.cursor.value.line;
}

/** Whether the block picker is open (from either "/" or "+ Block"). */
export const pickerOpen = (): boolean => open.value?.kind === 'insert';

/** Opens the block picker under the "+ Block" button (or closes it, when it is open). In either editor. */
export function togglePicker(trigger: HTMLElement): void {
  if (open.value?.kind === 'insert') { open.value = null; return; }
  const r = trigger.getBoundingClientRect();
  insertQuery.value = '';
  // under the button, or above it when the button is low on the screen (Focus's dock)
  const top = r.bottom + 484 > innerHeight && r.top > innerHeight / 2 ? Math.max(4, r.top - Math.min(488, innerHeight - 24)) : r.bottom;
  open.value = { kind: 'insert', at: { left: r.left, top }, from: trigger };
}

/** A summary's first sentence: the picker's one line of help. */
const firstSentence = (text: string) => text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;

/* ---------- the block picker: a combobox with a list of blocks, from "/" at the cursor or "+ Block" ---------- */
interface Option { name: string; title: string; summary: string; group: string; words: string }

function InsertMenu({ at, from }: { at: { left: number; top: number }; from?: HTMLElement | null }) {
  const query = insertQuery.value;
  const setQuery = (q: string) => { insertQuery.value = q; };
  const [active, setActive] = useState(0);
  // no option is named active until the person types or moves: a screen reader first says the field's name, not an option
  const [engaged, setEngaged] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { place('st-insert', at); input.current?.focus(); }, []);
  const options = useMemo<Option[]>(() => {
    const groupLabel = (g: BlockGroup) => groupTitle(g, s.lang.value);
    const all = insertables(s.lang.value).map((b) => ({ name: b.name, title: b.title, summary: firstSentence(b.summary), group: groupLabel(b.group), words: b.words }));
    const recent = recentBlocks.value.map((n) => all.find((o) => o.name === n)).filter((o): o is Option => Boolean(o)).map((o) => ({ ...o, group: t('insert.recent') }));
    const q = query.trim();
    const list = [...(q ? [] : recent), ...all];
    // either language, accents optional: "zvyrazneni" and "callout" both find the callout
    return q ? list.filter((o) => matches(q, o.title, o.words, o.group)) : list;
  }, [query, s.lang.value]);
  // closed without a choice: back where the person was (the "+ Block" button, or the text)
  const close = () => { open.value = null; if (from?.isConnected) from.focus(); else bridge.editor?.focus(); };
  const choose = (o: Option | undefined) => {
    if (!o) return;
    open.value = null;
    // the visual editor inserts the block as an object after the selected one; the source editor its Markdown at the cursor
    if (visual.editor && bridge.editor?.mode !== 'source') { visual.editor.run(insertBlock(o.name)); noteRecent(o.name); }
    else insertSource(o.name);
    bridge.editor?.focus();
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
      <div class="st-insert-head">
        <input ref={input} type="text" role="combobox" aria-expanded="true" aria-controls="st-insert-list" aria-autocomplete="list"
          aria-activedescendant={engaged && options.length ? `st-insert-opt-${active}` : undefined} aria-label={t('insert.search')} placeholder={t('insert.search')}
          value={query} onInput={(e) => { setQuery(e.currentTarget.value); setActive(0); setEngaged(true); }} onKeyDown={key} onBlur={(e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest('#st-insert')) setTimeout(() => { if (open.value?.kind === 'insert') open.value = null; }, 150); }} />
        <button type="button" class="st-insert-close" id="st-insert-close" aria-label={t('insert.close')} title={t('insert.close')} onClick={close}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
      </div>
      <ul class="st-insert-list" id="st-insert-list" role="listbox" aria-label={t('insert.title')}>
        {options.length ? options.map((o, i) => (
          <li key={`${o.group}-${o.name}`} id={`st-insert-opt-${i}`} role="option" aria-selected={i === active} class="st-insert-opt" data-block={o.name}
            onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseMove={() => setActive(i)}>
            {i === 0 || options[i - 1]!.group !== o.group ? <span class="st-insert-group" aria-hidden="true">{o.group}</span> : null}
            <Thumb name={o.name} />
            <span class="st-insert-name">{o.title}</span>
            <span class="st-insert-summary">{o.summary}</span>
          </li>
        )) : <li class="st-insert-none" role="option" aria-selected="false" aria-disabled="true">{t('insert.none')}</li>}
      </ul>
    </div>
  );
}

/** The block picker, where it is open: under "+ Block" or at the cursor (both editors). */
export function PickerHost() {
  const pop = open.value;
  return pop?.kind === 'insert' ? <InsertMenu at={pop.at} from={pop.from ?? null} /> : null;
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
  // one more part of the laid-out block the selection is in (a stage, a card): the keyboard's way to its "+"
  const holder = partHolder(state);
  const part = holder ? partName(holder.node.attrs.name as string, s.lang.value) : null;
  const holderTitle = holder ? blockInfo(holder.node, null, s.lang.value).title : '';
  return [
    ...(holder && part ? [{
      id: 'add-part', label: t('block.addPart', { name: part }), disabled: !canAddPart(holder.node),
      ...(canAddPart(holder.node) ? {} : { detail: t('view.atLimit', { block: holderTitle }) }),
      run: runAndSay(addPart(holder.pos), t('view.addedPart'), t('view.addedPartFull', { name: part })),
    }] : []),
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
    { id: 'properties', label: t('block.properties'), run: () => showPanel('properties', 'tp-properties') },
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
    // (the "+ Block" button toggles the picker itself)
    const down = (e: MouseEvent) => { if (open.value && performance.now() - openedAt > 600 && !(e.target as HTMLElement).closest('.st-pop, #insert-block')) open.value = null; };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, []);
}

/* ---------- the Catalog (the left pane's first tab) ---------- */
/**
 * Every block, drawn as it looks, in its group: a click inserts it (in the visual editor after the selected block, in
 * Source at the cursor), and in the visual editor a block can be dragged onto the document. The focus stays here, so
 * several blocks can be added in a row.
 */
export function Catalog() {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const all = insertables(s.lang.value);
  const groups = (Object.keys(GROUPS) as BlockGroup[]).map((g) => ({ g, blocks: all.filter((b) => b.group === g && (!q || matches(q, b.title, b.words))) })).filter((x) => x.blocks.length);
  const visualMode = s.shownMode.value !== 'source';
  const insert = (name: string, title: string) => {
    if (visual.editor && bridge.editor?.mode !== 'source') { visual.editor.run(insertBlock(name)); noteRecent(name); }
    else insertSource(name);
    announce(t('announce.insertedBrief'), t('announce.inserted', { name: title }));
  };
  return (
    <div class="st-catalog">
      <input type="search" class="st-palette-search" id="catalog-search" aria-label={t('catalog.search')} placeholder={t('catalog.search')} value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      {groups.map(({ g, blocks }) => (
        <section key={g} aria-labelledby={`cat-${g}`}>
          <h3 class="st-catalog-group" id={`cat-${g}`}>{groupTitle(g, s.lang.value)}</h3>
          <ul class="st-catalog-grid">
            {blocks.map((b) => (
              <li key={b.name}>
                <button type="button" class="st-catalog-item" draggable={visualMode} data-block={b.name} title={firstSentence(b.summary)}
                  onClick={() => insert(b.name, b.title)}
                  onDragStart={(e) => { e.dataTransfer?.setData('text/plain', b.markdown); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'; }}>
                  <Thumb name={b.name} />
                  <span class="st-catalog-name">{b.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length ? null : <p class="st-empty">{t('insert.none')}</p>}
    </div>
  );
}

/* ---------- the toolbar ---------- */
const MARKS: [string, 'strong' | 'em' | 'code' | 'strike', string, Key][] = [['bold', 'strong', 'B', 'format.bold'], ['italic', 'em', 'I', 'format.italic'], ['code', 'code', '<>', 'format.code'], ['strike', 'strike', 'S', 'format.strike']];

/**
 * The format buttons. They stay in the same place in every mode: in Source they are unavailable (not removed), with
 * the reason under the toolbar (`#format-why`, drawn by the editor pane), because there the formatting is written in
 * the Markdown.
 */
export function VisualToolbar({ off = false }: { off?: boolean }) {
  void s.selectionTick.value;
  const state = off ? undefined : visual.editor?.view.state;
  // on only when all of the selected text has the mark (a paragraph with a little code in it is not Code)
  const isOn = (m: 'strong' | 'em' | 'code' | 'strike') => Boolean(state && markActive(state, schema.marks[m]!));
  const why = off ? { 'aria-disabled': 'true' as const, 'aria-describedby': 'format-why' } : {};
  return (
    <div class="st-format" role="toolbar" aria-label={t('format.title')} data-off={String(off)}>
      {MARKS.map(([id, mark, glyph, key]) => (
        <button key={id} type="button" class={`st-format-btn st-format-${id}`} aria-pressed={isOn(mark)} title={t(key)} {...why}
          onMouseDown={(e) => e.preventDefault()} onClick={() => { if (!off) visual.editor?.run(toggleFormat(schema.marks[mark]!)); }}>
          <span class="st-format-glyph" aria-hidden="true">{glyph}</span><span class="st-format-text">{t(key)}</span>
        </button>
      ))}
      <button type="button" class="st-format-btn st-format-link" title={t('format.link')} {...why} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (!off) void linkPrompt(visual.editor); }}>
        <span class="st-format-glyph" aria-hidden="true">↗</span><span class="st-format-text">{t('format.link')}</span>
      </button>
    </div>
  );
}

/* ---------- the block bar ---------- */
/**
 * The block the author is in (the innermost LibKa block around the cursor, or the selected block): its name, the
 * setting the registry marks for the bar (a figure: its alt text), one more part where it has parts, Move up and down,
 * ⋯ with the whole block menu, and Properties. Nothing for plain text, and nothing in Source. It sits in the toolbar;
 * in Focus in the dock, on a phone in a row above the bottom bar (`where`), always a row of the layout, never over the text.
 */
export function BlockBar({ where }: { where: 'toolbar' | 'dock' | 'phone' }) {
  void s.selectionTick.value;
  const v = visual.editor;
  if (!v || s.shownMode.value === 'source') return null;
  const state = v.view.state;
  const target = barTarget(state);
  if (!target) return null;
  const lang = s.lang.value;
  const name = blockInfo(target.node, state.doc.resolve(target.pos).parent, lang).title;
  const quick = target.name === 'figure' ? null : quickSetting(target.name, lang);
  const value = quick ? (target.node.attrs.attributes as Record<string, string>)[quick.key] : undefined;
  const holder = barPartHolder(state, target);
  const part = holder ? partName(holder.node.attrs.name as string, lang) : null;
  const alt = target.name === 'figure' ? String(target.node.firstChild!.attrs.alt ?? '') : null;
  const id = (k: string) => `bar-${where}-${k}`;
  // the bar's own controls keep the focus (`run` would move it to the text): a list changed by arrow keys, Move pressed twice
  const here = (c: Parameters<VisualEditor['run']>[0]) => c(v.view.state, v.view.dispatch, v.view);
  // Move, ⋯ and Properties act on the selected block: the bar's block is selected first
  const select = () => here(selectBlockAt(target.pos));
  const move = (dir: -1 | 1) => () => { select(); if (here(moveBlocks(dir))) announce(t('announce.movedBrief'), t('announce.moved', { name })); };
  const canMove = (dir: -1 | 1) => { try { return moveBlocks(dir)(state.apply(state.tr.setSelection(NodeSelection.create(state.doc, target.pos)))); } catch { return false; } };
  const properties = (focusId = 'tp-properties') => { select(); showPanel('properties', focusId); };
  const named = (val: string) => quick?.spec.labels?.[val] ?? val;
  return (
    <div class="st-blockbar" id={id('bar')} role="toolbar" aria-label={t('bar.label', { name })} data-where={where} data-block={target.name}>
      <span class="st-blockbar-name" aria-hidden="true">{name}</span>
      {quick ? (
        <label class="st-blockbar-setting">
          <span class="st-blockbar-key">{quick.spec.title ?? quick.key}</span>
          <select id={id('setting')} data-key={quick.key} value={value ?? ''} onChange={(e) => {
            const next = e.currentTarget.value || null;
            here(setBlockAttribute(target.pos, quick.key, next));
          }}>
            {/* (an optional setting the bar offers has a default, which the output uses when it is not written; a required one, missing, is "none") */}
            {quick.spec.required ? (value ? null : <option value="">{t('insp.none')}</option>) : <option value="">{t('bar.default')}</option>}
            {quick.spec.values!.map((val) => <option key={val} value={val}>{named(val)}</option>)}
          </select>
        </label>
      ) : null}
      {alt !== null ? (
        <button type="button" class="st-blockbar-btn st-blockbar-alt" id={id('alt')} data-done={String(Boolean(alt))} onClick={() => properties('img-alt')}>
          {alt ? t('bar.altDone') : t('bar.altWrite')}
        </button>
      ) : null}
      {holder && part ? (
        <button type="button" class="st-blockbar-btn st-blockbar-part" id={id('part')} aria-label={t('view.addPartFull', { name: part })}
          aria-disabled={canAddPart(holder.node) ? undefined : 'true'} title={canAddPart(holder.node) ? undefined : t('view.atLimit', { block: name })}
          onClick={() => {
            if (!canAddPart(holder.node)) { announce(t('view.atLimit', { block: name }), t('view.atLimit', { block: name })); return; }
            // (the cursor goes into the new part, so the focus goes to the text)
            if (v.run(addPart(holder.pos))) { announce(t('view.addedPart'), t('view.addedPartFull', { name: part })); }
          }}>
          {part}
        </button>
      ) : null}
      <span class="st-blockbar-sep" aria-hidden="true" />
      <button type="button" class="st-blockbar-btn st-blockbar-icon" id={id('up')} aria-label={t('block.moveUp')} title={t('block.moveUp')} aria-keyshortcuts={ariaKeys('Mod-Shift-ArrowUp')}
        aria-disabled={canMove(-1) ? undefined : 'true'} onClick={() => { if (canMove(-1)) move(-1)(); }}>↑</button>
      <button type="button" class="st-blockbar-btn st-blockbar-icon" id={id('down')} aria-label={t('block.moveDown')} title={t('block.moveDown')} aria-keyshortcuts={ariaKeys('Mod-Shift-ArrowDown')}
        aria-disabled={canMove(1) ? undefined : 'true'} onClick={() => { if (canMove(1)) move(1)(); }}>↓</button>
      <button type="button" class="st-blockbar-btn st-blockbar-icon" id={id('more')} aria-label={t('bar.more')} title={t('bar.more')} aria-haspopup="menu"
        aria-expanded={open.value?.kind === 'block'} onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          select();
          openBlockMenu({ left: r.left, top: where === 'toolbar' ? r.bottom : Math.max(8, r.top - 420) });
        }}>⋯</button>
      <button type="button" class="st-blockbar-btn" id={id('props')} onClick={() => properties()}>{t('block.properties')}</button>
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
      // a block's "!n" mark: Checks, filtered to the block (which the mark has selected)
      onProblems: () => showBlockChecks(),
    });
    visual.editor = editor;
    bridge.editor = editor;
    const detach = split.attach(editor);
    s.selectionTick.value++;
    // start where the author was, in view (switching from Source or ending Split; the source editor does the same):
    // the cursor is placed by `place`, and scrolled to once the blocks are laid out
    // (ProseMirror's own scrollIntoView did not move the editor's scroller this early: the block's element does)
    const shown = s.place.value ? requestAnimationFrame(() => {
      if (visual.editor !== editor) return;
      const { node } = editor.view.domAtPos(editor.view.state.selection.head);
      (node instanceof Element ? node : node.parentElement)?.scrollIntoView({ block: 'center' });
    }) : 0;
    return () => { cancelAnimationFrame(shown); editor.flush(); detach(); split.released(editor); if (visual.editor === editor) visual.editor = null; editor.destroy(); };
  }, []);
  const problems = s.problems.value;
  useEffect(() => { visual.editor?.showProblems(problems); }, [problems]);
  const label = t('editor.labelVisual');
  useEffect(() => { visual.editor?.setLabel(label); }, [label]);
  const p = editorPrefs.value;
  useEffect(() => { visual.editor?.setPrefs(p); }, [p]);
  const pop = open.value;
  return (
    <div class="st-visual" data-handles={p.handles} data-density={p.density}>
      <div class="st-editor st-visual-editor" id="editor" ref={host} />
      {pop?.kind === 'block' ? <BlockMenu at={pop.at} /> : null}
    </div>
  );
}
