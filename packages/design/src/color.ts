/**
 * Colour arithmetic for the solver, deterministic by construction.
 *
 * ECMAScript leaves `Math.pow`, `Math.cbrt` and the trigonometric functions approximated per engine, so nothing here
 * uses them: luminance comes from a 256-entry table that `generate.py` writes from its own transfer function, cube
 * roots take a fixed number of Newton steps, a hue is kept as an (a, b) unit vector, and only `+ − × ÷`,
 * `Math.sqrt`, `Math.round` and comparisons are used. The same input gives the same bits in Node, Chrome and Firefox.
 *
 * Colours are computed in OKLab (Björn Ottosson's matrices for linear sRGB) and described in OKLCH terms.
 */
import { SRGB_LINEAR } from './srgb-table.ts';

/** An 8-bit sRGB colour as `#RRGGBB`, upper case. */
export type Hex = `#${string}`;
/** 8-bit sRGB channels, 0–255 (integers for a hex, fractions for a composited tint). */
export type Rgb = readonly [number, number, number];
/** OKLab: L 0–1, a and b about −0.4 to 0.4. */
export interface Lab { readonly L: number; readonly a: number; readonly b: number }

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value.trim());
}

/** `#RGB` or `#RRGGBB` (any case) to `#RRGGBB` upper case. Throws on anything else. */
export function normalizeHex(value: string): Hex {
  const m = HEX.exec(value.trim());
  if (!m || m[1] === undefined) throw new Error(`not a hex colour: ${value}`);
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return `#${h.toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgbToHex(rgb: Rgb): Hex {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** The linear light of an 8-bit channel value. A fraction (a composited tint) is rounded to the nearest 8-bit value first, as the browser draws it. */
export function linear(channel: number): number {
  const i = Math.round(channel);
  if (i < 0 || i > 255) throw new Error(`channel out of range: ${channel}`);
  return SRGB_LINEAR[i]!;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(rgb: Rgb): number {
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** The WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(typeof a === 'string' ? hexToRgb(a) : a);
  const lb = luminance(typeof b === 'string' ? hexToRgb(b) : b);
  return la > lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

/** `fg` at `alpha` over `bg`: what an `rgb(… / alpha)` tint or `color-mix(in srgb …)` paints, per channel. */
export function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [fg[0] * alpha + bg[0] * (1 - alpha), fg[1] * alpha + bg[1] * (1 - alpha), fg[2] * alpha + bg[2] * (1 - alpha)];
}

/** A cube root by 60 Newton steps from 1: exact operations only, converged for every value the colours produce. */
export function cbrt(x: number): number {
  if (x === 0) return 0;
  if (x < 0) return -cbrt(-x);
  let y = x > 1 ? x : 1;
  for (let i = 0; i < 60; i++) y = (2 * y + x / (y * y)) / 3;
  return y;
}

function linearToLab(r: number, g: number, b: number): Lab {
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab to linear sRGB (may fall outside 0–1: out of gamut). */
export function labToLinear(lab: Lab): [number, number, number] {
  const l1 = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m1 = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s1 = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l1 * l1 * l1, m = m1 * m1 * m1, s = s1 * s1 * s1;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return linearToLab(linear(r), linear(g), linear(b));
}

/** The 8-bit value whose linear light is nearest to `x` (0–1), by bisection of the table. */
export function encode(x: number): number {
  if (!(x > 0)) return 0;
  if (x >= 1) return 255;
  let lo = 0, hi = 255;   // SRGB_LINEAR[lo] <= x < SRGB_LINEAR[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (SRGB_LINEAR[mid]! <= x) lo = mid; else hi = mid;
  }
  return x - SRGB_LINEAR[lo]! <= SRGB_LINEAR[hi]! - x ? lo : hi;
}

const GAMUT_EPSILON = 1e-9;

export function inGamut(lab: Lab): boolean {
  return labToLinear(lab).every((c) => c >= -GAMUT_EPSILON && c <= 1 + GAMUT_EPSILON);
}

export function labToHex(lab: Lab): Hex {
  const [r, g, b] = labToLinear(lab);
  return rgbToHex([encode(r), encode(g), encode(b)]);
}

/** OKLCH chroma. */
export function chroma(lab: Lab): number {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b);
}

/** The hue as an (a, b) unit vector, or null for a grey (chroma below 1e-6), which has none. */
export function hueOf(lab: Lab): readonly [number, number] | null {
  const c = chroma(lab);
  return c < 1e-6 ? null : [lab.a / c, lab.b / c];
}

/**
 * The colour at lightness `L` and hue `hue` with the most chroma up to `maxChroma` that sRGB can show: chroma is
 * reduced by 32 bisection steps until the colour is inside the gamut. A grey (no hue) has chroma 0.
 */
export function atLightness(L: number, hue: readonly [number, number] | null, maxChroma: number): Hex {
  if (!hue || maxChroma <= 0) return labToHex({ L, a: 0, b: 0 });
  const at = (c: number): Lab => ({ L, a: hue[0] * c, b: hue[1] * c });
  if (inGamut(at(maxChroma))) return labToHex(at(maxChroma));
  let lo = 0, hi = maxChroma;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(at(mid))) lo = mid; else hi = mid;
  }
  return labToHex(at(lo));
}

/** The angle between two hues in whole degrees (for words and tests), from their unit vectors. */
export function hueDifference(a: readonly [number, number], b: readonly [number, number]): number {
  const cos = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1]));
  // a monotone table lookup instead of Math.acos: whole degrees are all words and tests need
  for (let d = 0; d <= 180; d++) if (cos >= COS_DEGREES[d]!) return d;
  return 180;
}

// cos(d°) for d = 0…180: the recurrence cos((n+1)x) = 2·cos(x)·cos(nx) − cos((n−1)x), seeded with cos(1°) from its
// Taylor series, so exact operations only
const COS_DEGREES: number[] = (() => {
  const x = Math.PI / 180;
  const x2 = x * x;
  const c1 = 1 - x2 / 2 + (x2 * x2) / 24 - (x2 * x2 * x2) / 720 + (x2 * x2 * x2 * x2) / 40320;
  const out = [1, c1];
  for (let n = 1; n < 180; n++) out.push(2 * c1 * out[n]! - out[n - 1]!);
  return out;
})();
