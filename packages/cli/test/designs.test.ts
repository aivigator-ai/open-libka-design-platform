/**
 * Every built-in theme under a range of brands, built in full and checked by Guard (axe, contrast in light and dark
 * and with more contrast, structure, veraPDF, the Word file): a design must never let an output fail.
 *
 * The matrix is the built-in themes × the example brands × three documents. A push builds one combination, chosen by
 * the commit (or the day) so that pushes rotate through all of them; `LIBKA_DESIGN_MATRIX=full` (weekly and on
 * release tags) builds every one.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { BUILTIN_THEMES } from '@libka/design';
import { build } from '../src/libka.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

/** The example brands (invented): LibKa's own, and the solver's hard cases, one with its own chart colours and a logo. */
const BRANDS: Record<string, string> = {
  'libka': '',
  'yellow': 'meta:\n  name: Sunny Lane\ncolor:\n  primary: "#FFD400"\n  secondary: "#C2185B"\nlogo: logo.svg\n',
  'purple': 'color:\n  primary: "#7A1FA2"\ndefaults:\n  libka:\n    neutral: tinted\n',
  'navy': 'color:\n  primary: "#0B1F4D"\ntypography:\n  base: Atkinson Hyperlegible Next\n  headings: Bitter\n',
  'red-teal': 'color:\n  primary: "#E30613"\n  secondary: "#00A19A"\ndefaults:\n  libka:\n    charts: ["#E30613", "#00A19A", "#FFB000", "#5B2A86"]\n',
  'pink': 'color:\n  primary: "#F7B5CD"\ntypography:\n  base: Public Sans\n  headings: Literata\n',
};
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32" width="120" height="32"><circle cx="16" cy="16" r="12" fill="#FFD400" stroke="#7B6500" stroke-width="3"/><text x="34" y="22" font-family="sans-serif" font-size="14" fill="#3A3000">Sunny Lane</text></svg>';

/** The documents: the manual example (figures, a chart-free manual), every block, the Czech starter. */
const DOCUMENTS = ['examples/manual/guide.md', 'docs/blocks.md', 'packages/create-libka/templates/cs/docs/guide.md'];

const MATRIX = BUILTIN_THEMES.flatMap((t) => Object.keys(BRANDS).flatMap((b) => DOCUMENTS.map((d) => ({ theme: t.id, brand: b, document: d }))));

/** One combination per run, rotating with the commit (CI) or the day (a developer machine). */
function sample(): typeof MATRIX {
  // the full matrix takes about 24 minutes on a developer machine: CI splits it into shards ("1/3", "2/3", "3/3")
  const shard = /^(\d+)\/(\d+)$/.exec(process.env.LIBKA_DESIGN_SHARD ?? '');
  if (process.env.LIBKA_DESIGN_MATRIX === 'full') return shard ? MATRIX.filter((_, i) => i % Number(shard[2]) === Number(shard[1]) - 1) : MATRIX;
  const sha = process.env.GITHUB_SHA;
  const n = sha ? parseInt(sha.slice(0, 8), 16) : Math.floor(Date.now() / 86_400_000);
  return [MATRIX[n % MATRIX.length]!];
}

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe.skipIf(!chrome)('every built-in theme under every example brand', () => {
  it('has a matrix of every theme, brand and document', () => {
    expect(MATRIX).toHaveLength(BUILTIN_THEMES.length * Object.keys(BRANDS).length * DOCUMENTS.length);
  });

  for (const c of sample()) {
    it(`builds ${c.document} as ${c.brand} × ${c.theme}: web, PDF, slides and Word, every check passing`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'libka-designs-'));
      dirs.push(dir);
      mkdirSync(join(dir, '.libka'));
      // the document's folder (its pictures), under a project with the brand
      const from = dirname(join(root, c.document));
      // (the filter reads the path inside the folder: the whole repository may itself lie in a dist/, as the public
      // export's verify does)
      cpSync(from, join(dir, 'doc'), { recursive: true, filter: (p) => !/(^|[\\/])(dist|node_modules)([\\/]|$)/.test(relative(from, p)) });
      if (BRANDS[c.brand]) writeFileSync(join(dir, '_brand.yml'), BRANDS[c.brand]!);
      writeFileSync(join(dir, 'logo.svg'), LOGO);
      const file = join(dir, 'doc', basename(c.document));
      const text = readFileSync(file, 'utf8');
      writeFileSync(file, text.replace(/^---\n/, `---\ntheme: ${c.theme}\n`).replace(/^outputs:.*\n/m, ''));
      const r = await build(file, { out: join(dir, 'out'), outputs: ['web', 'pdf', 'deck', 'docx'] });
      expect(r.problems, `${c.brand} × ${c.theme}: ${c.document}`).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.report!.checks.length).toBeGreaterThan(0);
      expect(r.deck!.report!.checks.filter((x) => x.id === 'contrast').map((x) => x.mode)).toEqual(['standard', 'more-contrast', 'dark', 'dark-more-contrast']);
    }, 600_000);
  }
});
