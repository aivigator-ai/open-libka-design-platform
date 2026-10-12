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
import { AUDIT, studioAcrMarkdown } from '../audit/audit.ts';

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
