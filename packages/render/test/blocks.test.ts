import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCKS } from '@libka/blocks';
import { parse, type DateFormat } from '@libka/model';
import { block, chartText, context, formatDate, LABELS, metricsFit, renderManual } from '../src/index.ts';
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

  it('lays every line and stroked marker on a casing in the text colour, so its shape passes 3:1 in every mode', () => {
    const md = ':::chart{type=line caption="Six series"}\n| Month | A | B | C | D | E | F |\n|---|---|---|---|---|---|---|\n| Jan | 1 | 2 | 3 | 4 | 5 | 6 |\n| Feb | 2 | 3 | 4 | 5 | 6 | 7 |\n:::';
    const out = html(md);
    // each line right after its casing, with the same points
    const lines = [...out.matchAll(/<polyline points="([^"]+)" class="lk-chart-casing"\/><polyline points="([^"]+)" class="lk-chart-line lk-chart-stroke-(\d)"\/>/g)];
    expect(lines.map((m) => m[3])).toEqual(['1', '2', '3', '4', '5', '6']);
    for (const m of lines) expect(m[1]).toBe(m[2]);
    // the cross (series 5) and the ring (series 6) markers too, and the legend's lines
    expect(out).toMatch(/<path d="([^"]+)" class="lk-chart-casing"\/><path d="\1" class="lk-chart-marker lk-chart-stroke-5"\/>/);
    expect(out).toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="5" class="lk-chart-casing"\/><circle [^>]*class="lk-chart-marker lk-chart-ring lk-chart-stroke-6"\/>/);
    expect(out.match(/<line x1="0" x2="16" y1="8" y2="8" class="lk-chart-casing"\/>/g)).toHaveLength(6);
  });

  it('places a line chart\'s value labels clear of every marker, line and other label, or leaves them out', () => {
    // close series (the talk's sign-ups by channel): labels above every point would sit on other series' markers
    const md = ':::chart{type=line caption="Sign-ups" unit="thousand"}\n| Month | Search | Referrals | Campus | Paid |\n|---|---|---|---|---|\n| Jul | 38 | 12 | 9 | 15 |\n| Aug | 41 | 14 | 9 | 13 |\n| Sep | 57 | 22 | 18 | 12 |\n:::';
    const out = html(md);
    const num = (s: string) => Number(s);
    // every point carries a marker (at most 6 px from it)
    const markers = [...out.matchAll(/<polyline points="([^"]+)" class="lk-chart-line/g)]
      .flatMap((m) => m[1]!.split(' ').map((p) => { const [x, y] = p.split(',').map(num); return { x: x!, y: y! }; }));
    expect(markers).toHaveLength(12);
    const labels = [...out.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="(middle|start|end)" class="lk-chart-value">([^<]+)<\/text>/g)].map((m) => {
      const w = m[4]!.length * 8, x = num(m[1]!), y = num(m[2]!);
      const l = m[3] === 'middle' ? x - w / 2 : m[3] === 'start' ? x : x - w;
      return { l, r: l + w, t: y - 11, b: y + 3 };
    });
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThan(12);   // some values do not fit: they stay in the table and the summary
    for (const a of labels) {
      for (const m of markers) expect(m.x + 7 <= a.l || m.x - 7 >= a.r || m.y + 7 <= a.t || m.y - 7 >= a.b, `a label on a marker at ${m.x},${m.y}`).toBe(true);
      for (const b of labels) if (a !== b) expect(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t).toBe(true);
    }
    // one series keeps every label, beside its points where the line rises or falls through the space above
    const one = html(':::chart{type=line caption="Emissions" unit="t"}\n| Year | Total |\n|---|---|\n| 2023 | 2410 |\n| 2024 | 2280 |\n| 2025 | 2090 |\n| 2026 | 1840 |\n:::');
    expect(one.match(/class="lk-chart-value"/g)).toHaveLength(4);
  });

  it('shows donut parts with their share, and formats numbers per language', () => {
    const md = ':::chart{type=donut caption="Time spent" unit="h"}\n| Task | Hours |\n|---|---|\n| Writing | 6.5 |\n| Review | 3.5 |\n:::';
    expect(html(md)).toMatch(/Writing 6\.5 h \(65 %\)/);
    expect(html(md, 'manual', 'cs')).toMatch(/Writing 6,5 h \(65 %\)/);
  });

  it('lays horizontal bars in rows, the long names broken into lines beside them', () => {
    const out = html(':::chart{type=hbar caption="Requests by channel" unit="%"}\n| Channel | Share |\n|---|---|\n| E-mail to the support address | 41 |\n| Chat | 27 |\n| Phone | 18 |\n:::');
    expect(out).toMatch(/<svg class="lk-chart-svg lk-chart-svg--hbar" viewBox="0 0 640 \d+" role="img"/);
    expect(out).toMatch(/<desc id="lk-chart-1-desc">Horizontal bar chart: Requests by channel\. 3 values in 1 series\. Highest: 41% \(E-mail to the support address\)\./);
    expect(out).toMatch(/<tspan x="[\d.]+">E-mail to the support<\/tspan><tspan x="[\d.]+" dy="16">address<\/tspan>/);
    expect(out).toMatch(/class="lk-chart-value">41%<\/text>/);
    expect(out).not.toMatch(/lk-chart-legend/);   // one series needs no legend
  });

  it('stacks bars: the total at the end, a part\'s value only where it fits, the totals in the table', () => {
    const md = ':::chart{type=bar stacked caption="Requests"}\n| Quarter | Questions | Problems | Ideas |\n|---|---|---|---|\n| Q1 | 420 | 180 | 40 |\n| Q2 | 460 | 150 | 60 |\n| Q3 | 380 | 210 | 30 |\n| Q4 | 510 | 120 | 90 |\n:::';
    const out = html(md);
    expect(out).toMatch(/<desc id="lk-chart-1-desc">Stacked bar chart: Requests\. 12 values in 3 series\. Highest total: 720 \(Q4\)\. Lowest total: 620 \(Q3\)\.<\/desc>/);
    expect(out.match(/class="lk-chart-value lk-chart-total">\d+</g)!.map((m) => m.match(/\d+/)![0])).toEqual(['640', '670', '620', '720']);
    // the small parts (40, 60, 30) are too thin for their value; 90 just fits
    expect(out.match(/class="lk-chart-chip"/g)).toHaveLength(9);
    expect(out).not.toMatch(/>40<\/text>/);
    expect(out).toMatch(/>90<\/text>/);
    expect(out).toMatch(/<th scope="col">Ideas<\/th><th scope="col">Total<\/th>/);
    expect(out).toMatch(/<th scope="row">Q1<\/th><td>420<\/td><td>180<\/td><td>40<\/td><td>640<\/td>/);
    expect(out).toMatch(/lk-chart-legend/);
  });

  it('writes a KPI\'s change in words with better or worse, its trend for the eye and in a sentence', () => {
    const out = html(BLOCKS.find((b) => b.name === 'kpi')!.example);
    expect(out).toMatch(/^<ul class="lk-block lk-kpi" data-count="2" data-fit="[\d.]+">\n  <li class="lk-kpi-item">\n    <p class="lk-kpi-label">Requests answered within a day<\/p>\n    <p class="lk-kpi-value">94%<\/p>/);
    expect(out).toMatch(/<p class="lk-kpi-change lk-kpi-change--good"><svg class="lk-kpi-arrow"[^>]*aria-hidden="true"[^>]*><path d="M8 13V3[^"]*"\/><\/svg><span>up 6 pp since Q2<\/span> <strong class="lk-kpi-verdict">better<\/strong><\/p>/);
    // waiting time going down is good (good=down)
    expect(out).toMatch(/lk-kpi-change--good"><svg[^>]*><path d="M8 3v10[^"]*"\/><\/svg><span>down 1\.1 h since Q2<\/span> <strong class="lk-kpi-verdict">better<\/strong>/);
    expect(out).toMatch(/<svg class="lk-kpi-spark" viewBox="0 0 120 32" aria-hidden="true" focusable="false"><polyline points="4\.0,28\.0 [^"]+ 116\.0,4\.0"/);
    expect(out).toMatch(/<p class="lk-visually-hidden">Trend over 4 periods: from 81 to 94, highest 94, lowest 81\.<\/p>/);
    expect(out).toMatch(/<details class="lk-kpi-data"><summary>Show the data<\/summary><p>81, 85, 88, 94<\/p><\/details>/);
    expect(out).toMatch(/<p class="lk-kpi-text">The new triage rules took effect in August\.<\/p>/);
  });

  it('says a KPI got worse, or did not change, in Czech too', () => {
    const md = ':::kpi[Náklady]{value="9,7 mil. Kč" change="+0,6 mil. Kč" since="roku 2025" good=down trend="8,8; 9,1; 9,7"}\n:::\n\n:::kpi[Spokojenost]{value="4,5" change=0 since="září"}\n:::';
    const out = html(md, 'manual', 'cs');
    // the widest figure, "9,7 mil. Kč", measured whole (it never breaks): its card shrinks it to fit
    expect(out).toMatch(/^<ul class="lk-block lk-kpi" data-count="2" data-fit="5\.5">/);
    expect(out).toMatch(/lk-kpi-change--bad"><svg[^>]*>.*?<\/svg><span>nárůst o 0,6.mil\. Kč oproti roku 2025<\/span> <strong class="lk-kpi-verdict">horší<\/strong>/);
    expect(out).toMatch(/Vývoj za 3 období: od 8,8 do 9,7, nejvýše 9,7, nejníže 8,8\./);
    expect(out).toMatch(/<p>8,8; 9,1; 9,7<\/p>/);
    expect(out).toMatch(/lk-kpi-change--flat"><svg[^>]*><path d="M3 8h10[^"]*"\/><\/svg><span>beze změny oproti září<\/span><\/p>/);
    expect(out.match(/class="lk-kpi-spark"/g)).toHaveLength(1);   // the second figure has no trend
  });

  it('writes the parts without their unit and the totals with it, in Czech', () => {
    const md = ':::chart{type=hbar stacked caption="Rozpočet" unit="mil. Kč"}\n| Oddělení | Mzdy | Provoz |\n|---|---|---|\n| Vývoj | 18,5 | 3,2 |\n| Obchod | 9,4 | 2,1 |\n:::';
    const out = html(md, 'manual', 'cs');
    expect(out).toMatch(/<desc id="lk-chart-1-desc">Skládaný pruhový graf: Rozpočet\. 4 hodnoty ve 2 řadách\. Nejvyšší součet: 21,7.mil\. Kč \(Vývoj\)\./);
    expect(out).toMatch(/class="lk-chart-value">18,5<\/text>/);
    expect(out).toMatch(/class="lk-chart-value lk-chart-total">21,7.mil\. Kč<\/text>/);
    expect(out).toMatch(/<th scope="col">Celkem<\/th>/);
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

  it('writes pros and cons as a named group of two lists, each under its word, pros first', () => {
    const out = html('::::pros-cons[Option A]\n:::cons\n- Slow\n:::\n:::pros\n- Cheap\n- Simple\n:::\n::::');
    expect(out).toMatch(/^<div class="lk-block lk-pros-cons" role="group" aria-labelledby="(lk-pros-cons-\d+)">\n<p class="lk-pros-cons-title" id="\1">Option A<\/p>/);
    expect(out).toMatch(/lk-pros-cons-side--pros"><p class="lk-pros-cons-kind"><span aria-hidden="true">\+<\/span> Pros<\/p>\n<ul>\n {2}<li>Cheap<\/li>\n {2}<li>Simple<\/li>\n<\/ul><\/div>\n<div class="lk-pros-cons-side lk-pros-cons-side--cons">/);
    const cs = html(BLOCKS.find((b) => b.name === 'pros-cons')!.example, 'manual', 'cs');
    expect(cs).toMatch(/<span aria-hidden="true">\+<\/span> Výhody<\/p>/);
    expect(cs).toMatch(/<span aria-hidden="true">−<\/span> Nevýhody<\/p>/);
  });

  it('writes a process as a named group around a numbered list, a cycle\'s return written out', () => {
    const linear = html(BLOCKS.find((b) => b.name === 'flow')!.example);
    expect(linear).toMatch(/^<div class="lk-block lk-process" role="group" aria-labelledby="(lk-process-\d+)">\n<p class="lk-process-title" id="\1">How a support request runs<\/p>\n<ol class="lk-process-list">\n {2}<li class="lk-process-stage"><div class="lk-process-body"><p>The customer writes in<\/p><\/div><\/li>/);
    expect(linear.match(/<li /g)).toHaveLength(4);
    expect(linear).not.toMatch(/lk-process-again|lk-process-list--long/);
    expect(html(':::flow[P]\n1. a\n2. b\n3. c\n4. d\n5. e\n:::')).toMatch(/<ol class="lk-process-list lk-process-list--long">/);   // stacks sooner, a row on slides
    const cycle = html(':::flow[Cyklus]{shape=cycle}\n1. **Naplánovat** změnu\n2. Vyzkoušet\n:::', 'manual', 'cs');
    expect(cycle).toMatch(/<\/ol>\n<p class="lk-process-again"><span aria-hidden="true">↻<\/span> Pak vše začíná znovu: <strong>Naplánovat<\/strong> změnu<\/p>\n<\/div>$/);
  });

  it('writes a matrix as a named group of four named quadrants, the axes first in reading order, a SWOT\'s names filled in', () => {
    const swot = html('::::matrix[SWOT]{type=swot}\n:::q\n- Fast\n:::\n:::q[Weak spots]\n- Small\n:::\n:::q\n- New market\n:::\n:::q\n- Rivals\n:::\n::::', 'manual', 'cs');
    expect(swot).toMatch(/^<div class="lk-block lk-matrix lk-matrix--swot" role="group" aria-labelledby="(lk-matrix-\d+)">\n<p class="lk-matrix-title" id="\1">SWOT<\/p>\n<div class="lk-matrix-grid">/);
    expect([...swot.matchAll(/<p class="lk-matrix-label" id="[^"]+">([^<]+)<\/p>/g)].map((m) => m[1])).toEqual(['Silné stránky', 'Weak spots', 'Příležitosti', 'Hrozby']);
    expect(swot).toMatch(/<div class="lk-matrix-q lk-matrix-q--1" role="group" aria-labelledby="(lk-matrix-\d+-1)"><p class="lk-matrix-label" id="\1">/);
    expect(swot).not.toMatch(/lk-matrix-axis/);
    const grid = html(BLOCKS.find((b) => b.name === 'matrix')!.example);
    expect(grid).toMatch(/^<div class="lk-block lk-matrix" role="group"/);
    expect(grid).toMatch(/<p class="lk-matrix-axis lk-matrix-axis--y"><span class="lk-visually-hidden">Down: <\/span>Impact, high at the top and low at the bottom<\/p>\n<p class="lk-matrix-axis lk-matrix-axis--x"><span class="lk-visually-hidden">Across: <\/span>Effort, low on the left and high on the right<\/p>\n<div class="lk-matrix-grid">/);
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
    expect(out).toMatch(/<p class="lk-visually-hidden">Example \(light and dark mode\): button “Keep” \(secondary\); button “Delete” \(destructive, disabled\)\.<\/p>/);
    expect(out).toMatch(/class="lk-ui-button lk-ui-button--destructive is-disabled" aria-disabled="true"/);
    expect(html(ui, 'manual', 'cs')).toMatch(/Ukázka \(světlý a tmavý režim\): tlačítko „Keep“ \(sekundární\)/);
  });

  it('re-declares the tokens on each stage only when a document has specimens', () => {
    const page = (md: string) => renderManual(parse(`# T\n\n${md}\n`).document, { styles: { tokens: read('libka-tokens.css'), bridge: read('lk-bridge.css'), components: '', manual: '' } });
    const withUi = page(ui);
    expect(withUi).toMatch(/\.lk-ui-stage\[data-theme="dark"\] \{[\s\S]*--lk-button-primary-background: var\(--lk-action-primary\);/);
    expect(withUi).toMatch(/:root:not\(\[data-contrast="standard"\]\) \.lk-ui-stage\[data-theme="dark"\] \{/);
    expect(page('Just text.')).not.toMatch(/lk-ui-stage/);
  });

  it('renders inline badges with a known variant only', () => {
    expect(html('Export :badge[New]{variant=info} and :badge[Odd]{variant=sparkle}')).toMatch(/<span class="lk-badge lk-badge--info">New<\/span> and <span class="lk-badge lk-badge--neutral">Odd<\/span>/);
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

  it('labels an AI summary in words, with its reviewer, only when the document turns the AI label on', () => {
    const example = BLOCKS.find((b) => b.name === 'summary')!.example;
    const out = html(example);
    expect(out).toMatch(/<section class="lk-block lk-summary" aria-labelledby="lk-summary-1">\n<p class="lk-summary-title" id="lk-summary-1">Key takeaways<\/p>/);
    expect(out.match(/<li>/g)).toHaveLength(3);
    expect(out).not.toMatch(/lk-summary-source|lk-badge--ai/);
    expect(html(example, 'manual', 'en', 'ai:\n  use: ai-assisted\n  label: true')).toMatch(/<p class="lk-summary-source"><span class="lk-badge lk-badge--ai">AI-generated<\/span> Reviewed and approved by Docs lead\.<\/p>/);
    expect(html(':::summary\n- A\n- B\n- C\n:::', 'manual', 'cs')).toMatch(/Hlavní body<\/p>/);
  });

  it('puts the AI badge before AI-generated content nobody reviewed, only when the label is on', () => {
    const md = ':::callout[Holiday]{variant=tip ai=generated}\nClosed.\n:::';
    expect(html(md, 'manual', 'en', 'ai: ai-generated')).not.toMatch(/lk-ai-badge/);
    expect(html(md, 'manual', 'cs', 'ai:\n  use: ai-generated\n  label: true')).toMatch(/^<p class="lk-ai-badge"><span class="lk-badge lk-badge--ai">Obsah od AI<\/span><\/p>\n<aside class="lk-block lk-callout/);
    expect(html(md, 'manual', 'en', 'ai:\n  use: ai-generated\n  reviewed-by: Ann\n  label: true')).not.toMatch(/lk-ai-badge/);
  });

  it('writes the AI label under the title only when the document turns it on', () => {
    const page = (ai: string, lang = 'en') => renderManual(parse(`---\ntitle: T\nlang: ${lang}\n${ai}\n---\n\nText.\n`).document, { styles: { tokens: read('libka-tokens.css'), bridge: read('lk-bridge.css'), components: '', manual: '' } });
    expect(page('ai: ai-generated')).not.toMatch(/lk-doc-ai/);
    expect(page('ai:\n  use: ai-generated\n  label: true')).toMatch(/<p class="lk-doc-ai">Created with AI tools\.<\/p>/);
    expect(page('ai:\n  use: ai-assisted\n  reviewed-by: Ann Novak\n  label: true')).toMatch(/<p class="lk-doc-ai">Created with AI tools\. Reviewed and approved by Ann Novak\.<\/p>/);
    expect(page('ai:\n  use: ai-assisted\n  reviewed-by: Ann Novak\n  approved-by: Library Board\n  label: true')).toMatch(/Created with AI tools\. Reviewed by Ann Novak\. Approved by Library Board\./);
    expect(page('ai:\n  use: ai-assisted\n  reviewed-by: Jana Nováková\n  label: true', 'cs')).toMatch(/<p class="lk-doc-ai">Vytvořeno s\svyužitím nástrojů AI\. Kontrola a\sschválení: Jana Nováková\.<\/p>/);   // \s: the Czech no-break spaces
  });

  it('shows status, owner and review dates under the title and in the footer; deprecated pages get a banner', () => {
    const out = page('---\ntitle: Policy\nstatus: Deprecated\nowner: Security team\nreviewed: 2026-09-01\nnext-review: 2027-03-01\n---\n\nText.\n');
    expect(out).toMatch(/<span>Status: <span class="lk-badge lk-badge--error">Deprecated<\/span><\/span>\n    <span>Owner: Security team<\/span>\n    <span>Reviewed: <time datetime="2026-09-01">1\u00a0September 2026<\/time><\/span>/);
    expect(out).toMatch(/<div class="lk-block lk-doc-banner" role="note"><p class="lk-doc-banner-title">Deprecated<\/p>/);
    expect(out).toMatch(/<footer class="lk-manual-footer"><p class="lk-manual-footer-status">Status: .*Next review: <time datetime="2027-03-01">/);
    expect(page('---\ntitle: P\nstatus: Approved\n---\n\nx\n')).toMatch(/lk-badge--success">Approved/);
    expect(page('---\ntitle: P\nstatus: Approved\n---\n\nx\n')).not.toMatch(/lk-doc-banner"/);
  });

  it('renders a download as a link named with its format, size and pages, the address written out for print', () => {
    const out = html(BLOCKS.find((b) => b.name === 'download')!.example);
    expect(out).toBe('<div class="lk-block lk-download">\n<p class="lk-download-action"><a class="lk-download-link" href="https://example.org/annual-report-2025.pdf">Annual report 2025<span class="lk-download-details"> (PDF, 2.1 MB, 48 pages)</span></a>'
      + '<span class="lk-download-url">https://example.org/annual-report-2025.pdf</span></p>\n<p class="lk-download-text">The full report with all tables.</p>\n</div>');
    const local = (bytes: number, pages?: number, lang = 'en') => {
      const { document } = parse('# T\n\n:::download[Report]{href=report.pdf}\n:::\n');
      Object.assign(document.blocks[0]!, { bytes, ...(pages ? { pages } : {}) });
      return block(document.blocks[0]!, context(lang, 'manual', document));
    };
    // no-break spaces keep each number with its unit or word
    expect(local(2_200_000, 1)).toContain('(PDF, 2.1 MB, 1 page)');
    expect(local(2_200_000, 3, 'cs')).toContain('(PDF, 2,1 MB, 3 strany)');
    expect(local(52_000, 5, 'cs')).toContain('(PDF, 51 kB, 5 stran)');
    expect(local(900)).toContain('(PDF, 900 B)');
    expect(local(900)).not.toMatch(/lk-download-url/);
  });

  it('renders a decision as a section with its status as a word, its date and who decided, the parts as subheadings', () => {
    const out = html(BLOCKS.find((b) => b.name === 'decision')!.example);
    expect(out).toMatch(/^<section class="lk-block lk-decision" aria-labelledby="store-documents-in-postgresql">\n<h2 id="store-documents-in-postgresql" class="lk-manual-h2 lk-decision-title">Store documents in PostgreSQL<\/h2>/);
    expect(out).toContain('<p class="lk-decision-meta"><span class="lk-visually-hidden">Status: </span><span class="lk-badge lk-badge--success">Accepted</span> '
      + '<span><span class="lk-visually-hidden">Date: </span><time datetime="2026-10-01">1\u00a0October 2026</time></span> <span>Decided by: Architecture board</span></p>');
    expect([...out.matchAll(/<h3 class="lk-decision-kind">([^<]+)<\/h3>/g)].map((m) => m[1])).toEqual(['Context', 'Options considered', 'Consequences']);
    const cs = html('::::decision[Použijeme A]{status=rejected date=2026-03-01 by="Rada"}\n:::context\nProč.\n:::\n::::', 'manual', 'cs');
    expect(cs).toMatch(/lk-badge--error">Zamítnuto<\/span>/);
    expect(cs).toMatch(/<h3 class="lk-decision-kind">Výchozí situace<\/h3>/);
  });

  it('renders a revision history as a section of its own over a table, its dates as time elements', () => {
    const out = html(BLOCKS.find((b) => b.name === 'revisions')!.example);
    expect(out).toMatch(/<section class="lk-block lk-revisions-section" aria-labelledby="lk-revisions">\n<h2 id="lk-revisions" class="lk-manual-h2">Revision history<\/h2>\n<div class="lk-table-scroll" role="region" tabindex="0" aria-label="Revision history">\n<table class="lk-block lk-table lk-revisions">\n  <caption class="lk-visually-hidden">Revision history<\/caption>/);
    expect(out).toMatch(/<th scope="col" class="lk-revisions-version">Version<\/th>[\s\S]*?<th scope="col">Approved by<\/th>/);
    expect(out).toMatch(/<td class="lk-revisions-date"><time datetime="2026-09-15">15\u00a0September 2026<\/time><\/td>/);
    // without a label the heading is the language's name for it; on a slide the slide's heading shows it
    const md = ':::revisions\n| Verze | Datum | Změna |\n|---|---|---|\n| 1.0 | 2026-03-01 | První verze |\n:::';
    expect(html(md, 'manual', 'cs')).toMatch(/<h2 id="lk-revisions" class="lk-manual-h2">Historie změn<\/h2>/);
    const slide = html(md, 'deck', 'en');
    expect(slide).toMatch(/<caption class="lk-visually-hidden">Revision history<\/caption>/);
    expect(slide).not.toMatch(/<h2/);
  });

  it('shows the authors under the title and in the page metadata, or where :::byline stands', () => {
    const fm = '---\ntitle: Policy\nauthor:\n  - name: Ann Novak\n    role: Security lead\n  - name: Petr Svoboda\n---\n\n';
    const out = page(`${fm}Text.\n`);
    expect(out).toMatch(/<meta name="author" content="Ann Novak, Petr Svoboda">\n<title>Policy<\/title>/);
    expect(out).toMatch(/<div class="lk-doc-meta">\n    <span>Authors: Ann Novak \(Security lead\), Petr Svoboda<\/span>/);
    const placed = page(`${fm}Text.\n\n:::byline\n:::\n`);
    expect(placed.slice(placed.indexOf('<header'), placed.indexOf('</header>'))).not.toMatch(/Authors/);
    expect(placed).toMatch(/<p class="lk-block lk-byline"><span class="lk-byline-label">Authors:<\/span> Ann Novak \(Security lead\), Petr Svoboda<\/p>/);
    expect(page('---\ntitle: P\nauthor: Jana Nováková\nlang: cs\n---\n\nText.\n')).toMatch(/<span>Autor: Jana Nováková<\/span>/);
    expect(page('---\ntitle: P\n---\n\nText.\n')).not.toMatch(/name="author"/);
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
    // the year stays with its comma (a no-break space), so a long name may wrap but never strand the year
    expect(out).toMatch(/See <span class="lk-cite">\(<a href="#lk-ref-doe">Doe and Roe, 2020<\/a>, p\. 3\)<\/span>, <span class="lk-cite">\(<a href="#lk-ref-wcag22">W3C, 2023<\/a>\)<\/span> and <span class="lk-cite">\(<a href="#lk-ref-many">Ann et al\., n\.d\.<\/a>\)<\/span>/);
    const m = main(out);
    expect(m.indexOf('id="lk-references"')).toBeLessThan(m.indexOf('id="b"'));
    expect(m.match(/id="lk-references"/g)).toHaveLength(1);
    expect(m).toMatch(/<h2 id="lk-references" class="lk-manual-h2">Sources<\/h2>\n<ul class="lk-references-list lk-references-list--author-date">\n  <li id="lk-ref-many">.*\n  <li id="lk-ref-doe">.*\n  <li id="lk-ref-wcag22">/);
    expect(page('## A\n\nSee [@doe].', 'references:\n  - id: doe\n    title: X\n    author: Doe\n    year: 2020').replace(/\s+/g, ' ')).not.toMatch(/undefined/);
  });

  it('places an agenda of the sections where :::agenda stands, instead of the automatic contents', () => {
    const out = page(':::agenda\n:::\n\n:::section[Part 1]\n:::\n\n## Goals\n\n### Scope\n\nx[^1]\n\n## Plan\n\ny\n\n[^1]: A note.');
    expect(out).not.toMatch(/<nav class="lk-manual-toc"/);
    // parts and ## sections only: no ### and no Notes; nothing is current on the page
    expect(out).toMatch(/<nav class="lk-block lk-toc" aria-labelledby="lk-agenda-1">\n<p class="lk-toc-title" id="lk-agenda-1">Agenda<\/p>\n<ol class="lk-toc-list"><li class="lk-toc-part"><a href="#part-1">Part 1<\/a><\/li><li><a href="#goals">Goals<\/a><\/li><li><a href="#plan">Plan<\/a><\/li><\/ol>\n<\/nav>/);
    expect(out).not.toMatch(/aria-current="step"|class="lk-agenda-now"/);
    expect(page(':::agenda[Program dne]\n:::\n\n## A\n\nx', 'lang: cs')).toMatch(/<p class="lk-toc-title" id="lk-agenda-1">Program dne<\/p>/);
    expect(page(':::agenda\n:::\n\n## A\n\nx', 'lang: cs')).toMatch(/<p class="lk-toc-title" id="lk-agenda-1">Program<\/p>/);
  });

  it('ends with the closing as a ## section, listed in the contents, with the contacts as links written out', () => {
    const out = page('## Goals\n\nx\n\n## Plan\n\ny\n\n:::closing[Thanks for reading]{email=team@example.org url=example.org}\n- Keep it short.\n:::');
    expect(out).toMatch(/<section class="lk-block lk-closing" aria-labelledby="lk-closing">\n<h2 id="lk-closing" class="lk-manual-h2">Thanks for reading<\/h2>\n<ul class="lk-closing-recap"><li>Keep it short.<\/li><\/ul>\n<dl class="lk-closing-contacts"><dt>E-mail<\/dt><dd><a href="mailto:team@example.org">team@example.org<\/a><\/dd><dt>Web<\/dt><dd><a href="https:\/\/example.org">example.org<\/a><\/dd><\/dl>\n<\/section>/);
    // in the automatic contents, after the sections
    const contents = out.slice(out.indexOf('<nav class="lk-manual-toc"'), out.indexOf('</nav>', out.indexOf('<nav class="lk-manual-toc"')));
    expect(contents.indexOf('<a href="#lk-closing">Thanks for reading</a>')).toBeGreaterThan(contents.indexOf('<a href="#plan">Plan</a>'));
    expect(contents.indexOf('<a href="#plan">Plan</a>')).toBeGreaterThan(0);
    // an agenda leaves it out
    expect(page(':::agenda\n:::\n\n## A\n\nx\n\n:::closing\n:::')).not.toMatch(/<a href="#lk-closing">/);
    expect(page('## A\n\nx\n\n:::closing\n:::', 'lang: cs')).toMatch(/<h2 id="lk-closing" class="lk-manual-h2">Děkujeme<\/h2>\n<\/section>/);
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
    expect(html(':::timeline\n- **2025** A\n- **2026-03** B\n:::', 'manual', 'cs')).toMatch(/<div class="lk-block lk-timeline">\n<ol class="lk-timeline-list" aria-label="Časová osa">\n  <li class="lk-timeline-item"><p class="lk-timeline-when"><time datetime="2025">2025<\/time><\/p>.*\n.*<time datetime="2026-03">březen 2026<\/time>/);
  });

  it('writes dates as the document\'s language does, in the format the front matter chooses, with ISO for machines', () => {
    expect(['long', 'short', 'iso'].map((f) => formatDate('2026-10-28', 'en', f as DateFormat))).toEqual(['28\u00a0October 2026', '28/10/2026', '2026-10-28']);
    expect(['long', 'short', 'iso'].map((f) => formatDate('2026-10-28', 'cs', f as DateFormat))).toEqual(['28.\u00a0října 2026', '28.\u00a010.\u00a02026', '2026-10-28']);
    expect([formatDate('2026-03', 'cs'), formatDate('2026-03', 'en', 'short'), formatDate('2026-02-30', 'en'), formatDate('October 2026', 'en'), formatDate('2026-Q1', 'cs')])
      .toEqual(['březen 2026', '03/2026', '2026-02-30', 'October 2026', '2026-Q1']);
    // one setting for every date in the document: a decision, a release, the revision history
    const md = '::::decision[Use A]{status=accepted date=2026-10-01 by="Rada"}\nA.\n:::context\nProč.\n:::\n::::\n\n::::release[v1.0.0]{date=2026-09-01}\n:::added\n- A\n:::\n::::\n\n:::revisions\n| Verze | Datum | Změna |\n|---|---|---|\n| 1.0 | 2026-03-01 | První verze |\n:::';
    const short = html(md, 'manual', 'cs', 'lang: cs\ndate-format: short');
    expect(short).toContain('<time datetime="2026-10-01">1.\u00a010.\u00a02026</time>');
    expect(short).toContain('<time datetime="2026-09-01">1.\u00a09.\u00a02026</time>');
    expect(short).toContain('<time datetime="2026-03-01">1.\u00a03.\u00a02026</time>');
    expect(html(md, 'manual', 'cs', 'lang: cs\ndate-format: iso')).toContain('<time datetime="2026-10-01">2026-10-01</time>');
    // the title's date too; free text such as "October 2026" stays as written
    const page = (fm: string) => renderManual(parse(`---\ntitle: T\nlang: cs\n${fm}\n---\n\n## A\n\nText.\n`).document, { styles: { tokens: read('libka-tokens.css'), bridge: read('lk-bridge.css'), components: '', manual: '' } });
    expect(page('date: "2026-10-28"')).toContain('<span>Datum: <time datetime="2026-10-28">28.\u00a0října 2026</time></span>');
    expect(page('date: Říjen 2026')).toContain('<span>Datum: Říjen 2026</span>');
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
    expect(out).toMatch(/^<section class="lk-block lk-release" aria-labelledby="v1-4-0">\n<h2 id="v1-4-0" class="lk-manual-h2 lk-release-title">v1\.4\.0 <span class="lk-release-date"><span class="lk-visually-hidden">Released <\/span><time datetime="2026-10-01">1\u00a0October 2026<\/time><\/span><\/h2>/);
    expect(out.indexOf('lk-release-group--added')).toBeLessThan(out.indexOf('lk-release-group--security'));
    expect(out).toMatch(/<div class="lk-release-group lk-release-group--added"><p class="lk-release-kind"><svg class="lk-release-icon"[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Added<\/p><div class="lk-release-body"><ul>\n  <li>Tables\.<\/li>/);
    expect(html('::::release[v2]{date=2026-10-01}\n:::deprecated\n- Old API.\n:::\n::::', 'manual', 'cs')).toMatch(/Vydáno .*Označeno jako zastaralé/s);
  });
});

describe('key figures', () => {
  it('measures the longest word of the figures in half ems, from 2 to 10', () => {
    expect(metricsFit(['4', '0'])).toBe(2);
    expect(metricsFit(['184,000'])).toBe(4.5);
    expect(metricsFit(['1,234,567', '50 %'])).toBe(5);
    expect(metricsFit(['2.4 million'])).toBe(5); // "million" is the longest word; the space breaks
    expect(metricsFit(['184 000'])).toBe(5); // a no-break space does not
    expect(metricsFit(['12,345,678,901,234,567,890'])).toBe(10);
  });

  it('keeps a figure\'s digit groups together and gives the CSS a step for every width it can measure', () => {
    const out = html(':::metrics\n- **184 000** visitors\n- **2.4 million** euros\n:::');
    expect(out).toMatch(/^<ul class="lk-block lk-metrics" data-fit="5">\n  <li><span class="lk-metric-value">184 000<\/span>/);
    expect(out).toContain('2.4 million');
    expect(html(':::metrics\n- **1,2 mil. Kč** rozpočet\n:::', 'manual', 'cs')).toContain('data-fit="3"');
    // (the KPI row shares the steps)
    for (let fit = 2.5; fit <= 10; fit += 0.5) expect(css).toContain(`:is(.lk-metrics, .lk-kpi)[data-fit="${fit}"] { --lk-metric-fit: ${fit}; }`);
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
