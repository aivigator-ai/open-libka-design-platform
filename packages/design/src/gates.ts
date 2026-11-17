/**
 * The contrast gates, ported from `generate.py` (text, UI, control and focus, button and badge contrast), plus one
 * LibKa adds for designs: the brand-driven UI colours reach 3:1 (WCAG 1.4.11) in the standard modes too.
 *
 * A pair passes only when its ratio reaches the threshold plus `MARGIN`, so strictly more than the threshold, as
 * axe-core requires (`contrast > expected`), with room for the browser's rounding of composited tints. Tints are
 * composited per channel and read at the nearest 8-bit value, as the browser draws them (`generate.py` keeps the
 * fraction; the margin covers the difference).
 */
import { composite, contrast, type Rgb } from './color.ts';
import { MODES, isHighContrast, parseColor, type Mode, type ModeValues, type PaletteValues } from './palette-model.ts';

export const MARGIN = 0.05;
/** The 12% tint of its own colour that a coloured text role must also pass on (callouts, badges, selected rows). */
export const TINT_MAX = 0.12;
export const CONTROL_MIN = 3;

export interface Thresholds { readonly text: number; readonly ui: number }
/** Text 4.5:1 and UI 3:1 in the standard modes; text 7:1 and UI 4.5:1 in high contrast. */
export function thresholds(mode: Mode): Thresholds {
  return isHighContrast(mode) ? { text: 7, ui: 4.5 } : { text: 4.5, ui: 3 };
}

/** The colour whose 12% tint each coloured text role must pass on (`generate.py`'s TINT_SOURCE). */
export const TINT_SOURCE: Readonly<Record<string, string>> = {
  accent: 'semantic.action.accent', info: 'semantic.status.info', success: 'semantic.status.success',
  warning: 'semantic.status.warning', error: 'semantic.status.error', ai: 'semantic.status.ai',
};
/** The UI colours held to 4.5:1 in high contrast (`generate.py`'s UI_ROLES). */
export const UI_ROLES = ['border.default', 'border.strong', 'border.control', 'action.accent', 'action.iris', 'focus.ring',
  'status.success', 'status.warning', 'status.error', 'status.info', 'status.ai'].map((r) => `semantic.${r}`);
/** The UI colours a brand drives, held to 3:1 in the standard modes as well. */
export const BRAND_UI_ROLES = ['action.accent', 'action.accent-strong', 'action.iris', 'status.ai'].map((r) => `semantic.${r}`);

/** `brand-ui` is LibKa's addition for designs; the other kinds are `generate.py`'s checks. */
export type CheckKind = 'text' | 'ui' | 'control' | 'button' | 'badge' | 'brand-ui';

export interface Check {
  readonly mode: Mode;
  readonly kind: CheckKind;
  /** The key of the foreground colour. */
  readonly fg: string;
  /** What it was measured on, in words (`semantic.bg.surface`, `semantic.action.accent 12% on semantic.bg.canvas`). */
  readonly on: string;
  /** The colour it was measured on. */
  readonly bg: Rgb;
  readonly ratio: number;
  readonly need: number;
  readonly pass: boolean;
}

export interface GateResult {
  readonly checks: readonly Check[];
  readonly failures: readonly Check[];
}

function solid(values: ModeValues, key: string): Rgb {
  const c = parseColor(values[key] ?? '');
  if (!c || c.alpha !== 1) throw new Error(`${key} is not a solid colour: ${values[key]}`);
  return c.rgb;
}

/**
 * The gated pairs of one mode, optionally only those whose foreground `only` accepts (the solver measures the role
 * it moves). Throws when a value the gates need is missing or not a colour.
 */
export function gateMode(mode: Mode, v: ModeValues, only: (fg: string) => boolean = () => true): Check[] {
  const checks: Check[] = [];
  const add = (kind: CheckKind, fg: Rgb, fgKey: string, on: string, bg: Rgb, need: number) => {
    const ratio = contrast(fg, bg);
    checks.push({ mode, kind, fg: fgKey, on, bg, ratio, need, pass: ratio >= need + MARGIN });
  };
  const { text, ui } = thresholds(mode);
  const high = isHighContrast(mode);
  const keys = Object.keys(v);
  const bgs = keys.filter((k) => k.startsWith('semantic.bg.')).map((k) => [k, solid(v, k)] as const);

  // text roles on every background, and the coloured ones on a 12% tint of their own colour
  for (const key of keys.filter((k) => k.startsWith('semantic.text.') && only(k))) {
    const fg = solid(v, key);
    const source = TINT_SOURCE[key.slice('semantic.text.'.length)];
    for (const [bgKey, bg] of bgs) {
      add('text', fg, key, bgKey, bg, text);
      if (source) add('text', fg, key, `${source} ${TINT_MAX * 100}% on ${bgKey}`, composite(solid(v, source), bg, TINT_MAX), text);
    }
  }
  // UI colours in high contrast
  if (high) for (const key of UI_ROLES.filter(only)) for (const [bgKey, bg] of bgs) add('ui', solid(v, key), key, bgKey, bg, ui);
  // a control's boundary and the focus indicator: 3:1 in every mode (WCAG 1.4.11), 4.5:1 in high contrast
  for (const key of ['semantic.border.control', 'semantic.focus.ring'].filter(only))
    for (const [bgKey, bg] of bgs) add('control', solid(v, key), key, bgKey, bg, Math.max(CONTROL_MIN, high ? ui : 0));
  // button labels on their fill and their hover fill
  for (const key of keys.filter((k) => /^component\.button\.[^.]+\.text$/.test(k) && only(k))) {
    const base = key.slice(0, -'.text'.length);
    for (const fill of ['background', 'hover.background']) {
      const f = v[`${base}.${fill}`];
      const label = parseColor(v[key]!), bg = f === undefined ? null : parseColor(f);
      if (!label || !bg || label.alpha !== 1 || bg.alpha !== 1) continue;   // a ghost button is covered by the text checks
      add('button', label.rgb, key, `${base}.${fill}`, bg.rgb, text);
    }
  }
  // badge labels on their tinted fill over every background
  for (const key of keys.filter((k) => /^component\.badge\.[^.]+\.text$/.test(k) && only(k))) {
    const fill = parseColor(v[key.replace(/\.text$/, '.background')] ?? '');
    if (!fill) throw new Error(`${key}: its badge has no fill colour`);
    for (const [bgKey, bg] of bgs) add('badge', solid(v, key), key, `its fill over ${bgKey}`, composite(fill.rgb, bg, fill.alpha), text);
  }
  // the colours a brand drives, 3:1 in the standard modes (high contrast holds them to 4.5:1 above)
  if (!high) for (const key of BRAND_UI_ROLES.filter(only)) for (const [bgKey, bg] of bgs) add('brand-ui', solid(v, key), key, bgKey, bg, ui);
  return checks;
}

/** Every gated pair of every mode. */
export function gate(values: PaletteValues): GateResult {
  const checks = MODES.flatMap((mode) => gateMode(mode, values[mode]));
  return { checks, failures: checks.filter((c) => !c.pass) };
}

/** A check in words: "dark: semantic.text.accent #… on semantic.bg.surface = 4.21:1 (needs 4.5:1 plus 0.05)". */
export function describeCheck(c: Check, values?: PaletteValues): string {
  const value = values?.[c.mode][c.fg];
  return `${c.mode}: ${c.fg}${value ? ` ${value}` : ''} on ${c.on} = ${c.ratio.toFixed(2)}:1 (needs ${c.need}:1 plus ${MARGIN})`;
}
