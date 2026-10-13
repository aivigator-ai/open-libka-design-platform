// The product version, set in one place: the root package.json. LibKa has one version for everything (the
// tokens, the manual, every package, the Studio, the npm packages; the plugin through npm/build-plugin.mts), and this script writes it
// wherever a file must carry its own copy; packages/cli/test/version.test.ts fails when one is out of step.
//
//   node scripts/set-version.mts 2.1.0    sets the version (and today's date in the manual's header and the tokens' brand)
//   node scripts/set-version.mts            writes the root package.json's version everywhere again
//
// Then run the generators AGENTS.md lists (the catalog and the skill reference show the version) and check.py.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
if (arg !== undefined && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(arg)) {
  console.error(`set-version: "${arg}" is not a version such as 2.1.0`);
  process.exit(2);
}

/** Replaces the first "version": "…" in a JSON file, keeping its formatting. */
function setJson(file: string, version: string): boolean {
  const path = join(root, file);
  if (!existsSync(path)) return false;
  const text = readFileSync(path, 'utf8');
  const next = text.replace(/"version": "[^"]*"/, `"version": "${version}"`);
  if (next !== text) writeFileSync(path, next);
  return next !== text;
}

if (arg) setJson('package.json', arg);
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;

/** Every workspace package: the folders under packages/ and apps/, and top-level folders with a package.json. */
export function workspacePackages(): string[] {
  const inside = (dir: string) => existsSync(join(root, dir)) ? readdirSync(join(root, dir), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, dir, d.name, 'package.json'))).map((d) => `${dir}/${d.name}/package.json`) : [];
  const top = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'node_modules' && !d.name.startsWith('.') && existsSync(join(root, d.name, 'package.json'))).map((d) => `${d.name}/package.json`);
  return [...inside('packages'), ...inside('apps'), ...top].sort();
}

/** Every file that carries its own copy of the version. */
const COPIES = [...workspacePackages(), 'tokens/primitive.tokens.json'];

const changed = COPIES.filter((f) => setJson(f, version));
// a new version also dates the tokens' brand metadata, as it dates the manual's header
const today = new Date().toISOString().slice(0, 10);
const tokens = join(root, 'tokens', 'primitive.tokens.json');
const tokenText = readFileSync(tokens, 'utf8');
const dated = arg ? tokenText.replace(/("brand": \{[^}]*?"date": )"\d{4}-\d{2}-\d{2}"/, `$1"${today}"`) : tokenText;
if (dated !== tokenText) { writeFileSync(tokens, dated); if (!changed.includes('tokens/primitive.tokens.json')) changed.push('tokens/primitive.tokens.json'); }
const manual = join(root, 'docs', 'design-system', 'manual.md');
const text = readFileSync(manual, 'utf8');
const header = text.replace(/^\*\*Version [^*]+\*\* \| \d{4}-\d{2}-\d{2}/m, (m) => arg ? `**Version ${version}** | ${today}` : m.replace(/Version [^*]+/, `Version ${version}`));
if (header !== text) { writeFileSync(manual, header); changed.push('docs/design-system/manual.md'); }
// in the public repository only, where the export filled them in: the plugin's README and the citation
const filled: [string, (t: string) => string][] = [
  ['plugins/libka/README.md', (t) => t.replace(/@libka\/mcp@\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?/g, `@libka/mcp@${version}`)],
  ['CITATION.cff', (t) => {
    const v = t.replace(/^version: "[^"]*"/m, `version: "${version}"`);
    // the release's date is its CHANGELOG heading's, "## X (YYYY-MM-DD): …", as the export takes it; none yet, none changed
    const heading = existsSync(join(root, 'CHANGELOG.md'))
      ? readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split('\n').find((line) => line.startsWith(`## ${version} (`)) : undefined;
    const released = /^## \S+ \((\d{4}-\d{2}-\d{2})\):/.exec(heading ?? '')?.[1];
    return released ? v.replace(/^date-released: "[^"]*"/m, `date-released: "${released}"`) : v;
  }],
];
for (const [file, set] of filled) {
  const path = join(root, file);
  if (!existsSync(path) || readFileSync(path, 'utf8').includes('{{')) continue;
  const before = readFileSync(path, 'utf8');
  const after = set(before);
  if (after !== before) { writeFileSync(path, after); changed.push(file); }
}
console.log(`set-version: ${version}${changed.length ? `; wrote ${changed.join(', ')}` : '; every copy already says so'}`);
