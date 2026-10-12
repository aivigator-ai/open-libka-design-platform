/**
 * Editing blocks as objects: selecting a block, its parent, its siblings or a run of them; moving, duplicating and
 * deleting them; changing a block's type (saying what would be lost); wrapping and unwrapping; inserting. Every
 * command is a ProseMirror command, so the Studio binds it to keys, menus and the Inspector alike.
 */
import { Fragment, Slice, type Node as PMNode, type ResolvedPos } from 'prosemirror-model';
import { NodeSelection, Selection, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import type { Mapping } from 'prosemirror-transform';
import { BLOCKS, block as definition } from '@libka/blocks';
import { blocksFrom } from './blocks.ts';
import { save } from './markdown.ts';
import { schema } from './schema.ts';
import { blockTitle, partTitle, type Lang, type Part } from './names.ts';

/** Nodes whose children are blocks the author can select, move and so on. */
const CONTAINERS = new Set(['doc', 'directive', 'blockquote', 'footnote_definition', 'list_item', 'bullet_list', 'ordered_list']);
/** Parts of a block, never objects of their own. */
const PARTS = new Set(['directive_label', 'table_row', 'table_cell']);
const isObject = (n: PMNode) => n.isBlock && !PARTS.has(n.type.name);

/** A run of sibling blocks selected as objects (Shift+Arrow in block mode); a single one is a NodeSelection. */
export class BlockSelection extends Selection {
  constructor($from: ResolvedPos, $to: ResolvedPos) {
    super($from, $to);
    // drawn by the editor as outlined blocks, not as highlighted text
    this.visible = false;
  }
  override map(doc: PMNode, mapping: Mapping): Selection {
    const $from = doc.resolve(mapping.map(this.from, 1)), $to = doc.resolve(mapping.map(this.to, -1));
    return $from.depth === $to.depth && $from.sameParent($to) && $from.pos < $to.pos ? new BlockSelection($from, $to) : Selection.near($from);
  }
  override eq(other: Selection): boolean { return other instanceof BlockSelection && other.from === this.from && other.to === this.to; }
  override toJSON(): { type: string; anchor: number; head: number } { return { type: 'block', anchor: this.from, head: this.to }; }
  static fromJSON(doc: PMNode, json: { anchor: number; head: number }): BlockSelection { return new BlockSelection(doc.resolve(json.anchor), doc.resolve(json.head)); }
}
Selection.jsonID('libka-block', BlockSelection);

/** The selected objects: siblings `start` to `end - 1` in `parent`, which sits at `depth`. */
export interface ObjectRange { parent: PMNode; depth: number; start: number; end: number; $pos: ResolvedPos }

/** The position before the child at `index` of the parent the range is in. */
export const posBefore = (r: ObjectRange, index: number): number => r.$pos.posAtIndex(index, r.depth);
/** The objects of the range. */
export const objectsOf = (r: ObjectRange): PMNode[] => Array.from({ length: r.end - r.start }, (_, i) => r.parent.child(r.start + i));

/** The object or objects the selection is on (null between blocks or with nothing to act on). */
export function objectRange(state: EditorState): ObjectRange | null {
  const sel = state.selection;
  if (sel instanceof BlockSelection) {
    const $from = sel.$from;
    return { parent: $from.parent, depth: $from.depth, start: $from.index(), end: sel.$to.index(), $pos: $from };
  }
  if (sel instanceof NodeSelection && sel.node.isBlock) {
    const $from = sel.$from;
    if (!isObject(sel.node)) {
      // a part (a block's title row, a table row) stands for the block it belongs to
      if (!sel.node.isBlock || $from.depth === 0) return null;
      const d = $from.depth;
      return { parent: $from.node(d - 1), depth: d - 1, start: $from.index(d - 1), end: $from.index(d - 1) + 1, $pos: $from };
    }
    return { parent: $from.parent, depth: $from.depth, start: $from.index(), end: $from.index() + 1, $pos: $from };
  }
  // a text selection, or a selected inline node (a picture, a key): the block it sits in
  const { $from, $to } = sel;
  if (!sel.empty && !$from.sameParent($to) && !(sel instanceof NodeSelection)) {
    // a text selection over several blocks: the run of siblings it covers, in the innermost container holding both
    const range = $from.blockRange($to, (n) => CONTAINERS.has(n.type.name));
    if (range) {
      // a block's title row is never one of the objects of a run
      const start = range.parent.child(range.startIndex).type.name === 'directive_label' ? range.startIndex + 1 : range.startIndex;
      if (start < range.endIndex) return { parent: range.parent, depth: range.depth, start, end: range.endIndex, $pos: range.$from };
    }
  }
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (!isObject(n)) continue;
    // the first paragraph of a list item stands for the item
    const item = d > 1 && $from.node(d - 1).type === schema.nodes.list_item && $from.index(d - 1) === 0 && n.type === schema.nodes.paragraph;
    const at = item ? d - 1 : d;
    return { parent: $from.node(at - 1), depth: at - 1, start: $from.index(at - 1), end: $from.index(at - 1) + 1, $pos: $from };
  }
  return null;
}

/** The innermost single object at the selection, with its parent and position (for the Inspector). */
export function selectedObject(state: EditorState): { node: PMNode; parent: PMNode; pos: number } | null {
  const r = objectRange(state);
  if (!r || r.end - r.start !== 1) return null;
  return { node: r.parent.child(r.start), parent: r.parent, pos: posBefore(r, r.start) };
}

const selectNode = (tr: Transaction, pos: number) => tr.setSelection(NodeSelection.create(tr.doc, pos)).scrollIntoView();

/** Esc and Shift+Enter: select the block around the cursor; on a selected block, its parent. */
export const selectParent: Command = (state, dispatch) => {
  const sel = state.selection;
  if (sel instanceof NodeSelection || sel instanceof BlockSelection) {
    const $from = sel.$from;
    if ($from.depth === 0) return false;
    // climb to the nearest ancestor that is an object (a list item's list, a callout around a paragraph)
    for (let d = $from.depth; d > 0; d--) {
      if (isObject($from.node(d))) { if (dispatch) dispatch(selectNode(state.tr, $from.before(d))); return true; }
    }
    return false;
  }
  const r = objectRange(state);
  if (!r) return false;
  if (dispatch) {
    const pos = posBefore(r, r.start);
    dispatch(r.end - r.start === 1 ? selectNode(state.tr, pos) : state.tr.setSelection(new BlockSelection(state.doc.resolve(pos), state.doc.resolve(posBefore(r, r.end)))));
  }
  return true;
};

/** Enter on a selected block: into its text, or onto its first block. */
export const enterBlock: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection)) return false;
  const n = sel.node;
  if (n.isAtom) return false;
  if (dispatch) {
    const inside = sel.from + 1;
    const first = n.firstChild;
    if (n.isTextblock || first?.type === schema.nodes.directive_label || !first || !isObject(first)) {
      dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(inside), 1)).scrollIntoView());
    } else dispatch(selectNode(state.tr, inside));
  }
  return true;
};

/** Arrow keys on a selected block: the previous or next block beside it. */
export function selectSibling(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!(sel instanceof NodeSelection || sel instanceof BlockSelection)) return false;
    const r = objectRange(state);
    if (!r) return false;
    const index = dir < 0 ? r.start - 1 : r.end;
    if (index < 0 || index >= r.parent.childCount || !isObject(r.parent.child(index))) return false;
    if (dispatch) dispatch(selectNode(state.tr, posBefore(r, index)));
    return true;
  };
}

/** Shift+Arrow on selected blocks: take in the block above or below too. */
export function extendSelection(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!(sel instanceof NodeSelection || sel instanceof BlockSelection)) return false;
    const r = objectRange(state);
    if (!r) return false;
    const start = dir < 0 ? r.start - 1 : r.start, end = dir > 0 ? r.end + 1 : r.end;
    if (start < 0 || end > r.parent.childCount || !isObject(r.parent.child(dir < 0 ? start : end - 1))) return false;
    if (dispatch) dispatch(state.tr.setSelection(new BlockSelection(state.doc.resolve(posBefore(r, start)), state.doc.resolve(posBefore(r, end)))).scrollIntoView());
    return true;
  };
}

/** Selects the same objects again after a change that moved them (`from` is where the first one now starts). */
function reselect(tr: Transaction, from: number, count: number): Transaction {
  const $from = tr.doc.resolve(from);
  if (count === 1) return selectNode(tr, from);
  const parent = $from.parent, index = $from.index();
  let to = from;
  for (let i = 0; i < count; i++) to += parent.child(index + i).nodeSize;
  return tr.setSelection(new BlockSelection($from, tr.doc.resolve(to))).scrollIntoView();
}

/** Ctrl/Cmd+Shift+Up/Down: moves the selected blocks (or the block at the cursor) one place up or down. */
export function moveBlocks(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const r = objectRange(state);
    if (!r) return false;
    const neighbour = dir < 0 ? r.start - 1 : r.end;
    if (neighbour < 0 || neighbour >= r.parent.childCount || !isObject(r.parent.child(neighbour))) return false;
    if (dispatch) {
      // the neighbour moves to the other side: the selected nodes themselves stay untouched
      const node = r.parent.child(neighbour);
      const at = posBefore(r, neighbour);
      const tr = state.tr.delete(at, at + node.nodeSize);
      const target = dir < 0 ? tr.mapping.map(posBefore(r, r.end)) : tr.mapping.map(posBefore(r, r.start));
      tr.insert(target, node);
      const wasText = !(state.selection instanceof NodeSelection || state.selection instanceof BlockSelection);
      if (wasText) dispatch(tr.scrollIntoView());   // the cursor stays in its text, mapped
      else dispatch(reselect(tr, dir < 0 ? posBefore(r, r.start) - node.nodeSize : posBefore(r, r.start) + node.nodeSize, r.end - r.start));
    }
    return true;
  };
}

/** Duplicates the selected blocks below themselves and selects the copies. */
export const duplicateBlocks: Command = (state, dispatch) => {
  const r = objectRange(state);
  if (!r) return false;
  if (dispatch) {
    const at = posBefore(r, r.end);
    const tr = state.tr.insert(at, objectsOf(r));
    dispatch(reselect(tr, at, r.end - r.start));
  }
  return true;
};

/** Deletes the selected blocks (or the block at the cursor). */
export const deleteBlocks: Command = (state, dispatch) => {
  const r = objectRange(state);
  if (!r) return false;
  if (dispatch) {
    const from = posBefore(r, r.start), to = posBefore(r, r.end);
    const tr = state.tr;
    // a container that would be left empty, or a document without blocks, gets an empty paragraph instead
    const empty = r.end - r.start === r.parent.childCount && (r.parent.type === schema.nodes.doc || !r.parent.type.contentMatch.validEnd);
    if (empty) tr.replaceWith(from, to, schema.nodes.paragraph!.create()); else tr.delete(from, to);
    dispatch(tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size)), -1)).scrollIntoView());
  }
  return true;
};

/**
 * Inserts blocks after the selected block (or in place of an empty paragraph at the cursor), at the nearest level that
 * can hold them, and puts the cursor at the start of the first inserted text.
 */
export function insertBlocks(content: Fragment): Command {
  return (state, dispatch) => {
    const r = objectRange(state);
    const tr = state.tr;
    let at: number;
    let replaceTo = -1;
    if (!r) at = state.selection.from;
    else {
      const only = r.end - r.start === 1 ? r.parent.child(r.start) : null;
      at = posBefore(r, r.end);
      if (only && only.type === schema.nodes.paragraph && only.content.size === 0 && !(state.selection instanceof NodeSelection)) {
        at = posBefore(r, r.start);
        replaceTo = at + only.nodeSize;
      }
    }
    // climb out of containers that cannot hold these blocks here (a list holds only items)
    let $at = state.doc.resolve(at);
    while ($at.depth > 0 && !$at.parent.canReplace($at.index(), replaceTo > 0 ? $at.index() + 1 : $at.index(), content)) {
      at = $at.after();
      replaceTo = -1;
      $at = state.doc.resolve(at);
    }
    if (replaceTo > 0) tr.replaceWith(at, replaceTo, content); else tr.insert(at, content);
    if (dispatch) dispatch(tr.setSelection(Selection.near(tr.doc.resolve(at + 1), 1)).scrollIntoView());
    return true;
  };
}

/** Inserts the registry's example of a block (with a paragraph, the empty paragraph it needs). */
export function insertBlock(name: string): Command {
  const def = definition(name);
  const content = name === 'paragraph' || !def ? Fragment.from(schema.nodes.paragraph!.create()) : blocksFrom(def.example);
  return insertBlocks(content);
}

/* ---------- change type, wrap, unwrap ---------- */

/** One way to change a block's type: what it becomes, what would be lost, and how. */
export interface Conversion { key: string; title: string; lost: string[]; apply(tr: Transaction, pos: number, node: PMNode): void }

/**
 * Blocks that hold running content (paragraphs, lists, quotes): one can become another and still make sense. Other
 * blocks have their own structure (a contents list, release notes, tabs), so they are not offered as a new type.
 */
const TEXT_HOLDERS = ['callout', 'summary', 'quote', 'statement', 'notes'].filter((n) => BLOCKS.some((b) => b.name === n));

/** The types a block can change into, keeping its content, named in `lang`. */
export function conversionsFor(node: PMNode, lang: Lang = 'en'): Conversion[] {
  const N = schema.nodes;
  const out: Conversion[] = [];
  const name = (part: Part, vars?: Record<string, string | number>) => partTitle(part, lang, vars);
  const markup = (key: string, title: string, type: typeof N.paragraph, attrs: Record<string, unknown> | null, lost: string[] = []) =>
    out.push({ key, title, lost, apply: (tr, pos) => { tr.setNodeMarkup(pos, type, attrs); } });
  if (node.type === N.paragraph || node.type === N.heading) {
    if (node.type !== N.paragraph) markup('paragraph', blockTitle('paragraph', lang), N.paragraph!, null);
    for (const level of [1, 2, 3, 4]) if (node.type !== N.heading || node.attrs.level !== level) markup(`heading${level}`, name('heading', { n: level }), N.heading!, { level });
    if (node.type === N.paragraph) {
      out.push({ key: 'blockquote', title: name('blockquote'), lost: [], apply: (tr, pos, n) => { tr.replaceWith(pos, pos + n.nodeSize, N.blockquote!.create(null, n)); } });
      out.push({ key: 'code', title: blockTitle('code', lang), lost: node.textContent.length && hasMarks(node) ? [name('lost.formatting')] : [],
        apply: (tr, pos, n) => { tr.replaceWith(pos, pos + n.nodeSize, N.code_block!.create(null, n.textContent ? schema.text(n.textContent) : null)); } });
    }
  }
  if (node.type === N.blockquote && node.childCount === 1 && node.firstChild!.type === N.paragraph) {
    out.push({ key: 'paragraph', title: blockTitle('paragraph', lang), lost: [], apply: (tr, pos, n) => { tr.replaceWith(pos, pos + n.nodeSize, n.firstChild!); } });
  }
  if (node.type === N.code_block && node.attrs.lang !== 'mermaid') {
    out.push({ key: 'paragraph', title: blockTitle('paragraph', lang), lost: [], apply: (tr, pos, n) => {
      tr.replaceWith(pos, pos + n.nodeSize, n.textContent.split('\n').map((l) => N.paragraph!.create(null, l ? schema.text(l) : null)));
    } });
  }
  if (node.type === N.bullet_list || node.type === N.ordered_list) {
    const items = (checked: boolean | null) => (tr: Transaction, pos: number, n: PMNode) => {
      n.forEach((item, offset) => { tr.setNodeMarkup(pos + 1 + offset, null, { ...item.attrs, checked }); });
    };
    const isTask = node.firstChild?.attrs.checked !== null;
    if (node.type !== N.bullet_list || isTask) out.push({ key: 'bullet', title: name('bullet'), lost: isTask ? [name('lost.ticks')] : [], apply: (tr, pos, n) => { items(null)(tr, pos, n); tr.setNodeMarkup(pos, N.bullet_list, { spread: n.attrs.spread }); } });
    if (node.type !== N.ordered_list) out.push({ key: 'ordered', title: name('ordered'), lost: isTask ? [name('lost.ticks')] : [], apply: (tr, pos, n) => { items(null)(tr, pos, n); tr.setNodeMarkup(pos, N.ordered_list, { start: 1, spread: n.attrs.spread }); } });
    // task items belong in a :::checklist block (a LibKa rule): the list is ticked off and wrapped in one
    if (!isTask) out.push({ key: 'checklist', title: blockTitle('checklist', lang), lost: [], apply: (tr, pos, n) => {
      const ticked: PMNode[] = [];
      n.forEach((item) => ticked.push(N.list_item!.create({ ...item.attrs, checked: false }, item.content)));
      tr.replaceWith(pos, pos + n.nodeSize, N.directive!.create({ name: 'checklist', attributes: {} }, N.bullet_list!.create({ spread: n.attrs.spread }, ticked)));
    } });
  }
  if (node.type === N.directive && TEXT_HOLDERS.includes(node.attrs.name)) {
    for (const holder of TEXT_HOLDERS) {
      if (holder === node.attrs.name) continue;
      const target = definition(holder)!;
      const keep = Object.fromEntries(Object.entries(node.attrs.attributes as Record<string, string>).filter(([k]) => k in (target.attributes ?? {})));
      const lost = Object.keys(node.attrs.attributes as Record<string, string>).filter((k) => !(k in keep)).map((k) => name('lost.setting', { name: k }));
      out.push({ key: holder, title: blockTitle(holder, lang), lost, apply: (tr, pos) => { tr.setNodeMarkup(pos, null, { name: holder, attributes: keep }); } });
    }
  }
  return out;
}
const hasMarks = (n: PMNode) => { let found = false; n.descendants((c) => { if (c.marks.length) found = true; }); return found; };

/** Changes the selected block into another type (one of `conversionsFor`). */
export function changeType(key: string): Command {
  return (state, dispatch) => {
    const o = selectedObject(state);
    const c = o && conversionsFor(o.node).find((x) => x.key === key);
    if (!o || !c) return false;
    if (dispatch) {
      const tr = state.tr;
      c.apply(tr, o.pos, o.node);
      dispatch(tr.setSelection(Selection.near(tr.doc.resolve(o.pos + 1), 1)).scrollIntoView());
    }
    return true;
  };
}

/** Wraps the selected blocks in a directive block (a callout, a section...), with the registry example's title and settings to start from. */
export function wrapIn(name: string): Command {
  return (state, dispatch) => {
    const r = objectRange(state);
    const def = definition(name);
    if (!r || !def) return false;
    const example = blocksFrom(def.example).firstChild;
    const attributes = example && example.type === schema.nodes.directive ? example.attrs.attributes : {};
    const label = example && example.type === schema.nodes.directive && example.firstChild?.type === schema.nodes.directive_label ? [example.firstChild!] : [];
    const content = Fragment.from([...label, ...objectsOf(r)]);
    if (!schema.nodes.directive!.validContent(content) || !r.parent.canReplaceWith(r.start, r.end, schema.nodes.directive!)) return false;
    const wrapper = schema.nodes.directive!.create({ name, attributes }, content);
    if (dispatch) {
      const from = posBefore(r, r.start);
      const tr = state.tr.replaceWith(from, posBefore(r, r.end), wrapper);
      dispatch(selectNode(tr, from));
    }
    return true;
  };
}

/** Replaces the selected directive block by its content (its title becomes a paragraph). */
export const unwrap: Command = (state, dispatch) => {
  const o = selectedObject(state);
  if (!o || o.node.type !== schema.nodes.directive) return false;
  const parts: PMNode[] = [];
  o.node.forEach((c) => parts.push(c.type === schema.nodes.directive_label ? schema.nodes.paragraph!.create(null, c.content) : c));
  if (!parts.length) parts.push(schema.nodes.paragraph!.create());
  if (!o.parent.canReplace(o.parent.childCount, o.parent.childCount, Fragment.from(parts))) return false;
  if (dispatch) {
    const tr = state.tr.replaceWith(o.pos, o.pos + o.node.nodeSize, parts);
    dispatch(tr.setSelection(Selection.near(tr.doc.resolve(o.pos + 1), 1)).scrollIntoView());
  }
  return true;
};

/* ---------- Markdown on the clipboard ---------- */

/**
 * A slice as LibKa Markdown (inline content becomes a paragraph). Selected list items are written inside a list: the
 * one they came from when `$from` (the selection's start) is in it, numbered from the first item's place, or a bullet
 * list.
 */
export function markdownOf(slice: Slice | Fragment, $from?: ResolvedPos): string {
  const content = slice instanceof Slice ? slice.content : slice;
  const blocks: PMNode[] = [];
  const list = $from && ['bullet_list', 'ordered_list'].includes($from.parent.type.name) ? $from.parent : null;
  let items: PMNode[] = [];
  const endItems = () => {
    if (!items.length) return;
    const type = list?.type ?? schema.nodes.bullet_list!;
    blocks.push(type.create(type === schema.nodes.ordered_list ? { ...list!.attrs, start: list!.attrs.start + $from!.index() } : list?.attrs ?? null, items));
    items = [];
  };
  content.forEach((n) => {
    if (n.type === schema.nodes.list_item) { items.push(n); return; }
    endItems();
    if (n.isBlock && !PARTS.has(n.type.name)) blocks.push(n);
  });
  endItems();
  if (!blocks.length) {
    const inline: PMNode[] = [];
    content.forEach((n) => { if (n.isInline) inline.push(n); else if (n.isTextblock) n.forEach((c) => inline.push(c)); });
    if (!inline.length) return content.textBetween(0, content.size, '\n\n');
    blocks.push(schema.nodes.paragraph!.create(null, inline));
  }
  return save(schema.nodes.doc!.create(null, blocks)).replace(/\n$/, '');
}

/** Pasted plain text, read as LibKa Markdown. */
export function sliceFromMarkdown(text: string): Slice {
  // Windows' clipboard ends lines with \r\n: the document keeps \n
  const content = blocksFrom(text.replace(/\r\n?/g, '\n'));
  // a single paragraph pastes into the text around the cursor
  if (content.childCount === 1 && content.firstChild!.type === schema.nodes.paragraph) return new Slice(content, 1, 1);
  return new Slice(content, 0, 0);
}

/* ---------- Markdown shortcuts (a preference) ---------- */

/** Typing "## ", "- ", "1. ", "> ", "```" or "---" at the start of a paragraph makes the block it stands for. */
export function markdownShortcuts() {
  const N = schema.nodes;
  return inputRules({ rules: [
    textblockTypeInputRule(/^(#{1,4})\s$/, N.heading!, (m) => ({ level: m[1]!.length })),
    wrappingInputRule(/^\s*[-+*]\s$/, N.bullet_list!),
    wrappingInputRule(/^(\d+)\.\s$/, N.ordered_list!, (m) => ({ start: Number(m[1]) }), (m, n) => n.childCount + n.attrs.start === Number(m[1])),
    wrappingInputRule(/^\s*>\s$/, N.blockquote!),
    textblockTypeInputRule(/^```([\w-]+)?\s$/, N.code_block!, (m) => ({ lang: m[1] ?? null })),
    new InputRule(/^---$/, (state, _m, start, end) => {
      const $start = state.doc.resolve(start);
      // the paragraph holds exactly "--" and the third dash is being typed
      if ($start.parent.type !== N.paragraph || $start.parent.textContent !== '--' || end - start !== 2) return null;
      return state.tr.replaceWith($start.before(), $start.after(), [N.thematic_break!.create(), N.paragraph!.create()]);
    }),
  ] });
}
