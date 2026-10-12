import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkDocx, parseXml } from '../src/docx.ts';
import { conformance, DOCX_CRITERIA } from '../src/wcag.ts';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** A minimal Word file: the body XML, and what the styles and properties say. */
function docx(body: string, o: { title?: string; lang?: string; coreLang?: string; styles?: string } = {}): Uint8Array {
  const lang = o.lang === undefined ? 'en-GB' : o.lang;
  const coreLang = o.coreLang ?? lang;
  return zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    'word/styles.xml': strToU8(`<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${lang ? `<w:lang w:val="${lang}"/>` : ''}</w:rPr></w:rPrDefault></w:docDefaults>`
      + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Pale"><w:name w:val="Pale"/><w:rPr><w:color w:val="BBBBBB"/></w:rPr></w:style>'
      + `${o.styles ?? ''}</w:styles>`),
    'docProps/core.xml': strToU8(`<cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/">${o.title === undefined ? '<dc:title>Guide</dc:title>' : o.title ? `<dc:title>${o.title}</dc:title>` : ''}`
      + `${coreLang ? `<dc:language>${coreLang}</dc:language>` : ''}</cp:coreProperties>`),
  });
}
const p = (text: string, style?: string, rPr = '') => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t>${text}</w:t></w:r></w:p>`;
const rules = (file: Uint8Array) => checkDocx(file).violations.map((v) => v.rule);
const messages = (file: Uint8Array) => checkDocx(file).violations.map((v) => v.message).join('\n');

describe('checkDocx', () => {
  it('passes a well-formed document', () => {
    const r = checkDocx(docx(p('Intro', 'Heading1') + p('Text') + p('Detail', 'Heading2')));
    expect(r.violations).toEqual([]);
    expect(r).toMatchObject({ id: 'docx', mode: 'standard' });
  });

  it('needs a title and a language that agree', () => {
    expect(rules(docx(p('Text'), { title: '' }))).toEqual(['docx-title']);
    expect(rules(docx(p('Text'), { lang: '' }))).toEqual(['docx-language']);
    expect(messages(docx(p('Text'), { lang: 'cs-CZ', coreLang: 'en-GB' }))).toMatch(/the text is in cs-CZ but the properties say en-GB/);
  });

  it('finds headings that skip a level, also through built-in style names and basedOn', () => {
    expect(messages(docx(p('Intro', 'Heading2')))).toMatch(/heading "Intro" is level 2 after level 0/);
    expect(messages(docx(p('A', 'Heading1') + p('Deep', 'Heading3')))).toMatch(/heading "Deep" is level 3 after level 1/);
    expect(rules(docx(p('A', 'Heading1') + p('', 'Heading2')))).toEqual(['docx-heading-order']);
  });

  it('finds pictures without alternative text', () => {
    const pic = (descr: string) => `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1"${descr}/></wp:inline></w:drawing></w:r></w:p>`;
    expect(messages(docx(pic('')))).toMatch(/picture "Picture 1" has no alternative text/);
    expect(rules(docx(pic(' descr="A chart"')))).toEqual([]);
  });

  it('finds tables without a repeating header row or alternative text', () => {
    const table = (tblPr: string, trPr: string) => `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tr>${trPr}<w:tc>${p('H')}</w:tc></w:tr><w:tr><w:tc>${p('C')}</w:tc></w:tr></w:tbl>`;
    expect(messages(docx(table('', '')))).toMatch(/table 1: the first row is not marked as a header row[\s\S]*table 1 has no alternative text/);
    expect(rules(docx(table('<w:tblCaption w:val="Prices"/>', '<w:trPr><w:tblHeader/></w:trPr>')))).toEqual([]);
  });

  it('finds links without text', () => {
    expect(messages(docx('<w:p><w:hyperlink w:anchor="intro"><w:r><w:t> </w:t></w:r></w:hyperlink></w:p>'))).toMatch(/a link to #intro has no text/);
  });

  it('measures contrast through styles and shading, with the large-text threshold', () => {
    expect(messages(docx(p('Pale text', 'Pale')))).toMatch(/text #BBBBBB on #FFFFFF is 1\.\d\d:1, needs 4\.5:1: "Pale text"/);
    // a dark shading makes the same color readable; a paragraph shading counts too
    expect(rules(docx(p('On dark', 'Pale', '<w:shd w:val="clear" w:fill="111111"/>')))).toEqual([]);
    expect(rules(docx('<w:p><w:pPr><w:shd w:val="clear" w:fill="111111"/></w:pPr><w:r><w:rPr><w:color w:val="BBBBBB"/></w:rPr><w:t>x</w:t></w:r></w:p>'))).toEqual([]);
    // #767676 is 4.54:1 on white; #959595 is 3.0:1: enough only for large text (18 pt, or 14 pt bold)
    expect(rules(docx(p('Grey', undefined, '<w:color w:val="767676"/>')))).toEqual([]);
    expect(rules(docx(p('Grey', undefined, '<w:color w:val="959595"/>')))).toEqual(['docx-contrast']);
    expect(rules(docx(p('Big', undefined, '<w:color w:val="949494"/><w:sz w:val="36"/>')))).toEqual([]);
    expect(rules(docx(p('Bold', undefined, '<w:b/><w:color w:val="949494"/><w:sz w:val="28"/>')))).toEqual([]);
    // the same finding is reported once
    expect(rules(docx(p('One', 'Pale') + p('Two', 'Pale')))).toEqual(['docx-contrast']);
  });

  it('reports a file that is not a Word document', () => {
    expect(rules(new Uint8Array([1, 2, 3]))).toEqual(['docx-package']);
  });

  it('maps every rule to WCAG criteria for the conformance record', () => {
    const report = { passed: false, checks: [checkDocx(docx(p('Intro', 'Heading2')))] };
    const c = conformance(report, { media: false, forms: false });
    expect(c.failed).toEqual(['1.3.1', '2.4.6']);
    expect(c.checked).toEqual(expect.arrayContaining(['1.1.1', '1.4.3', '2.4.2', '2.4.4', '3.1.1']));
    expect(Object.keys(DOCX_CRITERIA)).toEqual(expect.arrayContaining(['docx-title', 'docx-language', 'docx-heading-order', 'docx-alt-text', 'docx-table-header', 'docx-link-text', 'docx-contrast']));
  });
});

describe('parseXml', () => {
  it('reads elements, attributes, entities and self-closing tags', () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><a x="1 &amp; 2"><b/>t&lt;x&#x41;</a>');
    const a = root.children[0] as { name: string; attrs: Record<string, string>; children: unknown[] };
    expect(a.name).toBe('a');
    expect(a.attrs).toEqual({ x: '1 & 2' });
    expect(a.children).toEqual([{ name: 'b', attrs: {}, children: [] }, 't<xA']);
  });
});
