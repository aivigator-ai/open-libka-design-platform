/**
 * The Structure tab: every block of the document as a tree (the WAI-ARIA tree pattern), synced with the editor's
 * selection, with problem counts and each block's menu (Shift+F10). In source mode it lists the headings.
 */
import { useRef, useState } from 'preact/hooks';
import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import { blockInfo, objectRange, posBefore, schema } from '@libka/editor';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { OutlinePanel } from './Panels.tsx';
import { openBlockMenu, visual } from './Visual.tsx';

interface TreeNode { id: string; pos: number; title: string; excerpt: string; level: number; problems: number; children: TreeNode[]; parent: TreeNode | null }

const NESTS = new Set(['directive', 'blockquote', 'footnote_definition']);

function build(doc: PMNode, problemsOf: (index: number) => number): TreeNode[] {
  const walk = (parentNode: PMNode, base: number, level: number, parent: TreeNode | null): TreeNode[] => {
    const out: TreeNode[] = [];
    parentNode.forEach((n, offset, index) => {
      if (n.type === schema.nodes.directive_label) return;
      const pos = base + offset;
      const label = n.type === schema.nodes.directive && n.firstChild?.type === schema.nodes.directive_label ? n.firstChild!.textContent : '';
      const text = (label || n.textBetween(0, n.content.size, ' ', ' ')).replace(/\s+/g, ' ').trim();
      const item: TreeNode = { id: `b${pos}`, pos, title: blockInfo(n, parentNode, s.lang.value).title, excerpt: text.length > 48 ? `${text.slice(0, 47)}…` : text, level, problems: level === 1 ? problemsOf(index) : 0, children: [], parent };
      if (NESTS.has(n.type.name)) item.children = walk(n, pos + 1, level + 1, item);
      out.push(item);
    });
    return out;
  };
  return walk(doc, 0, 1, null);
}

function problemCounter(): (index: number) => number {
  const v = visual.editor;
  if (!v) return () => 0;
  const { text, ranges } = v.current();
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  const lineOf = (o: number) => { let n = 0; while (n + 1 < starts.length && starts[n + 1]! <= o) n++; return n + 1; };
  const spans = ranges.map((r) => [lineOf(r.from), lineOf(Math.max(r.from, r.to - 1))] as const);
  return (i) => { const sp = spans[i]; return sp ? s.problems.value.filter((p) => p.line >= sp[0] && p.line <= sp[1]).length : 0; };
}

export function StructurePanel() {
  void s.selectionTick.value;
  void s.problems.value;
  const v = visual.editor;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const tree = useRef<HTMLUListElement>(null);
  if (s.shownMode.value === 'source' || !v) return <><p class="st-note">{t('structure.sourceNote')}</p><OutlinePanel /></>;
  const state = v.view.state;
  const nodes = build(state.doc, problemCounter());
  const r = objectRange(state);
  const selectedPos = r ? posBefore(r, r.start) : -1;
  const visible: TreeNode[] = [];
  const flatten = (list: TreeNode[]) => { for (const n of list) { visible.push(n); if (n.children.length && !collapsed.has(n.id)) flatten(n.children); } };
  flatten(nodes);
  const current = visible.find((n) => n.id === focus) ?? visible.find((n) => n.pos === selectedPos) ?? visible[0];
  const select = (n: TreeNode, toEditor: boolean) => {
    v.view.dispatch(v.view.state.tr.setSelection(NodeSelection.create(v.view.state.doc, n.pos)).scrollIntoView());
    if (toEditor) v.focus();
  };
  const all = new Map<string, TreeNode>();
  const index = (list: TreeNode[]) => { for (const n of list) { all.set(n.id, n); index(n.children); } };
  index(nodes);
  const toggle = (n: TreeNode, open: boolean) => setCollapsed((c) => { const next = new Set(c); if (open) next.delete(n.id); else next.add(n.id); return next; });
  /**
   * One handler for the whole tree, reading the items from the page as they are: keys pressed quickly in a row, while
   * the tree redraws, still go one item further each.
   */
  const key = (e: KeyboardEvent) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    const n = li && all.get(li.dataset.id ?? '');
    if (!li || !n || !tree.current) return;
    const items = Array.from(tree.current.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    const i = items.indexOf(li);
    const go = (el: HTMLElement | null | undefined) => { if (!el) return; el.focus(); setFocus(el.dataset.id ?? null); };
    const expanded = li.getAttribute('aria-expanded');
    const menu = () => { select(n, false); const rect = li.getBoundingClientRect(); openBlockMenu({ left: rect.left + 24, top: rect.top + 28 }); };
    switch (e.key) {
      case 'ArrowDown': go(items[i + 1]); break;
      case 'ArrowUp': go(items[i - 1]); break;
      case 'Home': go(items[0]); break;
      case 'End': go(items.at(-1)); break;
      case 'ArrowRight': if (expanded === 'false') toggle(n, true); else if (expanded === 'true') go(li.querySelector<HTMLElement>('[role="treeitem"]')); break;
      case 'ArrowLeft': if (expanded === 'true') toggle(n, false); else go(li.parentElement?.closest<HTMLElement>('[role="treeitem"]')); break;
      case 'Enter': select(n, true); break;
      case ' ': select(n, false); break;
      case 'F10': if (e.shiftKey) menu(); else return; break;
      case 'ContextMenu': menu(); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  const row = (n: TreeNode) => {
    const expanded = n.children.length ? !collapsed.has(n.id) : undefined;
    return (
      <li key={n.id} role="treeitem" data-id={n.id} aria-level={n.level} aria-expanded={expanded} aria-selected={n.pos === selectedPos}
        tabIndex={n === current ? 0 : -1} class="st-tree-item"
        onClick={(e) => { e.stopPropagation(); setFocus(n.id); select(n, false); }} onFocus={(e) => { if (e.target === e.currentTarget) setFocus(n.id); }}>
        <span class="st-tree-row">
          {n.children.length ? <span class="st-tree-twisty" aria-hidden="true" onClick={(e) => { e.stopPropagation(); toggle(n, Boolean(collapsed.has(n.id))); }}>{expanded ? '▾' : '▸'}</span> : <span class="st-tree-twisty" aria-hidden="true" />}
          <span class="st-tree-title">{n.title}</span>
          {n.excerpt ? <span class="st-tree-excerpt">{n.excerpt}</span> : null}
          {n.problems ? <span class="st-tree-badge">{t('structure.problems', { n: n.problems })}</span> : null}
        </span>
        {n.children.length && expanded ? <ul role="group">{n.children.map(row)}</ul> : null}
      </li>
    );
  };
  return (
    <>
      <p class="st-note st-tree-help">{t('structure.help')}</p>
      <ul class="st-tree" role="tree" aria-label={t('structure.label')} ref={tree} onKeyDown={key}>{nodes.map(row)}</ul>
    </>
  );
}
