/**
 * The visual editor: ProseMirror on the `@libka/editor` schema, editing the document as it looks. Blocks are objects:
 * Esc selects the block around the cursor (again: its parent), Enter goes back in, arrows move between blocks and
 * Shift+arrows select a run of them, Ctrl/Cmd+Shift+Up/Down move them. Handles and "+" buttons give the same actions
 * to the mouse; every drag has a click and a key path (WCAG 2.2 2.5.7). The Markdown underneath stays byte for byte
 * as it was wherever the author did not change it (`saveMapped`).
 */
import { baseKeymap, chainCommands, exitCode, toggleMark } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { DOMParser, Fragment, Slice, type Node as PMNode, type ParseOptions } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { EditorState, NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet, EditorView, type NodeView } from 'prosemirror-view';
import {
  blockAt, blockInfo, blocksFrom, BlockSelection, deleteBlocks, duplicateBlocks, enterBlock, extendSelection, insertBlocks, load, loadedRanges, markdownOf,
  markdownShortcuts, moveBlocks, objectRange, partTitle, posBefore, saveMapped, schema, selectParent, selectSibling, sliceFromMarkdown,
  type BlockRanges, type Lang, type Loaded,
} from '@libka/editor';
import type { Problem } from '@libka/model';
import type { ActiveEditor } from '../editor/active.ts';
import type { EditorPrefs } from '../state/prefs.ts';

export interface VisualOptions {
  parent: HTMLElement;
  text: string;
  label: string;
  /** Where to start: an offset in the Markdown (the block there is selected). */
  place?: number;
  prefs: EditorPrefs;
  onChange(text: string): void;
  /** The selection or the document changed (the Inspector and the structure follow). */
  onSelection(): void;
  /** The editor got the focus. */
  onFocus?(): void;
  onFiles(files: File[]): void;
  /** "/" in an empty paragraph, or a "+" button: the block menu, at a point on screen. */
  onInsertMenu(at: { left: number; top: number }): void;
  /** A handle, right-click, Shift+F10: the block's action menu. */
  onBlockMenu(at: { left: number; top: number }): void;
  /** Ctrl/Cmd+K on selected text: a link for it (without selected text the key goes on to the Studio: the command palette). */
  onLink(): void;
  /** A key typed while the block menu is opening (before its search field has the focus): it goes to the search. */
  menuKey(key: string): boolean;
  /** "?" on a selected block: the list of shortcuts. */
  onHelp(): void;
  /** A message for screen readers (moves, deletions). */
  announce(brief: string, full: string): void;
  /** The object URL of a project file, for pictures. */
  fileUrl(path: string): string | undefined;
  /** The language of the interface (block names, the editor's own words). */
  lang(): Lang;
  /** The document's own language (its text is read in it; the editor's own words in the interface's). */
  docLang(): string;
  /** The editor's own words in that language (`view.*` texts of the Studio). */
  say(key: ViewText, vars?: Record<string, string | number>): string;
  /** A block's problem marker was clicked: its problems and fixes are shown (the block is selected). */
  onProblems?(): void;
}

/** The words the visual editor itself shows or announces. */
export type ViewText = 'insertAfter' | 'actionsFor' | 'moved' | 'movedFull' | 'cannotMove' | 'alreadyFirst' | 'alreadyLast' | 'deleted' | 'deletedFull'
  | 'deletedMany' | 'kept' | 'keptLabel' | 'untitled' | 'problemsMark' | 'placeholder';

export interface VisualEditor extends ActiveEditor {
  view: EditorView;
  /** Runs a command on the editor (menus, the Inspector). */
  run(command: Command): boolean;
  /** Writes the latest text now (otherwise it follows a moment after typing). */
  flush(): void;
  setPrefs(prefs: EditorPrefs): void;
  /** The Markdown of the document and where each top-level block is in it. */
  current(): { text: string; ranges: BlockRanges };
  /** Where the top-level block with the cursor is in the Markdown (as last written). */
  blockRange(): { from: number; to: number } | null;
  /**
   * Selects the innermost block that starts on a source line (a problem's place): as an object (`block`), or with the
   * cursor at the end of its first text, such as its title (`text`). Falls back to the top-level block.
   */
  selectLine(line: number, how: 'block' | 'text'): void;
}

const blockMode = (s: EditorState) => s.selection instanceof NodeSelection || s.selection instanceof BlockSelection;
const onlyInBlockMode = (c: Command): Command => (state, dispatch, view) => blockMode(state) && c(state, dispatch, view);

/** The line of each top-level block's start and end in a text. */
function lineSpans(text: string, ranges: BlockRanges): [number, number][] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  const lineOf = (offset: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= offset) lo = mid; else hi = mid - 1; } return lo + 1; };
  return ranges.map((r) => [lineOf(r.from), lineOf(Math.max(r.from, r.to - 1))]);
}

/**
 * Reads what was typed with the text's line breaks kept. The editor shows a soft line break as one (white-space:
 * pre-wrap), but ProseMirror would read it back as a space, and an alert's "[!TIP]" line would join its message.
 */
class KeepLineBreaks extends DOMParser {
  override parse(dom: globalThis.Node, options: ParseOptions = {}): PMNode {
    return super.parse(dom, options.preserveWhitespace === true ? { ...options, preserveWhitespace: 'full' } : options);
  }
}
const domParser = new KeepLineBreaks(schema, DOMParser.fromSchema(schema).rules);

const decorationsKey = new PluginKey<DecorationSet>('libka-decorations');
/** A transaction carrying the other editor's text (Split): not reported back. */
const fromOtherSide = 'libka-from-other-side';

export function createVisualEditor(o: VisualOptions): VisualEditor {
  let prefs = o.prefs;
  let currentLabel = o.label;
  let loaded: Loaded = load(o.text);
  let latest = { text: o.text, ranges: loadedRanges(loaded) };
  let problemBlocks = new Map<number, string[]>();
  /** The top-level block being edited in the other editor of a Split. */
  let linkedIndex: number | null = null;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * A stable id per block node: widgets are keyed by it (not by position), so typing reuses every handle and mark
   * after the cursor instead of rebuilding them (a node keeps its identity while it is not edited).
   */
  const ids = new WeakMap<PMNode, number>();
  let nextId = 0;
  const idOf = (n: PMNode) => { let id = ids.get(n); if (id === undefined) { id = ++nextId; ids.set(n, id); } return id; };
  /** A widget's position when it is used (it moves as the text before it changes). */
  const at = (getPos: () => number | undefined) => getPos() ?? 0;

  /* ---------- decorations: selected runs, problems, placeholder, handles ---------- */
  function decorations(state: EditorState): DecorationSet {
    const decos: Decoration[] = [];
    const sel = state.selection;
    if (sel instanceof BlockSelection) {
      state.doc.nodesBetween(sel.from, sel.to, (n, pos) => { if (pos >= sel.from && pos + n.nodeSize <= sel.to && n.isBlock) { decos.push(Decoration.node(pos, pos + n.nodeSize, { class: 'ed-selected' })); return false; } return true; });
    }
    let index = 0;
    state.doc.forEach((n, pos) => {
      if (index === linkedIndex) decos.push(Decoration.node(pos, pos + n.nodeSize, { class: 'ed-linked' }));
      const issues = problemBlocks.get(index++);
      if (issues) {
        decos.push(Decoration.node(pos, pos + n.nodeSize, { class: 'ed-has-problem', 'data-problems': String(issues.length) }));
        decos.push(Decoration.widget(pos, (view, getPos) => problemMark(view, getPos, issues.length), { side: 1, key: `p${idOf(n)}-${issues.length}-${o.lang()}`, ignoreSelection: true }));
      }
    });
    // an empty paragraph at the cursor says what "/" does
    const $c = sel.$from;
    if (sel.empty && $c.parent.type === schema.nodes.paragraph && $c.parent.content.size === 0) {
      decos.push(Decoration.node($c.before(), $c.after(), { class: 'ed-empty', 'data-placeholder': o.say('placeholder') }));
    }
    // a handle (and a "+") for every block: top-level ones and blocks inside callouts, quotes and the like
    state.doc.descendants((n, pos, parent) => {
      if (!n.isBlock || ['directive_label', 'table_row', 'table_cell', 'list_item'].includes(n.type.name)) return false;
      if (parent && !['doc', 'directive', 'blockquote', 'footnote_definition'].includes(parent.type.name)) return false;
      // just before the block (never inside: a table cannot hold it)
      const within = parent && parent.type !== schema.nodes.doc ? (parent.attrs.name as string | undefined) ?? parent.type.name : '';
      decos.push(Decoration.widget(pos, (view, getPos) => handle(view, getPos, n, parent), { side: 1, key: `h${idOf(n)}-${within}-${o.lang()}`, ignoreSelection: true }));
      return n.type.name === 'directive' || n.type.name === 'blockquote' || n.type.name === 'footnote_definition';
    });
    return DecorationSet.create(state.doc, decos);
  }

  /** The mark on a block with problems: a click selects the block and shows its problems and fixes (the keyboard path: the Inspector and the Problems tab). */
  function problemMark(view: EditorView, getPos: () => number | undefined, count: number): HTMLElement {
    const mark = Object.assign(document.createElement('button'), { type: 'button', className: 'ed-problem-mark', tabIndex: -1, textContent: `! ${count}` });
    mark.contentEditable = 'false';
    mark.lang = o.lang();
    mark.setAttribute('aria-label', o.say('problemsMark', { n: count }));
    mark.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    mark.addEventListener('click', () => {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at(getPos))).scrollIntoView());
      o.onProblems?.();
    });
    return mark;
  }

  function handle(view: EditorView, getPos: () => number | undefined, n: PMNode, parent: PMNode | null): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'ed-handles';
    wrap.lang = o.lang();   // the interface's words, inside the document's text
    wrap.contentEditable = 'false';
    const title = blockInfo(n, parent, o.lang()).title;
    const plus = Object.assign(document.createElement('button'), { type: 'button', className: 'ed-plus', tabIndex: -1, textContent: '+' });
    plus.setAttribute('aria-label', o.say('insertAfter', { name: title }));
    const grip = Object.assign(document.createElement('button'), { type: 'button', className: 'ed-grip', tabIndex: -1, draggable: true });
    grip.setAttribute('aria-label', o.say('actionsFor', { name: title }));
    grip.innerHTML = '<svg aria-hidden="true" viewBox="0 0 10 16" width="10" height="16"><circle cx="2" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>';
    const select = () => { view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at(getPos)))); view.focus(); };
    grip.addEventListener('mousedown', (e) => { e.stopPropagation(); select(); });
    grip.addEventListener('click', (e) => { e.preventDefault(); const r = grip.getBoundingClientRect(); o.onBlockMenu({ left: r.left, top: r.bottom }); });
    grip.addEventListener('dragstart', (e) => {
      select();
      const slice = view.state.selection.content();
      e.dataTransfer?.setData('text/plain', markdownOf(slice, view.state.selection.$from));
      e.dataTransfer?.setDragImage(view.nodeDOM(at(getPos)) as Element ?? grip, 8, 8);
      view.dragging = { slice, move: true };
    });
    plus.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    plus.addEventListener('click', () => {
      select();
      run(insertBlocks(Fragment.from(schema.nodes.paragraph!.create())));
      const r = plus.getBoundingClientRect();
      o.onInsertMenu({ left: r.left, top: r.bottom });
    });
    wrap.append(grip, plus);
    return wrap;
  }

  /** The selection draws something of its own: a run of selected blocks, or the "/" hint in an empty paragraph. */
  const drawsSelection = (s: EditorState) => s.selection instanceof BlockSelection
    || (s.selection.empty && s.selection.$from.parent.type === schema.nodes.paragraph && s.selection.$from.parent.content.size === 0);
  /**
   * The change is text inside one non-empty paragraph or heading (typing): no block appears, moves or empties, so the
   * decorations only move along with the text. Anything else rebuilds them.
   */
  const textOnly = (tr: Transaction): boolean => tr.steps.every((step, i) => {
    if (!(step instanceof ReplaceStep)) return false;
    let block = false;
    step.slice.content.forEach((n) => { if (n.isBlock) block = true; });
    if (block || step.slice.openStart || step.slice.openEnd) return false;
    const doc = tr.docs[i]!;
    const $from = doc.resolve(step.from), $to = doc.resolve(step.to);
    const size = $from.parent.content.size;
    return $from.parent === $to.parent && $from.parent.isTextblock && size > 0 && size - (step.to - step.from) + step.slice.size > 0;
  });

  const decorationPlugin = new Plugin<DecorationSet>({
    key: decorationsKey,
    state: {
      init: (_c, state) => decorations(state),
      apply: (tr, old, before, state) => {
        if (tr.getMeta(decorationsKey) || drawsSelection(before) || drawsSelection(state)) return decorations(state);
        if (!tr.docChanged) return old;
        return textOnly(tr) ? old.map(tr.mapping, tr.doc) : decorations(state);
      },
    },
    props: { decorations: (state) => decorationsKey.getState(state) },
  });

  /* ---------- keys ---------- */
  const announceMove = (dir: -1 | 1): Command => (state, dispatch, view) => {
    const r = objectRange(state);
    const ok = moveBlocks(dir)(state, dispatch, view);
    if (ok && r && dispatch) {
      const n = r.parent.child(r.start);
      const name = blockInfo(n, r.parent, o.lang()).title;
      const place = (dir < 0 ? r.start : r.start + 1) + 1;
      o.announce(o.say('moved'), o.say('movedFull', { name, n: place, total: r.parent.childCount }));
    } else if (!ok && r) o.announce(o.say('cannotMove'), o.say(dir < 0 ? 'alreadyFirst' : 'alreadyLast', { name: blockInfo(r.parent.child(r.start), r.parent, o.lang()).title }));
    return ok;
  };
  const announceDelete: Command = (state, dispatch, view) => {
    const r = objectRange(state);
    const ok = deleteBlocks(state, dispatch, view);
    if (ok && r && dispatch) o.announce(o.say('deleted'), r.end - r.start === 1 ? o.say('deletedFull', { name: blockInfo(r.parent.child(r.start), r.parent, o.lang()).title }) : o.say('deletedMany', { n: r.end - r.start }));
    return ok;
  };
  const menuAtSelection = (open: (at: { left: number; top: number }) => void): Command => (state, _d, view) => {
    if (!view) return false;
    const r = objectRange(state);
    const pos = r ? posBefore(r, r.start) : state.selection.from;
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    const rect = dom?.getBoundingClientRect?.() ?? view.coordsAtPos(state.selection.from);
    open({ left: rect.left, top: rect.bottom ?? rect.top });
    return true;
  };
  /** The block at a point on screen is selected and its menu opens there (right-click, long press). */
  const menuAtPoint = (v: EditorView, x: number, y: number): boolean => {
    const pos = v.posAtCoords({ left: x, top: y });
    if (!pos) return false;
    // the selected blocks stay selected when the pointer is on them; otherwise the block under it is chosen
    const sel = v.state.selection;
    if (!blockMode(v.state) || pos.pos < sel.from || pos.pos > sel.to) {
      v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(pos.pos))));
      selectParent(v.state, v.dispatch, v);
    }
    o.onBlockMenu({ left: x, top: y });
    return true;
  };
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressAt: { x: number; y: number } | null = null;
  /** When a long press last opened a menu. */
  let longPressed = 0;
  const N = schema.nodes, M = schema.marks;
  const keys = keymap({
    'Escape': selectParent,
    'Shift-Enter': chainCommands(onlyInBlockMode(selectParent), (state, dispatch) => { if (dispatch) dispatch(state.tr.replaceSelectionWith(N.hard_break!.create()).scrollIntoView()); return true; }),
    'Enter': chainCommands(enterBlock, splitListItem(N.list_item!)),
    'ArrowUp': onlyInBlockMode(selectSibling(-1)),
    'ArrowDown': onlyInBlockMode(selectSibling(1)),
    'Shift-ArrowUp': onlyInBlockMode(extendSelection(-1)),
    'Shift-ArrowDown': onlyInBlockMode(extendSelection(1)),
    'Mod-Shift-ArrowUp': announceMove(-1),
    'Mod-Shift-ArrowDown': announceMove(1),
    'Mod-d': duplicateBlocks,
    'Backspace': onlyInBlockMode(announceDelete),
    'Delete': onlyInBlockMode(announceDelete),
    'Mod-Shift-Enter': (state, dispatch, view) => {
      if (!insertBlocks(Fragment.from(N.paragraph!.create()))(state, dispatch, view)) return false;
      setTimeout(() => menuAtSelection(o.onInsertMenu)(editor.view.state, undefined, editor.view), 0);
      return true;
    },
    'Mod-/': menuAtSelection(o.onBlockMenu),
    'Shift-F10': menuAtSelection(o.onBlockMenu),
    'ContextMenu': menuAtSelection(o.onBlockMenu),
    '?': onlyInBlockMode(() => { o.onHelp(); return true; }),
    'Mod-b': toggleMark(M.strong!), 'Mod-i': toggleMark(M.em!), 'Mod-e': toggleMark(M.code!), 'Mod-Shift-x': toggleMark(M.strike!),
    'Mod-k': (state) => { if (state.selection.empty || blockMode(state)) return false; o.onLink(); return true; },
    'Mod-]': sinkListItem(N.list_item!), 'Mod-[': liftListItem(N.list_item!),
    'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo,
    'Mod-Enter': exitCode,
    // the start and the end of the document, from text or from a selected block
    'Mod-Home': (state, dispatch) => { if (dispatch) dispatch(state.tr.setSelection(Selection.atStart(state.doc)).scrollIntoView()); return true; },
    'Mod-End': (state, dispatch) => { if (dispatch) dispatch(state.tr.setSelection(Selection.atEnd(state.doc)).scrollIntoView()); return true; },
  });

  /* ---------- node views: pictures from the project, islands, the document's properties ---------- */
  /** The node views that show a block's name, each rewriting it in a new interface language. */
  const relabels = new Set<() => void>();
  /** A node view that is relabelled with the others, and filled again for every change of its node. */
  const named = (node: PMNode, dom: HTMLElement, fill: (n: PMNode) => void, contentDOM: HTMLElement | null = null): NodeView => {
    let current = node;
    const relabel = () => fill(current);
    fill(node);
    relabels.add(relabel);
    return {
      dom, contentDOM,
      update(n) { if (n.type !== node.type) return false; current = n; fill(n); return true; },
      destroy() { relabels.delete(relabel); },
    };
  };
  const nodeViews: Record<string, (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView> = {
    image(node) {
      const img = document.createElement('img');
      const set = (n: PMNode) => { img.src = o.fileUrl(n.attrs.src) ?? n.attrs.src; img.alt = n.attrs.alt; img.className = 'ed-image'; };
      set(node);
      return { dom: img, update(n) { if (n.type !== node.type) return false; set(n); return true; } };
    },
    source(node, view, getPos) {
      const dom = document.createElement('div');
      dom.className = 'ed-source';
      const label = Object.assign(document.createElement('span'), { className: 'ed-source-label', textContent: o.say('kept') });
      const area = Object.assign(document.createElement('textarea'), { className: 'ed-source-text', value: node.attrs.text, spellcheck: false });
      area.setAttribute('aria-label', o.say('keptLabel'));
      area.rows = Math.min(12, node.attrs.text.split('\n').length);
      area.addEventListener('change', () => {
        const pos = getPos();
        if (pos !== undefined) view.dispatch(view.state.tr.setNodeMarkup(pos, null, { text: area.value }));
      });
      dom.append(label, area);
      return {
        dom,
        update(n) { if (n.type !== node.type) return false; if (area.value !== n.attrs.text) area.value = n.attrs.text; return true; },
        stopEvent: (e) => e.target === area,
        ignoreMutation: () => true,
      };
    },
    // a LibKa block: a group named by its title ("Callout"), the name shown above its content
    directive(node, view, getPos) {
      const dom = document.createElement('div');
      const head = Object.assign(document.createElement('span'), { className: 'ed-dhead' });
      head.contentEditable = 'false';
      head.setAttribute('aria-hidden', 'true');
      const body = Object.assign(document.createElement('div'), { className: 'ed-dbody' });
      const fill = (n: PMNode) => {
        const pos = getPos();
        const parent = pos === undefined ? null : view.state.doc.resolve(pos).parent;
        const title = blockInfo(n, parent, o.lang()).title;
        dom.className = `ed-directive ed-${n.attrs.name}`;
        dom.dataset.name = n.attrs.name;
        if (n.attrs.attributes.variant) dom.dataset.variant = n.attrs.attributes.variant; else delete dom.dataset.variant;
        dom.setAttribute('role', 'group');
        dom.setAttribute('aria-label', title);
        head.textContent = title;
      };
      dom.append(head, body);
      return named(node, dom, fill, body);
    },
    leaf_directive(node, view, getPos) {
      const dom = document.createElement('div');
      const head = Object.assign(document.createElement('span'), { className: 'ed-lhead' });
      head.contentEditable = 'false';
      const body = Object.assign(document.createElement('span'), { className: 'ed-lbody' });
      const fill = (n: PMNode) => {
        const pos = getPos();
        const parent = pos === undefined ? null : view.state.doc.resolve(pos).parent;
        dom.className = `ed-leaf ed-${n.attrs.name}`;
        if (n.attrs.attributes.variant) dom.dataset.variant = n.attrs.attributes.variant; else delete dom.dataset.variant;
        head.textContent = `${blockInfo(n, parent, o.lang()).title}:`;
      };
      dom.append(head, ' ', body);
      return named(node, dom, fill, body);
    },
    front_matter(node) {
      const dom = document.createElement('div');
      dom.className = 'ed-front-matter';
      const fill = (n: PMNode) => {
        const title = /^title:\s*(.+)$/m.exec(n.attrs.value)?.[1]?.replace(/^["']|["']$/g, '') ?? '';
        dom.replaceChildren(
          Object.assign(document.createElement('span'), { className: 'ed-fm-kind', textContent: partTitle('front_matter', o.lang()) }),
          Object.assign(document.createElement('span'), { className: 'ed-fm-title', textContent: title || o.say('untitled') }),
        );
      };
      return named(node, dom, fill);
    },
  };

  /* ---------- the view ---------- */
  const plugins = () => [
    keys,
    ...(prefs.shortcuts ? [markdownShortcuts()] : []),
    history(),
    keymap(baseKeymap),
    dropCursor({ class: 'ed-dropcursor', width: 3 }),
    gapCursor(),
    decorationPlugin,
  ];
  const makeState = (doc: PMNode, place?: number) => {
    let selection;
    if (place !== undefined) {
      const index = blockAt(latest.ranges, place);
      let pos = 0;
      for (let i = 0; i < Math.min(index, doc.childCount); i++) pos += doc.child(i).nodeSize;
      selection = TextSelection.near(doc.resolve(Math.min(pos + 1, doc.content.size)), 1);
    }
    return EditorState.create({ doc, plugins: plugins(), ...(selection ? { selection } : {}) });
  };

  function emit(): void {
    clearTimeout(changeTimer);
    changeTimer = undefined;
    const before = latest.text;
    latest = saveMapped(view.state.doc, loaded);
    if (latest.text !== before) o.onChange(latest.text);
  }
  function run(c: Command): boolean { const ok = c(view.state, view.dispatch, view); view.focus(); return ok; }

  const view: EditorView = new EditorView(o.parent, {
    state: makeState(loaded.doc, o.place),
    nodeViews,
    domParser,
    clipboardParser: DOMParser.fromSchema(schema),
    attributes: () => ({ 'aria-label': currentLabel, 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true', class: 'ed-root', tabindex: '0', lang: o.docLang() }),
    clipboardTextSerializer: (slice, v) => markdownOf(slice, v.state.selection.$from),
    clipboardTextParser: (text, $context) => ($context.parent.type.spec.code ? new Slice(Fragment.from(schema.text(text)), 0, 0) : sliceFromMarkdown(text)),
    handlePaste(_v, e) {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return false;
      o.onFiles(files);
      return true;
    },
    handleDrop(_v, e) {
      const files = Array.from((e as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return false;
      o.onFiles(files);
      return true;
    },
    handleKeyDown(_v, e) {
      return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && o.menuKey(e.key);
    },
    handleTextInput(v, from, to, text) {
      // "/" in an empty paragraph opens the block menu instead of typing
      const $from = v.state.doc.resolve(from);
      if (text === '/' && from === to && $from.parent.type === schema.nodes.paragraph && $from.parent.content.size === 0) {
        const c = v.coordsAtPos(from);
        o.onInsertMenu({ left: c.left, top: c.bottom });
        return true;
      }
      return false;
    },
    handleDOMEvents: {
      focus() { o.onFocus?.(); return false; },
      contextmenu(v, e) {
        // right-click: the block under the pointer is selected and its menu opens (as the handle does)
        e.preventDefault();
        // a long press opened the menu already (Android also sends this event after one)
        if (Date.now() - longPressed < 1000) return true;
        // the browser's own long press (Chrome) comes first: it opens the menu, and the press timer stays quiet
        clearTimeout(pressTimer);
        if (e.clientX !== 0 || e.clientY !== 0) longPressed = Date.now();
        // from the keyboard (Shift+F10, the menu key) the event has no pointer: the menu opens at the selection
        if (e.clientX === 0 && e.clientY === 0) return menuAtSelection(o.onBlockMenu)(v.state, undefined, v);
        return menuAtPoint(v, e.clientX, e.clientY);
      },
      // a long press on a touch screen opens the block's menu, as a right-click does (iPad Safari sends no contextmenu)
      touchstart(v, e) {
        const t = e.touches[0];
        clearTimeout(pressTimer);
        if (!t || e.touches.length > 1) return false;
        pressAt = { x: t.clientX, y: t.clientY };
        pressTimer = setTimeout(() => { longPressed = Date.now(); menuAtPoint(v, pressAt!.x, pressAt!.y); }, 550);
        return false;
      },
      touchmove(_v, e) {
        const t = e.touches[0];
        if (t && pressAt && Math.hypot(t.clientX - pressAt.x, t.clientY - pressAt.y) > 10) clearTimeout(pressTimer);
        return false;
      },
      touchend(_v, e) {
        clearTimeout(pressTimer);
        // the press opened the menu: the lift is not a tap (no click, no caret move)
        if (Date.now() - longPressed < 1500) { e.preventDefault(); return true; }
        return false;
      },
      touchcancel() { clearTimeout(pressTimer); return false; },
    },
    dispatchTransaction(tr: Transaction) {
      const state = view.state.apply(tr);
      view.updateState(state);
      if (tr.docChanged && !tr.getMeta(fromOtherSide)) { clearTimeout(changeTimer); changeTimer = setTimeout(emit, 150); }
      if (tr.docChanged || tr.selectionSet) o.onSelection();
      if (prefs.typewriter && (tr.selectionSet || tr.docChanged)) requestAnimationFrame(centre);
    },
  });

  /** A transaction replacing the top-level blocks that differ from a newly loaded text (null: none differ). */
  function replaceChanged(next: Loaded): { tr: Transaction; from: number } | null {
    const old = view.state.doc;
    const nodes: PMNode[] = [];
    next.doc.forEach((n) => nodes.push(n));
    let head = 0;
    while (head < old.childCount && head < nodes.length && old.child(head).eq(nodes[head]!)) head++;
    let tail = 0;
    while (tail < old.childCount - head && tail < nodes.length - head && old.child(old.childCount - 1 - tail).eq(nodes[nodes.length - 1 - tail]!)) tail++;
    if (head === old.childCount && head === nodes.length) return null;
    let from = 0;
    for (let i = 0; i < head; i++) from += old.child(i).nodeSize;
    let to = old.content.size;
    for (let i = 0; i < tail; i++) to -= old.child(old.childCount - 1 - i).nodeSize;
    return { tr: view.state.tr.replaceWith(from, to, nodes.slice(head, nodes.length - tail)), from };
  }

  /** Typewriter scrolling: the line being edited in the middle of the editor. */
  function centre(): void {
    const scroller = o.parent;
    try {
      const c = view.coordsAtPos(view.state.selection.head);
      const box = scroller.getBoundingClientRect();
      scroller.scrollTop += (c.top + c.bottom) / 2 - (box.top + box.height / 2);
    } catch { /* not laid out */ }
  }

  const editor: VisualEditor = {
    mode: 'visual',
    view,
    run,
    flush: () => { if (changeTimer !== undefined) emit(); },
    current: () => latest,
    text: () => latest.text,
    textSelected: () => !view.state.selection.empty && !blockMode(view.state),
    linkHref: () => schema.marks.link!.isInSet(view.state.selection.$from.marks())?.attrs.href as string | undefined,
    setLink(href) {
      const { from, to } = view.state.selection;
      if (from === to) return;
      const tr = view.state.tr.removeMark(from, to, schema.marks.link);
      if (href) tr.addMark(from, to, schema.marks.link!.create({ href }));
      view.dispatch(tr);
    },
    setPrefs(next) {
      const shortcutsChanged = next.shortcuts !== prefs.shortcuts;
      prefs = next;
      if (shortcutsChanged) view.updateState(view.state.reconfigure({ plugins: plugins() }));
    },
    replaceAll(text) {
      // only the blocks that differ are replaced, in one step the author can undo; the others stay as they are
      const next = load(text);
      const change = replaceChanged(next);
      loaded = next;
      if (!change) return;
      const { tr, from } = change;
      view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from + 1, tr.doc.content.size)))).scrollIntoView());
      emit();
    },
    sync(text) {
      if (text === latest.text) return;
      const next = load(text);
      const change = replaceChanged(next);
      loaded = next;
      latest = { text, ranges: loadedRanges(next) };
      // the selection maps through the change; the other side's change is not a step of this editor's undo
      if (change) view.dispatch(change.tr.setMeta(fromOtherSide, true).setMeta('addToHistory', false));
    },
    link(range, reveal) {
      const index = range ? blockAt(latest.ranges, range.from) : null;
      if (index === linkedIndex) return;
      linkedIndex = index;
      view.dispatch(view.state.tr.setMeta(decorationsKey, true));
      if (reveal && index !== null && index < view.state.doc.childCount) {
        let pos = 0;
        for (let i = 0; i < index; i++) pos += view.state.doc.child(i).nodeSize;
        (view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
      }
    },
    selectLine(line, how) {
      emit();
      const fresh = load(latest.text);
      // the path (child indexes) to the innermost block that starts on the line, found in the text as written
      let path: number[] | null = null;
      const walk = (node: PMNode, trail: number[]) => node.forEach((child, _o, i) => {
        if (!child.isBlock) return;
        const here = [...trail, i];
        if (fresh.lines.get(child) === line) path = here;
        walk(child, here);
      });
      walk(fresh.doc, []);
      if (!path) { editor.goToLine(line); return; }
      // the same path in the editor's document (the same text, so the same shape)
      const doc = view.state.doc;
      let node: PMNode = doc, start = 0, at = -1;
      for (const i of path as number[]) {
        if (i >= node.childCount) { editor.goToLine(line); return; }
        let p = start;
        for (let k = 0; k < i; k++) p += node.child(k).nodeSize;
        at = p;
        node = node.child(i);
        start = p + 1;
      }
      let selection: Selection = NodeSelection.create(doc, at);
      // a block without its title gets an empty one to write in (its first text would be the body)
      if (how === 'text' && node.type === schema.nodes.directive && node.firstChild?.type !== schema.nodes.directive_label) {
        const tr = view.state.tr.insert(at + 1, schema.nodes.directive_label!.create());
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
        view.focus();
        return;
      }
      if (how === 'text') {
        let caret = node.isTextblock ? at + node.nodeSize - 1 : -1;
        if (caret < 0) node.descendants((n, p) => { if (caret < 0 && n.isTextblock) caret = at + 1 + p + n.nodeSize - 1; return caret < 0; });
        if (caret >= 0) selection = TextSelection.create(doc, caret);
      }
      view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
      view.focus();
    },
    blockRange() {
      const r = objectRange(view.state);
      const index = r ? view.state.doc.resolve(posBefore(r, r.start)).index(0) : view.state.selection.$from.index(0);
      return latest.ranges[Math.min(index, latest.ranges.length - 1)] ?? null;
    },
    insertMarkdown(markdown) { run(insertBlocks(blocksFrom(markdown))); },
    goToLine(line) {
      emit();
      const spans = lineSpans(latest.text, latest.ranges);
      const index = Math.max(0, spans.findIndex(([a, b]) => line >= a && line <= b));
      let pos = 0;
      for (let i = 0; i < index; i++) pos += view.state.doc.child(i).nodeSize;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).scrollIntoView());
      view.focus();
    },
    showProblems(problems: readonly Problem[]) {
      const spans = lineSpans(latest.text, latest.ranges);
      problemBlocks = new Map();
      for (const p of problems) {
        const i = spans.findIndex(([a, b]) => p.line >= a && p.line <= b);
        const at = i >= 0 ? i : spans.findIndex(([a]) => a > p.line) - 1;
        if (at < 0) continue;
        problemBlocks.set(at, [...(problemBlocks.get(at) ?? []), p.message]);
      }
      view.dispatch(view.state.tr.setMeta(decorationsKey, true));
    },
    // a new interface language: the label, and the names on the blocks and their handles
    setLabel(label) {
      currentLabel = label;
      view.setProps({ nodeViews: { ...nodeViews } });
      for (const relabel of relabels) relabel();
      view.dispatch(view.state.tr.setMeta(decorationsKey, true));
    },
    focus() { view.focus(); },
    offset() {
      emit();
      const r = objectRange(view.state);
      // the top-level block the selection is in
      const index = r ? view.state.doc.resolve(posBefore(r, r.start)).index(0) : view.state.selection.$from.index(0);
      return latest.ranges[Math.min(index, latest.ranges.length - 1)]?.from ?? 0;
    },
    selection() {
      const sel = view.state.selection;
      if (sel instanceof NodeSelection || sel instanceof BlockSelection) return markdownOf(sel.content(), sel.$from);
      return view.state.doc.textBetween(sel.from, sel.to, '\n');
    },
    destroy() { clearTimeout(changeTimer); view.destroy(); },
  };
  return editor;
}
