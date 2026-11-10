import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCKS, BLOCKS_CS, CHILD_TITLES, DIRECTIVES, EXAMPLES_CS, blockNamesAsCode, documentSchema, FALLBACKS, GROUPS, GROUPS_CS, INLINES, INLINES_CS, settingTitle, VALUE_LABELS_EN, valueLabelsEn } from '../src/index.ts';
import { catalogMarkdown } from '../src/catalog.ts';
import { skillReference } from '../src/skill-reference.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('block registry', () => {
  it('has one complete definition per block', () => {
    expect(new Set(BLOCKS.map((b) => b.name)).size).toBe(BLOCKS.length);
    for (const b of BLOCKS) {
      expect(b.title && b.summary && b.example && b.useWhen, b.name).toBeTruthy();
      expect(Object.keys(GROUPS), b.name).toContain(b.group);
      expect(b.a11y.length, `${b.name} a11y`).toBeGreaterThan(0);
      expect(b.antiPatterns.length, `${b.name} anti-patterns`).toBeGreaterThan(0);
      expect([b.targets.web, b.targets.pdf, b.targets.deck].every(Boolean), `${b.name} targets`).toBe(true);
      expect((b.schema.properties as { type: { const: string } }).type.const, `${b.name} schema`).toBe(b.name);
    }
  });

  it('has Czech text for every block, attribute, value, child directive and inline element, and nothing more', () => {
    const keys = (o: object | undefined) => Object.keys(o ?? {}).sort();
    expect(keys(BLOCKS_CS)).toEqual(BLOCKS.map((b) => b.name).sort());
    expect(keys(GROUPS_CS)).toEqual(keys(GROUPS));
    expect(keys(INLINES_CS)).toEqual(INLINES.map((i) => i.name).sort());
    const children = new Set<string>();
    for (const b of BLOCKS) {
      const cs = BLOCKS_CS[b.name]!;
      expect(cs.title && cs.summary, b.name).toBeTruthy();
      expect(cs.summary, `${b.name}: a translation, not the English`).not.toBe(b.summary);
      expect(keys(cs.attributes), b.name).toEqual(keys(b.attributes));
      expect(keys(cs.children), b.name).toEqual(keys(b.children));
      const check = (where: string, en: object | undefined, czech: Readonly<Record<string, { help: string; values?: object }>> | undefined) => {
        for (const [name, spec] of Object.entries(en ?? {}) as [string, { values?: readonly string[] }][]) {
          const c = czech?.[name];
          expect(c?.help, `${where}@${name}`).toBeTruthy();
          expect(keys(c?.values), `${where}@${name} values`).toEqual([...(spec.values ?? [])].map(String).sort());
        }
      };
      check(b.name, b.attributes, cs.attributes);
      for (const [child, attrs] of Object.entries(b.children ?? {})) {
        children.add(child);
        check(`${b.name}.${child}`, attrs, cs.children?.[child]?.attributes);
      }
    }
    expect(keys(CHILD_TITLES)).toEqual([...children].sort());
    // every setting has a plain name in both languages, for editors (Properties shows it with the key beside it)
    for (const b of BLOCKS) {
      const named = (key: string, child?: string) => {
        const n = settingTitle(b.name, key, child);
        expect(n?.en && n.cs, `${b.name}${child ? `.${child}` : ''}@${key}: a plain name`).toBeTruthy();
      };
      for (const k of Object.keys(b.attributes ?? {})) named(k);
      for (const [child, attrs] of Object.entries(b.children ?? {})) for (const k of Object.keys(attrs)) named(k, child);
    }
    for (const i of INLINES) expect(INLINES_CS[i.name]!.title && INLINES_CS[i.name]!.summary, i.name).toBeTruthy();
  });

  it('names every value of a choice setting in English, as the Czech does, and nothing more', () => {
    const keys = (o: object | undefined) => Object.keys(o ?? {}).sort();
    const listed = new Set<string>();
    for (const b of BLOCKS) {
      const check = (where: string, attrs: object | undefined, child?: string) => {
        for (const [name, spec] of Object.entries(attrs ?? {}) as [string, { values?: readonly string[] }][]) {
          const en = valueLabelsEn(b.name, name, child);
          if (en) listed.add(`${where}@${name}`);
          expect(keys(en), `${where}@${name}`).toEqual([...(spec.values ?? [])].map(String).sort());
          for (const [v, label] of Object.entries(en ?? {})) expect(label.trim(), `${where}@${name}=${v}`).toBeTruthy();
        }
      };
      check(b.name, b.attributes);
      for (const [child, attrs] of Object.entries(b.children ?? {})) check(`${b.name}.${child}`, attrs, child);
    }
    // nothing named that the registry does not have
    const named = Object.entries(VALUE_LABELS_EN).flatMap(([b, v]) => [
      ...Object.keys(v.attributes ?? {}).map((a) => `${b}@${a}`),
      ...Object.entries(v.children ?? {}).flatMap(([c, attrs]) => Object.keys(attrs).map((a) => `${b}.${c}@${a}`)),
    ]);
    expect(named.sort()).toEqual([...listed].sort());
  });

  it('marks at most one setting per block for the block bar, a choice or a flag', () => {
    const quick = BLOCKS.flatMap((b) => {
      const marked = Object.entries(b.attributes ?? {}).filter(([, a]) => a.quick);
      expect(marked.length, `${b.name}: at most one setting for the block bar`).toBeLessThanOrEqual(1);
      for (const [k, a] of marked) expect(Boolean(a.values?.length) || a.kind === 'flag', `${b.name}@${k}: a choice or a flag`).toBe(true);
      // (a child's settings are the child's, edited in its Properties)
      for (const [child, attrs] of Object.entries(b.children ?? {})) expect(Object.values(attrs).some((a) => a.quick), `${b.name}.${child}`).toBe(false);
      return marked.map(([k]) => `${b.name}@${k}`);
    });
    expect(quick.sort()).toEqual(['callout@variant', 'chart@type', 'cta@variant', 'decision@status', 'flow@shape', 'matrix@type', 'references@style', 'section@break', 'summary@source', 'toc@depth', 'ui@layout']);
  });

  it('has a Czech example and Czech "when to use" for every block, and nothing more', () => {
    expect(Object.keys(EXAMPLES_CS).sort()).toEqual(BLOCKS.map((b) => b.name).sort());
    // the same block, opened the same way (only the text is Czech): a directive, a fence, a heading, a list ...
    const opener = (s: string) => s.match(/^(:{2,}[a-z-]+|`{3}[a-z]+|#+ |!\[|- |> )/)?.[1] ?? 'text';
    for (const b of BLOCKS) {
      const cs = EXAMPLES_CS[b.name]!;
      expect(cs.useWhen && cs.example, b.name).toBeTruthy();
      expect(cs.useWhen, `${b.name}: a translation, not the English`).not.toBe(b.useWhen);
      expect(opener(cs.example), b.name).toBe(opener(b.example));
    }
  });

  it('accepts as directives every block that is not plain Markdown', () => {
    expect(DIRECTIVES).toEqual(expect.arrayContaining(['callout', 'tabs', 'accordion', 'chart', 'video', 'notes']));
    expect(DIRECTIVES).not.toContain('heading');
    expect(DIRECTIVES).not.toContain('code');
  });

  it('describes the whole document model as one schema', () => {
    const schema = documentSchema() as { $defs: { block: { oneOf: unknown[] } } };
    expect(schema.$defs.block.oneOf).toHaveLength(BLOCKS.length);
  });

  it('says what to write for content without a block, using only blocks and inlines that exist', () => {
    const inlines = INLINES.map((i) => i.name);
    for (const f of FALLBACKS) {
      expect(f.content && f.write, f.content).toBeTruthy();
      const prose = f.write.replace(/`[^`]*`/g, '');
      for (const [, name] of prose.matchAll(/:{3,}([a-z][a-z-]*)/g)) expect(DIRECTIVES, `${f.content}: :::${name}`).toContain(name);
      for (const [, name] of prose.matchAll(/(?<![:\w]):([a-z][a-z-]*)\[/g)) expect(inlines, `${f.content}: :${name}`).toContain(name);
    }
  });

  it('keeps the skill reference in step with the registry', () => {
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    expect(readFileSync(join(root, '.claude', 'skills', 'libka-author', 'reference.md'), 'utf8'), 'run node packages/blocks/src/build-skill.ts').toBe(skillReference(version));
  });

  it('keeps docs/blocks.md in step with the registry', () => {
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    expect(readFileSync(join(root, 'docs', 'blocks.md'), 'utf8'), 'run node packages/blocks/src/build-catalog.ts').toBe(catalogMarkdown(version));
  });
});

describe('blockNamesAsCode', () => {
  it('makes a named block code, with its label and attributes, and leaves code and other colons as they are', () => {
    expect(blockNamesAsCode('For terms use :::glossary. Tabs (:::tab[Windows]) or :::toc{depth=3}, ratio 4.5:1, `:::steps` kept.'))
      .toBe('For terms use `:::glossary`. Tabs (`:::tab[Windows]`) or `:::toc{depth=3}`, ratio 4.5:1, `:::steps` kept.');
  });
});
