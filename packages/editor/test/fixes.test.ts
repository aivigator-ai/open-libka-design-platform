import { describe, expect, it } from 'vitest';
import { parse, type Fix } from '@libka/model';
import { applyFix, appliesToText } from '../src/index.ts';

const doc = (body: string) => `---\ntitle: T\nlang: en\n---\n\n## Before\n\nKept   as written.\n\n${body}\n\n## After\n\nAlso   kept.\n`;

/** The problem with `code`, and its first fix that changes the text. */
function problem(md: string, code: string): { line: number; fix: Fix } {
  const p = parse(md).problems.find((x) => x.code === code);
  expect(p, `no ${code} in ${JSON.stringify(parse(md).problems)}`).toBeDefined();
  const fix = p!.fixes?.find(appliesToText);
  expect(fix, `${code} has no text fix`).toBeDefined();
  return { line: p!.line, fix: fix! };
}

const CASES: [string, string, string][] = [
  // code, document body, what the block becomes
  ['block-unknown', ':::calout[Heads up]{variant=info}\nText.\n:::', ':::callout[Heads up]{variant=info}\nText.\n:::'],
  ['unknown-attribute', ':::callout[Heads up]{variant=info colour=red}\nText.\n:::', ':::callout[Heads up]{variant=info}\nText.\n:::'],
  ['unknown-attribute', ':::callout[Heads up]{varient=warning}\nText.\n:::', ':::callout[Heads up]{variant=warning}\nText.\n:::'],
  ['invalid-value', ':::callout[Heads up]{variant=warnign}\nText.\n:::', ':::callout[Heads up]{variant=warning}\nText.\n:::'],
  ['task-list-outside-checklist', '- [ ] open\n- [x] done', ':::checklist\n- [ ] open\n- [x] done\n:::'],
  ['heading-too-deep', '##### Deep', '#### Deep'],
  ['heading-skipped', '#### Skipped', '### Skipped'],
  ['summary-numbered', ':::summary\n1. One\n2. Two\n3. Three\n:::', ':::summary\n- One\n- Two\n- Three\n:::'],
  ['summary-reviewed-by', ':::summary{reviewed-by="Ann"}\n- One\n- Two\n- Three\n:::', ':::summary{reviewed-by=Ann source=ai}\n- One\n- Two\n- Three\n:::'],
  ['unknown-attribute', '::::tabs\n:::tab[A]{icon=x}\nOne.\n:::\n:::tab[B]\nTwo.\n:::\n::::', '::::tabs\n:::tab[A]\nOne.\n:::\n\n:::tab[B]\nTwo.\n:::\n::::'],
  ['invalid-value', ':::ui{caption="Buttons"}\n::button[Save]{variant=primry}\n:::', ':::ui{caption=Buttons}\n::button[Save]{variant=primary}\n:::'],
];

describe('applying fixes', () => {
  it.each(CASES)('%s: fixed, and every other line kept', (code, body, fixed) => {
    const md = doc(body);
    const { line, fix } = problem(md, code);
    const out = applyFix(md, line, fix)!;
    expect(out).toBe(doc(fixed));
    expect(parse(out).problems.map((p) => p.code)).not.toContain(code);
  });

  it('wraps a table without a caption in :::table, whose caption the author then writes', () => {
    const md = doc('| A | B |\n|---|---|\n| 1 | 2 |');
    const { line, fix } = problem(md, 'table-caption');
    const out = applyFix(md, line, fix)!;
    expect(out).toBe(doc(':::table{caption}\n| A | B |\n| - | - |\n| 1 | 2 |\n:::'));   // an empty caption, for the author to write
    const left = parse(out).problems;
    expect(left.map((p) => p.code)).toEqual(['missing-attribute']);
    expect(left[0]!.fixes).toEqual([{ kind: 'field', target: 'attribute:caption' }]);
  });

  it('a heading given as the title twice becomes a section heading', () => {
    const md = '# Title\n\nText.\n\n# Another\n\nMore.\n';
    const { line, fix } = problem(md, 'heading-title-twice');
    expect(applyFix(md, line, fix)).toBe('# Title\n\nText.\n\n## Another\n\nMore.\n');
  });

  it('does nothing for fixes that are not about the text, or on the wrong line', () => {
    expect(applyFix(doc('x'), 1, { kind: 'field', target: 'alt' })).toBeNull();
    expect(applyFix(doc('x'), 1, { kind: 'set-front-matter', key: 'outputs', value: ['web'] })).toBeNull();
    expect(applyFix(doc(':::calout[T]\nx\n:::'), 3, { kind: 'rename-block', to: 'callout' })).toBeNull();
  });
});
