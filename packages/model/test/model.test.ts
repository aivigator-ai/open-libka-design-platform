import { describe, expect, it } from 'vitest';
import { outputsOf, parse, plainText } from '../src/index.ts';

const GOOD = `---
title: Upgrading the planner
subtitle: Operator guide
version: "2.1"
---

## Before you start

:::callout[Back up first]{variant=warning}
Export your schedule before you upgrade.
:::

:::steps
1. **Open settings** Choose *Data* then *Export*.
2. **Run the installer** Keep the default path.
:::

![The export dialog](shots/export.png "Export dialog with the backup option selected")

:::table{caption="Supported versions"}
| Version | Supported until |
|---|---|
| 2.1 | 2027 |
:::

:::checklist
- [x] Backup exported
- [ ] Installer downloaded
:::

\`\`\`bash
planner --version
\`\`\`
`;

describe('parse: a valid manual', () => {
  const { document, problems } = parse(GOOD);

  it('has no problems', () => expect(problems).toEqual([]));

  it('reads front matter', () => {
    expect(document.meta).toMatchObject({ title: 'Upgrading the planner', subtitle: 'Operator guide', version: '2.1', lang: 'en' });
  });

  it('builds typed blocks in order', () => {
    expect(document.blocks.map((b) => b.type)).toEqual(['heading', 'callout', 'steps', 'figure', 'table', 'checklist', 'code']);
  });

  it('turns directives into blocks', () => {
    const [heading, callout, steps, figure, table, checklist] = document.blocks;
    expect(heading).toMatchObject({ type: 'heading', level: 2, id: 'before-you-start' });
    expect(callout).toMatchObject({ type: 'callout', variant: 'warning', title: 'Back up first' });
    if (steps?.type !== 'steps') throw new Error('steps expected');
    expect(steps.steps.map((s) => plainText(s.title))).toEqual(['Open settings', 'Run the installer']);
    expect(figure).toEqual({ type: 'figure', src: 'shots/export.png', alt: 'The export dialog', caption: 'Export dialog with the backup option selected' });
    expect(table).toMatchObject({ type: 'table', caption: 'Supported versions' });
    if (checklist?.type !== 'checklist') throw new Error('checklist expected');
    expect(checklist.items.map((i) => i.done)).toEqual([true, false]);
  });
});

describe('parse: author mistakes are reported with their line', () => {
  const cases: [string, string, RegExp][] = [
    ['missing title', 'Just text.', /needs a title/],
    ['unknown block', '# T\n\n:::note\nx\n:::', /unknown block "note"/],
    ['bad variant', '# T\n\n:::callout[X]{variant=danger}\nx\n:::', /variant must be one of/],
    ['callout without title', '# T\n\n:::callout{variant=info}\nx\n:::', /need a title/],
    ['table without caption', '# T\n\n| a | b |\n|---|---|\n| 1 | 2 |', /tables need a caption/],
    ['image without alt', '# T\n\n![](a.png "cap")', /needs alt text/],
    ['image without caption', '# T\n\n![alt](a.png)', /needs a caption/],
    ['raw HTML', '# T\n\n<div>x</div>', /raw HTML is not allowed/],
    ['raw HTML between two comments', '# T\n\n<!-- a --> <div>x</div> <!-- b -->', /raw HTML is not allowed/],
    ['second h1', '# T\n\n# Again', /only one "# Heading"/],
    ['step without bold title', '# T\n\n:::steps\n1. no title\n:::', /bold title/],
    ['empty notes', '# T\n\n:::notes\n:::', /:::notes is empty/],
    ['heading in notes', '# T\n\n:::notes\n## Not here\n:::', /cannot contain headings/],
  ];
  for (const [name, md, message] of cases) {
    it(name, () => {
      const { problems } = parse(md);
      expect(problems.map((p) => p.message).join('\n')).toMatch(message);
      expect(problems.every((p) => p.line >= 1)).toBe(true);
    });
  }

  it('allows HTML comments (notes for editors, generators\' markers) and renders nothing for them', () => {
    const { document, problems } = parse('# T\n\n<!-- BEGIN GENERATED: x -->\n\nText.\n\n<!--\nA longer note.\n-->\n');
    expect(problems).toEqual([]);
    expect(document.blocks.map((b) => b.type)).toEqual(['paragraph']);
  });

  it('drops a comment inside text too, so a note never reaches a reader', () => {
    const { document, problems } = parse('# T\n\nText <!-- an inline note --> more text.\n');
    expect(problems).toEqual([]);
    expect(JSON.stringify(document.blocks)).not.toContain('inline note');
  });

  it('points at the right line', () => {
    const { problems } = parse('# T\n\nText.\n\n:::note\nx\n:::');
    expect(problems[0]?.line).toBe(5);
  });
});

describe('parse: speaker notes and plain text', () => {
  it('reads :::notes as a notes block', () => {
    const { document, problems } = parse('# T\n\n## Part\n\nShown.\n\n:::notes\nSay *this* out loud.\n:::\n');
    expect(problems).toEqual([]);
    const notes = document.blocks[2];
    expect(notes?.type).toBe('notes');
    if (notes?.type !== 'notes' || notes.body[0]?.type !== 'paragraph') throw new Error('notes with a paragraph expected');
    expect(plainText(notes.body[0].text)).toBe('Say this out loud.');
  });

  it('keeps text such as 16:9 and 10:30 instead of reading it as a directive', () => {
    const { document, problems } = parse('# T\n\nSlides are 16:9; the talk starts at 10:30 (ratio a:b).\n');
    expect(problems).toEqual([]);
    const p = document.blocks[0];
    if (p?.type !== 'paragraph') throw new Error('paragraph expected');
    expect(plainText(p.text)).toBe('Slides are 16:9; the talk starts at 10:30 (ratio a:b).');
  });
});

describe('parse: output choice', () => {
  const fm = (outputs: string) => `---\ntitle: T\n${outputs}\n---\n\nText.\n`;

  it('defaults to the web page and its PDF', () => {
    const { document, problems } = parse('# T\n\nText.\n');
    expect(problems).toEqual([]);
    expect(document.meta.outputs).toBeUndefined();
    expect(outputsOf(document.meta)).toEqual(['web', 'pdf']);
  });

  it('reads a list, a block list or one name, in the canonical order', () => {
    expect(outputsOf(parse(fm('outputs: [docx, web]')).document.meta)).toEqual(['web', 'docx']);
    expect(outputsOf(parse(fm('outputs:\n  - deck\n  - web\n  - pdf')).document.meta)).toEqual(['web', 'pdf', 'deck']);
    expect(outputsOf(parse(fm('outputs: deck')).document.meta)).toEqual(['deck']);
    expect(parse(fm('outputs: [Web, DOCX]')).problems).toEqual([]);
  });

  const cases: [string, string, RegExp][] = [
    ['an unknown name, with a hint', 'outputs: [web, word]', /unknown outputs: word \(Word is "docx"\); for example outputs: \[web, pdf, docx\]/],
    ['html for web', 'outputs: [html]', /"web" is the web page/],
    ['not a list', 'outputs: {web: true}', /outputs must be a list of output names/],
    ['an empty list', 'outputs: []', /outputs is empty/],
    ['a name twice', 'outputs: [web, pdf, web]', /outputs lists web twice/],
    ['a PDF without the web page', 'outputs: [pdf]', /pdf is made from the web page and signed with it: add web/],
    ['a Word file and a PDF without the web page', 'outputs: [deck, pdf, docx]', /pdf and docx are made from the web page/],
  ];
  for (const [name, outputs, message] of cases) {
    it(`reports ${name} on the front matter line`, () => {
      const { problems } = parse(fm(outputs));
      expect(problems.map((p) => p.message).join('\n')).toMatch(message);
      expect(problems.every((p) => p.line === 1)).toBe(true);
    });
  }
});

describe('messages a writer can act on', () => {
  const fence = '```';
  const messages = (md: string) => parse(`# T\n\n${md}`).problems.map((p) => `${p.code}: ${p.message}`);

  it('counts a code block\'s lines in the singular and the plural', () => {
    expect(messages(`${fence}js {9}\na\n${fence}`)).toEqual(['code-highlight-range: highlighted line 9 is beyond the 1 line of this code block']);
    expect(messages(`${fence}js {9}\na\nb\nc\n${fence}`)).toEqual(['code-highlight-range: highlighted line 9 is beyond the 3 lines of this code block']);
  });

  it('reports a highlighted range that runs backwards instead of ignoring it', () => {
    expect(messages(`${fence}js {5-2}\na\nb\nc\nd\ne\n${fence}`)).toEqual(['code-highlight-range: the highlighted range 5-2 runs backwards: write 2-5']);
  });

  it('says what to write instead of a reference-style link definition', () => {
    expect(messages('See [the docs][ref].\n\n[ref]: https://example.org')).toContain(
      'unsupported-element: reference-style links ([ref]: https://example.org) are not supported: write the link inline, as [text](https://example.org)');
  });

  it('lists the known front matter keys and suggests the nearest one', () => {
    const [m] = parse('---\ntitle: X\nsubtitel: y\n---\n\nHi').problems.map((p) => p.message);
    expect(m).toMatch(/^unknown front matter keys: subtitel \(did you mean subtitle\?\) \(known: title, subtitle, version, date, lang, references, outputs, /);
  });
});
