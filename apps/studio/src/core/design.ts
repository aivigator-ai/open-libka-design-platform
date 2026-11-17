/**
 * The design a document is shown in, chosen as `libka build` chooses it (packages/cli/src/design.ts): the front matter's
 * `brand:` and `theme:`, else the project's `_brand.yml` and the theme it names, else LibKa's brand and Classic. The
 * files come from the document's own (`s.files`); a brand or theme file with errors leaves the preview in LibKa's design
 * and the errors in Checks, as the build stops on them.
 */
import type { Hint, LibkaDocument, Problem } from '@libka/model';
import {
  builtinTheme, DEFAULT_THEME_ID, designWords, LIBKA_BRAND, parseBrand, parseTheme, resolveDesign,
  type Brand, type DesignProblem, type ResolvedDesign, type Theme,
} from '@libka/design';
import type { DesignLogo } from '@libka/render';
import { designSources, relative } from '../storage/design-files.ts';
import { dirOf } from '../storage/paths.ts';

export interface StudioDesign {
  /** The resolved design; absent for LibKa's default (the renderers' own styles). */
  readonly design?: ResolvedDesign;
  readonly logo?: DesignLogo;
  readonly brandPath?: string;
  /** Whether the front matter names the brand (else the project's, found by itself). */
  readonly named: boolean;
  readonly theme: Theme;
  /** Where the theme came from. */
  readonly themeFrom: 'front matter' | 'brand' | 'default';
  readonly themePath?: string;
  /** Errors in the brand or theme file, or a file missing: in Checks, on the front matter's line. */
  readonly problems: Problem[];
  /** The files' warnings: advice under Checks. */
  readonly hints: Hint[];
  /** The files' notes and the solver's result in words: the Design tab. */
  readonly notes: string[];
}

type FileLookup = (path: string) => { data: Uint8Array; type: string } | undefined;
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const said = (file: string, p: DesignProblem) => `${file}: ${p.path && !p.message.includes(p.path) ? `${p.path}: ` : ''}${p.message}`;

/** A file as a data URL (a logo goes into the page itself, as the build puts it). */
function dataUrl(f: { data: Uint8Array; type: string }): string {
  let bin = '';
  for (let i = 0; i < f.data.length; i += 0x8000) bin += String.fromCharCode(...f.data.subarray(i, i + 0x8000));
  return `data:${f.type};base64,${btoa(bin)}`;
}

/** The same brand and theme solve once: the solver takes milliseconds, the preview renders on every pause in typing. */
let cached: { key: string; design: ResolvedDesign } | null = null;

export function chooseDesign(doc: LibkaDocument, text: string, file: FileLookup, lang: 'en' | 'cs' = 'en'): StudioDesign {
  const lineOf = (key: string) => { const at = text.split('\n').findIndex((l) => new RegExp(`^${key}\\s*:`).test(l)); return at >= 0 ? at + 1 : 1; };
  const problems: Problem[] = [];
  const hints: Hint[] = [];
  const notes: string[] = [];
  const sources = designSources(doc, (p) => file(p)?.data, parseBrand);
  const { brandPath, named } = sources;

  // the brand
  let brand: Brand = LIBKA_BRAND;
  let brandText = '';
  if (brandPath) {
    const f = file(brandPath);
    if (!f) {
      if (named) problems.push({ line: lineOf('brand'), code: 'brand-unknown', message: `the brand file ${brandPath} is not among the document's files: add it (and its logo) to the document, or open the folder it is in` });
    } else {
      brandText = decode(f.data);
      const r = parseBrand(brandText);
      for (const p of r.problems) {
        if (p.severity === 'error') problems.push({ line: lineOf('brand'), code: p.code, message: said(brandPath, p) });
        else if (p.severity === 'warning') hints.push({ line: lineOf('brand'), message: said(brandPath, p) });
        else notes.push(said(brandPath, p));
      }
      if (r.brand) brand = r.brand;
    }
  }

  // the theme: the front matter's, else the brand's, else Classic
  let theme: Theme = builtinTheme(DEFAULT_THEME_ID)!;
  let themeFrom: StudioDesign['themeFrom'] = 'default';
  let themeText = '';
  const themeName = doc.meta.theme ?? (brand.theme && brandPath ? brand.theme : undefined);
  if (themeName) {
    themeFrom = doc.meta.theme ? 'front matter' : 'brand';
    const builtin = builtinTheme(themeName);
    if (builtin) theme = builtin;
    else if (sources.themePath) {
      const f = file(sources.themePath);
      if (!f) problems.push({ line: lineOf(doc.meta.theme ? 'theme' : 'brand'), code: 'theme-unknown', message: `the theme file ${sources.themePath} is not among the document's files` });
      else {
        themeText = decode(f.data);
        const r = parseTheme(themeText);
        for (const p of r.problems) {
          if (p.severity === 'error') problems.push({ line: lineOf('theme'), code: p.code, message: said(sources.themePath, p) });
          else hints.push({ line: lineOf('theme'), message: said(sources.themePath, p) });
        }
        if (r.theme) theme = r.theme;
      }
    }
  }
  const base = { named, theme, themeFrom, ...(brandPath ? { brandPath } : {}), ...(sources.themePath ? { themePath: sources.themePath } : {}) };
  if (problems.length) return { ...base, problems, hints, notes };

  // solved, once per brand and theme
  const key = `${brandText}\u0000${theme.id}\u0000${themeText}`;
  let design: ResolvedDesign;
  try {
    design = cached?.key === key ? cached.design : resolveDesign(brand, theme);
  } catch (e) {
    return { ...base, problems: [{ line: lineOf('brand'), code: 'brand-color', message: `${brandPath ?? 'the brand'}: the design cannot be built: ${(e as Error).message}` }], hints, notes };
  }
  cached = { key, design };
  notes.push(...designWords(design.design, lang));

  // the logo: the medium one, else the small, else the large; files beside the brand file
  let logo: DesignLogo | undefined;
  const pick = brand.logo ? brand.logo.medium ?? brand.logo.small ?? brand.logo.large : undefined;
  if (pick && brandPath) {
    const at = (p: string) => relative(dirOf(brandPath), p) ?? undefined;
    const light = at(pick.light.path), dark = pick.dark ? at(pick.dark.path) : undefined;
    const lf = light ? file(light) : undefined, df = dark ? file(dark) : undefined;
    for (const [p, f] of [[pick.light.path, lf], ...(pick.dark ? [[pick.dark.path, df] as const] : [])] as const) {
      if (!f) problems.push({ line: lineOf('brand'), code: 'brand-logo', message: `${brandPath}: the logo ${p} is not among the document's files` });
    }
    if (problems.length) return { ...base, problems, hints, notes };
    logo = { src: dataUrl(lf!), alt: pick.light.alt, ...(df ? { darkSrc: dataUrl(df) } : {}) };
  }
  return { ...base, ...(design.isDefault ? {} : { design }), ...(logo ? { logo } : {}), problems, hints, notes };
}

