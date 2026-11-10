/**
 * Blocks laid out as their output lays them out, and the parts they repeat: a flow's stages, the steps, the key
 * figures, a timeline's milestones, the items of pros and of cons (list items), and cards, do / don't pairs, tabs and
 * an accordion's items (child blocks). `addPart` adds one more at the end, within the registry's limits (a flow has at most six stages, the key
 * figures four; a matrix always has its four quadrants, so it has no part to add).
 */
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { block as definition, CHILD_TITLES } from '@libka/blocks';
import { schema } from './schema.ts';
import type { Lang } from './names.ts';

/** What a laid-out block repeats: list items (in its list), or child blocks (one or more at a time). */
export type PartSpec =
  | { kind: 'item'; list: 'bullet' | 'ordered'; title: { en: string; cs: string }; max?: number }
  | { kind: 'child'; names: readonly string[]; title: { en: string; cs: string }; max?: number };

/** The registry's maximum for an array of the block's schema (`stages`, `items`), when it has one. */
function maxOf(block: string, key: string): number | undefined {
  const props = (definition(block)?.schema as { properties?: Record<string, { maxItems?: number }> } | undefined)?.properties;
  return props?.[key]?.maxItems;
}

/** By the name of the directive that holds the parts (`pros` and `cons` are the children of a `pros-cons`). */
export const PARTS: Readonly<Record<string, PartSpec>> = {
  flow: { kind: 'item', list: 'ordered', title: { en: 'Stage', cs: 'Fáze' }, ...opt(maxOf('flow', 'stages')) },
  steps: { kind: 'item', list: 'ordered', title: { en: 'Step', cs: 'Krok' } },
  metrics: { kind: 'item', list: 'bullet', title: { en: 'Key figure', cs: 'Údaj' }, ...opt(maxOf('metrics', 'items')) },
  timeline: { kind: 'item', list: 'bullet', title: { en: 'Milestone', cs: 'Milník' } },
  pros: { kind: 'item', list: 'bullet', title: { en: 'Pro', cs: 'Výhoda' } },
  cons: { kind: 'item', list: 'bullet', title: { en: 'Con', cs: 'Nevýhoda' } },
  cards: { kind: 'child', names: ['card'], title: CHILD_TITLES.card! },
  compare: { kind: 'child', names: ['do', 'dont'], title: { en: 'Do and don\'t', cs: 'Dělejte a nedělejte' } },
  tabs: { kind: 'child', names: ['tab'], title: CHILD_TITLES.tab! },
  accordion: { kind: 'child', names: ['item'], title: CHILD_TITLES.item! },
};
function opt(max: number | undefined): { max?: number } { return max === undefined ? {} : { max }; }

/**
 * Blocks drawn in their output's arrangement (the Studio styles `ed-laid`): the blocks with parts, the matrix (its
 * four quadrants in a grid), the pros and cons around their two lists, a comparison's table, a decision and a release
 * with their sections, and a UI specimen's components.
 */
export const LAID_OUT: ReadonlySet<string> = new Set([
  'flow', 'steps', 'metrics', 'timeline', 'pros-cons', 'cards', 'compare', 'matrix', 'tabs', 'accordion', 'comparison', 'decision', 'release', 'ui',
]);
/** Laid-out blocks whose children sit in a grid (their parts' handles go inside each part, not before it). */
export const GRIDS: ReadonlySet<string> = new Set(['pros-cons', 'cards', 'compare', 'matrix']);

/** The name of the part a block adds ("Stage", "Fáze"), or null for a block without parts. */
export function partName(name: string, lang: Lang): string | null {
  return PARTS[name]?.title[lang] ?? null;
}

const isDirective = (n: PMNode) => n.type === schema.nodes.directive;

/** How many parts the block has now (list items in its list; for pairs, the first name's children). */
export function partCount(node: PMNode): number {
  const spec = PARTS[node.attrs.name as string];
  if (!spec) return 0;
  let n = 0;
  node.forEach((c) => {
    if (spec.kind === 'item' && (c.type === schema.nodes.bullet_list || c.type === schema.nodes.ordered_list)) n += c.childCount;
    if (spec.kind === 'child' && isDirective(c) && c.attrs.name === spec.names[0]) n++;
  });
  return n;
}

/** The block has room for one more part. */
export function canAddPart(node: PMNode): boolean {
  const spec = PARTS[node.attrs.name as string];
  return Boolean(spec && isDirective(node) && (spec.max === undefined || partCount(node) < spec.max));
}

/** The nearest block around the selection (or the selected block itself) that adds parts: its node and position. */
export function partHolder(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && isDirective(sel.node) && PARTS[sel.node.attrs.name as string]) return { node: sel.node, pos: sel.from };
  const $from: ResolvedPos = sel.$from;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (isDirective(n) && PARTS[n.attrs.name as string]) return { node: n, pos: $from.before(d) };
  }
  return null;
}

/**
 * Adds a part at the end of the block at `pos` (or of the block around the selection): an empty list item, its text
 * bold from the start when the last one opens with a bold figure or date; or empty child blocks, their label first.
 * The cursor goes into the new part. Fails at the registry's limit.
 */
export function addPart(pos?: number): Command {
  return (state, dispatch) => {
    const at = pos ?? partHolder(state)?.pos;
    if (at === undefined) return false;
    const node = state.doc.nodeAt(at);
    if (!node || !canAddPart(node)) return false;
    const spec = PARTS[node.attrs.name as string]!;
    if (!dispatch) return true;
    const N = schema.nodes;
    const tr = state.tr;
    if (spec.kind === 'item') {
      // the block's last list, or a new one at its end
      let listPos = -1, list: PMNode | null = null;
      node.forEach((c, offset) => { if (c.type === N.bullet_list || c.type === N.ordered_list) { list = c; listPos = at + 1 + offset; } });
      const item = N.list_item!.create(null, N.paragraph!.create());
      let cursor: number;
      if (list) {
        const end = listPos + (list as PMNode).nodeSize - 1;
        tr.insert(end, item);
        cursor = end + 2;
      } else {
        const fresh = (spec.list === 'ordered' ? N.ordered_list! : N.bullet_list!).create(null, item);
        const end = at + node.nodeSize - 1;
        tr.insert(end, fresh);
        cursor = end + 3;
      }
      tr.setSelection(TextSelection.create(tr.doc, cursor));
      const last = list ? (list as PMNode).lastChild?.firstChild : null;
      if (last?.firstChild?.marks.some((m) => m.type === schema.marks.strong)) tr.setStoredMarks([schema.marks.strong!.create()]);
    } else {
      const existing = new Map<string, PMNode>();
      node.forEach((c) => { if (isDirective(c)) existing.set(c.attrs.name as string, c); });
      const parts = spec.names.map((name) => {
        const like = existing.get(name);
        const labelled = !like || like.firstChild?.type === N.directive_label;
        return N.directive!.create({ name, attributes: {} }, [...(labelled ? [N.directive_label!.create()] : []), N.paragraph!.create()]);
      });
      const end = at + node.nodeSize - 1;
      tr.insert(end, parts);
      tr.setSelection(TextSelection.create(tr.doc, end + 2));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}
