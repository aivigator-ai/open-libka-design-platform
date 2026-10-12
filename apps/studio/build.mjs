// Builds LibKa Studio into a static, installable web app: apps/studio/dist/.
//   index.html, manifest.webmanifest, sw.js      the app shell, its manifest and its service worker
//   assets/main.js, assets/chunk-*.js           the Studio, split so Mermaid, the Word writer and others load when needed
//   assets/studio.css, assets/axe.min.js        the Studio's styles (tokens first); axe-core for Guard in the browser
//   fonts/, icons/                              the LibKa fonts (OFL, with their licences) and the app icons
// Serve it with `libka studio` (a service worker needs http, not file://). The build is deterministic: the same
// sources give the same files, and the Studio's version is a hash of them.
//   --out <folder>          build somewhere else than apps/studio/dist/
//   --hosted                the copy for its own origin (libka-studio.<publisher domain>): the About dialog names the
//                           publisher with its site, imprint and privacy links (from the JSON file --publisher <file>
//                           names) and a _headers file carries the host's security headers (hosting.mjs)
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { aboutData, hostedGaps, hostedHeaders } from './hosting.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const require = createRequire(import.meta.url);
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const outDir = arg('--out') ? resolve(arg('--out')) : join(here, 'dist');
const hosted = process.argv.includes('--hosted');
const optional = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
// the source repository's address: the public repository's npm/metadata.json (filled by the export)
const about = aboutData({
  version: JSON.parse(read('package.json')).version, metadata: optional(join(root, 'npm', 'metadata.json')),
  // the publisher's local file only for a hosted copy: an ordinary build (the npm package's) stays neutral
  publisher: hosted && arg('--publisher') ? optional(resolve(arg('--publisher'))) : null, hosted,
});
for (const gap of hostedGaps(about)) console.log(`studio: hosted build: ${gap}`);
const posix = (p) => p.split('\\').join('/');
const BUILD_ID = '__LIBKA_STUDIO_BUILD__';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'assets'), { recursive: true });

/* ---------- token values for the shell, the manifest and the icon ---------- */
const tokensCss = read('libka-tokens.css');
const token = (name, nth = 0) => [...tokensCss.matchAll(new RegExp(`--lk-${name}:\\s*(#[0-9A-Fa-f]{6})`, 'g'))][nth]?.[1]
  ?? (() => { throw new Error(`token --lk-${name} not found`); })();
const colors = { aqua: token('aqua-500'), light: token('bg-canvas', 0), dark: token('bg-canvas', 1), ink: token('action-primary', 0) };

/* ---------- generated modules: the stylesheets rendered pages carry, and the example ---------- */
const styles = {
  tokens: tokensCss,
  bridge: read('lk-bridge.css'),
  components: read('packages/render/src/components.css'),
  manual: read('packages/render/src/manual.css'),
  deck: read('packages/render/src/deck.css'),
};
const exampleDir = join(root, 'examples', 'manual');
const tutorialDir = join(here, 'tutorial');
const imagesOf = (dir) => `{${readdirSync(join(dir, 'images')).filter((f) => /\.(svg|png|jpe?g|gif|webp)$/.test(f)).sort()
  .map((f) => `${JSON.stringify(`images/${f}`)}: bytes(${JSON.stringify(readFileSync(join(dir, 'images', f)).toString('base64'))})`).join(',\n')}}`;
const virtual = {
  'studio:assets': [
    `export const styles = ${JSON.stringify(styles)};`,
    `export const tokensVersion = ${JSON.stringify(JSON.parse(read('package.json')).version)};`,   // the product version
    `export const axeVersion = ${JSON.stringify(require('axe-core/package.json').version)};`,
    'export const axeUrl = "assets/axe.min.js";',
    'export const fontsHref = "fonts/libka-fonts.css";',
    `export const buildId = ${JSON.stringify(BUILD_ID)};`,
  ].join('\n'),
  'studio:example': [
    'const bytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));',
    'export const name = "guide.md";',
    `export const source = ${JSON.stringify(read('examples/manual/guide.md'))};`,
    `export const files = {${readdirSync(join(exampleDir, 'images')).filter((f) => /\.(svg|png|jpe?g|gif|webp)$/.test(f)).sort()
      .map((f) => `${JSON.stringify(`images/${f}`)}: bytes(${JSON.stringify(readFileSync(join(exampleDir, 'images', f)).toString('base64'))})`).join(',\n')}};`,
  ].join('\n'),
  'studio:tutorial': [
    'const bytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));',
    `export const sources = { en: ${JSON.stringify(readFileSync(join(tutorialDir, 'tutorial.en.md'), 'utf8'))}, cs: ${JSON.stringify(readFileSync(join(tutorialDir, 'tutorial.cs.md'), 'utf8'))} };`,
    `export const files = ${imagesOf(tutorialDir)};`,
  ].join('\n'),
};
// the accessibility statement's facts, from the Studio's audit (audit/audit.ts)
const audit = await import(pathToFileURL(join(here, 'audit', 'audit.ts')).href);
virtual['studio:about'] = `export const about = ${JSON.stringify(about)};`;
virtual['studio:audit'] = [
  `export const counts = ${JSON.stringify({ supports: audit.count('Supports'), partial: audit.count('Partially Supports'), not: audit.count('Does Not Support'), na: audit.count('Not Applicable') })};`,
  `export const limits = ${JSON.stringify(audit.LIMITS)};`,
].join('\n');
const virtualPlugin = {
  name: 'studio-virtual',
  setup(b) {
    b.onResolve({ filter: /^studio:/ }, (a) => ({ path: a.path, namespace: 'studio' }));
    b.onLoad({ filter: /.*/, namespace: 'studio' }, (a) => ({ contents: virtual[a.path], loader: 'js' }));
  },
};

/* ---------- the app ---------- */
const app = await build({
  entryPoints: { main: join(here, 'src', 'main.tsx') },
  bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022',
  outdir: join(outDir, 'assets'), entryNames: '[name]', chunkNames: 'chunk-[hash]',
  jsx: 'automatic', jsxImportSource: 'preact',
  minify: process.env.LIBKA_STUDIO_PROFILE !== '1', legalComments: 'none', metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [virtualPlugin],
  logLevel: 'warning',
});
writeFileSync(join(outDir, 'assets', 'studio.css'), [tokensCss, styles.bridge, readFileSync(join(here, 'src', 'studio.css'), 'utf8'),
  readFileSync(join(here, 'src', 'visual.css'), 'utf8')].join('\n'));
writeFileSync(join(outDir, 'assets', 'axe.min.js'), readFileSync(require.resolve('axe-core/axe.min.js')));

/* ---------- the frame agent: Guard's scans and slide measuring, loaded into the hidden frames as a file ---------- */
await build({
  entryPoints: [join(here, 'src', 'frame-agent.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'es2022',
  outfile: join(outDir, 'assets', 'frame-agent.js'), minify: true, legalComments: 'none', logLevel: 'warning',
});

/* ---------- third-party notices: every npm package bundled into the Studio, its licence and its licence text ----------
   The bundles are minified without legal comments, so the notices live in one file beside them (shipped and cached
   like the rest). axe-core is copied as a file and listed too; the fonts carry their own licences in fonts/licenses. */
const bundled = new Map();
const packageOf = (input) => {
  const path = resolve(input.replace(/^[a-z-]+:/, ''));
  const i = path.lastIndexOf(`node_modules${path.includes('\\') ? '\\' : '/'}`);
  if (i < 0) return null;
  const parts = path.slice(i + 'node_modules/'.length).split(/[\\/]/);
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  return join(path.slice(0, i), 'node_modules', ...name.split('/'));
};
for (const input of Object.keys(app.metafile.inputs)) {
  const dir = packageOf(input);
  if (dir && !bundled.has(dir)) bundled.set(dir, JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')));
}
const axeDir = dirname(require.resolve('axe-core/package.json'));
bundled.set(axeDir, JSON.parse(readFileSync(join(axeDir, 'package.json'), 'utf8')));
const licenceText = (dir) => {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  return file ? readFileSync(join(dir, file), 'utf8').trim() : null;
};
// older packages name their licence in a "licenses" list
const licenceOf = (pkg) => pkg.license ?? pkg.licenses?.map((l) => l.type).join(' OR ');
const notices = [...bundled.entries()].map(([dir, pkg]) => ({ pkg: { ...pkg, license: licenceOf(pkg) }, text: licenceText(dir) }))
  .filter(({ pkg }) => !pkg.name.startsWith('@libka/'))
  .sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
const missing = notices.filter((n) => !n.text && !n.pkg.license);
if (missing.length) { console.error(`studio: no licence found for ${missing.map((n) => n.pkg.name).join(', ')}`); process.exit(1); }
writeFileSync(join(outDir, 'THIRD-PARTY-NOTICES.txt'), [
  'LibKa Studio includes the following third-party software. Each is listed with its version, its licence and the licence text it ships with.',
  ...notices.map(({ pkg, text }) => {
    // where its source is (EPL-2.0 and MPL-2.0 code may be shipped in object form when its source is named)
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    const source = repo ? `\nSource: ${repo.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '')}` : pkg.homepage ? `\nSource: ${pkg.homepage}` : '';
    const author = typeof pkg.author === 'string' ? pkg.author.replace(/\s*[<(][^>)]*[>)]/g, '') : pkg.author?.name;
    return `\n${'='.repeat(78)}\n${pkg.name} ${pkg.version} (${pkg.license ?? 'see the licence text'})${source}\n${'='.repeat(78)}\n\n${text ?? `Licensed under ${pkg.license}${author ? `; copyright ${author}` : ''}.`}`;
  }),
].join('\n') + '\n');

/* ---------- the Studio's Content Security Policy ----------
   Scripts: the Studio's own files, and the inline runtime of the pages it previews (a web page and a deck, in English
   and in Czech), named by hash: the pages are rendered here exactly as the Studio renders them (the runtimes' text is
   generated, runtimes.ts), so the hashes match. No eval, no inline handlers. Styles: the Studio's files and inline
   styles (it places popovers, and Mermaid styles the diagrams it draws; styles run no code). The previews are srcdoc
   frames, which take this policy over from the Studio. */
const { parse } = await import(pathToFileURL(join(root, 'packages', 'model', 'src', 'index.ts')).href);
const { renderManual } = await import(pathToFileURL(join(root, 'packages', 'render', 'src', 'index.ts')).href);
const { renderDeck } = await import(pathToFileURL(join(root, 'packages', 'render', 'src', 'deck.ts')).href);
const { VIDEO_HOSTS } = await import(pathToFileURL(join(root, 'packages', 'render', 'src', 'csp.ts')).href);
const inlineScripts = new Set();
for (const lang of ['en', 'cs']) {
  const doc = parse(`---\ntitle: Policy\nlang: ${lang}\n---\n\n## A\n\nText.\n`).document;
  const { tokens, bridge, components, deck } = styles;
  for (const html of [renderManual(doc, { styles, fontsHref: 'fonts/libka-fonts.css', source: 'document.md' }), renderDeck(doc, { styles: { tokens, bridge, components, deck }, fontsHref: 'fonts/libka-fonts.css' })]) {
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) inlineScripts.add(createHash('sha256').update(m[1], 'utf8').digest('base64'));
  }
}
const studioPolicy = [
  "default-src 'self'",
  `script-src 'self' ${[...inlineScripts].sort().map((h) => `'sha256-${h}'`).join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  `frame-src 'self' ${VIDEO_HOSTS.join(' ')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');
writeFileSync(join(outDir, 'csp.txt'), `${studioPolicy}\n`);

/* ---------- fonts (with their licences) ---------- */
cpSync(join(root, 'fonts'), join(outDir, 'fonts'), { recursive: true });

/* ---------- icons: the LibKa dot on the ink of the tokens, drawn here so the build needs no browser ---------- */
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${colors.ink}"/>`
  + `<circle cx="256" cy="256" r="150" fill="${colors.aqua}" opacity=".22"/><circle cx="256" cy="256" r="112" fill="${colors.aqua}"/></svg>\n`;
function png(size) {
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [ink, aqua] = [hex(colors.ink), hex(colors.aqua)];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 4;   // 4×4 samples per pixel: smooth edges
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const d = Math.hypot((x + (sx + 0.5) / S) / size - 0.5, (y + (sy + 0.5) / S) / size - 0.5) * 512;
        const a = d <= 112 ? 1 : d <= 150 ? 0.22 : 0;   // the dot and its glow (full bleed: the platform masks the corners)
        r += ink[0] + (aqua[0] - ink[0]) * a; g += ink[1] + (aqua[1] - ink[1]) * a; b += ink[2] + (aqua[2] - ink[2]) * a;
      }
      raw.set([r / S / S, g / S / S, b / S / S, 255].map(Math.round), y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync(join(outDir, 'icons'));
writeFileSync(join(outDir, 'icons', 'icon.svg'), svgIcon);
for (const size of [192, 512]) writeFileSync(join(outDir, 'icons', `icon-${size}.png`), png(size));

/* ---------- manifest and shell ---------- */
writeFileSync(join(outDir, 'manifest.webmanifest'), `${JSON.stringify({
  name: 'LibKa Studio',
  short_name: 'LibKa Studio',
  description: 'Write a document once: a web page, slides, a PDF and a Word file, checked for accessibility as you type. Your documents stay on your device.',
  id: './',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: colors.light,
  theme_color: colors.light,
  icons: [
    { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2)}\n`);
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]);   // function replacer: no $-patterns
writeFileSync(join(outDir, 'index.html'), fill(readFileSync(join(here, 'src', 'index.html'), 'utf8'), { THEME_LIGHT: colors.light, THEME_DARK: colors.dark, CSP: studioPolicy }));

/* ---------- the version: a hash of everything built; then the service worker that caches it ---------- */
const files = (dir) => readdirSync(dir).flatMap((f) => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]);
const list = files(outDir).map((f) => posix(relative(outDir, f))).sort();
const hash = createHash('sha256');
for (const f of list) hash.update(f).update(readFileSync(join(outDir, f)));
const version = hash.digest('hex').slice(0, 10);
const main = join(outDir, 'assets', 'main.js');
writeFileSync(main, readFileSync(main, 'utf8').replace(BUILD_ID, version));
await build({
  entryPoints: [join(here, 'src', 'sw.ts')], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none',
  outfile: join(outDir, 'sw.js'),
  define: { __PRECACHE__: JSON.stringify(['./', ...list]), __VERSION__: JSON.stringify(version) },
  logLevel: 'warning',
});

const size = (f) => statSync(join(outDir, f)).size;
const kb = (n) => `${Math.round(n / 1024)} KB`;
const chunks = Object.keys(app.metafile.outputs).filter((f) => f.endsWith('.js'));
console.log(`studio: built ${posix(relative(process.cwd(), outDir))}/ (version ${version}): ${list.length + 1} files, `
  + `${kb(list.reduce((n, f) => n + size(f), 0))} in all; first load ${kb(size('assets/main.js') + size('assets/studio.css'))} (main.js and studio.css), ${chunks.length} script chunks`);
// the performance budget: what loads before the Studio can start stays within 1.5 MB
const FIRST_LOAD_BUDGET = 1.5 * 1024 * 1024;
const firstLoad = size('assets/main.js') + size('assets/studio.css');
if (firstLoad > FIRST_LOAD_BUDGET && process.env.LIBKA_STUDIO_PROFILE !== '1') {
  console.error(`studio: the first load is ${kb(firstLoad)}, over the budget of ${kb(FIRST_LOAD_BUDGET)}: load the new code when it is needed (a dynamic import)`);
  process.exit(1);
}

/* ---------- a hosted copy: the host's headers (after the service worker, which must not cache them) ---------- */
if (hosted) {
  writeFileSync(join(outDir, '_headers'), hostedHeaders(studioPolicy));
  console.log(`studio: hosted build for ${about.hosted.by}, with _headers`);
}
