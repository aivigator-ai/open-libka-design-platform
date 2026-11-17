/**
 * The Word theme of a design: the fonts as their Office fallbacks (Word has no fallback list), the light mode's
 * text, border and background colours, and the type scale. LibKa's default design gives `THEME` exactly, the theme
 * `generate.py` writes from the tokens.
 */
import type { ResolvedDesign } from '@libka/design';
import { THEME } from './theme.ts';

export interface WordTheme {
  readonly fonts: { readonly brand: string; readonly ui: string; readonly mono: string };
  readonly sizes: { readonly [K in keyof typeof THEME.sizes]: number };
  readonly families: { readonly [K in keyof typeof THEME.families]: 'brand' | 'ui' };
  readonly lineHeight: number;
  readonly colors: { readonly [K in keyof typeof THEME.colors]: string };
}

/** The Word theme of a design; omitted, LibKa's default design (`THEME`). */
export function docxTheme(resolved?: ResolvedDesign): WordTheme {
  if (!resolved || resolved.isDefault) return THEME;
  const { design } = resolved;
  // a large scale makes the reading sizes an eighth larger, as on the page; headings keep theirs
  const sizes = design.theme.scale === 'large' ? { ...THEME.sizes, body: 27, small: 24, caption: 21 } : THEME.sizes;
  const light = design.palette.light;
  const colors = Object.fromEntries(Object.keys(THEME.colors).map((key) => {
    const dash = key.indexOf('-');
    const value = light[`semantic.${key.slice(0, dash)}.${key.slice(dash + 1)}`];
    if (!value || !/^#[0-9A-F]{6}$/i.test(value)) throw new Error(`the design has no hex colour for ${key} (got ${value ?? 'none'})`);
    return [key, value.slice(1).toUpperCase()];
  })) as unknown as WordTheme['colors'];
  return {
    fonts: { brand: design.fonts.heading.office, ui: design.fonts.body.office, mono: design.fonts.mono.office },
    sizes, families: THEME.families, lineHeight: THEME.lineHeight, colors,
  };
}

/** The twelve colours of the Word file's theme (`word/theme/theme1.xml`), by slot. */
export type WordScheme = Readonly<Record<'dk1' | 'lt1' | 'dk2' | 'lt2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hlink' | 'folHlink', string>>;

/**
 * The Word theme's colour scheme: the design's passing text shades instead of Office's, so a colour picked from
 * Word's theme palette, a chart or SmartArt made in Word starts from colours that pass 4.5:1 on the page. The
 * styles themselves keep direct colours (never a theme reference), so a re-theme in Word cannot change the text.
 */
export function wordScheme(t: WordTheme): WordScheme {
  const c = t.colors;
  return {
    dk1: c['text-primary'], lt1: c['bg-surface'], dk2: c['text-secondary'], lt2: c['bg-elevated'],
    accent1: c['text-accent'], accent2: c['text-ai'], accent3: c['text-success'], accent4: c['text-warning'], accent5: c['text-error'], accent6: c['text-muted'],
    hlink: c['text-accent'], folHlink: c['text-ai'],
  };
}
