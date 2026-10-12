/**
 * Writes docs/acr/libka-outputs.md: a draft Accessibility Conformance Report (EU edition, after the VPAT 2.5 INT
 * format) for the outputs LibKa builds (web page, A4 PDF, slides, Word file). It claims "Supports" only where LibKa enforces a
 * criterion by design AND checks it automatically on every build; everything else says what a person must review.
 * Regenerate after changing the mapping or the remarks:
 *
 *   node packages/guard/src/build-acr.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCX_CRITERIA, enClause, GUARD_CRITERIA, PDFUA_CRITERIA, WCAG22, axeCriteria } from './wcag.ts';

type Level = 'Supports' | 'Partially Supports' | 'Does Not Support' | 'Not Applicable' | 'Not Evaluated';

/** What LibKa does for a criterion, by design, and the level that earns. Criteria not listed are Not Evaluated. */
const REMARKS: Readonly<Record<string, [Level, string]>> = {
  '1.1.1': ['Partially Supports', 'The build refuses an image without alternative text and a caption; charts get a generated text alternative and their data table; diagrams need an accessible title and description; decorative icons are hidden. Checked by axe and, in the PDF, by PDF/UA-1; every picture in the Word file carries its alternative text (checked by Guard). Whether a text alternative describes its image well is the author\'s part.'],
  '1.2.1': ['Supports', 'A video needs a transcript (the build refuses it otherwise).'],
  '1.2.2': ['Partially Supports', 'Video files need captions (WebVTT); embedded players rely on the captions of their platform.'],
  '1.2.3': ['Partially Supports', 'The required transcript is a media alternative; audio description is not enforced.'],
  '1.2.4': ['Not Applicable', 'LibKa outputs hold no live media.'],
  '1.2.5': ['Does Not Support', 'Audio description is not enforced; authors add it to the video themselves.'],
  '1.3.1': ['Supports', 'Semantic HTML from typed blocks: headings, lists, tables with captions and header scope, figures, description lists; a PDF tagged and validated against PDF/UA-1; a Word file with real headings, lists, footnotes and tables whose header row repeats (checked by Guard).'],
  '1.3.2': ['Partially Supports', 'By design, every output reads in the source order, and the PDF\'s tags follow it. No tool can verify a meaningful reading order (veraPDF checks the tag structure, not the order): a person reviews it.'],
  '1.3.4': ['Supports', 'No output locks the orientation; slides scale to the screen.'],
  '1.3.5': ['Not Applicable', 'LibKa outputs hold no form fields that collect user data (UI specimens are inert pictures of a UI).'],
  '1.4.1': ['Partially Supports', 'Charts use pattern fills and marker shapes, comparison cells show words as well as icons, status badges carry their word; authors can still write colour-only instructions.'],
  '1.4.3': ['Supports', 'Every colour comes from tokens whose text contrast is gated at 4.5:1 in the build; Guard measures every text on the rendered page in light, dark and high contrast (7:1), and every run of text in the Word file against its shading.'],
  '1.4.4': ['Partially Supports', 'Web page text is sized in relative units; slides that would clip content are continued on new slides, and Guard fails a slide that still does not fit. Slides are a scaled 16:9 canvas, and zooming to 200% has not been audited.'],
  '1.4.5': ['Partially Supports', 'Text is real text in the web page, the PDF and the slides, where diagrams are drawn as SVG text. In the Word file, diagrams, charts and UI specimens are pictures with their text alternative; the chart data follows as a table and the diagram source in an appendix.'],
  '1.4.10': ['Partially Supports', 'The web page is a single responsive column: Guard loads every page 320 CSS pixels wide and fails one that scrolls sideways (code blocks and wide tables scroll in their own box); content that a box of its own clips instead of scrolling is not reported. Slides are a fixed 16:9 canvas by nature, scaled down to fit a narrow screen.'],
  '1.4.11': ['Partially Supports', 'The token build holds button and badge colours, the boundary of text fields and the focus ring to at least 3:1 against every background in every theme; other borders and graphics are not measured automatically.'],
  '2.1.1': ['Partially Supports', 'Tabs, accordions, copy buttons and the deck are keyboard operable; a full keyboard audit per document is a manual step.'],
  '2.1.2': ['Partially Supports', 'No component is known to trap focus; this has not been audited for every component.'],
  '2.1.4': ['Supports', 'The web page has no single-character shortcuts. The slides\' letter keys (N, O, P, F, D, C) can be turned off with the Letter shortcuts button, and the choice is remembered in the browser; arrows, Home, End and Space keep working.'],
  '2.2.1': ['Not Applicable', 'LibKa outputs have no time limits; slides never advance on their own.'],
  '2.2.2': ['Supports', 'Nothing moves on its own; motion follows the reduced-motion preference.'],
  '2.3.1': ['Partially Supports', 'LibKa itself adds nothing that flashes; videos and animated images an author adds are not checked for flashes.'],
  '2.4.1': ['Supports', 'The web page starts with a skip link to its content and has landmarks; the slides have main, navigation and complementary landmarks and a heading on every slide; the PDF and the Word file have tagged headings.'],
  '2.4.2': ['Supports', 'A title is required; the PDF shows its title instead of the file name, and the Word file has it in its properties.'],
  '2.4.4': ['Partially Supports', 'Links get their text as accessible name and the PDF a description per link; vague link texts are an authoring choice the skill warns about.'],
  '2.4.6': ['Partially Supports', 'Headings are required to be in order (in the Word file too, checked by Guard); whether a heading describes its topic is an authoring choice.'],
  '2.4.7': ['Supports', 'Every link, button and focusable element shows an outline in the focus-ring colour when focused from the keyboard; the token build holds that colour to at least 3:1 against every background in every theme.'],
  '2.5.8': ['Supports', 'Interactive targets are at least 24 by 24 pixels (footnote markers included); checked by axe.'],
  '3.1.1': ['Supports', 'The document language is set from the source and written to every output, the PDF and the Word file included.'],
  '3.3.1': ['Not Applicable', 'No forms.'], '3.3.2': ['Not Applicable', 'No forms.'], '3.3.3': ['Not Applicable', 'No forms.'],
  '3.3.4': ['Not Applicable', 'No forms.'], '3.3.7': ['Not Applicable', 'No forms.'], '3.3.8': ['Not Applicable', 'No forms.'],
  '4.1.2': ['Supports', 'Controls are native elements or carry roles and names; checked by axe on every page and deck.'],
};

export function acrMarkdown(): string {
  const axe = new Set([...axeCriteria().values()].flat());
  const guard = new Set(Object.values(GUARD_CRITERIA).flat());
  const docx = new Set(Object.values(DOCX_CRITERIA).flat());
  const auto = (sc: string) => [axe.has(sc) ? 'axe-core' : '', guard.has(sc) ? 'Guard' : '', PDFUA_CRITERIA.includes(sc) ? 'veraPDF PDF/UA-1' : '', docx.has(sc) ? 'Guard (Word file)' : ''].filter(Boolean).join(', ') || 'none';
  const rows = WCAG22.map(({ sc, title, level }) => {
    const [result, remark] = REMARKS[sc] ?? ['Not Evaluated', auto(sc) === 'none'
      ? 'Not evaluated: no automated check and no audit covers it; review each document.'
      : 'Not evaluated as a whole: the automated checks below cover part of it; review each document.'];
    return `| ${sc} ${title} (${level}) | ${enClause(sc, 'web')}, ${enClause(sc, 'document')} | ${result} | ${remark} Automated checks: ${auto(sc)}. |`;
  });
  const count = (l: Level) => WCAG22.filter(({ sc }) => (REMARKS[sc]?.[0] ?? 'Not Evaluated') === l).length;
  return [
    '---', 'title: "LibKa outputs: Accessibility Conformance Report (draft)"',
    'subtitle: EU edition, WCAG 2.2 level A and AA, EN 301 549 v4.1.1 clauses 9 and 10', 'status: Draft', 'lang: en', '---', '',
    ':::callout[A draft, generated from the checks]{variant=important}',
    'This report describes what LibKa enforces and checks for the web pages, PDFs, slides and Word files it builds. It is generated from the same rule mapping the build uses (`packages/guard/src/wcag.ts`) and is a draft until a person has reviewed it. The conformance of a particular document also depends on its content: every build writes its own report next to its outputs (`<name>.conformance.md`).',
    ':::', '',
    ':::metrics',
    `- **${count('Supports')}** supports`,
    `- **${count('Partially Supports')}** partially supports`,
    `- **${count('Not Evaluated') + count('Does Not Support')}** not evaluated or not supported`,
    `- **${count('Not Applicable')}** not applicable`,
    ':::', '',
    '## Scope',
    '',
    'The outputs of `libka build`: a single-file web page, a tagged A4 PDF validated against PDF/UA-1 (ISO 14289-1), a 16:9 slide deck with its slide PDF, and an editable Word file (DOCX). The LibKa Studio and the command-line tools are not covered by this report.', '',
    '## WCAG 2.2 and EN 301 549',
    '',
    ':::table{caption="Success criteria, EN 301 549 v4.1.1 clauses (9 web, 10 documents), result and remarks"}', '',
    '| Criterion | EN 301 549 | Result | Remarks |', '|---|---|---|---|', ...rows, '', ':::', '',
    '## How it was evaluated',
    '',
    'Automated: axe-core with the WCAG 2.0, 2.1 and 2.2 A/AA rules; Guard\'s live contrast measurement in standard and more-contrast mode and its structure rules, reflow at 320 CSS pixels among them; veraPDF against PDF/UA-1; the structure and contrast checks of the Word file. Microsoft Word\'s own accessibility checker is run by a person on sample documents. Design: the block registry and the build refuse content that would break a criterion (missing alternative text, captions or transcripts). Criteria marked Not Evaluated need a person with each document.', '',
  ].join('\n');
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'acr', 'libka-outputs.md');
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, acrMarkdown());
  console.log(`acr: wrote ${OUT}`);
}
