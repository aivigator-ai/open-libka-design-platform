import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AXE_VERSION, guardHtml, type GuardReport } from '../src/index.ts';
import { buildManifest, embedManifest, readManifest, sha256, stripManifest, verifyHtml, type SigningKey } from '../src/manifest.ts';

const dir = mkdtempSync(join(tmpdir(), 'libka-guard-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const page = (name: string, css: string, body: string) => {
  const path = join(dir, name);
  writeFileSync(path, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name}</title><style>body{margin:0;color:#1A2130;background:#fff;font:16px system-ui}${css}</style></head><body><main>${body}</main></body></html>`);
  return path;
};
const GOOD_BODY = '<h1>Manual</h1><p class="note">Accent text</p><table><caption>Data</caption><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';

const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));
const rules = (r: GuardReport, id: string, mode = 'standard') => r.checks.find((c) => c.id === id && c.mode === mode)!.violations.map((v) => v.rule);

describe.skipIf(!chrome)('guardHtml', () => {
  it('passes a clean page in both modes', async () => {
    const r = await guardHtml(page('good.html', '.note{color:#056F7D}@media (prefers-contrast: more){.note{color:#004A54}}', GOOD_BODY));
    expect(r.checks.map((c) => `${c.id}/${c.mode}:${c.violations.length}`)).toEqual(
      ['axe/standard:0', 'contrast/standard:0', 'structure/standard:0', 'contrast/more-contrast:0']);
    expect(r.passed).toBe(true);
  }, 60000);

  it('fails a broken page with the specific rules', async () => {
    const r = await guardHtml(page('bad.html', '.faint{color:#999}',
      '<h1>Manual</h1><p class="faint">Low contrast</p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><table><tr><th>A</th></tr><tr><td>1</td></tr></table><p style="color:#1A2130">x</p>'));
    expect(r.passed).toBe(false);
    expect(rules(r, 'contrast')).toContain('contrast');
    // text contrast is LibKa's own scan; axe's color-contrast rule is off (AXE_RULES_OFF)
    expect(rules(r, 'axe')).toEqual(expect.arrayContaining(['image-alt']));
    expect(rules(r, 'axe')).not.toContain('color-contrast');
    expect(rules(r, 'structure')).toEqual(expect.arrayContaining(['table-caption', 'table-header-scope', 'no-inline-style']));
  }, 60000);

  it('finds every text that axe\'s own color-contrast rule finds (which is why that rule is off)', async () => {
    const cases = [
      '<p id="grey" style="color:#999">Grey text</p>',
      '<p id="large" style="color:#aaa;font-size:24px">Large pale text</p>',
      '<div style="background:#33aa77"><p id="onfill" style="color:#fff">White on green</p></div>',
      '<p id="alpha" style="color:rgba(0,0,0,.3)">Transparent ink</p>',
      '<div style="opacity:.3"><p id="faded" style="color:#1A2130">Faded block</p></div>',
      '<p><a id="link" href="#x" style="color:#8ab">A pale link</a></p>',
      '<button id="button" type="button" style="color:#bbb;background:#fff;border:1px solid #333">Pale button</button>',
      '<section style="background:#222"><div><div><p id="deep" style="color:#444">Dark on dark, two levels down</p></div></div></section>',
      '<p id="fine" style="color:#595959">Just enough (7:1)</p>',
      '<p id="boldok" style="color:#888;font-size:19px;font-weight:700">Large bold, 3.5:1</p>',
    ].join('');
    const path = page('contrast-cases.html', '', `<h1>Cases</h1>${cases}`);
    const { chromium } = await import('playwright-core');
    const { readFileSync } = await import('node:fs');
    const { createRequire } = await import('node:module');
    const { scanContrast } = await import('../src/scan.ts');
    const browser = await chromium.launch(process.env.LIBKA_BROWSER ? { executablePath: process.env.LIBKA_BROWSER } : { channel: 'chrome' });
    try {
      const p = await browser.newPage();
      await p.goto(`file://${path.replace(/\\/g, '/')}`);
      await p.evaluate(readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8'));
      const byAxe: string[] = await p.evaluate(async () => {
        // @ts-expect-error injected
        const r = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
        return r.violations.flatMap((v: { nodes: { target: string[] }[] }) => v.nodes.map((n) => document.querySelector(n.target[0]!)?.id ?? n.target[0]!));
      });
      const scan = await p.evaluate(scanContrast, { normal: 4.5, large: 3 });
      const byScan = scan.violations.map((v) => /#([\w-]+)/.exec(v.target)?.[1] ?? v.target);
      expect(byAxe.length).toBeGreaterThan(5);
      for (const id of byAxe) expect(byScan, `axe found #${id}, the scan did not`).toContain(id);
      expect(byScan).not.toContain('fine');
      expect(byScan).not.toContain('boldok');
    } finally {
      await browser.close();
    }
  }, 60000);

  it('checks a page under its own Content Security Policy and reports what the policy blocks', async () => {
    const path = join(dir, 'csp.html');
    // the policy allows no script, and the page has one: the page is broken for readers, so Guard says so
    writeFileSync(path, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'"><title>csp</title><style>body{margin:0;color:#1A2130;background:#fff;font:16px system-ui}</style></head><body><main><h1>Manual</h1><p>Text.</p><script>document.title = 'ran';</script></main></body></html>`);
    const r = await guardHtml(path);
    expect(r.passed).toBe(false);
    expect(rules(r, 'structure')).toEqual(['csp-blocked']);
    expect(rules(r, 'axe')).toEqual([]);   // axe still ran: it is injected outside the page's policy
  }, 60000);

  it('reports a deck slide whose content does not fit inside its padding, and only that one', async () => {
    const slide = (id: string, paragraphs: number) => `<section class="lk-deck-frame" id="${id}" data-title="${id}"><div class="lk-slide"><h2>${id}</h2>${'<p>Line of text</p>'.repeat(paragraphs)}</div></section>`;
    const r = await guardHtml(page('deck.html',
      // no deck runtime fits these slides to the screen, so each scrolls in its own box (reflow is tested below)
      '.lk-deck-frame{overflow-x:auto}.lk-slide{width:1280px;height:720px;padding:40px 72px;box-sizing:border-box;overflow:hidden}.lk-slide p{margin:0;font-size:24px;line-height:36px}',
      slide('fits', 10) + slide('too-long', 20)));
    expect(r.checks.find((c) => c.id === 'structure')!.violations).toEqual([
      expect.objectContaining({ rule: 'slide-overflow', target: '#too-long', message: expect.stringMatching(/^slide 2 \("too-long"\) does not fit: \d+px too much/) }),
    ]);
  }, 60000);

  it('reports a page that scrolls sideways at 320 CSS pixels, not a wide box that scrolls on its own (WCAG 1.4.10)', async () => {
    const long = 'https://example.org/a/very/long/address/without/any/place/to/break/the/line';
    const bad = await guardHtml(page('reflow-bad.html', 'code{white-space:nowrap}', `<h1>Reflow</h1><p>Download <code>${long}</code>.</p>`));
    expect(bad.checks.find((c) => c.id === 'structure')!.violations).toEqual([
      expect.objectContaining({ rule: 'reflow', target: 'code', message: expect.stringMatching(/^at 320 CSS pixels wide the page scrolls sideways by \d+px \("https:\/\/example\.org/) }),
    ]);
    expect(bad.passed).toBe(false);
    const good = await guardHtml(page('reflow-good.html', 'code{overflow-wrap:anywhere}.scroll{overflow-x:auto}pre{margin:0}',
      `<h1>Reflow</h1><p>Download <code>${long}</code>.</p><div class="scroll" tabindex="0" role="region" aria-label="Listing"><pre>${'x'.repeat(200)}</pre></div>`));
    expect(rules(good, 'structure')).toEqual([]);
  }, 60000);

  it('reports chart labels cut off at the edge of the drawing', async () => {
    const chart = (id: string, x: number) => `<figure class="lk-chart" id="${id}"><svg class="lk-chart-svg" viewBox="0 0 200 100" width="200" height="100" role="img" aria-label="${id}"><title>${id}</title>`
      + `<text x="${x}" y="50" text-anchor="end" font-size="13">300 members</text></svg><figcaption>${id}</figcaption></figure>`;
    const r = await guardHtml(page('chart.html', '', chart('inside', 100) + chart('clipped', 40)));
    expect(r.checks.find((c) => c.id === 'structure')!.violations).toEqual([
      expect.objectContaining({ rule: 'chart-text-clipped', target: '#clipped', message: 'chart "clipped": 1 label(s) cut off at the edge, such as "300 members"' }),
    ]);
  }, 60000);

  it('holds high contrast to 7:1: AA-only colors fail when more contrast is requested', async () => {
    const r = await guardHtml(page('aa-only.html', '.note{color:#056F7D}', GOOD_BODY));
    expect(rules(r, 'contrast', 'standard')).toEqual([]);
    expect(rules(r, 'contrast', 'more-contrast')).toEqual(['contrast']);
  }, 60000);

  it('measures SVG text by its fill, over the shapes drawn beneath it (diagrams)', async () => {
    const svg = (text: string) => `<svg viewBox="0 0 300 120" width="300" height="120" role="img" aria-label="Diagram"><title>Diagram</title>${text}</svg>`;
    const r = await guardHtml(page('svg.html', '',
      svg('<rect x="0" y="0" width="140" height="60" fill="#1A2130"/><text x="20" y="35" fill="#2A3140">Dark on dark</text>'
        + '<text x="160" y="35" fill="#DDDDDD">Pale on page</text>'
        + '<rect x="0" y="70" width="140" height="40" fill="#FFFFFF"/><text x="20" y="95" fill="#1A2130">Readable</text>')));
    const found = r.checks.find((c) => c.id === 'contrast' && c.mode === 'standard')!.violations.map((v) => v.message);
    expect(found).toEqual([expect.stringMatching(/"Dark on dark"/), expect.stringMatching(/"Pale on page"/)]);
  }, 60000);
});

describe('signed manifest', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKey = (createPublicKey(privateKey).export({ type: 'spki', format: 'der' }) as Buffer).toString('base64');
  const key: SigningKey = { privateKey, publicKey, fingerprint: sha256(Buffer.from(publicKey, 'base64')).slice(0, 16) };
  const report: GuardReport = { passed: true, checks: [{ id: 'axe', mode: 'standard', title: 'axe', checked: 10, skipped: 0, violations: [] }] };
  const html = '<!doctype html><html><head><title>t</title></head><body><p>Hello</p></body></html>';
  const manifest = buildManifest({ sourceName: 'guide.md', source: '# T', tokensVersion: '1.6.0', html, report, axe: AXE_VERSION, key });
  const signed = embedManifest(html, manifest);

  it('round-trips: embedded, readable, verifiable, trusted by fingerprint', () => {
    expect(readManifest(signed)?.outputs.html).toBe(sha256(html));
    expect(stripManifest(signed)).toBe(html);
    expect(verifyHtml(signed, [key.fingerprint])).toMatchObject({ ok: true, trusted: true, problems: [] });
    expect(verifyHtml(signed).trusted).toBe(false);
  });

  it('detects a changed page', () => {
    const v = verifyHtml(signed.replace('Hello', 'Hello!'));
    expect(v.ok).toBe(false);
    expect(v.problems.join()).toMatch(/HTML was changed/);
  });

  it('detects a changed manifest', () => {
    const v = verifyHtml(signed.replace('"tokens":{"version":"1.6.0"}', '"tokens":{"version":"9.9.9"}'));
    expect(v.problems.join()).toMatch(/signature does not match/);
  });

  it('reports a page without a manifest', () => {
    expect(verifyHtml(html).problems).toEqual(['no LibKa manifest in this file']);
  });

  it('never trusts a fingerprint the manifest only claims (a forger signs with their own key)', () => {
    const forger = generateKeyPairSync('ed25519').privateKey;
    const forgerPublic = (createPublicKey(forger).export({ type: 'spki', format: 'der' }) as Buffer).toString('base64');
    // the forger's own key, but the trusted key's fingerprint written next to it; the signature itself is valid
    const forged = embedManifest(html, buildManifest({ sourceName: 'guide.md', source: '# T', tokensVersion: '1.6.0', html, report, axe: AXE_VERSION,
      key: { privateKey: forger, publicKey: forgerPublic, fingerprint: key.fingerprint } }));
    const v = verifyHtml(forged, [key.fingerprint]);
    expect(v.trusted).toBe(false);
    expect(v.ok).toBe(false);
    expect(v.problems.join()).toMatch(/does not belong to the key that signed it/);
    expect(v.fingerprint).toBe(sha256(Buffer.from(forgerPublic, 'base64')).slice(0, 16));
  });
});

describe.skipIf(!chrome)('inactive components', () => {
  it('allow lower contrast only when marked disabled', async () => {
    const r = await guardHtml(page('disabled.html', '.dim{color:#999}', '<h1>UI</h1><button type="button" class="dim" aria-disabled="true">Disabled</button><button type="button" class="dim">Enabled</button>'));
    const v = r.checks.find((c) => c.id === 'contrast' && c.mode === 'standard')!.violations;
    expect(v.map((x) => x.message)).toEqual([expect.stringMatching(/"Enabled"/)]);
  }, 60000);
});
