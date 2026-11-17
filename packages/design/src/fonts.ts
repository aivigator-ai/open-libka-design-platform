/**
 * The fonts a brand or a theme may name: open-licence families with Czech coverage that LibKa ships itself (no
 * font upload, no fetching at build time). Each declares the roles it may take and the Office font Word uses in its
 * place, since a Word file carries no font fallback list.
 */

export type FontRole = 'heading' | 'body' | 'mono';
/** The Office fonts every Word and LibreOffice install has (`generate.py`'s OFFICE_FONTS, without Segoe UI and Aptos). */
export type OfficeFont = 'Arial' | 'Calibri' | 'Cambria' | 'Consolas' | 'Courier New' | 'Georgia' | 'Times New Roman' | 'Verdana';

export interface Font {
  readonly id: string;
  /** The family name in CSS and in brand.yml. */
  readonly family: string;
  /** The CSS stack, exactly as the page writes it. */
  readonly css: string;
  readonly roles: readonly FontRole[];
  readonly office: OfficeFont;
  readonly licence: 'OFL-1.1';
  /** Whether it has a real italic (else the browser slants the upright). */
  readonly italic: boolean;
  /** Its files in LibKa's `fonts/` (variable WOFF2, Latin and Latin Extended), the italic's included. */
  readonly files: readonly string[];
}

const font = (id: string, family: string, css: string, roles: FontRole[], office: OfficeFont, italic: boolean): Font => ({
  id, family, css, roles, office, licence: 'OFL-1.1', italic,
  files: [`${id}-latin-ext.woff2`, `${id}-latin.woff2`, ...(italic ? [`${id}-italic-latin-ext.woff2`, `${id}-italic-latin.woff2`] : [])],
});

/**
 * LibKa's font list, every family in `fonts/` (Fontsource 5.3.0, the `wght` axis; Fraunces with `opsz`). Fraunces,
 * Inter and JetBrains Mono are today's, with today's stacks (the golden test). The body families have real italics;
 * the heading-only ones and the code font do not. Space Grotesk has no italic and draws I and l alike, so it takes
 * headings only. Source Serif 4, Source Sans 3 and IBM Plex Sans are not on the list: their licences reserve the
 * font names, and LibKa subsets the fonts it ships.
 */
export const FONTS: readonly Font[] = [
  font('fraunces', 'Fraunces', '"Fraunces", "Instrument Serif", Georgia, serif', ['heading'], 'Georgia', false),
  font('inter', 'Inter', '"Inter", "Manrope", system-ui, sans-serif', ['heading', 'body'], 'Arial', true),
  font('jetbrains-mono', 'JetBrains Mono', '"JetBrains Mono", Consolas, monospace', ['mono'], 'Consolas', false),
  font('literata', 'Literata', '"Literata", Georgia, serif', ['heading', 'body'], 'Georgia', true),
  font('bitter', 'Bitter', '"Bitter", Georgia, serif', ['heading', 'body'], 'Georgia', true),
  font('space-grotesk', 'Space Grotesk', '"Space Grotesk", "Inter", system-ui, sans-serif', ['heading'], 'Arial', false),
  font('atkinson-hyperlegible-next', 'Atkinson Hyperlegible Next', '"Atkinson Hyperlegible Next", system-ui, sans-serif', ['heading', 'body'], 'Arial', true),
  font('public-sans', 'Public Sans', '"Public Sans", system-ui, sans-serif', ['heading', 'body'], 'Arial', true),
];

export function fontById(id: string): Font | undefined {
  return FONTS.find((f) => f.id === id);
}

/** A font by its family name as brand.yml writes it (any case, surrounding quotes and spaces ignored). */
export function fontByFamily(family: string): Font | undefined {
  const name = family.trim().replace(/^["']|["']$/g, '').toLowerCase();
  return FONTS.find((f) => f.family.toLowerCase() === name);
}

/** The files of these fonts, once each, in the order of LibKa's list. */
export function fontFiles(fonts: readonly Font[]): string[] {
  return FONTS.filter((f) => fonts.some((g) => g.id === f.id)).flatMap((f) => f.files);
}
