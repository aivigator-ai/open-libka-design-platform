import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse, plainText } from '@libka/model';
import { expandBody, isSplittable, layoutSlides, renderDeck, slides, splitBlock, type DeckStyles } from '../src/deck.ts';
import { emptyFitting, fitStep, slices, type SlideFit } from '../src/fit.ts';
import { renderManual } from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const styles: DeckStyles = {
  tokens: read('libka-tokens.css'),
  bridge: read('lk-bridge.css'),
  components: read('packages/render/src/components.css'),
  deck: read('packages/render/src/deck.css'),
};

const SOURCE = `---
title: Quarterly review
subtitle: What changed and what is next
version: "3"
date: "2026-10-03"
---

Welcome text on the title slide.

## Results

Revenue grew in every region.

:::notes
Mention the two new regions.
:::

### By region

:::table{caption="Revenue by region"}
| Region | Growth |
|---|---|
| North | 12% |
:::

#### Method

Same as last quarter.

## Next steps
`;

const { document, problems } = parse(SOURCE);
const list = slides(document);
const html = renderDeck(document, { styles, fontsHref: '../fonts/libka-fonts.css' });
const body = html.slice(html.indexOf('<body>'));

describe('slides', () => {
  it('parses cleanly', () => expect(problems).toEqual([]));

  it('makes a title slide, a slide per ## and per ###', () => {
    expect(list.map((s) => [s.kind, s.tag, typeof s.heading === 'string' ? s.heading : plainText(s.heading)])).toEqual([
      ['title', 'v3 · 2026-10-03', 'Quarterly review'],
      ['section', '01', 'Results'],
      ['content', 'Results', 'By region'],
      ['section', '02', 'Next steps'],
    ]);
  });

  it('keeps intro text on the title slide, #### inside its slide, and notes off the slide', () => {
    expect(list[0]!.body.map((b) => b.type)).toEqual(['paragraph']);
    expect(list[1]!.body.map((b) => b.type)).toEqual(['paragraph']);
    expect(list[1]!.notes.map((b) => b.type)).toEqual(['paragraph']);
    expect(list[2]!.body.map((b) => b.type)).toEqual(['table', 'heading', 'paragraph']);
    expect(list[3]!.body).toEqual([]);
  });
});

describe('renderDeck', () => {
  it('renders one frame per slide with one heading each (h1 on the title slide)', () => {
    expect(body.match(/class="lk-deck-frame"/g)).toHaveLength(4);
    expect(body.match(/<h1 /g)).toHaveLength(1);
    for (const frame of body.split('<section class="lk-deck-frame"').slice(1)) {
      expect(frame.match(/class="lk-slide-heading"/g)).toHaveLength(1);
    }
    expect(body).toMatch(/<h3 class="lk-deck-h3">Method<\/h3>/);
    expect(body).toMatch(/aria-roledescription="slide" aria-label="2 \/ 4"/);
  });

  it('puts notes in a template (not rendered on the slide) and never in the manual', () => {
    expect(body).toMatch(/<template><p>Mention the two new regions\.<\/p><\/template>/);
    expect(renderManual(document, { styles: { ...styles, manual: '' } })).not.toMatch(/two new regions/);
  });

  it('marks a ## without content as a divider slide', () => {
    expect(body).toMatch(/<div class="lk-slide lk-slide--section">\s*<span class="lk-slide-tag">02<\/span>/);
  });

  it('uses only defined lk-* classes and no inline styles', () => {
    const defined = new Set([...(styles.components + styles.deck).matchAll(/\.(lk-[\w-]+)/g)].map((m) => m[1]));
    const used = new Set([...body.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(' ')).filter((c) => c.startsWith('lk-')));
    expect([...used].filter((c) => !defined.has(c))).toEqual([]);
    expect(body).not.toMatch(/style=/);
    expect(styles.deck).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it('inlines a runtime that parses, and labels the controls in the document language', () => {
    const script = body.slice(body.indexOf('<script>') + 8, body.indexOf('</script>'));
    expect(() => new Function(script)).not.toThrow();
    expect(body).toMatch(/aria-label="Previous slide"/);
    const cs = renderDeck(parse('---\ntitle: Přehled\nlang: cs\n---\n\n## Část\n').document, { styles });
    expect(cs).toMatch(/aria-label="Předchozí snímek"/);
    expect(cs).toMatch(/aria-roledescription="snímek"/);
  });

  it('declares a 16:9 page for printing', () => {
    expect(styles.deck).toMatch(/@page \{ size: 1280px 720px; margin: 0; \}/);
  });
});

describe('document frame slides', () => {
  const deck = (md: string) => { const d = parse(md).document; return { list: slides(d), body: renderDeck(d, { styles }).split('<body>')[1]! }; };

  it('gives a part divider and an opening summary slides of their own', () => {
    const { list, body } = deck('---\ntitle: Report\n---\n\nIntro.\n\n:::summary\n- A\n- B\n- C\n:::\n\n:::section[Part 1: Context]\nWhy we did it.\n:::\n\n## Goals\n\nx\n');
    expect(list.map((s) => [s.kind, typeof s.heading === 'string' ? s.heading : plainText(s.heading)])).toEqual([
      ['title', 'Report'], ['content', 'Key takeaways'], ['section', 'Part 1: Context'], ['section', 'Goals']]);
    expect(list[0]!.body.map((b) => b.type)).toEqual(['paragraph']);
    // the summary is named by the slide heading, not by a second title
    expect(body).toMatch(/<h2 class="lk-slide-heading" id="(lk-lead-\d+)">Key takeaways<\/h2>\n    <div class="lk-slide-body">\n<section class="lk-block lk-summary" aria-labelledby="\1">\n<ul/);
    expect(body).toMatch(/<div class="lk-slide lk-slide--section lk-slide--part">\n    <h2 class="lk-slide-heading" id="part-1-context">Part 1: Context<\/h2>/);
    expect(body).toMatch(/<span class="lk-slide-tag">01<\/span>\n    <h2 class="lk-slide-heading" id="goals">/);
  });

  it('puts status, owner and review dates on the title slide', () => {
    const { body } = deck('---\ntitle: Policy\nstatus: Approved\nowner: Security team\nreviewed: 2026-09-01\n---\n\n## A\n\nx\n');
    const title = body.slice(0, body.indexOf('id="slide-2"'));
    expect(title).toMatch(/<p class="lk-slide-status">Status: <span class="lk-badge lk-badge--success">Approved<\/span> · Owner: Security team · Reviewed: <time datetime="2026-09-01">2026-09-01<\/time><\/p>/);
  });
});

describe('navigation and sources slides', () => {
  const deck = (md: string) => { const d = parse(md).document; return { list: slides(d), body: renderDeck(d, { styles }).split('<body>')[1]! }; };

  it('opens with an agenda slide and ends with Notes and References slides that link back', () => {
    const md = '---\ntitle: Report\nreferences:\n  - id: w\n    title: WCAG 2.2\n    author: W3C\n    year: 2023\n---\n\n:::toc[Agenda]{depth=3}\n:::\n\n## Goals\n\n### Scope\n\nWe follow WCAG [@w].\n\n## Plan\n\nShip it.[^1]\n\n[^1]: After review.\n';
    const { list, body } = deck(md);
    expect(list.map((s) => [typeof s.heading === 'string' ? s.heading : plainText(s.heading), s.end ?? ''])).toEqual([
      ['Report', ''], ['Agenda', ''], ['Goals', ''], ['Scope', ''], ['Plan', ''], ['Notes', 'notes'], ['References', 'references']]);
    // the agenda lists sections only and is named by the slide heading
    expect(body).toMatch(/<h2 class="lk-slide-heading" id="(lk-lead-\d+)">Agenda<\/h2>\n    <div class="lk-slide-body">\n<nav class="lk-block lk-toc" aria-labelledby="\1">\n<ol class="lk-toc-list"><li><a href="#goals">Goals<\/a><\/li><li><a href="#plan">Plan<\/a><\/li><li><a href="#lk-notes">Notes<\/a><\/li><li><a href="#lk-references">References<\/a><\/li><\/ol>/);
    expect(body).toMatch(/Ship it\.<sup class="lk-fn-ref"><a href="#lk-fn-1" id="lk-fnref-1">/);
    expect(body).toMatch(/<h2 class="lk-slide-heading" id="lk-notes">Notes<\/h2>\n    <div class="lk-slide-body">\n<ol class="lk-notes-list">\n  <li id="lk-fn-1">After review\. <a class="lk-fn-back" href="#slide-5">slide 5<\/a><\/li>/);
    expect(body).toMatch(/We follow WCAG <span class="lk-cite">\[<a href="#lk-ref-w">1<\/a>\]<\/span>/);
    expect(body).toMatch(/<h2 class="lk-slide-heading" id="lk-references">References<\/h2>\n    <div class="lk-slide-body">\n<ol class="lk-references-list">\n  <li id="lk-ref-w">W3C \(2023\)/);
  });
});

describe('time and comparison slides', () => {
  it('gives every release a slide headed by its version, with the date as its tag, and lists releases in the contents', () => {
    const md = '---\ntitle: Changelog\n---\n\n::::release[v1.1.0]{date=2026-11-01}\n:::added\n- Timelines.\n:::\n::::\n\n### Migration\n\nNothing to do.\n\n::::release[v1.0.0]{date=2026-10-01}\n:::added\n- First release.\n:::\n::::\n';
    const d = parse(md).document;
    const list = slides(d);
    expect(list.map((s) => [s.kind, s.tag, typeof s.heading === 'string' ? s.heading : plainText(s.heading)])).toEqual([
      ['title', '', 'Changelog'], ['section', '2026-11-01', 'v1.1.0'], ['content', 'v1.1.0', 'Migration'], ['section', '2026-10-01', 'v1.0.0']]);
    const body = renderDeck(d, { styles }).split('<body>')[1]!;
    expect(body).toMatch(/<h2 class="lk-slide-heading" id="v1-1-0">v1\.1\.0<\/h2>\n    <div class="lk-slide-body">\n<section class="lk-block lk-release" aria-labelledby="v1-1-0">\n<div class="lk-release-group lk-release-group--added">/);
    expect(renderManual(d, { styles: { ...styles, manual: read('packages/render/src/manual.css') } })).toMatch(/<li><a href="#v1-1-0">v1\.1\.0<\/a><\/li>\n    <li><a href="#v1-0-0">v1\.0\.0<\/a><\/li>/);
  });

  it('calls the presenter panel "Speaker notes", so it differs from the footnotes slide', () => {
    const body = renderDeck(parse('---\ntitle: T\n---\n\n## A\n\nx\n').document, { styles }).split('<body>')[1]!;
    expect(body).toMatch(/<h2 class="lk-deck-panel-title" id="lk-deck-notes-title">Speaker notes<\/h2>/);
    expect(body).toMatch(/data-deck="notes" aria-pressed="false">Speaker notes <span class="lk-deck-key" aria-hidden="true">N<\/span>/);
  });
});

describe('fitting slides (layout measured by the build)', () => {
  const doc = parse('---\ntitle: T\n---\n\n## Install\n\nIntro.\n\n:::steps\n1. **A** a.\n2. **B** b.\n3. **C** c.\n4. **D** d.\n5. **E** e.\n:::\n\n:::table{caption="Versions"}\n| V | Year |\n|---|---|\n| 1 | 2020 |\n| 2 | 2021 |\n| 3 | 2022 |\n:::\n\n:::notes\nSay hello.\n:::\n').document;

  it('splits long blocks by item, keeping numbers counting and table headers', () => {
    const steps = doc.blocks[2]!;
    expect(splitBlock(steps, [3]).map((b) => [b.type === 'steps' ? b.steps.length : 0, (b as { start?: number }).start])).toEqual([[3, undefined], [2, 4]]);
    const table = splitBlock(doc.blocks[3]!, [1]) as Extract<(typeof doc.blocks)[number], { type: 'table' }>[];
    expect(table.map((t) => [t.caption, t.head.length, t.rows.length])).toEqual([['Versions', 2, 1], ['Versions', 2, 2]]);
    expect(splitBlock(doc.blocks[1]!, [1])).toHaveLength(1);   // a paragraph cannot be split
    expect(isSplittable(steps) && !isSplittable(doc.blocks[1]!)).toBe(true);
  });

  it('continues a slide on "(continued)" slides: the first keeps the id and the notes, later parts may shrink', () => {
    const base = slides(doc);
    const out = layoutSlides(base, { items: { '1:1': [3] }, breaks: { 1: [2, 3] }, fit: { '1.2': 90 } }, 'continued');
    expect(out.map((s) => [typeof s.heading === 'string' ? s.heading : plainText(s.heading), s.body.map((b) => b.type).join('+'), s.id ?? '', s.notes.length, s.fit ?? 100])).toEqual([
      ['T', '', '', 0, 100],
      ['Install', 'paragraph+steps', 'install', 1, 100],
      ['Install (continued)', 'steps', '', 0, 100],
      ['Install (continued)', 'table', '', 0, 90],
    ]);
    const html = renderDeck(doc, { styles, layout: { items: { '1:1': [3] }, breaks: { 1: [2, 3] }, fit: { '1.2': 90 } } });
    expect(html).toMatch(/<ol class="lk-block lk-flow" start="4">/);
    expect(html).toMatch(/data-title="Install \(continued\)" data-base="1" data-part="2" data-blocks="1"[^>]*>\n  <div class="lk-slide lk-slide--fit-90">/);
    expect(html.match(/id="install"/g)).toHaveLength(1);
  });

  it('opens an accordion question that alone is taller than a slide: the answer continues block by block', () => {
    const faq = parse('---\ntitle: T\n---\n\n## FAQ\n\n::::accordion\n:::item[Short?]\nYes.\n:::\n:::item[Long?]\nFirst part.\n\n- a\n- b\n:::\n:::item[Last?]\nNo.\n:::\n::::\n').document;
    const base = slides(faq);
    expect(expandBody(base[1]!.body, 1, {}, { '1:0': [1] }).map((p) => [p.block.type, p.orig, p.offset])).toEqual([
      ['accordion', 0, 0], ['heading', 0, 1], ['paragraph', 0, 1], ['list', 0, 1], ['accordion', 0, 2],
    ]);
    // the opened body's list is cut by its own index in the opened body (3), after its first item
    const out = layoutSlides(base, { open: { '1:0': [1] }, items: { '1:3': [1] }, breaks: { 1: [3] } }, 'continued');
    expect(out.slice(1).map((s) => [plainText(s.heading as never), s.body.map((b) => b.type).join('+')])).toEqual([
      ['FAQ', 'accordion+heading+paragraph'], ['FAQ (continued)', 'list+list+accordion'],
    ]);
    const html = renderDeck(faq, { styles, layout: { open: { '1:0': [1] } } });
    expect(html).toMatch(/<h3 class="lk-deck-h3">Long\?<\/h3>/);
    expect(html.match(/<details/g)).toHaveLength(2);
  });

  it('opens the next question when fitting finds the first one too tall, and keeps an opened question with its answer', () => {
    const faq = parse('---\ntitle: T\n---\n\n## FAQ\n\n::::accordion\n:::item[Long?]\nFirst.\n\nSecond.\n:::\n::::\n').document;
    const base = slides(faq);
    const layout = emptyFitting();
    const tall = (over: number, blocks: number, bottoms: number[], items: number[]): SlideFit => ({ base: 1, part: 0, blocks, over, available: 400, content: 400 + over, bottoms, items });
    expect(fitStep(base, layout, [tall(300, 1, [700], [700])])).toBe(true);
    expect(layout.open).toEqual({ '1:0': [0] });
    // now heading + 2 paragraphs; only the heading and the first paragraph fit: break after them, not after the heading alone
    expect(fitStep(base, layout, [tall(200, 3, [40, 380, 600], [])])).toBe(true);
    expect(layout.breaks).toEqual({ 1: [2] });
  });

  it('plans every continuation of a long block in one round', () => {
    // 10 rows of 100px in a 350px slide: 3 rows a slide, so new slides start at rows 4, 7 and 10
    expect(slices(Array.from({ length: 10 }, (_, i) => (i + 1) * 100), 350)).toEqual([3, 6, 9]);
    expect(slices([500, 600], 350)).toEqual([1]);   // a first item taller than the slide stays whole
    expect(slices([100, 200], 350)).toEqual([]);
    const faq = parse('---\ntitle: T\n---\n\n## Rows\n\n- a\n- b\n- c\n- d\n- e\n- f\n').document;
    const layout = emptyFitting();
    const s: SlideFit = { base: 1, part: 0, blocks: 1, over: 250, available: 350, content: 600, bottoms: [600], items: [100, 200, 300, 400, 500, 600] };
    expect(fitStep(slides(faq), layout, [s])).toBe(true);
    expect(layout.items).toEqual({ '1:0': [3] });
  });

  it('continues a long agenda on the next slide and keeps its numbers counting past the parts', () => {
    const md = ['---\ntitle: T\n---\n\n:::toc\n:::\n'];
    for (const p of ['One', 'Two']) {
      md.push(`:::section[Part ${p}]\n:::\n`);
      for (let i = 1; i <= 3; i++) md.push(`## ${p} ${i}\n\nText.\n`);
    }
    const toc = parse(md.join('\n')).document;
    const base = slides(toc);
    const agenda = base[1]!.body[0]!;
    expect(agenda.type === 'toc' && agenda.entries).toEqual([0, 8]);
    expect(isSplittable(agenda)).toBe(true);
    const html = renderDeck(toc, { styles, layout: { items: { '1:0': [5] }, breaks: { 1: [1] } } });
    expect(html).toMatch(/data-title="Contents \(continued\)"/);
    // Part One, One 1-3, Part Two on the first slide; Two 1 continues as number 4
    expect(html).toMatch(/<ol class="lk-toc-list" start="4"><li><a href="#two-1">/);
    expect(html).not.toMatch(/class="lk-toc-title"/);   // both parts are named by their slide heading
  });
});
