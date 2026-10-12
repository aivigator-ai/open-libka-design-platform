/**
 * The Word file as a package: what makes it byte-identical for the same source, and the picture formats it takes.
 *
 * The docx library writes the time of packing into docProps/core.xml and every ZIP entry, and gives hyperlinks
 * random relationship ids. `normalize` replaces all three: dates from the caller (or none), ids numbered in order,
 * and one fixed ZIP time. It also numbers bookmarks and drawings from 1 in each file, since the library counts them
 * across every document made in the same process.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

/** A picture for the Word file: its bytes, format and display size in CSS pixels (1/96 inch). */
export interface DocxPicture { data: Uint8Array; type: 'png' | 'jpg' | 'gif'; width: number; height: number }

/** The format and pixel size of a PNG, JPEG or GIF, or null for anything else (SVG must be drawn as PNG first). */
export function sniffPicture(data: Uint8Array): Omit<DocxPicture, 'data'> | null {
  const u16 = (i: number) => (data[i]! << 8) | data[i + 1]!;
  const u32 = (i: number) => ((data[i]! << 24) >>> 0) + (data[i + 1]! << 16) + (data[i + 2]! << 8) + data[i + 3]!;
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return { type: 'png', width: u32(16), height: u32(20) };
  }
  if (data.length > 10 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return { type: 'gif', width: data[6]! | (data[7]! << 8), height: data[8]! | (data[9]! << 8) };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    // walk the segments to the first start-of-frame marker (C0–CF, except C4, C8 and CC)
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) { i++; continue; }
      const marker = data[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { type: 'jpg', width: u16(i + 7), height: u16(i + 5) };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

/** ZIP entries are dated 1980-01-01 00:00, the earliest time a ZIP can hold, in every time zone. */
const ZIP_TIME = new Date(1980, 0, 1, 0, 0, 0);

const xmlEscape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface NormalizeOptions {
  /** The document language for docProps/core.xml (dc:language), e.g. "cs-CZ". */
  lang: string;
  /** Created and modified date; without it the dates are left out. */
  date?: Date;
  /** Captions of the tables in document order, written as their alternative text (w:tblCaption). */
  tableCaptions?: string[];
}

/** The Word file with fixed dates, ids and ZIP times (see the module comment). */
export function normalize(docx: Uint8Array, options: NormalizeOptions): Uint8Array {
  const files = unzipSync(docx);
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : undefined);
  const put = (name: string, value: string) => { files[name] = strToU8(value); };

  // dates and language in the core properties
  const core = text('docProps/core.xml');
  if (core) {
    const stamp = options.date ? options.date.toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
    let out = core.replace(/<dcterms:(created|modified)\b[^>]*>[^<]*<\/dcterms:\1>/g, (m, which: string) =>
      stamp ? `<dcterms:${which} xsi:type="dcterms:W3CDTF">${stamp}</dcterms:${which}>` : '');
    if (!/<dc:language>/.test(out)) out = out.replace('</cp:coreProperties>', `<dc:language>${xmlEscape(options.lang)}</dc:language></cp:coreProperties>`);
    put('docProps/core.xml', out);
  }

  // random relationship ids (hyperlinks) numbered in order, per part and its relationships
  for (const rels of Object.keys(files).filter((n) => /^word\/_rels\/[^/]+\.rels$/.test(n))) {
    const part = rels.replace('_rels/', '').replace(/\.rels$/, '');
    const relsText = text(rels)!;
    const ids = [...relsText.matchAll(/Id="(rId[A-Za-z0-9_-]*[a-z_-][A-Za-z0-9_-]*)"/g)].map((m) => m[1]!);
    if (!ids.length) continue;
    const map = new Map(ids.map((id, i) => [id, `rIdL${i + 1}`]));
    const swap = (s: string) => s.replace(/"(rId[A-Za-z0-9_-]+)"/g, (m, id: string) => (map.has(id) ? `"${map.get(id)}"` : m));
    put(rels, swap(relsText));
    if (files[part]) put(part, swap(text(part)!));
  }

  // bookmarks and drawings numbered from 1 in each part; table captions as alternative text
  for (const part of Object.keys(files).filter((n) => /^word\/[^/]+\.xml$/.test(n))) {
    let xml = text(part)!;
    if (!/w:bookmarkStart|wp:docPr|<w:tbl>/.test(xml)) continue;
    const bookmarks = new Map<string, number>();
    xml = xml.replace(/<w:bookmark(Start|End)\b([^>]*?) w:id="(\d+)"/g, (_, kind: string, attrs: string, id: string) => {
      if (!bookmarks.has(id)) bookmarks.set(id, bookmarks.size + 1);
      return `<w:bookmark${kind}${attrs} w:id="${bookmarks.get(id)}"`;
    });
    let drawing = 0;
    xml = xml.replace(/<wp:docPr id="\d+"/g, () => `<wp:docPr id="${++drawing}"`);
    xml = xml.replace(/<pic:cNvPr id="\d+"/g, () => `<pic:cNvPr id="0"`);
    if (part === 'word/document.xml' && options.tableCaptions) {
      // tables are never nested, so their order in the XML is the order the renderer made them in
      let t = 0;
      xml = xml.replace(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/g, (m, inner: string) => {
        const caption = options.tableCaptions![t++];
        return caption ? `<w:tblPr>${inner}<w:tblCaption w:val="${xmlEscape(caption)}"/></w:tblPr>` : m;
      });
      if (t !== options.tableCaptions.length) throw new Error(`docx: ${t} tables but ${options.tableCaptions.length} captions`);
    }
    put(part, xml);
  }

  // one fixed order and time: [Content_Types].xml first, then by name
  const names = Object.keys(files).sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const zip: Zippable = {};
  for (const n of names) zip[n] = [files[n]!, { mtime: ZIP_TIME, level: n.startsWith('word/media/') ? 0 : 6 }];
  return zipSync(zip);
}
