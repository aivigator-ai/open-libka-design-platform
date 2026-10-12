import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { acrMarkdown } from '../src/build-acr.ts';
import { axeCriteria, conformance, conformanceMarkdown, enClause, WCAG22 } from '../src/wcag.ts';
import type { GuardReport } from '../src/index.ts';

const report = (over: Partial<Record<string, { violations: string[]; covered?: string[] }>> = {}): GuardReport => ({
  passed: true,
  checks: [
    { id: 'axe', mode: 'standard', title: 'axe', checked: 10, skipped: 0, violations: (over.axe?.violations ?? []).map((rule) => ({ rule, message: '', target: '' })), covered: over.axe?.covered ?? ['1.1.1', '4.1.2', '2.5.8'] },
    { id: 'contrast', mode: 'standard', title: 'c', checked: 5, skipped: 0, violations: (over.contrast?.violations ?? []).map((rule) => ({ rule, message: '', target: '' })) },
    { id: 'structure', mode: 'standard', title: 's', checked: 3, skipped: 0, violations: (over.structure?.violations ?? []).map((rule) => ({ rule, message: '', target: '' })) },
  ],
});

describe('WCAG 2.2 and EN 301 549 mapping', () => {
  it('lists the 55 A and AA criteria of WCAG 2.2, without the obsolete 4.1.1', () => {
    expect(WCAG22).toHaveLength(55);
    expect(WCAG22.map((c) => c.sc)).not.toContain('4.1.1');
    expect(WCAG22.filter((c) => c.level === 'A')).toHaveLength(31);
    expect(enClause('1.4.3', 'web')).toBe('9.1.4.3');
    expect(enClause('1.4.3', 'document')).toBe('10.1.4.3');
  });

  it('reads the criteria of axe rules from their tags', () => {
    expect(axeCriteria().get('image-alt')).toContain('1.1.1');
    expect(axeCriteria().get('color-contrast')).toContain('1.4.3');
    expect(axeCriteria().get('target-size')).toContain('2.5.8');
  });

  it('marks each criterion checked, failed, not applicable or for review, from a Guard report and the content', () => {
    const ok = conformance(report(), { media: false, forms: false });
    expect(ok.checked).toEqual(expect.arrayContaining(['1.1.1', '1.3.1', '1.4.3', '2.5.8', '4.1.2']));
    expect(ok.failed).toEqual([]);
    expect(ok.notApplicable).toEqual(expect.arrayContaining(['1.2.1', '1.2.4', '3.3.1', '3.3.8']));
    expect(ok.review).toContain('2.4.7');
    expect(ok.checked.length + ok.failed.length + ok.review.length + ok.notApplicable.length).toBe(55);

    const bad = conformance(report({ axe: { violations: ['image-alt'] }, contrast: { violations: ['contrast'] }, structure: { violations: ['table-caption'] } }), { media: true, forms: false });
    expect(bad.failed).toEqual(expect.arrayContaining(['1.1.1', '1.4.3', '1.3.1']));
    expect(bad.notApplicable).not.toContain('1.2.1');   // a document with video has media criteria to meet
  });

  it('says in the report when the PDF was not validated, and only then', () => {
    const c = conformance(report(), { media: false, forms: false });
    const skipped = conformanceMarkdown('Guide', 'manual', c, true, true, 'veraPDF was not found');
    expect(skipped).toContain(':::callout[The PDF was not validated]{variant=warning}');
    expect(skipped).toContain('PDF/UA-1 was not checked: veraPDF was not found.');
    expect(skipped).toContain('web page and the Word file');
    expect(conformanceMarkdown('Guide', 'manual', c, true, true)).not.toContain('not validated');
    expect(conformanceMarkdown('Guide', 'manual', c, false, false, 'veraPDF was not found')).not.toContain('not validated');   // no PDF, nothing to say
  });

  it('keeps the generated ACR draft current with the mapping', () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'acr', 'libka-outputs.md');
    expect(readFileSync(file, 'utf8')).toBe(acrMarkdown());
  });
});
