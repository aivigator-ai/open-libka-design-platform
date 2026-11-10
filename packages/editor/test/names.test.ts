import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { blockInfo, blockSummary, conversionsFor, insertables, load, matches, plainText, schema } from '../src/index.ts';

const first = (md: string): PMNode => load(md).doc.firstChild!;

describe('names in English and Czech', () => {
  it('names blocks, elements and child directives in the language', () => {
    expect(blockInfo(first(':::callout[T]{variant=info}\nx\n:::'), null, 'cs').title).toBe('Zvýraznění');
    expect(blockInfo(first('### Sub'), null, 'cs').title).toBe('Nadpis 3');
    expect(blockInfo(first('### Sub')).title).toBe('Heading 3');
    expect(blockInfo(first('- a\n- b'), null, 'cs').title).toBe('Seznam s odrážkami');
    expect(blockInfo(first(':::nope\nx\n:::'), null, 'cs').title).toBe('Neznámý blok „nope“');
    const tabs = first('::::tabs\n:::tab[A]\nOne.\n:::\n::::');
    expect(blockInfo(tabs.firstChild!, tabs, 'cs').title).toBe('Karta');
    expect(blockInfo(tabs.firstChild!, tabs).title).toBe('Tab');
  });

  it('shows help text without its Markdown marks (the registry writes it for the catalog and the skill)', () => {
    expect(plainText('Running text with **bold**, *italic*, `code`, links and :kbd[Ctrl+S] keys.')).toBe('Running text with bold, italic, code, links and Ctrl+S keys.');
    expect(plainText('2 × 2, a*b and 5 * 3 stay')).toBe('2 × 2, a*b and 5 * 3 stay');
    expect(blockSummary('paragraph', 'en')).not.toMatch(/\*\*|`|:kbd\[/);
    for (const lang of ['en', 'cs'] as const) for (const b of insertables(lang)) expect(b.summary, `${lang} ${b.name}`).not.toMatch(/\*\*|:kbd\[/);
  });

  it('gives the settings Czech help and value labels, keeping the values themselves', () => {
    const info = blockInfo(first(':::callout[T]{variant=info}\nx\n:::'), null, 'cs');
    expect(info.summary).toMatch(/^Zvýrazněné sdělení/);
    expect(info.attributes.variant!.description).toBe('Význam sdělení.');
    expect(info.attributes.variant!.values).toContain('warning');
    expect(info.attributes.variant!.labels!.warning).toBe('Varování');
    const ui = first(':::ui{caption=X}\n::button[Save]{variant=primary}\n:::');
    const button = blockInfo(ui.firstChild!, ui, 'cs');
    expect(button.labelRequired).toBe(true);
    expect(button.attributes.state!.labels!.disabled).toBe('Neaktivní');
    // English names its values too (the registry's own table); the values stay the syntax
    expect(blockInfo(ui.firstChild!, ui).attributes.state!.labels!.disabled).toBe('Disabled');
    expect(blockInfo(first(':::callout[T]{variant=info}\nx\n:::'), null, 'en').attributes.variant!.labels!.info).toBe('Info');
  });

  it('names the type changes and what they lose in the language', () => {
    const quote = first(':::quote{source=Ann}\nx\n:::');
    const toCallout = conversionsFor(quote, 'cs').find((c) => c.key === 'callout')!;
    expect(toCallout.title).toBe('Zvýraznění');
    expect(toCallout.lost).toEqual(['nastavení „source“']);
    const tasks = load(':::checklist\n- [ ] a\n:::').doc.firstChild!.firstChild!;
    expect(tasks.type).toBe(schema.nodes.bullet_list);
    expect(conversionsFor(tasks, 'cs').find((c) => c.key === 'ordered')!.lost).toEqual(['zaškrtnutí']);
  });

  it('finds blocks by either language, with or without accents', () => {
    const find = (q: string) => insertables('cs').filter((b) => matches(q, b.words)).map((b) => b.name);
    expect(find('zvyrazneni')).toContain('callout');
    expect(find('Zvýraznění')).toContain('callout');
    expect(find('callout')).toContain('callout');
    expect(find('kontrolní seznam')).toEqual(['checklist']);
    expect(find('checklist')).toEqual(['checklist']);
    expect(insertables('cs').find((b) => b.name === 'chart')!.title).toBe('Graf');
  });
});
