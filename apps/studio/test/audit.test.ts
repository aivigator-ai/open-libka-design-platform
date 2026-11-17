/// <reference types="node" />
/**
 * The Studio's accessibility self-audit (audit/audit.ts): every WCAG 2.2 A/AA criterion has its result and evidence,
 * every test it cites exists, and docs/acr/studio.md is the report generated from it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WCAG22 } from '@libka/guard/wcag';
import { AUDIT, NVDA_RUN, REVIEWED, studioAcrMarkdown } from '../audit/audit.ts';
import { STRINGS } from '../src/i18n.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('the Studio\'s accessibility audit', () => {
  it('covers every WCAG 2.2 A/AA criterion, each with a result, how it is met and its evidence', () => {
    expect(Object.keys(AUDIT).sort()).toEqual(WCAG22.map((c) => c.sc).sort());
    for (const [sc, e] of Object.entries(AUDIT)) {
      expect(e.how.length, sc).toBeGreaterThan(20);
      expect(e.evidence.length, sc).toBeGreaterThan(0);
      // a claim of support rests on more than a review wherever a test can show it
      if (e.result === 'Supports' && e.evidence.every((x) => 'review' in x)) {
        expect(['1.3.3', '1.4.5', '1.4.13', '2.2.1', '2.2.2', '2.3.1', '2.5.2', '3.2.2', '3.2.3'], `${sc} rests on reviews only`).toContain(sc);
      }
    }
  });

  it('the Studio\'s own Accessibility panel names the same review and NVDA run as the report', () => {
    const [ry, rm, rd] = REVIEWED.split('-').map(Number) as [number, number, number];
    const [ny, nm, nd] = NVDA_RUN.split('-').map(Number) as [number, number, number];
    const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const CS_MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
    expect(STRINGS.en['a11y.date']).toContain(`${rd} ${EN_MONTHS[rm - 1]} ${ry}`);
    expect(STRINGS.en['a11y.date']).toContain(`NVDA tests of ${nd} ${EN_MONTHS[nm - 1]} ${ny}`);
    expect(STRINGS.cs['a11y.date']).toContain(`${rd}. ${CS_MONTHS[rm - 1]} ${ry}`);
    expect(STRINGS.cs['a11y.date']).toContain(`NVDA z ${nd}. ${CS_MONTHS[nm - 1]} ${ny}`);
    // the NVDA tests run on request, not on every change (the report says so too)
    expect(STRINGS.en['a11y.how'].split('On request')[0]).not.toContain('NVDA');
    expect(STRINGS.cs['a11y.how'].split('Na požádání')[0]).not.toContain('NVDA');
    // and they reach only some views: the panel and the report name those they do not
    const unreached = ['Present', 'the phone\'s bottom bar', 'the block bar', 'the Blocks and Focus modes', 'the template picker'];
    for (const text of [STRINGS.en['a11y.date'], studioAcrMarkdown()]) for (const view of unreached) expect(text, view).toContain(view);
    for (const view of ['prezentaci na celou obrazovku', 'spodní lištu na telefonu', 'lištu bloku', 'režimy Bloky a Fokus', 'výběr šablony']) expect(STRINGS.cs['a11y.date'], view).toContain(view);
  });

  it('cites only tests that exist', () => {
    for (const [sc, e] of Object.entries(AUDIT)) {
      for (const x of e.evidence) {
        if (!('test' in x)) continue;
        const file = join(here, x.test);
        expect(existsSync(file), `${sc}: ${x.test}`).toBe(true);
        expect(readFileSync(file, 'utf8').includes(x.title), `${sc}: "${x.title}" in ${x.test}`).toBe(true);
      }
    }
  });

  it('keeps docs/acr/studio.md in step (node apps/studio/audit/build-acr.ts)', () => {
    expect(readFileSync(join(here, '..', '..', '..', 'docs', 'acr', 'studio.md'), 'utf8')).toBe(studioAcrMarkdown());
  });
});
