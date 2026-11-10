/**
 * LibKa Markdown ⇄ the editor's document, losslessly.
 *
 * Loading parses the Markdown with the same remark pipeline as `@libka/model` and keeps, for every top-level block, the
 * exact text it was written as, and for a container block (`:::cards`, `::::decision` …) also its opening line, its
 * closing fence, the text of each of its blocks and the space between them, at every level. Saving writes a block that
 * is unchanged (the same node, or one equal to it) as that text, and the space between two untouched neighbours as it
 * was; a changed block goes back to Markdown's syntax tree and is written in one canonical LibKa style, except a
 * changed container, which keeps its own lines and its untouched blocks as written and rewrites only the blocks that
 * changed (checked by reading the result back; when it would not read back the same, the whole block is written in
 * the canonical style). So opening a document and saving it changes nothing, and an edit touches only its own block.
 */
import type {
  Blockquote, Code, FootnoteDefinition, Heading, List, ListItem, Nodes, Paragraph, PhrasingContent, Root, RootContent, Table, TableCell, TableRow, Text, Yaml,
} from 'mdast';
import { INLINE_DIRECTIVES, literalImageAlt, literalTextDirectives } from '@libka/model';
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive';
import { directiveToMarkdown } from 'mdast-util-directive';
import { frontmatterToMarkdown } from 'mdast-util-frontmatter';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown, type Options } from 'mdast-util-to-markdown';
import type { Mark, Node as PMNode } from 'prosemirror-model';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { schema, type Attributes } from './schema.ts';

/**
 * A block as it was loaded: the node made for it, the exact text it came from, its place among its siblings, where it
 * starts in the source and the space after it up to the next sibling; for a container block, how it was written.
 */
interface Origin { node: PMNode; text: string; index: number; start: number; gapAfter: string; inner?: Inner }

/** How a container block was written around its blocks. */
interface Inner {
  /** The opening line (`:::name[label]{attributes}`), without its line break. */
  open: string;
  /** The number of colons it opens with. */
  fence: number;
  /** Its blocks after the label, as loaded. */
  children: Origin[];
  /** From the opening line's end to the first block (with no blocks, unused). */
  head: string;
  /** From the last block (or the opening line's end) to the closing fence. */
  tail: string;
  /** The closing fence's line. */
  close: string;
  /** The space its blocks are most often written with (between blocks that were not neighbours: an added or moved one). */
  usual: string;
}

/** A loaded document: what saving needs to keep untouched blocks exactly as they were. */
export interface Loaded {
  doc: PMNode;
  source: string;
  origins: Origin[];
  leading: string;
  trailing: string;
  /** The source line each block starts on (problems name a line; fixes find their block by it). */
  lines: Map<PMNode, number>;
}

class Unsupported extends Error {}

const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).use(remarkDirective);

/**
 * The directive writer escapes ":" before a letter or digit anywhere in text ("a\:b"), so it is not read as a
 * directive. LibKa reads only its own inline directives with a label, so typed text is escaped only where it would
 * become one (":kbd[" → "\:kbd["), and "16:9" or "a:b" stay as written. Destinations, titles and an image's alt text
 * are never read for directives (the model reads alt text without them): there "mailto:docs@example.org" and
 * "4.5:1" stay as written.
 */
const directives = directiveToMarkdown({ preferUnquoted: true, quoteSmart: true });
const NO_DIRECTIVES = ['autolink', 'destinationLiteral', 'destinationRaw', 'reference', 'titleQuote', 'titleApostrophe', 'image'];
const KNOWN_DIRECTIVE = `(?:${INLINE_DIRECTIVES.join('|')})\\[`;
directives.unsafe = directives.unsafe?.map((u) => u.character === ':' && [u.inConstruct].flat().includes('phrasing')
  ? { ...u, ...(u.after ? { after: KNOWN_DIRECTIVE } : {}), notInConstruct: NO_DIRECTIVES as typeof u.notInConstruct } : u);

/** The canonical style for changed blocks: the conventions LibKa's own documents use. */
const WRITE: Options = {
  bullet: '-', emphasis: '*', strong: '*', fence: '`', fences: true, rule: '-', listItemIndent: 'one', incrementListMarker: true, resourceLink: false,
  // the plugins are built against neighbouring versions of the writer's types; at run time they are plain objects
  extensions: [directives, gfmToMarkdown(), frontmatterToMarkdown(['yaml'])] as unknown as NonNullable<Options['extensions']>,
  handlers: {
    // a GitHub alert's marker ("> [!TIP]") is written as it is, not escaped as a link's bracket ("\[!TIP]")
    text(node: Text, parent, state, info) {
      const marker = /^\[![A-Za-z]+\]/.exec(node.value)?.[0];
      if (!marker || parent?.type !== 'paragraph' || parent.children[0] !== node || !state.stack.includes('blockquote')) return state.safe(node.value, info);
      return marker + state.safe(node.value.slice(marker.length), { ...info, before: ']' });
    },
  },
};

/* ---------- Markdown → editor ---------- */

const attrsOf = (a: Record<string, string | null | undefined> | null | undefined): Attributes =>
  Object.fromEntries(Object.entries(a ?? {}).map(([k, v]) => [k, v ?? '']));
const plain = (nodes: readonly PhrasingContent[]): string =>
  nodes.map((n) => ('value' in n ? n.value : 'children' in n ? plain(n.children as PhrasingContent[]) : '')).join('');

function inline(nodes: readonly PhrasingContent[], marks: readonly Mark[] = []): PMNode[] {
  const out: PMNode[] = [];
  const add = (mark: Mark, children: readonly PhrasingContent[]) => out.push(...inline(children, mark.addToSet(marks)));
  for (const n of nodes) {
    switch (n.type) {
      case 'text': if (n.value) out.push(schema.text(n.value, marks)); break;
      case 'strong': add(schema.marks.strong!.create(), n.children); break;
      case 'emphasis': add(schema.marks.em!.create(), n.children); break;
      case 'delete': add(schema.marks.strike!.create(), n.children); break;
      case 'link': add(schema.marks.link!.create({ href: n.url, title: n.title ?? null }), n.children); break;
      case 'inlineCode': if (n.value) out.push(schema.text(n.value, schema.marks.code!.create().addToSet(marks))); break;
      case 'break': out.push(schema.nodes.hard_break!.create()); break;
      case 'image': out.push(schema.nodes.image!.create({ src: n.url, alt: n.alt ?? '', title: n.title ?? null }, null, marks)); break;
      case 'footnoteReference': out.push(schema.nodes.footnote_ref!.create({ identifier: n.identifier, label: n.label ?? null }, null, marks)); break;
      case 'textDirective': {
        const d = n as TextDirective;
        // a label with structure inside (emphasis, links) is not modelled: the block is kept as written
        if (d.children.some((c) => c.type !== 'text')) throw new Unsupported(`:${d.name} with formatting in its label`);
        out.push(schema.nodes.inline_directive!.create({ name: d.name, label: d.children.length ? plain(d.children) : null, attributes: attrsOf(d.attributes) }, null, marks));
        break;
      }
      default: throw new Unsupported(n.type);
    }
  }
  return out;
}

/** The lines of the blocks made by the load under way. */
let lineMap: Map<PMNode, number> | null = null;

/** A block, or a source island holding its text when the editor does not model it. */
function block(n: RootContent, src: string): PMNode {
  let made: PMNode;
  try {
    made = convert(n, src);
  } catch (e) {
    if (!(e instanceof Unsupported) || !n.position) throw e;
    made = schema.nodes.source!.create({ text: src.slice(n.position.start.offset, n.position.end.offset) });
  }
  if (n.position) lineMap?.set(made, n.position.start.line);
  return made;
}
const blocks = (nodes: readonly RootContent[], src: string): PMNode[] => nodes.map((n) => block(n, src));

function convert(n: RootContent, src: string): PMNode {
  const N = schema.nodes;
  switch (n.type) {
    case 'yaml': return N.front_matter!.create({ value: n.value });
    case 'paragraph': return N.paragraph!.create(null, inline(n.children));
    case 'heading': return N.heading!.create({ level: n.depth }, inline(n.children));
    case 'thematicBreak': return N.thematic_break!.create();
    case 'blockquote': return N.blockquote!.create(null, blocks(n.children, src));
    case 'list': {
      const items = n.children.map((i) => N.list_item!.create({ checked: i.checked ?? null, spread: Boolean(i.spread) }, blocks(i.children, src)));
      return n.ordered ? N.ordered_list!.create({ start: n.start ?? 1, spread: Boolean(n.spread) }, items) : N.bullet_list!.create({ spread: Boolean(n.spread) }, items);
    }
    case 'code': return N.code_block!.create({ lang: n.lang ?? null, meta: n.meta ?? null }, n.value ? schema.text(n.value) : null);
    case 'table': return N.table!.create({ align: n.align ?? [] }, n.children.map((r) => N.table_row!.create(null, r.children.map((c) => N.table_cell!.create(null, inline(c.children))))));
    case 'containerDirective': {
      const d = n as ContainerDirective;
      const [first, ...rest] = d.children;
      const labelled = first?.type === 'paragraph' && (first.data as { directiveLabel?: boolean } | undefined)?.directiveLabel;
      const label = labelled ? [N.directive_label!.create(null, inline((first as Paragraph).children))] : [];
      return N.directive!.create({ name: d.name, attributes: attrsOf(d.attributes) }, [...label, ...blocks(labelled ? rest : d.children, src)]);
    }
    case 'leafDirective': {
      const d = n as LeafDirective;
      return N.leaf_directive!.create({ name: d.name, attributes: attrsOf(d.attributes) }, inline(d.children));
    }
    case 'footnoteDefinition': return N.footnote_definition!.create({ identifier: n.identifier, label: n.label ?? null }, blocks(n.children, src));
    default: throw new Unsupported(n.type);
  }
}

/** The origins of sibling blocks (`made[i]` is the node made for `nodes[i]`). */
function originsOf(nodes: readonly RootContent[], made: readonly PMNode[], src: string): Origin[] {
  return nodes.map((c, i) => {
    const start = c.position!.start.offset!, end = c.position!.end.offset!;
    const next = nodes[i + 1];
    const node = made[i]!;
    const o: Origin = { node, text: src.slice(start, end), index: i, start, gapAfter: next ? src.slice(end, next.position!.start.offset) : '' };
    const inner = c.type === 'containerDirective' && node.type.name === 'directive' ? innerOf(c as ContainerDirective, node, src) : undefined;
    if (inner) o.inner = inner;
    return o;
  });
}

/**
 * How a container block was written, or undefined when it cannot be kept line by line: an indented or unclosed
 * block, or a label that runs past the opening line.
 */
function innerOf(d: ContainerDirective, node: PMNode, src: string): Inner | undefined {
  const start = d.position!.start.offset!, end = d.position!.end.offset!;
  if (d.position!.start.column !== 1) return undefined;
  const lineEnd = src.indexOf('\n', start);
  if (lineEnd < 0 || lineEnd >= end) return undefined;
  const open = src.slice(start, lineEnd);
  const fence = /^:{3,}/.exec(open)?.[0].length;
  if (!fence) return undefined;
  const labelled = node.firstChild?.type.name === 'directive_label';
  const kids = d.children.slice(labelled ? 1 : 0);
  if ((labelled && (d.children[0]!.position?.end.offset ?? Infinity) > lineEnd) || kids.some((k) => !k.position)) return undefined;
  if (kids.length !== node.childCount - (labelled ? 1 : 0)) return undefined;
  const last = kids.length ? kids.at(-1)!.position!.end.offset! : lineEnd;
  const closing = /^(\s*\n)([ \t]*:{3,}[ \t]*)$/.exec(src.slice(last, end));
  if (!closing) return undefined;
  const children = originsOf(kids, kids.map((_, k) => node.child(k + (labelled ? 1 : 0))), src);
  const counts = new Map<string, number>();
  for (const c of children.slice(0, -1)) counts.set(c.gapAfter, (counts.get(c.gapAfter) ?? 0) + 1);
  const usual = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '\n\n';
  return {
    open, fence, children, usual,
    head: kids.length ? src.slice(lineEnd, kids[0]!.position!.start.offset) : '\n',
    tail: closing[1]!, close: closing[2]!,
  };
}

/** Loads LibKa Markdown for editing. */
export function load(source: string): Loaded {
  const root = parser.parse(source) as Root;
  // "16:9" is text, as the model reads it, not "16" and a ":9" chip
  literalTextDirectives(root, source);
  literalImageAlt(root, source);
  const lines = new Map<PMNode, number>();
  lineMap = lines;
  const children = root.children.filter((c) => c.position);
  const origins = originsOf(children, children.map((c) => block(c, source)), source);
  lineMap = null;
  const first = children[0], last = children.at(-1);
  const doc = schema.nodes.doc!.create(null, origins.length ? origins.map((o) => o.node) : [schema.nodes.paragraph!.create()]);
  return {
    doc, source, origins, lines,
    leading: first ? source.slice(0, first.position!.start.offset) : '',
    trailing: last ? source.slice(last.position!.end.offset) : source,
  };
}

/* ---------- editor → Markdown ---------- */

const MARK_ORDER = ['link', 'strong', 'em', 'strike', 'code'];
type Parent = { children: PhrasingContent[] };

function phrasing(node: PMNode): PhrasingContent[] {
  const root: Parent = { children: [] };
  // the open marks, outermost first, each with the mdast node its content goes into
  const open: { mark: Mark; into: Parent }[] = [];
  node.forEach((child) => {
    const marks = [...child.marks].filter((m) => m.type.name !== 'code').sort((a, b) => MARK_ORDER.indexOf(a.type.name) - MARK_ORDER.indexOf(b.type.name));
    // marks already open stay open (bold around a link stays one bold); only the new ones open inside them
    let keep = 0;
    while (keep < open.length && open[keep]!.mark.isInSet(marks)) keep++;
    open.length = keep;
    for (const m of marks.filter((x) => !open.some((o) => o.mark.eq(x)))) {
      const parent = open.at(-1)?.into ?? root;
      const made: PhrasingContent = m.type.name === 'link' ? { type: 'link', url: m.attrs.href, title: m.attrs.title, children: [] }
        : m.type.name === 'strong' ? { type: 'strong', children: [] } : m.type.name === 'em' ? { type: 'emphasis', children: [] } : { type: 'delete', children: [] };
      parent.children.push(made);
      open.push({ mark: m, into: made as Parent });
    }
    const into = open.at(-1)?.into ?? root;
    if (child.isText) into.children.push(child.marks.some((m) => m.type.name === 'code') ? { type: 'inlineCode', value: child.text! } : { type: 'text', value: child.text! });
    else into.children.push(inlineNode(child));
  });
  return root.children;
}

/** The text of a paragraph, heading, title or cell without spaces at its edges (Markdown ignores them there). */
function trimmed(node: PMNode): PhrasingContent[] {
  const out = phrasing(node);
  const first = out[0], last = out.at(-1);
  if (first?.type === 'text') first.value = first.value.replace(/^[ \t]+/, '');
  if (last?.type === 'text') last.value = last.value.replace(/[ \t]+$/, '');
  return out.filter((c) => c.type !== 'text' || c.value !== '');
}

function inlineNode(n: PMNode): PhrasingContent {
  switch (n.type.name) {
    case 'image': return { type: 'image', url: n.attrs.src, alt: n.attrs.alt, title: n.attrs.title };
    case 'hard_break': return { type: 'break' };
    case 'footnote_ref': return { type: 'footnoteReference', identifier: n.attrs.identifier, label: n.attrs.label };
    case 'inline_directive': {
      const label = n.attrs.label as string | null;
      return { type: 'textDirective', name: n.attrs.name, attributes: n.attrs.attributes, children: label ? [{ type: 'text', value: label }] : [] } as TextDirective;
    }
    default: throw new Error(`no Markdown for inline node ${n.type.name}`);
  }
}

const children = (n: PMNode): RootContent[] => { const out: RootContent[] = []; n.forEach((c) => out.push(mdast(c))); return out; };

/** The editor's node as Markdown's syntax tree. */
export function mdast(n: PMNode): RootContent {
  switch (n.type.name) {
    case 'front_matter': return { type: 'yaml', value: n.attrs.value } as Yaml;
    case 'paragraph': return { type: 'paragraph', children: trimmed(n) };
    case 'heading': return { type: 'heading', depth: n.attrs.level, children: trimmed(n) } as Heading;
    case 'thematic_break': return { type: 'thematicBreak' };
    case 'blockquote': return { type: 'blockquote', children: children(n) } as Blockquote;
    case 'bullet_list': case 'ordered_list': {
      const items: ListItem[] = [];
      n.forEach((i) => items.push({ type: 'listItem', checked: i.attrs.checked, spread: i.attrs.spread, children: children(i) } as ListItem));
      return { type: 'list', ordered: n.type.name === 'ordered_list', start: n.type.name === 'ordered_list' ? n.attrs.start : null, spread: n.attrs.spread, children: items } as List;
    }
    case 'code_block': return { type: 'code', lang: n.attrs.lang, meta: n.attrs.meta, value: n.textContent } as Code;
    case 'table': {
      const rows: TableRow[] = [];
      n.forEach((r) => { const cells: TableCell[] = []; r.forEach((c) => cells.push({ type: 'tableCell', children: trimmed(c) })); rows.push({ type: 'tableRow', children: cells }); });
      return { type: 'table', align: n.attrs.align, children: rows } as Table;
    }
    case 'directive': {
      const out: RootContent[] = [];
      n.forEach((c) => out.push(c.type.name === 'directive_label'
        ? { type: 'paragraph', data: { directiveLabel: true }, children: trimmed(c) } as Paragraph : mdast(c)));
      return { type: 'containerDirective', name: n.attrs.name, attributes: n.attrs.attributes, children: out } as ContainerDirective;
    }
    case 'leaf_directive': return { type: 'leafDirective', name: n.attrs.name, attributes: n.attrs.attributes, children: phrasing(n) } as LeafDirective;
    case 'footnote_definition': return { type: 'footnoteDefinition', identifier: n.attrs.identifier, label: n.attrs.label, children: children(n) } as FootnoteDefinition;
    // a source island goes out exactly as written
    case 'source': return { type: 'html', value: n.attrs.text };
    default: throw new Error(`no Markdown for block ${n.type.name}`);
  }
}

/** One block in the canonical style. */
export function writeBlock(n: PMNode): string {
  return toMarkdown({ type: 'root', children: [mdast(n)] } as Root, WRITE).replace(/\n$/, '');
}

/** Where each top-level block is in a Markdown text: offsets from and to, in document order. */
export type BlockRanges = { from: number; to: number }[];

/** The block ranges of a loaded document, in its own source. */
export const loadedRanges = (loaded: Loaded): BlockRanges => loaded.origins.map((o) => ({ from: o.start, to: o.start + o.text.length }));

/** The index of the block that holds an offset (the nearest one before it when the offset falls between blocks). */
export function blockAt(ranges: BlockRanges, offset: number): number {
  let found = 0;
  ranges.forEach((r, i) => { if (r.from <= offset) found = i; });
  return found;
}

/**
 * The document as Markdown, with where each block ended up. Blocks that are unchanged since `loaded` (or equal to a
 * loaded one) keep their exact text; the others are written in the canonical style. Without `loaded`, every block is
 * written canonically.
 */
export function saveMapped(doc: PMNode, loaded?: Loaded | null): { text: string; ranges: BlockRanges } {
  if (loaded && doc === loaded.doc) return { text: loaded.source, ranges: loadedRanges(loaded) };
  const nodes: PMNode[] = [];
  doc.forEach((n) => nodes.push(n));
  const placed = align(nodes, loaded?.origins ?? []);
  let text = '';
  const ranges: BlockRanges = [];
  let written = '';
  nodes.forEach((child, i) => {
    const p = placed[i]!;
    if (i === 0) text += loaded && p.origin?.index === 0 ? (p.exact ? loaded.leading : unindented(loaded.leading)) : '';
    else text += gap(placed[i - 1]!, p, true);
    written = writePlaced(child, p);
    ranges.push({ from: text.length, to: text.length + written.length });
    text += written;
  });
  const last = placed.at(-1)?.origin;
  if (!loaded || !last || last.index !== loaded.origins.length - 1) text += '\n';
  // an unclosed container's text ran to its line break; written anew, it ends before it
  else text += (last.text.endsWith('\n') && !written.endsWith('\n') ? '\n' : '') + loaded.trailing;
  return { text, ranges };
}

/** Where a block of the edited document came from: a loaded block that is the same or equal (`exact`), or the one it was before an edit. */
interface Placed { origin?: Origin; exact: boolean }

/** A gap that holds an empty line keeps any two blocks apart; a single line break may not. */
const BLANK = /\n[ \t]*\r?\n/;

/**
 * Finds where each block came from. A block that is the same node as a loaded one, or equal to one, is exact. The
 * blocks between two exact ones are paired with the loaded blocks that were between them: one to one when there are
 * as many, otherwise each with the next one of its kind. A paired block is written anew, but the space around it
 * (and, for a container, its own lines) is kept.
 */
function align(nodes: readonly PMNode[], origins: readonly Origin[]): Placed[] {
  const byNode = new Map(origins.map((o) => [o.node, o]));
  const unused = new Set(origins);
  const placed: Placed[] = nodes.map((n, i) => {
    let found = byNode.get(n);
    // an equal block is most likely where it was, or one place off: look there before looking everywhere
    if (!found) for (const j of [i, i - 1, i + 1]) { const o = origins[j]; if (o && unused.has(o) && o.node.eq(n)) { found = o; break; } }
    if (!found) for (const o of unused) if (o.node.eq(n)) { found = o; break; }
    if (found) unused.delete(found);
    return found ? { origin: found, exact: true } : { exact: false };
  });
  const kind = (n: PMNode) => n.type.name === 'directive' || n.type.name === 'leaf_directive' ? `${n.type.name}:${n.attrs.name}` : n.type.name;
  for (let i = 0; i < nodes.length;) {
    if (placed[i]!.origin) { i++; continue; }
    let j = i;
    while (j < nodes.length && !placed[j]!.origin) j++;
    const after = i > 0 ? placed[i - 1]!.origin!.index : -1;
    const before = j < nodes.length ? placed[j]!.origin!.index : origins.length;
    const between = origins.filter((o) => o.index > after && o.index < before && unused.has(o));
    if (between.length === j - i) between.forEach((o, k) => { placed[i + k] = { origin: o, exact: false }; });
    else {
      let from = 0;
      for (let k = i; k < j; k++) {
        const at = between.findIndex((o, x) => x >= from && kind(o.node) === kind(nodes[k]!));
        if (at >= 0) { placed[k] = { origin: between[at]!, exact: false }; from = at + 1; }
      }
    }
    for (let k = i; k < j; k++) if (placed[k]!.origin) unused.delete(placed[k]!.origin!);
    i = j;
  }
  return placed;
}

/**
 * The space between two neighbouring blocks: as it was when they were neighbours in the source, else `usual` (an
 * empty line by default). With `safe`, a gap next to a block written anew is kept only when it holds an empty line, and
 * blocks that were not neighbours get an empty line.
 */
function gap(prev: Placed, next: Placed, safe: boolean, usual = '\n\n'): string {
  const a = prev.origin, b = next.origin;
  if (!a || !b || b.index !== a.index + 1) return safe ? '\n\n' : usual;
  if (prev.exact && next.exact) return a.gapAfter;
  // the indentation a gap ends with belongs to the block after it: a block written anew starts at the line's start
  const kept = next.exact ? a.gapAfter : unindented(a.gapAfter);
  return !safe || BLANK.test(kept) ? kept : '\n\n';
}
const unindented = (space: string) => space.replace(/[ \t]+$/, '');

/** A block's text: as written when it is exact, else in the canonical style (a container keeping its own writing). */
function writePlaced(n: PMNode, p: Placed): string {
  if (!p.origin) return writeBlock(n);
  if (p.exact) return p.origin.text;
  return p.origin.inner && n.type.name === 'directive' ? rewriteContainer(n, p.origin, p.origin.inner) : writeBlock(n);
}

const sameAttributes = (a: Attributes, b: Attributes): boolean => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && a[k] === b[k]);
};
const labelOf = (n: PMNode): PMNode | null => n.firstChild?.type.name === 'directive_label' ? n.firstChild : null;

/**
 * A changed container block that keeps its own writing: the opening line (written anew only when its name, label or
 * attributes changed), the closing fence, its untouched blocks and the space between them. Tried with the gaps as
 * written, then with only the safe ones, each with its fence and then with a fence long enough for what it now holds;
 * the first that reads back as the block means it.
 * When none does, the block is written in the canonical style.
 */
function rewriteContainer(n: PMNode, o: Origin, inner: Inner): string {
  const canonical = writeBlock(n);
  const label = labelOf(n), was = labelOf(o.node);
  const sameHead = n.attrs.name === o.node.attrs.name && sameAttributes(n.attrs.attributes as Attributes, o.node.attrs.attributes as Attributes)
    && (label && was ? label.eq(was) : !label && !was);
  const head = sameHead ? inner.open.slice(inner.fence) : canonical.split('\n', 1)[0]!.replace(/^:+/, '');
  const kids: PMNode[] = [];
  n.forEach((c) => { if (c.type.name !== 'directive_label') kids.push(c); });
  const placed = align(kids, inner.children);
  const texts = kids.map((k, i) => writePlaced(k, placed[i]!));
  const compose = (safe: boolean, fence: number): string => {
    const colons = ':'.repeat(fence);
    if (!kids.length) return `${colons}${head}${inner.children.length ? '\n' : inner.tail}${fence === inner.fence ? inner.close : colons}`;
    let body = placed[0]!.origin?.index === 0 ? inner.head : '\n';
    texts.forEach((t, i) => { body += (i ? gap(placed[i - 1]!, placed[i]!, safe, inner.usual) : '') + t; });
    const last = placed.at(-1)!.origin;
    body += last && last.index === inner.children.length - 1 ? inner.tail : '\n';
    return `${colons}${head}${body}${fence === inner.fence ? inner.close : colons}`;
  };
  const longest = /^:+/.exec(canonical)![0].length;
  const tried = new Set<string>();
  const wide = Math.max(inner.fence, longest);
  for (const [safe, fence] of [[false, inner.fence], [false, wide], [true, inner.fence], [true, wide]] as const) {
    const text = compose(safe, fence);
    if (tried.has(text)) continue;
    tried.add(text);
    if (readsAs(text, canonical, n)) return text;
  }
  return canonical;
}

/** Whether a block's text reads back as the block (the same canonical text), with its footnotes defined after it. */
function readsAs(text: string, canonical: string, n: PMNode): boolean {
  const notes = new Set<string>();
  n.descendants((d) => { if (d.type.name === 'footnote_ref') notes.add((d.attrs.label as string | null) ?? (d.attrs.identifier as string)); });
  const back = load(`${text}${[...notes].map((l) => `\n\n[^${l}]: Note.`).join('')}\n`).doc;
  return back.childCount === 1 + notes.size && writeBlock(back.firstChild!) === canonical;
}

/** The document as Markdown (see `saveMapped`). */
export const save = (doc: PMNode, loaded?: Loaded | null): string => saveMapped(doc, loaded).text;
