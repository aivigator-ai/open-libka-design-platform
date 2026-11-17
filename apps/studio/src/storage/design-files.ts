/**
 * The files a document's design is made of, as `libka build` finds them (packages/cli/src/design.ts): the brand file the
 * front matter names, else the project's `_brand.yml` beside the document or in a folder above it; the theme file the
 * front matter or the brand names; the brand's logos. Paths are relative to the document and may go above it
 * (`../_brand.yml`, a project's brand in a folder), unlike the files the document's blocks use.
 *
 * The brand parser (@libka/design, with its YAML reader) is passed in, never imported here: the Studio loads it only for
 * a document that has a theme or a brand (`needsDesign`), so its first load stays as it was.
 */
import type { LibkaDocument } from '@libka/model';
import type { Brand } from '@libka/design';
import { dirOf } from './paths.ts';

/** How far above the document a project's `_brand.yml` is looked for (a folder project's depth is at most 4). */
export const BRAND_LEVELS = 4;

/** `a/../b`, `./x`: a path relative to the document, normalized, keeping leading `..`; null for an absolute path or an address. */
export function relative(dir: string, path: string): string | null {
  if (/^([a-z][a-z\d+.-]*:|\/\/|\/)/i.test(path)) return null;
  const parts: string[] = [];
  for (const part of `${dir ? `${dir}/` : ''}${path}`.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue;
    if (part === '..' && parts.length && parts[parts.length - 1] !== '..') parts.pop();
    else parts.push(part);
  }
  return parts.length ? parts.join('/') : null;
}

/** Where a project's `_brand.yml` may be: beside the document, then each folder above it. */
export const brandCandidates = (): string[] => Array.from({ length: BRAND_LEVELS + 1 }, (_, i) => `${'../'.repeat(i)}_brand.yml`);

/** A theme file (a built-in theme is a name). */
const themeFile = (name: string) => /\.theme\.json$/i.test(name);

/** Whether a document is shown in anything but LibKa's default design: a theme, a brand named, or a project's brand file. */
export function needsDesign(doc: LibkaDocument, has: (path: string) => boolean): boolean {
  const { theme, brand } = doc.meta;
  if (theme && theme !== 'classic') return true;
  if (brand) return brand !== 'libka';
  return brandCandidates().some(has);
}

export type BrandParser = (text: string) => { brand: Brand | null };

export interface DesignSources {
  /** The brand file (relative to the document), when the document has one; absent for LibKa's brand. */
  brandPath?: string;
  /** Whether the front matter named it (else the project's, found by itself). */
  named: boolean;
  /** The brand file's text, parsed (only with a parser); null when it has errors. */
  brand?: Brand | null;
  themePath?: string;
  /** The logo files, relative to the document (only with a parser). */
  logos: string[];
}

/** The design's files for a document, given its files by path (`get` answers undefined for a file it does not have). */
export function designSources(doc: LibkaDocument, get: (path: string) => Uint8Array | undefined, parseBrand?: BrandParser): DesignSources {
  const named = doc.meta.brand;
  let brandPath: string | undefined;
  if (named && named !== 'libka') brandPath = relative('', named) ?? undefined;
  else if (!named) brandPath = brandCandidates().find((p) => get(p) !== undefined);
  const out: DesignSources = { named: !!named, logos: [], ...(brandPath ? { brandPath } : {}) };
  const bytes = brandPath ? get(brandPath) : undefined;
  if (bytes && parseBrand) {
    const { brand } = parseBrand(new TextDecoder().decode(bytes));
    out.brand = brand;
    const base = dirOf(brandPath!);
    for (const size of Object.values(brand?.logo ?? {})) {
      for (const l of [size?.light, size?.dark]) {
        const p = l ? relative(base, l.path) : null;
        if (p && !out.logos.includes(p)) out.logos.push(p);
      }
    }
    if (!doc.meta.theme && brand?.theme && themeFile(brand.theme)) {
      const p = relative(base, brand.theme);
      if (p) out.themePath = p;
    }
  }
  if (doc.meta.theme && themeFile(doc.meta.theme)) {
    const p = relative('', doc.meta.theme);
    if (p) out.themePath = p;
  }
  return out;
}

/** Every file of the design, relative to the document: the brand file, the theme file and the logos. */
export const designPaths = (s: DesignSources): string[] =>
  [...(s.brandPath ? [s.brandPath] : []), ...(s.themePath ? [s.themePath] : []), ...s.logos];

/** @libka/design's brand parser, loaded on first use. */
export const loadBrandParser = async (): Promise<BrandParser> => (await import('@libka/design')).parseBrand;
