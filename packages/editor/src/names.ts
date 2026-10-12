/**
 * What things are called, in English or Czech: blocks and their settings from the block registry (and its Czech
 * text), and the Markdown elements and editor parts the registry does not name. Search matches both languages and
 * ignores accents, so "zvyrazneni", "Zvýraznění", "callout" and "Callout" all find the callout.
 */
import { BLOCKS_CS, CHILD_TITLES, GROUPS, GROUPS_CS, INLINES, INLINES_CS, block as definition, type AttributeSpec, type BlockGroup, type CzechAttribute } from '@libka/blocks';

export type Lang = 'en' | 'cs';

/** Markdown elements and editor parts, with {n} and {name} filled in. */
const PARTS = {
  heading: { en: 'Heading {n}', cs: 'Nadpis {n}' },
  bullet: { en: 'Bulleted list', cs: 'Seznam s odrážkami' },
  ordered: { en: 'Numbered list', cs: 'Číslovaný seznam' },
  'list-item': { en: 'List item', cs: 'Položka seznamu' },
  task: { en: 'Task', cs: 'Úkol' },
  blockquote: { en: 'Quotation', cs: 'Citace' },
  thematic_break: { en: 'Divider', cs: 'Vodorovná čára' },
  front_matter: { en: 'Document properties', cs: 'Vlastnosti dokumentu' },
  source: { en: 'Source kept as written', cs: 'Zdroj ponechaný beze změny' },
  footnote: { en: 'Note', cs: 'Poznámka' },
  unknown: { en: 'Unknown block "{name}"', cs: 'Neznámý blok „{name}“' },
  'lost.formatting': { en: 'formatting (bold, italic, links)', cs: 'formátování (tučné písmo, kurzíva, odkazy)' },
  'lost.ticks': { en: 'the ticks', cs: 'zaškrtnutí' },
  'lost.setting': { en: 'the setting "{name}"', cs: 'nastavení „{name}“' },
} as const;

export type Part = keyof typeof PARTS;

export function partTitle(key: Part, lang: Lang, vars: Record<string, string | number> = {}): string {
  return PARTS[key][lang].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** A registry block's or child directive's title; the name itself when the registry does not have it. */
export function blockTitle(name: string, lang: Lang): string {
  const def = definition(name);
  if (def) return lang === 'cs' ? BLOCKS_CS[name]?.title ?? def.title : def.title;
  const child = CHILD_TITLES[name];
  return child ? child[lang] : name;
}

export function blockSummary(name: string, lang: Lang): string | undefined {
  const def = definition(name);
  return def && (lang === 'cs' ? BLOCKS_CS[name]?.summary ?? def.summary : def.summary);
}

export const groupTitle = (g: BlockGroup, lang: Lang): string => (lang === 'cs' ? GROUPS_CS : GROUPS)[g];

/** An inline element's (kbd, badge, footnote, citation) title and summary. */
export function inlineText(name: string, lang: Lang): { title: string; summary: string } | undefined {
  const en = INLINES.find((i) => i.name === name);
  return en && (lang === 'cs' ? INLINES_CS[name] ?? en : { title: en.title, summary: en.summary });
}

/** A setting with its help in the chosen language, and labels for its values (by value). */
export interface LocalAttribute extends AttributeSpec {
  labels?: Readonly<Record<string, string>>;
}

/** The settings of a block (or of a child directive, with `child`), their help and value labels in the language. */
export function localAttributes(
  attributes: Readonly<Record<string, AttributeSpec>>, lang: Lang, block: string, child?: string,
): Readonly<Record<string, LocalAttribute>> {
  if (lang === 'en') return attributes;
  const cs: Readonly<Record<string, CzechAttribute>> | undefined = child
    ? BLOCKS_CS[block]?.children?.[child]?.attributes : BLOCKS_CS[block]?.attributes;
  return Object.fromEntries(Object.entries(attributes).map(([k, spec]) => {
    const c = cs?.[k];
    return [k, c ? { ...spec, description: c.help, ...(c.values ? { labels: c.values } : {}) } : spec];
  }));
}

/** Text folded for search: lower case, without accents. */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Whether every word of the query is found in one of the texts (accents and case ignored). */
export function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const hay = fold(texts.filter(Boolean).join(' '));
  return fold(query).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** A block's names in both languages and its name in the syntax, for search. */
export function searchWords(name: string): string {
  const def = definition(name);
  const child = CHILD_TITLES[name];
  return [name, def?.title, BLOCKS_CS[name]?.title, child?.en, child?.cs, def && GROUPS[def.group], def && GROUPS_CS[def.group]].filter(Boolean).join(' ');
}
