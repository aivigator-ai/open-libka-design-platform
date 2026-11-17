import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { builtinTheme, LIBKA_BRAND, manifestDesign, parseBrand, resolveDesign, sha256Hex } from '../src/index.ts';

const LOCKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'locks');

describe('the resolved design', () => {
  it('is LibKa\'s brand × Classic when none is given, locked as the built-in lock', () => {
    const r = resolveDesign();
    expect(r.isDefault).toBe(true);
    expect(r.design.brand).toBe(LIBKA_BRAND);
    expect(r.design.theme.id).toBe('classic');
    expect(r.lock).toBe(readFileSync(join(LOCKS, 'libka.classic.design.lock.json'), 'utf8'));
    expect(r.lockHash).toBe(sha256Hex(r.lock));
    expect(resolveDesign(LIBKA_BRAND, builtinTheme('classic')!).isDefault).toBe(true);
  });
  it('is not the default for another theme or brand', () => {
    expect(resolveDesign(LIBKA_BRAND, builtinTheme('modern')!).isDefault).toBe(false);
    const { brand } = parseBrand('color:\n  primary: "#7A1FA2"\n');
    expect(resolveDesign(brand!).isDefault).toBe(false);
  });
  it('is named in the manifest by its seam fields, its theme, the solver and the lock\'s hash', () => {
    const r = resolveDesign();
    expect(manifestDesign(r)).toEqual({
      brand: { id: 'libka', sha256: r.design.inputs.brand },
      theme: { id: 'classic', sha256: r.design.inputs.theme },
      solver: 'libka-solver/1',
      lock: r.lockHash,
    });
    const { brand } = parseBrand('color:\n  primary: "#7A1FA2"\ndefaults:\n  libka:\n    id: larkspur\n    version: 2026.1\n    issuer: Larkspur Communications\n');
    expect(manifestDesign(resolveDesign(brand!)).brand).toMatchObject({ id: 'larkspur', version: '2026.1', issuer: 'Larkspur Communications' });
    expect(manifestDesign(resolveDesign(parseBrand('meta:\n  name: Plain\n').brand!)).brand).toEqual({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });
});
