/**
 * Guard for Word files: the structure a screen reader and Word's accessibility checker rely on, read from the DOCX.
 *
 *   docx-title          the document has a title in its properties                          (WCAG 2.4.2)
 *   docx-language       a language on the text (styles) and in the properties                (3.1.1)
 *   docx-heading-order  headings start at level 1 and never skip a level                      (1.3.1, 2.4.6)
 *   docx-alt-text       every picture has alternative text                                    (1.1.1)
 *   docx-table-header   every table has a header row that repeats, and alternative text       (1.3.1)
 *   docx-link-text      every link has text                                                   (2.4.4)
 *   docx-contrast       every run of text against its shading: 4.5:1, large text 3:1           (1.4.3)
 *
 * Colors are resolved the way Word does: run, character style, paragraph style (with basedOn), document defaults;
 * the background is the run's shading, then the paragraph's, then the table cell's, then the page (white).
 * Browser-safe: the Studio runs the same checks.
 */
import { contrastRatio } from '@libka/contrast';
import { strFromU8, unzipSync } from 'fflate';
import type { CheckResult, Violation } from './index.ts';

/** A parsed XML element: its name, attributes and children (text nodes are strings). */
export interface XElement { name: string; attrs: Record<string, string>; children: (XElement | string)[] }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e] ?? m);

/** A small XML reader for the parts of a Word file: elements, attributes and text; declarations and comments are skipped. */
export function parseXml(xml: string): XElement {
  const root: XElement = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(re)) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[6] !== undefined) { if (stack.length > 1) top.children.push(decode(m[6])); }
    else if (m[3]) {
      if (m[2]) { stack.pop(); continue; }
      const attrs: Record<string, string> = {};
      for (const a of (m[4] ?? '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = decode(a[2] ?? a[3] ?? '');
      const el: XElement = { name: m[3], attrs, children: [] };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    }
  }
  return root;
}

const kids = (e: XElement | undefined, name?: string) => (e?.children.filter((c): c is XElement => typeof c !== 'string' && (!name || c.name === name)) ?? []);
const kid = (e: XElement | undefined, name: string) => kids(e, name)[0];
/** Every descendant with this name, in document order. */
function all(e: XElement, name: string, out: XElement[] = []): XElement[] {
  for (const c of kids(e)) { if (c.name === name) out.push(c); all(c, name, out); }
  return out;
}
/** The text of an element (w:t, and tabs and breaks as spaces). */
function textOf(e: XElement): string {
  return e.children.map((c) => (typeof c === 'string' ? (e.name === 'w:t' ? c : '') : c.name === 'w:tab' || c.name === 'w:br' ? ' ' : textOf(c))).join('');
}

interface RunProps { color?: string; fill?: string; size?: number; bold?: boolean }
interface Style { type: string; name: string; basedOn?: string; outline?: number; run: RunProps; para: { fill?: string } }

function runProps(rPr: XElement | undefined): RunProps {
  const p: RunProps = {};
  const color = kid(rPr, 'w:color')?.attrs['w:val'];
  if (color && /^[0-9a-f]{6}$/i.test(color)) p.color = color.toUpperCase();
  const fill = kid(rPr, 'w:shd')?.attrs['w:fill'];
  if (fill && /^[0-9a-f]{6}$/i.test(fill)) p.fill = fill.toUpperCase();
  const sz = kid(rPr, 'w:sz')?.attrs['w:val'];
  if (sz) p.size = Number(sz);
  const b = kid(rPr, 'w:b');
  if (b) p.bold = !['0', 'false'].includes(b.attrs['w:val'] ?? 'true');
  return p;
}

function readStyles(xml: string | undefined): { styles: Map<string, Style>; defaults: RunProps; lang?: string } {
  const styles = new Map<string, Style>();
  if (!xml) return { styles, defaults: {} };
  const root = kid(parseXml(xml), 'w:styles');
  const rPrDefault = kid(kid(kid(root, 'w:docDefaults'), 'w:rPrDefault'), 'w:rPr');
  const lang = kid(rPrDefault, 'w:lang')?.attrs['w:val'];
  for (const s of kids(root, 'w:style')) {
    const pPr = kid(s, 'w:pPr');
    const outline = kid(pPr, 'w:outlineLvl')?.attrs['w:val'];
    const fill = kid(pPr, 'w:shd')?.attrs['w:fill'];
    styles.set(s.attrs['w:styleId'] ?? '', {
      type: s.attrs['w:type'] ?? 'paragraph', name: kid(s, 'w:name')?.attrs['w:val'] ?? '',
      ...(kid(s, 'w:basedOn') ? { basedOn: kid(s, 'w:basedOn')!.attrs['w:val']! } : {}),
      ...(outline !== undefined ? { outline: Number(outline) } : {}),
      run: runProps(kid(s, 'w:rPr')), para: fill && /^[0-9a-f]{6}$/i.test(fill) ? { fill: fill.toUpperCase() } : {},
    });
  }
  return { styles, defaults: runProps(rPrDefault), ...(lang ? { lang } : {}) };
}

/** A style's own values merged over those of the styles it is based on. */
function chain<T>(styles: Map<string, Style>, id: string | undefined, pick: (s: Style) => T | undefined): T | undefined {
  for (let i = 0, cur = id; cur && i < 20; i++) {
    const s = styles.get(cur);
    if (!s) return undefined;
    const v = pick(s);
    if (v !== undefined) return v;
    cur = s.basedOn;
  }
  return undefined;
}

/** The heading level of a paragraph (1–9), or 0: an outline level on it or its style, or a built-in heading style. */
function headingLevel(p: XElement, styles: Map<string, Style>): number {
  const pPr = kid(p, 'w:pPr');
  const own = kid(pPr, 'w:outlineLvl')?.attrs['w:val'];
  if (own !== undefined) return Number(own) < 9 ? Number(own) + 1 : 0;
  const id = kid(pPr, 'w:pStyle')?.attrs['w:val'];
  const outline = chain(styles, id, (s) => s.outline);
  if (outline !== undefined) return outline < 9 ? outline + 1 : 0;
  const name = chain(styles, id, (s) => (/^heading [1-9]$/i.test(s.name) ? s.name : undefined));
  return name ? Number(name.slice(-1)) : 0;
}

const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

/** Runs Guard's Word checks on a DOCX file. */
export function checkDocx(docx: Uint8Array): CheckResult {
  const violations: Violation[] = [];
  const add = (rule: string, message: string, target: string) => violations.push({ rule, message, target });
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(docx); } catch { files = {}; }
  const part = (name: string) => (files[name] ? strFromU8(files[name]) : undefined);
  const documentXml = part('word/document.xml');
  if (!documentXml) {
    add('docx-package', 'not a Word document: word/document.xml is missing', 'docx');
    return { id: 'docx', mode: 'standard', title: 'Word file structure', checked: 1, skipped: 0, violations };
  }
  let checked = 0;
  const { styles, defaults, lang } = readStyles(part('word/styles.xml'));
  const core = parseXml(part('docProps/core.xml') ?? '');
  const plain = (e: XElement): string => e.children.map((c) => (typeof c === 'string' ? c : plain(c))).join('');
  const coreText = (name: string) => all(core, name).map(plain).join('').trim();

  checked++;
  if (!coreText('dc:title')) add('docx-title', 'the document has no title in its properties (File > Info > Title)', 'docProps/core.xml');
  checked++;
  if (!lang) add('docx-language', 'the text has no language (styles: document defaults)', 'word/styles.xml');
  else if (!coreText('dc:language')) add('docx-language', 'the properties name no language (dc:language)', 'docProps/core.xml');
  else if (coreText('dc:language').toLowerCase() !== lang.toLowerCase()) add('docx-language', `the text is in ${lang} but the properties say ${coreText('dc:language')}`, 'docProps/core.xml');

  const doc = parseXml(documentXml);
  const body = kid(kid(doc, 'w:document'), 'w:body');
  const page = kid(kid(doc, 'w:document'), 'w:background')?.attrs['w:color'];
  const pageFill = page && /^[0-9a-f]{6}$/i.test(page) ? page.toUpperCase() : 'FFFFFF';

  // headings in reading order: start at 1, never skip a level
  let last = 0;
  for (const p of all(body ?? doc, 'w:p')) {
    const level = headingLevel(p, styles);
    if (!level) continue;
    checked++;
    const text = textOf(p).trim();
    if (!text) add('docx-heading-order', `an empty heading at level ${level}`, 'heading');
    else if (level > last + 1) add('docx-heading-order', `heading "${short(text)}" is level ${level} after level ${last}: headings must not skip a level`, short(text));
    last = level;
  }

  for (const d of all(doc, 'wp:docPr')) {
    checked++;
    if (!(d.attrs['descr'] ?? '').trim()) add('docx-alt-text', `picture "${d.attrs['name'] ?? '?'}" has no alternative text`, d.attrs['name'] ?? 'picture');
  }

  for (const [i, t] of all(doc, 'w:tbl').entries()) {
    checked++;
    const first = kid(t, 'w:tr');
    const header = kid(kid(first, 'w:trPr'), 'w:tblHeader');
    const caption = kid(kid(t, 'w:tblPr'), 'w:tblCaption')?.attrs['w:val'] ?? '';
    const name = caption || `table ${i + 1}`;
    if (!header || ['0', 'false'].includes(header.attrs['w:val'] ?? 'true')) add('docx-table-header', `${name}: the first row is not marked as a header row that repeats`, name);
    if (!caption.trim()) add('docx-table-header', `${name} has no alternative text (Table Properties > Alt Text)`, name);
  }

  for (const h of all(doc, 'w:hyperlink')) {
    checked++;
    if (!textOf(h).trim()) add('docx-link-text', `a link to ${h.attrs['w:anchor'] ? `#${h.attrs['w:anchor']}` : h.attrs['r:id'] ?? '?'} has no text`, 'link');
  }

  // contrast of every run with text, in the body, the notes and the headers and footers
  const seen = new Set<string>();
  const parts = Object.keys(files).filter((n) => /^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(n));
  for (const name of parts) {
    const tree = name === 'word/document.xml' ? doc : parseXml(part(name)!);
    const walk = (e: XElement, cellFill?: string): void => {
      for (const c of kids(e)) {
        if (c.name === 'w:tc') {
          const fill = kid(kid(c, 'w:tcPr'), 'w:shd')?.attrs['w:fill'];
          walk(c, fill && /^[0-9a-f]{6}$/i.test(fill) ? fill.toUpperCase() : cellFill);
        } else if (c.name === 'w:p') paragraph(c, cellFill);
        else walk(c, cellFill);
      }
    };
    const paragraph = (p: XElement, cellFill?: string) => {
      const pPr = kid(p, 'w:pPr');
      const pStyle = kid(pPr, 'w:pStyle')?.attrs['w:val'] ?? 'Normal';
      const ownFill = kid(pPr, 'w:shd')?.attrs['w:fill'];
      const paraFill = ownFill && /^[0-9a-f]{6}$/i.test(ownFill) ? ownFill.toUpperCase() : chain(styles, pStyle, (s) => s.para.fill);
      for (const r of all(p, 'w:r')) {
        const text = textOf(r).trim();
        if (!text) continue;
        const rPr = kid(r, 'w:rPr');
        const own = runProps(rPr);
        const rStyle = kid(rPr, 'w:rStyle')?.attrs['w:val'];
        const pick = <K extends keyof RunProps>(k: K) => own[k] ?? chain(styles, rStyle, (s) => s.run[k]) ?? chain(styles, pStyle, (s) => s.run[k]) ?? defaults[k];
        const color = pick('color');
        if (!color) continue;   // automatic color: Word picks black or white for the background
        const bg = own.fill ?? chain(styles, rStyle, (s) => s.run.fill) ?? paraFill ?? cellFill ?? pageFill;
        const size = pick('size') ?? 22;
        const large = size >= 36 || (Boolean(pick('bold')) && size >= 28);
        const need = large ? 3 : 4.5;
        const key = `${color}/${bg}/${need}`;
        checked++;
        const ratio = contrastRatio(`#${color}`, `#${bg}`);
        if (ratio < need && !seen.has(key)) {
          seen.add(key);
          add('docx-contrast', `text #${color} on #${bg} is ${ratio.toFixed(2)}:1, needs ${need}:1${large ? ' (large text)' : ''}: "${short(text)}"`, name.replace('word/', ''));
        }
      }
    };
    walk(tree);
  }
  return { id: 'docx', mode: 'standard', title: 'Word file structure', checked, skipped: 0, violations };
}
