/**
 * LibKa document model: Markdown with directives, parsed into typed blocks.
 *
 * Authors write CommonMark + GFM with front matter and a few block directives:
 *
 *   ---
 *   title: Upgrading the planner
 *   subtitle: Operator guide
 *   version: "2.1"
 *   ---
 *   :::callout[Back up first]{variant=warning}
 *   Export your schedule before you upgrade.
 *   :::
 *
 *   :::steps
 *   1. **Open settings** Choose Data > Export.
 *   :::
 *
 * Every problem is reported with its line, and a document with problems is not rendered.
 * Which directives exist, and their attributes, comes from the block registry (@libka/blocks).
 */
import type { Content, ListItem, Paragraph, PhrasingContent, Root, RootContent, Table } from 'mdast';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parse as parseYaml } from 'yaml';
import { block as blockDefinition, CALLOUT_VARIANTS, DIRECTIVES } from '@libka/blocks';

/** Inline content, kept as Markdown AST nodes so renderers decide the output format. */
export type Inline = PhrasingContent[];

export interface DocumentMeta {
  title: string;
  subtitle?: string;
  version?: string;
  date?: string;
  status?: string;
  /** Who keeps the document correct (front matter "owner" or :::doc-status). */
  owner?: string;
  /** Last review, YYYY-MM-DD. */
  reviewed?: string;
  /** Next review due, YYYY-MM-DD (front matter "next-review"). */
  nextReview?: string;
  /** Sources that [@id] citations point to (front matter "references"), in the author's order. */
  references?: Reference[];
  /** What the build makes (front matter "outputs"); absent means DEFAULT_OUTPUTS. */
  outputs?: OutputName[];
  lang: string;
}

/** The outputs a document can ask for: the web page, its A4 PDF, 16:9 slides, a Word file. */
export const OUTPUTS = ['web', 'pdf', 'deck', 'docx'] as const;
export type OutputName = (typeof OUTPUTS)[number];
/** What a document without "outputs" in its front matter gets. */
export const DEFAULT_OUTPUTS: readonly OutputName[] = ['web', 'pdf'];
/** The outputs a document asks for, in the canonical order. */
export const outputsOf = (meta: Pick<DocumentMeta, 'outputs'>): OutputName[] => OUTPUTS.filter((o) => (meta.outputs ?? DEFAULT_OUTPUTS).includes(o));

/** One source in the front matter "references" list. */
export interface Reference {
  id: string;
  title: string;
  author?: string[];
  year?: string;
  publisher?: string;
  url?: string;
}
const REFERENCE_FIELDS = ['id', 'title', 'author', 'year', 'publisher', 'url'];

/** A GFM footnote ([^id] in the text, "[^id]: note" at the top level); numbered by first use. */
export interface Footnote {
  id: string;
  body: Block[];
}

/** An inline citation, [@id] or [@id, p. 33; @other]: the parser turns them into this node. */
export interface Citation {
  type: 'citation';
  items: { id: string; locator?: string }[];
  position?: { start: { line: number } };
}

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];
export { CALLOUT_VARIANTS };
/** GitHub alert types and the callout variant each becomes. */
const ALERTS: Readonly<Record<string, CalloutVariant>> = { NOTE: 'note', TIP: 'tip', IMPORTANT: 'important', WARNING: 'warning', CAUTION: 'caution' };
/** Status values that mean the document is no longer valid (it gets a banner). */
export const isDeprecated = (status: string | undefined): boolean => /^(deprecated|obsolete|zastaral[ýéá])$/i.test(status?.trim() ?? '');
/** The status fields a document can carry, as front matter keys and :::doc-status attributes. */
const STATUS_KEYS = { status: 'status', owner: 'owner', reviewed: 'reviewed', 'next-review': 'nextReview' } as const;

export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; id: string; text: Inline }
  | { type: 'paragraph'; text: Inline }
  | { type: 'list'; ordered: boolean; start?: number; items: Block[][] }
  | CodeBlock
  /** A GitHub alert without a title has none: the renderer shows the tone word instead. */
  | { type: 'callout'; variant: CalloutVariant; title?: string; body: Block[] }
  | { type: 'dl'; caption?: string; items: { term: string; body: Block[] }[] }
  /** The document's status fields, shown where the block stands (the values are also in the meta). */
  | { type: 'doc-status'; status?: string; owner?: string; reviewed?: string; nextReview?: string }
  /** A part divider: a level-2 heading that groups the ## sections after it. */
  | { type: 'section'; title: string; id: string; break: 'page' | 'none'; body: Block[] }
  | { type: 'summary'; title?: string; items: Inline[]; source: 'human' | 'ai'; reviewedBy?: string }
  | { type: 'cta'; label: string; href: string; variant: 'primary' | 'secondary'; text?: Inline }
  /** Contents placed explicitly (resolved when rendering); replaces the manual's automatic contents. */
  | { type: 'toc'; title?: string; depth: 2 | 3;
      /** On slides only: the agenda entries this piece shows (set by the deck, so a long agenda can continue on the next slide). */
      entries?: [number, number] }
  /** Where the list of cited sources goes, and its style. */
  | { type: 'references'; title?: string; style: 'numeric' | 'author-date' }
  /** Dated items in order; `current` is the "when" of the item marked "Now". */
  | { type: 'timeline'; caption?: string; current?: string; items: { when: string; body: Block[] }[] }
  /** Options against features; `highlight` is the index of the recommended column (1 = the first option). */
  | { type: 'comparison'; caption: string; highlight?: number; badge?: string; head: Inline[]; rows: ComparisonCell[][] }
  /** A Mermaid diagram; `svg` is filled in at build time (in Chrome), the rest comes from the source. */
  | { type: 'diagram'; kind: DiagramKind; source: string; title: string; desc: string; svg?: string }
  /** The same code in several variants (package managers, languages), shown as tabs. */
  | { type: 'code-group'; items: CodeBlock[] }
  /** One version of a changelog: a level-2 heading with typed groups in the Keep a Changelog order. */
  | { type: 'release'; version: string; id: string; date?: string; intro?: Block[]; groups: { kind: ReleaseKind; body: Block[] }[] }
  /** `start` continues the numbering of a procedure split in parts (the list starts at "4."). */
  | { type: 'steps'; start?: number; steps: { title: Inline; body: Block[] }[] }
  | { type: 'checklist'; items: { done: boolean; text: Inline }[] }
  | { type: 'table'; caption: string; head: Inline[]; rows: Inline[][] }
  | { type: 'figure'; src: string; alt: string; caption: string }
  /** Speaker notes: shown only in decks (notes panel and presenter view), never in the manual. */
  | { type: 'notes'; body: Block[] }
  | { type: 'tabs'; tabs: { label: string; body: Block[] }[] }
  | { type: 'accordion'; items: { title: string; body: Block[] }[] }
  | { type: 'shortcuts'; caption: string; items: { keys: string[]; text: Inline }[] }
  | { type: 'glossary'; items: { term: string; id: string; body: Block[] }[] }
  | { type: 'compare'; items: { kind: 'do' | 'dont'; title: string; body: Block[] }[] }
  | { type: 'quote'; body: Block[]; source?: string; cite?: string }
  | { type: 'cards'; cards: { title: string; href?: string; badge?: string; body: Block[] }[] }
  | { type: 'statement'; text: Inline }
  | { type: 'metrics'; items: { value: string; label: Inline }[] }
  | { type: 'gallery'; images: { src: string; alt: string; caption: string }[] }
  | { type: 'video'; title: string; src: string; captions?: string; poster?: string; transcript: Block[] }
  | { type: 'chart'; kind: 'bar' | 'line' | 'donut'; caption: string; unit?: string; category: string; labels: string[]; series: { name: string; values: number[] }[] }
  | { type: 'ui'; caption: string; theme: 'light' | 'dark' | 'both'; layout: 'row' | 'stack'; items: UiItem[] };

export interface CodeBlock { type: 'code'; lang: string | null; value: string; title?: string; marked?: number[] }

/** Mermaid diagram types LibKa styles with its tokens, by the keyword that starts the source. */
export type DiagramKind = 'flowchart' | 'sequence' | 'state' | 'class' | 'er';
const DIAGRAM_KINDS: Readonly<Record<string, DiagramKind>> = {
  flowchart: 'flowchart', graph: 'flowchart', sequenceDiagram: 'sequence', stateDiagram: 'state', 'stateDiagram-v2': 'state', classDiagram: 'class', erDiagram: 'er',
};

/** A comparison cell: its text, and the mark when it starts with yes, no or partial (the text is then the qualifier, if any). */
export interface ComparisonCell { text: Inline; mark?: 'yes' | 'no' | 'partial' }
const MARKS: Readonly<Record<string, 'yes' | 'no' | 'partial'>> = {
  yes: 'yes', ano: 'yes', '✓': 'yes', '✔': 'yes', no: 'no', ne: 'no', '✗': 'no', '✘': 'no', '×': 'no', partial: 'partial', 'částečně': 'partial', '~': 'partial',
};

/**
 * A comparison cell: "yes" alone is a mark; "partial (50 per month)" or "yes, up to 5" is a mark with a
 * qualifier. The qualifier must follow a bracket, comma, colon or dash, so "No limit" stays plain text.
 */
function comparisonCell(text: Inline): ComparisonCell {
  const whole = MARKS[plainText(text).trim().toLowerCase()];
  if (whole) return { text: [], mark: whole };
  const first = text[0];
  const m = first?.type === 'text' ? first.value.match(/^\s*(yes|no|partial|ano|ne|částečně|✓|✔|✗|✘|×|~)\s*(?=[(,:–—-])/i) : null;
  const mark = m ? MARKS[m[1]!.toLowerCase()] : undefined;
  if (!m || !mark || first?.type !== 'text') return { text };
  const rest = first.value.slice(m[0].length).replace(/^[,:–—-]\s*/, '');
  return { text: [...(rest ? [{ ...first, value: rest }] : []), ...text.slice(1)], mark };
}

/** Keep a Changelog groups, in its order. */
export const RELEASE_KINDS = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

/** One component in a :::ui specimen (manual section 10). */
export interface UiItem {
  kind: 'button' | 'field' | 'badge' | 'toast' | 'modal' | 'empty';
  label: string;
  variant?: string;
  state?: string;
  input?: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  options?: string[];
  required?: boolean;
  text?: string;
  action?: string;
  primary?: string;
  secondary?: string;
  destructive?: boolean;
}
export const UI_COMPONENTS: readonly UiItem['kind'][] = ['button', 'field', 'badge', 'toast', 'modal', 'empty'];

/** Keys of a :kbd[Ctrl+Shift+P] inline directive: ["Ctrl", "Shift", "P"]. */
export function kbdKeys(label: string): string[] {
  const t = label.trim();
  if (t === '+') return ['+'];
  return t.split(/\s*\+\s*/).map((k) => k || '+').filter(Boolean);
}

/** Video addresses LibKa embeds behind a click (privacy-enhanced), or null for a video file. */
export function videoEmbed(src: string): { provider: 'YouTube' | 'Vimeo'; id: string } | null {
  const yt = src.match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { provider: 'YouTube', id: yt[1]! };
  const vimeo = src.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/);
  return vimeo ? { provider: 'Vimeo', id: vimeo[1]! } : null;
}

export interface LibkaDocument {
  meta: DocumentMeta;
  blocks: Block[];
  /** Footnotes in the order of their first reference (note 1 first). */
  footnotes?: Footnote[];
}

/**
 * A way to fix a problem, as data (editors apply it; see @libka/editor's applyFix). A `field` fix never changes the
 * text: it shows the place where the author must write something only they know (alternative text, a caption, a title).
 */
export type Fix =
  | { kind: 'field'; target: 'alt' | 'caption' | 'label' | 'text' | `attribute:${string}` | `document:${string}` }
  | { kind: 'remove-attribute'; name: string }
  | { kind: 'rename-attribute'; from: string; to: string }
  | { kind: 'set-attribute'; name: string; value: string }
  | { kind: 'rename-block'; to: string }
  | { kind: 'wrap'; block: string; attributes?: Record<string, string> }
  | { kind: 'heading-level'; level: number }
  | { kind: 'list-type'; ordered: boolean }
  | { kind: 'set-front-matter'; key: string; value: string | string[] };

export interface Problem {
  line: number;
  /** A stable name for the kind of problem (docs/problem-codes.md), such as `image-alt`. */
  code: string;
  message: string;
  /** Ways to fix it, the most likely first (absent when only the author can tell what is meant). */
  fixes?: Fix[];
}

/** The closest of `options` to `word` when it is a likely misspelling (at most two edits, or a third of its length). */
export function nearest(word: string, options: readonly string[]): string | undefined {
  const w = word.toLowerCase();
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]!;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cur = row[j]!;
        row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
      }
    }
    return row[b.length]!;
  };
  let best: string | undefined;
  let bestD = Infinity;
  for (const o of options) {
    const d = distance(w, o.toLowerCase());
    if (d < bestD) { best = o; bestD = d; }
  }
  return best !== undefined && bestD > 0 && bestD <= Math.max(2, Math.floor(w.length / 3)) ? best : undefined;
}

export interface ParseResult {
  document: LibkaDocument;
  problems: Problem[];
}

// Directive nodes added by remark-directive (typed locally to keep the public types small).
interface DirectiveNode {
  type: 'containerDirective' | 'leafDirective' | 'textDirective';
  name: string;
  attributes?: Record<string, string | null | undefined> | null;
  children: (Content & { data?: { directiveLabel?: boolean } })[];
  position?: { start: { line: number } };
}

const line = (node: { position?: { start: { line: number } } | undefined }): number => node.position?.start.line ?? 0;

/** Plain text of inline content (for ids, captions, titles). */
export function plainText(nodes: readonly (Content | PhrasingContent)[]): string {
  return nodes
    .map((n) => ('value' in n && typeof n.value === 'string' ? n.value : 'children' in n ? plainText(n.children as Content[]) : ''))
    .join('');
}

function slug(text: string, used: Set<string>): string {
  const base = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
  used.add(id);
  return id;
}

export function parse(markdown: string): ParseResult {
  const problems: Problem[] = [];
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).use(remarkDirective)
    .parse(markdown) as Root;
  literalTextDirectives(tree, markdown);
  dropInlineComments(tree);
  const definitions = footnoteDefinitions(tree, problems);
  const ids = new Set<string>();

  // ---- front matter ----
  const meta: DocumentMeta = { title: '', lang: 'en' };
  const fm = tree.children.find((n) => n.type === 'yaml');
  if (fm && 'value' in fm) {
    try {
      const data = parseYaml(String(fm.value)) ?? {};
      for (const key of ['title', 'subtitle', 'version', 'date', 'lang'] as const) {
        if (data[key] !== undefined && data[key] !== null) meta[key] = String(data[key]);
      }
      for (const [key, field] of Object.entries(STATUS_KEYS)) {
        if (data[key] !== undefined && data[key] !== null) meta[field] = String(data[key]);
      }
      if (data.references !== undefined && data.references !== null) meta.references = references(data.references, line(fm), problems);
      if (data.outputs !== undefined) {
        const list = outputList(data.outputs, line(fm), problems);
        if (list) meta.outputs = list;
      }
      const known = ['title', 'subtitle', 'version', 'date', 'lang', 'references', 'outputs', ...Object.keys(STATUS_KEYS)];
      const unknown = Object.keys(data).filter((k) => !known.includes(k));
      if (unknown.length) {
        const named = unknown.map((k) => { const near = nearest(k, known); return near ? `${k} (did you mean ${near}?)` : k; });
        problems.push({ code: 'front-matter-unknown-key', line: line(fm), message: `unknown front matter keys: ${named.join(', ')} (known: ${known.join(', ')})` });
      }
    } catch (e) {
      problems.push({ code: 'front-matter-invalid', line: line(fm), message: `front matter is not valid YAML: ${(e as Error).message}` });
    }
  }

  // The first level-1 heading is the title when front matter does not set one.
  const body = tree.children.filter((n) => n.type !== 'yaml');
  const h1Index = body.findIndex((n) => n.type === 'heading' && n.depth === 1);
  if (h1Index >= 0) {
    const h1 = body[h1Index] as Extract<RootContent, { type: 'heading' }>;
    if (!meta.title) meta.title = plainText(h1.children);
    body.splice(h1Index, 1);
  }
  if (!meta.title) problems.push({ code: 'missing-title', line: 1, message: 'the document needs a title (front matter "title" or a "# Heading")', fixes: [{ kind: 'field', target: 'document:title' }] });

  const blocks = convert(body, problems, ids);
  headingOrder(body, problems);
  const notes = definitions.map((d) => {
    const out = convert(d.children as Content[], problems, ids);
    if (out.some((b) => b.type !== 'paragraph' && b.type !== 'list' && b.type !== 'code')) {
      problems.push({ code: 'footnote-content', line: line(d), message: `footnote [^${d.label ?? d.identifier}] holds text, lists or code only` });
    }
    return { id: d.identifier, label: d.label ?? d.identifier, line: line(d), body: out };
  });
  const footnotes = numberFootnotes(blocks, notes, problems);
  citations([blocks, footnotes], meta, problems, fm ? line(fm) : 1);
  checkFrame(blocks, meta, problems, fm ? line(fm) : 1);
  checkAnchors(blocks, ids, problems);
  return { document: { meta, blocks, ...(footnotes.length ? { footnotes } : {}) }, problems };
}

/**
 * Headings go down one level at a time (the title, then ##, ###, ####): a skipped level breaks the outline readers
 * navigate by, and fails PDF/UA's heading order (ISO 14289-1 7.4.2) in the PDF. Part dividers and releases are
 * ## headings themselves.
 */
function headingOrder(body: readonly RootContent[], problems: Problem[]): void {
  let previous = 1;
  for (const node of body) {
    if (node.type === 'containerDirective' && (node.name === 'section' || node.name === 'release')) { previous = 2; continue; }
    if (node.type !== 'heading' || node.depth < 2) continue;
    const depth = Math.min(node.depth, 4);
    if (depth > previous + 1) {
      const want = previous + 1;
      problems.push({
        code: 'heading-skipped', line: line(node), fixes: [{ kind: 'heading-level', level: want }],
        message: `"${'#'.repeat(node.depth)}" after ${previous === 1 ? 'the title' : `"${'#'.repeat(previous)}"`} skips a level: use "${'#'.repeat(want)}" (headings go down one level at a time)`,
      });
      previous = want;
    } else previous = depth;
  }
}

type FootnoteDefinition = Extract<Content, { type: 'footnoteDefinition' }>;

/** Takes the footnote definitions out of the tree; only top-level ones count (GFM links no others). */
function footnoteDefinitions(tree: Root, problems: Problem[]): FootnoteDefinition[] {
  const found: FootnoteDefinition[] = [];
  const seen = new Set<string>();
  const strip = (node: { children?: unknown[] }, top: boolean): void => {
    if (!node.children) return;
    node.children = node.children.filter((child) => {
      const c = child as FootnoteDefinition;
      if (c.type !== 'footnoteDefinition') { strip(c as { children?: unknown[] }, false); return true; }
      const name = c.label ?? c.identifier;
      if (!top) problems.push({ code: 'footnote-nested', line: line(c), message: `footnote [^${name}] is defined inside a block: move "[^${name}]: ..." to the top level (the end of the document is best)` });
      else if (seen.has(c.identifier)) problems.push({ code: 'footnote-duplicate', line: line(c), message: `footnote [^${name}] is defined twice` });
      else { seen.add(c.identifier); found.push(c); }
      return false;
    });
  };
  strip(tree, true);
  return found;
}

const PHRASING = new Set(['text', 'strong', 'emphasis', 'delete', 'inlineCode', 'link', 'break', 'image', 'footnoteReference', 'textDirective', 'citation']);

/** Calls `visit` on every array of inline content in blocks (after merging adjacent text nodes). */
function eachInline(value: unknown, visit: (nodes: PhrasingContent[]) => void): void {
  if (Array.isArray(value)) {
    if (value.some((v) => v && typeof v === 'object' && PHRASING.has((v as { type?: string }).type ?? ''))) {
      for (let i = value.length - 1; i > 0; i--) {
        const [a, b] = [value[i - 1] as { type: string; value: string; position?: { end: unknown } }, value[i] as { type: string; value: string; position?: { end: unknown } }];
        if (a.type === 'text' && b.type === 'text') {
          value.splice(i - 1, 2, { ...a, value: a.value + b.value, ...(a.position && b.position ? { position: { ...a.position, end: b.position.end } } : {}) });
        }
      }
      visit(value as PhrasingContent[]);
    }
    value.forEach((v) => eachInline(v, visit));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) if (k !== 'position' && v && typeof v === 'object') eachInline(v, visit);
}

/** Footnotes numbered by first reference; undefined references and unused definitions are problems. */
function numberFootnotes(blocks: Block[], notes: { id: string; label: string; line: number; body: Block[] }[], problems: Problem[]): Footnote[] {
  const order: string[] = [];
  const scan = (value: unknown) => eachInline(value, (nodes) => {
    for (const n of nodes) {
      if (n.type === 'footnoteReference' && !order.includes(n.identifier)) order.push(n.identifier);
      if (n.type === 'text') {
        for (const m of n.value.matchAll(/\[\^([^\]\s]+)\]/g)) {
          problems.push({ code: 'footnote-undefined', line: line(n), message: `footnote [^${m[1]}] has no definition: add "[^${m[1]}]: the note" on its own line at the top level` });
        }
      }
    }
  });
  scan(blocks);
  for (let i = 0; i < order.length; i++) scan(notes.find((n) => n.id === order[i])?.body);   // notes may cite notes
  for (const n of notes) if (!order.includes(n.id)) problems.push({ code: 'footnote-unused', line: n.line, message: `footnote [^${n.label}] is never used: refer to it with [^${n.label}] or remove it` });
  return order.flatMap((id) => notes.filter((n) => n.id === id).map((n) => ({ id: n.id, body: n.body })));
}

/** [@id] and [@id, p. 33; @other] become citation nodes when the document has a references list. */
function citations(where: unknown, meta: DocumentMeta, problems: Problem[], fmLine: number): void {
  if (!meta.references) return;
  const known = new Set(meta.references.map((r) => r.id));
  const used = new Set<string>();
  eachInline(where, (nodes) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]!;
      if (n.type !== 'text' || !n.value.includes('[@')) continue;
      const parts: PhrasingContent[] = [];
      let last = 0;
      for (const m of n.value.matchAll(/\[(@[^\][]+)\]/g)) {
        const items = m[1]!.split(';').map((s) => s.match(/^\s*@([\w][\w:.#$%&+?<>~/-]*)\s*(?:,\s*(.*?))?\s*$/));
        if (items.some((it) => !it)) continue;
        const cite: Citation = { type: 'citation', items: items.map((it) => ({ id: it![1]!, ...(it![2] ? { locator: it![2] } : {}) })), ...(n.position ? { position: n.position } : {}) };
        for (const it of cite.items) {
          used.add(it.id);
          if (!known.has(it.id)) {
            const near = [...known].filter((k) => k.toLowerCase().startsWith(it.id.slice(0, 3).toLowerCase())).slice(0, 3);
            problems.push({ code: 'citation-unknown', line: line(n), message: `[@${it.id}] cites a source that is not in the front matter references${near.length ? ` (did you mean ${near.map((k) => `@${k}`).join(', ')}?)` : ''}` });
          }
        }
        if (m.index! > last) parts.push({ ...n, value: n.value.slice(last, m.index) });
        parts.push(cite as unknown as PhrasingContent);
        last = m.index! + m[0].length;
      }
      if (!parts.length) continue;
      if (last < n.value.length) parts.push({ ...n, value: n.value.slice(last) });
      nodes.splice(i, 1, ...parts);
    }
  });
  for (const r of meta.references) {
    if (r.id && !used.has(r.id)) problems.push({ code: 'reference-uncited', line: fmLine, message: `reference "${r.id}" is never cited: cite it with [@${r.id}] or remove it from references` });
  }
}

/** Ids of the cited sources in the order of their first citation (numeric style numbers them so). */
export function citationOrder(doc: LibkaDocument): string[] {
  const order: string[] = [];
  eachInline([doc.blocks, doc.footnotes ?? []], (nodes) => {
    for (const n of nodes as unknown as Citation[]) if (n.type === 'citation') for (const it of n.items) if (!order.includes(it.id)) order.push(it.id);
  });
  return order;
}

/** The front matter "references" list: entries with an id and a title, checked field by field. */
/**
 * Front matter "outputs": a list (or one name) of web, pdf, deck and docx. The PDF and the Word file are made
 * from the web page's checked build and signed in its manifest, so they need web.
 */
function outputList(value: unknown, at: number, problems: Problem[]): OutputName[] | null {
  const example = `for example outputs: [web, pdf, docx] (known: ${OUTPUTS.join(', ')}; without outputs a document gets ${DEFAULT_OUTPUTS.join(' and ')})`;
  const raw = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
    problems.push({ code: 'outputs-not-list', line: at, message: `outputs must be a list of output names, ${example}` });
    return null;
  }
  const names = raw.map((v) => String(v).trim().toLowerCase());
  const unknown = names.filter((n) => !(OUTPUTS as readonly string[]).includes(n));
  if (unknown.length) {
    const hint = unknown.map((n) => (n === 'html' || n === 'page' ? ' ("web" is the web page)' : n === 'slides' ? ' (slides are "deck")' : n === 'word' ? ' (Word is "docx")' : '')).join('');
    // a likely misspelling or another word for an output (word, slides, html) is corrected; the rest dropped
    const alias: Record<string, string> = { html: 'web', page: 'web', slides: 'deck', word: 'docx' };
    const fixed = [...new Set(names.map((n) => (OUTPUTS as readonly string[]).includes(n) ? n : alias[n] ?? nearest(n, OUTPUTS)).filter((n): n is string => Boolean(n)))];
    problems.push({ code: 'outputs-unknown', line: at, message: `unknown outputs: ${unknown.join(', ')}${hint}; ${example}`, ...(fixed.length ? { fixes: [{ kind: 'set-front-matter', key: 'outputs', value: OUTPUTS.filter((o) => fixed.includes(o)) }] } : {}) });
    return null;
  }
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) problems.push({ code: 'outputs-duplicate', line: at, message: `outputs lists ${[...new Set(dupes)].join(', ')} twice` });
  if (!names.length) {
    problems.push({ code: 'outputs-empty', line: at, message: `outputs is empty: name at least one, ${example}` });
    return null;
  }
  const needWeb = names.filter((n) => n === 'pdf' || n === 'docx');
  if (needWeb.length && !names.includes('web')) {
    problems.push({ code: 'outputs-need-web', line: at, message: `outputs: ${needWeb.join(' and ')} ${needWeb.length > 1 ? 'are' : 'is'} made from the web page and signed with it: add web`,
      fixes: [{ kind: 'set-front-matter', key: 'outputs', value: OUTPUTS.filter((o) => o === 'web' || names.includes(o)) }] });
  }
  return OUTPUTS.filter((o) => names.includes(o));
}

function references(value: unknown, at: number, problems: Problem[]): Reference[] {
  const example = 'references:\n  - id: wcag22\n    title: Web Content Accessibility Guidelines 2.2\n    author: W3C\n    year: 2023';
  if (!Array.isArray(value)) {
    problems.push({ code: 'references-not-list', line: at, message: `references must be a list of sources, for example:\n${example}` });
    return [];
  }
  const out: Reference[] = [];
  const seen = new Set<string>();
  value.forEach((raw, i) => {
    const where = `reference ${i + 1}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      problems.push({ code: 'reference-invalid', line: at, message: `${where} must have fields such as id and title:\n${example}` });
      return;
    }
    const r = raw as Record<string, unknown>;
    const text = (k: string) => (r[k] === undefined || r[k] === null ? undefined : String(r[k]).trim() || undefined);
    const extra = Object.keys(r).filter((k) => !REFERENCE_FIELDS.includes(k));
    if (extra.length) problems.push({ code: 'reference-unknown-field', line: at, message: `${where} has unknown fields: ${extra.join(', ')} (known: ${REFERENCE_FIELDS.join(', ')})` });
    const id = text('id');
    const title = text('title');
    if (!id || !/^[\w][\w:.#$%&+?<>~/-]*$/.test(id)) problems.push({ code: 'reference-bad-id', line: at, message: `${where} needs an id of letters, digits and - _ : . / (cited as [@id])` });
    else if (seen.has(id)) problems.push({ code: 'reference-duplicate', line: at, message: `reference id "${id}" is used twice` });
    if (!title) problems.push({ code: 'reference-missing-title', line: at, message: `${where}${id ? ` (${id})` : ''} needs a title` });
    const url = text('url');
    if (url && !/^(https?:\/\/|mailto:|\.{0,2}\/|[\w-]+\.)/i.test(url)) problems.push({ code: 'reference-bad-url', line: at, message: `${where}${id ? ` (${id})` : ''}: url must be a web address` });
    const author = Array.isArray(r.author) ? r.author.map((a) => String(a).trim()).filter(Boolean) : text('author') ? [text('author')!] : undefined;
    if (id) seen.add(id);
    const ref: Reference = { id: id ?? '', title: title ?? '' };
    if (author?.length) ref.author = author;
    const year = text('year');
    const publisher = text('publisher');
    if (year) ref.year = year;
    if (publisher) ref.publisher = publisher;
    if (url) ref.url = url;
    out.push(ref);
  });
  return out;
}

/** Block lines for checks that run after parsing (the model itself carries no positions). */
const blockLines = new WeakMap<object, number>();

/** Frame blocks: :::doc-status and :::section stand at the top level, and the status fields agree. */
function checkFrame(blocks: Block[], meta: DocumentMeta, problems: Problem[], fmLine: number): void {
  const nested = (value: unknown, top: boolean): void => {
    if (Array.isArray(value)) { value.forEach((v) => nested(v, top)); return; }
    if (!value || typeof value !== 'object') return;
    const b = value as { type?: string };
    if (!top && ['doc-status', 'section', 'toc', 'references', 'release'].includes(b.type ?? '')) {
      problems.push({ code: 'block-not-top-level', line: blockLines.get(b) ?? 0, message: `:::${b.type} cannot be inside another block: put it at the top level of the document` });
    }
    for (const v of Object.values(value)) if (v && typeof v === 'object') nested(v, false);
  };
  for (const b of blocks) for (const v of Object.values(b)) if (v && typeof v === 'object') nested(v, false);
  for (const type of ['doc-status', 'toc', 'references'] as const) {
    const all = blocks.filter((b) => b.type === type);
    if (all.length > 1) problems.push({ code: 'block-twice', line: blockLines.get(all[1]!) ?? 0, message: `only one :::${type} per document` });
  }
  const refs = blocks.find((b) => b.type === 'references');
  if (refs && !meta.references?.length) {
    problems.push({ code: 'references-empty', line: blockLines.get(refs) ?? 0, message: ':::references needs sources: add a references list to the front matter and cite them with [@id]' });
  }

  const status = blocks.filter((b): b is Extract<Block, { type: 'doc-status' }> => b.type === 'doc-status');
  const s = status[0];
  if (s) {
    for (const [key, field] of Object.entries(STATUS_KEYS)) {
      const own = s[field];
      if (own && meta[field] && own !== meta[field]) {
        problems.push({ code: 'doc-status-conflict', line: blockLines.get(s) ?? 0, message: `${key} is "${meta[field]}" in the front matter and "${own}" in :::doc-status: set it in one place` });
      }
      if (own) meta[field] = own;
      else if (meta[field]) s[field] = meta[field];
    }
    if (!s.status && !s.owner && !s.reviewed && !s.nextReview) {
      problems.push({ code: 'doc-status-empty', line: blockLines.get(s) ?? 0, message: ':::doc-status has nothing to show: set status, owner, reviewed or next-review (here or in the front matter)' });
    }
  }
  const where = s ? blockLines.get(s) ?? fmLine : fmLine;
  for (const [key, field] of [['reviewed', 'reviewed'], ['next-review', 'nextReview']] as const) {
    const v = meta[field];
    if (v && !isIsoDate(v)) problems.push({ code: 'date-format', line: where, message: `${key} must be a date written YYYY-MM-DD (found "${v}")` });
  }
  if (meta.reviewed && meta.nextReview && isIsoDate(meta.reviewed) && isIsoDate(meta.nextReview) && meta.nextReview <= meta.reviewed) {
    problems.push({ code: 'review-order', line: where, message: `next-review (${meta.nextReview}) must come after reviewed (${meta.reviewed})` });
  }
}

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** In-page links (#id) must point at a heading or glossary term of this document. */
function checkAnchors(blocks: Block[], ids: Set<string>, problems: Problem[]): void {
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const n = value as { type?: string; url?: string; href?: string; position?: { start: { line: number } } };
    const url = n.type === 'link' ? n.url : n.type === 'cta' ? n.href : undefined;
    if (url?.startsWith('#') && url.length > 1 && !/^#\d+$/.test(url)) {
      const id = decodeURIComponent(url.slice(1));
      if (!ids.has(id)) {
        const near = [...ids].filter((i) => i.includes(id.split('-')[0] ?? id)).slice(0, 3);
        problems.push({ code: 'link-broken', line: n.position?.start.line ?? blockLines.get(n) ?? 0, message: `link to "${url}" points nowhere in this document`
          + `${near.length ? ` (did you mean ${near.map((i) => `#${i}`).join(', ')}?)` : ''}; heading ids are the heading text in lower case with hyphens` });
      }
    }
    for (const v of Object.values(value)) if (v && typeof v === 'object') walk(v);
  };
  walk(blocks);
}

/** An HTML comment and nothing else (a note for editors), never rendered. */
const isComment = (value: string) => /^<!--(?:(?!-->)[\s\S])*-->$/.test(value.trim());

/** Comments inside text ("a <!-- note --> b") are dropped too, so a note never reaches a reader or a signed output. */
function dropInlineComments(node: { type?: string; children?: unknown[] }): void {
  if (!node.children) return;
  if (node.type !== 'root') node.children = node.children.filter((c) => !((c as { type: string }).type === 'html' && isComment((c as { value: string }).value)));
  for (const c of node.children) dropInlineComments(c as { children?: unknown[] });
}

/**
 * remark-directive reads ":name" inside text as a directive, so "16:9" or "10:30" would lose ":9" and
 * ":30". LibKa has no inline directives: put the original source text back.
 */
function literalTextDirectives(node: { children?: unknown[] }, markdown: string): void {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    const c = child as { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: unknown[] };
    const known = c.type === 'textDirective' && ['kbd', 'badge'].includes((c as { name?: string }).name ?? '') && c.children?.length;
    if (c.type === 'textDirective' && !known && c.position?.start.offset !== undefined && c.position.end.offset !== undefined) {
      return { type: 'text', value: markdown.slice(c.position.start.offset, c.position.end.offset), position: c.position };
    }
    literalTextDirectives(c, markdown);
    return c;
  });
}

/** The name of an inline directive left open in text (":kbd[" with no closing bracket), not in code. */
function unclosedInline(children: readonly unknown[]): string | undefined {
  // the parser leaves ":kbd" and "[Cmd+]" as neighbouring text nodes, so read each run of text as one string
  let run = '';
  for (const child of [...children, null]) {
    const c = child as { type?: string; value?: string; children?: unknown[] } | null;
    if (c?.type === 'text') { run += c.value ?? ''; continue; }
    const m = run.match(/:(kbd|badge)\[/);
    if (m) return m[1];
    run = '';
    if (c && c.type !== 'inlineCode' && c.children) {
      const inner = unclosedInline(c.children);
      if (inner) return inner;
    }
  }
  return undefined;
}

function convert(nodes: readonly (Content | RootContent)[], problems: Problem[], ids: Set<string>): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    const block = convertOne(node, problems, ids);
    if (block) out.push(block);
  }
  return out;
}

function convertOne(node: Content | RootContent, problems: Problem[], ids: Set<string>): Block | null {
  switch (node.type) {
    case 'heading': {
      if (node.depth === 1) {
        problems.push({ code: 'heading-title-twice', line: line(node), message: 'only one "# Heading" (the title) is allowed; use "##" for sections', fixes: [{ kind: 'heading-level', level: 2 }] });
        return null;
      }
      const level = Math.min(node.depth, 4) as 2 | 3 | 4;
      if (node.depth > 4) problems.push({ code: 'heading-too-deep', line: line(node), message: 'headings deeper than "####" are not allowed', fixes: [{ kind: 'heading-level', level: 4 }] });
      return { type: 'heading', level, id: slug(plainText(node.children), ids), text: node.children };
    }
    case 'paragraph': {
      // A block the parser could not read falls back to plain text; never let that pass silently.
      const stray = plainText(node.children).split('\n').find((l) => /^:{2,}[a-z]/i.test(l.trim()));
      if (stray) {
        problems.push({ code: 'block-unreadable', line: line(node), message: `"${stray.trim().slice(0, 40)}" looks like a block but could not be read: check its brackets and attributes `
          + `(to put a double quote inside a value, wrap the value in single quotes: source='A "quoted" title')` });
      }
      // an inline :kbd[...] or :badge[...] the parser could not close stays as text: "Cmd+\]" escapes its bracket
      const open = unclosedInline(node.children);
      if (open) {
        problems.push({ code: 'inline-unclosed', line: line(node), message: `":${open}[" is not closed, so it would show as text: check its brackets; a backslash before "]" escapes it, so write a backslash key twice (:kbd[Ctrl+\\\\])` });
      }
      return figureFrom(node, problems) ?? { type: 'paragraph', text: node.children };
    }
    case 'list':
      if (node.children.some((i) => typeof i.checked === 'boolean')) {
        problems.push({ code: 'task-list-outside-checklist', line: line(node), message: 'task lists belong in a :::checklist block', fixes: [{ kind: 'wrap', block: 'checklist' }] });
      }
      return { type: 'list', ordered: Boolean(node.ordered), ...(node.ordered && node.start && node.start > 1 ? { start: node.start } : {}), items: node.children.map((i) => convert(i.children, problems, ids)) };
    case 'code': {
      if (node.lang === 'mermaid') return diagram(node.value, line(node), problems);
      const meta = node.meta ?? '';
      const title = meta.match(/title="([^"]*)"/)?.[1];
      const marks = meta.replace(/title="[^"]*"/, '').match(/\{([\d,\s-]+)\}/)?.[1];
      const backwards: string[] = [];
      const marked = marks ? marks.split(',').flatMap((part) => {
        const [a, b] = part.split('-').map((x) => Number(x.trim()));
        if (b && b < a!) backwards.push(`${a}-${b}`);
        return b ? Array.from({ length: Math.max(0, b - a! + 1) }, (_, i) => a! + i) : [a!];
      }).filter((n) => Number.isInteger(n) && n > 0) : [];
      const lines = node.value.split('\n').length;
      for (const r of backwards) problems.push({ code: 'code-highlight-range', line: line(node), message: `the highlighted range ${r} runs backwards: write ${r.split('-').reverse().join('-')}` });
      if (marked.some((n) => n > lines)) problems.push({ code: 'code-highlight-range', line: line(node), message: `highlighted line ${Math.max(...marked)} is beyond the ${lines} ${lines === 1 ? 'line' : 'lines'} of this code block` });
      return { type: 'code', lang: node.lang ?? null, value: node.value, ...(title ? { title } : {}), ...(marked.length ? { marked } : {}) };
    }
    case 'blockquote':
      return alert(node, problems, ids) ?? { type: 'quote', body: convert(node.children, problems, ids) };
    case 'table':
      problems.push({ code: 'table-caption', line: line(node), message: 'tables need a caption: wrap them in :::table{caption="..."}', fixes: [{ kind: 'wrap', block: 'table', attributes: { caption: '' } }] });
      return null;
    case 'thematicBreak':
    case 'html':
      // a comment is a note for editors (or a generator's marker): never rendered, so it is allowed
      if (node.type === 'html' && !isComment(node.value)) problems.push({ code: 'raw-html', line: line(node), message: 'raw HTML is not allowed in LibKa documents' });
      return null;
    case 'containerDirective' as never:
    case 'leafDirective' as never:
    case 'textDirective' as never: {
      const b = directive(node as unknown as DirectiveNode, problems, ids);
      if (b) blockLines.set(b, line(node));
      return b;
    }
    case 'definition':
      problems.push({ code: 'unsupported-element', line: line(node), message: `reference-style links ([${node.label ?? node.identifier}]: ${node.url}) are not supported: write the link inline, as [text](${node.url})` });
      return null;
    default:
      problems.push({ code: 'unsupported-element', line: line(node), message: `unsupported Markdown element: ${node.type}` });
      return null;
  }
}

/**
 * A ```mermaid fence: one of the allowlisted types, with accTitle and accDescr (Mermaid writes them into the
 * SVG as its title and description). Colours come from LibKa, so styling statements and init blocks are refused.
 */
function diagram(source: string, at: number, problems: Problem[]): Block {
  const lines = source.split('\n');
  const first = lines.findIndex((l) => l.trim() && !l.trim().startsWith('%%') || l.trim().startsWith('%%{'));
  const head = first >= 0 ? lines[first]!.trim() : '';
  if (head.startsWith('%%{') || head === '---') {
    problems.push({ code: 'diagram-init', line: at + first + 1, message: 'Mermaid init blocks and front matter are not allowed in a diagram: colours, fonts and layout come from LibKa' });
  }
  const keyword = head.split(/\s+/)[0] ?? '';
  const kind = DIAGRAM_KINDS[keyword];
  if (!kind && !head.startsWith('%%{') && head !== '---') {
    problems.push({ code: 'diagram-type', line: at + Math.max(first, 0) + 1, message: `diagram type "${keyword || '(none)'}" is not supported: start with flowchart, sequenceDiagram, stateDiagram-v2, classDiagram or erDiagram` });
  }
  const title = source.match(/^\s*accTitle\s*:\s*(.+?)\s*$/m)?.[1] ?? '';
  const desc = (source.match(/^\s*accDescr\s*:\s*(.+?)\s*$/m)?.[1] ?? source.match(/^\s*accDescr\s*\{([\s\S]*?)\}/m)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  if (!title) problems.push({ code: 'diagram-title', line: at, message: 'a diagram needs a title: add "accTitle: What the diagram shows" after its first line (it becomes the caption)', fixes: [{ kind: 'field', target: 'text' }] });
  if (!desc) problems.push({ code: 'diagram-description', line: at, message: 'a diagram needs a description for readers who cannot see it: add "accDescr: what it shows, step by step" after its first line', fixes: [{ kind: 'field', target: 'text' }] });
  lines.forEach((l, i) => {
    if (/^\s*(style|classDef|linkStyle)\s/.test(l)) problems.push({ code: 'diagram-colours', line: at + i + 1, message: `"${l.trim().split(/\s+/)[0]}" sets colours in a diagram; remove it (diagrams take LibKa's colours in every theme)` });
  });
  return { type: 'diagram', kind: kind ?? 'flowchart', source, title, desc };
}

/** A GitHub alert: "> [!NOTE]" (optionally followed by a title on the same line) becomes a callout. */
function alert(quote: Extract<Content, { type: 'blockquote' }>, problems: Problem[], ids: Set<string>): Block | null {
  const first = quote.children[0];
  const text = first?.type === 'paragraph' && first.children[0]?.type === 'text' ? first.children[0] : undefined;
  const m = text?.value.match(/^\[!([A-Za-z]+)\][ \t]*([^\n]*)(?:\n|$)/);
  if (!first || first.type !== 'paragraph' || !text || !m) return null;
  const variant = ALERTS[m[1]!.toUpperCase()];
  if (!variant) {
    problems.push({ code: 'alert-type', line: line(quote), message: `"[!${m[1]}]" is not a GitHub alert type: use [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION]` });
    return null;
  }
  // Text after the marker is a title when it fills its line; with inline markup ("> [!TIP] Use **this**")
  // the line is body text.
  const title = m[2]!.trim() && (m[0].endsWith('\n') || first.children.length === 1) ? m[2]!.trim() : undefined;
  const remaining = title || !m[2]!.trim() ? text.value.slice(m[0].length) : m[2]!;
  const paragraph = { ...first, children: [...(remaining ? [{ ...text, value: remaining }] : []), ...first.children.slice(1)] };
  const nodes = [...(paragraph.children.length ? [paragraph] : []), ...quote.children.slice(1)] as Content[];
  const body = convert(nodes, problems, ids);
  if (!body.length) problems.push({ code: 'alert-empty', line: line(quote), message: `the [!${m[1]}] alert is empty: write its message on the next lines (> ...)` });
  return { type: 'callout', variant, ...(title ? { title } : {}), body };
}

function figureFrom(p: Paragraph, problems: Problem[]): Block | null {
  const content = p.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  const only = content.length === 1 ? content[0] : undefined;
  if (!only || only.type !== 'image') {
    if (p.children.some((c) => c.type === 'image')) {
      problems.push({ code: 'image-inline', line: line(p), message: 'put images in their own paragraph (they become figures)' });
    }
    return null;
  }
  if (!only.alt?.trim()) problems.push({ code: 'image-alt', line: line(p), message: `image "${only.url}" needs alt text: ![what it shows](${only.url})`, fixes: [{ kind: 'field', target: 'alt' }] });
  if (!only.title?.trim()) problems.push({ code: 'image-caption', line: line(p), message: `image "${only.url}" needs a caption: ![alt](${only.url} "caption")`, fixes: [{ kind: 'field', target: 'caption' }] });
  return { type: 'figure', src: only.url, alt: only.alt ?? '', caption: only.title ?? '' };
}

function directive(node: DirectiveNode, problems: Problem[], ids: Set<string>): Block | null {
  const attrs = node.attributes ?? {};
  const def = blockDefinition(node.name);
  if (node.type === 'leafDirective' && UI_COMPONENTS.includes(node.name as UiItem['kind'])) {
    problems.push({ code: 'ui-outside-specimen', line: line(node), message: `::${node.name} is a UI component: put it inside a :::ui{caption="..."} specimen` });
    return null;
  }
  if (node.type !== 'containerDirective' || !def || !DIRECTIVES.includes(node.name)) {
    const like = node.type === 'containerDirective' ? nearest(node.name, DIRECTIVES) : undefined;
    problems.push({ code: 'block-unknown', line: line(node), message: `unknown block "${node.name}" (known: :::${DIRECTIVES.join(', :::')})`, ...(like ? { fixes: [{ kind: 'rename-block', to: like }] } : {}) });
    return null;
  }
  const extra = Object.keys(attrs).filter((a) => !(a in (def.attributes ?? {})));
  if (extra.length) problems.push({ code: 'unknown-attribute', line: line(node), message: `:::${node.name} has unknown attributes: ${extra.join(', ')}`, fixes: extra.map((x): Fix => { const to = nearest(x, Object.keys(def.attributes ?? {}).filter((k) => !(k in attrs))); return to ? { kind: 'rename-attribute', from: x, to } : { kind: 'remove-attribute', name: x }; }) });
  for (const [name, spec] of Object.entries(def.attributes ?? {})) {
    const value = attrs[name];
    if (spec.required && !value?.trim()) problems.push({ code: 'missing-attribute', line: line(node), message: `:::${node.name} needs a ${name}: :::${node.name}{${name}="..."} (${spec.description.replace(/\.$/, '').toLowerCase()})`, fixes: [{ kind: 'field', target: `attribute:${name}` }] });
    if (value && spec.values && !spec.values.includes(value)) {
      const to = nearest(value, spec.values);
      problems.push({ code: 'invalid-value', line: line(node), message: `${name} must be one of ${spec.values.join(', ')} (:::${node.name})`, fixes: [...(to ? [{ kind: 'set-attribute' as const, name, value: to }] : []), { kind: 'field', target: `attribute:${name}` }] });
    }
  }
  const labelNode = node.children.find((c) => c.data?.directiveLabel);
  const label = labelNode && 'children' in labelNode ? plainText(labelNode.children as Content[]) : '';
  const children = node.children.filter((c) => !c.data?.directiveLabel) as Content[];
  const body = (nodes: Content[], where: string) => {
    const out = convert(nodes, problems, ids);
    if (out.some((b) => b.type === 'heading')) problems.push({ code: 'heading-in-block', line: line(node), message: `headings are not allowed inside ${where}` });
    if (out.some((b) => b.type === 'notes')) problems.push({ code: 'notes-nested', line: line(node), message: `:::notes cannot be inside ${where}` });
    return out;
  };
  /** The :::child directives of a group block (tabs → tab ...); anything else is reported. */
  const parts = (names: string[]) => {
    const found: { name: string; label: string; attrs: Record<string, string>; body: Block[]; line: number }[] = [];
    for (const c of children) {
      const d = c as unknown as DirectiveNode;
      if (d.type === 'containerDirective' && names.includes(d.name)) {
        const spec = def.children?.[d.name] ?? {};
        const a = Object.fromEntries(Object.entries(d.attributes ?? {}).map(([k, v]) => [k, v ?? '']));
        const unknown = Object.keys(a).filter((k) => !(k in spec));
        if (unknown.length) problems.push({ code: 'unknown-attribute', line: line(d), message: `:::${d.name} has unknown attributes: ${unknown.join(', ')}`, fixes: unknown.map((x): Fix => { const to = nearest(x, Object.keys(spec).filter((k) => k !== 'label' && !(k in a))); return to ? { kind: 'rename-attribute', from: x, to } : { kind: 'remove-attribute', name: x }; }) });
        const ln = d.children.find((x) => x.data?.directiveLabel);
        const lab = ln && 'children' in ln ? plainText(ln.children as Content[]).trim() : '';
        if (!lab) problems.push({ code: 'missing-label', line: line(d), message: `:::${d.name} needs a label: :::${d.name}[...]`, fixes: [{ kind: 'field', target: 'label' }] });
        found.push({ name: d.name, label: lab, attrs: a, line: line(d),
          body: body(d.children.filter((x) => !x.data?.directiveLabel) as Content[], `:::${d.name}`) });
      } else {
        problems.push({ code: 'child-block', line: line(c), message: `:::${node.name} may only contain ${names.map((n) => `:::${n}`).join(' and ')} blocks (use one more colon on the outer block: ::::${node.name})` });
      }
    }
    return found;
  };
  const onlyList = (what: string) => {
    const list = children.find((c) => c.type === 'list');
    if (!list || list.type !== 'list' || children.length !== 1) {
      problems.push({ code: 'list-required', line: line(node), message: `:::${node.name} must contain exactly one list (${what})` });
      return null;
    }
    return list;
  };
  /** "**Bold** text" list items: [bold text, rest as inline]. */
  const boldItems = (list: Extract<Content, { type: 'list' }>, what: string) => list.children.map((item) => {
    const first = item.children[0];
    if (!first || first.type !== 'paragraph' || first.children[0]?.type !== 'strong') {
      problems.push({ code: 'list-item-bold', line: line(item), message: `each item of :::${node.name} starts with ${what} in bold: - **...** ...` });
      return { bold: '', rest: [] as Inline, more: [] as Block[] };
    }
    const [strong, ...after] = first.children;
    const rest = after.filter((c, i) => !(i === 0 && c.type === 'text' && !c.value.trim()));
    if (rest[0]?.type === 'text') rest[0] = { ...rest[0], value: rest[0].value.replace(/^\s*[-–—:]?\s*/, '') };
    return { bold: plainText((strong as Extract<PhrasingContent, { type: 'strong' }>).children), rest, more: convert(item.children.slice(1), problems, ids) };
  });

  switch (node.name) {
    case 'code-group': {
      const items: CodeBlock[] = [];
      for (const c of children) {
        const b = c.type === 'code' && c.lang !== 'mermaid' ? convertOne(c, problems, ids) : null;
        if (b?.type === 'code') items.push(b);
        else problems.push({ code: 'code-group-content', line: line(c), message: ':::code-group holds code blocks only, each with a title: ```bash title="npm"' });
      }
      if (items.length < 2) problems.push({ code: 'code-group-count', line: line(node), message: ':::code-group needs at least two code blocks (one is a plain code block)' });
      const untitled = items.filter((i) => !i.title).length;
      if (untitled) problems.push({ code: 'code-group-title', line: line(node), message: `every code block in :::code-group needs a title, which becomes its tab: \`\`\`bash title="npm" (${untitled} without)` });
      const titles = items.map((i) => (i.title ?? '').toLowerCase()).filter(Boolean);
      if (new Set(titles).size !== titles.length) problems.push({ code: 'code-group-duplicate-title', line: line(node), message: 'the code blocks in a :::code-group need different titles' });
      return { type: 'code-group', items };
    }
    case 'timeline': {
      const list = onlyList('- **2026-Q1** what happens');
      if (!list) return null;
      const items = boldItems(list, 'the date or period').map((i) => ({
        when: i.bold.trim(), body: [...(i.rest.length ? [{ type: 'paragraph', text: i.rest } as Block] : []), ...i.more],
      }));
      if (items.length < 2) problems.push({ code: 'timeline-count', line: line(node), message: ':::timeline needs at least two dated items (one item is a sentence)' });
      if (items.some((i) => i.when && !i.body.length)) problems.push({ code: 'timeline-item', line: line(node), message: 'every item of :::timeline says what happens after its date: - **2026-Q1** Private beta' });
      const current = attrs.current?.trim();
      if (current && !items.some((i) => i.when === current)) {
        problems.push({ code: 'timeline-current', line: line(node), message: `current="${current}" matches no item; use a date exactly as written in bold (${items.map((i) => `"${i.when}"`).join(', ')})` });
      }
      return { type: 'timeline', ...(label.trim() ? { caption: label.trim() } : {}), ...(current ? { current } : {}), items };
    }
    case 'comparison': {
      const table = children.find((c) => c.type === 'table') as Table | undefined;
      if (!table || children.length !== 1) {
        problems.push({ code: 'comparison-table', line: line(node), message: ':::comparison must contain exactly one Markdown table: options as columns, features as rows' });
        return null;
      }
      if (!label.trim()) problems.push({ code: 'comparison-caption', line: line(node), message: 'a comparison needs a caption: :::comparison[Plans]', fixes: [{ kind: 'field', target: 'label' }] });
      const [head, ...rows] = table.children;
      const headCells = (head?.children ?? []).map((c) => c.children);
      const names = headCells.map((c) => plainText(c).trim());
      if (names.length > 5) problems.push({ code: 'comparison-too-many', line: line(node), message: `a comparison shows at most 4 options next to the feature column (found ${names.length - 1}); they must fit a slide and a phone` });
      if (names.length < 3) problems.push({ code: 'comparison-too-few', line: line(node), message: 'a comparison needs a feature column and at least two options' });
      const wanted = attrs.highlight?.trim();
      const highlight = wanted ? names.findIndex((n, i) => i > 0 && n.toLowerCase() === wanted.toLowerCase()) : -1;
      if (attrs.badge?.trim() && !wanted) problems.push({ code: 'comparison-badge', line: line(node), message: 'badge= labels the highlighted column: add highlight= with the column heading' });
      if (wanted && highlight < 0) problems.push({ code: 'comparison-highlight', line: line(node), message: `highlight=${wanted} names no option; use a column heading exactly as written (${names.slice(1).join(', ')})` });
      if (!rows.length) problems.push({ code: 'comparison-rows', line: line(node), message: 'a comparison needs at least one feature row' });
      return {
        type: 'comparison', caption: label.trim(), ...(highlight > 0 ? { highlight } : {}), ...(highlight > 0 && attrs.badge?.trim() ? { badge: attrs.badge.trim() } : {}), head: headCells,
        rows: rows.map((r) => r.children.map((c, i) => (i === 0 ? { text: c.children } : comparisonCell(c.children)))),
      };
    }
    case 'release': {
      const version = label.trim();
      if (!version) problems.push({ code: 'release-version', line: line(node), message: 'a release needs its version: ::::release[v1.4.0]{date=2026-10-01}' });
      const unreleased = /^(unreleased|nevydáno)$/i.test(version);
      const date = attrs.date?.trim();
      if (date && !isIsoDate(date)) problems.push({ code: 'release-date-format', line: line(node), message: `release date must be written YYYY-MM-DD (found "${date}")`, fixes: [{ kind: 'field', target: 'attribute:date' }] });
      if (!date && version && !unreleased) problems.push({ code: 'release-date', line: line(node), message: `release ${version} needs its date: {date=YYYY-MM-DD} (or call it Unreleased)` });
      const groups: { kind: ReleaseKind; body: Block[] }[] = [];
      const intro: Block[] = [];
      for (const c of children) {
        const d = c as unknown as DirectiveNode;
        // a short notice about the whole release (a paragraph or a callout) may come before the groups
        const notice = !groups.length && (c.type === 'paragraph' || c.type === 'blockquote' || (d.type === 'containerDirective' && d.name === 'callout'));
        if (notice) {
          const b = convertOne(c, problems, ids);
          if (b && (b.type === 'paragraph' || b.type === 'callout')) { intro.push(b); continue; }
        }
        if (d.type !== 'containerDirective' || !RELEASE_KINDS.includes(d.name as ReleaseKind)) {
          problems.push({ code: 'release-content', line: line(c), message: `::::release holds only ${RELEASE_KINDS.map((k) => `:::${k}`).join(', ')} groups, after an optional short notice (a paragraph or a callout) before them (use one more colon on the outer block: ::::release)` });
          continue;
        }
        if (Object.keys(d.attributes ?? {}).length || d.children.some((x) => x.data?.directiveLabel)) {
          problems.push({ code: 'release-group-attributes', line: line(d), message: `:::${d.name} takes no label or attributes: the group name is written for you` });
        }
        if (groups.some((g) => g.kind === d.name)) problems.push({ code: 'release-group-twice', line: line(d), message: `:::${d.name} appears twice in release ${version}: put all its items in one group` });
        const out = body(d.children.filter((x) => !x.data?.directiveLabel) as Content[], `:::${d.name}`);
        if (!out.length) problems.push({ code: 'release-group-empty', line: line(d), message: `:::${d.name} is empty: list what was ${d.name === 'security' ? 'fixed for security' : d.name}` });
        groups.push({ kind: d.name as ReleaseKind, body: out });
      }
      if (!groups.length) problems.push({ code: 'release-empty', line: line(node), message: `release ${version} has no changes: add :::added, :::fixed or another group` });
      groups.sort((a, b) => RELEASE_KINDS.indexOf(a.kind) - RELEASE_KINDS.indexOf(b.kind));
      return { type: 'release', version, id: slug(version, ids), ...(date ? { date } : {}), ...(intro.length ? { intro } : {}), groups };
    }
    case 'toc':
    case 'references': {
      if (children.length) problems.push({ code: 'block-generated', line: line(node), message: `:::${node.name} has no content: it is filled in when the document is built (close it with ::: on the next line)` });
      const title = label.trim() ? { title: label.trim() } : {};
      return node.name === 'toc'
        ? { type: 'toc', ...title, depth: (attrs.depth === '3' ? 3 : 2) as 2 | 3 }
        : { type: 'references', ...title, style: (attrs.style ?? 'numeric') as 'numeric' | 'author-date' };
    }
    case 'summary': {
      const list = onlyList('- one key point per item');
      if (!list) return null;
      const items = list.children.map((item) => {
        const p = item.children[0];
        if (item.children.length !== 1 || p?.type !== 'paragraph') {
          problems.push({ code: 'summary-point', line: line(item), message: 'each point of :::summary is one short paragraph (no nested lists or blocks)' });
          return [] as Inline;
        }
        return p.children;
      });
      if (list.ordered) problems.push({ code: 'summary-numbered', line: line(node), message: ':::summary holds a bulleted list (- ...), not a numbered one', fixes: [{ kind: 'list-type', ordered: false }] });
      if (items.length < 3 || items.length > 5) problems.push({ code: 'summary-count', line: line(node), message: `:::summary has 3 to 5 points (found ${items.length})` });
      const source = (attrs.source ?? 'human') as 'human' | 'ai';
      const reviewedBy = attrs['reviewed-by']?.trim();
      if (source === 'ai' && !reviewedBy) problems.push({ code: 'summary-reviewer', line: line(node), message: 'an AI-written summary needs the person who checked it: :::summary{source=ai reviewed-by="Name"}', fixes: [{ kind: 'field', target: 'attribute:reviewed-by' }] });
      if (source !== 'ai' && reviewedBy) problems.push({ code: 'summary-reviewed-by', line: line(node), message: 'reviewed-by is shown only for AI summaries: add source=ai or remove it',
        fixes: [{ kind: 'set-attribute', name: 'source', value: 'ai' }, { kind: 'remove-attribute', name: 'reviewed-by' }] });
      return { type: 'summary', ...(label.trim() ? { title: label.trim() } : {}), items, source, ...(reviewedBy ? { reviewedBy } : {}) };
    }
    case 'doc-status': {
      if (children.length) problems.push({ code: 'doc-status-content', line: line(node), message: ':::doc-status has no content: write its values as attributes or in the front matter, then close it with :::' });
      const out: Extract<Block, { type: 'doc-status' }> = { type: 'doc-status' };
      for (const [key, field] of Object.entries(STATUS_KEYS)) if (attrs[key]?.trim()) out[field] = attrs[key]!.trim();
      return out;
    }
    case 'section': {
      if (!label.trim()) problems.push({ code: 'section-title', line: line(node), message: 'a section divider needs a title: :::section[Part 2: Results]', fixes: [{ kind: 'field', target: 'label' }] });
      const out = body(children, ':::section');
      if (out.some((b) => b.type !== 'paragraph')) problems.push({ code: 'section-content', line: line(node), message: ':::section holds at most a short sentence; put other blocks after it' });
      return { type: 'section', title: label.trim(), id: slug(label.trim(), ids), break: (attrs.break ?? 'none') as 'page' | 'none', body: out };
    }
    case 'dl': {
      const list = onlyList('- **Term** value');
      if (!list) return null;
      const items = boldItems(list, 'the term').map((i) => ({
        term: i.bold, body: [...(i.rest.length ? [{ type: 'paragraph', text: i.rest } as Block] : []), ...i.more],
      }));
      if (items.some((i) => i.term && !i.body.length)) problems.push({ code: 'dl-value', line: line(node), message: 'every term of :::dl needs a value after it: - **Owner** Platform team' });
      return { type: 'dl', ...(label.trim() ? { caption: label.trim() } : {}), items };
    }
    case 'cta': {
      const href = (attrs.href ?? '').trim();
      const text = label.trim();
      if (!text) problems.push({ code: 'cta-label', line: line(node), message: 'a call to action needs a label that says what happens: :::cta[Start the tutorial]{href="..."}', fixes: [{ kind: 'field', target: 'label' }] });
      else if (/^(click here|here|more|read more|learn more|details|link|go)$/i.test(text.replace(/[.!…]+$/, ''))) {
        problems.push({ code: 'cta-verb', line: line(node), message: `"${text}" does not say what happens: start the label with a verb and name the result ("Start the tutorial", "Download the template")` });
      }
      if (href && /^(javascript|data|vbscript):/i.test(href)) problems.push({ code: 'cta-href', line: line(node), message: `href "${href}" is not allowed: use a web address, a file or #a-heading` });
      if (children.length > 1 || (children[0] && children[0].type !== 'paragraph')) problems.push({ code: 'cta-content', line: line(node), message: ':::cta holds at most one short sentence before the action' });
      const p = children[0]?.type === 'paragraph' ? children[0] : undefined;
      return { type: 'cta', label: text, href, variant: (attrs.variant ?? 'primary') as 'primary' | 'secondary', ...(p ? { text: p.children } : {}) };
    }
    case 'callout': {
      const variant = (attrs.variant ?? 'info') as CalloutVariant;
      if (!label) problems.push({ code: 'callout-title', line: line(node), message: 'callouts need a title: :::callout[Title]{variant=...}', fixes: [{ kind: 'field', target: 'label' }] });
      return { type: 'callout', variant, title: label, body: convert(children, problems, ids) };
    }
    case 'notes': {
      const out = convert(children, problems, ids);
      if (!out.length) problems.push({ code: 'notes-empty', line: line(node), message: ':::notes is empty: write what the presenter should say' });
      if (out.some((b) => b.type === 'notes' || b.type === 'heading')) {
        problems.push({ code: 'notes-content', line: line(node), message: ':::notes cannot contain headings or other notes' });
      }
      return { type: 'notes', body: out };
    }
    case 'steps': {
      const list = children.find((c) => c.type === 'list');
      if (!list || list.type !== 'list' || !list.ordered || children.length !== 1) {
        problems.push({ code: 'steps-list', line: line(node), message: ':::steps must contain exactly one numbered list' });
        return null;
      }
      return { type: 'steps', ...(list.start && list.start > 1 ? { start: list.start } : {}), steps: list.children.map((item) => step(item, problems, ids)) };
    }
    case 'checklist': {
      const list = children.find((c) => c.type === 'list');
      if (!list || list.type !== 'list' || children.length !== 1 || list.children.some((i) => typeof i.checked !== 'boolean')) {
        problems.push({ code: 'checklist-list', line: line(node), message: ':::checklist must contain one task list ("- [x] done", "- [ ] open")' });
        return null;
      }
      return {
        type: 'checklist',
        items: list.children.map((i) => ({ done: Boolean(i.checked), text: (i.children[0] as Paragraph | undefined)?.children ?? [] })),
      };
    }
    case 'table':
    case 'chart': {
      const table = children.find((c) => c.type === 'table') as Table | undefined;
      const caption = (attrs.caption ?? '').trim();
      if (!table || children.length !== 1) {
        problems.push({ code: 'table-required', line: line(node), message: `:::${node.name} must contain exactly one Markdown table` });
        return null;
      }
      const [head, ...rows] = table.children;
      if (node.name === 'table') {
        return { type: 'table', caption, head: (head?.children ?? []).map((c) => c.children), rows: rows.map((r) => r.children.map((c) => c.children)) };
      }
      return chart(attrs, caption, head?.children.map((c) => plainText(c.children).trim()) ?? [],
        rows.map((r) => ({ cells: r.children.map((c) => plainText(c.children).trim()), line: line(r) })), problems, line(node));
    }
    case 'tabs': {
      const tabs = parts(['tab']).map((p) => ({ label: p.label, body: p.body }));
      if (tabs.length < 2) problems.push({ code: 'tabs-count', line: line(node), message: '::::tabs needs at least two :::tab blocks' });
      const labels = tabs.map((t) => t.label.toLowerCase());
      if (new Set(labels).size !== labels.length) problems.push({ code: 'tabs-labels', line: line(node), message: 'tab labels must differ' });
      return { type: 'tabs', tabs };
    }
    case 'accordion': {
      const items = parts(['item']).map((p) => ({ title: p.label, body: p.body }));
      if (!items.length) problems.push({ code: 'accordion-empty', line: line(node), message: '::::accordion needs at least one :::item[Question]' });
      return { type: 'accordion', items };
    }
    case 'compare': {
      const items = parts(['do', 'dont']).map((p) => ({ kind: p.name as 'do' | 'dont', title: p.label, body: p.body }));
      if (!items.some((i) => i.kind === 'do') || !items.some((i) => i.kind === 'dont')) {
        problems.push({ code: 'compare-pair', line: line(node), message: '::::compare needs at least one :::do and one :::dont, so the better way is always shown' });
      }
      return { type: 'compare', items };
    }
    case 'cards': {
      const cards = parts(['card']).map((p) => {
        const href = p.attrs.href?.trim();
        if (href !== undefined && !href) problems.push({ code: 'card-href', line: p.line, message: 'href of :::card is empty', fixes: [{ kind: 'field', target: 'attribute:href' }, { kind: 'remove-attribute', name: 'href' }] });
        return { title: p.label, ...(href ? { href } : {}), ...(p.attrs.badge ? { badge: p.attrs.badge } : {}), body: p.body };
      });
      if (!cards.length) problems.push({ code: 'cards-empty', line: line(node), message: '::::cards needs at least one :::card[Title]' });
      if (cards.some((c) => !c.body.length)) problems.push({ code: 'card-text', line: line(node), message: 'every :::card needs a short text, not only a title' });
      return { type: 'cards', cards };
    }
    case 'quote': {
      const out = body(children, ':::quote');
      if (!out.length) problems.push({ code: 'quote-empty', line: line(node), message: ':::quote is empty' });
      return { type: 'quote', body: out, ...(attrs.source ? { source: attrs.source } : {}), ...(attrs.cite ? { cite: attrs.cite } : {}) };
    }
    case 'statement': {
      const p = children[0];
      if (children.length !== 1 || p?.type !== 'paragraph') {
        problems.push({ code: 'statement-content', line: line(node), message: ':::statement holds one short paragraph' });
        return null;
      }
      const words = plainText(p.children).split(/\s+/).filter(Boolean).length;
      if (words > 30) problems.push({ code: 'statement-length', line: line(node), message: `a statement has ${words} words; keep it to 30 or fewer (move the rest into a paragraph)` });
      return { type: 'statement', text: p.children };
    }
    case 'metrics': {
      const list = onlyList('- **98 %** what the number means');
      if (!list) return null;
      const items = boldItems(list, 'the number').map((i) => ({ value: i.bold, label: i.rest }));
      if (items.length < 2 || items.length > 4) problems.push({ code: 'metrics-count', line: line(node), message: `:::metrics shows 2 to 4 figures (found ${items.length})` });
      if (items.some((i) => !plainText(i.label).trim())) problems.push({ code: 'metrics-label', line: line(node), message: 'every figure needs a label that says what it means' });
      return { type: 'metrics', items };
    }
    case 'glossary': {
      const list = onlyList('- **Term** definition');
      if (!list) return null;
      return { type: 'glossary', items: boldItems(list, 'the term').map((i) => ({
        term: i.bold, id: slug(`term-${i.bold}`, ids),
        body: [...(i.rest.length ? [{ type: 'paragraph', text: i.rest } as Block] : []), ...i.more],
      })) };
    }
    case 'shortcuts': {
      const list = onlyList('- :kbd[Ctrl+S] what it does');
      if (!list) return null;
      const items = list.children.map((item) => {
        const p = item.children[0];
        const first = p?.type === 'paragraph' ? p.children[0] as unknown as DirectiveNode : undefined;
        if (!first || first.type !== 'textDirective' || first.name !== 'kbd') {
          problems.push({ code: 'shortcut-keys', line: line(item), message: 'each shortcut starts with its keys: - :kbd[Ctrl+S] Save' });
          return { keys: [], text: [] as Inline };
        }
        const text = (p as Paragraph).children.slice(1);
        if (text[0]?.type === 'text') text[0] = { ...text[0], value: text[0].value.replace(/^\s*[-–—:]?\s*/, '') };
        return { keys: kbdKeys(plainText(first.children)), text };
      });
      return { type: 'shortcuts', caption: (attrs.caption ?? '').trim(), items };
    }
    case 'gallery': {
      const images: { src: string; alt: string; caption: string }[] = [];
      for (const c of children) {
        const f = c.type === 'paragraph' ? figureFrom(c, problems) : null;
        if (f?.type === 'figure') images.push({ src: f.src, alt: f.alt, caption: f.caption });
        else problems.push({ code: 'gallery-content', line: line(c), message: ':::gallery holds images only, each on its own line: ![alt](file "caption")' });
      }
      if (images.length < 2) problems.push({ code: 'gallery-count', line: line(node), message: ':::gallery needs at least two images (one image is a figure)' });
      return { type: 'gallery', images };
    }
    case 'ui': {
      const items: UiItem[] = [];
      for (const c of children) {
        const d = c as unknown as DirectiveNode;
        const spec = d.type === 'leafDirective' ? def.children?.[d.name] : undefined;
        if (!spec) {
          problems.push({ code: 'ui-content', line: line(c), message: `:::ui holds UI components, one per line: ${UI_COMPONENTS.map((n) => `::${n}[...]`).join(', ')}` });
          continue;
        }
        const a = Object.fromEntries(Object.entries(d.attributes ?? {}).map(([k, v]) => [k, (v ?? '').trim()]));
        const unknown = Object.keys(a).filter((k) => !(k in spec));
        if (unknown.length) problems.push({ code: 'unknown-attribute', line: line(d), message: `::${d.name} has unknown attributes: ${unknown.join(', ')}`, fixes: unknown.map((x): Fix => { const to = nearest(x, Object.keys(spec).filter((k) => k !== 'label' && !(k in a))); return to ? { kind: 'rename-attribute', from: x, to } : { kind: 'remove-attribute', name: x }; }) });
        for (const [k, sp] of Object.entries(spec)) {
          if (k !== 'label' && sp.required && !a[k]) problems.push({ code: 'missing-attribute', line: line(d), message: `::${d.name} needs ${k}="..." (${sp.description.replace(/\.$/, '').toLowerCase()})`, fixes: [{ kind: 'field', target: `attribute:${k}` }] });
          if (a[k] && sp.values && !sp.values.includes(a[k]!)) {
            const to = nearest(a[k]!, sp.values);
            problems.push({ code: 'invalid-value', line: line(d), message: `${k} must be one of ${sp.values.join(', ')} (::${d.name})`, fixes: [...(to ? [{ kind: 'set-attribute' as const, name: k, value: to }] : []), { kind: 'field', target: `attribute:${k}` }] });
          }
        }
        const lab = plainText(d.children as Content[]).trim();
        if (!lab) problems.push({ code: 'missing-label', line: line(d), message: `::${d.name} needs a label: ::${d.name}[...]`, fixes: [{ kind: 'field', target: 'label' }] });
        const item: UiItem = { kind: d.name as UiItem['kind'], label: lab };
        for (const k of ['variant', 'state', 'value', 'placeholder', 'hint', 'error', 'text', 'action', 'primary', 'secondary'] as const) if (a[k]) item[k] = a[k];
        if (a.type) item.input = a.type;
        if ('required' in a) item.required = true;
        if ('destructive' in a) item.destructive = true;
        if (a.options) item.options = a.options.split('|').map((o) => o.trim()).filter(Boolean);
        if (d.name === 'field' && ['select', 'radio'].includes(item.input ?? '') && !(item.options?.length)) {
          problems.push({ code: 'field-options', line: line(d), message: `a ${item.input} field needs options="First|Second"` });
        }
        items.push(item);
      }
      if (!items.length) problems.push({ code: 'ui-empty', line: line(node), message: ':::ui needs at least one component, such as ::button[Save]' });
      return { type: 'ui', caption: (attrs.caption ?? '').trim(), theme: (attrs.theme ?? 'light') as 'light' | 'dark' | 'both',
        layout: (attrs.layout ?? 'row') as 'row' | 'stack', items };
    }
    case 'video': {
      const src = (attrs.src ?? '').trim();
      if (!label) problems.push({ code: 'video-title', line: line(node), message: 'videos need a title: :::video[What it shows]{src="..."}', fixes: [{ kind: 'field', target: 'label' }] });
      const embed = src ? videoEmbed(src) : null;
      if (src && !embed && !/\.(mp4|webm|ogv|mov)(\?.*)?$/i.test(src)) {
        problems.push({ code: 'video-src', line: line(node), message: 'video src must be a video file (mp4, webm) or a YouTube or Vimeo address' });
      }
      if (src && !embed && !attrs.captions) problems.push({ code: 'video-captions', line: line(node), message: 'video files need captions: captions="file.vtt" (WebVTT)' });
      const transcript = body(children, ':::video');
      if (!transcript.length) problems.push({ code: 'video-transcript', line: line(node), message: 'videos need a transcript: write it inside the :::video block' });
      return { type: 'video', title: label, src, ...(attrs.captions ? { captions: attrs.captions } : {}), ...(attrs.poster ? { poster: attrs.poster } : {}), transcript };
    }
  }
  return null;
}

function chart(attrs: Record<string, string | null | undefined>, caption: string, head: string[], rows: { cells: string[]; line: number }[],
  problems: Problem[], at: number): Block {
  const kind = (attrs.type ?? 'bar') as 'bar' | 'line' | 'donut';
  const [category = '', ...names] = head;
  const series = names.map((name) => ({ name, values: [] as number[] }));
  const labels: string[] = [];
  for (const row of rows) {
    const [label = '', ...cells] = row.cells;
    labels.push(label);
    cells.forEach((cell, i) => {
      const n = Number(cell.replace(/[\s\u00a0]/g, '').replace(/,(?=\d+$)/, '.'));
      if (!Number.isFinite(n)) problems.push({ code: 'chart-value', line: row.line, message: `chart value "${cell}" in row "${label}" is not a number` });
      series[i]?.values.push(Number.isFinite(n) ? n : 0);
    });
  }
  if (!series.length || !labels.length) problems.push({ code: 'chart-data', line: at, message: 'a chart needs a header row and at least one row of numbers' });
  if (series.length > 6) problems.push({ code: 'chart-series', line: at, message: `a chart shows at most 6 series (found ${series.length}); the palette has 6 distinguishable colors` });
  if (kind === 'donut') {
    if (series.length !== 1) problems.push({ code: 'donut-series', line: at, message: 'a donut shows one series (parts of one whole): use one value column' });
    if (labels.length > 5) problems.push({ code: 'donut-parts', line: at, message: `a donut shows at most 5 parts (found ${labels.length}); use a bar chart` });
    if (series.some((s) => s.values.some((v) => v < 0))) problems.push({ code: 'donut-negative', line: at, message: 'a donut cannot show negative values' });
  }
  if (kind === 'bar' && series.some((s) => s.values.some((v) => v < 0))) problems.push({ code: 'bar-negative', line: at, message: 'bar charts show values from zero up, so they cannot show negative values' });
  if (kind === 'line' && labels.length < 3) problems.push({ code: 'line-points', line: at, message: 'a line chart needs at least 3 points; use a bar chart to compare fewer' });
  return { type: 'chart', kind, caption, ...(attrs.unit ? { unit: attrs.unit } : {}), category, labels, series };
}

function step(item: ListItem, problems: Problem[], ids: Set<string>): { title: Inline; body: Block[] } {
  const [first, ...rest] = item.children;
  if (!first || first.type !== 'paragraph' || first.children[0]?.type !== 'strong') {
    problems.push({ code: 'steps-bold', line: line(item), message: 'each step starts with a bold title: 1. **Open settings** then the description' });
    return { title: [], body: convert(item.children, problems, ids) };
  }
  const [strong, ...afterTitle] = first.children;
  const description = afterTitle.filter((c, i) => !(i === 0 && c.type === 'text' && !c.value.trim()));
  if (description[0]?.type === 'text') description[0] = { ...description[0], value: description[0].value.replace(/^\s*[-–—:]?\s*/, '') };
  const body: Block[] = description.length ? [{ type: 'paragraph', text: description }] : [];
  return { title: (strong as Extract<PhrasingContent, { type: 'strong' }>).children, body: [...body, ...convert(rest, problems, ids)] };
}
