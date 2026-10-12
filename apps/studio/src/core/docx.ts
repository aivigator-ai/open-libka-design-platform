/** The Word file: the build's renderer, with pictures drawn in the browser. The `docx` library loads only when needed. */
import type { Block, LibkaDocument } from '@libka/model';
import type { DocxOptions, DocxPicture } from '@libka/docx';
import * as s from '../state/store.ts';
import { normalize } from '../storage/paths.ts';
import { frame, load } from './frames.ts';
import { dataUrl, manualHtml } from './pipeline.ts';

const STAND_IN: DocxPicture = { data: Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)), type: 'png', width: 640, height: 360 };
/** For the checks: a picture wherever the build would have one (the alternative text is the document's own). */
export const standInPictures = (): DocxOptions => ({ picture: (src) => (s.files.value.has(normalize(src) ?? '') ? STAND_IN : undefined), drawing: () => STAND_IN });

function drawingBlocks(value: unknown, out: Block[] = []): Block[] {
  if (Array.isArray(value)) value.forEach((v) => drawingBlocks(v, out));
  else if (value && typeof value === 'object') {
    const type = (value as { type?: string }).type;
    if (type === 'diagram' || type === 'chart' || type === 'ui') out.push(value as Block);
    else for (const [k, v] of Object.entries(value)) if (k !== 'position') drawingBlocks(v, out);
  }
  return out;
}

/** Draws a picture (any format the browser shows) as PNG, at twice its size for print. */
async function rasterize(url: string, width?: number, height?: number): Promise<DocxPicture> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const w = Math.ceil(width ?? img.naturalWidth), h = Math.ceil(height ?? img.naturalHeight);
  const canvas = Object.assign(document.createElement('canvas'), { width: w * 2, height: h * 2 });
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the picture could not be drawn'))), 'image/png'));
  return { data: new Uint8Array(await blob.arrayBuffer()), type: 'png', width: w, height: h };
}

/**
 * A rendered element as PNG: the whole page goes into an SVG picture (foreignObject), cropped to the element with the
 * viewBox, so its layout is exactly the page's. Fonts are the system's (a picture loads no files).
 */
function drawElement(el: HTMLElement): Promise<DocxPicture> {
  const page = el.ownerDocument.documentElement;
  const r = el.getBoundingClientRect();
  const [w, h] = [Math.ceil(r.width), Math.ceil(r.height)];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${r.left} ${r.top} ${w} ${h}">`
    + `<foreignObject width="${page.scrollWidth}" height="${page.scrollHeight}">${new XMLSerializer().serializeToString(page)}</foreignObject></svg>`;
  return rasterize(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, w, h);
}

/** The pictures of the Word file: the project's images, and every diagram, chart and specimen as the page shows it. */
async function wordPictures(doc: LibkaDocument): Promise<DocxOptions> {
  const { sniffPicture } = await import('@libka/docx');
  const pictures = new Map<string, DocxPicture>();
  for (const [path, f] of s.files.value) {
    if (!f.type.startsWith('image/')) continue;
    try {
      const known = sniffPicture(f.data);
      pictures.set(path, known ? { data: f.data, ...known } : await rasterize(f.url));
    } catch { /* the Word file shows the alt text */ }
  }
  const drawings = new Map<Block, DocxPicture>();
  const blocks = drawingBlocks(doc.blocks);
  if (blocks.length) {
    const sheet: LibkaDocument = { meta: { title: doc.meta.title, lang: doc.meta.lang }, blocks };
    const win = await load(frame('docx-frame'), manualHtml(sheet, dataUrl), { showAll: false });
    const d = win.document;
    // one drawing at a time with nothing above it, so text in other fonts cannot move it inside the picture
    d.head.append(Object.assign(d.createElement('style'), { textContent: '.lk-manual-content figcaption, .lk-manual-content details, .lk-manual-content .lk-visually-hidden, '
      + '.lk-skip, .lk-doc-header, .lk-manual-toc, .lk-manual-footer, .lk-manual-content > :not(.lk-draw-now) { display: none !important; } .lk-manual-content figure { margin: 0 !important; }' }));
    const targets = Array.from(d.querySelectorAll<HTMLElement>('.lk-manual-content > .lk-diagram > .lk-diagram-art, .lk-manual-content > .lk-chart, .lk-manual-content > .lk-ui > .lk-ui-stages'));
    for (const [i, b] of blocks.entries()) {
      const el = targets[i];
      const figure = el?.closest('.lk-manual-content > *');
      if (!el || !figure) continue;
      figure.classList.add('lk-draw-now');
      try { drawings.set(b, await drawElement(el)); } catch { /* the Word file uses the block's text instead */ }
      figure.classList.remove('lk-draw-now');
    }
  }
  return { picture: (src) => pictures.get(normalize(src) ?? ''), drawing: (b) => drawings.get(b) };
}

/** The Word file of the current document. */
export async function makeDocx(): Promise<Uint8Array | null> {
  const doc = s.doc.value;
  if (!doc) return null;
  const { renderDocx } = await import('@libka/docx');
  return renderDocx(doc, await wordPictures(doc));
}
