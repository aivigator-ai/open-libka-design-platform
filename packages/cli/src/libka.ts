#!/usr/bin/env node
/**
 * libka build <manual.md> [--out <dir>] [--outputs web,pdf,deck,docx] [--pdf] [--deck] [--docx] [--no-check]
 * libka lint <manual.md> [--json]
 * libka check <page.html>
 * libka verify <page.html> [--pdf <file.pdf>] [--docx <file.docx>] [--require-trusted]
 * libka doctor
 * libka --version
 *
 * build   parses a LibKa Markdown document, stops on any problem (file:line: message), copies the images it
 *         references and makes the outputs the document asks for (front matter "outputs", default web
 *         and pdf); --outputs replaces that list for one run, --pdf, --deck and --docx add to it.
 *         web is one self-contained HTML file, pdf its A4 PDF, docx an editable Word file. Guard
 *         checks the rendered page in Chrome (and the Word file's structure); if it passes, a signed
 *         manifest of the checks is embedded in the HTML and written next to it as <name>.manifest.json.
 *         --no-check skips Guard and writes unsigned outputs. deck writes <name>.deck.html, 16:9 slides
 *         from the same source (with pdf also <name>.deck.pdf, one page per slide), checked and signed
 *         the same way.
 * lint    parses only (fast, no browser): problems with line numbers, the outline and the slides the
 *         deck will have. --json for tools and AI agents. Whether slides fit needs build --deck.
 * check   runs Guard on any HTML file and prints the report.
 * verify  checks a signed page: signature, HTML (and PDF) unchanged since signing, all checks
 *         passed, and whether the signing key is trusted: listed in the project's .libka/trusted-keys.json
 *         (governance/trusted-keys.json in the LibKa repository), or in LibKa's own list when it has none.
 * doctor  what this machine has (Node, Chrome, Java with veraPDF, LibreOffice) and what works without each.
 *
 * Signing: each project has its own key in .libka/signing-key.pem (never commit it), made by its first build.
 * Chrome: the installed one or the browser at LIBKA_BROWSER. Run: node packages/cli/src/libka.ts ... (or libka
 * from the npm package @libka/cli).
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { normalize as normalizeUrlPath } from 'node:path/posix';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AXE_VERSION, formatReport, guardHtml, launchBrowser, type CheckResult, type GuardReport } from '@libka/guard';
import { linkTexts, remediate, type RemediateReport } from '@libka/pdf';
import { findVeraPdf, KNOWN_LIMITS, validatePdfs, veraPdfVersion, type VeraPdfResult } from '@libka/pdf/verapdf';
import { buildManifest, embedManifest, loadSigningKey, verifyHtml, type AiContent, type SigningKey, type Verification } from '@libka/guard/manifest';
import { conformance, conformanceMarkdown } from '@libka/guard/wcag';
import { checkDocx } from '@libka/guard/docx';
import { renderDocx, sniffPicture, type DocxPicture } from '@libka/docx';
import { OUTPUTS, outputsOf, parse, type Block, type LibkaDocument, type OutputName } from '@libka/model';
import { cleanDiagramSvg, MERMAID_CONFIG, renderManual, safeHref } from '@libka/render';
import { renderDeck, slides, type DeckLayout, type Slide } from '@libka/render/deck';
import { emptyFitting, FIT_ROUNDS, fitStep, measureSlides, type SlideFit } from '@libka/render/fit';
import { plainText } from '@libka/model';
import type { Browser } from 'playwright-core';
import { serveStatic } from './serve.ts';
import { doctor, formatDoctor, isBrowserMissing } from './doctor.ts';
import { asset, isHomeOrAbove, PACKAGED, projectRoot, projectTrustFile, readAsset, VERSION } from './assets.ts';

export { VERSION } from './assets.ts';
const posix = (p: string) => p.split(sep).join('/');

export type Target = 'manual' | 'deck';

/** One HTML output and what was made from it. */
export interface Output {
  html: string;
  pdf?: string;
  /** The Word file (manual only). */
  docx?: string;
  /** Guard report; absent with check: false. */
  report?: GuardReport;
  manifest?: string;
  /** PDF/UA validation of the PDF, or why it did not run (veraPDF not installed). */
  pdfua?: PdfUa | { skipped: string };
  /** The WCAG 2.2 / EN 301 549 report written next to the output (<name>.conformance.md). */
  conformance?: string;
}

/** Content marked as written by AI: summaries with source=ai (and their reviewer) and AI badges, with their section. */
export function aiContent(document: LibkaDocument): AiContent[] {
  const out: AiContent[] = [];
  let section = document.meta.title;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: string; source?: string; reviewedBy?: string; name?: string; attributes?: { variant?: string }; children?: unknown };
    if (n.type === 'summary' && n.source === 'ai') out.push({ kind: 'summary', section, ...(n.reviewedBy ? { reviewedBy: n.reviewedBy } : {}) });
    if (n.type === 'textDirective' && n.name === 'badge' && n.attributes?.variant === 'ai') out.push({ kind: 'badge', section, label: plainText((n.children ?? []) as never) });
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v);
  };
  for (const b of document.blocks) {
    if (b.type === 'heading') section = plainText(b.text);
    else if (b.type === 'section') section = b.title;
    walk(b);
  }
  return out;
}

/** Whether any block of the given type occurs (at any depth). */
function hasBlock(blocks: unknown, type: string): boolean {
  return JSON.stringify(blocks).includes(`"type":"${type}"`);
}

/** What veraPDF found: PDF/UA-1 (gating) and PDF/UA-2 (recorded). */
export interface PdfUa { validator: string; ua1: boolean; ua2: { compliant: boolean; failedRules: number } }

/** The manual's output at the top level; the deck's under `deck` when asked for. */
export interface BuildResult extends Partial<Output> {
  ok: boolean;
  problems: string[];
  deck?: Output;
}

/** The product version, which the tokens carry too (one version for everything). */
export const tokensVersion = (): string => VERSION;

/** A signing key a verifier knows: active, retired (it signed until that date, its manifests stay valid) or revoked. */
export interface TrustedKey { fingerprint: string; owner: string; added: string; retired?: string; revoked?: string }

/** The trusted-key list for a file: its project's own (.libka/trusted-keys.json), or LibKa's when the project has none. */
export function trustListFor(file: string): string {
  return projectTrustFile(projectRoot(file)) ?? asset('trusted-keys.json');
}

export function trustedKeys(file = asset('trusted-keys.json')): TrustedKey[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { keys: TrustedKey[] }).keys : [];
}

/** Keys whose manifests a verifier trusts: active and retired ones, never revoked ones (docs/admin/signing-keys.md). */
export function trustedFingerprints(keys = trustedKeys()): string[] {
  return keys.filter((k) => !k.revoked).map((k) => k.fingerprint);
}

/** What the trusted-key list says about a signer. */
export function keyStatus(fingerprint: string, keys = trustedKeys()): 'active' | 'retired' | 'revoked' | 'unknown' {
  const k = keys.find((x) => x.fingerprint === fingerprint);
  return !k ? 'unknown' : k.revoked ? 'revoked' : k.retired ? 'retired' : 'active';
}

/**
 * Lays out the deck so every slide fits (see @libka/render/fit): measured in Chrome and repeated until nothing
 * changes. The Studio runs the same steps in the author's browser.
 */
export async function fitDeck(base: Slide[], render: (layout: DeckLayout) => string, path: string, browser: Browser): Promise<string> {
  const layout = emptyFitting();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let html = '';
  try {
    for (let round = 0; round < FIT_ROUNDS; round++) {
      html = render(layout);
      writeFileSync(path, html);
      await page.goto(pathToFileURL(path).href);
      await page.evaluate(() => document.fonts.ready);
      const measured = await page.evaluate(`(${measureSlides.toString()})(document)`) as SlideFit[];
      if (!fitStep(base, layout, measured)) break;
    }
  } finally {
    await page.close();
  }
  return html;
}

/** Every diagram in the document, nested ones included, in reading order. */
export function diagramBlocks(value: unknown): Extract<Block, { type: 'diagram' }>[] {
  const out: Extract<Block, { type: 'diagram' }>[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    if ((v as { type?: string }).type === 'diagram') { out.push(v as Extract<Block, { type: 'diagram' }>); return; }
    for (const [k, x] of Object.entries(v)) if (k !== 'position' && x && typeof x === 'object') walk(x);
  };
  walk(value);
  return out;
}

/**
 * Draws the document's Mermaid diagrams to SVG in Chrome, with the LibKa fonts loaded so labels are measured
 * as they will be shown, and stores the cleaned SVG on each block. Returns one message per diagram that fails.
 */
export async function drawDiagrams(doc: LibkaDocument, browser: Browser): Promise<string[]> {
  const list = diagramBlocks(doc.blocks);
  if (!list.length) return [];
  const page = await browser.newPage();
  const shell = join(mkdtempSync(join(tmpdir(), 'libka-diagrams-')), 'diagrams.html');
  try {
    // a file page, so the fonts stylesheet can load its font files
    writeFileSync(shell, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(asset('fonts'), 'libka-fonts.css')).href}">`
      + `<style>${readAsset('lk-bridge.css')}</style></head><body></body></html>`);
    await page.goto(pathToFileURL(shell).href);
    await page.addScriptTag({ path: asset('mermaid.min.js') });
    await page.addScriptTag({ content: `window.lkCleanDiagramSvg = ${cleanDiagramSvg.toString()};` });
    const drawn = await page.evaluate(async ({ sources, config }) => {
      const w = window as unknown as { mermaid: { initialize(c: unknown): void; render(id: string, s: string): Promise<{ svg: string }> }; lkCleanDiagramSvg(s: string): string };
      w.mermaid.initialize(config);
      const font = getComputedStyle(document.documentElement).getPropertyValue('--lk-font-ui');
      await Promise.all(['400', '600', '700'].map((weight) => document.fonts.load(`${weight} 16px ${font}`)));
      await document.fonts.ready;
      const out: { svg?: string; error?: string }[] = [];
      for (const [i, source] of sources.entries()) {
        try { out.push({ svg: w.lkCleanDiagramSvg((await w.mermaid.render(`lk-diagram-${i + 1}`, source)).svg) }); }
        catch (e) { out.push({ error: String((e as Error)?.message ?? e).split('\n').filter(Boolean).slice(0, 3).join(' ') }); }
      }
      return out;
    }, { sources: list.map((d) => d.source), config: MERMAID_CONFIG });
    return drawn.flatMap((d, i) => {
      if (d.svg) { list[i]!.svg = d.svg; return []; }
      return [`diagram "${list[i]!.title || i + 1}" could not be drawn: ${d.error ?? 'no output'}`];
    });
  } finally {
    await page.close();
    rmSync(dirname(shell), { recursive: true, force: true });
  }
}

/** Every block Word gets as a drawing (diagrams, charts, UI specimens), nested ones included, in reading order. */
export function drawingBlocks(value: unknown): Block[] {
  const out: Block[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    const type = (v as { type?: string }).type;
    if (type === 'diagram' || type === 'chart' || type === 'ui') { out.push(v as Block); return; }
    for (const [k, x] of Object.entries(v)) if (k !== 'position' && x && typeof x === 'object') walk(x);
  };
  walk(value);
  return out;
}

/** Every figure and gallery image (the objects that hold its src), nested ones included, in reading order. */
function imageRefs(value: unknown, out: { src: string }[] = []): { src: string }[] {
  if (Array.isArray(value)) value.forEach((v) => imageRefs(v, out));
  else if (value && typeof value === 'object') {
    const v = value as { type?: string; src?: unknown; images?: { src: string }[] };
    if (v.type === 'figure' && typeof v.src === 'string') out.push(v as { src: string });
    if (v.type === 'gallery') v.images?.forEach((i) => out.push(i));
    for (const [k, x] of Object.entries(v)) if (k !== 'position' && k !== 'images' && x && typeof x === 'object') imageRefs(x, out);
  }
  return out;
}

/** The src of every figure and gallery image, nested ones included. */
function imageSources(value: unknown): Set<string> {
  return new Set(imageRefs(value).map((r) => r.src));
}

/**
 * An image's path as a file path, as a server finds it: each run of escapes is decoded on its own ("%20" is a space,
 * "%C3%A9" is "é"), and a "%" that starts no escape ("100%.svg") or a run that is no text stays as written.
 */
function decodePath(href: string): string {
  return href.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => { try { return decodeURIComponent(run); } catch { return run; } });
}

/**
 * The pictures the Word file needs: local PNG, JPEG and GIF images as they are, SVG and other images drawn as PNG in
 * Chrome, and diagrams, charts and UI specimens drawn from the web page's own rendering (light theme, twice the
 * pixels for print). Web addresses are not fetched: the Word file shows the image's alt text in their place.
 */
async function docxPictures(doc: LibkaDocument, sourceDir: string, getBrowser: () => Promise<Browser>): Promise<{ pictures: Map<string, DocxPicture>; drawings: Map<Block, DocxPicture> }> {
  const pictures = new Map<string, DocxPicture>();
  const drawings = new Map<Block, DocxPicture>();
  const toDraw: { src: string; path: string }[] = [];
  for (const src of imageSources(doc.blocks)) {
    const href = safeHref(src);
    if (href === null || /^(https?:|mailto:|#|\/|data:)/i.test(href)) continue;
    const path = resolve(sourceDir, decodePath(href));
    if (!existsSync(path)) continue;
    const data = readFileSync(path);
    const known = sniffPicture(data);
    if (known) pictures.set(src, { data, ...known });
    else toDraw.push({ src, path });
  }
  const blocks = drawingBlocks(doc.blocks);
  if (!toDraw.length && !blocks.length) return { pictures, drawings };

  const context = await (await getBrowser()).newContext({ deviceScaleFactor: 2, bypassCSP: true, viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  const dir = mkdtempSync(join(tmpdir(), 'libka-docx-'));
  try {
    for (const img of toDraw) {
      writeFileSync(join(dir, 'image.html'), `<!doctype html><html><body style="margin:0;background:#fff"><img id="i" src="${pathToFileURL(img.path).href}"></body></html>`);
      await page.goto(pathToFileURL(join(dir, 'image.html')).href, { waitUntil: 'load' });
      const box = await page.locator('#i').boundingBox();
      if (!box || !box.width) continue;
      pictures.set(img.src, { data: await page.locator('#i').screenshot({ type: 'png' }), type: 'png', width: Math.round(box.width), height: Math.round(box.height) });
    }
    if (blocks.length) {
      // the blocks rendered as on the web page, then each drawing shot without its caption, data table or source
      const sheet: LibkaDocument = { meta: { title: doc.meta.title, lang: doc.meta.lang }, blocks };
      const html = renderManual(sheet, { styles: { ...styles(), manual: readAsset('manual.css') }, fontsHref: pathToFileURL(join(asset('fonts'), 'libka-fonts.css')).href });
      writeFileSync(join(dir, 'drawings.html'), html);
      await page.goto(pathToFileURL(join(dir, 'drawings.html')).href, { waitUntil: 'load' });
      await page.addStyleTag({ content: '.lk-manual-content figcaption, .lk-manual-content details, .lk-manual-content .lk-visually-hidden { display: none !important; } .lk-manual-content figure { margin: 0 !important; }' });
      await page.evaluate(() => document.fonts.ready);
      const targets = page.locator('.lk-manual-content > .lk-diagram > .lk-diagram-art, .lk-manual-content > .lk-chart, .lk-manual-content > .lk-ui > .lk-ui-stages');
      const count = await targets.count();
      if (count !== blocks.length) throw new Error(`docx: ${blocks.length} drawings expected, ${count} rendered`);
      for (const [i, b] of blocks.entries()) {
        const el = targets.nth(i);
        const box = await el.boundingBox();
        if (!box || !box.width) continue;
        drawings.set(b, { data: await el.screenshot({ type: 'png' }), type: 'png', width: Math.round(box.width), height: Math.round(box.height) });
      }
    }
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
  return { pictures, drawings };
}

/**
 * Copy the relative, local images of figures and galleries into the output folder; report missing ones on their line.
 * An image outside the document's folder (`../images/a.png`) would land outside the output folder: it goes to
 * `_up/images/a.png` inside it instead (one `_up` per level), and the document points at the copy. A build never
 * writes outside its output folder.
 */
function placeImages(doc: LibkaDocument, text: string, sourceDir: string, outDir: string, file: string): string[] {
  const problems: string[] = [];
  const lines = text.split(/\r?\n/);
  const at = (src: string) => {
    const i = lines.findIndex((l) => l.includes(`](${src}`));
    return i < 0 ? file : `${file}:${i + 1}`;
  };
  for (const ref of imageRefs(doc.blocks)) {
    const href = safeHref(ref.src);
    if (href === null || /^(https?:|mailto:|#|\/)/i.test(href)) continue;
    const from = resolve(sourceDir, decodePath(href));
    if (!existsSync(from) || !statSync(from).isFile()) {
      problems.push(`${at(ref.src)}: image not found: ${ref.src}`);
      continue;
    }
    if (resolve(sourceDir) === resolve(outDir)) continue;
    // a browser reads "\" in a path as "/"; leading ".." segments become "_up" folders inside the output folder
    const parts = normalizeUrlPath(href.replace(/\\/g, '/')).split('/');
    const up = parts.findIndex((p) => p !== '..');
    const target = [...parts.slice(0, Math.max(up, 0)).map(() => '_up'), ...parts.slice(Math.max(up, 0))].join('/');
    const to = resolve(outDir, decodePath(target));
    const rel = relative(outDir, to);
    if (up < 0 || !rel || rel.startsWith('..') || isAbsolute(rel)) {
      problems.push(`${at(ref.src)}: image path leaves the output folder: ${ref.src}`);
      continue;
    }
    if (up > 0) ref.src = target;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  return problems;
}

/**
 * Prints a built page to a tagged PDF, then repairs what PDF/UA-1 needs and Chrome does not write (metadata, link
 * descriptions, role map, list bodies, artifacts; see @libka/pdf).
 */
export async function printPdf(htmlPath: string, pdfPath: string, browser?: Browser): Promise<RemediateReport> {
  const b = browser ?? (await launchBrowser());
  try {
    const page = await b.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // a deck prints every slide; the page size comes from its CSS (@page 1280px 720px, A4 for manuals)
    await page.evaluate(() => (window as unknown as { libkaDeck?: { showAll(): void } }).libkaDeck?.showAll());
    // every tab and accordion answer on paper
    await page.evaluate(() => (window as unknown as { libka?: { expandAll(): void } }).libka?.expandAll());
    const printed = await page.pdf({ printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
    const { title, lang } = await page.evaluate(() => ({ title: document.title, lang: document.documentElement.lang || 'en' }));
    await page.close();
    const { pdf, report } = await remediate(printed, { title, lang, links: linkTexts(readFileSync(htmlPath, 'utf8')) });
    writeFileSync(pdfPath, pdf);
    return report;
  } finally {
    if (!browser) await b.close();
  }
}

/**
 * PDF/UA checks of built PDFs as Guard results: PDF/UA-1 gates (rules on the known-limits list are reported, not
 * failed), PDF/UA-2 is recorded. Null when veraPDF is not installed.
 */
export function pdfuaChecks(pdfs: string[]): { checks: CheckResult[]; ua2: VeraPdfResult[]; validator: string } | null {
  const launcher = findVeraPdf();
  const validator = veraPdfVersion(launcher);
  const ua1 = validatePdfs(pdfs, 'ua1', launcher);
  const ua2 = validatePdfs(pdfs, 'ua2', launcher);
  if (!validator || !ua1 || !ua2) return null;
  return {
    validator, ua2,
    checks: ua1.map((r) => ({
      id: 'pdfua' as const, mode: 'standard' as const, title: `PDF/UA-1, ${validator}`, checked: r.passedRules + r.failedRules,
      skipped: r.failures.filter((f) => KNOWN_LIMITS[f.rule]).length,
      violations: r.failures.filter((f) => !KNOWN_LIMITS[f.rule]).map((f) => ({ rule: `pdfua-${f.rule}`, message: `ISO 14289-1 ${f.clause} (test ${f.test}): ${f.description} (${f.count}×)`, target: 'pdf' })),
    })),
  };
}

const styles = () => ({
  tokens: readAsset('libka-tokens.css'),
  bridge: readAsset('lk-bridge.css'),
  components: readAsset('components.css'),
});

/** The web page of a document, rendered without Chrome (diagrams stay unrendered): for checks of what readers see. */
export function pageHtml(markdown: string): string {
  return renderManual(parse(markdown).document, { styles: { ...styles(), manual: readAsset('manual.css') } });
}

export interface BuildOptions {
  out?: string;
  /** false: no Guard, no signature. */
  check?: boolean;
  /** Replaces the outputs the document asks for (front matter "outputs", default web and pdf). */
  outputs?: OutputName[];
  /** Add an output to the list, whatever it is. */
  pdf?: boolean;
  deck?: boolean;
  docx?: boolean;
}

/** What a build makes: the given list or the document's own, plus the added ones, in the canonical order. */
export function chosenOutputs(document: LibkaDocument, options: BuildOptions): OutputName[] {
  const list = new Set(options.outputs ?? outputsOf(document.meta));
  for (const o of ['pdf', 'deck', 'docx'] as const) if (options[o]) list.add(o);
  return OUTPUTS.filter((o) => list.has(o));
}

export async function build(input: string, options: BuildOptions = {}): Promise<BuildResult> {
  const source = resolve(input);
  const file = posix(relative(process.cwd(), source)) || basename(source);
  if (!existsSync(source)) return { ok: false, problems: [`${file}: file not found`] };
  const text = readFileSync(source, 'utf8');
  const { document, problems } = parse(text);
  const messages = problems.map((p) => `${file}:${p.line}: ${p.message}`);
  const want = new Set(chosenOutputs(document, options));
  if ((want.has('pdf') || want.has('docx')) && !want.has('web')) {
    messages.push(`${file}: the PDF and the Word file are made from the web page and signed with it: add web to the outputs`);
  }
  // the home folder holds other tools' files (some keep a ~/.libka of their own): never a project's key there
  if (options.check !== false && isHomeOrAbove(projectRoot(source))) {
    messages.push(`${file}: the document is directly in your home folder, where LibKa will not keep a signing key: move it into a folder of its own (npm create libka makes one)`);
  }
  const outDir = resolve(options.out ?? join(dirname(source), 'dist'));
  mkdirSync(outDir, { recursive: true });
  messages.push(...placeImages(document, text, dirname(source), outDir, file));
  if (messages.length) return { ok: false, problems: messages };

  const name = basename(source, extname(source));
  const fontsHref = fontsFor(outDir);
  const check = options.check !== false;
  // Chrome is needed to draw diagrams, to check and to print; it is started once, only when needed
  let browser: Browser | undefined;
  const pages: { target: Target; path: string; html: string }[] = [];
  const outputs: Output[] = [];
  let result: BuildResult;
  try {
    if (diagramBlocks(document.blocks).length) {
      browser = await launchBrowser();
      const errors = await drawDiagrams(document, browser);
      if (errors.length) return { ok: false, problems: errors.map((e) => `${file}: ${e}`) };
    }
    if (want.has('web')) {
      pages.push({
        target: 'manual', path: join(outDir, `${name}.html`),
        html: renderManual(document, { styles: { ...styles(), manual: readAsset('manual.css') }, fontsHref, source: basename(source) }),
      });
    }
    if (want.has('deck')) {
      // slides are measured in Chrome and laid out to fit (shrunk a little or continued on new slides)
      const deckPath = join(outDir, `${name}.deck.html`);
      const deckStyles = { ...styles(), deck: readAsset('deck.css') };
      browser ??= await launchBrowser();
      pages.push({ target: 'deck', path: deckPath, html: await fitDeck(slides(document), (layout) => renderDeck(document, { styles: deckStyles, fontsHref, layout }), deckPath, browser) });
    }
    for (const p of pages) writeFileSync(p.path, p.html);
    outputs.push(...pages.map((p) => ({ html: p.path })));
    result = { ok: true, problems: [] };
    collect(result, pages, outputs);
    if (!check && !want.has('pdf') && !want.has('docx')) return result;

    browser ??= await launchBrowser();
    if (check) {
      for (const [i, p] of pages.entries()) {
        const report = outputs[i]!.report = await guardHtml(p.path, browser);
        result.problems.push(...report.checks.flatMap((c) => c.violations.map((v) =>
          `${file}: guard${p.target === 'deck' ? ' (deck)' : ''} ${c.id}${c.mode === 'more-contrast' ? ' (more contrast)' : ''}: ${v.message} [${v.target}]`)));
      }
      if (result.problems.length) {
        result.ok = false;
        collect(result, pages, outputs);
        return result;   // unsigned pages stay for inspection; no PDF, no manifest
      }
    }
    if (want.has('pdf')) {
      for (const [i, p] of pages.entries()) {
        outputs[i]!.pdf = p.path.replace(/\.html$/, '.pdf');
        await printPdf(p.path, outputs[i]!.pdf!, browser);
      }
      if (check) {
        // when Java and veraPDF are found, every PDF is validated against PDF/UA-1; a failure leaves the outputs
        // unsigned, like any finding (without them the PDF is marked as not validated)
        const ua = pdfuaChecks(outputs.map((o) => o.pdf!));
        if (!ua) {
          const msg = 'PDF/UA not checked: veraPDF was not found (libka doctor says how to install it)';
          if (process.env.LIBKA_REQUIRE_VERAPDF === '1') result.problems.push(`${file}: ${msg}`);
          else console.log(`libka: ${msg}`);
          // the manifest and the conformance report say so too
          for (const out of outputs) out.pdfua = { skipped: 'veraPDF was not found' };
        } else {
          for (const [i, p] of pages.entries()) {
            const out = outputs[i]!;
            const check1 = ua.checks[i]!;
            out.report!.checks.push(check1);
            out.report!.passed = out.report!.passed && check1.violations.length === 0;
            out.pdfua = { validator: ua.validator, ua1: check1.violations.length === 0, ua2: { compliant: ua.ua2[i]!.compliant, failedRules: ua.ua2[i]!.failedRules } };
            result.problems.push(...check1.violations.map((v) => `${file}: guard${p.target === 'deck' ? ' (deck)' : ''} pdfua: ${v.message}`));
          }
        }
        if (result.problems.length) {
          result.ok = false;
          collect(result, pages, outputs);
          return result;   // the PDFs stay for inspection, unsigned
        }
      }
    }
    if (want.has('docx')) {
      // the Word file belongs to the web page: made from the same document, checked, signed in its manifest
      const i = pages.findIndex((p) => p.target === 'manual');
      const out = outputs[i]!;
      // every local image is in the output folder by now (placeImages), at the src the document holds
      const { pictures, drawings } = await docxPictures(document, outDir, async () => (browser ??= await launchBrowser()));
      const epoch = Number(process.env.SOURCE_DATE_EPOCH);
      const docx = await renderDocx(document, {
        picture: (src) => pictures.get(src), drawing: (b) => drawings.get(b),
        ...(Number.isFinite(epoch) && process.env.SOURCE_DATE_EPOCH ? { date: new Date(epoch * 1000) } : {}),
      });
      out.docx = pages[i]!.path.replace(/\.html$/, '.docx');
      writeFileSync(out.docx, docx);
      if (check) {
        const dc = checkDocx(docx);
        out.report!.checks.push(dc);
        out.report!.passed = out.report!.passed && dc.violations.length === 0;
        result.problems.push(...dc.violations.map((v) => `${file}: guard docx ${v.rule}: ${v.message} [${v.target}]`));
        if (result.problems.length) {
          result.ok = false;
          collect(result, pages, outputs);
          return result;   // the Word file stays for inspection, unsigned
        }
      }
    }
  } finally {
    await browser?.close();
  }
  if (check) {
    const key = projectKey(projectRoot(source));
    const ai = aiContent(document);
    const facts = { media: hasBlock(document.blocks, 'video'), forms: false };   // LibKa outputs hold no forms (UI specimens are inert)
    for (const [i, p] of pages.entries()) {
      const out = outputs[i]!;
      const wcag = conformance(out.report!, facts);
      const manifest = buildManifest({
        target: p.target, sourceName: basename(source), source: text, tokensVersion: tokensVersion(), html: p.html,
        report: out.report!, axe: AXE_VERSION, key, ...(out.pdf ? { pdf: readFileSync(out.pdf) } : {}), ...(out.docx ? { docx: readFileSync(out.docx) } : {}),
        ...(out.pdfua ? { pdfua: out.pdfua } : {}),
        conformance: wcag, ai,
      });
      writeFileSync(p.path, embedManifest(p.html, manifest));
      out.manifest = p.path.replace(/\.html$/, '.manifest.json');
      writeFileSync(out.manifest, JSON.stringify(manifest, null, 2) + '\n');
      // the same result for people: every WCAG 2.2 A/AA criterion with its EN 301 549 clause and status
      out.conformance = p.path.replace(/\.html$/, '.conformance.md');
      writeFileSync(out.conformance, conformanceMarkdown(document.meta.title, p.target, wcag, Boolean(out.pdf), Boolean(out.docx), out.pdfua && 'skipped' in out.pdfua ? out.pdfua.skipped : undefined));
    }
  }
  collect(result, pages, outputs);
  return result;
}

/**
 * The fonts stylesheet a page links. In the repository the page links the repository's fonts; from the npm
 * package the fonts are copied into the output folder (fonts/), so the folder works wherever it is copied.
 */
function fontsFor(outDir: string): string {
  if (!PACKAGED) return posix(relative(outDir, join(asset('fonts'), 'libka-fonts.css')));
  cpSync(asset('fonts'), join(outDir, 'fonts'), { recursive: true });
  return 'fonts/libka-fonts.css';
}

/**
 * The project's signing key (.libka/signing-key.pem, or LIBKA_SIGNING_KEY). The first key a project gets is
 * trusted in its own list (.libka/trusted-keys.json, written then), so the project's own outputs verify as
 * trusted; a key made later (another computer, CI) is not added: the build says how to add it.
 */
export function projectKey(project: string, log: (m: string) => void = (m) => console.log(`libka: ${m}`)): SigningKey {
  const fresh = !process.env.LIBKA_SIGNING_KEY && !existsSync(join(project, '.libka', 'signing-key.pem'));
  const key = loadSigningKey(project, log);
  if (!fresh) return key;
  // the key stays out of git in any repository, not only in a project made by the starter
  const ignore = join(project, '.libka', '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '# signing keys never leave this computer (an old one kept during a rotation too); trusted-keys.json is meant to be committed\n*.pem\n');
  const list = projectTrustFile(project);
  if (!list) {
    const file = join(project, '.libka', 'trusted-keys.json');
    writeFileSync(file, JSON.stringify({
      $description: 'Signing keys whose LibKa manifests this project trusts (public fingerprints only). Commit this file; never commit signing-key.pem. A replaced key gets "retired" (the date it stopped signing), a compromised one "revoked".',
      keys: [{ fingerprint: key.fingerprint, owner: 'the first key of this project', added: new Date().toISOString().slice(0, 10) }],
    }, null, 2) + '\n');
    log(`trusted it in ${rel(file)} (key ${key.fingerprint}): commit that file, never the key`);
  } else {
    log(list.endsWith(join('governance', 'trusted-keys.json'))
      ? `this key (${key.fingerprint}) is not in ${rel(list)}, the LibKa maintainers' list: what it signs verifies as not trusted, which is expected while you develop`
      : `this key (${key.fingerprint}) is not in ${rel(list)}: add it there to trust what it signs`);
  }
  return key;
}

/** The manual's output at the top level of a result, the deck's under `deck`. */
function collect(result: BuildResult, pages: { target: Target }[], outputs: Output[]): void {
  pages.forEach((p, i) => { if (p.target === 'manual') Object.assign(result, outputs[i]); else result.deck = outputs[i]!; });
}

export interface LintResult {
  ok: boolean;
  problems: { line: number; message: string }[];
  title: string;
  /** What `build` will make (front matter "outputs", default web and pdf). */
  outputs: OutputName[];
  outline: { level: number; text: string }[];
  blocks: Record<string, number>;
  slides: number;
  /** Advice, not errors: slides that will probably not fit (the build measures them exactly). */
  hints: string[];
}

/** About this many words fill a slide; the build's Guard measures the real fit. */
export const SLIDE_WORDS = 130;

function words(value: unknown): number {
  let n = 0;
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== 'object') return;
    const o = x as { type?: string; value?: unknown; items?: unknown[]; layout?: string; theme?: string };
    // blocks that take space without words, in word-equivalents (measured on 1280×720 slides)
    if (o.type === 'figure' || o.type === 'video') n += 60;
    if (o.type === 'chart' || o.type === 'diagram') n += 80;
    if (o.type === 'ui') n += (o.items?.length ?? 0) * (o.layout === 'stack' ? 30 : 8);
    if (o.type === 'release') n += ((o as { groups?: unknown[] }).groups?.length ?? 0) * 10;   // a label and spacing per group
    if (o.type === 'comparison') {
      // rows are tall (padding, icons) and the mark words are generated, so they are not in the text
      const rows = (o as { rows?: { mark?: string }[][] }).rows ?? [];
      n += (rows.length + 1) * 10 + rows.flat().filter((c) => c.mark).length * 2;
    }
    if (typeof o.value === 'string') n += o.type === 'code' ? o.value.split('\n').length * 4 : o.value.split(/\s+/).filter(Boolean).length;
    for (const [k, v] of Object.entries(o)) if (k !== 'value' && v && typeof v === 'object') walk(v);
  };
  walk(value);
  return n;
}

/** More callouts than this in one ## section stop standing out (Microsoft Learn's advice). */
export const SECTION_CALLOUTS = 2;
/** A horizontal timeline on a slide holds about this many items. */
export const TIMELINE_ITEMS = 6;
/** An agenda slide holds about this many sections and parts. */
export const AGENDA_ENTRIES = 10;
/** A slide body holds about this many lines of text, at about 12 words a line. */
export const SLIDE_LINES = 11;

/** Lines that blocks take on a slide: about 12 words a line, and every list item starts a line of its own. */
export function slideLines(body: unknown[]): number {
  return body.reduce((n: number, b) => {
    const items = b && typeof b === 'object' && 'items' in b && Array.isArray((b as { items: unknown }).items) ? (b as { items: unknown[] }).items : null;
    return n + (items ? items.reduce((m: number, i) => m + Math.max(1, Math.ceil(words(i) / 12)), 0) : Math.max(1, Math.ceil(words(b) / 12)));
  }, 0);
}

/** Advice on the document frame: crowded callouts and a review date that has passed. */
function frameHints(document: LibkaDocument, today: string): string[] {
  const hints: string[] = [];
  const count = (value: unknown): number => {
    if (Array.isArray(value)) return value.reduce((n: number, v) => n + count(v), 0);
    if (!value || typeof value !== 'object') return 0;
    return ((value as { type?: string }).type === 'callout' ? 1 : 0)
      + Object.values(value).reduce((n: number, v) => n + (v && typeof v === 'object' ? count(v) : 0), 0);
  };
  let name = 'before the first section';
  let n = 0;
  const flush = () => {
    if (n > SECTION_CALLOUTS) hints.push(`section "${name}" has ${n} callouts; more than ${SECTION_CALLOUTS} stop standing out: keep the most important and turn the rest into text`);
  };
  for (const b of document.blocks) {
    if ((b.type === 'heading' && b.level === 2) || b.type === 'section') {
      flush();
      name = b.type === 'section' ? b.title : plainText(b.text);
      n = 0;
    } else n += count(b);
  }
  flush();
  for (const b of document.blocks) {
    if (b.type === 'timeline' && b.items.length > TIMELINE_ITEMS) {
      hints.push(`timeline${b.caption ? ` "${b.caption}"` : ''} has ${b.items.length} items; a slide shows about ${TIMELINE_ITEMS} side by side: split it into two timelines or use a :::table`);
    }
    if (b.type === 'accordion') {
      for (const item of b.items) {
        if (slideLines(item.body) + 1 > SLIDE_LINES) hints.push(`accordion item "${item.title}" is taller than a slide (about ${slideLines(item.body) + 1} lines; a slide holds about ${SLIDE_LINES}): on slides the build opens it and continues the answer on a new slide; nothing to change, and the web page and the PDF keep it folded`);
      }
    }
  }
  const agenda = document.blocks.filter((b) => (b.type === 'heading' && b.level === 2) || b.type === 'section').length;
  if (agenda > AGENDA_ENTRIES && document.blocks.some((b) => b.type === 'toc')) {
    hints.push(`the contents list ${agenda} sections and parts; an agenda slide holds about ${AGENDA_ENTRIES}: the build continues it on a second slide; nothing to change`);
  }
  const due = document.meta.nextReview;
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < today) {
    hints.push(`the review was due on ${due} (next-review): review the document, then update reviewed and next-review`);
  }
  return hints;
}

/** Parse only: what an author or an AI agent needs to fix before building. `today` is YYYY-MM-DD. */
export function lint(markdown: string, today = new Date().toISOString().slice(0, 10)): LintResult {
  const { document, problems } = parse(markdown);
  const deck = slides(document);
  const blocks: Record<string, number> = {};
  const walk = (list: unknown): void => {
    if (Array.isArray(list)) { list.forEach(walk); return; }
    if (list && typeof list === 'object') {
      const t = (list as { type?: unknown }).type;
      if (typeof t === 'string' && !['text', 'strong', 'emphasis', 'inlineCode', 'link', 'break', 'delete', 'image', 'textDirective', 'footnoteReference', 'citation'].includes(t)) blocks[t] = (blocks[t] ?? 0) + 1;
      for (const v of Object.values(list)) if (v && typeof v === 'object') walk(v);
    }
  };
  walk(document.blocks);
  return {
    ok: problems.length === 0, problems, title: document.meta.title, outputs: outputsOf(document.meta),
    outline: document.blocks.flatMap((b) => (b.type === 'heading' ? [{ level: b.level, text: plainText(b.text) }]
      : b.type === 'section' ? [{ level: 2, text: b.title }] : b.type === 'release' ? [{ level: 2, text: b.version }] : [])),
    blocks, slides: deck.length,
    hints: [...deck.flatMap((s, i) => {
      const n = words(s.body);
      return n > SLIDE_WORDS ? [`slide ${i + 1} ("${typeof s.heading === 'string' ? s.heading : plainText(s.heading)}") has about ${n} words; a slide holds about ${SLIDE_WORDS - 10}: the build will shrink it a little or continue it on a new slide; to choose the break yourself, split it with ###`] : [];
    }), ...frameHints(document, today)],
  };
}

export function verify(htmlPath: string, pdfPath?: string, docxPath?: string): Verification {
  return verifyHtml(readFileSync(htmlPath, 'utf8'), trustedFingerprints(trustedKeys(trustListFor(htmlPath))), pdfPath ? readFileSync(pdfPath) : undefined, docxPath ? readFileSync(docxPath) : undefined);
}

const USAGE = `usage:
  libka build <manual.md> [--out <dir>] [--outputs web,pdf,deck,docx] [--pdf] [--deck] [--docx] [--no-check]
  libka lint <manual.md> [--json]
  libka check <page.html>
  libka verify <page.html> [--pdf <file.pdf>] [--docx <file.docx>] [--require-trusted]
  libka studio [--port <n>] [--dir <folder>]
  libka doctor
  libka --version`;
const rel = (p: string) => posix(relative(process.cwd(), p));

/** A wrong command line: main prints the message and the usage and exits 2. */
class UsageError extends Error {}
/** What each option takes, for the message when its value is missing. */
const NEEDS: Record<string, string> = {
  '--out': 'a folder', '--outputs': 'a list such as web,pdf', '--pdf': 'a file', '--docx': 'a file', '--port': 'a port number', '--dir': 'a folder',
};
/** The value after an option; an option at the end, or followed by another option, is a usage error. */
export function optionValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) throw new UsageError(`${name} needs ${NEEDS[name] ?? 'a value'}`);
  return value;
}
/** The commands that take a document or a page (studio, doctor and version are handled before them). */
const COMMANDS = ['build', 'lint', 'check', 'verify'];

async function main(argv: string[]): Promise<number> {
  try {
    return await run(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`libka: ${e.message}`);
    console.error(USAGE);
    return 2;
  }
}

async function run(argv: string[]): Promise<number> {
  const [command, input, ...rest] = argv;
  const option = (name: string) => optionValue(rest, name);
  if (command === undefined || command === '--help' || command === '-h' || command === 'help') { console.log(USAGE); return 0; }
  if (command === 'studio') return studio(argv.slice(1));
  if (command === '--version' || command === '-v' || command === 'version') { console.log(VERSION); return 0; }
  if (command === 'doctor') {
    const findings = await doctor();
    console.log(formatDoctor(findings));
    return findings.some((x) => x.required && !x.ok) ? 1 : 0;
  }
  if (!COMMANDS.includes(command)) throw new UsageError(`unknown command "${command}"`);
  if (!input || input.startsWith('--')) throw new UsageError(`${command} needs ${command === 'check' || command === 'verify' ? 'a page' : 'a file'}`);
  if (command === 'lint') {
    const file = resolve(input);
    if (!existsSync(file)) { console.error(`${input}: file not found`); return 1; }
    const r = lint(readFileSync(file, 'utf8'));
    if (rest.includes('--json')) console.log(JSON.stringify(r, null, 2));
    else {
      for (const p of r.problems) console.error(`${rel(file)}:${p.line}: ${p.message}`);
      for (const h of r.hints) console.log(`hint: ${h}`);
      console.log(`libka: ${r.problems.length ? `${r.problems.length} problem(s)` : 'no problems'}; builds ${r.outputs.join(', ')}; ${r.outline.filter((h) => h.level === 2).length} sections, ${r.slides} slides; ` +
        Object.entries(r.blocks).filter(([t]) => !['paragraph', 'heading', 'list'].includes(t)).map(([t, n]) => `${n} ${t}`).join(', '));
    }
    return r.ok ? 0 : 1;
  }
  if (command === 'check') {
    if (!/^https?:\/\//.test(input) && !existsSync(resolve(input))) { console.error(`libka: ${input}: file not found`); return 1; }
    const report = await guardHtml(/^https?:\/\//.test(input) ? input : resolve(input));
    console.log(formatReport(report));
    console.log(`libka: Guard ${report.passed ? 'passed' : 'FAILED'}`);
    return report.passed ? 0 : 1;
  }
  if (command === 'verify') {
    const pdf = option('--pdf');
    const docx = option('--docx');
    for (const f of [input, pdf, docx]) if (f && !existsSync(resolve(f))) { console.error(`libka: ${f}: file not found`); return 1; }
    const v = verify(resolve(input), pdf ? resolve(pdf) : undefined, docx ? resolve(docx) : undefined);
    for (const p of v.problems) console.error(`  ✗ ${p}`);
    if (!v.ok) { console.error(`libka: ${rel(resolve(input))} does NOT verify`); return 1; }
    const m = v.manifest!;
    const list = trustListFor(resolve(input));
    const status = keyStatus(v.fingerprint!, trustedKeys(list));   // the fingerprint of the key that signed, not the one the manifest claims
    const listName = list === asset('trusted-keys.json') ? "LibKa's trusted keys (the project has no .libka/trusted-keys.json)" : rel(list);
    const who = { active: ', trusted', retired: ', trusted (a retired key: it signed before it was replaced)', revoked: ', REVOKED key: not trusted', unknown: `, NOT in ${listName}` }[status];
    console.log(`  ${status === 'revoked' ? '✗' : '✓'} signature valid (key ${v.fingerprint}${who})`);
    console.log(`  ✓ HTML${[pdf ? 'PDF' : '', docx ? 'Word file' : ''].filter(Boolean).map((x, i, a) => `${i === a.length - 1 ? ' and' : ','} ${x}`).join('')} unchanged since signing`);
    console.log(`  ✓ ${m.checks.length} checks passed (axe-core ${m.guard.axe}, tokens ${m.tokens.version}, source ${m.source.name})`);
    if (m.pdfua && 'skipped' in m.pdfua) console.log(`  ! PDF/UA-1 not checked when it was built (${m.pdfua.skipped})`);
    if (!v.trusted && rest.includes('--require-trusted')) { console.error('libka: signer is not trusted'); return 1; }
    return 0;
  }
  const out = option('--out');
  const list = option('--outputs');
  const outputs = list === undefined ? undefined : list.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);
  const unknown = outputs?.filter((o) => !(OUTPUTS as readonly string[]).includes(o)) ?? [];
  if (outputs && (!outputs.length || unknown.length)) {
    console.error(`libka: --outputs takes a comma-separated list of ${OUTPUTS.join(', ')}${unknown.length ? ` (unknown: ${unknown.join(', ')})` : ''}`);
    return 2;
  }
  const result = await build(input, {
    ...(out ? { out } : {}), ...(outputs ? { outputs: outputs as OutputName[] } : {}),
    pdf: rest.includes('--pdf'), deck: rest.includes('--deck'), docx: rest.includes('--docx'), check: !rest.includes('--no-check'),
  });
  if (result.report) console.log(formatReport(result.report));
  if (result.deck?.report) console.log(`deck:\n${formatReport(result.deck.report)}`);
  if (!result.ok) {
    for (const p of result.problems) console.error(p);
    console.error(result.report
      ? `libka: Guard found ${result.problems.length} problem(s); the outputs are unsigned, for inspection only`
      : `libka: ${result.problems.length} problem(s), nothing written`);
    return 1;
  }
  for (const p of [result.html, result.pdf, result.docx, result.manifest, result.deck?.html, result.deck?.pdf, result.deck?.manifest]) if (p) console.log(`libka: wrote ${rel(p)}`);
  if (!result.manifest) console.log('libka: not checked (--no-check), so not signed');
  return 0;
}

/** `libka studio`: serves the built Studio on localhost until stopped. */
async function studio(args: string[]): Promise<number> {
  const option = (name: string) => optionValue(args, name);
  const dir = resolve(option('--dir') ?? asset('studio'));
  const port = Number(option('--port') ?? 5178);
  if (!existsSync(join(dir, 'index.html'))) {
    console.error(PACKAGED ? `libka: no Studio in ${rel(dir)}` : `libka: no Studio in ${rel(dir)}; build it first with: node apps/studio/build.mjs`);
    return 1;
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) { console.error('libka: --port takes a port number'); return 2; }
  const served = await serveStatic(dir, port).catch((e: NodeJS.ErrnoException) => {
    console.error(e.code === 'EADDRINUSE' ? `libka: port ${port} is in use; choose another with --port` : `libka: ${e.message}`);
    return null;
  });
  if (!served) return 1;
  console.log(`libka: LibKa Studio at ${served.url.replace('127.0.0.1', 'localhost')} (Ctrl+C stops it)`);
  console.log('libka: documents stay in that browser; open the address there to install the Studio as an app');
  return new Promise<number>((done) => process.once('SIGINT', () => { void served.close().then(() => done(0)); }));
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    if (isBrowserMissing(e)) console.error(`libka: Chrome did not start (${String((e as Error).message).split('\n')[0]})\nlibka: run libka doctor to see what is missing and how to install it`);
    else console.error(e);
    process.exit(1);
  });
}
