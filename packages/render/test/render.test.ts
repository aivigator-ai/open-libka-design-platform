import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '@libka/model';
import { renderManual, safeHref, type ManualStyles } from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const styles: ManualStyles = {
  tokens: read('libka-tokens.css'),
  bridge: read('lk-bridge.css'),
  components: read('packages/render/src/components.css'),
  manual: read('packages/render/src/manual.css'),
};

const SOURCE = `---
title: "Upgrading <the> planner"
subtitle: Operator guide
version: "2.1"
---

## Before you start

:::callout[Back up first]{variant=warning}
Export your schedule. See [the docs](https://example.org/docs) and [bad](javascript:alert(1)).
:::

:::steps
1. **Open settings** Choose *Data* then *Export*.
2. **Run the installer** Keep the default path.
:::

## Reference

![The export dialog](shots/export.png "Export dialog")

:::table{caption="Supported versions"}
| Version | Until |
|---|---|
| 2.1 | 2027 |
:::

:::checklist
- [x] Backup exported
- [ ] Installer downloaded
:::
`;

const { document, problems } = parse(SOURCE);
const html = renderManual(document, { styles, fontsHref: '../fonts/libka-fonts.css', source: 'guide.md' });
const body = html.slice(html.indexOf('<body>'));
const defined = new Set([...(styles.components + styles.manual).matchAll(/\.(lk-[\w-]+)/g)].map((m) => m[1]));

describe('renderManual', () => {
  it('parses cleanly', () => expect(problems).toEqual([]));

  it('uses only defined lk-* classes', () => {
    const used = new Set([...body.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(' ')).filter((c) => c.startsWith('lk-')));
    expect([...used].filter((c) => !defined.has(c))).toEqual([]);
  });

  it('has no raw colors in markup or in the block, manual and deck styles (tokens only)', () => {
    expect(body).not.toMatch(/#[0-9a-f]{3,6}\b|style=/i);
    expect(styles.manual).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(styles.components).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(read('packages/render/src/deck.css')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('keeps the accessibility structure', () => {
    expect(body).toMatch(/<caption>Supported versions<\/caption>/);
    expect(body).not.toMatch(/<th\b(?![^>]*scope=)/);
    expect('<table><th>x</th></table>').toMatch(/<th\b(?![^>]*scope=)/); // the check itself can fail
    expect(body).toMatch(/<img src="shots\/export.png" alt="The export dialog"/);
    expect(body).toMatch(/<figcaption>Export dialog<\/figcaption>/);
    expect(body).toMatch(/class="lk-skip" href="#content"/);
    expect(body).toMatch(/<span class="lk-visually-hidden">Done: <\/span>Backup exported/);
  });

  it('escapes text and drops unsafe links', () => {
    expect(html).toMatch(/<title>Upgrading &lt;the&gt; planner<\/title>/);
    expect(body).toMatch(/<a href="https:\/\/example.org\/docs">the docs<\/a>/);
    expect(body).not.toMatch(/javascript:/);
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('shots/a.png')).toBe('shots/a.png');
  });

  it('reads a link as a browser does, so a hidden script link is still refused', () => {
    // a browser drops tabs and line breaks anywhere, and control characters and spaces at either end
    for (const sneaky of ['java\tscript:alert(1)', 'java\nscript:alert(1)', 'jav\r\nascript:alert(1)', '\u0001javascript:alert(1)',
      ' \u0000\u001fjavascript:alert(1)', 'JaVa\tScRiPt:alert(1)', '\tdata:text/html,x', 'vb\tscript:x']) {
      expect(safeHref(sneaky), JSON.stringify(sneaky)).toBeNull();
    }
    expect(safeHref(' https://example.org/a b ')).toBe('https://example.org/a b');
    expect(safeHref('https://exa\tmple.org/')).toBe('https://example.org/');
    expect(safeHref('\u0001page.html')).toBe('page.html');
  });

  it('builds a table of contents from the sections', () => {
    expect(body).toMatch(/<nav class="lk-manual-toc"[\s\S]*href="#before-you-start"[\s\S]*href="#reference"/);
  });

  it('includes the light tokens and the high-contrast palette for the OS preference', () => {
    expect(html).toMatch(/--lk-text-accent: #056F7D;/);
    expect(html).toMatch(/@media \(prefers-contrast: more\) \{\n {2}:root \{\n[\s\S]*--lk-text-accent: #004A54;/);
    expect(html).not.toMatch(/\[data-theme="dark"\]/);
  });
});

describe('a page in a site', () => {
  const doc = parse('---\ntitle: The platform\nlang: en\n---\n\n## What it is\n\nText.\n\n## Who it is for\n\nText.\n').document;
  const frame = {
    header: '<div class="site-header"><a href="/">LibKa</a></div>', footer: '<div class="site-footer">Legal</div>',
    head: '<link rel="alternate" hreflang="cs" href="/cs/platform/">', css: '.site-header { color: var(--lk-text-primary); }',
    script: 'void 0;', frames: ["'self'"],
  };

  it('places the site header after the skip link and the footer after the document, with their styles and script allowed', () => {
    const html = renderManual(doc, { styles, frame });
    expect(html).toMatch(/<a class="lk-skip" href="#content">[^<]+<\/a>\n<div class="site-header">[\s\S]*<\/div>\n<div class="lk-manual">/);
    expect(html).toMatch(/<\/footer>\n<\/div>\n<div class="site-footer">Legal<\/div>\n<script>/);
    expect(html).toMatch(/<title>The platform<\/title>\n<link rel="alternate" hreflang="cs" href="\/cs\/platform\/">/);
    expect(html).toMatch(/\.site-header \{ color: var\(--lk-text-primary\); \}\n<\/style>/);
    expect(html).toMatch(/<script>\nvoid 0;\n<\/script>\n<\/body>/);
    expect(html).toMatch(/frame-src 'self' https:\/\/www\.youtube-nocookie\.com/);
    // the site's script is allowed by its hash, like the runtime
    expect(html).toContain(`'sha256-${createHash('sha256').update('\nvoid 0;\n', 'utf8').digest('base64')}'`);
  });

  it('keeps the automatic contents unless the site turns them off', () => {
    expect(renderManual(doc, { styles, frame })).toContain('class="lk-manual-toc"');
    expect(renderManual(doc, { styles, frame: { ...frame, contents: false } })).not.toContain('class="lk-manual-toc"');
  });

  it('follows the reader\'s dark preference only when the site asks, high contrast included', () => {
    expect(renderManual(doc, { styles, frame })).not.toContain('prefers-color-scheme');
    const html = renderManual(doc, { styles, frame: { ...frame, dark: true } });
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\) \{\n {2}:root \{\n[\s\S]*--lk-bg-canvas: #/);
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\) and \(prefers-contrast: more\) \{/);
    expect(html).not.toMatch(/\[data-theme="dark"\]/);
  });
});
