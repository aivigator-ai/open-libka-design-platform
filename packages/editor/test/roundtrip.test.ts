import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Node as PMNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@libka/blocks';
import { parse } from '@libka/model';
import { load, save, schema } from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return f === 'node_modules' ? [] : statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
});

/** Folders of more LibKa documents a repository lists in check.extra.json ("corpus"), if it has one. */
const extra: string[] = existsSync(join(root, 'check.extra.json'))
  ? (JSON.parse(readFileSync(join(root, 'check.extra.json'), 'utf8')) as { corpus?: string[] }).corpus ?? [] : [];

/** Every LibKa document in the repository: the registry's examples, the examples, the catalog and any extra corpus. */
const corpus: [string, string][] = [
  ...BLOCKS.map((b) => [`block ${b.name}`, b.frontMatter ? `---\n${b.frontMatter}\n---\n\n${b.example}\n` : b.example] as [string, string]),
  ...[join(root, 'examples', 'manual', 'guide.md'), join(root, 'examples', 'open-source-guide', 'guide.md'), join(root, 'docs', 'blocks.md'),
    ...extra.flatMap((dir) => walk(join(root, dir)))].map((p) => [relative(root, p).split('\\').join('/'), readFileSync(p, 'utf8')] as [string, string]),
];

/** The parsed document without source positions, for comparing meaning. */
function meaning(md: string): unknown {
  const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'position').map(([k, x]) => [k, strip(x)])) : v;
  const r = parse(md);
  return { document: strip(r.document), problems: r.problems.map((p) => p.message) };
}

const copy = (n: PMNode) => PMNode.fromJSON(schema, n.toJSON());

describe('round-trip over every LibKa document in the repository', () => {
  it('has a corpus worth the name', () => {
    expect(corpus.length).toBeGreaterThan(extra.length ? 120 : 35);
  });

  it.each(corpus)('%s: saved untouched, it is byte for byte the same (the same nodes, and equal copies of them)', (_name, md) => {
    const loaded = load(md);
    const same = schema.nodes.doc!.create(null, loaded.doc.content);
    expect(save(same, loaded)).toBe(md);
    const copies: PMNode[] = [];
    loaded.doc.forEach((n) => copies.push(copy(n)));
    expect(save(schema.nodes.doc!.create(null, copies), loaded)).toBe(md);
  });

  it.each(corpus)('%s: written entirely in the canonical style, it means the same', (_name, md) => {
    expect(meaning(save(load(md).doc, null))).toEqual(meaning(md));
  });
});

describe('edits touch only their block', () => {
  const md = `---
title: Edits
lang: en
---

## First

Some *text*   with odd   spacing.

:::callout[Title]{variant=info}
Body.
:::

* a star list
* kept as written
`;

  it('changes one block and keeps every other byte', () => {
    const loaded = load(md);
    const blocks: PMNode[] = [];
    loaded.doc.forEach((n) => blocks.push(n));
    // the callout's variant changes
    blocks[3] = blocks[3]!.type.create({ ...blocks[3]!.attrs, attributes: { variant: 'warning' } }, blocks[3]!.content);
    const out = save(schema.nodes.doc!.create(null, blocks), loaded);
    expect(out).toBe(md.replace(':::callout[Title]{variant=info}', ':::callout[Title]{variant=warning}'));
    expect(parse(out).problems).toEqual([]);
  });

  it('moves, inserts and deletes blocks; untouched ones keep their text', () => {
    const loaded = load(md);
    const blocks: PMNode[] = [];
    loaded.doc.forEach((n) => blocks.push(n));
    const [fm, heading, para, callout, list] = blocks as [PMNode, PMNode, PMNode, PMNode, PMNode];
    const added = schema.nodes.paragraph!.create(null, [schema.text('New '), schema.text('bold', [schema.marks.strong!.create()]), schema.text(' words.')]);
    const out = save(schema.nodes.doc!.create(null, [fm, heading, list, added, callout]), loaded);
    expect(out).toBe(`---
title: Edits
lang: en
---

## First

* a star list
* kept as written

New **bold** words.

:::callout[Title]{variant=info}
Body.
:::
`);
    expect(out).not.toContain('odd');
  });

  it('keeps Markdown it does not model as a source island, verbatim', () => {
    const src = '## A\n\n<div class="x">raw *html*</div>\n\nText with a [reference][r].\n\n[r]: https://example.org\n';
    const loaded = load(src);
    const types: string[] = [];
    loaded.doc.forEach((n) => types.push(n.type.name));
    expect(types).toEqual(['heading', 'source', 'source', 'source']);
    // a changed neighbour does not disturb the islands
    const blocks: PMNode[] = [];
    loaded.doc.forEach((n) => blocks.push(n));
    blocks[0] = schema.nodes.heading!.create({ level: 2 }, schema.text('B'));
    expect(save(schema.nodes.doc!.create(null, blocks), loaded)).toBe(src.replace('## A', '## B'));
  });
});
