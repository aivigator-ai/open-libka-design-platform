import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCKS_DIR, builtinLocks } from '../src/build-locks.ts';
import {
  DEFAULT, LIBKA_BRAND, builtinTheme, canonical, design, inputsOf, lockHash, lockMatches, lockName, lockText, readLock, sha256Hex,
  type Brand,
} from '../src/index.ts';

const classic = builtinTheme('classic')!, modern = builtinTheme('modern')!;
const yellow: Brand = { id: 'yellow', color: { primary: '#FFD400' }, fonts: {}, neutral: 'none', pinned: false };

describe('sha256Hex', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('Příliš žluťoučký kůň')).toHaveLength(64);
  });
});

describe('canonical JSON', () => {
  it('sorts keys at every level and ends with LF', () => {
    expect(canonical({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: 2 } })).toBe('{\n  "a": {\n    "c": 2,\n    "d": [\n      3,\n      {\n        "e": 2,\n        "f": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
  });
});

describe('a design', () => {
  it('takes the theme\'s fonts, and the brand\'s where it names them', () => {
    expect(design(LIBKA_BRAND, classic).fonts.heading.id).toBe('fraunces');
    expect(design(LIBKA_BRAND, modern).fonts.heading.id).toBe('space-grotesk');
    const branded = design({ ...yellow, fonts: { heading: 'literata' } }, modern);
    expect([branded.fonts.heading.id, branded.fonts.body.id, branded.fonts.mono.id]).toEqual(['literata', 'inter', 'jetbrains-mono']);
  });
  it('of LibKa\'s brand is today\'s palette in every theme', () => {
    expect(design(LIBKA_BRAND, modern).palette).toBe(DEFAULT.values);
  });
});

describe('the lock', () => {
  it('is canonical and the same on every run', () => {
    const a = lockText(design(yellow, classic)), b = lockText(design(yellow, classic));
    expect(a).toBe(b);
    expect(a).toBe(canonical(JSON.parse(a)));
    expect(lockHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('records the solver, the input hashes, the fonts and each role', () => {
    const lock = readLock(lockText(design(yellow, classic)))!;
    expect(lock).toMatchObject({ format: 1, solver: 'libka-solver/1', brand: 'yellow', theme: 'classic', pinned: false });
    expect(lock.fonts).toEqual({ heading: 'fraunces', body: 'inter', mono: 'jetbrains-mono' });
    expect(lock.roles.find((r) => r.mode === 'light' && r.key === 'semantic.text.accent')).toMatchObject({ value: '#7B6500', reason: 'moved' });
    expect(lock.palette.light['semantic.text.accent']).toBe('#7B6500');
  });
  it('matches the inputs it was made from, and no others', () => {
    const lock = readLock(lockText(design(yellow, classic)))!;
    expect(lockMatches(lock, inputsOf(yellow, classic))).toBe(true);
    expect(lockMatches(lock, inputsOf(yellow, modern))).toBe(false);
    expect(lockMatches(lock, inputsOf({ ...yellow, color: { primary: '#FFD401' } }, classic))).toBe(false);
  });
  it('refuses what this LibKa did not write', () => {
    expect(readLock('not json')).toBeNull();
    expect(readLock('{"format": 2, "solver": "libka-solver/1"}')).toBeNull();
  });
  it('is never written for a failing design', () => {
    const broken = { ...design(yellow, classic), gates: { checks: [], failures: [{} as never] } };
    expect(() => lockText(broken)).toThrow(/cannot be locked/);
  });
  it('is named after the brand and the theme', () => {
    expect(lockName('libka', 'classic')).toBe('libka.classic.design.lock.json');
  });
});

describe('the built-in locks in packages/design/locks/', () => {
  it('are current (node packages/design/src/build-locks.ts regenerates them)', () => {
    const expected = builtinLocks();
    expect(readdirSync(LOCKS_DIR).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, text] of Object.entries(expected)) expect(readFileSync(join(LOCKS_DIR, name), 'utf8'), name).toBe(text);
  });
  it('pin LibKa\'s palette and pass every check', () => {
    for (const text of Object.values(builtinLocks())) {
      const lock = readLock(text)!;
      expect(lock.pinned).toBe(true);
      expect(lock.palette).toEqual(DEFAULT.values);
      expect(lock.roles).toEqual([]);
    }
  });
});
