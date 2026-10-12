/**
 * The ProseMirror schema of a LibKa document. It follows Markdown's own structure (CommonMark, GFM and the directive
 * syntax LibKa blocks use), so every LibKa block fits it without a node type of its own: a `:::name` block is a
 * `directive` with its attributes, and the block registry tells the editor what each one means and which settings it
 * has. What the schema cannot hold is kept verbatim in a `source` node (a source island).
 *
 * The DOM descriptions are what the editing surface shows; classes start with `ed-` and the Studio styles them with
 * the LibKa tokens. Pasted HTML is read back through the same rules.
 */
import { Schema, type MarkSpec, type NodeSpec } from 'prosemirror-model';

/** Directive attributes as written: `{variant=info}` → `{ variant: 'info' }` (a bare `{open}` has the value ''). */
export type Attributes = Record<string, string>;

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  /** The YAML front matter: the document's own properties. */
  front_matter: { group: 'block', atom: true, attrs: { value: { default: '' } }, toDOM: () => ['div', { class: 'ed-front-matter' }] },
  paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
  heading: { group: 'block', content: 'inline*', attrs: { level: { default: 2 } }, defining: true, toDOM: (n) => [`h${n.attrs.level}`, 0],
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level: Math.min(level, 4) } })) },
  blockquote: { group: 'block', content: 'block+', defining: true, toDOM: () => ['blockquote', 0], parseDOM: [{ tag: 'blockquote' }] },
  bullet_list: { group: 'block', content: 'list_item+', attrs: { spread: { default: false } }, toDOM: () => ['ul', 0], parseDOM: [{ tag: 'ul' }] },
  ordered_list: { group: 'block', content: 'list_item+', attrs: { start: { default: 1 }, spread: { default: false } },
    toDOM: (n) => ['ol', n.attrs.start === 1 ? {} : { start: n.attrs.start }, 0], parseDOM: [{ tag: 'ol', getAttrs: (d) => ({ start: Number((d as HTMLElement).getAttribute('start') ?? 1) }) }] },
  /** `checked` is null for a plain item, true or false for a task (`- [x]`). */
  list_item: { content: 'block*', attrs: { checked: { default: null }, spread: { default: false } }, defining: true,
    toDOM: (n) => ['li', n.attrs.checked === null ? {} : { class: 'ed-task', 'data-checked': String(n.attrs.checked) }, 0], parseDOM: [{ tag: 'li' }] },
  code_block: { group: 'block', content: 'text*', marks: '', code: true, defining: true, attrs: { lang: { default: null }, meta: { default: null } },
    toDOM: (n) => ['pre', { class: 'ed-code', ...(n.attrs.lang ? { 'data-lang': n.attrs.lang } : {}) }, ['code', 0]], parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }] },
  thematic_break: { group: 'block', toDOM: () => ['hr'], parseDOM: [{ tag: 'hr' }] },
  /** A GFM table; its first row is the header row. `align` holds one entry per column. */
  table: { group: 'block', content: 'table_row+', isolating: true, attrs: { align: { default: [] } }, toDOM: () => ['table', { class: 'ed-table' }, ['caption', { class: 'ed-table-caption', contenteditable: 'false' }, 'Table'], ['tbody', 0]] },
  table_row: { content: 'table_cell+', toDOM: () => ['tr', 0] },
  table_cell: { content: 'inline*', isolating: true, toDOM: () => ['td', 0] },
  /** A `:::name[label]{attributes}` block: most LibKa blocks. Its label (when it has one) comes first. */
  directive: { group: 'block', content: 'directive_label? block*', defining: true, isolating: true, attrs: { name: {}, attributes: { default: {} } },
    toDOM: (n) => ['div', { class: `ed-directive ed-${n.attrs.name}`, 'data-name': n.attrs.name, ...variantOf(n.attrs.attributes) }, 0] },
  directive_label: { content: 'inline*', toDOM: () => ['div', { class: 'ed-label' }, 0] },
  /** A `::name[label]{attributes}` line. */
  leaf_directive: { group: 'block', content: 'inline*', attrs: { name: {}, attributes: { default: {} } },
    toDOM: (n) => ['div', { class: `ed-leaf ed-${n.attrs.name}`, 'data-name': n.attrs.name, ...variantOf(n.attrs.attributes) }, 0] },
  footnote_definition: { group: 'block', content: 'block*', attrs: { identifier: {}, label: { default: null } },
    toDOM: (n) => ['div', { class: 'ed-footnote', 'data-id': n.attrs.identifier }, 0] },
  /** Markdown the editor does not model, kept exactly as written (shown as an editable source field). */
  source: { group: 'block', atom: true, attrs: { text: { default: '' } }, toDOM: (n) => ['pre', { class: 'ed-source' }, n.attrs.text] },

  text: { group: 'inline' },
  image: { group: 'inline', inline: true, atom: true, attrs: { src: { default: '' }, alt: { default: '' }, title: { default: null } },
    toDOM: (n) => ['img', { src: n.attrs.src, alt: n.attrs.alt, ...(n.attrs.title ? { title: n.attrs.title } : {}) }],
    parseDOM: [{ tag: 'img[src]', getAttrs: (d) => ({ src: (d as HTMLElement).getAttribute('src'), alt: (d as HTMLElement).getAttribute('alt') ?? '', title: (d as HTMLElement).getAttribute('title') }) }] },
  hard_break: { group: 'inline', inline: true, selectable: false, toDOM: () => ['br'], parseDOM: [{ tag: 'br' }] },
  /** `:kbd[Ctrl]`, `:badge[New]{variant=info}`; also any other `:name` the Markdown parser reads as a directive. */
  inline_directive: { group: 'inline', inline: true, atom: true, attrs: { name: {}, label: { default: null }, attributes: { default: {} } },
    toDOM: (n) => ['span', { class: `ed-inline ed-${n.attrs.name}`, 'data-name': n.attrs.name, ...variantOf(n.attrs.attributes) }, n.attrs.label ?? `:${n.attrs.name}`] },
  footnote_ref: { group: 'inline', inline: true, atom: true, attrs: { identifier: {}, label: { default: null } }, toDOM: (n) => ['sup', { class: 'ed-noteref' }, n.attrs.label ?? n.attrs.identifier] },
};

const marks: Record<string, MarkSpec> = {
  link: { attrs: { href: {}, title: { default: null } }, inclusive: false, toDOM: (m) => ['a', { href: m.attrs.href, ...(m.attrs.title ? { title: m.attrs.title } : {}) }, 0],
    parseDOM: [{ tag: 'a[href]', getAttrs: (d) => ({ href: (d as HTMLElement).getAttribute('href'), title: (d as HTMLElement).getAttribute('title') }) }] },
  strong: { toDOM: () => ['strong', 0], parseDOM: [{ tag: 'strong' }, { tag: 'b' }] },
  em: { toDOM: () => ['em', 0], parseDOM: [{ tag: 'em' }, { tag: 'i' }] },
  strike: { toDOM: () => ['s', 0], parseDOM: [{ tag: 's' }, { tag: 'del' }] },
  code: { excludes: '_', toDOM: () => ['code', 0], parseDOM: [{ tag: 'code' }] },
};

/** A block's `variant` (callout tone, badge meaning) as a data attribute the Studio styles. */
function variantOf(attributes: Record<string, string>): Record<string, string> {
  return attributes.variant ? { 'data-variant': attributes.variant } : {};
}

export const schema = new Schema({ nodes, marks });
