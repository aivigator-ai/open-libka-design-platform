import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DESIGN_SAMPLES, designCodeRows, sampleProblems } from '../src/index.ts';

const src = (name: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', name), 'utf8');

describe('the brand and theme files\' codes', () => {
  it('has a sample for every code the files report, and each sample makes its code', () => {
    const text = src('brand.ts') + src('theme.ts');
    const codes = new Set([...text.matchAll(/\b(?:err|warn|note|problem)\('((?:brand|theme)-[a-z-]+)'/g)].map((m) => m[1]!));
    // `brand-${k}` for the seam's version and issuer
    expect(text).toContain("err(`brand-${k}`");
    codes.add('brand-version').add('brand-issuer');
    expect([...codes].sort()).toEqual(Object.keys(DESIGN_SAMPLES).sort());
    for (const code of codes) expect(sampleProblems(code).map((p) => p.code), code).toContain(code);
  });

  it('gives each row its file, severity and the key path in its message', () => {
    const rows = designCodeRows();
    expect(rows.find((r) => r.code === 'brand-key-unsupported')).toEqual({ code: 'brand-key-unsupported', severity: 'warning', file: 'brand', message: 'LibKa does not use meta.description.' });
    expect(rows.find((r) => r.code === 'theme-value')).toMatchObject({ file: 'theme', severity: 'error' });
    // the key path when the message does not name it
    expect(rows.find((r) => r.code === 'brand-logo-alt')?.message).toMatch(/^logo needs alt text/);
    expect(rows.find((r) => r.code === 'theme-key-unknown')?.message).toBe('"colors" is not a theme setting.');
  });
});
