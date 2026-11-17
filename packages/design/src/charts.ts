/**
 * The chart series of a design: six colours per mode, in order. A brand's own list (`defaults.libka.charts`) leads,
 * else its primary and secondary colours; LibKa's series fill the rest, skipping one too like a colour already
 * chosen. A brand's series keeps its hue and moves its lightness until it reaches 3:1 (4.5:1 in high contrast, as UI
 * colours do) against every background of the mode, with the gates' margin. LibKa's series have a value of their own
 * in each mode (the tokens', gated by generate.py for contrast and colour-blind distance): its own brand keeps them
 * as they are, and a brand's filler places take the mode's value, moved only if the brand's tinted backgrounds ask.
 */
import { CHART_SERIES, type Brand } from './brand.ts';
import { atLightness, chroma, contrast, hexToLab, hueOf, type Hex } from './color.ts';
import { MARGIN } from './gates.ts';
import { isDark, isHighContrast, MODES, type Mode, type PaletteValues } from './palette-model.ts';
import { DEFAULT_SERIES } from './series.ts';

/** LibKa's series per mode (`visualization.series` in the tokens, generated into series.ts by generate.py). */
export const LIBKA_SERIES: Readonly<Record<Mode, readonly Hex[]>> = DEFAULT_SERIES as unknown as Record<Mode, readonly Hex[]>;

/** Two colours closer than this in OKLab (squared distance) are too alike to tell apart as series. */
export const ALIKE = 0.1 * 0.1;

const BACKGROUNDS = ['semantic.bg.canvas', 'semantic.bg.surface', 'semantic.bg.elevated'];

export interface SeriesResult {
  readonly mode: Mode;
  readonly index: number;
  readonly seed: Hex;
  readonly value: Hex;
  /** Where the seed came from: the brand's list, its primary or secondary colour, or LibKa's series. */
  readonly source: 'charts' | 'primary' | 'secondary' | 'libka';
}

export interface Charts {
  /** The six series per mode. */
  readonly series: Readonly<Record<Mode, readonly Hex[]>>;
  readonly results: readonly SeriesResult[];
  /** Pairs of the brand's own series (light mode, as solved) that are too alike, by their positions from 1. */
  readonly alike: readonly (readonly [number, number])[];
}

const distance2 = (a: Hex, b: Hex): number => {
  const x = hexToLab(a), y = hexToLab(b);
  return (x.L - y.L) * (x.L - y.L) + (x.a - y.a) * (x.a - y.a) + (x.b - y.b) * (x.b - y.b);
};

/** The colour at the seed's hue nearest in lightness to it that reaches `need` against every background. */
function passing(seed: Hex, backgrounds: readonly string[], need: number, darker: boolean): Hex {
  const ok = (hex: Hex) => backgrounds.every((bg) => contrast(hex, bg) >= need + MARGIN);
  if (ok(seed)) return seed;
  const lab = hexToLab(seed);
  const hue = hueOf(lab), c0 = chroma(lab);
  let last = '';
  for (let k = Math.round(lab.L * 1000); k >= 0 && k <= 1000; k += darker ? -1 : 1) {
    const hex = atLightness(k / 1000, hue, c0);
    if (hex === last) continue;
    last = hex;
    if (ok(hex)) return hex;
  }
  return darker ? '#000000' : '#FFFFFF';
}

export function solveCharts(brand: Brand, palette: PaletteValues): Charts {
  if (brand.pinned) {
    return { series: LIBKA_SERIES, results: [], alike: [] };
  }
  // a filler place is LibKa's series number `libka` (its own value in each mode)
  const seeds: { seed: Hex; source: SeriesResult['source']; libka?: number }[] = brand.charts
    ? brand.charts.map((seed) => ({ seed, source: 'charts' as const }))
    : [...(brand.color.primary ? [{ seed: brand.color.primary, source: 'primary' as const }] : []),
      ...(brand.color.secondary ? [{ seed: brand.color.secondary, source: 'secondary' as const }] : [])];
  const own = seeds.length;
  LIBKA_SERIES.light.forEach((s, k) => {
    if (seeds.length < CHART_SERIES && seeds.every((x) => distance2(x.seed, s) >= ALIKE)) seeds.push({ seed: s, source: 'libka', libka: k });
  });
  // when too many of LibKa's are like the brand's, the rest come in order anyway
  LIBKA_SERIES.light.forEach((s, k) => { if (seeds.length < CHART_SERIES && !seeds.some((x) => x.libka === k)) seeds.push({ seed: s, source: 'libka', libka: k }); });

  const results: SeriesResult[] = [];
  const series = {} as Record<Mode, Hex[]>;
  for (const mode of MODES) {
    const backgrounds = BACKGROUNDS.map((k) => palette[mode][k]!).filter(Boolean);
    const need = isHighContrast(mode) ? 4.5 : 3;
    series[mode] = seeds.map(({ seed: base, source, libka }, index) => {
      const seed = libka === undefined ? base : LIBKA_SERIES[mode][libka]!;
      const value = passing(seed, backgrounds, need, !isDark(mode));
      results.push({ mode, index, seed, value, source });
      return value;
    });
  }
  const alike: [number, number][] = [];
  const light = series.light;
  for (let i = 0; i < own; i++) for (let j = i + 1; j < own; j++) if (distance2(light[i]!, light[j]!) < ALIKE) alike.push([i + 1, j + 1]);
  return { series, results, alike };
}
