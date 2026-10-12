/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nearest, parse } from '../src/index.ts';
import { SAMPLES } from '../src/samples.ts';
import { problemCodesMarkdown } from '../src/problem-codes.ts';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts'), 'utf8');
/** Every code the model can report, read from its source. */
const CODES = [...new Set([...source.matchAll(/code: '([a-z0-9-]+)'/g)].map((m) => m[1]!))].sort();

describe('problem codes', () => {
  it('reads every code from the model, and the list matches the samples', () => {
    expect(CODES.length).toBeGreaterThan(120);
    expect(Object.keys(SAMPLES).sort()).toEqual(CODES);
  });

  it.each(CODES)('%s: a document makes it happen', (code) => {
    const problems = parse(SAMPLES[code]!).problems;
    expect(problems.map((p) => p.code), problems.map((p) => `${p.code}: ${p.message}`).join('\n')).toContain(code);
  });

  it('every problem has a code and a line', () => {
    for (const [code, md] of Object.entries(SAMPLES)) {
      for (const p of parse(md).problems) {
        expect(p.code, `${code}: ${p.message}`).toMatch(/^[a-z0-9-]+$/);
        expect(p.line).toBeGreaterThan(0);
      }
    }
  });

  it('offers fixes where they are safe', () => {
    const fixes = (md: string, code: string) => parse(md).problems.find((p) => p.code === code)?.fixes;
    expect(fixes(SAMPLES['block-unknown']!, 'block-unknown')).toEqual([{ kind: 'rename-block', to: 'callout' }]);
    expect(fixes(SAMPLES['invalid-value']!, 'invalid-value')).toEqual([{ kind: 'set-attribute', name: 'variant', value: 'info' }, { kind: 'field', target: 'attribute:variant' }]);
    expect(fixes(SAMPLES['unknown-attribute']!, 'unknown-attribute')).toEqual([{ kind: 'remove-attribute', name: 'colour' }]);
    expect(fixes('---\ntitle: T\nlang: en\n---\n\n:::callout[T]{varient=info}\nText.\n:::\n', 'unknown-attribute')).toEqual([{ kind: 'rename-attribute', from: 'varient', to: 'variant' }]);
    expect(fixes(SAMPLES['outputs-unknown']!, 'outputs-unknown')).toEqual([{ kind: 'set-front-matter', key: 'outputs', value: ['web', 'docx'] }]);
    expect(fixes(SAMPLES['outputs-need-web']!, 'outputs-need-web')).toEqual([{ kind: 'set-front-matter', key: 'outputs', value: ['web', 'pdf'] }]);
    expect(fixes(SAMPLES['image-alt']!, 'image-alt')).toEqual([{ kind: 'field', target: 'alt' }]);
    expect(fixes(SAMPLES['task-list-outside-checklist']!, 'task-list-outside-checklist')).toEqual([{ kind: 'wrap', block: 'checklist' }]);
    expect(fixes(SAMPLES['heading-too-deep']!, 'heading-too-deep')).toEqual([{ kind: 'heading-level', level: 4 }]);
  });

  it('keeps docs/problem-codes.md in step with the model', () => {
    const docs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'problem-codes.md'), 'utf8');
    expect(docs, 'run node packages/model/src/build-codes.ts').toBe(problemCodesMarkdown());
  });

  it('finds the nearest of a list only for a likely misspelling', () => {
    expect(nearest('calout', ['callout', 'cards'])).toBe('callout');
    expect(nearest('Variant', ['variant'])).toBeUndefined();   // the same word: nothing to suggest
    expect(nearest('xyz', ['callout', 'cards'])).toBeUndefined();
  });
});
