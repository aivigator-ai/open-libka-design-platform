/**
 * Where LibKa finds the files it ships with, and the project a document belongs to.
 *
 * In the repository the files are where they are made (the token CSS at the root, the block CSS in
 * packages/render, the fonts in fonts/). In the npm package (@libka/cli, built by npm/build.mts) the code is
 * bundled into dist/ and the files are copied into assets/ beside it, under the names in ASSETS.
 *
 * A project is the folder that holds a document's .libka/ (its signing key and, once trusted, its key list):
 * the nearest folder above the document with .libka/, else the nearest with package.json or .git, else the
 * document's own folder. The search never reaches the home folder (other tools keep a ~/.libka of their own),
 * and a signed build of a document directly in the home folder is refused (isHomeOrAbove). A new key comes with
 * .libka/.gitignore, so it stays out of git wherever the project is.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** True when running from the npm package (dist/ beside assets/), false in the repository. */
export const PACKAGED = basename(HERE) === 'dist' && existsSync(join(HERE, '..', 'assets'));

/** The repository root, or the package's folder. */
export const ROOT = PACKAGED ? resolve(HERE, '..') : resolve(HERE, '..', '..', '..');

const require = createRequire(import.meta.url);

/** Each shipped file: its place in the package (under assets/) and in the repository. */
export const ASSETS = {
  'libka-tokens.css': 'libka-tokens.css',
  'lk-bridge.css': 'lk-bridge.css',
  'components.css': 'packages/render/src/components.css',
  'manual.css': 'packages/render/src/manual.css',
  'deck.css': 'packages/render/src/deck.css',
  'fonts': 'fonts',
  'trusted-keys.json': 'governance/trusted-keys.json',
  'studio': 'apps/studio/dist',
} as const;

export type AssetName = keyof typeof ASSETS | 'mermaid.min.js';

/** The path of a shipped file. */
export function asset(name: AssetName): string {
  if (name === 'mermaid.min.js') return PACKAGED ? join(ROOT, 'assets', 'vendor', 'mermaid', 'mermaid.min.js') : require.resolve('mermaid/dist/mermaid.min.js');
  return join(ROOT, PACKAGED ? join('assets', name) : ASSETS[name]);
}

export const readAsset = (name: AssetName): string => readFileSync(asset(name), 'utf8');

/** The product version: the repository's package.json, or the package's own (npm/build.mts writes the same number). */
export const VERSION: string = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;

/** The project a file belongs to (see above). */
export function projectRoot(file: string, home = homedir()): string {
  const start = resolve(dirname(file));
  // the search stops below the home folder: ~/.libka or a stray ~/package.json belongs to the person, not a project
  const stop = new Set([resolve(home), resolve(home, '..')].map((p) => p.toLowerCase()));
  const up = function* (dir: string) {
    for (let d = dir; !stop.has(d.toLowerCase()); d = dirname(d)) { yield d; if (dirname(d) === d) return; }
  };
  for (const d of up(start)) if (existsSync(join(d, '.libka'))) return d;
  for (const d of up(start)) if (existsSync(join(d, 'package.json')) || existsSync(join(d, '.git'))) return d;
  return start;
}

/** True for the home folder and the folders above it: a document directly there has no project of its own. */
export function isHomeOrAbove(dir: string, home = homedir()): boolean {
  const h = resolve(home).toLowerCase();
  const d = resolve(dir).toLowerCase();
  return h === d || h.startsWith(d.endsWith(sep) ? d : d + sep);
}

/**
 * The project's own list of trusted signing keys: .libka/trusted-keys.json (governance/trusted-keys.json in the
 * LibKa repository), or null when the project has none and LibKa's list applies.
 */
export function projectTrustFile(project: string): string | null {
  for (const f of [join(project, '.libka', 'trusted-keys.json'), join(project, 'governance', 'trusted-keys.json')]) if (existsSync(f)) return f;
  return null;
}
