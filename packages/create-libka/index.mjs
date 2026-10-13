#!/usr/bin/env node
/**
 * create-libka: starts a LibKa project.
 *
 *   npm create libka@latest [folder] [-- --lang en|cs]
 *
 * Writes into a new (or empty) folder: an example document in English or Czech (docs/guide.md), package.json with
 * npm run build, check, verify and doctor, a GitHub Actions workflow that checks every push and pull request with LibKa Guard, a
 * .gitignore that keeps the signing key out of git, and a README of next steps. It installs nothing and runs nothing; the
 * README says what to do next. Plain JavaScript without dependencies, so `npm create` starts at once.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, 'templates');
/** The @libka/cli version a new project asks for: this package's own (one version for everything). */
const PKG = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'));
export const VERSION = PKG.version;
export const LANGS = ['en', 'cs'];
/** The LibKa docs on GitHub, from the package's repository field (written by npm/build.mts). */
const REPO = PKG.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');
export const DOCS = REPO ? `${REPO}/blob/main/docs` : 'docs (in the LibKa repository)';
/** The Guard action's owner, the LibKa repository's (open-libka-guard-action is beside it); a package built without
 * the repository address is for testing only, and its workflow names OWNER. */
export const ownerOf = (repo) => /^https:\/\/github\.com\/([^/]+)\//.exec(repo ?? '')?.[1] ?? 'OWNER';
const OWNER = ownerOf(REPO);

/** A package name from a folder name: lower case, letters, digits and dashes. */
export function packageName(folder) {
  return basename(resolve(folder)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|-+$/g, '') || 'libka-docs';
}

/** Every template file for a language: [path in the project, text]. */
function files(lang, name) {
  const out = [];
  const walk = (dir, base) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, base);
      else out.push([relative(base, p).split('\\').join('/'), readFileSync(p, 'utf8')]);
    }
  };
  walk(join(TEMPLATES, 'common'), join(TEMPLATES, 'common'));
  walk(join(TEMPLATES, lang), join(TEMPLATES, lang));
  // npm leaves .gitignore out of packages, so the templates carry it as "gitignore"; .github is renamed the same way
  return out.map(([p, text]) => [p.replace(/^gitignore$/, '.gitignore').replace(/^github\//, '.github/'),
    text.replaceAll('{{name}}', name).replaceAll('{{version}}', VERSION).replaceAll('{{docs}}', DOCS).replaceAll('{{owner}}', OWNER)]);
}

/** Writes the project; returns the files written. Refuses a folder that already has files in it. */
export function create(folder, { lang = 'en' } = {}) {
  if (!LANGS.includes(lang)) throw new Error(`--lang takes ${LANGS.join(' or ')}, not "${lang}"`);
  const dir = resolve(folder);
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${folder} is not empty; choose a new folder name`);
  const name = packageName(dir);
  const written = [];
  for (const [path, text] of files(lang, name)) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    written.push(path);
  }
  const pkg = {
    name, private: true, description: lang === 'cs' ? 'Dokumenty LibKa' : 'LibKa documents',
    scripts: {
      build: 'libka build docs/guide.md --out dist',
      check: 'libka lint docs/guide.md',
      verify: 'libka verify dist/guide.html --pdf dist/guide.pdf --docx dist/guide.docx && libka verify dist/guide.deck.html --pdf dist/guide.deck.pdf',
      doctor: 'libka doctor',
    },
    // exactly the version the workflow runs in CI (its `cli:`), so a build gives the same result on both
    devDependencies: { '@libka/cli': VERSION },
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  written.push('package.json');
  return written.sort();
}

function parseArgs(argv) {
  const args = { folder: undefined, lang: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang' || a === '-l') args.lang = argv[++i];
    else if (a.startsWith('--lang=')) args.lang = a.slice(7);
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-') && args.folder === undefined) args.folder = a;
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('usage: npm create libka@latest [folder] -- [--lang en|cs]\n\nStarts a LibKa project: an example document, npm scripts, a CI workflow, a .gitignore and a README.');
    return 0;
  }
  const ask = process.stdin.isTTY && process.stdout.isTTY && (!args.folder || !args.lang)
    ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    const folder = args.folder ?? ((await ask?.question('Project folder (libka-docs): '))?.trim() || 'libka-docs');
    let lang = args.lang;
    if (!lang) {
      const answer = ((await ask?.question('Example document in English or Czech? (en/cs, en): ')) ?? '').trim().toLowerCase();
      lang = answer.startsWith('c') ? 'cs' : 'en';
    }
    const written = create(folder, { lang });
    const rel = relative(process.cwd(), resolve(folder)) || '.';
    console.log(`\nLibKa project in ${rel} (${lang === 'cs' ? 'Czech' : 'English'} example):`);
    for (const f of written) console.log(`  ${f}`);
    console.log(`\nNext:\n  cd ${rel}\n  npm install\n  npm run doctor     what this computer has (Chrome is needed to build)\n  npm run build      the web page, PDF, slides and Word file in dist/\n\nREADME.md says what each step does and how to continue.`);
    return 0;
  } catch (e) {
    console.error(`create-libka: ${e.message}`);
    return 1;
  } finally {
    ask?.close();
  }
}

// npm runs it through a link (node_modules/.bin), so compare real paths
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
