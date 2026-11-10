import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { BLOCKS, EXAMPLES_CS, block, documentSchema } from '@libka/blocks';
import { aiBadge, aiLabelShown, aiMarks, aiReminders, compareVersions, fileFormat, parse, plainText, revisionColumn, revisionEntries, type Block } from '../src/index.ts';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(documentSchema());
/** Model JSON without the Markdown AST positions (they are parser detail, not document content). */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (k, v) => (k === 'position' ? undefined : v)));

describe('every registry block', () => {
  for (const def of BLOCKS) {
    it(`${def.name}: the example parses cleanly and matches the block's JSON schema`, () => {
      const { document, problems } = parse(def.frontMatter ? `---\ntitle: T\n${def.frontMatter}\n---\n\n${def.example}\n` : `# T\n\n${def.example}\n`);
      expect(problems).toEqual([]);
      expect(document.blocks.map((b) => b.type)).toContain(def.name);
      const ok = validate(plain(document));
      expect(ok ? [] : validate.errors!.map((e) => `${e.instancePath} ${e.message}`)).toEqual([]);
    });
  }

  for (const def of BLOCKS) {
    it(`${def.name}: the Czech example parses cleanly in a Czech document and matches the schema`, () => {
      const example = EXAMPLES_CS[def.name]!.example;
      const { document, problems } = parse(`---\ntitle: T\nlang: cs\n${def.frontMatter ? `${def.frontMatter}\n` : ''}---\n\n${example}\n`);
      expect(problems).toEqual([]);
      expect(document.blocks.map((b) => b.type)).toContain(def.name);
      const ok = validate(plain(document));
      expect(ok ? [] : validate.errors!.map((e) => `${e.instancePath} ${e.message}`)).toEqual([]);
    });
  }

  it('uses the registry for attributes: unknown ones and wrong values are reported', () => {
    const { problems } = parse('# T\n\n:::chart{type=pie caption="x" colour=red}\n| A | B |\n|---|---|\n| a | 1 |\n:::\n');
    const text = problems.map((p) => p.message).join('\n');
    expect(text).toMatch(/:::chart has unknown attributes: colour/);
    expect(text).toMatch(/type must be one of bar, line, donut/);
    expect(block('chart')!.attributes!.type!.values).toEqual(['bar', 'line', 'donut']);
  });
});

describe('core block rules', () => {
  const messages = (md: string) => parse(`# T\n\n${md}\n`).problems.map((p) => p.message).join('\n');
  it.each([
    ['one tab', '::::tabs\n:::tab[Only]\nx\n:::\n::::', /at least two :::tab/],
    ['a heading inside a tab', '::::tabs\n:::tab[A]\n## No\n:::\n:::tab[B]\nx\n:::\n::::', /headings are not allowed inside :::tab/],
    ['a don\'t without a do', '::::compare\n:::dont[Bad]\nx\n:::\n::::', /at least one :::do and one :::dont/],
    ['pros and cons without the option', '::::pros-cons\n:::pros\n- a\n:::\n:::cons\n- b\n:::\n::::', /pros and cons need the option they weigh as the label/],
    ['pros without cons', '::::pros-cons[A]\n:::pros\n- a\n:::\n::::', /::::pros-cons needs :::cons: weigh both sides/],
    ['pros and cons empty', '::::pros-cons[A]\n::::', /needs :::pros and :::cons/],
    ['pros as a sentence', '::::pros-cons[A]\n:::pros\nIt is cheap.\n:::\n:::cons\n- b\n:::\n::::', /:::pros holds one bulleted list/],
    ['cons as a numbered list', '::::pros-cons[A]\n:::pros\n- a\n:::\n:::cons\n1. b\n:::\n::::', /:::cons holds one bulleted list/],
    ['pros twice', '::::pros-cons[A]\n:::pros\n- a\n:::\n:::pros\n- c\n:::\n:::cons\n- b\n:::\n::::', /:::pros appears twice/],
    ['a labelled side', '::::pros-cons[A]\n:::pros[For]\n- a\n:::\n:::cons\n- b\n:::\n::::', /:::pros takes no label or attributes/],
    ['a sentence beside the sides', '::::pros-cons[A]\n:::pros\n- a\n:::\n:::cons\n- b\n:::\nMore.\n::::', /::::pros-cons holds only :::pros and :::cons/],
    ['a process without a name', ':::flow\n1. Plan\n2. Do\n:::', /a process needs its name as the label/],
    ['a process of one stage', ':::flow[P]\n1. Plan\n:::', /2 to 6 stages \(found 1\)/],
    ['a process of seven stages', ':::flow[P]\n1. a\n2. b\n3. c\n4. d\n5. e\n6. f\n7. g\n:::', /2 to 6 stages \(found 7\); for more stages or branches use a ```mermaid diagram/],
    ['a process as sentences', ':::flow[P]\nFirst we plan, then we do.\n:::', /:::flow must contain exactly one list/],
    ['an unknown process shape', ':::flow[P]{shape=funnel}\n1. a\n2. b\n:::', /shape must be one of linear, cycle/],
    ['a matrix without a title','::::matrix{type=swot}\n:::q\n- a\n:::\n:::q\n- b\n:::\n:::q\n- c\n:::\n:::q\n- d\n:::\n::::', /a matrix needs its title as the label/],
    ['a matrix without a type', '::::matrix[M]\n:::q[A]\n- a\n:::\n:::q[B]\n- b\n:::\n:::q[C]\n- c\n:::\n:::q[D]\n- d\n:::\n::::', /:::matrix needs a type/],
    ['a matrix with three quadrants', '::::matrix[M]{type=swot}\n:::q\n- a\n:::\n:::q\n- b\n:::\n:::q\n- c\n:::\n::::', /exactly four :::q quadrants, found 3/],
    ['a matrix with five quadrants', '::::matrix[M]{type=swot}\n:::q\n- a\n:::\n:::q\n- b\n:::\n:::q\n- c\n:::\n:::q\n- d\n:::\n:::q\n- e\n:::\n::::', /exactly four :::q quadrants, found 5/],
    ['a grid quadrant without a name', '::::matrix[M]{type=grid}\n:::q\n- a\n:::\n:::q[B]\n- b\n:::\n:::q[C]\n- c\n:::\n:::q[D]\n- d\n:::\n::::', /each quadrant of a grid needs its name/],
    ['an empty quadrant', '::::matrix[M]{type=swot}\n:::q\n:::\n:::q\n- b\n:::\n:::q\n- c\n:::\n:::q\n- d\n:::\n::::', /a quadrant needs its points/],
    ['a SWOT with axes', '::::matrix[M]{type=swot y="Impact"}\n:::q\n- a\n:::\n:::q\n- b\n:::\n:::q\n- c\n:::\n:::q\n- d\n:::\n::::', /a SWOT has no axes/],
    ['a quadrant with attributes', '::::matrix[M]{type=swot}\n:::q{tone=good}\n- a\n:::\n:::q\n- b\n:::\n:::q\n- c\n:::\n:::q\n- d\n:::\n::::', /:::q takes no attributes/],
    ['a heading in a quadrant', '::::matrix[M]{type=swot}\n:::q\n## No\n:::\n:::q\n- b\n:::\n:::q\n- c\n:::\n:::q\n- d\n:::\n::::', /headings are not allowed inside :::q/],
    ['a sentence beside the quadrants', '::::matrix[M]{type=swot}\n:::q\n- a\n:::\n:::q\n- b\n:::\n:::q\n- c\n:::\n:::q\n- d\n:::\nMore.\n::::', /::::matrix holds only four :::q quadrants/],
    ['a long statement', `:::statement\n${'word '.repeat(31)}\n:::`, /31 words; keep it to 30/],
    ['five figures', ':::metrics\n- **1** a\n- **2** b\n- **3** c\n- **4** d\n- **5** e\n:::', /2 to 4 figures/],
    ['a video file without captions', ':::video[Demo]{src="demo.mp4"}\nTranscript.\n:::', /need captions/],
    ['a video without transcript', ':::video[Demo]{src="https://vimeo.com/76979871"}\n:::', /need a transcript/],
    ['a donut with six parts', ':::chart{type=donut caption="x"}\n| A | V |\n|---|---|\n| a | 1 |\n| b | 1 |\n| c | 1 |\n| d | 1 |\n| e | 1 |\n| f | 1 |\n:::', /at most 5 parts/],
    ['a value that is not a number', ':::chart{type=bar caption="x"}\n| A | V |\n|---|---|\n| a | lots |\n:::', /"lots" in row "a" is not a number/],
    ['a gallery of one', ':::gallery\n![a](a.png "A")\n:::', /at least two images/],
    ['a shortcut without keys', ':::shortcuts{caption="x"}\n- Save\n:::', /starts with its keys/],
    ['a highlighted line that does not exist', '```js {4}\nconst a = 1;\n```', /highlighted line 4 is beyond the 1 line of/],
    ['a UI component outside a specimen', '::button[Save]', /put it inside a :::ui/],
    ['an unknown UI component', ':::ui{caption="x"}\n::slider[Volume]\n:::', /:::ui holds UI components/],
    ['a select without options', ':::ui{caption="x"}\n::field[Plan]{type=select}\n:::', /needs options=/],
    ['a modal without its action', ':::ui{caption="x"}\n::modal[Delete?]{text="Gone for good."}\n:::', /::modal needs primary=/],
    ['a block that could not be read', ':::quote{source="A \\"b\\" c"}\nx\n:::', /looks like a block but could not be read.*single quotes/],
    ['a link to a missing heading', '## Getting started\n\nSee [it](#getting-startd).', /"#getting-startd" points nowhere.*did you mean #getting-started/],
  ])('reports %s', (_, md, message) => expect(messages(md)).toMatch(message));

  it('reads code titles, highlighted lines, > quotes and :kbd keys', () => {
    const { document } = parse('# T\n\n```bash title="run.sh" {1,3-4}\na\nb\nc\nd\n```\n\n> Quoted.\n\nPress :kbd[Ctrl+Shift+P].\n');
    expect(document.blocks[0]).toMatchObject({ type: 'code', title: 'run.sh', marked: [1, 3, 4] });
    expect(document.blocks[1]).toMatchObject({ type: 'quote' });
    expect(JSON.stringify(document.blocks[2])).toMatch(/"name":"kbd"/);
  });

  it('reports an inline :kbd or :badge left open, as when a backslash escapes its bracket, but not in code', () => {
    const { problems } = parse('# T\n\nSplit: :kbd[Cmd+\\].\n\nKey: :kbd[Ctrl+\\\\] and `:kbd[Cmd+\\]` as code.\n\n- New :badge[Beta\n');
    expect(problems.map((p) => [p.line, p.message.slice(0, 26)])).toEqual([[3, '":kbd[" is not closed, so '], [7, '":badge[" is not closed, s']]);
  });
});

describe('UI specimens and badges', () => {
  it('reads a specimen with its components', () => {
    const { document, problems } = parse('# T\n\n:::ui{caption="Sign up" theme=both layout=stack}\n::field[Plan]{type=select options="Free|Team" value=Team required}\n::button[Continue]{variant=primary state=loading}\n:::\n');
    expect(problems).toEqual([]);
    expect(document.blocks[0]).toEqual({ type: 'ui', caption: 'Sign up', theme: 'both', layout: 'stack', items: [
      { kind: 'field', label: 'Plan', input: 'select', options: ['Free', 'Team'], value: 'Team', required: true },
      { kind: 'button', label: 'Continue', variant: 'primary', state: 'loading' },
    ] });
  });

  it('keeps an inline badge, accepts quotes inside single-quoted values, and in-page links that exist', () => {
    const { document, problems } = parse("# T\n\n## Getting started\n\nNew :badge[Beta]{variant=info}, see [here](#getting-started).\n\n:::quote{source='What \"open\" means'}\nx\n:::\n");
    expect(problems).toEqual([]);
    expect(JSON.stringify(document.blocks[1])).toMatch(/"name":"badge"/);
    expect(document.blocks[2]).toMatchObject({ type: 'quote', source: 'What "open" means' });
  });
});

describe('AI provenance', () => {
  const fm = (ai: string, body = 'Text.') => parse(`---\ntitle: T\n${ai}\n---\n\n${body}\n`);
  it('reads the front matter ai, short or with its fields', () => {
    expect(fm('ai: ai-generated').document.meta.ai).toEqual({ use: 'ai-generated' });
    const long = fm('ai:\n  use: ai-assisted\n  reviewed-by: Ann Novak\n  approved-by: Library Board\n  tool: Claude\n  date: 2026-10-20\n  checked: [facts, figures]\n  label: true');
    expect(long.problems).toEqual([]);
    expect(long.document.meta.ai).toEqual({ use: 'ai-assisted', reviewedBy: 'Ann Novak', approvedBy: 'Library Board', tool: 'Claude', date: '2026-10-20', checked: ['facts', 'figures'], label: true });
  });
  it.each([
    ['an unknown use', 'ai: written-by-ai', /ai must be ai-assisted or ai-generated \(found "written-by-ai"\)/],
    ['fields without the use', 'ai:\n  reviewed-by: Ann', /ai needs its use, ai-assisted or ai-generated/],
    ['an unknown field', 'ai:\n  use: ai-generated\n  reviewer: Ann', /ai has unknown fields: reviewer/],
    ['a date in words', 'ai:\n  use: ai-generated\n  date: 20 October 2026', /the ai date must be written YYYY-MM-DD/],
    ['a label that is not true or false', 'ai:\n  use: ai-generated\n  label: maybe', /the ai label is true .* or false/],
  ])('reports %s', (_, ai, pattern) => {
    const { problems } = fm(ai);
    expect(problems.map((p) => p.code)).toContain('ai-invalid');
    expect(problems.map((p) => p.message).join('\n')).toMatch(pattern);
  });
  it('marks blocks, counts an AI summary as generated, and names the section and reviewer', () => {
    const md = '## Hours\n\n:::callout[Holiday]{variant=tip ai=generated}\nClosed.\n:::\n\n::::tabs\n:::tab[A]\n- x\n:::\n:::tab[B]\n- y\n:::\n::::\n\n:::summary{source=ai reviewed-by="Ann"}\n- A\n- B\n- C\n:::';
    const { document, problems } = fm('ai:\n  use: ai-assisted\n  reviewed-by: Petr', md);
    expect(problems).toEqual([]);
    expect(document.blocks[1]).toMatchObject({ type: 'callout', ai: 'generated' });
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    expect(aiMarks(document)).toEqual([
      { block: 'callout', use: 'generated', section: 'Hours', reviewedBy: 'Petr' },
      { block: 'summary', use: 'generated', section: 'Hours', reviewedBy: 'Ann' }]);
  });
  it('reminds, never reports, when AI-generated content names nobody who reviewed it and shows no label', () => {
    const unreviewed = fm('ai: ai-generated');
    expect(unreviewed.problems).toEqual([]);
    expect(aiReminders(unreviewed.document)).toEqual([expect.stringMatching(/^the document is marked ai-generated and names nobody who reviewed it: .*Article 50\(4\)/)]);
    const block = fm('ai: ai-assisted', '## Hours\n\n:::summary{source=ai}\n- A\n- B\n- C\n:::');
    expect(block.problems).toEqual([]);
    expect(aiReminders(block.document)).toEqual([expect.stringMatching(/^the AI summary in "Hours" is marked as AI-generated/)]);
    // a reviewer, a label, AI that only assisted, or no AI at all: nothing to remind
    for (const ai of ['ai:\n  use: ai-generated\n  reviewed-by: Ann', 'ai:\n  use: ai-generated\n  label: true', 'ai: ai-assisted', '']) expect(aiReminders(fm(ai).document)).toEqual([]);
  });
  it('shows the label and the badge only when the document turns the label on', () => {
    const b = fm('ai: ai-generated', ':::callout[T]{variant=tip ai=generated}\nText.\n:::').document.blocks[0]!;
    expect(aiLabelShown({ ai: { use: 'ai-generated' } })).toBe(false);
    expect(aiBadge(b, { ai: { use: 'ai-generated' } })).toBe(false);
    expect(aiBadge(b, { ai: { use: 'ai-generated', label: true } })).toBe(true);
    expect(aiBadge(b, { ai: { use: 'ai-generated', label: true, reviewedBy: 'Ann' } })).toBe(false);
  });
});

describe('the document frame', () => {
  const messages = (md: string) => parse(`# T\n\n${md}\n`).problems.map((p) => p.message).join('\n');
  it.each([
    ['a summary with two points', ':::summary\n- One\n- Two\n:::', /3 to 5 points \(found 2\)/],
    ['a summary with six points', `:::summary\n${'- Point\n'.repeat(6)}:::`, /3 to 5 points \(found 6\)/],
    ['a block marked with an unknown AI use', ':::callout[T]{variant=tip ai=generatd}\nText.\n:::', /ai must be one of generated, assisted \(:::callout\)/],
    ['contents marked as AI content', ':::toc{ai=generated}\n:::', /:::toc has unknown attributes: ai/],
    ['a reviewer without source=ai', ':::summary{reviewed-by="Docs lead"}\n- A\n- B\n- C\n:::', /reviewed-by is shown only for AI summaries/],
    ['a summary point with a nested list', ':::summary\n- A\n  - nested\n- B\n- C\n:::', /one short paragraph/],
    ['a doc-status with nothing to show', ':::doc-status\n:::', /has nothing to show/],
    ['a doc-status with content', ':::doc-status{owner="Team"}\nText\n:::', /:::doc-status has no content/],
    ['a review date that is not a date', ':::doc-status{reviewed=2026-13-01}\n:::', /reviewed must be a date written YYYY-MM-DD/],
    ['a next review before the last one', ':::doc-status{reviewed=2026-09-01 next-review=2026-08-01}\n:::', /must come after reviewed/],
    ['two doc-status blocks', ':::doc-status{owner="A"}\n:::\n\n:::doc-status{owner="A"}\n:::', /only one :::doc-status/],
    ['a download without a name', ':::download{href=report.pdf}\n:::', /a download needs a name that says what the file is/],
    ['a download without href', ':::download[Report]\n:::', /:::download needs a href/],
    ['a download on another site without size', ':::download[Report]{href="https://example.org/r.pdf" type=PDF}\n:::', /a file on another site needs its type and size/],
    ['a download with a script address', ':::download[Report]{href="javascript:alert(1)"}\n:::', /href "javascript:alert\(1\)" is not allowed/],
    ['a download with pages that are no number', ':::download[Report]{href=r.pdf pages=many}\n:::', /pages must be a whole number of pages \(found "many"\)/],
    ['a download holding a list', ':::download[Report]{href=r.pdf}\n- a\n:::', /:::download holds at most one short sentence/],
    ['a decision without a title', '::::decision{status=proposed}\n:::context\nWhy.\n:::\n::::', /a decision needs a title that states it/],
    ['a decision without a status', '::::decision[Use A]\n:::context\nWhy.\n:::\n::::', /:::decision needs a status/],
    ['a decision with an unknown status', '::::decision[Use A]{status=approved}\n:::context\nWhy.\n:::\n::::', /status must be one of proposed, accepted, rejected, superseded/],
    ['an accepted decision without date and decider', '::::decision[Use A]{status=accepted}\n:::context\nWhy.\n:::\n::::', /status accepted needs its date \(date=YYYY-MM-DD\) and who decided \(by="\.\.\."\)/],
    ['a decision date written in words', '::::decision[Use A]{status=proposed date="1 March 2026"}\n:::context\nWhy.\n:::\n::::', /a decision date must be written YYYY-MM-DD/],
    ['a decision without context', '::::decision[Use A]{status=proposed}\n:::options\n- A\n:::\n::::', /a decision needs its :::context/],
    ['a decision part twice', '::::decision[Use A]{status=proposed}\n:::context\nA\n:::\n:::context\nB\n:::\n::::', /:::context appears twice in the decision/],
    ['an empty decision part', '::::decision[Use A]{status=proposed}\n:::context\nA\n:::\n:::consequences\n:::\n::::', /:::consequences is empty: write what follows from the decision/],
    ['a heading inside a decision', '::::decision[Use A]{status=proposed}\n:::context\nA\n:::\n\n### More\n\n::::', /::::decision holds no headings: .* put the heading after the decision's closing ::::/],
    ['a decision part with a label','::::decision[Use A]{status=proposed}\n:::context[Background]\nA\n:::\n::::', /:::context takes no label or attributes/],
    ['a list after the decision parts', '::::decision[Use A]{status=proposed}\n:::context\nA\n:::\n- B\n::::', /::::decision holds only :::context, :::options, :::consequences/],
    ['a decision inside tabs', ':::::tabs\n::::tab[A]\n:::decision[Use A]{status=proposed}\nx\n:::\n::::\n::::tab[B]\nx\n::::\n:::::', /:::decision cannot be inside another block/],
    ['a revision history without a table', ':::revisions\n- 1.0 First\n:::', /:::revisions must contain exactly one Markdown table/],
    ['a heading of its own above the revision history', '## Revision history\n\n:::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.0 | 2026-03-01 | First |\n:::', /remove the heading "## Revision history" above :::revisions: the block makes its own heading; write the title in its brackets \(:::revisions\[Revision history\]\)/],
    ['a revision history with an unknown column', ':::revisions\n| Version | Date | Change | Notes |\n|---|---|---|---|\n| 1.0 | 2026-03-01 | First | x |\n:::', /:::revisions has no column "Notes"/],
    ['a revision history without dates', ':::revisions\n| Version | Change |\n|---|---|\n| 1.0 | First |\n:::', /needs the columns version, date and change \(missing: date\)/],
    ['a revision history with a column twice', ':::revisions\n| Version | Date | Change | Popis |\n|---|---|---|---|\n| 1.0 | 2026-03-01 | First | x |\n:::', /has the change column twice \("Popis"\)/],
    ['a revision history without rows', ':::revisions\n| Version | Date | Change |\n|---|---|---|\n:::', /needs at least one row/],
    ['a revision without its change', ':::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.0 | 2026-03-01 |  |\n:::', /every revision needs its change/],
    ['a revision date written in words', ':::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.0 | 1 March 2026 | First |\n:::', /a revision date must be written YYYY-MM-DD \(found "1 March 2026"\)/],
    ['a version twice', ':::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.0 | 2026-09-01 | B |\n| 1.0 | 2026-03-01 | A |\n:::', /version 1\.0 appears twice/],
    ['revisions out of order', ':::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.2 | 2026-09-01 | C |\n| 1.0 | 2026-03-01 | A |\n| 1.1 | 2026-06-01 | B |\n:::', /version 1\.1 \(2026-06-01\) is out of order/],
    ['a newer version with an older date', ':::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.0 | 2026-03-01 | A |\n| 1.1 | 2026-02-01 | B |\n:::', /version 1\.1 \(2026-02-01\) is out of order/],
    ['two revision histories', ':::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.0 | 2026-03-01 | A |\n:::\n\n:::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.0 | 2026-03-01 | A |\n:::', /only one :::revisions/],
    ['a revision history inside a callout', '::::callout[T]{variant=info}\n:::revisions\n| Version | Date | Change |\n|---|---|---|\n| 1.0 | 2026-03-01 | A |\n:::\n::::', /:::revisions cannot be inside another block/],
    ['a byline without authors', ':::byline\n:::', /:::byline has nobody to show: add author to the front matter/],
    ['a byline with content', ':::byline\nText\n:::', /:::byline has no content/],
    ['two bylines', ':::byline\n:::\n\n:::byline\n:::', /only one :::byline/],
    ['a byline inside a callout', ':::callout[T]{variant=info}\n:::byline\n:::\n:::', /:::byline cannot be inside another block/],
    ['a doc-status inside tabs', '::::tabs\n:::tab[A]\n:::doc-status{owner="A"}\n:::\n:::\n:::tab[B]\nx\n:::\n::::', /cannot be inside another block/],
    ['a section without title', ':::section\n:::', /needs a title/],
    ['a section holding a list', ':::section[Part 2]\n- a\n:::', /at most a short sentence/],
    ['a section with an unknown break', ':::section[Part 2]{break=column}\n:::', /break must be one of page, none/],
    ['a dl term without value', ':::dl\n- **Owner**\n:::', /needs a value after it/],
    ['a dl item without bold term', ':::dl\n- Owner: Team\n:::', /starts with the term in bold/],
    ['a cta without href', ':::cta[Start the tutorial]\n:::', /:::cta needs a href/],
    ['a vague cta label', ':::cta[Click here]{href="https://example.org"}\n:::', /"Click here" does not say what happens/],
    ['a script cta', ':::cta[Run it]{href="javascript:alert(1)"}\n:::', /is not allowed/],
    ['a cta to a missing heading', ':::cta[Read the setup]{href="#setup"}\n:::', /"#setup" points nowhere/],
    ['an unknown GitHub alert', '> [!DANGER]\n> Hot.', /"\[!DANGER\]" is not a GitHub alert type/],
    ['an empty GitHub alert', '> [!NOTE]', /alert is empty/],
  ])('reports %s', (_, md, message) => expect(messages(md)).toMatch(message));

  it('reads GitHub alerts as callouts, with a title when it fills the marker line', () => {
    const { document, problems } = parse('# T\n\n> [!NOTE]\n> Useful info.\n\n> [!WARNING] Back up first\n> Export it.\n\n> [!TIP] Use **this** one\n\n> Plain quote.\n');
    expect(problems).toEqual([]);
    expect(plain(document.blocks)).toMatchObject([
      { type: 'callout', variant: 'note', body: [{ type: 'paragraph', text: [{ type: 'text', value: 'Useful info.' }] }] },
      { type: 'callout', variant: 'warning', title: 'Back up first', body: [{ type: 'paragraph', text: [{ value: 'Export it.' }] }] },
      { type: 'callout', variant: 'tip', body: [{ type: 'paragraph', text: [{ value: 'Use ' }, { type: 'strong' }, { value: ' one' }] }] },
      { type: 'quote' },
    ]);
    expect((document.blocks[0] as { title?: string }).title).toBeUndefined();
    expect((document.blocks[2] as { title?: string }).title).toBeUndefined();
  });

  it('reads a download with its format from the file name or the type attribute', () => {
    const one = (md: string) => parse(`# T\n\n${md}\n`).document.blocks[0];
    expect(one(':::download[Report]{href=files/report.pdf}\nAll the tables.\n:::')).toMatchObject({ type: 'download', label: 'Report', href: 'files/report.pdf', format: 'PDF', text: [{ type: 'text', value: 'All the tables.' }] });
    expect(one(':::download[Plan]{href=plan.xlsx size="20 KB" pages=3}\n:::')).toEqual({ type: 'download', label: 'Plan', href: 'plan.xlsx', format: 'Excel', size: '20 KB', pages: 3 });
    expect(one(':::download[Data]{href="data?id=1" type=CSV}\n:::')).toMatchObject({ format: 'CSV' });
    expect(fileFormat('a/b/notes.docx')).toBe('Word');
    expect(fileFormat('archive.tar.gz?x=1#y')).toBe('GZ');
    expect(fileFormat('README')).toBeUndefined();
  });

  it('reads pros and cons, pros first, and one per option inside a decision\'s options', () => {
    const one = parse('# T\n\n::::pros-cons[Option A]\n:::cons\n- Slow\n:::\n:::pros\n- Cheap\n- **Simple** to run\n:::\n::::\n');
    expect(one.problems).toEqual([]);
    const b = one.document.blocks[0] as Extract<Block, { type: 'pros-cons' }>;
    expect(b).toMatchObject({ type: 'pros-cons', title: 'Option A', cons: [[{ type: 'paragraph' }]] });
    expect(b.pros.map((i) => plainText((i[0] as Extract<Block, { type: 'paragraph' }>).text))).toEqual(['Cheap', 'Simple to run']);
    const md = '# T\n\n:::::decision[Use A]{status=proposed}\n::::context\nWhy.\n::::\n:::::options\n::::pros-cons[A]\n:::pros\n- Cheap\n:::\n:::cons\n- Slow\n:::\n::::\n::::pros-cons[B]\n:::pros\n- Fast\n:::\n:::cons\n- Costly\n:::\n::::\n:::::\n:::::\n';
    const { document, problems } = parse(md);
    expect(problems).toEqual([]);
    const options = (document.blocks[0] as Extract<Block, { type: 'decision' }>).parts[1]!;
    expect(options.body.map((x) => x.type === 'pros-cons' && x.title)).toEqual(['A', 'B']);
  });

  it('reads a process: its stages in order from a numbered or a bulleted list, linear unless it is a cycle', () => {
    const one = parse('# T\n\n:::flow[Life of a request]\n1. Arrives\n2. **Sorted** by urgency\n3. Closed\n:::\n');
    expect(one.problems).toEqual([]);
    const b = one.document.blocks[0] as Extract<Block, { type: 'flow' }>;
    expect(b).toMatchObject({ type: 'flow', title: 'Life of a request', shape: 'linear' });
    expect(b.stages.map((s) => plainText((s[0] as Extract<Block, { type: 'paragraph' }>).text))).toEqual(['Arrives', 'Sorted by urgency', 'Closed']);
    const cycle = parse('# T\n\n:::flow[PDCA]{shape=cycle}\n- Plan\n- Do\n- Check\n- Act\n:::\n');
    expect(cycle.problems).toEqual([]);
    expect(cycle.document.blocks[0]).toMatchObject({ shape: 'cycle', stages: { length: 4 } });
  });

  it('reads a matrix: a SWOT\'s names left to the renderer, a grid\'s names and axes as written', () => {
    const swot = parse('# T\n\n::::matrix[SWOT: the new app]{type=swot}\n:::q\n- Fast\n:::\n:::q[Weak spots]\n- Small team\n:::\n:::q\n- New market\n:::\n:::q\nRivals copy us.\n:::\n::::\n');
    expect(swot.problems).toEqual([]);
    const s = swot.document.blocks[0] as Extract<Block, { type: 'matrix' }>;
    expect(s).toMatchObject({ type: 'matrix', title: 'SWOT: the new app', kind: 'swot' });
    expect(s.quadrants.map((q) => q.label)).toEqual([undefined, 'Weak spots', undefined, undefined]);
    expect(s.quadrants[3]!.body[0]!.type).toBe('paragraph');
    const grid = parse('# T\n\n::::matrix[Plan]{type=grid x="Effort" y="Impact"}\n:::q[A]\n- a\n:::\n:::q[B]\n- b\n:::\n:::q[C]\n- c\n:::\n:::q[D]\n- d\n:::\n::::\n');
    expect(grid.problems).toEqual([]);
    expect(grid.document.blocks[0]).toMatchObject({ kind: 'grid', x: 'Effort', y: 'Impact', quadrants: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }] });
  });

  it('reads a decision with its status, the decision itself and its parts in their order, a comparison among the options', () => {
    const md = '# T\n\n### Before\n\n:::::decision[Use A]{status=superseded date=2026-03-01 by="Board"}\nWe use A.\n::::consequences\n- More work.\n::::\n::::options\n:::comparison[Options]\n| Feature | A | B |\n|---|---|---|\n| Cheap | yes | no |\n:::\n::::\n::::context\nWhy.\n::::\n:::::\n\n### After\n';
    const { document, problems } = parse(md);
    expect(problems.map((p) => p.code)).toEqual(['heading-skipped']);   // the first ### follows the title; the second follows the decision's ##
    const d = document.blocks[1] as Extract<Block, { type: 'decision' }>;
    expect(d).toMatchObject({ type: 'decision', title: 'Use A', id: 'use-a', status: 'superseded', date: '2026-03-01', by: 'Board', intro: [{ type: 'paragraph' }] });
    expect(d.parts.map((p) => p.kind)).toEqual(['context', 'options', 'consequences']);
    expect(d.parts[1]!.body[0]).toMatchObject({ type: 'comparison', caption: 'Options' });
    // a proposal needs neither date nor decider
    expect(parse('# T\n\n::::decision[Use B]{status=proposed}\n:::context\nWhy.\n:::\n::::\n').problems).toEqual([]);
  });

  it('reads a revision history by its column headings in English or Czech, newest or oldest first', () => {
    const one = (md: string) => parse(`# T\n\n${md}\n`);
    const cs = one(':::revisions\n| Verze | Datum | Popis změny | Zpracoval | Schválil: |\n|---|---|---|---|---|\n| 1.0 | 2026-03-01 | První verze | Petr | Jana |\n| 1.1 | 2026-06-01 | Úpravy | Petr |  |\n:::');
    expect(cs.problems).toEqual([]);
    const b = cs.document.blocks[0] as Extract<Block, { type: 'revisions' }>;
    expect(b).toMatchObject({ type: 'revisions', columns: ['version', 'date', 'change', 'author', 'approved'] });
    expect(b.title).toBeUndefined();
    expect(revisionEntries(b)).toEqual([{ version: '1.0', date: '2026-03-01', approvedBy: 'Jana' }, { version: '1.1', date: '2026-06-01' }]);
    // the same date for two versions, and versions that are not numbers, are in order
    expect(one(':::revisions[History]\n| Revision | Date | Changes |\n|---|---|---|\n| B | 2026-03-02 | b |\n| A2 | 2026-03-01 | a |\n| A1 | 2026-03-01 | a |\n:::').problems).toEqual([]);
    expect(revisionColumn('Approved by')).toBe('approved');
    expect(revisionColumn(' Schválil(a) ')).toBe('approved');
    expect(revisionColumn('Notes')).toBeUndefined();
    expect(compareVersions('v1.2', '1.10')).toBeLessThan(0);
    expect(compareVersions('2.0', '2')).toBe(0);
    expect(compareVersions('draft', '1.0')).toBeUndefined();
  });

  it('reads the authors from the front matter as a name, a person or a list, and gives them to :::byline', () => {
    const meta = (fm: string) => parse(`---\ntitle: T\n${fm}\n---\n\nText.\n`);
    expect(meta('author: Ann Novak').document.meta.author).toEqual([{ name: 'Ann Novak' }]);
    expect(meta('author: {name: Ann Novak, role: Security lead}').document.meta.author).toEqual([{ name: 'Ann Novak', role: 'Security lead' }]);
    const list = meta('author:\n  - name: Ann Novak\n    role: Security lead\n  - Petr Svoboda');
    expect(list.problems).toEqual([]);
    expect(list.document.meta.author).toEqual([{ name: 'Ann Novak', role: 'Security lead' }, { name: 'Petr Svoboda' }]);
    expect(meta('author:\n  - role: Lead').problems.map((p) => p.code)).toEqual(['author-invalid']);
    expect(meta('author:\n  - name: A\n    team: Docs').problems[0]!.message).toBe('author has unknown fields: team (known: name, role)');
    expect(meta('author:\n  - [A]').problems[0]!.message).toMatch(/^author must be a name, or a name with a role/);
    expect(meta('author: A').document.meta.author).toEqual([{ name: 'A' }]);
    const placed = parse('---\ntitle: T\nauthor: Ann Novak\n---\n\n:::byline\n:::\n');
    expect(placed.problems).toEqual([]);
    expect(placed.document.blocks).toEqual([{ type: 'byline', author: [{ name: 'Ann Novak' }] }]);
    expect(parse('# T\n\n:::byline\n:::\n').problems[0]!.fixes).toEqual([{ kind: 'field', target: 'document:author' }]);
  });

  it('reads status front matter, and merges :::doc-status into the meta', () => {
    const fm = parse('---\ntitle: T\nstatus: Approved\nowner: Docs team\nreviewed: 2026-09-01\nnext-review: 2027-03-01\n---\n\nText.\n');
    expect(fm.problems).toEqual([]);
    expect(fm.document.meta).toMatchObject({ status: 'Approved', owner: 'Docs team', reviewed: '2026-09-01', nextReview: '2027-03-01' });
    const merged = parse('---\ntitle: T\nstatus: Draft\n---\n\n:::doc-status{owner="Docs team" next-review=2027-03-01}\n:::\n');
    expect(merged.problems).toEqual([]);
    expect(merged.document.meta).toMatchObject({ status: 'Draft', owner: 'Docs team', nextReview: '2027-03-01' });
    expect(merged.document.blocks[0]).toEqual({ type: 'doc-status', status: 'Draft', owner: 'Docs team', nextReview: '2027-03-01' });
    expect(validate(plain(merged.document)) ? [] : validate.errors).toEqual([]);
    const clash = parse('---\ntitle: T\nowner: A\n---\n\n:::doc-status{owner="B"}\n:::\n');
    expect(clash.problems).toEqual([{ line: 6, code: 'doc-status-conflict', message: 'owner is "A" in the front matter and "B" in :::doc-status: set it in one place' }]);
    expect(parse('---\ntitle: T\nnext-review: soon\n---\n').problems[0]!.message).toMatch(/next-review must be a date/);
  });

  it('gives sections an id in the outline and keeps the cta sentence', () => {
    const { document, problems } = parse('# T\n\n:::section[Part 2: Results]{break=page}\nWhat we measured.\n:::\n\n## Results\n\n:::cta[Read the results]{href="#results" variant=secondary}\nTwo minutes.\n:::\n');
    expect(problems).toEqual([]);
    expect(document.blocks[0]).toMatchObject({ type: 'section', title: 'Part 2: Results', id: 'part-2-results', break: 'page' });
    expect(document.blocks[2]).toMatchObject({ type: 'cta', label: 'Read the results', href: '#results', variant: 'secondary', text: [{ value: 'Two minutes.' }] });
  });
});

describe('navigation and sources', () => {
  const REFS = 'references:\n  - id: wcag22\n    title: WCAG 2.2\n    author: W3C\n    year: 2023\n  - id: doe:2020\n    title: Plain words\n    author: ["Doe, Jane", "Roe, Rick"]\n    year: 2020';
  const doc = (md: string, fm = REFS) => parse(`---\ntitle: T\n${fm}\n---\n\n${md}\n`);
  const messages = (md: string, fm = REFS) => doc(md, fm).problems.map((p) => p.message).join('\n');
  it.each([
    ['a footnote without definition', 'Text[^1].', '', /footnote \[\^1\] has no definition/],
    ['a footnote never used', 'Text.\n\n[^1]: Unused.', '', /footnote \[\^1\] is never used/],
    ['a footnote defined inside a block', ':::callout[A]\nText[^1].\n\n[^1]: Inside.\n:::', '', /defined inside a block/],
    ['a footnote defined twice', 'Text[^1].\n\n[^1]: One.\n\n[^1]: Two.', '', /defined twice/],
    ['references that are not a list', 'Text.', 'references: wcag', /references must be a list/],
    ['a reference without title', 'See [@a].', 'references:\n  - id: a', /reference 1 \(a\) needs a title/],
    ['a reference with an unknown field', 'See [@a].', 'references:\n  - id: a\n    title: A\n    pages: 3', /unknown fields: pages/],
    ['a reference id used twice', 'See [@a].', 'references:\n  - id: a\n    title: A\n  - id: a\n    title: B', /reference id "a" is used twice/],
    ['a citation of an unknown source', 'See [@wcag21] and [@doe:2020].', undefined, /\[@wcag21\] cites a source that is not in the front matter references \(did you mean @wcag22\?\)/],
    ['a source never cited', 'See [@wcag22].', undefined, /reference "doe:2020" is never cited/],
    ['a reference list without sources', ':::references\n:::', '', /:::references needs sources/],
    ['two contents blocks', ':::toc\n:::\n\n:::toc\n:::', '', /only one :::toc per document/],
    ['contents inside tabs', '::::tabs\n:::tab[A]\n:::toc\n:::\n:::\n:::tab[B]\nx\n:::\n::::', '', /:::toc cannot be inside another block/],
    ['contents with text inside', ':::toc\nText\n:::', '', /:::toc has no content/],
    ['a contents depth of 4', ':::toc{depth=4}\n:::', '', /depth must be one of 2, 3/],
    ['an unknown reference style', 'See [@wcag22] [@doe:2020].\n\n:::references{style=apa}\n:::', undefined, /style must be one of numeric, author-date/],
  ])('reports %s', (_, md, fm, message) => expect(messages(md, fm)).toMatch(message));

  it('numbers footnotes by first use and keeps them out of the blocks', () => {
    const { document, problems } = doc('Second[^b] first? No: first[^a] then[^b] again.\n\n[^a]: Note A.\n\n[^b]: Note B.', '');
    expect(problems).toEqual([]);
    expect(document.footnotes!.map((f) => f.id)).toEqual(['b', 'a']);
    expect(document.blocks).toHaveLength(1);
    expect(validate(plain(document)) ? [] : validate.errors).toEqual([]);
  });

  it('reads citations with locators and several sources, including ids with a colon', () => {
    const { document, problems } = doc('As shown [@wcag22, sec. 1.1.1; @doe:2020] and [@doe:2020].');
    expect(problems).toEqual([]);
    const text = (document.blocks[0] as { text: unknown[] }).text;
    expect(plain(text)).toMatchObject([
      { type: 'text', value: 'As shown ' },
      { type: 'citation', items: [{ id: 'wcag22', locator: 'sec. 1.1.1' }, { id: 'doe:2020' }] },
      { type: 'text', value: ' and ' },
      { type: 'citation', items: [{ id: 'doe:2020' }] },
      { type: 'text', value: '.' },
    ]);
    expect(document.meta.references![1]).toEqual({ id: 'doe:2020', title: 'Plain words', author: ['Doe, Jane', 'Roe, Rick'], year: '2020' });
    expect(validate(plain(document)) ? [] : validate.errors).toEqual([]);
  });

  it('leaves [@...] as text when the document has no references list', () => {
    const { document, problems } = parse('# T\n\nPing [@team] in the channel.\n');
    expect(problems).toEqual([]);
    expect(plainText((document.blocks[0] as Extract<Block, { type: 'paragraph' }>).text)).toBe('Ping [@team] in the channel.');
  });
});

describe('time and comparison', () => {
  const messages = (md: string) => parse(`# T\n\n${md}\n`).problems.map((p) => p.message).join('\n');
  const table = '| Feature | Free | Team |\n|---|---|---|\n| Slides | no | yes |';
  it.each([
    ['a timeline of one item', ':::timeline\n- **2026** Launch\n:::', /at least two dated items/],
    ['a timeline item without a bold date', ':::timeline\n- **2026** Launch\n- Later we grow\n:::', /starts with the date or period in bold/],
    ['a timeline date without text', ':::timeline\n- **2026** Launch\n- **2027**\n:::', /says what happens after its date/],
    ['a current date that matches nothing', ':::timeline{current=2028}\n- **2026** A\n- **2027** B\n:::', /current="2028" matches no item; use a date exactly as written in bold \("2026", "2027"\)/],
    ['a comparison without a table', ':::comparison[Plans]\nText.\n:::', /exactly one Markdown table/],
    ['a comparison without a caption', `:::comparison\n${table}\n:::`, /needs a caption/],
    ['a comparison with five options', ':::comparison[P]\n| F | A | B | C | D | E |\n|---|---|---|---|---|---|\n| x | yes | yes | yes | yes | yes |\n:::', /at most 4 options next to the feature column \(found 5\)/],
    ['a comparison with one option', ':::comparison[P]\n| F | A |\n|---|---|\n| x | yes |\n:::', /at least two options/],
    ['a highlight that names no option', `:::comparison[P]{highlight=Pro}\n${table}\n:::`, /highlight=Pro names no option; use a column heading exactly as written \(Free, Team\)/],
    ['a highlight on the feature column', `:::comparison[P]{highlight=Feature}\n${table}\n:::`, /highlight=Feature names no option/],
    ['a release without a date', '::::release[v1.0.0]\n:::added\n- x\n:::\n::::', /release v1\.0\.0 needs its date/],
    ['a release with a bad date', '::::release[v1.0.0]{date=1.10.2026}\n:::added\n- x\n:::\n::::', /release date must be written YYYY-MM-DD/],
    ['a release without changes', '::::release[v1.0.0]{date=2026-10-01}\n::::', /has no changes/],
    ['an unknown release group', '::::release[v1.0.0]{date=2026-10-01}\n:::improved\n- x\n:::\n::::', /::::release holds only :::added, :::changed, :::deprecated, :::removed, :::fixed, :::security groups/],
    ['a release group twice', '::::release[v1.0.0]{date=2026-10-01}\n:::fixed\n- a\n:::\n:::fixed\n- b\n:::\n::::', /:::fixed appears twice in release v1\.0\.0/],
    ['an empty release group', '::::release[v1.0.0]{date=2026-10-01}\n:::added\n:::\n::::', /:::added is empty/],
    ['a release group with a label', '::::release[v1.0.0]{date=2026-10-01}\n:::added[New]\n- x\n:::\n::::', /takes no label or attributes/],
    ['a release inside tabs', '::::::tabs\n:::::tab[A]\n::::release[v1]{date=2026-10-01}\n:::added\n- x\n:::\n::::\n:::::\n:::::tab[B]\nx\n:::::\n::::::', /:::release cannot be inside another block/],
  ])('reports %s', (_, md, message) => expect(messages(md)).toMatch(message));

  it('reads timelines with the current item, comparisons with marks, and releases in Keep a Changelog order', () => {
    const md = ':::timeline[Plan]{current=2026-Q2}\n- **2026-Q1** Beta\n- **2026-Q2** Launch\n:::\n\n'
      + ':::comparison[Plans]{highlight=team}\n| Feature | Free | Team |\n|---|---|---|\n| Slides | ✗ | Yes |\n| Brands | ~ | částečně |\n| Price | EUR 0 | EUR 12 |\n:::\n\n'
      + '::::release[v1.4.0]{date=2026-10-01}\n:::fixed\n- Overflow.\n:::\n:::added\n- Tables.\n:::\n::::\n\n::::release[Unreleased]\n:::changed\n- Wording.\n:::\n::::';
    const { document, problems } = parse(`# T\n\n${md}\n`);
    expect(problems).toEqual([]);
    expect(document.blocks[0]).toMatchObject({ type: 'timeline', caption: 'Plan', current: '2026-Q2', items: [{ when: '2026-Q1' }, { when: '2026-Q2' }] });
    const c = document.blocks[1] as Extract<Block, { type: 'comparison' }>;
    expect(c.highlight).toBe(2);
    expect(c.rows.map((r) => r.map((cell) => cell.mark ?? plainText(cell.text)))).toEqual([['Slides', 'no', 'yes'], ['Brands', 'partial', 'partial'], ['Price', 'EUR 0', 'EUR 12']]);
    expect(document.blocks[2]).toMatchObject({ type: 'release', version: 'v1.4.0', id: 'v1-4-0', date: '2026-10-01', groups: [{ kind: 'added' }, { kind: 'fixed' }] });
    expect(document.blocks[3]).toMatchObject({ type: 'release', version: 'Unreleased', id: 'unreleased' });
    expect(validate(plain(document)) ? [] : validate.errors).toEqual([]);
    expect(parse('# T\n\n::::release[v2]{date=2026-10-01}\n:::added\n- x\n:::\n::::\n\nSee [v2](#v2).\n').problems).toEqual([]);
  });

  it('reads a mark with a qualifier after a bracket, comma or colon, but not "No limit"', () => {
    const md = ':::comparison[P]\n| F | A | B | C | D |\n|---|---|---|---|---|\n| Notes | partial (50 per month) | yes, up to **5** | No limit | no: on request |\n:::';
    const c = parse(`# T\n\n${md}\n`).document.blocks[0] as Extract<Block, { type: 'comparison' }>;
    expect(c.rows[0]!.map((cell) => [cell.mark ?? '', plainText(cell.text)])).toEqual([
      ['', 'Notes'], ['partial', '(50 per month)'], ['yes', 'up to 5'], ['', 'No limit'], ['no', 'on request']]);
  });
});

describe('diagrams and code groups', () => {
  const messages = (md: string) => parse(`# T\n\n${md}\n`).problems.map((p) => p.message).join('\n');
  const fence = (body: string) => '```mermaid\n' + body + '\n```';
  const acc = '  accTitle: Flow\n  accDescr: A goes to B.\n';
  it.each([
    ['a diagram without accTitle', fence('flowchart LR\n  accDescr: A goes to B.\n  A --> B'), /a diagram needs a title: add "accTitle:/],
    ['a diagram without accDescr', fence('flowchart LR\n  accTitle: Flow\n  A --> B'), /a diagram needs a description/],
    ['an unsupported diagram type', fence(`pie\n${acc}  "A" : 1`), /diagram type "pie" is not supported: start with flowchart, sequenceDiagram, stateDiagram-v2, classDiagram or erDiagram/],
    ['an init block', fence(`%%{init: {'theme': 'dark'}}%%\nflowchart LR\n${acc}  A --> B`), /init blocks and front matter are not allowed/],
    ['a colour statement', fence(`flowchart LR\n${acc}  A --> B\n  style A fill:#f00`), /"style" sets colours in a diagram/],
    ['a classDef', fence(`flowchart LR\n${acc}  A --> B\n  classDef hot fill:#f00`), /"classDef" sets colours in a diagram/],
    ['a code group of one', ':::code-group\n```bash title="npm"\nnpm i\n```\n:::', /needs at least two code blocks/],
    ['a code group without titles', ':::code-group\n```bash\nnpm i\n```\n```bash title="pnpm"\npnpm add\n```\n:::', /needs a title, which becomes its tab: .* \(1 without\)/],
    ['a code group with the same title twice', ':::code-group\n```bash title="npm"\na\n```\n```bash title="NPM"\nb\n```\n:::', /need different titles/],
    ['text inside a code group', ':::code-group\nInstall it:\n\n```bash title="npm"\na\n```\n```bash title="pnpm"\nb\n```\n:::', /:::code-group holds code blocks only/],
  ])('reports %s', (_, md, message) => expect(messages(md)).toMatch(message));

  it('reads the type, the title and a multi-line description, and reports the line of a colour statement', () => {
    const md = fence('%% a comment\nsequenceDiagram\n  accTitle: Build request\n  accDescr {\n    The client sends Markdown;\n    the server answers.\n  }\n  A->>B: hi');
    const { document, problems } = parse(`# T\n\n${md}\n`);
    expect(problems).toEqual([]);
    expect(document.blocks[0]).toMatchObject({ type: 'diagram', kind: 'sequence', title: 'Build request', desc: 'The client sends Markdown; the server answers.' });
    expect(validate(plain(document)) ? [] : validate.errors).toEqual([]);
    expect(parse(`# T\n\n${fence(`flowchart LR\n${acc}  A --> B\n  linkStyle 0 stroke:red`)}\n`).problems).toEqual([{ line: 8, code: 'diagram-colours', message: expect.stringMatching(/"linkStyle" sets colours/) }]);   // # T, blank, fence, 4 lines, then linkStyle
    for (const [head, kind] of [['graph TD', 'flowchart'], ['stateDiagram', 'state'], ['classDiagram', 'class'], ['erDiagram', 'er']]) {
      expect(parse(`# T\n\n${fence(`${head}\n${acc}`)}\n`).document.blocks[0]).toMatchObject({ kind });
    }
  });
});

describe('fixes found by AI authors', () => {
  it('continues the numbering of steps and lists that start later', () => {
    const { document, problems } = parse('# T\n\n:::steps\n4. **Pay** Use the card.\n5. **Wait** It takes a minute.\n:::\n\n3. third\n4. fourth\n');
    expect(problems).toEqual([]);
    expect(document.blocks[0]).toMatchObject({ type: 'steps', start: 4 });
    expect(document.blocks[1]).toMatchObject({ type: 'list', ordered: true, start: 3 });
    expect(parse('# T\n\n:::steps\n1. **A** a.\n:::\n').document.blocks[0]).not.toHaveProperty('start');
    expect(validate(plain(document)) ? [] : validate.errors).toEqual([]);
  });

  it('labels the highlighted comparison column with badge=, which needs highlight=', () => {
    const t = '| F | Free | Pro |\n|---|---|---|\n| x | no | yes |';
    expect(parse(`# T\n\n:::comparison[P]{highlight=Pro badge="Most popular"}\n${t}\n:::\n`).document.blocks[0]).toMatchObject({ highlight: 2, badge: 'Most popular' });
    expect(parse(`# T\n\n:::comparison[P]{badge="Most popular"}\n${t}\n:::\n`).problems.map((p) => p.message)).toEqual([expect.stringMatching(/badge= labels the highlighted column: add highlight=/)]);
  });

  it('keeps a notice before the groups of a release, but nothing after them', () => {
    const md = '::::release[3.2.0]{date=2026-09-28}\nAndroid 9 is no longer supported.\n\n> [!IMPORTANT]\n> Update before 1 November.\n\n:::added\n- Shared notebooks.\n:::\n::::';
    const { document, problems } = parse(`# T\n\n${md}\n`);
    expect(problems).toEqual([]);
    expect(document.blocks[0]).toMatchObject({ type: 'release', intro: [{ type: 'paragraph' }, { type: 'callout', variant: 'important' }], groups: [{ kind: 'added' }] });
    expect(validate(plain(document)) ? [] : validate.errors).toEqual([]);
    expect(parse('# T\n\n::::release[3.2.0]{date=2026-09-28}\n:::added\n- x\n:::\nLate text.\n::::\n').problems.map((p) => p.message).join('\n')).toMatch(/after an optional short notice/);
    expect(parse('# T\n\n::::release[3.2.0]{date=2026-09-28}\nOnly a notice.\n::::\n').problems.map((p) => p.message).join('\n')).toMatch(/has no changes/);
  });
});
