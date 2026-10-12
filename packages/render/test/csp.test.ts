import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parse } from '@libka/model';
import { policy, sha256Base64, withCsp, withoutCsp } from '../src/csp.ts';
import { renderDeck } from '../src/deck.ts';

const node = (s: string) => createHash('sha256').update(s, 'utf8').digest('base64');

describe('Content Security Policy', () => {
  it('hashes exactly like Node (empty, multi-block and non-ASCII text)', () => {
    for (const s of ['', 'abc', 'x'.repeat(1000), 'Příliš žluťoučký kůň „úpěl“ ✓ 🙂', 'a\nb\r\nc']) expect(sha256Base64(s)).toBe(node(s));
  });

  it('allows only the page\'s own inline scripts and styles, its own files and the two video hosts', () => {
    const p = policy(['run()'], ['body{}']);
    expect(p).toContain(`script-src 'sha256-${node('run()')}'`);
    expect(p).toContain(`style-src 'self' 'sha256-${node('body{}')}'`);
    expect(p).toMatch(/^default-src 'none';/);
    expect(p).toContain('frame-src https://www.youtube-nocookie.com https://player.vimeo.com');
    expect(p).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it('adds a host\'s own sources only when given: a script host after the hashes and where it may report', () => {
    expect(policy(['run()'], [])).not.toContain('connect-src');
    const p = policy(['run()'], [], [], { script: ['https://stats.example'], connect: ["'self'"] });
    expect(p).toContain(`script-src 'sha256-${node('run()')}' https://stats.example;`);
    expect(p).toContain("connect-src 'self';");
    expect(policy([], [], [], { script: ['https://stats.example'] })).toContain('script-src https://stats.example;');
  });

  it('declares a policy in every page that hashes each of its inline scripts and styles, and can be removed for previews', () => {
    const doc = parse('---\ntitle: T\n---\n\n## A\n\nText.\n').document;
    const html = renderDeck(doc, { styles: { tokens: '', components: '', deck: '' } as never });
    const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    expect(meta).not.toBeNull();
    expect(html.indexOf(meta![0])).toBeLessThan(html.indexOf('<style'));
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(meta![1]).toContain(`'sha256-${node(m[1]!)}'`);
    for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) expect(meta![1]).toContain(`'sha256-${node(m[1]!)}'`);
    expect(withoutCsp(html)).not.toContain('Content-Security-Policy');
    expect(withCsp(withoutCsp(html))).toBe(html);
  });
});

describe('the runtimes as text', () => {
  it('keeps src/runtimes.ts in step with the runtimes (node packages/render/src/build-runtimes.ts)', async () => {
    const { execFileSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    // Node strips the types itself, as the CLI does; the check fails (exit 1) when the file is stale
    execFileSync(process.execPath, [fileURLToPath(new URL('../src/build-runtimes.ts', import.meta.url)), '--check'], { stdio: 'pipe' });
  });
});
