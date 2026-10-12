/**
 * What the editor knows about each block, from the block registry: what a node is called, which settings it has, and
 * which blocks can be inserted (with the registry's example as their starting content).
 */
import { BLOCKS, block as definition, type BlockDefinition, type BlockGroup } from '@libka/blocks';
import type { Fragment, Node as PMNode } from 'prosemirror-model';
import { load } from './markdown.ts';
import { blockSummary, blockTitle, localAttributes, partTitle, searchWords, type Lang, type LocalAttribute, type Part } from './names.ts';
import { schema } from './schema.ts';

/** A block as the editor shows it: its registry entry (when it has one) and the settings it takes. */
export interface BlockInfo {
  /** The registry name (`callout`), a child's name (`card`), or the Markdown element (`paragraph`, `heading`). */
  key: string;
  /** Title for the interface, in the language asked for (`Callout`, `Heading 2`, `Nadpis 2`). */
  title: string;
  /** The registry's summary of the block, in the language. */
  summary?: string;
  definition?: BlockDefinition;
  /** The attributes it takes, from the registry (the block's own, or a child's in its parent's entry), help in the language. */
  attributes: Readonly<Record<string, LocalAttribute>>;
  /** Whether its label (`[...]` after the name) is required. */
  labelRequired: boolean;
}

/** Blocks written as directives (`:::name`), by name. */
const DIRECTIVES = new Set(BLOCKS.filter((b) => /^:{2,}[\w-]/m.test(b.example.trimStart())).map((b) => b.name));

/** The node is a figure: a paragraph holding one image and nothing else. */
export const isFigure = (n: PMNode): boolean => n.type === schema.nodes.paragraph && n.childCount === 1 && n.firstChild!.type === schema.nodes.image;

/**
 * What the node is, named in `lang`. `parent` is the node it sits in (a child directive's settings live in its
 * parent's entry).
 */
export function blockInfo(n: PMNode, parent?: PMNode | null, lang: Lang = 'en'): BlockInfo {
  /** A registry block (its title), or an element named by a part (`part`). */
  const plain = (key: string, part?: Part, vars?: Record<string, number>): BlockInfo => {
    const def = definition(key);
    const summary = blockSummary(key, lang);
    return {
      key, title: part ? partTitle(part, lang, vars) : blockTitle(key, lang), ...(summary ? { summary } : {}), ...(def ? { definition: def } : {}),
      attributes: localAttributes(def?.attributes ?? {}, lang, key), labelRequired: false,
    };
  };
  switch (n.type.name) {
    case 'paragraph': return isFigure(n) ? plain('figure') : plain('paragraph');
    case 'heading': return plain('heading', 'heading', { n: n.attrs.level });
    case 'bullet_list': return plain('list', 'bullet');
    case 'ordered_list': return plain('list', 'ordered');
    case 'list_item': return plain('list-item', n.attrs.checked === null ? 'list-item' : 'task');
    case 'code_block': return n.attrs.lang === 'mermaid' ? plain('diagram') : plain('code');
    case 'blockquote': return plain('blockquote', 'blockquote');
    case 'table': return plain('table');
    case 'thematic_break': return plain('thematic_break', 'thematic_break');
    case 'front_matter': return plain('front_matter', 'front_matter');
    case 'source': return plain('source', 'source');
    case 'footnote_definition': return plain('footnote', 'footnote');
    case 'directive': case 'leaf_directive': {
      const name = n.attrs.name as string;
      if (definition(name) && DIRECTIVES.has(name)) return plain(name);
      // a child directive (a tab, a card, a UI button): its settings are in the parent's entry
      const parentName = parent && (parent.type === schema.nodes.directive || parent.type === schema.nodes.leaf_directive) ? parent.attrs.name as string : undefined;
      const spec = parentName ? definition(parentName)?.children?.[name] : undefined;
      if (spec) {
        const { label, ...rest } = localAttributes(spec, lang, parentName!, name);
        return { key: name, title: blockTitle(name, lang), attributes: rest, labelRequired: Boolean(label?.required) };
      }
      return { key: name, title: partTitle('unknown', lang, { name }), attributes: {}, labelRequired: false };
    }
    default: return plain(n.type.name);
  }
}

/** A block that can be inserted, with the registry's example as its first content. */
export interface Insertable {
  name: string; title: string; summary: string; group: BlockGroup; markdown: string;
  /** Its names in both languages, for search. */
  words: string;
}

/** Every block the registry has, in registry order (the paragraph first: plain text), named in `lang`. */
export const insertables = (lang: Lang): readonly Insertable[] => BLOCKS.map((b) => ({
  name: b.name, title: blockTitle(b.name, lang), summary: blockSummary(b.name, lang)!, group: b.group, markdown: b.example, words: searchWords(b.name),
}));

/** Every block the registry has, named in English. */
export const INSERTABLE: readonly Insertable[] = insertables('en');

/** Blocks parsed from Markdown, ready to insert (front matter left out). */
export function blocksFrom(markdown: string): Fragment {
  const doc = load(markdown).doc;
  const nodes: PMNode[] = [];
  doc.forEach((n) => { if (n.type !== schema.nodes.front_matter) nodes.push(n); });
  return schema.nodes.doc!.create(null, nodes.length ? nodes : [schema.nodes.paragraph!.create()]).content;
}
