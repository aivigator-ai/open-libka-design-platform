/**
 * A palette: for each of LibKa's four modes, every colour the gates read, keyed as in the tokens without `color.`
 * (`semantic.text.accent`, `component.button.accent.background`), with the value as the CSS writes it: `#RRGGBB`,
 * `rgb(r g b / alpha)` or `transparent`.
 */
import { DEFAULT_PALETTE } from './palette.ts';
import { hexToRgb, type Rgb } from './color.ts';

export const MODES = ['light', 'dark', 'light-high-contrast', 'dark-high-contrast'] as const;
export type Mode = (typeof MODES)[number];

export type ModeValues = Readonly<Record<string, string>>;
export type PaletteValues = Readonly<Record<Mode, ModeValues>>;
/** For each mode, the key each aliased value comes from (`component.button.accent.text` → `semantic.action.on-accent`). */
export type PaletteRefs = Readonly<Record<Mode, Readonly<Record<string, string>>>>;

export interface Palette {
  readonly values: PaletteValues;
  readonly refs: PaletteRefs;
}

/** LibKa's default palette, generated from the DTCG tokens by `generate.py`. */
export const DEFAULT: Palette = DEFAULT_PALETTE as unknown as Palette;

export const isHighContrast = (mode: Mode): boolean => mode.endsWith('high-contrast');
export const isDark = (mode: Mode): boolean => mode.startsWith('dark');
/** The standard mode a high-contrast mode is stacked on (itself for a standard mode). */
export const standardOf = (mode: Mode): Mode => (isDark(mode) ? 'dark' : 'light');

/** A colour value as channels and an alpha (1 for a hex); null for `transparent` or anything that is not one colour. */
export function parseColor(value: string): { rgb: Rgb; alpha: number } | null {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return { rgb: hexToRgb(v), alpha: 1 };
  const m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(v);
  if (!m) return null;
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

/** `rgb(r g b / alpha)` with the alpha written as given (`.12`), as the token build writes a tint. */
export function rgba(rgb: Rgb, alpha: string): string {
  return `rgb(${rgb.map((c) => Math.round(c)).join(' ')} / ${alpha})`;
}

/** The alpha of an `rgb(… / alpha)` value exactly as written, or null. */
export function alphaText(value: string): string | null {
  return /\/\s*([\d.]+)\s*\)$/.exec(value)?.[1] ?? null;
}
