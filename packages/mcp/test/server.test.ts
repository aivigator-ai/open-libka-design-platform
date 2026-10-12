import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'libka-mcp-test-'));
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));
const client = new Client({ name: 'libka-test', version: '1.0.0' });
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args }) as { content: { text: string }[]; isError?: boolean };
  return { error: r.isError, data: JSON.parse(r.content[0]!.text.startsWith('{') ? r.content[0]!.text : '{}'), text: r.content[0]!.text };
};

describe('LibKa MCP server over stdio', () => {
  beforeAll(async () => {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(here, '..', 'src', 'server.ts')], stderr: 'pipe' }));
  }, 60000);
  afterAll(async () => {
    await client.close();
    rmSync(out, { recursive: true, force: true });
  });

  it('offers the tools, resources and prompt', async () => {
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(['libka_build', 'libka_check', 'libka_get_block', 'libka_list_blocks']);
    expect((await client.listResources()).resources.map((r) => r.uri).sort()).toEqual(['libka://guide', 'libka://reference', 'libka://schema/document']);
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(['convert-to-libka']);
  });

  it('lists blocks with what they fit, and what to write for content without a block', async () => {
    const { data } = await call('libka_list_blocks', {});
    expect(data.blocks.find((b: { name: string }) => b.name === 'chart').useWhen).toMatch(/change over time/);
    expect(data.withoutBlock.find((f: { content: string }) => f.content.startsWith('Math')).write).toMatch(/formula in code/);
    expect(data).not.toHaveProperty('planned');
    const ui = await call('libka_list_blocks', { group: 'ui' });
    expect(ui.data.blocks.map((b: { name: string }) => b.name)).toEqual(['ui']);
  });

  it('describes one block, and says when a name is unknown and where to look instead', async () => {
    expect((await call('libka_get_block', { name: 'tabs' })).data.example).toMatch(/::::tabs/);
    const unknown = await call('libka_get_block', { name: 'carousel' });
    expect(unknown.error).toBe(true);
    expect(unknown.text).toMatch(/No block "carousel"/);
    expect(unknown.text).toMatch(/withoutBlock/);
  });

  it('checks Markdown and reports problems with their lines', async () => {
    const { data } = await call('libka_check', { markdown: '---\ntitle: T\n---\n\n## A\n\n:::table\n| x |\n|---|\n| 1 |\n:::\n\n![](a.png)\n' });
    expect(data.ok).toBe(false);
    expect(data.problems.map((p: { line: number }) => p.line)).toEqual([7, 13, 13]);
    expect(data.slides).toBe(2);
  });

  it('serves the guide, the generated reference and the document schema', async () => {
    const guide = await client.readResource({ uri: 'libka://guide' }) as { contents: { text: string }[] };
    expect(guide.contents[0]!.text).toMatch(/^# Writing LibKa documents/);
    const ref = await client.readResource({ uri: 'libka://reference' }) as { contents: { text: string }[] };
    expect(ref.contents[0]!.text).toMatch(/## Choose a block/);
    const schema = await client.readResource({ uri: 'libka://schema/document' }) as { contents: { text: string }[] };
    expect(JSON.parse(schema.contents[0]!.text).title).toBe('LibKa document');
    const prompt = await client.getPrompt({ name: 'convert-to-libka', arguments: { content: 'Notes', kind: 'guide' } });
    expect((prompt.messages[0]!.content as { text: string }).text).toMatch(/into a LibKa document \(guide\)[\s\S]*<content>\nNotes\n<\/content>/);
  });

  it.skipIf(!chrome)('builds a document to a checked, signed web page and slides', async () => {
    const markdown = '---\ntitle: Release checklist\n---\n\n## Before release\n\n:::checklist\n- [x] Tests pass\n- [ ] Notes written\n:::\n';
    const { data } = await call('libka_build', { markdown, name: 'release', outDir: out, outputs: ['web', 'deck'] });
    expect(data.problems).toEqual([]);
    expect(data.ok).toBe(true);
    expect(data.files.map((f: string) => f.split(/[\\/]/).pop())).toEqual(['release.html', 'release.manifest.json', 'release.deck.html', 'release.deck.manifest.json']);
    expect(data.guard.slides.every((c: { violations: number }) => c.violations === 0)).toBe(true);
  }, 120000);
});

describe('LibKa MCP server, strictly', () => {
  // the SDK's client skips lines it cannot read; other clients stop, so stdout must hold protocol messages only
  it.skipIf(!chrome)('writes nothing but protocol messages to stdout, even when a build makes a new signing key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'libka-mcp-strict-'));
    const child = spawn(process.execPath, [join(here, '..', 'src', 'server.ts')], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LIBKA_OUT: dir, LIBKA_SIGNING_KEY: '' } });
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    const send = (m: object) => child.stdin.write(JSON.stringify(m) + '\n');
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'strict', version: '1' } } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'libka_build', arguments: { markdown: '---\ntitle: Strict\nlang: en\n---\n\n## A\n\nText.\n', outputs: ['web'] } } });
    await new Promise<void>((done) => { const t = setInterval(() => { if (stdout.includes('"id":2')) { clearInterval(t); done(); } }, 100); });
    child.kill();
    const lines = stdout.split('\n').filter(Boolean);
    for (const line of lines) expect(() => JSON.parse(line), line).not.toThrow();
    expect(JSON.parse(JSON.parse(lines.at(-1)!).result.content[0].text).ok).toBe(true);
    expect(existsSync(join(dir, '.libka', 'signing-key.pem'))).toBe(true);   // a new key was made, and announced on stderr
    rmSync(dir, { recursive: true, force: true });
  }, 120000);
});
