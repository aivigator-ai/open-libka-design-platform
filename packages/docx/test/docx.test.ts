import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { convertToPdf, findSoffice } from '../src/libreoffice.ts';
import { BLOCKS, INLINES } from '@libka/blocks';
import { checkDocx } from '@libka/guard/docx';
import { parse, type Block } from '@libka/model';
import { renderDocx, sniffPicture, THEME, wordLang, type DocxPicture } from '../src/index.ts';

const parts = (docx: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(docx)).map(([k, v]) => [k, k.startsWith('word/media/') ? '' : strFromU8(v)]));
const build = async (md: string, options = {}) => {
  const { document, problems } = parse(md);
  expect(problems).toEqual([]);
  return renderDocx(document, options);
};
/** A 1×1 PNG. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/** Every registry example in one document, like the catalog's "every block" build. */
function everyBlock(lang = 'en'): string {
  const front = [...new Set(BLOCKS.flatMap((b) => (b.frontMatter ? [b.frontMatter] : [])))];
  return ['---', 'title: Every block', `lang: ${lang}`, ...front, '---', '',
    // the revision history makes its own heading
    ...BLOCKS.flatMap((b) => [...(b.name === 'revisions' ? [] : [`## ${b.title}`, '']), b.example, '']), ...INLINES.flatMap((i) => [`## ${i.title}`, '', i.example, ''])].join('\n');
}

describe('renderDocx: every block', () => {
  it('renders every registry example into a Word file that passes the DOCX checks', async () => {
    const check = checkDocx(await build(everyBlock()));
    expect(check.violations).toEqual([]);
    expect(check.checked).toBeGreaterThan(100);
  });

  it('passes with drawings too: pictures carry the alternative text', async () => {
    const picture: DocxPicture = { data: PNG, type: 'png', width: 640, height: 360 };
    const docx = await build(everyBlock(), { drawing: () => picture, picture: () => picture });
    expect(checkDocx(docx).violations).toEqual([]);
    const xml = parts(docx)['word/document.xml']!;
    // the chart's picture says what the chart shows, its data follows as a table
    expect(xml).toMatch(/<wp:docPr id="\d+" name="Picture \d+" descr="Bar chart: Staff who find the handbook easy to use\. 6 values in 2 series\./);
    expect(xml).toMatch(/<w:tblCaption w:val="Staff who find the handbook easy to use \(data\)"\/>/);
    // a picture is never wider than the text column (A4 less 20 mm margins: 642 px = 6115050 EMU)
    for (const m of xml.matchAll(/<wp:extent cx="(\d+)"/g)) expect(Number(m[1])).toBeLessThanOrEqual(642 * 9525);
  });

  it('is byte-identical for the same source, and dated only when asked', async () => {
    const md = everyBlock();
    const [a, b] = [await build(md), await build(md)];
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(parts(a)['docProps/core.xml']).not.toMatch(/dcterms:created/);
    const dated = parts(await build(md, { date: new Date(Date.UTC(2026, 9, 4, 12, 0, 0)) }))['docProps/core.xml']!;
    expect(dated).toMatch(/<dcterms:created xsi:type="dcterms:W3CDTF">2026-10-04T12:00:00Z<\/dcterms:created>/);
  });
});

describe('renderDocx: Word structure', () => {
  const md = `---
title: Release guide
subtitle: For operators
version: "2.1"
lang: cs
references:
  - id: wcag22
    title: WCAG 2.2
    author: W3C
    year: 2023
---

## Příprava v Praze

Text s poznámkou[^a] a zdrojem [@wcag22]. Kód \`v Praze\` zůstává.

### Podrobnosti

1. první
2. druhý

:::steps
4. **Čtvrtý krok** Popis.
:::

:::table{caption="Verze"}
| Verze | Do |
|---|---|
| 2.1 | 2027 |
:::

[^a]: Poznámka pod čarou.
`;

  it('maps the outline to Title and Heading 1–2, with bookmarks', async () => {
    const xml = parts(await build(md))['word/document.xml']!;
    expect(xml).toMatch(/<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Release guide<\/w:t>/);
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>[\s\S]*?<w:bookmarkStart w:name="lk_priprava_v_praze"/);
    expect(xml).toMatch(/<w:pStyle w:val="Heading2"\/>/);
  });

  it('writes a download as a link with its format, size and pages, the web address after it', async () => {
    const xml = parts(await build('# Files\n\n:::download[Annual report 2025]{href="https://example.org/r.pdf" type=PDF size="2.1 MB" pages=48}\nThe full report.\n:::\n'))['word/document.xml']!;
    expect(xml).toMatch(/<w:hyperlink [^>]*>[\s\S]*?<w:t xml:space="preserve">Annual report 2025 \(PDF, 2\.1 MB, 48 pages\)<\/w:t>[\s\S]*?<\/w:hyperlink>[\s\S]*?<w:t xml:space="preserve"> https:\/\/example\.org\/r\.pdf<\/w:t>/);
    expect(xml).toMatch(/<w:t xml:space="preserve">The full report\.<\/w:t>/);
  });

  it('writes pros and cons as the option\'s name, then a panel per side with its word and a bulleted list', async () => {
    const xml = parts(await build('---\ntitle: T\nlang: cs\n---\n\n::::pros-cons[Možnost A]\n:::pros\n- Levné\n:::\n:::cons\n- Pomalé\n:::\n::::\n'))['word/document.xml']!;
    expect(xml).toMatch(/Možnost A[\s\S]*?\+ Výhody[\s\S]*?<w:numPr>[\s\S]*?Levné[\s\S]*?− Nevýhody[\s\S]*?Pomalé/);
  });

  it('writes a process as its name, a numbered list of the stages and, for a cycle, the line saying it starts again', async () => {
    const xml = parts(await build('---\ntitle: T\nlang: cs\n---\n\n:::flow[Cyklus zlepšování]{shape=cycle}\n1. Naplánovat\n2. Vyzkoušet\n:::\n'))['word/document.xml']!;
    expect(xml).toMatch(/Cyklus zlepšování[\s\S]*?<w:numPr>[\s\S]*?Naplánovat[\s\S]*?<w:numPr>[\s\S]*?Vyzkoušet[\s\S]*?↻ Pak vše začíná znovu: [\s\S]*?Naplánovat/);
  });

  it('writes a matrix as its axes, then a 2 × 2 table under a repeating header row with the title, each cell starting with its name', async () => {
    const xml = parts(await build('---\ntitle: T\nlang: cs\n---\n\n::::matrix[SWOT aplikace]{type=swot}\n:::q\n- Rychlá\n:::\n:::q\n- Malý tým\n:::\n:::q\n- Nový trh\n:::\n:::q\n- Konkurence\n:::\n::::\n\n::::matrix[Plán]{type=grid x="Náročnost" y="Přínos"}\n:::q[A]\n- a\n:::\n:::q[B]\n- b\n:::\n:::q[C]\n- c\n:::\n:::q[D]\n- d\n:::\n::::\n'))['word/document.xml']!;
    expect(xml).toMatch(/<w:tblHeader\/>[\s\S]*?<w:gridSpan w:val="2"\/>[\s\S]*?SWOT aplikace[\s\S]*?Silné stránky[\s\S]*?Rychlá[\s\S]*?Slabé stránky[\s\S]*?Příležitosti[\s\S]*?Hrozby[\s\S]*?Konkurence/);
    // each axis is a paragraph of its own
    expect(xml).toMatch(/Vodorovně: Náročnost<\/w:t><\/w:r><\/w:p><w:p>[\s\S]*?Svisle: Přínos[\s\S]*?<w:tbl>/);
    expect(xml).toMatch(/<w:tblCaption w:val="SWOT aplikace"\/>/);
  });

  it('writes a decision as Heading 1 with a bookmark, its status line, and each part as Heading 2', async () => {
    const xml = parts(await build('# Log\n\n::::decision[Use A]{status=accepted date=2026-10-01 by="Board"}\nWe use A.\n:::context\nWhy.\n:::\n:::consequences\n- More work.\n:::\n::::\n'))['word/document.xml']!;
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>[\s\S]*?<w:bookmarkStart w:name="lk_use_a"[\s\S]*?Use A/);
    expect(xml).toMatch(/<w:t xml:space="preserve">Status: Accepted · Date: 1\u00a0October 2026 · Decided by: Board<\/w:t>/);
    expect([...xml.matchAll(/<w:pStyle w:val="Heading2"\/>[\s\S]*?<w:t xml:space="preserve">([^<]+)<\/w:t>/g)].map((m) => m[1])).toEqual(['Context', 'Consequences']);
    // the front matter chooses how every date is written, in the document's language
    const short = parts(await build('---\ntitle: Log\nlang: cs\ndate: "2026-10-28"\ndate-format: short\n---\n\n::::decision[A]{status=accepted date=2026-10-01 by="Rada"}\nA.\n:::context\nProč.\n:::\n::::\n'))['word/document.xml']!;
    expect(short).toContain('Datum: 28.\u00a010.\u00a02026');
    expect(short).toContain('Stav: Přijato · Datum: 1.\u00a010.\u00a02026 · Kdo rozhodl: Rada');
  });

  it('writes the AI label under the title and the badge before unreviewed AI content, only when the label is on', async () => {
    const md = (ai: string) => `---\ntitle: Hours\n${ai}\n---\n\n:::callout[Holiday]{variant=tip ai=generated}\nClosed.\n:::\n`;
    const on = parts(await build(md('ai:\n  use: ai-generated\n  label: true')))['word/document.xml']!;
    expect(on).toMatch(/<w:pStyle w:val="LibKaMeta"\/>[\s\S]*?<w:t xml:space="preserve">Created with AI tools\.<\/w:t>/);
    expect(on).toMatch(/<w:t xml:space="preserve">AI-generated<\/w:t>[\s\S]*?Tip: Holiday/);
    const off = parts(await build(md('ai: ai-generated')))['word/document.xml']!;
    expect(off).not.toMatch(/Created with AI tools|AI-generated/);
  });

  it('writes a revision history as Heading 1 with a bookmark over a Word table with a repeating header row', async () => {
    const xml = parts(await build('---\ntitle: Policy\nlang: cs\n---\n\n:::revisions\n| Verze | Datum | Změna | Schválil |\n|---|---|---|---|\n| 1.1 | 2026-09-15 | Tři dny z domova | Jana Nováková |\n| 1.0 | 2026-03-01 | První verze | Jana Nováková |\n:::\n'))['word/document.xml']!;
    expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>[\s\S]*?<w:bookmarkStart w:name="lk_revisions"[\s\S]*?<w:t xml:space="preserve">Historie změn<\/w:t>[\s\S]*?<w:tblHeader\/>[\s\S]*?<w:t xml:space="preserve">Schválil<\/w:t>/);
    // the heading names the table, so there is no caption paragraph (the title is the table's alternative text)
    expect(xml).not.toMatch(/<w:pStyle w:val="Caption"\/>/);
    expect(xml).toMatch(/<w:t xml:space="preserve">15.\u00a0září 2026<\/w:t>[\s\S]*?<w:t xml:space="preserve">První verze<\/w:t>/);
  });

  it('names the authors under the title and in the properties, or where :::byline stands', async () => {
    const fm = '---\ntitle: Policy\nauthor:\n  - name: Ann Novak\n    role: Security lead\n  - Petr Svoboda\nowner: Security team\n---\n\n';
    const p = parts(await build(`${fm}Text.\n`));
    expect(p['docProps/core.xml']).toMatch(/<dc:creator>Ann Novak, Petr Svoboda<\/dc:creator>/);
    expect(p['word/document.xml']).toMatch(/Authors: Ann Novak \(Security lead\), Petr Svoboda · Owner: Security team/);
    const placed = parts(await build(`${fm}Text.\n\n:::byline\n:::\n`))['word/document.xml']!;
    expect(placed).not.toMatch(/Authors: Ann Novak \(Security lead\), Petr Svoboda ·/);
    expect(placed).toMatch(/<w:t xml:space="preserve">Authors: <\/w:t>[\s\S]*?<w:t xml:space="preserve">Ann Novak \(Security lead\), Petr Svoboda<\/w:t>/);
    expect(parts(await build('---\ntitle: P\nowner: Team\n---\n\nx\n'))['docProps/core.xml']).toMatch(/<dc:creator>Team<\/dc:creator>/);
  });

  it('sets the language on the text and in the properties', async () => {
    const p = parts(await build(md));
    expect(p['word/styles.xml']).toMatch(/<w:lang w:val="cs-CZ"\/>/);
    expect(p['docProps/core.xml']).toMatch(/<dc:language>cs-CZ<\/dc:language>/);
    expect(p['docProps/core.xml']).toMatch(/<dc:title>Release guide<\/dc:title>/);
    expect(wordLang('en')).toBe('en-GB');
    expect(wordLang('de-AT')).toBe('de-AT');
  });

  it('applies Czech typography to text, never to code', async () => {
    const xml = parts(await build(md))['word/document.xml']!;
    expect(xml).toContain('Příprava v Praze');
    expect(xml).toContain('Text s poznámkou');
    expect(xml).toMatch(/<w:t xml:space="preserve">v Praze<\/w:t>/);
  });

  it('writes footnotes as Word footnotes and citations as links to the source list', async () => {
    const p = parts(await build(md));
    expect(p['word/document.xml']).toMatch(/<w:footnoteReference w:id="1"\/>/);
    expect(p['word/footnotes.xml']).toContain('Poznámka pod čarou.');
    expect(p['word/document.xml']).toMatch(/<w:hyperlink [^>]*w:anchor="lk_ref_wcag22"[^>]*>[\s\S]*?<w:t xml:space="preserve">1<\/w:t>/);
    expect(p['word/document.xml']).toMatch(/<w:bookmarkStart w:name="lk_ref_wcag22"/);
  });

  it('gives every list its own numbering, and steps their start number', async () => {
    const p = parts(await build(md));
    const nums = [...p['word/numbering.xml']!.matchAll(/<w:num w:numId="\d+"[^>]*>[\s\S]*?<w:startOverride w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(nums).toContain('4');
    // the two list items, the step and the numbered source list, in three lists
    expect(p['word/document.xml']!.match(/<w:numPr>/g)!.length).toBe(4);
    expect(new Set([...p['word/document.xml']!.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1])).size).toBe(3);
  });

  it('marks table header rows to repeat and gives tables alternative text', async () => {
    const xml = parts(await build(md))['word/document.xml']!;
    expect(xml).toMatch(/<w:tblCaption w:val="Verze"\/>/);
    expect(xml).toMatch(/<w:tr><w:trPr><w:cantSplit\/><w:tblHeader\/><\/w:trPr>/);
  });

  it('styles come from the tokens', async () => {
    const styles = parts(await build(md))['word/styles.xml']!;
    expect(styles).toContain(`w:ascii="${THEME.fonts.ui}"`);
    expect(styles).toMatch(new RegExp(`<w:style w:type="paragraph" w:styleId="Heading1">[\\s\\S]*?w:ascii="${THEME.fonts.brand}"[\\s\\S]*?<w:sz w:val="${THEME.sizes.h2}"/>`));
  });
});

describe('renderDocx: fallbacks without drawings', () => {
  it('a diagram is its description, and the Word file holds no Mermaid source', async () => {
    const md = '# T\n\n## A\n\n```mermaid\nflowchart LR\n  accTitle: Flow\n  accDescr: A goes to B.\n  A --> B\n```\n';
    const xml = parts(await build(md))['word/document.xml']!;
    expect(xml).toContain('A goes to B.');
    expect(xml).not.toMatch(/Diagram sources|flowchart LR/);
  });

  it('a figure without a picture shows its alternative text', async () => {
    const xml = parts(await build('# T\n\n![A chart of sales](missing.png "Sales")\n'))['word/document.xml']!;
    expect(xml).toContain('[ A chart of sales ]');
    expect(xml).toMatch(/Sales/);
  });

  it('a drawing is used when the caller has one', async () => {
    const md = '# T\n\n:::chart{type=bar caption="Sales"}\n| Month | Sales |\n|---|---|\n| Jan | 3 |\n:::\n';
    const seen: Block[] = [];
    const docx = await build(md, { drawing: (b: Block) => { seen.push(b); return { data: PNG, type: 'png', width: 100, height: 50 } as DocxPicture; } });
    expect(seen.map((b) => b.type)).toEqual(['chart']);
    expect(Object.keys(unzipSync(docx)).filter((k) => k.startsWith('word/media/') && !k.endsWith('/'))).toHaveLength(1);
  });
});

const soffice = findSoffice();

// CI requires LibreOffice (LIBKA_REQUIRE_LIBREOFFICE=1): there the conversion must run, not be skipped
it.runIf(process.env.LIBKA_REQUIRE_LIBREOFFICE === '1')('finds LibreOffice where the admin manual installs it', () => {
  expect(soffice, 'LibreOffice not found: see docs/admin/word-and-libreoffice.md').not.toBeNull();
});

describe.skipIf(!soffice)('LibreOffice opens the Word file', () => {
  it('converts every block to a PDF of several pages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'libka-docx-lo-'));
    try {
      const file = join(dir, 'every-block.docx');
      const picture: DocxPicture = { data: PNG, type: 'png', width: 640, height: 360 };
      writeFileSync(file, await build(everyBlock('cs'), { drawing: () => picture, picture: () => picture }));
      const pdf = readFileSync(convertToPdf(file, join(dir, 'pdf'), soffice!));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)!.length).toBeGreaterThan(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240000);
});

describe('sniffPicture', () => {
  it('reads the size of PNG, GIF and JPEG', () => {
    expect(sniffPicture(PNG)).toEqual({ type: 'png', width: 1, height: 1 });
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x10, 0x00, 0, 0]);
    expect(sniffPicture(gif)).toEqual({ type: 'gif', width: 32, height: 16 });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03]);
    expect(sniffPicture(jpeg)).toEqual({ type: 'jpg', width: 64, height: 48 });
    expect(sniffPicture(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});
