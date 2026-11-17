/**
 * The design a document is built with: its brand and theme, from the front matter (`brand:`, `theme:`), else the
 * project's `_brand.yml` (next to the document or above it, up to the project's root) and its `defaults.libka.theme`,
 * else LibKa's brand and the Classic theme. The files are read here; @libka/design validates and solves them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  builtinTheme, DEFAULT_THEME_ID, designWords, LIBKA_BRAND, lockName, lockMatches, parseBrand, parseTheme, readLock, resolveDesign,
  type Brand, type DesignProblem, type ResolvedDesign, type Theme,
} from '@libka/design';
import type { LibkaDocument } from '@libka/model';
import type { DesignLogo } from '@libka/render';
import { projectRoot } from './assets.ts';

/** The project's brand file, found by name. */
export const PROJECT_BRAND = '_brand.yml';

export interface DesignIssue { readonly code: string; readonly message: string }

export interface DesignChoice {
  /** Null when a file has errors: the build stops with `problems`. */
  readonly design: ResolvedDesign | null;
  readonly logo?: DesignLogo;
  /** The brand file and the theme file read, when there were files. */
  readonly brandFile?: string;
  readonly themeFile?: string;
  /** Errors, each with its code (docs/problem-codes.md): each stops the build. */
  readonly problems: DesignIssue[];
  /** Warnings and notes about the files, the solver's result in words, a lock written. */
  readonly notes: string[];
}

const posix = (p: string) => p.split('\\').join('/');

/** A file problem as a line: the file, then the message (with its key path when the message does not name it). */
function line(file: string, p: DesignProblem): string {
  return `${file}: ${p.path && !p.message.includes(p.path) ? `${p.path}: ` : ''}${p.message}`;
}

/** The project's `_brand.yml`: in the document's folder or above it, up to the project's root. */
export function findProjectBrand(source: string): string | undefined {
  const root = resolve(projectRoot(source));
  for (let d = resolve(dirname(source)); ; d = dirname(d)) {
    const f = join(d, PROJECT_BRAND);
    if (existsSync(f)) return f;
    if (d === root || dirname(d) === d || !d.startsWith(root)) return undefined;
  }
}

/** A logo file as a `data:` URL, so the output stays one file. */
function dataUrl(file: string): string {
  const type = extname(file).toLowerCase() === '.svg' ? 'image/svg+xml' : 'image/png';
  return `data:${type};base64,${readFileSync(file).toString('base64')}`;
}

/**
 * The design for a document at `source`. `show` turns a path into what messages print (relative to the working
 * folder). `writeLock` writes the design's lock next to a brand file when it is missing or stale.
 */
export function chooseDesign(source: string, doc: LibkaDocument, options: { show?: (path: string) => string; writeLock?: boolean } = {}): DesignChoice {
  const show = options.show ?? ((p: string) => posix(relative(process.cwd(), p)) || p);
  const problems: DesignIssue[] = [];
  const notes: string[] = [];
  const here = dirname(resolve(source));
  // a file the front matter names stays inside the project, so a project builds the same wherever it is copied
  const root = resolve(projectRoot(source));
  const inside = (f: string) => { const r = relative(root, f); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };

  // the brand
  let brand: Brand = LIBKA_BRAND;
  let brandFile: string | undefined;
  const named = doc.meta.brand;
  if (named && named !== 'libka') {
    brandFile = resolve(here, named);
    if (!inside(brandFile)) problems.push({ code: 'brand-unknown', message: `${show(source)}: the brand file ${named} is outside the project (${show(root) || '.'}); keep it in the project` });
    else if (!existsSync(brandFile)) problems.push({ code: 'brand-unknown', message: `${show(source)}: the brand file ${named} was not found (the path is relative to the document)` });
  } else if (!named) brandFile = findProjectBrand(source);
  if (brandFile && existsSync(brandFile)) {
    const r = parseBrand(readFileSync(brandFile, 'utf8'));
    for (const p of r.problems) if (p.severity === 'error') problems.push({ code: p.code, message: line(show(brandFile), p) }); else notes.push(line(show(brandFile), p));
    if (r.brand) brand = r.brand;
  }

  // the theme: the document's, else the brand's, else Classic
  let theme: Theme = builtinTheme(DEFAULT_THEME_ID)!;
  let themeFile: string | undefined;
  const themeName = doc.meta.theme ?? (brand.theme && brandFile ? brand.theme : undefined);
  const themeBase = doc.meta.theme ? here : brandFile ? dirname(brandFile) : here;
  if (themeName) {
    const builtin = builtinTheme(themeName);
    if (builtin) theme = builtin;
    else {
      themeFile = resolve(themeBase, themeName);
      if (!inside(themeFile)) problems.push({ code: 'theme-unknown', message: `${show(doc.meta.theme ? source : brandFile!)}: the theme file ${themeName} is outside the project (${show(root) || '.'}); keep it in the project` });
      else if (!existsSync(themeFile)) problems.push({ code: 'theme-unknown', message: `${show(doc.meta.theme ? source : brandFile!)}: the theme file ${themeName} was not found (the path is relative to the ${doc.meta.theme ? 'document' : 'brand file'})` });
      else {
        const r = parseTheme(readFileSync(themeFile, 'utf8'));
        for (const p of r.problems) if (p.severity === 'error') problems.push({ code: p.code, message: line(show(themeFile), p) }); else notes.push(line(show(themeFile), p));
        if (r.theme) theme = r.theme;
      }
    }
  }
  if (problems.length) return { design: null, problems, notes, ...(brandFile ? { brandFile } : {}), ...(themeFile ? { themeFile } : {}) };

  let design: ResolvedDesign;
  try {
    design = resolveDesign(brand, theme);
  } catch (e) {
    return { design: null, problems: [{ code: 'brand-color', message: `${show(brandFile ?? source)}: the design cannot be built: ${(e as Error).message}` }], notes };
  }
  // which design, and where each part came from, before what the solver did with it
  if (brandFile || doc.meta.theme) {
    const from = doc.meta.theme ? 'the front matter' : brand.theme && brandFile ? `defaults.libka.theme in ${show(brandFile)}` : 'the default';
    notes.push(`${show(source)}: the design is ${brandFile ? `the brand in ${show(brandFile)}${named ? '' : ' (the project\'s, found by itself)'}` : 'LibKa\'s brand'} with the ${theme.name.en} theme (from ${from})`);
  }
  notes.push(...designWords(design.design).map((w) => `${show(brandFile ?? source)}: ${w}`));

  // the lock, next to the brand file: a record to commit with it, rewritten when the brand, theme or solver changed
  if (brandFile && options.writeLock !== false) {
    const lockFile = join(dirname(brandFile), lockName(brand.id ?? 'brand', theme.id));
    const old = existsSync(lockFile) ? readFileSync(lockFile, 'utf8') : undefined;
    if (old !== design.lock) {
      const prior = old === undefined ? null : readLock(old);
      writeFileSync(lockFile, design.lock);
      notes.push(`${show(lockFile)}: ${old === undefined ? `wrote the design's lock; commit it with the brand file${brand.id ? '' : ' (give the brand an id, defaults.libka.id, to name the lock and the manifests\' record after it)'}`
        : prior && lockMatches(prior, design.design.inputs) ? 'wrote the design\'s lock again' : 'the brand, the theme or LibKa\'s solver changed, so the design was solved again and its lock rewritten; commit it'}`);
    }
  }

  // the logo: the medium one, else the small, else the large
  let logo: DesignLogo | undefined;
  const sizes = brand.logo;
  const pick = sizes ? sizes.medium ?? sizes.small ?? sizes.large : undefined;
  if (pick && brandFile) {
    const light = resolve(dirname(brandFile), pick.light.path);
    const dark = pick.dark ? resolve(dirname(brandFile), pick.dark.path) : undefined;
    for (const f of [light, dark]) if (f && !existsSync(f)) problems.push({ code: 'brand-logo', message: `${show(brandFile)}: the logo ${posix(relative(dirname(brandFile), f))} was not found` });
    if (problems.length) return { design: null, problems, notes, brandFile, ...(themeFile ? { themeFile } : {}) };
    logo = { src: dataUrl(light), alt: pick.light.alt, ...(dark ? { darkSrc: dataUrl(dark) } : {}) };
    notes.push(`${show(brandFile)}: the logo ${pick.light.path} (alt text "${pick.light.alt}") goes above the title of the page and the PDF, on the title slide and above the title in Word${pick.dark ? `; ${pick.dark.path} in the dark modes` : ''}`);
  }
  return { design, ...(logo ? { logo } : {}), problems, notes, ...(brandFile ? { brandFile } : {}), ...(themeFile ? { themeFile } : {}) };
}
