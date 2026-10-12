import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright-core';
import { linkTexts, markArtifacts, remediate } from '../src/index.ts';
import { findVeraPdf, validatePdfs } from '../src/verapdf.ts';

describe('artifacts in content streams', () => {
  it('wraps drawing outside marked content, and leaves tagged content alone', () => {
    const src = '0 0 1 rg 0 0 100 100 re f\n/P <</MCID 0>> BDC BT /F1 12 Tf (Hi) Tj ET EMC\nq 1 0 0 1 5 5 cm /Im0 Do Q';
    const { content, count } = markArtifacts(src);
    expect(count).toBe(2);
    expect(content).toBe('0 0 1 rg /Artifact BMC\n0 0 100 100 re f\nEMC\n/P <</MCID 0>> BDC BT /F1 12 Tf (Hi) Tj ET EMC\nq 1 0 0 1 5 5 cm /Artifact BMC\n/Im0 Do\nEMC Q');
  });

  it('reads strings with parentheses, escapes and operator-like words, and inline images, without breaking them', () => {
    const src = 'BT (a \\) re f ( nested ) Do) Tj ET\nBI /W 1 /H 1 ID \x00EI\x01 EI\n/Span <</MCID 1>> BDC 0 0 m 1 1 l S EMC';
    const { content, count } = markArtifacts(src);
    expect(count).toBe(2);
    expect(content).toContain('/Artifact BMC\nBT (a \\) re f ( nested ) Do) Tj ET\nEMC');
    expect(content).toContain('/Artifact BMC\nBI /W 1 /H 1 ID \x00EI\x01 EI\nEMC');
    expect(content.endsWith('/Span <</MCID 1>> BDC 0 0 m 1 1 l S EMC')).toBe(true);
  });

  it('takes link texts from a page, by address', () => {
    const map = linkTexts('<a href="https://example.org/a?x=1&amp;y=2">The <strong>guide</strong></a> <a class="x" href="#setup">Set&nbsp;up</a> <a href="#setup">again</a>');
    expect([...map]).toEqual([['https://example.org/a?x=1&y=2', 'The guide'], ['#setup', 'Set up']]);
  });
});

const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
  .find((p) => p && existsSync(p));
const vera = findVeraPdf();

// check.py and CI require veraPDF: there the end-to-end test must run, not be skipped
it.runIf(process.env.LIBKA_REQUIRE_VERAPDF === '1')('finds veraPDF where the admin manual installs it', () => {
  expect(vera, 'veraPDF not found: see docs/admin/verapdf.md').not.toBeNull();
});

describe.skipIf(!chrome || !vera)('PDF/UA-1 end to end (Chrome + veraPDF)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'libka-pdf-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('turns a Chrome PDF that fails PDF/UA-1 into one that passes, keeping its tags', async () => {
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Repair test</title><style>body{font:16px sans-serif;background:#fff}.box{border:2px solid #333;padding:8px}</style></head>'
      + '<body><main><h1>Repair test</h1><p>Some <em>emphasis</em> and <strong>strong</strong> text with <a href="https://example.org/">a link</a>.</p>'
      + '<ul><li><a href="#more">More</a></li><li><strong>Bold</strong> item</li></ul><ol><li><p>First paragraph.</p><p>Second paragraph.</p></li></ol><figure><svg role="img" aria-label="A square" width="40" height="40"><rect width="40" height="40"/></svg><figcaption>A square</figcaption></figure>'
      + '<div class="box"><h2 id="more">More</h2><p>Boxed text.</p></div></main></body></html>';
    const htmlPath = join(dir, 'test.html');
    writeFileSync(htmlPath, html);
    const browser = await chromium.launch({ executablePath: chrome! });
    const page = await browser.newPage();
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`);
    const printed = await page.pdf({ tagged: true, outline: true, printBackground: true });
    await browser.close();
    const before = join(dir, 'before.pdf');
    writeFileSync(before, printed);
    const { pdf, report } = await remediate(printed, { title: 'Repair test', lang: 'en', links: linkTexts(html) });
    const after = join(dir, 'after.pdf');
    writeFileSync(after, pdf);
    const [r0, r1] = validatePdfs([before, after], 'ua1', vera)!;
    expect(r0!.compliant).toBe(false);
    expect(r1!.failures).toEqual([]);
    expect(r1!.compliant).toBe(true);
    expect(report.roleMapped).toEqual(['Em', 'Strong']);
    expect(report.linksDescribed).toBeGreaterThanOrEqual(2);
    expect(report.artifacts).toBeGreaterThan(0);
    expect(readFileSync(after).length).toBeGreaterThan(1000);
  }, 120000);
});
