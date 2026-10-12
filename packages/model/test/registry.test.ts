import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { BLOCKS, EXAMPLES_CS, block, documentSchema } from '@libka/blocks';
import { parse, plainText, type Block } from '../src/index.ts';

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

describe('the document frame', () => {
  const messages = (md: string) => parse(`# T\n\n${md}\n`).problems.map((p) => p.message).join('\n');
  it.each([
    ['a summary with two points', ':::summary\n- One\n- Two\n:::', /3 to 5 points \(found 2\)/],
    ['a summary with six points', `:::summary\n${'- Point\n'.repeat(6)}:::`, /3 to 5 points \(found 6\)/],
    ['an AI summary nobody reviewed', ':::summary{source=ai}\n- A\n- B\n- C\n:::', /needs the person who checked it/],
    ['a reviewer without source=ai', ':::summary{reviewed-by="Docs lead"}\n- A\n- B\n- C\n:::', /reviewed-by is shown only for AI summaries/],
    ['a summary point with a nested list', ':::summary\n- A\n  - nested\n- B\n- C\n:::', /one short paragraph/],
    ['a doc-status with nothing to show', ':::doc-status\n:::', /has nothing to show/],
    ['a doc-status with content', ':::doc-status{owner="Team"}\nText\n:::', /:::doc-status has no content/],
    ['a review date that is not a date', ':::doc-status{reviewed=2026-13-01}\n:::', /reviewed must be a date written YYYY-MM-DD/],
    ['a next review before the last one', ':::doc-status{reviewed=2026-09-01 next-review=2026-08-01}\n:::', /must come after reviewed/],
    ['two doc-status blocks', ':::doc-status{owner="A"}\n:::\n\n:::doc-status{owner="A"}\n:::', /only one :::doc-status/],
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
