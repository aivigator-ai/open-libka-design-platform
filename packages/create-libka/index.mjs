#!/usr/bin/env node
/**
 * create-libka: starts a LibKa project.
 *
 *   npm create libka@latest [folder] [-- --lang en|cs] [--template guide|decision-record|manual|policy|report|talk]
 *
 * Writes into a new (or empty) folder: a document in English or Czech (the example, docs/guide.md, or a template from
 * gallery/, such as docs/report.md), package.json with
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
/** The templates a project can start from (gallery/<id>/: template.json, en.md, cs.md and their pictures), shared with LibKa Studio. */
export const GALLERY = join(HERE, 'gallery');
/** The example every project started from before templates, still the default: it explains LibKa itself. */
const GUIDE = { id: 'guide', name: { en: 'Example guide', cs: 'Ukázkový průvodce' }, file: 'guide', outputs: ['web', 'pdf', 'deck', 'docx'] };

/** The templates: the example first, then the gallery's, by id. */
export function templates() {
  const gallery = readdirSync(GALLERY, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    .map((id) => JSON.parse(readFileSync(join(GALLERY, id, 'template.json'), 'utf8')));
  return [GUIDE, ...gallery];
}
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
function files(lang, name, template = GUIDE) {
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
  // a template from the gallery takes the example's place
  const doc = template.file;
  const kept = template === GUIDE ? out
    : [...out.filter(([p]) => p !== 'docs/guide.md'), [`docs/${doc}.md`, readFileSync(join(GALLERY, template.id, `${lang}.md`), 'utf8')]];
  const slides = !template.outputs.includes('deck') ? ''
    : lang === 'cs' ? ` a \`dist/${doc}.deck.html\` pro prezentaci` : `, and \`dist/${doc}.deck.html\` for the slides`;
  const verified = verifiedFiles(template.outputs, lang);
  return kept.map(([p, text]) => [p.replace(/^gitignore$/, '.gitignore').replace(/^github\//, '.github/'),
    text.replaceAll('{{doc}}', doc).replaceAll('{{slides}}', slides).replaceAll('{{verified}}', verified).replaceAll('{{name}}', name).replaceAll('{{version}}', VERSION).replaceAll('{{docs}}', DOCS).replaceAll('{{owner}}', OWNER)]);
}

/** Writes the project; returns the files written. Refuses a folder that already has files in it. */
export function create(folder, { lang = 'en', template: id = 'guide' } = {}) {
  if (!LANGS.includes(lang)) throw new Error(`--lang takes ${LANGS.join(' or ')}, not "${lang}"`);
  const all = templates();
  const template = all.find((x) => x.id === id);
  if (!template) throw new Error(`--template takes ${all.map((x) => x.id).join(', ')}, not "${id}"`);
  const dir = resolve(folder);
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${folder} is not empty; choose a new folder name`);
  const name = packageName(dir);
  const written = [];
  for (const [path, text] of files(lang, name, template)) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    written.push(path);
  }
  const pkg = {
    name, private: true, description: lang === 'cs' ? 'Dokumenty LibKa' : 'LibKa documents',
    scripts: {
      build: `libka build docs/${template.file}.md --out dist`,
      check: `libka lint docs/${template.file}.md`,
      verify: verifyScript(template),
      doctor: 'libka doctor',
    },
    // exactly the version the workflow runs in CI (its `cli:`), so a build gives the same result on both
    devDependencies: { '@libka/cli': VERSION },
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  written.push('package.json');
  return written.sort();
}

/** The files `npm run verify` checks, in the README's words: only the outputs the template builds. */
function verifiedFiles(outputs, lang) {
  const pdf = outputs.includes('pdf'), docx = outputs.includes('docx'), deck = outputs.includes('deck');
  if (lang === 'cs') {
    const page = `webová stránka${pdf && docx ? ' s jejím PDF i souborem Wordu' : pdf ? ' s jejím PDF' : docx ? ' s jejím souborem Wordu' : ''}`;
    return deck ? `${page} a prezentace${pdf ? ' s jejím PDF' : ''}` : page;
  }
  const page = `the web page${pdf && docx ? ' with its PDF and Word file' : pdf ? ' with its PDF' : docx ? ' with its Word file' : ''}`;
  return deck ? `${page}, and the slides${pdf ? ' with their PDF' : ''}` : page;
}

/** The verify script for what the template builds: the page with its PDF and Word file, and the slides with theirs. */
function verifyScript({ file, outputs }) {
  const pdf = outputs.includes('pdf');
  const page = `libka verify dist/${file}.html${pdf ? ` --pdf dist/${file}.pdf` : ''}${outputs.includes('docx') ? ` --docx dist/${file}.docx` : ''}`;
  return outputs.includes('deck') ? `${page} && libka verify dist/${file}.deck.html${pdf ? ` --pdf dist/${file}.deck.pdf` : ''}` : page;
}

function parseArgs(argv) {
  const args = { folder: undefined, lang: undefined, template: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang' || a === '-l') args.lang = argv[++i];
    else if (a.startsWith('--lang=')) args.lang = a.slice(7);
    else if (a === '--template' || a === '-t') args.template = argv[++i];
    else if (a.startsWith('--template=')) args.template = a.slice(11);
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-') && args.folder === undefined) args.folder = a;
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`usage: npm create libka@latest [folder] -- [--lang en|cs] [--template ${templates().map((x) => x.id).join('|')}]\n\nStarts a LibKa project: the example document or a template, npm scripts, a CI workflow, a .gitignore and a README.`);
    return 0;
  }
  const ask = process.stdin.isTTY && process.stdout.isTTY && (!args.folder || !args.lang || !args.template)
    ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    const folder = args.folder ?? ((await ask?.question('Project folder (libka-docs): '))?.trim() || 'libka-docs');
    let lang = args.lang;
    if (!lang) {
      const answer = ((await ask?.question('Example document in English or Czech? (en/cs, en): ')) ?? '').trim().toLowerCase();
      lang = answer.startsWith('c') ? 'cs' : 'en';
    }
    let template = args.template;
    if (!template) {
      const list = templates();
      const answer = ((await ask?.question(`Start from: ${list.map((x, i) => `${i + 1} ${x.name.en}`).join(', ')}? (1-${list.length}, 1): `)) ?? '').trim().toLowerCase();
      template = list[Number(answer) - 1]?.id ?? list.find((x) => x.id === answer)?.id ?? 'guide';
    }
    const written = create(folder, { lang, template });
    const rel = relative(process.cwd(), resolve(folder)) || '.';
    const chosen = templates().find((x) => x.id === template) ?? templates()[0];
    const OUT = { web: 'the web page', pdf: 'PDF', deck: 'slides', docx: 'Word file' };
    const outs = chosen.outputs.map((o) => OUT[o]);
    console.log(`\nLibKa project in ${rel} (${chosen.name.en}, ${lang === 'cs' ? 'in Czech' : 'in English'}):`);
    for (const f of written) console.log(`  ${f}`);
    console.log(`\nNext:\n  cd ${rel}\n  npm install\n  npm run doctor     what this computer has (Chrome is needed to build)\n  npm run build      ${outs.length > 1 ? `${outs.slice(0, -1).join(', ')} and ${outs[outs.length - 1]}` : outs[0]} in dist/\n\nREADME.md says what each step does and how to continue.`);
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
