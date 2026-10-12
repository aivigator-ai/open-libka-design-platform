import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@libka/blocks';
import { parse } from '@libka/model';
import { block, chartText, context, LABELS, renderManual } from '../src/index.ts';
import { czechIn } from '../src/labels.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const css = read('packages/render/src/components.css') + read('packages/render/src/manual.css') + read('packages/render/src/deck.css');
const defined = new Set([...css.matchAll(/\.(lk-[\w-]+)/g)].map((m) => m[1]));
const html = (md: string, target: 'manual' | 'deck' = 'manual', lang = 'en', frontMatter?: string) => {
  const { document } = parse(frontMatter ? `---\ntitle: T\n${frontMatter}\n---\n\n${md}\n` : `# T\n\n${md}\n`);
  const ctx = context(lang, target, document);
  return document.blocks.map((b) => block(b, ctx)).join('\n');
};

describe('every registry block renders', () => {
  for (const def of BLOCKS) {
    it(`${def.name}: web and slides, defined classes only, no inline styles`, () => {
      for (const target of ['manual', 'deck'] as const) {
        const out = html(def.example, target, 'en', def.frontMatter);
        if (def.name !== 'notes') expect(out.trim(), `${def.name} ${target}`).not.toBe('');
        expect(out).not.toMatch(/undefined|\[object Object\]|style=/);
        const used = [...out.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(' ')).filter((c) => c.startsWith('lk-'));
        expect(used.filter((c) => !defined.has(c)), `${def.name} ${target}`).toEqual([]);
      }
    });
  }
});

describe('core block output', () => {
  it('draws charts as accessible SVG with patterns, a summary and the data table', () => {
    const out = html(BLOCKS.find((b) => b.name === 'chart')!.example);
    expect(out).toMatch(/<svg class="lk-chart-svg" viewBox="0 0 640 360" role="img" aria-labelledby="lk-chart-1-title lk-chart-1-desc">/);
    expect(out).toMatch(/<desc id="lk-chart-1-desc">Bar chart: Staff who find the handbook easy to use\. 6 values in 2 series\. Highest: 78% \(2026, Q3\)\. Lowest: 62% \(2025, Q1\)\.<\/desc>/);
    expect(out.match(/<pattern id="lk-chart-1-p\d"/g)).toHaveLength(2);
    expect(out).toMatch(/<path d="M-1,1 l2,-2[^"]*" class="lk-chart-hatch"\/>/);   // series 2: diagonal lines
    expect(out).toMatch(/<caption>Staff who find the handbook easy to use<\/caption>/);
    expect(out).toMatch(/<th scope="row">Q1<\/th><td>62%<\/td><td>71%<\/td>/);
    expect(out).toMatch(/>0%<\/text>/);   // the axis starts at zero
  });

  it('shows donut parts with their share, and formats numbers per language', () => {
    const md = ':::chart{type=donut caption="Time spent" unit="h"}\n| Task | Hours |\n|---|---|\n| Writing | 6.5 |\n| Review | 3.5 |\n:::';
    expect(html(md)).toMatch(/Writing 6\.5 h \(65 %\)/);
    expect(html(md, 'manual', 'cs')).toMatch(/Writing 6,5 h \(65 %\)/);
  });

  it('marks highlighted code lines in words and keeps the file name as caption', () => {
    const out = html('```bash title="run.sh" {2}\na\nb\n```');
    expect(out).toMatch(/^<figure class="lk-block lk-code"><figcaption class="lk-code-title">run\.sh<\/figcaption><pre class="lk-code-pre" tabindex="0" data-lang="bash">/);
    expect(out).toMatch(/<mark class="lk-code-mark"><span class="lk-visually-hidden">Highlighted line: <\/span>b<\/mark>/);
    expect(html('```\nx\n```')).toMatch(/^<div class="lk-block lk-code">/);
  });

  it('keeps every tab readable without script, and side by side on slides', () => {
    const tabs = BLOCKS.find((b) => b.name === 'tabs')!.example;
    expect(html(tabs)).toMatch(/<section class="lk-tabs-panel" id="lk-tabs-1-1"><p class="lk-tabs-label">Windows<\/p>/);
    expect(html(tabs, 'deck')).toMatch(/class="lk-block lk-tabs lk-tabs--static"/);
    expect(html(BLOCKS.find((b) => b.name === 'accordion')!.example, 'deck')).toMatch(/<details class="lk-accordion-item" open>/);
  });

  it('loads YouTube only on request, privacy-enhanced; video files get captions', () => {
    const yt = html(BLOCKS.find((b) => b.name === 'video')!.example);
    expect(yt).not.toMatch(/<iframe/);
    expect(yt).toMatch(/<a class="lk-video-play" href="https:\/\/www\.youtube\.com\/watch\?v=aqz-KE-bpKQ" data-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?autoplay=1"/);
    const file = html(':::video[Demo]{src="media/demo.mp4" captions="media/demo.vtt"}\nWe build a manual.\n:::', 'manual', 'cs');
    expect(file).toMatch(/<video controls preload="metadata"><source src="media\/demo\.mp4"><track kind="captions" src="media\/demo\.vtt" srclang="cs" label="Demo" default><\/video>/);
    expect(file).toMatch(/<summary>Přepis<\/summary>/);
  });

  it('writes keys as key caps and the do / don\'t labels in words', () => {
    expect(html('Press :kbd[Ctrl+S].')).toMatch(/<kbd class="lk-kbd-combo"><kbd class="lk-kbd">Ctrl<\/kbd>\+<kbd class="lk-kbd">S<\/kbd><\/kbd>/);
    const compare = html(BLOCKS.find((b) => b.name === 'compare')!.example, 'manual', 'cs');
    expect(compare).toMatch(/<span aria-hidden="true">✓<\/span> Správně/);
    expect(compare).toMatch(/<span aria-hidden="true">✗<\/span> Špatně/);
  });

  it('writes the page around the content in the document language, with the runtime inlined', () => {
    const page = renderManual(parse('---\ntitle: Příručka\nlang: cs\nversion: "1"\n---\n\n## Jedna\n\nText.\n\n## Dvě\n\nText.\n').document, {
      styles: { tokens: read('libka-tokens.css'), bridge: read('lk-bridge.css'), components: '', manual: '' },
    });
    expect(page).toMatch(/>Přeskočit na obsah</);
    expect(page).toMatch(/<h2 id="lk-toc-title">Obsah<\/h2>/);
    expect(page).toMatch(/<span>Verze: 1<\/span>/);
    const script = page.slice(page.indexOf('<script>') + 8, page.indexOf('</script>'));
    expect(() => new Function(script)).not.toThrow();
    expect(script).toMatch(/"copy":"Kopírovat"/);
  });
});

describe('UI specimen output', () => {
  const ui = ':::ui{caption="Delete" theme=both}\n::button[Keep]{variant=secondary}\n::button[Delete]{variant=destructive state=disabled}\n:::';
  it('renders an inert specimen per theme, described in words for screen readers', () => {
    const out = html(ui);
    expect(out.match(/<div class="lk-ui-stage lk-ui-stage--row" data-theme="(light|dark)" inert aria-hidden="true">/g)).toHaveLength(2);
    expect(out).toMatch(/<p class="lk-visually-hidden">Example \(light and dark theme\): button “Keep” \(secondary\); button “Delete” \(destructive, disabled\)\.<\/p>/);
    expect(out).toMatch(/class="lk-ui-button lk-ui-button--destructive is-disabled" aria-disabled="true"/);
    expect(html(ui, 'manual', 'cs')).toMatch(/Ukázka \(světlý a tmavý motiv\): tlačítko „Keep“ \(sekundární\)/);
  });

  it('re-declares the tokens on each stage only when a document has specimens', () => {
    const page = (md: string) => renderManual(parse(`# T\n\n${md}\n`).document, { styles: { tokens: read('libka-tokens.css'), bridge: read('lk-bridge.css'), components: '', manual: '' } });
    const withUi = page(ui);
    expect(withUi).toMatch(/\.lk-ui-stage\[data-theme="dark"\] \{[\s\S]*--lk-button-primary-background: var\(--lk-action-primary\);/);
    expect(withUi).toMatch(/:root:not\(\[data-contrast="standard"\]\) \.lk-ui-stage\[data-theme="dark"\] \{/);
    expect(page('Just text.')).not.toMatch(/lk-ui-stage/);
  });

  it('renders inline badges with a known variant only', () => {
    expect(html('Export :badge[Beta]{variant=info} and :badge[Odd]{variant=sparkle}')).toMatch(/<span class="lk-badge lk-badge--info">Beta<\/span> and <span class="lk-badge lk-badge--neutral">Odd<\/span>/);
  });
});

describe('document frame output', () => {
  const manualStyles = { tokens: read('libka-tokens.css'), bridge: read('lk-bridge.css'), components: read('packages/render/src/components.css'), manual: read('packages/render/src/manual.css') };
  const page = (md: string) => renderManual(parse(md).document, { styles: manualStyles });

  it('marks every callout tone with an icon and its word, never color alone', () => {
    const out = html(':::callout[Back up first]{variant=caution}\nx\n:::\n\n> [!TIP]\n> y');
    expect(out).toMatch(/<aside class="lk-block lk-callout lk-callout--caution" role="note">\n  <p class="lk-callout-title"><svg class="lk-callout-icon"[^>]*aria-hidden="true"[^>]*>.*<\/svg><span class="lk-visually-hidden">Caution: <\/span><span>Back up first<\/span><\/p>/);
    expect(out).toMatch(/<aside class="lk-block lk-callout lk-callout--tip" role="note">\n  <p class="lk-callout-title"><svg[^>]*>.*<\/svg><span>Tip<\/span><\/p>/);
    expect(html('> [!IMPORTANT]\n> z', 'manual', 'cs')).toMatch(/<span>Důležité<\/span>/);
  });

  it('labels AI summaries in words and names the reviewer', () => {
    const out = html(BLOCKS.find((b) => b.name === 'summary')!.example);
    expect(out).toMatch(/<section class="lk-block lk-summary" aria-labelledby="lk-summary-1">\n<p class="lk-summary-title" id="lk-summary-1">Key takeaways<\/p>/);
    expect(out.match(/<li>/g)).toHaveLength(3);
    expect(out).toMatch(/<p class="lk-summary-source"><span class="lk-badge lk-badge--ai">AI-assisted<\/span> Reviewed by Docs lead\.<\/p>/);
    expect(html(':::summary\n- A\n- B\n- C\n:::', 'manual', 'cs')).toMatch(/Hlavní body<\/p>/);
  });

  it('shows status, owner and review dates under the title and in the footer; deprecated pages get a banner', () => {
    const out = page('---\ntitle: Policy\nstatus: Deprecated\nowner: Security team\nreviewed: 2026-09-01\nnext-review: 2027-03-01\n---\n\nText.\n');
    expect(out).toMatch(/<span>Status: <span class="lk-badge lk-badge--error">Deprecated<\/span><\/span>\n    <span>Owner: Security team<\/span>\n    <span>Reviewed: <time datetime="2026-09-01">2026-09-01<\/time><\/span>/);
    expect(out).toMatch(/<div class="lk-block lk-doc-banner" role="note"><p class="lk-doc-banner-title">Deprecated<\/p>/);
    expect(out).toMatch(/<footer class="lk-manual-footer"><p class="lk-manual-footer-status">Status: .*Next review: <time datetime="2027-03-01">/);
    expect(page('---\ntitle: P\nstatus: Approved\n---\n\nx\n')).toMatch(/lk-badge--success">Approved/);
    expect(page('---\ntitle: P\nstatus: Approved\n---\n\nx\n')).not.toMatch(/lk-doc-banner"/);
  });

  it('moves owner and dates into the :::doc-status panel when there is one', () => {
    const out = page('---\ntitle: P\nstatus: Draft\n---\n\n:::doc-status{owner="Docs team" reviewed=2026-09-01}\n:::\n');
    const header = out.slice(out.indexOf('<header'), out.indexOf('</header>'));
    expect(header).toMatch(/Status: <span class="lk-badge lk-badge--info">Draft/);
    expect(header).not.toMatch(/Owner/);
    expect(out).toMatch(/<section class="lk-block lk-doc-status" aria-label="Document status">\n<dl class="lk-doc-status-list"><div><dt>Status<\/dt><dd><span class="lk-badge lk-badge--info">Draft<\/span><\/dd><\/div><div><dt>Owner<\/dt><dd>Docs team<\/dd><\/div>/);
  });

  it('renders parts as level-2 headings listed in the contents, with a page break on request', () => {
    const out = page('---\ntitle: R\n---\n\n:::section[Part 1: Context]\n:::\n\n## Goals\n\nx\n\n:::section[Part 2: Results]{break=page}\nWhat we measured.\n:::\n\n## Numbers\n\ny\n');
    expect(out).toMatch(/<div class="lk-block lk-section lk-section--page">\n<h2 id="part-2-results" class="lk-section-title">Part 2: Results<\/h2>\n<div class="lk-section-body"><p>What we measured\.<\/p><\/div>/);
    expect(out).toMatch(/<li class="lk-manual-toc-part"><a href="#part-1-context">Part 1: Context<\/a><\/li>\n    <li><a href="#goals">Goals<\/a><\/li>/);
  });

  it('renders description lists with a caption, and calls to action as links with the address for print', () => {
    expect(html(BLOCKS.find((b) => b.name === 'dl')!.example)).toMatch(/<figure class="lk-block lk-dl">\n<figcaption class="lk-dl-caption">Project details<\/figcaption>\n<dl class="lk-dl-list">\n  <div><dt>Owner<\/dt><dd>Platform team<\/dd><\/div>/);
    expect(html(':::dl\n- **A** b\n:::')).toMatch(/^<dl class="lk-block lk-dl-list">/);
    const cta = html(BLOCKS.find((b) => b.name === 'cta')!.example);
    expect(cta).toMatch(/<p class="lk-cta-text">It takes about ten minutes\.<\/p>\n<p class="lk-cta-action"><a class="lk-cta-link lk-cta-link--primary" href="https:\/\/example\.org\/tutorial">Start the tutorial<span aria-hidden="true">→<\/span><\/a><span class="lk-cta-url">https:\/\/example\.org\/tutorial<\/span><\/p>/);
    expect(html('## Setup\n\n:::cta[Read the setup]{href="#setup"}\n:::')).not.toMatch(/lk-cta-url/);
    expect(cta).not.toMatch(/<button/);
  });
});

describe('navigation and sources output', () => {
  const manualStyles = { tokens: read('libka-tokens.css'), bridge: read('lk-bridge.css'), components: read('packages/render/src/components.css'), manual: read('packages/render/src/manual.css') };
  const REFS = 'references:\n  - id: wcag22\n    title: WCAG 2.2\n    author: W3C\n    year: 2023\n    url: https://www.w3.org/TR/WCAG22/\n  - id: doe\n    title: Plain words\n    author: ["Doe, Jane", "Roe, Rick"]\n    year: 2020\n    publisher: Example Press\n  - id: many\n    title: Large teams\n    author: ["Ann, A", "Bee, B", "Cee, C"]';
  const page = (md: string, fm = '') => renderManual(parse(`---\ntitle: T\n${fm}\n---\n\n${md}\n`).document, { styles: manualStyles });
  const main = (out: string) => out.slice(out.indexOf('<main'), out.indexOf('</main>'));

  it('links footnotes both ways and collects them under Notes, numbered by first use', () => {
    const out = page('## A\n\nFirst[^b], second[^a], again[^b].\n\n[^a]: Note A.\n\n[^b]: Note *B*.');
    expect(out).toMatch(/First<sup class="lk-fn-ref"><a href="#lk-fn-1" id="lk-fnref-1"><span class="lk-visually-hidden">Note <\/span>1<\/a><\/sup>, second<sup class="lk-fn-ref"><a href="#lk-fn-2" id="lk-fnref-2">/);
    expect(out).toMatch(/again<sup class="lk-fn-ref"><a href="#lk-fn-1" id="lk-fnref-1-2">/);
    expect(main(out)).toMatch(/<section class="lk-block lk-notes" aria-labelledby="lk-notes">\n<h2 id="lk-notes" class="lk-manual-h2">Notes<\/h2>\n<ol class="lk-notes-list">\n  <li id="lk-fn-1">Note <em>B<\/em>\. <a class="lk-fn-back" href="#lk-fnref-1" aria-label="Back to the text of note 1">↩<\/a><\/li>\n  <li id="lk-fn-2">Note A\./);
    expect(out).toMatch(/<li><a href="#lk-notes">Notes<\/a><\/li>/);   // in the automatic contents
  });

  it('cites in the numeric style by default and appends the list at the end', () => {
    const out = page('## A\n\nSee [@doe, p. 3], then [@wcag22; @doe] and [@many].', REFS);
    expect(out).toMatch(/See <span class="lk-cite">\[<a href="#lk-ref-doe">1<\/a>, p\. 3\]<\/span>, then <span class="lk-cite">\[<a href="#lk-ref-wcag22">2<\/a>, <a href="#lk-ref-doe">1<\/a>\]<\/span>/);
    expect(main(out)).toMatch(/<h2 id="lk-references" class="lk-manual-h2">References<\/h2>\n<ol class="lk-references-list">\n  <li id="lk-ref-doe">Doe, Jane and Roe, Rick \(2020\)\. <cite>Plain words<\/cite>\. Example Press\.<\/li>\n  <li id="lk-ref-wcag22">W3C \(2023\)\. <cite>WCAG 2\.2<\/cite>\. <a href="https:\/\/www\.w3\.org\/TR\/WCAG22\/">/);
    expect(main(out)).toMatch(/<li id="lk-ref-many">Ann, A; Bee, B and Cee, C \(n\.d\.\)/);
  });

  it('cites in the author-date style where :::references stands, sorted by author', () => {
    const out = page('## A\n\nSee [@doe, p. 3], [@wcag22] and [@many].\n\n:::references[Sources]{style=author-date}\n:::\n\n## B\n\nEnd.', REFS);
    expect(out).toMatch(/See <span class="lk-cite">\(<a href="#lk-ref-doe">Doe and Roe, 2020<\/a>, p\. 3\)<\/span>, <span class="lk-cite">\(<a href="#lk-ref-wcag22">W3C, 2023<\/a>\)<\/span> and <span class="lk-cite">\(<a href="#lk-ref-many">Ann et al\., n\.d\.<\/a>\)<\/span>/);
    const m = main(out);
    expect(m.indexOf('id="lk-references"')).toBeLessThan(m.indexOf('id="b"'));
    expect(m.match(/id="lk-references"/g)).toHaveLength(1);
    expect(m).toMatch(/<h2 id="lk-references" class="lk-manual-h2">Sources<\/h2>\n<ul class="lk-references-list lk-references-list--author-date">\n  <li id="lk-ref-many">.*\n  <li id="lk-ref-doe">.*\n  <li id="lk-ref-wcag22">/);
    expect(page('## A\n\nSee [@doe].', 'references:\n  - id: doe\n    title: X\n    author: Doe\n    year: 2020').replace(/\s+/g, ' ')).not.toMatch(/undefined/);
  });

  it('places contents where :::toc stands, nested to the chosen depth, instead of the automatic contents', () => {
    const out = page(':::toc[On this page]{depth=3}\n:::\n\n:::section[Part 1]\n:::\n\n## Goals\n\n### Scope\n\nx\n\n## Plan\n\ny');
    expect(out).not.toMatch(/<nav class="lk-manual-toc"/);
    expect(page('## A\n\nx\n\n## B\n\ny')).toMatch(/<nav class="lk-manual-toc"/);
    expect(out).toMatch(/<nav class="lk-block lk-toc" aria-labelledby="lk-toc-1">\n<p class="lk-toc-title" id="lk-toc-1">On this page<\/p>\n<ol class="lk-toc-list"><li class="lk-toc-part"><a href="#part-1">Part 1<\/a><\/li><li><a href="#goals">Goals<\/a><ol><li><a href="#scope">Scope<\/a><\/li><\/ol><\/li><li><a href="#plan">Plan<\/a><\/li><\/ol>\n<\/nav>/);
    expect(page(':::toc\n:::\n\n## Goals\n\n### Scope\n\nx')).not.toMatch(/href="#scope"/);
  });
});

describe('time and comparison output', () => {
  it('marks the current timeline item "Now" and names past and planned items for screen readers', () => {
    const out = html(BLOCKS.find((b) => b.name === 'timeline')!.example);
    expect(out).toMatch(/<figure class="lk-block lk-timeline">\n<figcaption class="lk-timeline-caption">Office move<\/figcaption>\n<ol class="lk-timeline-list">/);
    expect(out).toMatch(/<li class="lk-timeline-item is-past"><p class="lk-timeline-when"><span class="lk-visually-hidden">Past: <\/span>2026-Q1<\/p><div class="lk-timeline-body">Lease signed for the new office<\/div><\/li>/);
    expect(out).toMatch(/<li class="lk-timeline-item is-current"><p class="lk-timeline-when">2026-Q2 <span class="lk-timeline-now">Now<\/span><\/p>/);
    expect(out).toMatch(/<li class="lk-timeline-item is-planned"><p class="lk-timeline-when"><span class="lk-visually-hidden">Planned: <\/span>2026-Q3/);
    // calendar dates become time elements; without a caption the list is named
    expect(html(':::timeline\n- **2025** A\n- **2026-03** B\n:::', 'manual', 'cs')).toMatch(/<div class="lk-block lk-timeline">\n<ol class="lk-timeline-list" aria-label="Časová osa">\n  <li class="lk-timeline-item"><p class="lk-timeline-when"><time datetime="2025">2025<\/time><\/p>.*\n.*<time datetime="2026-03">/);
  });

  it('shows comparison marks as an icon and a word, and names the recommended column', () => {
    const out = html(BLOCKS.find((b) => b.name === 'comparison')!.example);
    expect(out).toMatch(/<table class="lk-block lk-table lk-comparison">\n  <caption>Laptops for the team<\/caption>/);
    expect(out).toMatch(/<thead><tr><th scope="col">Feature<\/th><th scope="col">Basic<\/th><th scope="col" class="is-highlight">Standard <span class="lk-comparison-badge">Recommended<\/span><\/th><th scope="col">Pro<\/th><\/tr><\/thead>/);
    expect(out).toMatch(/<tr><th scope="row">Second screen<\/th><td><span class="lk-mark lk-mark--no"><svg class="lk-mark-icon"[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Not included<\/span><\/td><td class="is-highlight"><span class="lk-mark lk-mark--yes"><svg[^>]*>.*?<\/svg>Included<\/span><\/td>/);
    expect(out).toMatch(/<td class="is-highlight"><span class="lk-mark lk-mark--partial"><svg[^>]*>.*?<\/svg>Partly<\/span><\/td>/);
    expect(out).toMatch(/<td>EUR 700<\/td>/);
    expect(html(BLOCKS.find((b) => b.name === 'comparison')!.example, 'manual', 'cs')).toMatch(/Doporučeno.*Neobsahuje.*Obsahuje.*Částečně/s);
    expect(html(':::comparison[P]\n| F | A | B |\n|---|---|---|\n| Notes | partial (50 per month) | yes |\n:::')).toMatch(/<td><span class="lk-mark lk-mark--partial"><svg[^>]*>.*?<\/svg>Partly<\/span> <span class="lk-mark-note">\(50 per month\)<\/span><\/td>/);
  });

  it('renders a release as a level-2 heading with its date and groups in Keep a Changelog order', () => {
    const out = html('::::release[v1.4.0]{date=2026-10-01}\n:::security\n- Patched.\n:::\n:::added\n- Tables.\n:::\n::::');
    expect(out).toMatch(/^<section class="lk-block lk-release" aria-labelledby="v1-4-0">\n<h2 id="v1-4-0" class="lk-manual-h2 lk-release-title">v1\.4\.0 <span class="lk-release-date"><span class="lk-visually-hidden">Released <\/span><time datetime="2026-10-01">2026-10-01<\/time><\/span><\/h2>/);
    expect(out.indexOf('lk-release-group--added')).toBeLessThan(out.indexOf('lk-release-group--security'));
    expect(out).toMatch(/<div class="lk-release-group lk-release-group--added"><p class="lk-release-kind"><svg class="lk-release-icon"[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Added<\/p><div class="lk-release-body"><ul>\n  <li>Tables\.<\/li>/);
    expect(html('::::release[v2]{date=2026-10-01}\n:::deprecated\n- Old API.\n:::\n::::', 'manual', 'cs')).toMatch(/Vydáno .*Označeno jako zastaralé/s);
  });
});

describe('diagram and code group output', () => {
  const example = BLOCKS.find((b) => b.name === 'diagram')!.example;
  it('shows the description until the diagram is drawn, and its SVG, caption and source once it is', () => {
    expect(html(example)).toMatch(/<figure class="lk-block lk-diagram">\n<div class="lk-diagram-art"><p class="lk-diagram-pending">The Markdown is parsed into blocks, Guard checks the rendered page, and outputs that pass are signed\.<\/p><\/div>\n<figcaption>How a LibKa document is built<\/figcaption>\n<details class="lk-diagram-source"><summary>Show the source<\/summary><pre class="lk-code-pre" tabindex="0"><code>flowchart LR\n  accTitle:/);
    const doc = parse(`# T\n\n${example}\n`).document;
    (doc.blocks[0] as { svg?: string }).svg = '<svg class="lk-diagram-svg" role="img"></svg>';
    const out = block(doc.blocks[0]!, context('cs'));
    expect(out).toMatch(/<div class="lk-diagram-art"><svg class="lk-diagram-svg" role="img"><\/svg><\/div>/);
    expect(out).toMatch(/<summary>Zobrazit zdroj<\/summary>/);
  });

  it('renders a code group as tabs labelled by the code titles, and stacks long variants on slides', () => {
    const group = BLOCKS.find((b) => b.name === 'code-group')!.example;
    const out = html(group);
    expect(out).toMatch(/^<div class="lk-block lk-tabs lk-code-group" id="lk-tabs-1">\n<section class="lk-tabs-panel" id="lk-tabs-1-1"><p class="lk-tabs-label">npm<\/p><div class="lk-tabs-body"><div class="lk-block lk-code"><pre/);
    expect(out).not.toMatch(/lk-code-title/);   // the title is the tab, not repeated above the code
    expect(html(group, 'deck')).toMatch(/^<div class="lk-block lk-tabs lk-code-group lk-tabs--static" id=/);
    const long = `:::code-group\n\`\`\`js title="A"\n${'x();\n'.repeat(9)}\`\`\`\n\`\`\`js title="B"\ny();\n\`\`\`\n:::`;
    expect(html(long, 'deck')).toMatch(/lk-tabs--static lk-code-group--stack/);
  });
});

describe('the chart summary in words', () => {
  type ChartBlock = Parameters<typeof chartText>[0];
  const chart = (values: number, series: number): ChartBlock => ({
    type: 'chart', kind: 'bar', caption: 'C', category: 'x', labels: Array.from({ length: values }, (_, i) => `L${i + 1}`),
    series: Array.from({ length: series }, (_, s) => ({ name: `S${s + 1}`, values: Array.from({ length: values }, (_, i) => i + s) })),
  });
  const say = (values: number, series: number, lang: 'en' | 'cs') => chartText(chart(values, series), lang, LABELS[lang]).summary.split('. ')[1];

  it('says "value" and "values" in English', () => {
    expect(say(1, 1, 'en')).toBe('1 value in 1 series');
    expect(say(3, 2, 'en')).toBe('6 values in 2 series');
  });

  it('reads a number to choose Czech "v" or "ve"', () => {
    const ve = [2, 3, 4, 12, 13, 14, 20, 25, 30, 44, 100, 150, 200, 345, 2000, 3500, 24000, 2_000_000];
    const v = [0, 1, 5, 7, 10, 11, 15, 19, 50, 99, 500, 1000, 1500, 5000, 1_000_000];
    expect(ve.filter((n) => czechIn(n) !== 've')).toEqual([]);
    expect(v.filter((n) => czechIn(n) !== 'v')).toEqual([]);
    expect(say(1, 12, 'cs')).toBe('12 hodnot ve 12 řadách');
  });

  it('uses the Czech forms for every count, and "ve" before 2, 3 and 4', () => {
    expect(say(1, 1, 'cs')).toBe('1 hodnota v 1 řadě');
    expect(say(3, 1, 'cs')).toBe('3 hodnoty v 1 řadě');
    expect(say(6, 1, 'cs')).toBe('6 hodnot v 1 řadě');
    expect(say(2, 2, 'cs')).toBe('4 hodnoty ve 2 řadách');
    expect(say(3, 3, 'cs')).toBe('9 hodnot ve 3 řadách');
    expect(say(1, 5, 'cs')).toBe('5 hodnot v 5 řadách');
  });
});
