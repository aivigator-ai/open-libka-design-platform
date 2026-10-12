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
    ...BLOCKS.flatMap((b) => [`## ${b.title}`, '', b.example, '']), ...INLINES.flatMap((i) => [`## ${i.title}`, '', i.example, ''])].join('\n');
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
  it('a diagram is its description, its source goes to the appendix', async () => {
    const md = '# T\n\n## A\n\n```mermaid\nflowchart LR\n  accTitle: Flow\n  accDescr: A goes to B.\n  A --> B\n```\n';
    const xml = parts(await build(md))['word/document.xml']!;
    expect(xml).toContain('A goes to B.');
    expect(xml).toMatch(/Diagram sources[\s\S]*flowchart LR/);
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
