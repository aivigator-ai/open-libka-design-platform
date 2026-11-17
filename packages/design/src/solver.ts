/**
 * The colour solver: from a brand's colours to every role of LibKa's palette in all four modes, so that every pair
 * the gates check passes. Deterministic (the arithmetic in `color.ts`, a fixed role order, an integer lightness
 * grid) and pure: the same brand and base palette give the same values in every engine.
 *
 * The rules it follows:
 * - a brand colour that passes is kept exactly; one that fails moves only in lightness (and chroma, to stay in sRGB),
 *   never in hue, as far as it must;
 * - dark modes first lift a brand colour to an anchor lightness (OKLCH L 0.78), then take the nearest passing shade;
 * - `info` and the status colours keep LibKa's own hues, so a red brand never looks like an error;
 * - a button keeps the brand fill when a label (white or the dark ink) passes on it; otherwise the fill moves;
 * - the opt-in neutral tint gives the greys of the standard modes the primary's hue at a small fixed chroma; the
 *   high-contrast modes keep near-black and near-white;
 * - LibKa's own brand is pinned: its palette is the tokens', verified and never moved.
 *
 * The solver returns structure (each role's seed, value, ratio and reason), never prose: the CLI and the Studio
 * put it into words.
 */
import { atLightness, chroma, contrast, hexToLab, hexToRgb, hueOf, luminance, type Hex } from './color.ts';
import { MARGIN, gate, gateMode, thresholds, type Check, type GateResult } from './gates.ts';
import {
  DEFAULT, MODES, alphaText, isDark, isHighContrast, parseColor, rgba, standardOf, type Mode, type Palette, type PaletteValues,
} from './palette-model.ts';
import type { Brand } from './brand.ts';

export const SOLVER_ID = 'libka-solver/1';
/** The OKLCH lightness a brand colour is lifted to in the dark modes before the search, so dark pages get a bright accent. */
export const DARK_ANCHOR = 0.78;
/** The chroma of a tinted grey. */
export const NEUTRAL_CHROMA = 0.012;
/** A base colour with less chroma than this counts as a grey for the tint. */
export const NEUTRAL_MAX_CHROMA = 0.04;
/** How far a button's hover moves from its fill, in OKLCH lightness. */
export const HOVER_STEP = 0.06;

/**
 * Why a role has its value: `kept` the brand colour as given; `moved` a shade at the brand's hue that passes;
 * `lifted` the brand colour lifted to the dark anchor (and moved further if needed); `label` a button kept the brand
 * fill by taking the other label colour; `fill-moved` no label passed on the brand fill, so the fill moved;
 * `tinted` a grey took the brand's hue; `fallback` no shade at the hue passed, so black or white is used.
 */
export type Reason = 'kept' | 'moved' | 'lifted' | 'label' | 'fill-moved' | 'tinted' | 'fallback';

export interface RoleResult {
  readonly mode: Mode;
  readonly key: string;
  /** The colour the role started from (the brand colour, or the grey before the tint). */
  readonly seed: Hex;
  readonly value: Hex;
  readonly reason: Reason;
  /** The lowest ratio among the role's checks, and the threshold of that check. */
  readonly ratio: number;
  readonly need: number;
}

export interface Solution {
  readonly values: PaletteValues;
  readonly roles: readonly RoleResult[];
  readonly gates: GateResult;
  readonly pinned: boolean;
}

type Values = Record<string, string>;

/** The colour a tint entry (`rgb(… / .12)`) is made of, by its name: badges and cards by status, the rest by accent. */
function tintSourceKey(key: string): string {
  const m = /\.(info|ai|success|warning|error)\./.exec(`${key}.`);
  return m ? `semantic.status.${m[1]}` : 'semantic.action.accent';
}

interface Derived { readonly key: string; readonly mode: Mode; readonly source: string; readonly alpha: string }

/** For one mode, the tint entries that are a semantic colour of this mode (or of its standard mode) at an alpha. */
function derivations(base: Palette, mode: Mode): Derived[] {
  const out: Derived[] = [];
  for (const [key, value] of Object.entries(base.values[mode])) {
    const alpha = alphaText(value);
    const c = parseColor(value);
    if (!alpha || !c) continue;
    const source = tintSourceKey(key);
    for (const m of [mode, standardOf(mode)]) {
      const s = base.values[m][source];
      const rgb = s ? hexToRgb(s) : null;
      if (rgb && rgb.every((x, i) => x === c.rgb[i])) { out.push({ key, mode: m, source, alpha }); break; }
    }
  }
  return out;
}

class ModeSolver {
  readonly mode: Mode;
  readonly base: Palette;
  readonly v: Values;
  readonly fixed = new Set<string>();
  readonly roles: RoleResult[] = [];
  private readonly solved: Partial<Record<Mode, Values>>;
  private readonly refs: Readonly<Record<string, string>>;
  private readonly derived: Derived[];

  constructor(mode: Mode, base: Palette, solved: Partial<Record<Mode, Values>>) {
    this.mode = mode;
    this.base = base;
    this.solved = solved;
    this.v = { ...base.values[mode] };
    this.refs = base.refs[mode];
    this.derived = derivations(base, mode);
  }

  /** Aliased values follow their target, tints follow their colour. */
  settle(): void {
    for (let pass = 0; pass < 10; pass++) {
      let changed = false;
      for (const [k, t] of Object.entries(this.refs)) {
        if (this.fixed.has(k) || this.v[t] === undefined || this.v[k] === this.v[t]) continue;
        this.v[k] = this.v[t]!;
        changed = true;
      }
      if (!changed) break;
    }
    for (const d of this.derived) {
      const from = d.mode === this.mode ? this.v : this.solved[d.mode];
      const hex = from?.[d.source];
      if (hex && hex !== this.base.values[d.mode][d.source]) this.v[d.key] = rgba(hexToRgb(hex), d.alpha);
    }
  }

  private set(key: string, hex: Hex, copies: readonly string[]): void {
    this.v[key] = hex;
    for (const c of copies) { this.v[c] = hex; this.fixed.add(c); }
    this.settle();
  }

  checksOf(keys: readonly string[]): Check[] {
    return gateMode(this.mode, this.v, (fg) => keys.includes(fg));
  }

  private record(key: string, seed: Hex, value: Hex, reason: Reason, checks: readonly Check[]): void {
    const worst = checks.reduce<Check | undefined>((w, c) => (!w || c.ratio - c.need < w.ratio - w.need ? c : w), undefined);
    this.roles.push({ mode: this.mode, key, seed, value, reason, ratio: worst?.ratio ?? 0, need: worst?.need ?? 0 });
  }

  /**
   * Give `key` (and its `copies`) the first colour at the seed's hue, stepping lightness by 0.001 in `direction`,
   * whose checks all pass. With an `anchor`, a seed darker than it starts at the anchor.
   */
  search(key: string, seed: Hex, direction: 1 | -1, opts: { copies?: readonly string[]; anchor?: number; seedReason?: Reason } = {}): Hex {
    const copies = opts.copies ?? [];
    const keys = [key, ...copies];
    const lab = hexToLab(seed);
    const hue = hueOf(lab), c0 = chroma(lab);
    let k = Math.round(lab.L * 1000);
    let lifted = false;
    if (opts.anchor !== undefined && lab.L < opts.anchor) { k = Math.round(opts.anchor * 1000); lifted = true; }
    else {
      this.set(key, seed, copies);
      const checks = this.checksOf(keys);
      if (checks.every((c) => c.pass)) { this.record(key, seed, seed, opts.seedReason ?? 'kept', checks); return seed; }
    }
    let last = '';
    for (; k >= 0 && k <= 1000; k += direction) {
      const hex = atLightness(k / 1000, hue, c0);
      if (hex === last) continue;
      last = hex;
      this.set(key, hex, copies);
      const checks = this.checksOf(keys);
      if (checks.every((c) => c.pass)) { this.record(key, seed, hex, lifted ? 'lifted' : 'moved', checks); return hex; }
    }
    const end: Hex = direction > 0 ? '#FFFFFF' : '#000000';
    this.set(key, end, copies);
    this.record(key, seed, end, 'fallback', this.checksOf(keys));
    return end;
  }

  /** A button's fill, hover and label (decision 4: keep the brand fill if a label passes on it). */
  button(variant: 'accent' | 'iris', seed: Hex, labelKey: string): void {
    const bgKey = `component.button.${variant}.background`, hoverKey = `component.button.${variant}.hover.background`;
    const textKey = `component.button.${variant}.text`;
    const need = thresholds(this.mode).text + MARGIN;
    const passes = (fg: string, bg: string) => contrast(fg, bg) >= need;
    const ink = this.darkInk();
    const baseLabel = this.base.values[this.mode][labelKey] as Hex;
    const labels = [...new Set<Hex>([baseLabel, '#FFFFFF', ink])];

    let fill = seed, label: Hex | undefined = labels.find((l) => passes(l, seed));
    let reason: Reason = label === undefined ? 'fill-moved' : label === baseLabel ? 'kept' : 'label';
    if (label === undefined) {
      // move the fill towards the mode's usual label: darker under white on light pages, lighter under the ink on dark
      label = isDark(this.mode) ? ink : '#FFFFFF';
      const lab = hexToLab(seed), hue = hueOf(lab), c0 = chroma(lab);
      const dir = isDark(this.mode) ? 1 : -1;
      fill = dir > 0 ? '#FFFFFF' : '#000000';
      for (let k = Math.round(lab.L * 1000); k >= 0 && k <= 1000; k += dir) {
        const hex = atLightness(k / 1000, hue, c0);
        if (passes(label, hex)) { fill = hex; break; }
      }
      if (!passes(label, fill)) reason = 'fallback';
    }
    const hover = this.hover(fill, label, passes);
    for (const k of [bgKey, hoverKey, textKey]) this.fixed.add(k);
    this.v[bgKey] = fill;
    this.v[hoverKey] = hover;
    this.v[labelKey] = label;
    this.v[textKey] = label;
    this.settle();
    this.record(bgKey, seed, fill, reason, this.checksOf([textKey]));
  }

  /** The hover: the fill moved by HOVER_STEP away from its label (darker under a light label), and further if needed. */
  private hover(fill: Hex, label: Hex, passes: (fg: string, bg: string) => boolean): Hex {
    const lab = hexToLab(fill), hue = hueOf(lab), c0 = chroma(lab);
    const dir = luminance(hexToRgb(label)) > luminance(hexToRgb(fill)) ? -1 : 1;
    for (let k = Math.round((lab.L + dir * HOVER_STEP) * 1000); k >= 0 && k <= 1000; k += dir) {
      const hex = atLightness(k / 1000, hue, c0);
      if (hex !== fill && passes(label, hex)) return hex;
    }
    return dir > 0 ? '#FFFFFF' : '#000000';
  }

  /** The darkest of the mode's ink colours: the label of a light fill. */
  private darkInk(): Hex {
    const candidates = ['semantic.text.primary', 'semantic.action.primary', 'semantic.bg.canvas']
      .map((k) => this.base.values[this.mode][k]).filter((x): x is Hex => !!x && /^#[0-9A-F]{6}$/.test(x));
    return candidates.reduce((a, b) => (luminance(hexToRgb(b)) < luminance(hexToRgb(a)) ? b : a));
  }

  /** The opt-in tint: every grey of the base takes `hue` at NEUTRAL_CHROMA, at its own lightness. */
  tint(seed: Hex): void {
    const hue = hueOf(hexToLab(seed));
    if (!hue) return;   // a grey brand has no hue to give
    const tinted: string[] = [];
    for (const [key, value] of Object.entries(this.base.values[this.mode])) {
      if (this.refs[key] || !/^#[0-9A-F]{6}$/.test(value)) continue;
      const lab = hexToLab(value);
      if (chroma(lab) >= NEUTRAL_MAX_CHROMA) continue;
      const hex = atLightness(lab.L, hue, NEUTRAL_CHROMA);
      this.v[key] = hex;
      if (hex !== value) tinted.push(key);
    }
    this.settle();
    // a tinted text or control colour that no longer passes moves in lightness, away from what it stands on
    const failing = [...new Set(this.checksOf(tinted).filter((c) => !c.pass).map((c) => c.fg))];
    for (const key of tinted) {
      if (failing.includes(key)) {
        const fail = this.checksOf([key]).find((c) => !c.pass)!;
        const dir = luminance(hexToRgb(this.v[key]!)) >= luminance(fail.bg) ? 1 : -1;
        this.fixed.add(key);
        this.search(key, this.v[key] as Hex, dir, { seedReason: 'tinted' });
      } else if (key.startsWith('semantic.')) {
        this.record(key, this.base.values[this.mode][key] as Hex, this.v[key] as Hex, 'tinted', this.checksOf([key]));
      }
    }
  }

  /**
   * The accent family from the primary colour; links and accent text from the link colour when the brand gives one
   * (a primary colour too light for text, such as a yellow, can leave them to a darker brand colour).
   */
  accent(primary: Hex | undefined, link: Hex | undefined): void {
    const dir = isDark(this.mode) ? 1 : -1;
    const anchor = isDark(this.mode) ? { anchor: DARK_ANCHOR } : {};
    const ui = primary ? this.search('semantic.action.accent', primary, dir, anchor) : undefined;
    const text = link ?? primary;
    if (text) this.search('semantic.text.accent', text, dir, { ...anchor, copies: ['semantic.action.accent-strong'] });
    if (primary) this.button('accent', isDark(this.mode) ? ui! : primary, 'semantic.action.on-accent');
  }

  /** The AI family from the secondary colour. */
  ai(secondary: Hex): void {
    const dir = isDark(this.mode) ? 1 : -1;
    const anchor = isDark(this.mode) ? { anchor: DARK_ANCHOR } : {};
    const badge = this.refs['component.badge.ai.text'] ? [] : ['component.badge.ai.text'];
    const ui = this.search('semantic.status.ai', secondary, dir, { ...anchor, copies: ['semantic.action.iris'] });
    this.search('semantic.text.ai', secondary, dir, { ...anchor, copies: badge });
    this.button('iris', isDark(this.mode) ? ui : secondary, 'semantic.action.on-iris');
  }
}

/** Solve a brand against the base palette (LibKa's, by default). A pinned brand returns the base, verified. */
export function solve(brand: Brand, base: Palette = DEFAULT): Solution {
  if (brand.pinned) return { values: base.values, roles: [], gates: gate(base.values), pinned: true };
  const solved: Partial<Record<Mode, Values>> = {};
  const roles: RoleResult[] = [];
  for (const mode of MODES) {   // light and dark first: the high-contrast tints are made of their colours
    const s = new ModeSolver(mode, base, solved);
    if (brand.neutral === 'tinted' && brand.color.primary && !isHighContrast(mode)) s.tint(brand.color.primary);
    if (brand.color.primary || brand.color.link) s.accent(brand.color.primary, brand.color.link);
    if (brand.color.secondary) s.ai(brand.color.secondary);
    s.settle();
    solved[mode] = s.v;
    roles.push(...s.roles);
  }
  const values = solved as PaletteValues;
  return { values, roles, gates: gate(values), pinned: false };
}
