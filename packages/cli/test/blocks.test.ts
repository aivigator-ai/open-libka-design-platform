import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardHtml, launchBrowser } from '@libka/guard';
import { PDFDocument } from 'pdf-lib';
import { build, printPdf, type BuildResult } from '../src/libka.ts';

const dir = mkdtempSync(join(tmpdir(), 'libka-blocks-test-'));
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

const SOURCE = `---
title: Core blocks in the browser
---

## Install

::::tabs
:::tab[Windows]
Run \`setup.exe\`.
:::
:::tab[macOS]
Open \`Setup.dmg\`.
:::
::::

## Uninstall

::::tabs
:::tab[Windows]
Use *Apps and features*.
:::
:::tab[macOS]
Drag the app to the bin.
:::
::::

\`\`\`bash title="build.sh"
libka build guide.md
\`\`\`

::::accordion
:::item[Does it work offline?]
Yes, every output is one local file.
:::
::::

:::video[Big Buck Bunny]{src="https://www.youtube.com/watch?v=aqz-KE-bpKQ"}
An animated short without dialogue.
:::
`;

describe.skipIf(!chrome)('core blocks in the browser', () => {
  let result: BuildResult;
  let browser: Browser;
  let page: Page;
  const tab = (group: number, name: string) => page.locator('.lk-tabs').nth(group).getByRole('tab', { name });

  beforeAll(async () => {
    writeFileSync(join(dir, 'guide.md'), SOURCE);
    result = await build(join(dir, 'guide.md'), { pdf: true });
    browser = await launchBrowser();
    const context = await browser.newContext();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page = await context.newPage();
    await page.goto(pathToFileURL(result.html!).href);
  }, 120000);
  afterAll(async () => {
    await browser?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes Guard as loaded and with everything shown', () => {
    expect(result.problems).toEqual([]);
    expect(result.report!.passed).toBe(true);
  });

  it('turns tabs into keyboard tabs that switch together and are remembered', async () => {
    expect(await tab(0, 'Windows').getAttribute('aria-selected')).toBe('true');
    expect(await page.locator('#lk-tabs-1-2').isHidden()).toBe(true);
    await tab(0, 'Windows').focus();
    await page.keyboard.press('ArrowRight');
    expect(await tab(0, 'macOS').getAttribute('aria-selected')).toBe('true');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('macOS');
    expect(await tab(1, 'macOS').getAttribute('aria-selected')).toBe('true');   // the other group follows
    await page.reload();
    expect(await tab(1, 'macOS').getAttribute('aria-selected')).toBe('true');   // and the choice is remembered
  });

  it('copies code and says so', async () => {
    await page.click('.lk-code-copy');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('libka build guide.md');
    await page.waitForFunction(() => document.querySelector('.lk-live')?.textContent === 'Copied to the clipboard');
  });

  it('loads the video only when asked, from the privacy-enhanced address', async () => {
    expect(await page.locator('iframe').count()).toBe(0);
    await page.route('**/*', (r) => r.request().url().startsWith('file:') ? r.continue() : r.abort());
    await page.click('.lk-video-play');
    expect(await page.getAttribute('iframe.lk-video-frame', 'src')).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1');
  });

  it('opens every tab and answer when the reader prints, and closes them again', async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    expect(await page.locator('.lk-tabs-panel:visible').count()).toBe(4);
    expect(await page.locator('details:not([open])').count()).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(await page.locator('.lk-tabs-panel:visible').count()).toBe(2);
    expect(await page.locator('details[open]').count()).toBe(0);
  });

  it('shows everything for print and restores the reader\'s view afterwards', async () => {
    await page.evaluate(() => (window as unknown as { libka: { expandAll(): void } }).libka.expandAll());
    expect(await page.locator('.lk-tabs-panel:visible').count()).toBe(4);
    expect(await page.locator('details[open]').count()).toBe(await page.locator('details').count());
    await page.evaluate(() => (window as unknown as { libka: { restore(): void } }).libka.restore());
    expect(await page.locator('.lk-tabs-panel:visible').count()).toBe(2);
  });

  it('finds a problem hidden in a tab that is not shown', async () => {
    const bad = join(dir, 'bad.html');
    writeFileSync(bad, readFileSync(result.html!, 'utf8').replace('Drag the app to the bin.', '<img src="x.png">Drag the app to the bin.'));
    const report = await guardHtml(bad, browser);
    expect(report.checks.find((c) => c.id === 'axe')!.violations.map((v) => v.rule)).toContain('image-alt');
  }, 60000);
});

describe('libka lint', () => {
  it('reports problems with lines, the outline and slide hints, without a browser', async () => {
    const { lint } = await import('../src/libka.ts');
    const long = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} has a dozen words to fill the slide quite fast.`).join('\n\n');
    const r = lint(`---\ntitle: T\n---\n\n## Short\n\nFine.\n\n## Long\n\n${long}\n\n:::table\n| a |\n|---|\n| 1 |\n:::\n`);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([{ code: 'missing-attribute', line: 35, message: expect.stringMatching(/:::table needs a caption/), fixes: [{ kind: 'field', target: 'attribute:caption' }] }]);
    expect(r.outline).toEqual([{ level: 2, text: 'Short' }, { level: 2, text: 'Long' }]);
    expect(r.slides).toBe(3);
    expect(r.hints).toEqual([expect.stringMatching(/^slide 3 \("Long"\) has about 1\d\d words/)]);
  });

  it('hints at crowded callouts and at a review date that has passed', async () => {
    const { lint } = await import('../src/libka.ts');
    const three = ':::callout[A]{variant=info}\nx\n:::\n\n> [!TIP]\n> y\n\n::::tabs\n:::tab[A]\n> [!NOTE]\n> z\n:::\n:::tab[B]\nw\n:::\n::::';
    const md = `---\ntitle: T\nreviewed: 2026-03-01\nnext-review: 2026-09-01\n---\n\n## Calm\n\n> [!NOTE]\n> One is fine.\n\n## Busy\n\n${three}\n`;
    const r = lint(md, '2026-10-04');
    expect(r.problems).toEqual([]);
    expect(r.hints).toEqual([
      'section "Busy" has 3 callouts; more than 2 stop standing out: keep the most important and turn the rest into text',
      'the review was due on 2026-09-01 (next-review): review the document, then update reviewed and next-review',
    ]);
    expect(lint(md, '2026-08-31').hints).toHaveLength(1);
  });

  it('hints at timelines too long for a slide and lists releases and parts in the outline', async () => {
    const { lint } = await import('../src/libka.ts');
    const items = Array.from({ length: 7 }, (_, i) => `- **${2020 + i}** Step ${i + 1}`).join('\n');
    const r = lint(`---\ntitle: T\n---\n\n:::section[Part 1]\n:::\n\n:::timeline[History]\n${items}\n:::\n\n::::release[v1.0.0]{date=2026-10-01}\n:::added\n- x\n:::\n::::\n`);
    expect(r.problems).toEqual([]);
    expect(r.hints).toEqual(['timeline "History" has 7 items; a slide shows about 6 side by side: split it into two timelines or use a :::table']);
    expect(r.outline).toEqual([{ level: 2, text: 'Part 1' }, { level: 2, text: 'v1.0.0' }]);
  });

  it('hints at an accordion answer taller than a slide and at an agenda too long for one slide', async () => {
    const { lint } = await import('../src/libka.ts');
    // as in a real FAQ that failed: a paragraph and a seven-item list, few words but many lines
    const list = Array.from({ length: 7 }, (_, i) => `- Resource ${i + 1}`).join('\n');
    const para = 'If you are new to this role, start with the standards and the roles of everyone involved, then read the links below in order. '.repeat(2);
    const faq = lint(`---\ntitle: T\n---\n\n## FAQ\n\n::::accordion\n:::item[Where do I start?]\n${para}\n\n${list}\n:::\n:::item[Short?]\nYes.\n:::\n::::\n`);
    expect(faq.hints).toEqual(['accordion item "Where do I start?" is taller than a slide (about 12 lines; a slide holds about 11): on slides the build opens it and continues the answer on a new slide; nothing to change, and the web page and the PDF keep it folded']);
    const sections = Array.from({ length: 11 }, (_, i) => `## Topic ${i + 1}\n\nText.\n`).join('\n');
    expect(lint(`---\ntitle: T\n---\n\n:::toc\n:::\n\n${sections}`).hints).toEqual(['the contents list 11 sections and parts; an agenda slide holds about 10: the build continues it on a second slide; nothing to change']);
    expect(lint(`---\ntitle: T\n---\n\n${sections}`).hints).toEqual([]);   // no placed contents, no agenda slide
  });

  it('counts comparison rows and generated mark words when it estimates slide fit', async () => {
    const { lint } = await import('../src/libka.ts');
    // measured: this slide overflows by 4px with the sentence and fits without it
    const table = ':::comparison[Atlas plans]{highlight=Growth}\n| Feature | Basic | Growth | Scale |\n|---|---|---|---|\n| Price per user | €9 | €19 | €39 |\n| Contacts | yes | yes | yes |\n| Pipelines | yes | yes | yes |\n| AI meeting notes | no | partial (50 per month) | yes |\n| Custom dashboards | no | yes | yes |\n| Single sign-on (SSO) | no | no | yes |\n:::';
    const md = (extra: string) => `---\ntitle: T\n---\n\n## Which plan fits you?\n\n${table}\n\n${extra}\n`;
    expect(lint(md('Most teams pick Growth, which includes 50 AI meeting notes per month.')).hints).toEqual([expect.stringMatching(/^slide 2 \("Which plan fits you\?"\) has about 1\d\d words/)]);
    expect(lint(md('')).hints).toEqual([]);
  });
});

describe.skipIf(!chrome)('diagrams', () => {
  it('draws Mermaid at build time as a clean, accessible SVG that passes Guard on the page and the slides', async () => {
    const md = '---\ntitle: Diagrams\n---\n\n## Flow\n\n```mermaid\nflowchart LR\n  accTitle: Build flow\n  accDescr: Markdown goes to Guard; failures go back.\n  A[Markdown] --> B{Guard}\n  B -.->|fails| A\n```\n\n## Messages\n\n```mermaid\nsequenceDiagram\n  accTitle: Request\n  accDescr: The client asks and the server answers.\n  C->>S: build\n  S-->>C: report\n```\n'
      // a tall top-down diagram under a sentence: it takes the space left on its slide instead of overflowing
      + '\n## Payment\n\nThe checkout calls our API, which asks the fraud check before it charges the card.\n\n```mermaid\nflowchart TD\n  accTitle: Payment flow\n  accDescr: Checkout, API, fraud check, then charge and store, or decline.\n  A[Checkout] --> B[API] --> C{Fraud ok?}\n  C -->|yes| D[Charge] --> E[Store]\n  C -->|no| F[Decline]\n```\n';
    mkdirSync(dir, { recursive: true });   // an earlier block's cleanup may have removed it
    const src = join(dir, 'diagrams.md');
    writeFileSync(src, md);
    const r = await build(src, { out: join(dir, 'diagrams'), outputs: ['web', 'deck'] });
    expect(r.problems).toEqual([]);
    expect(r.report!.passed && r.deck!.report!.passed).toBe(true);
    const html = readFileSync(r.html!, 'utf8');
    const svg = html.match(/<svg [^>]*class="lk-diagram-svg[^"]*"[\s\S]*?<\/svg>/)![0];
    expect(svg).toMatch(/role="img"/);
    expect(svg).toMatch(/<title id="[^"]+">Build flow<\/title><desc id="[^"]+">Markdown goes to Guard; failures go back\.<\/desc>/);
    expect(svg).not.toMatch(/<style|\sstyle="|fill="#|stroke="#/);
    expect(svg).toMatch(/stroke-dasharray="[1-9]/);   // the dotted "fails" line keeps its dashes
    expect(svg).toMatch(/text-anchor="middle"/);
  }, 120000);

  it('reports a diagram that Mermaid cannot read, without writing any output', async () => {
    mkdirSync(dir, { recursive: true });
    const src = join(dir, 'broken.md');
    writeFileSync(src, '---\ntitle: Broken\n---\n\n```mermaid\nflowchart LR\n  accTitle: Broken\n  accDescr: Not valid.\n  A --> --> B\n```\n');
    const r = await build(src, { out: join(dir, 'broken'), outputs: ['web'] });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.stringMatching(/broken\.md: diagram "Broken" could not be drawn: Parse error on line \d/)]);
    expect(existsSync(join(dir, 'broken', 'broken.html'))).toBe(false);
  }, 60000);
});

describe.skipIf(!chrome)('slides that would overflow', () => {
  it('shrinks a little overflow and continues long steps and tables on new slides, so Guard passes', async () => {
    mkdirSync(dir, { recursive: true });
    const steps = Array.from({ length: 14 }, (_, i) => `${i + 1}. **Step ${i + 1}** Do the thing number ${i + 1} and check that it worked.`).join('\n');
    const rows = Array.from({ length: 22 }, (_, i) => `| 1.${i} | ${2000 + i} |`).join('\n');
    const src = join(dir, 'long.md');
    writeFileSync(src, `---\ntitle: Long\n---\n\n## Install\n\n:::steps\n${steps}\n:::\n\n## Versions\n\n:::table{caption="Versions"}\n| Version | Year |\n|---|---|\n${rows}\n:::\n`);
    const r = await build(src, { out: join(dir, 'long'), outputs: ['web', 'deck'] });
    expect(r.problems).toEqual([]);
    const deck = readFileSync(r.deck!.html, 'utf8');
    expect(deck.match(/data-title="Install \(continued\)"/g)!.length).toBeGreaterThanOrEqual(1);
    expect(deck.match(/data-title="Versions \(continued\)"/g)!.length).toBeGreaterThanOrEqual(1);
    expect(deck).toMatch(/<ol class="lk-block lk-flow" start="\d+">/);   // the second part keeps counting
    expect(readFileSync(r.html!, 'utf8')).not.toMatch(/\(continued\)/);   // the web page is unchanged
  }, 120000);

  it('gives a footnote marker right after a link a 24px target, so it passes WCAG 2.5.8', async () => {
    mkdirSync(dir, { recursive: true });
    const src = join(dir, 'fn.md');
    writeFileSync(src, '---\ntitle: Tools\n---\n\n## Tools\n\n:::dl[Renaming tools]\n- **All systems** [PSRenamer](https://example.org/psrenamer)[^ps]\n:::\n\n[^ps]: It runs on macOS, Windows and Linux.\n');
    const r = await build(src, { out: join(dir, 'fn'), outputs: ['web', 'deck'] });
    expect(r.problems).toEqual([]);
  }, 120000);
});

describe.skipIf(!chrome)('a real 27-page manual', () => {
  it('builds web page, PDF and slides with zero Guard findings', async () => {
    const gate = await build(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples', 'open-source-guide', 'guide.md'), { out: join(dir, 'gate'), outputs: ['web', 'deck'] });
    expect(gate.problems).toEqual([]);
    expect(gate.report!.passed && gate.deck!.report!.passed).toBe(true);
    // performance budgets: a web page under 250 KB before images
    expect(statSync(gate.html!).size).toBeLessThan(250 * 1024);
    expect(statSync(gate.deck!.html).size).toBeLessThan(250 * 1024);
  }, 180000);

  it('prints and repairs its PDF within the time budget, and builds the same bytes twice', async () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples', 'open-source-guide', 'guide.md');
    const first = await build(src, { out: join(dir, 'gate-a'), outputs: ['web', 'pdf', 'docx'] });
    expect(first.problems).toEqual([]);
    // 0.14 s a page measured on a developer machine (about 7 s for 50 pages, under the 10 s target); the test
    // allows 0.3 s a page for slower CI machines and catches regressions
    const browser = await launchBrowser();
    const start = Date.now();
    const repaired = await printPdf(first.html!, join(dir, 'timed.pdf'), browser);
    const ms = Date.now() - start;
    await browser.close();
    const pages = (await PDFDocument.load(readFileSync(join(dir, 'timed.pdf')))).getPageCount();
    expect(pages).toBeGreaterThanOrEqual(25);
    expect(ms / pages).toBeLessThan(300);
    expect(repaired.linksDescribed).toBeGreaterThan(0);
    // determinism: the same source and versions give byte-identical outputs, PDF, Word file and manifest included
    const second = await build(src, { out: join(dir, 'gate-b'), outputs: ['web', 'pdf', 'docx'] });
    for (const f of [first.html!, first.pdf!, first.docx!, first.manifest!]) {
      expect(readFileSync(f).equals(readFileSync(f.replace('gate-a', 'gate-b'))), f).toBe(true);
    }
    expect(second.ok).toBe(true);
  }, 300000);
});
