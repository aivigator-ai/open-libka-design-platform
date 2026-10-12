/**
 * LibKa Markdown ⇄ the editor's document, losslessly.
 *
 * Loading parses the Markdown with the same remark pipeline as `@libka/model` and keeps, for every top-level block, the
 * exact text it was written as. Saving writes a block that is unchanged (the same node, or one equal to it) as that
 * text, and the space between two untouched neighbours as it was; a changed block goes back to Markdown's syntax tree
 * and is written in one canonical LibKa style. So opening a document and saving it changes nothing, and an edit
 * touches only its own block.
 */
import type {
  Blockquote, Code, FootnoteDefinition, Heading, List, ListItem, Nodes, Paragraph, PhrasingContent, Root, RootContent, Table, TableCell, TableRow, Text, Yaml,
} from 'mdast';
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

/** A top-level block as it was loaded: the node made for it and the exact text it came from. */
interface Origin { node: PMNode; text: string; index: number; start: number; gapAfter: string }

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

/** The canonical style for changed blocks: the conventions LibKa's own documents use. */
const WRITE: Options = {
  bullet: '-', emphasis: '*', strong: '*', fence: '`', fences: true, rule: '-', listItemIndent: 'one', incrementListMarker: true, resourceLink: false,
  // the plugins are built against neighbouring versions of the writer's types; at run time they are plain objects
  extensions: [directiveToMarkdown({ preferUnquoted: true, quoteSmart: true }), gfmToMarkdown(), frontmatterToMarkdown(['yaml'])] as unknown as NonNullable<Options['extensions']>,
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

/** Loads LibKa Markdown for editing. */
export function load(source: string): Loaded {
  const root = parser.parse(source) as Root;
  const origins: Origin[] = [];
  const lines = new Map<PMNode, number>();
  lineMap = lines;
  const children = root.children.filter((c) => c.position);
  children.forEach((c, i) => {
    const start = c.position!.start.offset!, end = c.position!.end.offset!;
    const next = children[i + 1];
    origins.push({ node: block(c, source), text: source.slice(start, end), index: i, start, gapAfter: next ? source.slice(end, next.position!.start.offset) : '' });
  });
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
  const byNode = new Map(loaded?.origins.map((o) => [o.node, o]) ?? []);
  const unused = new Set(loaded?.origins ?? []);
  const originOf = (n: PMNode, i: number): Origin | undefined => {
    const same = byNode.get(n);
    if (same) return same;
    // an equal block is most likely where it was, or one place off: look there before looking everywhere
    for (const j of [i, i - 1, i + 1]) { const o = loaded?.origins[j]; if (o && unused.has(o) && o.node.eq(n)) return o; }
    for (const o of unused) if (o.node.eq(n)) return o;
    return undefined;
  };
  let text = '';
  const ranges: BlockRanges = [];
  let prev: Origin | undefined;
  doc.forEach((child, _offset, i) => {
    const o = originOf(child, i);
    if (o) unused.delete(o);
    if (i === 0) text += loaded && o?.index === 0 ? loaded.leading : '';
    else text += prev && o && o.index === prev.index + 1 ? prev.gapAfter : '\n\n';
    const written = o ? o.text : writeBlock(child);
    ranges.push({ from: text.length, to: text.length + written.length });
    text += written;
    prev = o;
  });
  text += loaded && prev && prev.index === loaded.origins.length - 1 ? loaded.trailing : '\n';
  return { text, ranges };
}

/** The document as Markdown (see `saveMapped`). */
export const save = (doc: PMNode, loaded?: Loaded | null): string => saveMapped(doc, loaded).text;
