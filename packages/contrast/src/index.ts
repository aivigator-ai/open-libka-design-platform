/**
 * WCAG 2.2 contrast math for LibKa (relative luminance and contrast ratio).
 *
 * This is the TypeScript home of the checks the Python build (generate.py) runs
 * today; the tests pin both implementations to the same numbers.
 */

/** sRGB channels 0–255. */
export type Rgb = readonly [number, number, number];

/** Parse `#RGB` or `#RRGGBB` (case-insensitive). Throws on anything else. */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || m[1] === undefined) throw new Error(`not a hex color: ${hex}`);
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** WCAG contrast ratio between two colors, 1 to 21. Accepts hex strings or RGB tuples. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(typeof a === 'string' ? parseHex(a) : a);
  const lb = relativeLuminance(typeof b === 'string' ? parseHex(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `share` of `fg` over `bg` (0–1), as CSS color-mix() or an alpha tint composites it. */
export function mix(fg: string | Rgb, bg: string | Rgb, share: number): Rgb {
  const f = typeof fg === 'string' ? parseHex(fg) : fg;
  const g = typeof bg === 'string' ? parseHex(bg) : bg;
  return [0, 1, 2].map((i) => f[i]! * share + g[i]! * (1 - share)) as unknown as Rgb;
}

/** The lowest contrast of `fg` against any of `backgrounds`. */
export function worstContrast(fg: string | Rgb, backgrounds: ReadonlyArray<string | Rgb>): number {
  return Math.min(...backgrounds.map((bg) => contrastRatio(fg, bg)));
}

/** WCAG 2.2 thresholds LibKa enforces. */
export const THRESHOLDS = {
  text: 4.5,          // normal text, AA
  ui: 3,              // UI components and large text, AA
  textHighContrast: 7, // LibKa high-contrast mode, AAA
  uiHighContrast: 4.5,
} as const;
