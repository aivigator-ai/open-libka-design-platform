/**
 * A seeded corpus of brands and the digest of their solved designs: what engines.test.ts compares between Node and
 * the browsers. Browser-safe: it is bundled with esbuild and run in each page.
 */
import { builtinTheme, design, lockText, sha256Hex, rgbToHex, type Brand, type Hex } from '../src/index.ts';

/** A 32-bit linear congruential generator: the same numbers in every engine. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s; };
}

export function corpus(size = 60, seed = 20261114): Brand[] {
  const next = lcg(seed);
  const colour = (): Hex => rgbToHex([next() & 255, next() & 255, next() & 255]);
  const brands: Brand[] = [];
  for (let i = 0; i < size; i++) {
    const secondary = next() % 2 === 0 ? colour() : undefined;
    brands.push({ id: `b${i}`, color: { primary: colour(), ...(secondary ? { secondary } : {}) }, fonts: {}, neutral: next() % 2 === 0 ? 'tinted' : 'none', pinned: false });
  }
  return brands;
}

/** The SHA-256 of every corpus brand's lock with the Modern theme, one per line. */
export function corpusDigest(): string {
  const modern = builtinTheme('modern')!;
  return sha256Hex(corpus().map((b) => lockText(design(b, modern))).join('\n'));
}
