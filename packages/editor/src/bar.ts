/**
 * The block bar: what the Studio's toolbar offers for the block the author is in. Its target is the innermost LibKa
 * block around the cursor (a callout, a process, a card's cards) or the selected block, and a figure; plain text has
 * none. It offers the setting the registry marks `quick` (at most one per block), one more part where the block has
 * parts, and the way to the block's other actions.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, type Command, type EditorState } from 'prosemirror-state';
import { block as definition } from '@libka/blocks';
import { schema } from './schema.ts';
import { isFigure } from './blocks.ts';
import { localAttributes, type Lang, type LocalAttribute } from './names.ts';
import { selectedObject } from './commands.ts';
import { PARTS, partHolder } from './parts.ts';

export interface BarTarget {
  node: PMNode;
  pos: number;
  /** The block's registry name (`callout`, `figure`). */
  name: string;
}

const isDirective = (n: PMNode) => n.type === schema.nodes.directive || n.type === schema.nodes.leaf_directive;
/** A registry block written as a directive (not a child such as `card` or `q`), or a figure. */
const isBarBlock = (n: PMNode): boolean => (isDirective(n) && Boolean(definition(n.attrs.name as string))) || isFigure(n);
const nameOf = (n: PMNode): string => (isFigure(n) ? 'figure' : (n.attrs.name as string));

/** The block the bar acts on: the selected block when it is one, else the innermost one around the selection. */
export function barTarget(state: EditorState): BarTarget | null {
  const o = selectedObject(state);
  if (o && isBarBlock(o.node)) return { node: o.node, pos: o.pos, name: nameOf(o.node) };
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (isBarBlock(n)) return { node: n, pos: $from.before(d), name: nameOf(n) };
  }
  return null;
}

/** The setting the bar offers for a block (the registry's `quick`), named in the language; null when it has none. */
export function quickSetting(name: string, lang: Lang): { key: string; spec: LocalAttribute } | null {
  const attrs = definition(name)?.attributes ?? {};
  const key = Object.keys(attrs).find((k) => attrs[k]!.quick);
  return key ? { key, spec: localAttributes(attrs, lang, name)[key]! } : null;
}

/**
 * The block whose parts the bar adds to: the part holder around the selection when it is the target or inside it
 * (a pros-cons's `pros`), or the target itself when it adds parts.
 */
export function barPartHolder(state: EditorState, target: BarTarget): { node: PMNode; pos: number } | null {
  const h = partHolder(state);
  if (h && h.pos >= target.pos && h.pos < target.pos + target.node.nodeSize) return h;
  return target.node.type === schema.nodes.directive && PARTS[target.name] ? { node: target.node, pos: target.pos } : null;
}

/** Sets (or, with null, removes) one setting of the directive at `pos`; the selection stays where it is. */
export function setBlockAttribute(pos: number, key: string, value: string | null): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node || !isDirective(node)) return false;
    const attributes = { ...(node.attrs.attributes as Record<string, string>) };
    if ((attributes[key] ?? null) === value) return false;
    if (value === null) delete attributes[key]; else attributes[key] = value;
    if (dispatch) {
      const sel = state.selection;
      const tr = state.tr.setNodeMarkup(pos, null, { ...node.attrs, attributes });
      if (sel instanceof NodeSelection && sel.from === pos) tr.setSelection(NodeSelection.create(tr.doc, pos));
      dispatch(tr);
    }
    return true;
  };
}

/** Selects the block at `pos` as an object (the bar's Move, ⋯ and Properties act on the selected block). */
export function selectBlockAt(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (!node || !node.isBlock) return false;
    if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    return true;
  };
}
