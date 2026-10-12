import { describe, expect, it } from 'vitest';
import { contrastRatio, mix, parseHex, relativeLuminance, worstContrast } from '../src/index.ts';

const r2 = (n: number) => Math.round(n * 100) / 100;

describe('parseHex', () => {
  it('reads six- and three-digit hex', () => {
    expect(parseHex('#0F8FA1')).toEqual([15, 143, 161]);
    expect(parseHex('#abc')).toEqual([170, 187, 204]);
  });
  it('rejects anything else', () => {
    expect(() => parseHex('rgb(0 0 0)')).toThrow();
    expect(() => parseHex('#12345')).toThrow();
  });
});

describe('contrastRatio (same numbers as the Python build)', () => {
  it('spans 1 to 21', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBe(21);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(relativeLuminance([255, 255, 255])).toBe(1);
  });
  it('reproduces the accent finding: 3.84:1 on surface, fixed to 5.87:1', () => {
    expect(r2(contrastRatio('#0F8FA1', '#FFFFFF'))).toBe(3.84);
    expect(r2(contrastRatio('#056F7D', '#FFFFFF'))).toBe(5.87);
  });
  it('reproduces the button finding: white on dark accent 2.05:1', () => {
    expect(r2(contrastRatio('#FFFFFF', '#20C7D9'))).toBe(2.05);
  });
  it('reproduces the text-on-tint worst case: 4.64:1', () => {
    const tintOnElevated = mix('#0F8FA1', '#F1F4F7', 0.12);
    expect(r2(contrastRatio('#056F7D', tintOnElevated))).toBe(4.64);
  });
  it('finds the worst background', () => {
    expect(r2(worstContrast('#5F6A7B', ['#F6F7F9', '#FFFFFF', '#F1F4F7']))).toBe(4.96);
  });
});
