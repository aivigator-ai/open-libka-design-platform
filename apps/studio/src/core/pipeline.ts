/**
 * From the source to what the author sees: parse, draw diagrams, render the page and the deck, fit the slides as the
 * build does, then run Guard. Uses the real packages: @libka/model parses, @libka/render renders, and the Guard rules
 * from @libka/guard/scan check in the browser with axe-core. The Studio does not validate PDFs with veraPDF or sign.
 */
import { batch } from '@preact/signals';
import { parse, type Block, type LibkaDocument, type Problem } from '@libka/model';
import { cleanDiagramSvg, MERMAID_CONFIG, renderManual } from '@libka/render';
import { renderDeck, slides } from '@libka/render/deck';
import { emptyFitting, FIT_ROUNDS, fitStep } from '@libka/render/fit';
import { fontsHref, styles } from 'studio:assets';
import * as s from '../state/store.ts';
import { normalize } from '../storage/paths.ts';
import { agent, frame, load } from './frames.ts';
import { scheduleGuard } from './guard.ts';

/** Points the page's local file references at the files the Studio holds (object URLs for previews, data URLs for exports). */
export function withFiles(html: string, url: (path: string) => string | undefined): string {
  return html.replace(/(<(?:img|video|source|track)\b[^>]*?\s(?:src|poster)=")([^"]+)(")/g, (m, a: string, src: string, b: string) => {
    const path = normalize(src.replace(/&amp;/g, '&'));
    const found = path ? url(path) : undefined;
    return found ? `${a}${found}${b}` : m;
  });
}
export const previewUrl = (path: string): string | undefined => s.files.value.get(path)?.url;

/** A file as a data URL, for pages that leave the Studio and pictures drawn from a page. */
export function dataUrl(path: string): string | undefined {
  const f = s.files.value.get(path);
  if (!f) return undefined;
  let bin = '';
  for (let i = 0; i < f.data.length; i += 0x8000) bin += String.fromCharCode(...f.data.subarray(i, i + 0x8000));
  return `data:${f.type};base64,${btoa(bin)}`;
}

const deckStyles = () => { const { tokens, bridge, components, deck } = styles; return { tokens, bridge, components, deck }; };
export const manualHtml = (doc: LibkaDocument, url = previewUrl): string =>
  withFiles(renderManual(doc, { styles, fontsHref, source: s.project.value?.name ?? 'document.md' }), url);
export const deckHtmlOf = (doc: LibkaDocument, url = previewUrl, layout?: ReturnType<typeof emptyFitting>): string =>
  withFiles(renderDeck(doc, { styles: deckStyles(), fontsHref, ...(layout ? { layout } : {}) }), url);

/* ---------- diagrams: drawn here with the build's settings, cached by their source ---------- */
type DiagramBlock = Extract<Block, { type: 'diagram' }>;
const drawn = new Map<string, { svg?: string; error?: string } | 'drawing'>();
let mermaidLoad: Promise<typeof import('mermaid').default> | null = null;
let diagramCount = 0;
function diagramsIn(value: unknown, out: DiagramBlock[] = []): DiagramBlock[] {
  if (Array.isArray(value)) value.forEach((v) => diagramsIn(v, out));
  else if (value && typeof value === 'object') {
    if ((value as { type?: string }).type === 'diagram') out.push(value as DiagramBlock);
    else for (const [k, v] of Object.entries(value)) if (k !== 'position') diagramsIn(v, out);
  }
  return out;
}
async function drawDiagrams(list: DiagramBlock[]): Promise<void> {
  // Mermaid is large: it loads the first time a document has a diagram
  mermaidLoad ??= import('mermaid').then(async ({ default: m }) => {
    m.initialize(MERMAID_CONFIG as unknown as Parameters<typeof m.initialize>[0]);
    await document.fonts.ready;
    return m;
  });
  const mermaid = await mermaidLoad;
  if (drawn.size > 100) for (const [k, v] of drawn) if (v !== 'drawing') drawn.delete(k);
  for (const d of list) {
    if (drawn.has(d.source)) continue;
    drawn.set(d.source, 'drawing');
    try { drawn.set(d.source, { svg: cleanDiagramSvg((await mermaid.render(`lk-diagram-s${++diagramCount}`, d.source)).svg) }); }
    catch (e) { drawn.set(d.source, { error: String((e as Error)?.message ?? e).split('\n').filter(Boolean).slice(0, 3).join(' ') }); }
  }
  render();
}

/** Parses and renders the current source now. */
export function render(): void {
  const text = s.source.value;
  const result = parse(text);
  const problems: Problem[] = [...result.problems];
  const diagrams = diagramsIn(result.document.blocks);
  for (const d of diagrams) {
    const done = drawn.get(d.source);
    if (!done || done === 'drawing') continue;
    if (done.svg) d.svg = done.svg;
    else problems.push({ code: 'diagram-draw', line: Math.max(1, text.split('\n').findIndex((l) => d.title && l.includes(d.title)) + 1), message: `diagram "${d.title}" could not be drawn: ${done.error}` });
  }
  const missing = diagrams.filter((d) => !drawn.has(d.source));
  if (missing.length) void drawDiagrams(missing);
  batch(() => {
    s.doc.value = result.document;
    s.problems.value = problems;
    s.html.value = manualHtml(result.document);
    s.deckHtml.value = deckHtmlOf(result.document);
    s.checks.value = null;
  });
  // the slides as the build lays them out, a moment later; Guard runs once they are (not twice: before and after)
  void fitSlides(result.document);
}

let renderTimer: ReturnType<typeof setTimeout> | undefined;
/** Renders a moment after the author stops typing. */
export function scheduleRender(delay = 200): void {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, delay);
}

/* ---------- slide fitting: the build's measure-and-fit steps, in a hidden frame ---------- */
let fitRun = 0;
async function fitSlides(doc: LibkaDocument): Promise<void> {
  const run = ++fitRun;
  delete document.documentElement.dataset.fit;
  const layout = emptyFitting();
  const base = slides(doc);
  let html = deckHtmlOf(doc, previewUrl, layout);
  try {
    for (let round = 0; round < FIT_ROUNDS; round++) {
      const win = await load(frame('fit-frame'), html, { showAll: false });
      if (run !== fitRun) return;   // the text changed meanwhile: a newer fitting runs
      if (!fitStep(base, layout, agent(win).measureSlides())) break;
      html = deckHtmlOf(doc, previewUrl, layout);
    }
  } catch (e) {
    // the slides stay as laid out so far; the checks still run (and report what does not fit)
    console.warn('LibKa Studio: slide fitting failed', e);
  }
  if (run !== fitRun) return;
  document.documentElement.dataset.fit = 'done';   // for tests and automation: the slides are laid out
  if (html !== s.deckHtml.value) s.deckHtml.value = html;
  scheduleGuard();
}
