import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from '@libka/cli/src/libka.ts';
import { serveStatic, type Served } from '@libka/cli/src/serve.ts';
import { guardHtml, guardPage, launchBrowser, type GuardReport } from '@libka/guard';
import { checkDocx } from '@libka/guard/docx';
import { strFromU8, unzipSync } from 'fflate';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const out = mkdtempSync(join(tmpdir(), 'libka-studio-test-'));

const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

interface StudioCheck { target: string; id: string; mode: string; checked: number; violations: unknown[] }
interface Hook { source: string; checks: StudioCheck[] | null; problems: unknown[]; project: { id: string; name: string } | null; files: string[]; selection: string }
let browser: Browser;
let served: Served;

async function open(width = 1440, contrast: 'no-preference' | 'more' = 'no-preference', context?: BrowserContext): Promise<Page> {
  const ctx = context ?? await browser.newContext({ viewport: { width, height: 900 }, contrast, acceptDownloads: true });
  // these tests drive the source editor: new documents (the example on the first start) open in Source here;
  // visual mode has its own tests (visual.test.ts)
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('libka-studio:editor')) localStorage.setItem('libka-studio:editor', JSON.stringify({ defaultMode: 'source' }));
    // the first-visit tour has its own tests (onboarding.test.ts)
    localStorage.setItem('libka-studio:toured', '1');
  });
  const page = await ctx.newPage();
  await page.goto(served.url);
  await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
  return page;
}
const hook = (page: Page) => page.evaluate(() => {
  const h = (window as unknown as { libkaStudio: Hook }).libkaStudio;
  return { source: h.source, checks: h.checks, problems: h.problems, project: h.project, files: h.files, selection: h.selection };
});
/** Types at the end of the source. */
async function append(page: Page, text: string): Promise<void> {
  await page.click('.cm-content');
  await page.keyboard.press('Control+End');
  // a leading line break is typed as Enter (inserted text that starts with one loses it in the editor)
  if (text.startsWith('\n')) await page.keyboard.press('Enter');
  await page.keyboard.insertText(text.replace(/^\n/, ''));
}
const saved = (page: Page) => page.waitForFunction(() => document.querySelector('#save-state')?.getAttribute('data-state') === 'saved');
/** Guard's findings, except CodeMirror's own geometry (style attributes inside the editor, which the Studio does not write). */
const findings = (report: GuardReport) => report.checks.flatMap((c) => c.violations).filter((v) => !(v.rule === 'no-inline-style' && /\.cm-/.test(v.target)));

describe.skipIf(!chrome)('LibKa Studio', () => {
  beforeAll(async () => {
    served = await serveStatic(join(here, '..', 'dist'));
    browser = await launchBrowser();
  }, 180000);
  afterAll(async () => {
    await browser?.close();
    await served?.close();
    rmSync(out, { recursive: true, force: true });
  });

  it('passes Guard itself: axe, contrast in both modes, structure (the editor\'s geometry aside)', async () => {
    const report = await guardHtml(served.url, browser);
    expect(findings(report)).toEqual([]);
    // the exemption covers CodeMirror's elements only
    expect(report.checks.flatMap((c) => c.violations).filter((v) => v.rule === 'no-inline-style').every((v) => /\.cm-/.test(v.target))).toBe(true);
  }, 90000);

  it('runs the same Guard rules in the browser as the CLI on the manual, the deck and the Word file, with the same counts', async () => {
    const page = await open();
    // the example asks for web, pdf, deck and docx; the Studio checks all but the PDF (veraPDF needs Java)
    const cli = await build(join(root, 'examples', 'manual', 'guide.md'), { out, outputs: ['web', 'deck', 'docx'] });
    expect(cli.ok).toBe(true);
    const inBrowser = (await hook(page)).checks!;
    const expected = [...cli.report!.checks.filter((c) => c.id !== 'docx').map((c) => ({ ...c, target: 'manual' })),
      ...cli.deck!.report!.checks.map((c) => ({ ...c, target: 'deck' })), ...cli.report!.checks.filter((c) => c.id === 'docx').map((c) => ({ ...c, target: 'docx' }))];
    // one difference by design: the CLI also checks that nothing was blocked by the page's Content Security
    // Policy, which the Studio's preview removes so it can run its checks
    expect(inBrowser.map((c) => [c.target, c.id, c.mode, c.checked, c.violations.length]))
      .toEqual(expected.map((c) => [c.target, c.id, c.mode, c.id === 'structure' ? c.checked - 1 : c.checked, c.violations.length]));
    expect(await page.textContent('#status-text')).toBe('Ready to publish');
    await page.context().close();
  }, 90000);

  it('shows a source problem on its line, marks the line and jumps there', async () => {
    const page = await open();
    const lines = (await hook(page)).source.split('\n').length;
    await append(page, '\n:::table\n| a |\n|---|\n| 1 |\n:::\n');
    await page.waitForFunction(() => document.querySelector('#count-problems')!.textContent === '1');
    expect(await page.textContent('#tp-problems')).toContain(`Line ${lines + 1}`);
    expect(await page.locator('.cm-lint-marker-error').count()).toBe(1);
    expect(await page.textContent('#status-text')).toMatch(/to fix/);
    await page.keyboard.press('Control+Home');
    await page.click('#tp-problems .st-item');
    expect((await hook(page)).selection).toBe(':::table');
    await page.context().close();
  }, 60000);

  it('switches language, theme and contrast, and remembers only what the user chose', async () => {
    const page = await open(1440, 'more');
    // the system asks for more contrast: the Studio and the preview follow, without storing it
    expect(await page.getAttribute('html', 'data-contrast')).toBe('high');
    expect(await page.isVisible('#hc-note')).toBe(true);
    expect(await page.evaluate(() => (document.querySelector('#preview') as HTMLIFrameElement).srcdoc.includes('@media all'))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('libka-studio:contrast'))).toBeNull();

    await page.click('[data-lang="cs"]');
    expect(await page.getAttribute('html', 'lang')).toBe('cs');
    expect(await page.textContent('#tab-problems')).toContain('Problémy');
    expect(await page.getAttribute('.cm-content', 'aria-label')).toBe('Zdroj dokumentu (Markdown)');
    await page.click('#theme-toggle');
    expect(await page.getAttribute('html', 'data-theme')).toBe('dark');
    await page.reload();
    await page.waitForSelector('html[data-guard="done"]');
    expect(await page.getAttribute('html', 'lang')).toBe('cs');
    expect(await page.getAttribute('html', 'data-theme')).toBe('dark');
    await page.context().close();
  }, 60000);

  it('fits slides as the build does, and takes a slide that still does not fit straight to it', async () => {
    const page = await open();
    await page.click('[data-device="slides"]');
    await page.waitForFunction(() => Boolean((document.querySelector('#preview') as HTMLIFrameElement).contentWindow?.document.querySelector('.lk-deck')));
    // a long section of paragraphs is continued on a new slide, as in the build
    const paragraphs = Array.from({ length: 14 }, (_, i) => `Paragraph ${i + 1} with enough words to take a full line on the slide.`);
    await append(page, `\n## A very long section\n\n${paragraphs.join('\n\n')}\n`);
    await page.waitForFunction(() => Boolean((document.querySelector('#preview') as HTMLIFrameElement).contentWindow?.document
      .querySelector('[data-title="A very long section (continued)"]')), undefined, { timeout: 30000 });
    // a code block cannot be split: Guard reports the slide it overflows
    const code = Array.from({ length: 40 }, (_, i) => `step_${i + 1}()`).join('\n');
    await page.keyboard.insertText(`\n## A very long listing\n\n\`\`\`python\n${code}\n\`\`\`\n`);
    await page.waitForFunction(() => document.querySelector('#count-guard')!.textContent === '1', undefined, { timeout: 30000 });
    await page.click('#tab-guard');
    expect(await page.textContent('#tp-guard')).toMatch(/slide-overflow.*A very long listing/);
    await page.click('#tp-guard .st-item');
    // the deck goes to the slide Guard named (by its title: which slide number it is depends on the fonts); wait for it
    // rather than for a fixed time (a slow runner takes longer)
    await page.waitForFunction(() => {
      const win = (document.querySelector('#preview') as HTMLIFrameElement).contentWindow as unknown as Window & { libkaDeck?: { current: number } };
      const deck = win?.libkaDeck;
      return Boolean(deck && win.document.querySelector(`#slide-${deck.current + 1}`)?.getAttribute('data-title') === 'A very long listing');
    }, undefined, { timeout: 15000 });
    await page.context().close();
  }, 90000);

  it('toggles the outputs in the front matter and checks only what the document asks for', async () => {
    const page = await open();
    await page.click('#file-menu summary');
    expect(await page.$$eval('#outputs input', (boxes) => boxes.map((b) => `${(b as HTMLInputElement).value}=${(b as HTMLInputElement).checked}`)))
      .toEqual(['web=true', 'pdf=true', 'deck=true', 'docx=true']);
    // without the web page there is no PDF and no Word file: they are made from it
    await page.click('#outputs input[value="web"]');
    expect((await hook(page)).source).toMatch(/\noutputs: \[deck\]\n---/);
    await page.waitForFunction(() => {
      const s = (window as unknown as { libkaStudio: Hook }).libkaStudio;
      return document.documentElement.dataset.guard === 'done' && s.checks?.every((c) => c.target === 'deck');
    }, undefined, { timeout: 30000 });
    // asking for the Word file brings the web page back
    await page.click('#outputs input[value="docx"]');
    expect((await hook(page)).source).toMatch(/\noutputs: \[web, deck, docx\]\n---/);
    // the change is one step of the editor's undo
    await page.click('.cm-content');
    await page.keyboard.press('Control+z');
    expect((await hook(page)).source).toMatch(/\noutputs: \[deck\]\n---/);
    await page.context().close();
  }, 60000);

  it('downloads a Word file with the figure drawn, which passes the Word checks', async () => {
    const page = await open();
    await page.click('#file-menu summary');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-command="export.docx"]')]);
    expect(download.suggestedFilename()).toBe('guide.docx');
    const file = join(out, 'studio.docx');
    await download.saveAs(file);
    const docx = readFileSync(file);
    expect(checkDocx(docx).violations).toEqual([]);
    expect(Object.keys(unzipSync(docx)).filter((k) => /^word\/media\/.+\.png$/.test(k))).toHaveLength(1);
    await page.context().close();
  }, 60000);

  it('fits a phone screen without sideways scrolling', async () => {
    const page = await open(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.click('button[data-pane="preview"]');
    expect(await page.isVisible('#preview')).toBe(true);
    expect(await page.isVisible('.cm-content')).toBe(false);
    await page.click('#library-toggle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.context().close();
  }, 60000);

  it('keeps projects in the browser: the text survives a reload, the library lists every document, and each opens with its own text', async () => {
    const page = await open();
    const first = (await hook(page)).project!;
    await append(page, '\nA sentence that must survive a reload.\n');
    await saved(page);
    await page.reload();
    await page.waitForSelector('html[data-guard="done"]');
    expect((await hook(page)).source).toContain('A sentence that must survive a reload.');
    expect((await hook(page)).project!.id).toBe(first.id);

    await page.click('#library-toggle');
    await page.click('.st-library-actions [data-command="project.new"]');
    await page.waitForFunction((id) => (window as unknown as { libkaStudio: Hook }).libkaStudio.project?.id !== id, first.id);
    expect((await hook(page)).source).toContain('title: Untitled document');
    await page.click('#library-toggle');
    expect(await page.locator('.st-card').count()).toBe(2);
    expect(await page.locator('.st-card[data-current="true"] .st-card-file').textContent()).toBe('untitled.md');
    // Guard on the library view, as the author sees it
    expect(findings(await guardPage(page))).toEqual([]);
    await page.click('.st-card:has-text("guide.md") .st-card-open');
    await page.waitForFunction((id) => (window as unknown as { libkaStudio: Hook }).libkaStudio.project?.id === id, first.id);
    expect((await hook(page)).source).toContain('A sentence that must survive a reload.');
    await page.context().close();
  }, 90000);

  it('keeps pasted images with the project, puts a figure in the text, and previews them after a reload', async () => {
    const page = await open();
    await page.click('.cm-content');
    await page.keyboard.press('Control+End');
    await page.evaluate(() => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#000"/></svg>';
      const dt = new DataTransfer();
      dt.items.add(new File([svg], 'Screen shot 1.svg', { type: 'image/svg+xml' }));
      document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => (window as unknown as { libkaStudio: Hook }).libkaStudio.source.includes('![](images/Screen-shot-1.svg "")'));
    await saved(page);
    await page.reload();
    await page.waitForSelector('html[data-guard="done"]');
    expect((await hook(page)).files).toContain('images/Screen-shot-1.svg');
    // pictures load as the reader scrolls to them (loading="lazy"): scroll the last one, the pasted image, into view
    await page.waitForFunction(() => {
      const images = Array.from((document.querySelector('#preview') as HTMLIFrameElement).contentDocument?.images ?? []);
      images.at(-1)?.scrollIntoView();
      return images.some((i) => i.src.startsWith('blob:') && i.naturalWidth === 40);
    }, undefined, { timeout: 10000 });
    await page.context().close();
  }, 60000);

  it('keeps versions: names one, compares it with the text, restores it as a new version, and undo takes the restore back', async () => {
    const page = await open();
    await page.click('#tab-history');
    await page.click('#save-version');
    await page.fill('.st-dialog input', 'Before the new section');
    await page.click('.st-dialog button[type="submit"]');
    await page.waitForSelector('.st-version[data-kind="named"]');
    await append(page, '\n## A new section\n\nWritten after the version.\n');
    await saved(page);

    await page.click('.st-version[data-kind="named"] button:has-text("Compare")');
    await page.waitForSelector('.st-dialog--compare[open]');
    expect(await page.textContent('.st-compare-sum')).toMatch(/added and 0 removed/);
    expect(await page.textContent('.st-diff')).toContain('Written after the version.');
    // Guard on the comparison dialog
    expect(findings(await guardPage(page))).toEqual([]);
    await page.click('.st-dialog button:has-text("Restore this version")');
    await page.waitForFunction(() => !(window as unknown as { libkaStudio: Hook }).libkaStudio.source.includes('Written after the version.'));
    await page.waitForSelector('.st-version:has-text("Restored from")');
    // the text before the restore is kept: as "Before a restore", or in an automatic version that already holds it
    // (a version identical to the newest one is not recorded twice)
    const kept = await page.$$eval('.st-version', (items) => items.map((i) => i.querySelector('.st-version-name')!.textContent!));
    expect(kept[0]).toMatch(/^Restored from/);
    expect(kept[1]).toMatch(/^(Before a restore|Automatic)$/);
    expect(findings(await guardPage(page))).toEqual([]);   // the history tab
    await page.click('.cm-content');
    await page.keyboard.press('Control+z');
    expect((await hook(page)).source).toContain('Written after the version.');
    await page.context().close();
  }, 90000);

  it('downloads a project as .zip and imports it back as a new project with its images', async () => {
    const page = await open();
    await page.click('#library-toggle');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('.st-card button:has-text("Download .zip")')]);
    expect(download.suggestedFilename()).toBe('guide.zip');
    const file = join(out, 'guide.zip');
    await download.saveAs(file);
    const entries = unzipSync(readFileSync(file));
    expect(Object.keys(entries).sort()).toEqual(['guide.md', 'images/pipeline.svg']);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.st-library-actions [data-command="project.import"]')]);
    await chooser.setFiles(file);
    await page.waitForFunction(() => (window as unknown as { libkaStudio: Hook }).libkaStudio.project?.name === 'guide.md' && document.querySelectorAll('.st-card').length !== 1);
    const h = await hook(page);
    expect(h.source).toBe(strFromU8(entries['guide.md']!));
    expect(h.files).toEqual(['images/pipeline.svg']);
    await page.context().close();
  }, 60000);

  it('opens a project folder and saves back to it (the origin private file system stands in for a picked folder)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // a folder in the origin private file system, behind a plain object: Chrome crashes when it reads such a handle back
    // from IndexedDB, so only the wrapper's data is stored (a folder the author picks is an ordinary handle)
    await ctx.addInitScript(() => {
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => {
        const real = await (await navigator.storage.getDirectory()).getDirectoryHandle('handbook', { create: true });
        const inner = new WeakMap<object, FileSystemDirectoryHandle>();
        class Folder {
          kind = 'directory';
          name = real.name;
          values() { return inner.get(this)!.values(); }
          getDirectoryHandle(n: string, o?: FileSystemGetDirectoryOptions) { return inner.get(this)!.getDirectoryHandle(n, o); }
          getFileHandle(n: string, o?: FileSystemGetFileOptions) { return inner.get(this)!.getFileHandle(n, o); }
          async isSameEntry(other: unknown) { return other === this; }
        }
        const folder = new Folder();
        inner.set(folder, real);
        return folder;
      };
    });
    const page = await open(1440, 'no-preference', ctx);
    await page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('handbook', { create: true });
      const write = async (d: FileSystemDirectoryHandle, name: string, text: string) => {
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(text);
        await w.close();
      };
      await write(dir, 'handbook.md', '---\ntitle: Team handbook\nlang: en\n---\n\n## Start\n\n![A logo](images/logo.svg "The logo")\n');
      await write(await dir.getDirectoryHandle('images', { create: true }), 'logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    });
    await page.click('#file-menu summary');
    await page.click('[data-command="folder.open"]');
    await page.waitForFunction(() => (window as unknown as { libkaStudio: Hook }).libkaStudio.project?.name === 'handbook.md');
    expect((await hook(page)).files).toEqual(['images/logo.svg']);
    expect(await page.textContent('.st-doc-file')).toContain('folder handbook');
    await append(page, '\nSaved back to the folder.\n');
    await saved(page);
    await page.keyboard.press('Control+s');
    await page.waitForSelector('#toast:has-text("Saved to the folder handbook")');
    const onDisk = await page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('handbook');
      return (await (await dir.getFileHandle('handbook.md')).getFile()).text();
    });
    expect(onDisk).toContain('Saved back to the folder.');
    await ctx.close();
  }, 60000);

  it('starts offline once it has been opened: the service worker serves the whole app', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await open(1440, 'no-preference', ctx);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30000 }).catch(() => undefined);
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
    expect(await page.textContent('#status-text')).toBe('Ready to publish');
    await ctx.close();
  }, 90000);

  it('opens again from its cache on a host that redirects index.html to the folder (as Cloudflare does)', async () => {
    const files = await serveStatic(join(here, '..', 'dist'));
    const { createServer } = await import('node:http');
    const host = createServer(async (req, res) => {
      if (req.url === '/index.html') { res.writeHead(307, { location: '/' }).end(); return; }
      const r = await fetch(new URL(req.url ?? '/', files.url));
      res.writeHead(r.status, Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()));
    });
    await new Promise<void>((done) => host.listen(0, '127.0.0.1', done));
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${(host.address() as { port: number }).port}/`);
      await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30000 });
      // the second visit comes from the cache, whose index.html was answered with a redirect
      await page.reload();
      await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
      expect(await page.textContent('#status-text')).toBe('Ready to publish');
    } finally {
      await ctx.close();
      host.close();
      await files.close();
    }
  }, 120000);

  it('offers a new version of the Studio when one is built, and takes it on Reload', async () => {
    // a copy of the build, so the next one can be made by changing its service worker
    const copy = join(out, 'studio-copy');
    cpSync(join(here, '..', 'dist'), copy, { recursive: true });
    const own = await serveStatic(copy);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await ctx.newPage();
      await page.goto(own.url);
      await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30000 });
      expect(await page.isVisible('.st-update')).toBe(false);
      appendFileSync(join(copy, 'sw.js'), '\n// the next build\n');
      await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
      await page.waitForSelector('.st-update', { timeout: 30000 });
      expect(await page.textContent('.st-update')).toContain('A new version of the Studio is ready.');
      await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.click('.st-update button')]);
      await page.waitForSelector('html[data-guard="done"]', { timeout: 60000 });
      expect(await page.isVisible('.st-update')).toBe(false);
    } finally {
      await ctx.close();
      await own.close();
    }
  }, 120000);

  it('turns the prototype\'s draft into a project once', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('libka-studio:draft', '---\ntitle: My old draft\nlang: en\n---\n\nText from the prototype.\n');
      localStorage.setItem('libka-studio:name', 'old-draft.md');
    });
    const page = await open(1440, 'no-preference', ctx);
    expect((await hook(page)).source).toContain('Text from the prototype.');
    expect(await page.evaluate(() => localStorage.getItem('libka-studio:draft'))).toBeNull();
    await page.reload();
    await page.waitForSelector('html[data-guard="done"]');
    await page.click('#library-toggle');
    expect(await page.locator('.st-card').count()).toBe(1);
    await ctx.close();
  }, 60000);
});
