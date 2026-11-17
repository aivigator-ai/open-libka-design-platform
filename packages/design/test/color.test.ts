import { contrastRatio } from '@libka/contrast';
import { oklab } from 'culori';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SRGB_LINEAR, atLightness, cbrt, chroma, contrast, encode, hexToLab, hexToRgb, hueDifference, hueOf, labToHex, normalizeHex, rgbToHex,
} from '../src/index.ts';

const SEED = 20261114;
const hex = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 })).map((c) => rgbToHex(c));

describe('the sRGB table generate.py writes', () => {
  it('holds the transfer function for every 8-bit value', () => {
    expect(SRGB_LINEAR).toHaveLength(256);
    SRGB_LINEAR.forEach((x, i) => {
      const c = i / 255;
      const expected = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      expect(Math.abs(x - expected)).toBeLessThanOrEqual(1e-15);
    });
  });
  it('rises strictly, so encoding by bisection is unambiguous', () => {
    for (let i = 1; i < 256; i++) expect(SRGB_LINEAR[i]!).toBeGreaterThan(SRGB_LINEAR[i - 1]!);
  });
});

describe('contrast', () => {
  it('gives the same ratios as @libka/contrast (Math.pow) to 1e-12', () => {
    fc.assert(fc.property(hex, hex, (a, b) => Math.abs(contrast(a, b) - contrastRatio(a, b)) < 1e-12), { seed: SEED, numRuns: 2000 });
  });
  it('keeps the known findings', () => {
    expect(contrast('#0F8FA1', '#FFFFFF').toFixed(2)).toBe('3.84');
    expect(contrast('#FFFFFF', '#000000')).toBe(21);
  });
});

describe('the arithmetic without Math.pow, cbrt or trigonometry', () => {
  it('takes cube roots to the last bits', () => {
    fc.assert(fc.property(fc.double({ min: 1e-9, max: 2, noNaN: true }), (x) => Math.abs(cbrt(x) - Math.cbrt(x)) <= 4e-16 * Math.cbrt(x)), { seed: SEED, numRuns: 2000 });
    expect(cbrt(0)).toBe(0);
    expect(cbrt(-8)).toBeCloseTo(-2, 15);
  });
  it('converts to OKLab as culori does', () => {
    fc.assert(fc.property(hex, (h) => {
      const ours = hexToLab(h), theirs = oklab(h)!;
      return Math.abs(ours.L - theirs.l) < 1e-6 && Math.abs(ours.a - theirs.a) < 1e-6 && Math.abs(ours.b - theirs.b) < 1e-6;
    }), { seed: SEED, numRuns: 2000 });
  });
  it('round-trips every hex through OKLab', () => {
    fc.assert(fc.property(hex, (h) => labToHex(hexToLab(h)) === h), { seed: SEED, numRuns: 5000 });
  });
  it('encodes linear light to the nearest 8-bit value', () => {
    expect(encode(0)).toBe(0);
    expect(encode(1)).toBe(255);
    expect(encode(-0.1)).toBe(0);
    expect(encode(SRGB_LINEAR[128]!)).toBe(128);
    expect(encode((SRGB_LINEAR[128]! + SRGB_LINEAR[129]!) / 2 - 1e-12)).toBe(128);
  });
  it('measures hue differences in whole degrees', () => {
    const at = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)] as const;
    for (const d of [0, 1, 10, 45, 90, 135, 179, 180]) expect(Math.abs(hueDifference(at(0), at(d)) - d)).toBeLessThanOrEqual(1);
  });
});

describe('a colour at a lightness and hue', () => {
  it('stays in sRGB and keeps the hue while it has chroma', () => {
    fc.assert(fc.property(hex, fc.integer({ min: 50, max: 950 }), (h, k) => {
      const lab = hexToLab(h), hue = hueOf(lab);
      const out = atLightness(k / 1000, hue, chroma(lab));
      const back = hexToLab(out), backHue = hueOf(back);
      if (!hue || !backHue || chroma(back) < 0.03 || back.L < 0.2) return true;   // 8-bit steps move the hue of near-greys and near-blacks
      return hueDifference(hue, backHue) <= 3;
    }), { seed: SEED, numRuns: 2000 });
  });
  it('is a grey for a grey', () => {
    expect(atLightness(0.5, null, 0.2)).toBe(labToHex({ L: 0.5, a: 0, b: 0 }));
  });
});

describe('hex', () => {
  it('normalises short and lower-case hex', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(hexToRgb('#0f8fa1')).toEqual([15, 143, 161]);
    expect(() => normalizeHex('teal')).toThrow();
  });
});
