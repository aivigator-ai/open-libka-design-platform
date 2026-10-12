/**
 * Makes a tagged PDF printed by Chrome meet PDF/UA-1 (ISO 14289-1), keeping Chrome's structure tree. Each repair
 * answers one veraPDF rule that Chrome's output fails:
 *
 * - 7.1-8: an XMP metadata stream with the PDF/UA identifier and the title; the title is shown, not the file name;
 * - 7.1-5: a role map for structure types PDF 1.7 does not know (Chrome writes Em and Strong);
 * - 7.3-1: Chrome tags an HTML <figure> as a Figure without Alt around the image's own Figure: it becomes a Div;
 * - 7.2-20: a list item holds only Lbl and LBody, so its other children are wrapped in an LBody;
 * - 7.18.1-2, 7.18.5-2: every link annotation has a description (the link's text from the page, else its address);
 * - 7.1-3: drawing outside any tag (backgrounds, borders, icons) is marked as an artifact.
 */
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream,
  type PDFContext, type PDFObject,
} from 'pdf-lib';

export interface RemediateOptions {
  title: string;
  /** BCP 47 language of the document, such as "en" or "cs". */
  lang: string;
  /** Link texts from the page, by address ("https://…", or "#id" for a link inside the document). */
  links?: ReadonlyMap<string, string>;
}

export interface RemediateReport {
  roleMapped: string[];
  figuresRegrouped: number;
  listBodies: number;
  linksDescribed: number;
  artifacts: number;
}

/** Structure types defined by PDF 1.7 (ISO 32000-1, 14.8.4). */
const STANDARD = new Set(('Document Part Art Sect Div BlockQuote Caption TOC TOCI Index NonStruct Private P H H1 H2 H3 H4 H5 H6 L LI Lbl LBody '
  + 'Table TR TH TD THead TBody TFoot Span Quote Note Reference BibEntry Code Link Annot Ruby RB RT RP Warichu WT WP Figure Formula Form').split(' '));
/** Non-standard types that are inline text; any other non-standard type maps to Div. */
const INLINE = new Set(['Em', 'Strong', 'Sub', 'Sup', 'Mark', 'Del', 'Ins', 'Small', 'S', 'U', 'Abbr', 'Kbd', 'Samp', 'Var', 'Cite', 'Dfn', 'Time']);

const N = (s: string) => PDFName.of(s);
const text = (o: PDFObject | undefined) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : undefined);

/** XMP metadata with the PDF/UA-1 identifier. */
function xmp(title: string, lang: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title>
   <dc:language><rdf:Bag><rdf:li>${esc(lang)}</rdf:li></rdf:Bag></dc:language>
   <dc:format>application/pdf</dc:format>
   <pdf:Producer>LibKa</pdf:Producer>
   <xmp:CreatorTool>LibKa</xmp:CreatorTool>
   <pdfuaid:part>1</pdfuaid:part>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** The document-level entries: metadata, title shown, language, marked. */
function frame(doc: PDFDocument, o: RemediateOptions): void {
  const ctx = doc.context;
  const catalog = doc.catalog;
  const meta = ctx.stream(new TextEncoder().encode(xmp(o.title, o.lang)), { Type: 'Metadata', Subtype: 'XML' });
  catalog.set(N('Metadata'), ctx.register(meta));
  const prefs = catalog.lookupMaybe(N('ViewerPreferences'), PDFDict) ?? ctx.obj({});
  prefs.set(N('DisplayDocTitle'), ctx.obj(true));
  catalog.set(N('ViewerPreferences'), prefs);
  if (!catalog.get(N('Lang'))) catalog.set(N('Lang'), PDFString.of(o.lang));
  const mark = catalog.lookupMaybe(N('MarkInfo'), PDFDict) ?? ctx.obj({});
  mark.set(N('Marked'), ctx.obj(true));
  catalog.set(N('MarkInfo'), mark);
  doc.setTitle(o.title, { showInWindowTitleBar: true });
  doc.setLanguage(o.lang);
  doc.setProducer('LibKa');
  doc.setCreator('LibKa');
  // the same source and versions give the same bytes: Chrome's print time is dropped, or SOURCE_DATE_EPOCH used
  const info = ctx.lookup(ctx.trailerInfo.Info);
  if (info instanceof PDFDict) { info.delete(N('CreationDate')); info.delete(N('ModDate')); }
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(epoch) && epoch > 0) { doc.setCreationDate(new Date(epoch * 1000)); doc.setModificationDate(new Date(epoch * 1000)); }
}

/** The structure element dictionaries in tree order, with their parents. */
function elements(ctx: PDFContext, root: PDFDict): { el: PDFDict; ref?: PDFRef }[] {
  const out: { el: PDFDict; ref?: PDFRef }[] = [];
  const visit = (k: PDFObject | undefined) => {
    if (!k) return;
    const ref = k instanceof PDFRef ? k : undefined;
    const o = ref ? ctx.lookup(ref) : k;
    if (o instanceof PDFArray) { o.asArray().forEach(visit); return; }
    if (!(o instanceof PDFDict) || !o.get(N('S'))) return;
    out.push({ el: o, ...(ref ? { ref } : {}) });
    visit(o.get(N('K')));
  };
  visit(root.get(N('K')));
  return out;
}

const kidsOf = (ctx: PDFContext, el: PDFDict): PDFObject[] => {
  const k = el.get(N('K'));
  if (k === undefined) return [];
  const o = k instanceof PDFRef ? ctx.lookup(k) : k;
  return o instanceof PDFArray ? o.asArray() : [k];
};
const typeOf = (ctx: PDFContext, k: PDFObject): string | undefined => {
  const o = k instanceof PDFRef ? ctx.lookup(k) : k;
  return o instanceof PDFDict ? o.lookup(N('S'))?.toString().slice(1) : undefined;
};

/** Structure repairs: role map, figure groups, list bodies. */
function structure(doc: PDFDocument, report: RemediateReport): void {
  const ctx = doc.context;
  const root = doc.catalog.lookupMaybe(N('StructTreeRoot'), PDFDict);
  if (!root) return;
  const all = elements(ctx, root);

  // role map for types PDF 1.7 does not define
  const roleMap = root.lookupMaybe(N('RoleMap'), PDFDict) ?? ctx.obj({});
  const unknown = [...new Set(all.map(({ el }) => el.lookup(N('S'))!.toString().slice(1)).filter((t) => !STANDARD.has(t)))];
  for (const t of unknown) if (!roleMap.get(N(t))) roleMap.set(N(t), N(INLINE.has(t) ? 'Span' : 'Div'));
  if (unknown.length) root.set(N('RoleMap'), roleMap);
  report.roleMapped = unknown.sort();

  for (const { el, ref } of all) {
    const s = el.lookup(N('S'))!.toString();
    // an HTML <figure>: a Figure without Alt that groups other elements (the image's Figure, its Caption)
    if (s === '/Figure' && !el.get(N('Alt')) && !el.get(N('ActualText')) && kidsOf(ctx, el).some((k) => typeOf(ctx, k))) {
      el.set(N('S'), N('Div'));
      report.figuresRegrouped++;
    }
    // a list item holds a label and a body: marked content before its first element is the label (the marker),
    // everything else that is not already Lbl or LBody goes into an LBody
    if (s === '/LI' && ref) {
      const kids = kidsOf(ctx, el);
      const isContent = (k: PDFObject) => !typeOf(ctx, k);
      const hasLabel = kids.some((k) => typeOf(ctx, k) === 'Lbl');
      const lead = hasLabel ? [] : kids.slice(0, Math.max(0, kids.findIndex((k) => !isContent(k)))).filter(isContent);
      const loose = kids.filter((k) => !lead.includes(k) && !['Lbl', 'LBody'].includes(typeOf(ctx, k) ?? ''));
      if (!loose.length && !lead.length) continue;
      const make = (type: string, members: PDFObject[]) => {
        const node = ctx.obj({ Type: 'StructElem', S: type, P: ref, K: members });
        const pg = el.get(N('Pg'));
        if (pg) node.set(N('Pg'), pg);
        const nodeRef = ctx.register(node);
        for (const k of members) {
          const o = k instanceof PDFRef ? ctx.lookup(k) : k;
          if (o instanceof PDFDict && o.get(N('S'))) o.set(N('P'), nodeRef);
          else reparentContent(doc, root, k, el, nodeRef);   // marked content now belongs to the new element
        }
        return nodeRef;
      };
      const label = lead.length ? [make('Lbl', lead)] : [];
      const body = loose.length ? [make('LBody', loose)] : [];
      el.set(N('K'), ctx.obj([...label, ...kids.filter((k) => typeOf(ctx, k) === 'Lbl' || typeOf(ctx, k) === 'LBody'), ...body]));
      report.listBodies++;
    }
  }
}

/** The parent-tree array of a page (marked content id → structure element), from the number tree in StructTreeRoot. */
function parentTreeEntry(ctx: PDFContext, root: PDFDict, key: number): PDFArray | undefined {
  const search = (node: PDFDict | undefined): PDFArray | undefined => {
    if (!node) return undefined;
    const nums = node.lookupMaybe(N('Nums'), PDFArray);
    if (nums) for (let i = 0; i + 1 < nums.size(); i += 2) {
      if ((nums.lookup(i) as PDFNumber).asNumber() === key) { const v = nums.lookup(i + 1); return v instanceof PDFArray ? v : undefined; }
    }
    const kids = node.lookupMaybe(N('Kids'), PDFArray);
    if (kids) for (const k of kids.asArray()) { const found = search(ctx.lookup(k) as PDFDict); if (found) return found; }
    return undefined;
  };
  return search(root.lookupMaybe(N('ParentTree'), PDFDict));
}

/** Points the parent tree of a moved marked-content item (an MCID number or an MCR) at its new structure element. */
function reparentContent(doc: PDFDocument, root: PDFDict, kid: PDFObject, from: PDFDict, to: PDFRef): void {
  const ctx = doc.context;
  const o = kid instanceof PDFRef ? ctx.lookup(kid) : kid;
  const mcid = o instanceof PDFNumber ? o.asNumber() : o instanceof PDFDict ? (o.lookup(N('MCID')) as PDFNumber | undefined)?.asNumber() : undefined;
  const pageRef = (o instanceof PDFDict ? o.get(N('Pg')) : undefined) ?? from.get(N('Pg'));
  if (mcid === undefined || !(pageRef instanceof PDFRef)) return;
  const page = ctx.lookup(pageRef);
  const key = page instanceof PDFDict ? page.lookup(N('StructParents')) : undefined;
  if (!(key instanceof PDFNumber)) return;
  const arr = parentTreeEntry(ctx, root, key.asNumber());
  if (arr && mcid < arr.size()) arr.set(mcid, to);
}

/** A description for every link annotation: the link's text from the page, else where it goes. */
function links(doc: PDFDocument, o: RemediateOptions, report: RemediateReport): void {
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(N('Annots'), PDFArray);
    if (!annots) continue;
    for (const a of annots.asArray()) {
      const annot = doc.context.lookup(a);
      if (!(annot instanceof PDFDict) || annot.lookup(N('Subtype'))?.toString() !== '/Link' || annot.get(N('Contents'))) continue;
      const action = annot.lookupMaybe(N('A'), PDFDict);
      const uri = text(action?.lookup(N('URI')));
      const dest = action?.lookup(N('D')) ?? annot.lookup(N('Dest'));
      const name = dest instanceof PDFName ? dest.decodeText() : text(dest);
      const key = uri ?? (name ? `#${name}` : undefined);
      const label = (key && o.links?.get(key)) ?? (uri ? uri : name ? `${o.lang.startsWith('cs') ? 'Odkaz na' : 'Link to'} ${name}` : o.lang.startsWith('cs') ? 'Odkaz' : 'Link');
      annot.set(N('Contents'), PDFHexString.fromText(label));
      report.linksDescribed++;
    }
  }
}

// ---- content streams: drawing outside any tag becomes an artifact ----

const PATH_START = new Set(['m', 're']);
const PATH_END = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n']);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isSpace = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;

interface Token { op?: string; start: number; end: number }

/** Content-stream tokens (latin1 text, one char per byte): operators carry `op`, operands do not. */
function tokens(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (isSpace(c)) { i++; continue; }
    const start = i;
    if (c === 0x25) { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }   // comment
    if (c === 0x28) {   // (string) with nesting and escapes
      let depth = 0;
      for (; i < s.length; i++) {
        const ch = s[i];
        if (ch === '\\') { i++; continue; }
        if (ch === '(') depth++;
        else if (ch === ')' && --depth === 0) { i++; break; }
      }
    } else if (s.startsWith('<<', i) || s.startsWith('>>', i)) i += 2;
    else if (c === 0x3c) { i = s.indexOf('>', i) + 1 || s.length; }   // <hex>
    else if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) i++;
    else if (c === 0x2f) { i++; while (i < s.length && !isSpace(s.charCodeAt(i)) && !DELIM.has(s.charCodeAt(i))) i++; }
    else {
      while (i < s.length && !isSpace(s.charCodeAt(i)) && !DELIM.has(s.charCodeAt(i))) i++;
      const word = s.slice(start, i);
      if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) && word !== 'true' && word !== 'false' && word !== 'null') {
        if (word === 'ID') {   // inline image data runs to EI
          const ei = s.slice(i).search(/\sEI(?=\s|$)/);
          i = ei < 0 ? s.length : i + ei + 3;
          out.push({ op: 'BI-data', start, end: i });
          continue;
        }
        out.push({ op: word, start, end: i });
        continue;
      }
    }
    out.push({ start, end: i });
  }
  return out;
}

/** The content with every drawing outside marked content wrapped as an artifact; returns how many were wrapped. */
export function markArtifacts(content: string): { content: string; count: number } {
  const toks = tokens(content);
  const inserts: { at: number; text: string }[] = [];
  let depth = 0;
  let group: number | null = null;   // where an open artifact group starts (offset of its first operand)
  let operandStart: number | null = null;
  let count = 0;
  const open = (at: number) => { inserts.push({ at, text: '/Artifact BMC\n' }); group = at; };
  const close = (at: number) => { inserts.push({ at, text: '\nEMC' }); group = null; count++; };
  for (const t of toks) {
    if (!t.op) { if (operandStart === null) operandStart = t.start; continue; }
    const at = operandStart ?? t.start;
    operandStart = null;
    const op = t.op;
    if (op === 'BMC' || op === 'BDC') { depth++; continue; }
    if (op === 'EMC') { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    // graphics objects at the top level: a path from its start to its painting, a text object, an XObject, a shading, an image
    if (group === null && (PATH_START.has(op) || op === 'BT' || op === 'Do' || op === 'sh' || op === 'BI')) open(at);
    if (group !== null && (PATH_END.has(op) || op === 'ET' || op === 'Do' || op === 'sh' || op === 'BI-data')) close(t.end);
  }
  if (group !== null) close(content.length);
  if (!inserts.length) return { content, count: 0 };
  let out = '';
  let last = 0;
  for (const ins of inserts.sort((a, b) => a.at - b.at)) { out += content.slice(last, ins.at) + ins.text; last = ins.at; }
  return { content: out + content.slice(last), count };
}

const latin1 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return s; };
const toBytes = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };

function artifacts(doc: PDFDocument, report: RemediateReport): void {
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const contents = page.node.get(N('Contents'));
    const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    // one stream per page keeps marked content from spanning stream boundaries
    const parts = refs.map((r) => {
      const st = ctx.lookup(r);
      if (st instanceof PDFRawStream) return latin1(decodePDFRawStream(st).decode());
      if (st instanceof PDFStream) return latin1(st.getContents());
      return '';
    });
    const { content, count } = markArtifacts(parts.join('\n'));
    if (!count) continue;
    page.node.set(N('Contents'), ctx.register(ctx.flateStream(toBytes(content))));
    report.artifacts += count;
  }
}

/** The PDF made to meet PDF/UA-1, and what was repaired. */
export async function remediate(pdf: Uint8Array, options: RemediateOptions): Promise<{ pdf: Uint8Array; report: RemediateReport }> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const report: RemediateReport = { roleMapped: [], figuresRegrouped: 0, listBodies: 0, linksDescribed: 0, artifacts: 0 };
  frame(doc, options);
  structure(doc, report);
  links(doc, options, report);
  artifacts(doc, report);
  return { pdf: await doc.save({ useObjectStreams: false }), report };
}

/** Link texts by address from a rendered page, for link descriptions. */
export function linkTexts(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2]!.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const href = m[1]!.replace(/&amp;/g, '&');
    if (label && !map.has(href)) map.set(href, label);
  }
  return map;
}
