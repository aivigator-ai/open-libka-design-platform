// Builds LibKa's npm packages and the AI-tool bundles into dist/npm/, ready to test and to publish.
//
//   node npm/build.mts [--reuse-studio] [--no-mcpb] [--release]
//
//   @libka/cli      the CLI and the engine: LibKa's own packages bundled into dist/libka.js, every third-party
//                   package an ordinary dependency at the exact version the repository tests; the stylesheets,
//                   fonts, LibKa's trusted keys, Mermaid's browser script and LibKa Studio in assets/
//   @libka/mcp      the MCP server, bundled into dist/server.js; depends on @libka/cli of the same version
//   @libka/tokens   the token CSS, SCSS, Tailwind themes and the DTCG source
//   create-libka    the starter (packages/create-libka), as it is
//   libka-<v>.mcpb  the Claude Desktop extension: the MCP server with everything it needs installed in it
//   libka-author-skill-<v>.zip   the authoring skill for claude.ai and Claude Desktop
//
// Each package is packed with npm pack into dist/npm/*.tgz. The repository address and the author come from
// npm/metadata.json; without it the packages are built without them, for testing only, and --release (for
// packages that will be published) refuses to build. Nothing here publishes.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { zipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'npm');
const args = new Set(process.argv.slice(2));
const posix = (p: string) => p.split('\\').join('/');
const log = (m: string) => console.log(`npm-build: ${m}`);
const fail = (m: string): never => { console.error(`npm-build: ${m}`); process.exit(1); };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd: string, argv: string[], cwd: string) => execFileSync(cmd, argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });


export const VERSION = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;

/* ---------- the repository address and the author ---------- */
interface Metadata { repository?: string; author?: string; mcpName?: string }
function metadata(): Metadata {
  const file = join(root, 'npm', 'metadata.json');
  if (!existsSync(file)) return {};
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const m: Metadata = {};
  for (const k of ['repository', 'author', 'mcpName'] as const) if (raw[k] && !raw[k].includes('{{')) m[k] = raw[k];
  return m;
}
const meta = metadata();
if (args.has('--release') && (!meta.repository || !meta.author)) fail('--release needs the repository address and the author (npm/metadata.json)');
if (!meta.repository) log('no repository address known: the packages are for testing only');

/** The third-party material each package itself contains (its NOTICE names it; npm dependencies carry their own). */
const THIRD_PARTY: Record<string, string> = {
  cli: [
    'This package also contains third-party material under its own licence:',
    '',
    '- assets/fonts/: Fraunces, Inter and JetBrains Mono, under the SIL Open Font License 1.1',
    '  (the licence texts are in assets/fonts/licenses/).',
    '- assets/vendor/mermaid/: Mermaid\'s browser script, under the MIT License (assets/vendor/mermaid/LICENSE).',
    '- assets/studio/: LibKa Studio, a web app whose files include open-source packages; each is listed with',
    '  its licence text in assets/studio/THIRD-PARTY-NOTICES.txt.',
    '',
    'The other open-source packages it uses are installed by npm as its dependencies, each with its own licence;',
    'among them axe-core (Mozilla Public License 2.0) for the browser checks.',
  ].join('\n'),
  mcp: 'The open-source packages it uses are installed by npm as its dependencies, each with its own licence.',
  tokens: '',
  'create-libka': '',
  mcpb: [
    'This extension contains the LibKa MCP server and everything it needs in server/node_modules/: LibKa\'s',
    'packages (their NOTICE files list the third-party material they contain) and open-source packages, each',
    'with its own licence file there.',
  ].join('\n'),
};

/**
 * LICENSE (the repository's own; a package built without it is for testing only) and a NOTICE written for the
 * package: the copyright, the third-party material it contains, and the product names.
 */
function legalFiles(dir: string, which: keyof typeof THIRD_PARTY): void {
  const licence = join(root, 'LICENSE');
  if (existsSync(licence)) cpSync(licence, join(dir, 'LICENSE'));
  else if (args.has('--release')) fail('--release needs the LICENSE file');
  else writeFileSync(join(dir, 'LICENSE'), 'Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0\n');
  const holder = meta.author ?? 'the publisher of LibKa';
  writeFileSync(join(dir, 'NOTICE'), [
    `LibKa (${which === 'mcpb' ? 'the Claude Desktop extension' : JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name})`,
    `Copyright ${new Date().getFullYear()} ${holder}`,
    '',
    'Licensed under the Apache License, Version 2.0 (see LICENSE).',
    ...(THIRD_PARTY[which] ? ['', THIRD_PARTY[which]] : []),
    '',
    `LibKa, LibKa Design Platform and LibKa Studio are the names under which ${holder} publishes these products.`,
    'The Apache License does not grant permission to use them (section 6), except to describe where the work',
    'comes from. If you publish a modified version, please give it its own name and say that it is based on LibKa.',
    '',
  ].join('\n'));
}

function readme(name: string, dir: string): void {
  const text = readFileSync(join(root, 'npm', 'readme', `${name}.md`), 'utf8')
    .replaceAll('{{version}}', VERSION).replaceAll('{{repository}}', meta.repository ?? 'the LibKa repository');
  writeFileSync(join(dir, 'README.md'), text);
}

/** The fields every published package has. */
function common(description: string, keywords: string[]) {
  return {
    version: VERSION, description, license: 'Apache-2.0',
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.repository ? { repository: { type: 'git', url: `git+${meta.repository}.git` }, homepage: `${meta.repository}#readme`, bugs: { url: `${meta.repository}/issues` } } : {}),
    keywords: ['libka', ...keywords],
    engines: { node: '>=22.18' },
    publishConfig: { access: 'public', provenance: true },
  };
}

/* ---------- third-party dependencies at the versions the repository tests ---------- */
const WORKSPACE = readdirSync(join(root, 'packages')).filter((d) => existsSync(join(root, 'packages', d, 'package.json')));
const packageName = (spec: string) => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;
function installedVersion(name: string): string {
  for (const p of WORKSPACE) {
    const pkg = JSON.parse(readFileSync(join(root, 'packages', p, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    if (!pkg.dependencies?.[name]) continue;
    const installed = join(root, 'packages', p, 'node_modules', ...name.split('/'), 'package.json');
    return (JSON.parse(readFileSync(installed, 'utf8')) as { version: string }).version;
  }
  return fail(`${name} is imported but no LibKa package lists it in its dependencies`);
}

/** Bundles LibKa's own packages; every other import stays an import, and is returned with its version. */
async function bundle(entry: string, outfile: string, keepExternal: string[] = []): Promise<Record<string, string>> {
  const result = await build({
    entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
    legalComments: 'none', logLevel: 'warning',
    plugins: [{
      name: 'third-party-external',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (a) => {
          if (a.kind === 'entry-point' || isAbsolute(a.path)) return undefined;   // C:\… on Windows is a path, not a package
          const name = packageName(a.path);
          if (a.path.startsWith('node:') || builtinModules.includes(name)) return { path: a.path, external: true };
          if (name.startsWith('@libka/') && !keepExternal.includes(name)) return undefined;   // bundled
          return { path: a.path, external: true };
        });
      },
    }],
  });
  const deps: Record<string, string> = {};
  for (const o of Object.values(result.metafile.outputs)) {
    for (const i of o.imports) {
      if (!i.external || i.path.startsWith('node:') || builtinModules.includes(packageName(i.path))) continue;
      const name = packageName(i.path);
      if (keepExternal.includes(name)) deps[name] = VERSION;
      else deps[name] = installedVersion(name);
    }
  }
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

function pack(dir: string): string {
  const name = run(npm, ['pack', '--pack-destination', out, '--json'], dir);
  const file = (JSON.parse(name) as { filename: string }[])[0]!.filename.replace(/^@/, '').replace('/', '-');
  return join(out, file);
}

const size = (f: string) => `${Math.round(statSync(f).size / 1024)} KB`;

/* ---------- build ---------- */
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// the Studio ships in @libka/cli
if (!args.has('--reuse-studio') || !existsSync(join(root, 'apps', 'studio', 'dist', 'index.html'))) {
  log('building LibKa Studio');
  execFileSync(process.execPath, [join(root, 'apps', 'studio', 'build.mjs')], { cwd: root, stdio: 'inherit' });
}

// @libka/cli
const cli = join(out, 'cli');
const cliDeps = await bundle(join(root, 'packages', 'cli', 'src', 'libka.ts'), join(cli, 'dist', 'libka.js'));
const { ASSETS } = await import('../packages/cli/src/assets.ts');
for (const [name, from] of Object.entries(ASSETS)) cpSync(join(root, from), join(cli, 'assets', name), { recursive: true });
const mermaidDir = dirname(createRequire(join(root, 'packages', 'cli', 'package.json')).resolve('mermaid/package.json'));
mkdirSync(join(cli, 'assets', 'vendor', 'mermaid'), { recursive: true });
cpSync(join(mermaidDir, 'dist', 'mermaid.min.js'), join(cli, 'assets', 'vendor', 'mermaid', 'mermaid.min.js'));
cpSync(join(mermaidDir, 'LICENSE'), join(cli, 'assets', 'vendor', 'mermaid', 'LICENSE'));
delete cliDeps.mermaid;   // a browser script, shipped as a file above
// loaded with createRequire, so the bundle shows no import of it: Guard injects axe-core's script into the pages it checks
cliDeps['axe-core'] = installedVersion('axe-core');
const sortedCliDeps = Object.fromEntries(Object.entries(cliDeps).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(cli, 'package.json'), JSON.stringify({
  name: '@libka/cli', ...common('LibKa: one Markdown file to a web page, A4 PDF, 16:9 slides and Word file, each checked for accessibility by Guard and signed. The libka command.', ['accessibility', 'wcag', 'pdf-ua', 'markdown', 'documentation', 'slides', 'docx']),
  type: 'module', bin: { libka: 'dist/libka.js' }, exports: { '.': './dist/libka.js', './package.json': './package.json' },
  files: ['dist', 'assets', 'README.md', 'LICENSE', 'NOTICE'], dependencies: sortedCliDeps,
}, null, 2) + '\n');
readme('cli', cli);
legalFiles(cli, 'cli');

// @libka/mcp
const mcp = join(out, 'mcp');
const mcpDeps = await bundle(join(root, 'packages', 'mcp', 'src', 'server.ts'), join(mcp, 'dist', 'server.js'), ['@libka/cli']);
mkdirSync(join(mcp, 'assets'), { recursive: true });
cpSync(join(root, '.claude', 'skills', 'libka-author', 'SKILL.md'), join(mcp, 'assets', 'SKILL.md'));
writeFileSync(join(mcp, 'package.json'), JSON.stringify({
  name: '@libka/mcp', ...common('The LibKa MCP server: AI tools list LibKa blocks, check LibKa Markdown and build it into checked, signed web pages, PDFs, slides and Word files.', ['mcp', 'model-context-protocol', 'ai', 'accessibility']),
  // the official MCP Registry checks that the npm package names the server it lists
  ...(meta.mcpName ? { mcpName: meta.mcpName } : {}),
  type: 'module', bin: { 'libka-mcp': 'dist/server.js' }, exports: { '.': './dist/server.js', './package.json': './package.json' },
  files: ['dist', 'assets', 'README.md', 'LICENSE', 'NOTICE'], dependencies: mcpDeps,
}, null, 2) + '\n');
readme('mcp', mcp);
legalFiles(mcp, 'mcp');
// the MCP Registry's entry (mcp-publisher publish, from dist/npm/), only when the registry name is known
if (meta.mcpName) {
  writeFileSync(join(out, 'server.json'), JSON.stringify({
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: meta.mcpName,
    title: 'LibKa',
    description: 'Write accessible documents: one Markdown file to checked, signed web pages, PDFs, slides, Word.',
    ...(meta.repository ? { repository: { url: meta.repository, source: 'github' } } : {}),
    version: VERSION,
    packages: [{ registryType: 'npm', identifier: '@libka/mcp', version: VERSION, transport: { type: 'stdio' } }],
  }, null, 2) + '\n');
  log('wrote dist/npm/server.json (the MCP Registry entry)');
}

// @libka/tokens
const tokens = join(out, 'tokens');
mkdirSync(join(tokens, 'tokens'), { recursive: true });
for (const f of ['libka-tokens.css', 'libka-tokens.scss', 'libka.tailwind.css', 'libka.tailwind.config.js', 'libka.resolver.json']) cpSync(join(root, f), join(tokens, f));
for (const f of readdirSync(join(root, 'tokens')).filter((f) => f.endsWith('.tokens.json'))) cpSync(join(root, 'tokens', f), join(tokens, 'tokens', f));
writeFileSync(join(tokens, 'package.json'), JSON.stringify({
  name: '@libka/tokens', ...common('The LibKa design tokens (W3C DTCG) with light, dark and high-contrast themes, as CSS custom properties, SCSS and Tailwind themes, with WCAG contrast gates.', ['design-tokens', 'dtcg', 'css', 'tailwind', 'scss', 'accessibility']),
  exports: {
    './css': './libka-tokens.css', './scss': './libka-tokens.scss', './tailwind.css': './libka.tailwind.css', './tailwind.config': './libka.tailwind.config.js',
    './libka.resolver.json': './libka.resolver.json', './tokens/*': './tokens/*', './package.json': './package.json',
  },
  style: 'libka-tokens.css', sass: 'libka-tokens.scss',
  files: ['libka-tokens.css', 'libka-tokens.scss', 'libka.tailwind.css', 'libka.tailwind.config.js', 'libka.resolver.json', 'tokens', 'README.md', 'LICENSE', 'NOTICE'],
}, null, 2) + '\n');
readme('tokens', tokens);
legalFiles(tokens, 'tokens');

// create-libka
const create = join(out, 'create-libka');
cpSync(join(root, 'packages', 'create-libka', 'index.mjs'), join(create, 'index.mjs'));
cpSync(join(root, 'packages', 'create-libka', 'templates'), join(create, 'templates'), { recursive: true });
writeFileSync(join(create, 'package.json'), JSON.stringify({
  name: 'create-libka', ...common('Starts a LibKa project: npm create libka@latest. An example document in English or Czech, npm scripts, a CI workflow, a .gitignore and next steps.', ['create', 'starter', 'template']),
  type: 'module', bin: { 'create-libka': 'index.mjs' }, files: ['index.mjs', 'templates', 'README.md', 'LICENSE', 'NOTICE'],
}, null, 2) + '\n');
readme('create-libka', create);
legalFiles(create, 'create-libka');

const tarballs = [cli, mcp, tokens, create].map(pack);
for (const t of tarballs) log(`packed ${posix(relative(root, t))} (${size(t)})`);

/* ---------- the skill as a .zip (claude.ai, Claude Desktop): the skill's folder at the top of the archive ---------- */
const skillDir = join(root, '.claude', 'skills', 'libka-author');
const fixed = new Date('2026-01-01T00:00:00Z');   // the same files give the same archive
const zip = join(out, `libka-author-skill-${VERSION}.zip`);
writeFileSync(zip, zipSync(Object.fromEntries(readdirSync(skillDir).sort().map((f) => [`libka-author/${f}`, [readFileSync(join(skillDir, f)), { mtime: fixed }]]))));
log(`wrote ${posix(relative(root, zip))} (${size(zip)})`);

/* ---------- the Claude Desktop extension (.mcpb): the MCP server with its dependencies installed inside ---------- */
if (!args.has('--no-mcpb')) {
  const stage = join(out, 'mcpb');
  mkdirSync(join(stage, 'server'), { recursive: true });
  writeFileSync(join(stage, 'server', 'package.json'), JSON.stringify({ name: 'libka-desktop-extension', private: true, type: 'module' }, null, 2) + '\n');
  // the packed packages, installed as a user would install them (with the dependencies from the npm registry)
  run(npm, ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts', ...tarballs.slice(0, 2).map((t) => posix(t))], join(stage, 'server'));
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(JSON.parse(readFileSync(join(root, 'npm', 'mcpb', 'manifest.json'), 'utf8')
    .replaceAll('{{version}}', VERSION).replaceAll('{{repository}}', meta.repository ?? '').replaceAll('{{author}}', meta.author ?? 'LibKa')), null, 2) + '\n');
  cpSync(join(root, 'apps', 'studio', 'dist', 'icons', 'icon-512.png'), join(stage, 'icon.png'));   // the Studio's icon, drawn from the tokens
  legalFiles(stage, 'mcpb');
  const files: Record<string, [Uint8Array, { mtime: Date }]> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else files[posix(relative(stage, p))] = [readFileSync(p), { mtime: fixed }];
    }
  };
  walk(stage);
  const mcpbFile = join(out, `libka-${VERSION}.mcpb`);
  writeFileSync(mcpbFile, zipSync(files, { level: 9 }));
  log(`wrote ${posix(relative(root, mcpbFile))} (${size(mcpbFile)}, ${Object.keys(files).length} files)`);
}
log(`done: version ${VERSION}${meta.repository ? '' : ' (no repository address: not for publishing)'}`);
