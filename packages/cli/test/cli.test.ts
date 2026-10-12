import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from '@libka/model';
import { build, chosenOutputs, keyStatus, trustedFingerprints, trustedKeys, verify } from '../src/libka.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const example = join(root, 'examples', 'manual', 'guide.md');
const out = mkdtempSync(join(tmpdir(), 'libka-cli-test-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

// Chrome is needed for Guard and the PDF; CI runners and developer machines have it.
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

describe('libka build', () => {
  it('builds the example manual and copies its images', async () => {
    const result = await build(example, { out, check: false, outputs: ['web'] });
    expect(result.problems).toEqual([]);
    expect(result.manifest).toBeUndefined();
    const html = readFileSync(result.html!, 'utf8');
    expect(html).toMatch(/<h1 class="lk-doc-title">Writing a LibKa manual<\/h1>/);
    expect(html).toMatch(/<link rel="stylesheet" href="[^"]*fonts\/libka-fonts\.css">/);
    expect(existsSync(join(out, 'images', 'pipeline.svg'))).toBe(true);
  });

  it('stops on problems, reports file:line and writes nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'libka-cli-bad-'));
    const src = join(dir, 'bad.md');
    writeFileSync(src, '# Title\n\n:::table\n| a |\n|---|\n| 1 |\n:::\n\n![](missing.png "cap")\n');
    const result = await build(src, { out: join(dir, 'dist'), outputs: ['web'] });
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(/bad\.md:3: :::table needs a caption/);
    expect(result.problems.join('\n')).toMatch(/bad\.md:9: image "missing.png" needs alt text/);
    expect(existsSync(join(dir, 'dist', 'bad.html'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(!chrome)('checks the page with Guard, signs it, and detects later changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'libka-cli-signed-'));
    const result = await build(example, { out: dir, outputs: ['web'] });
    expect(result.ok).toBe(true);
    expect(result.report!.checks.map((c) => `${c.id}/${c.mode}`)).toEqual(
      ['axe/standard', 'contrast/standard', 'structure/standard', 'contrast/more-contrast']);
    const v = verify(result.html!);
    expect(v.problems).toEqual([]);
    expect(v.manifest!.source.name).toBe('guide.md');
    expect(JSON.parse(readFileSync(result.manifest!, 'utf8'))).toEqual(v.manifest);
    writeFileSync(result.html!, readFileSync(result.html!, 'utf8').replace('Writing a LibKa manual', 'Writing a manual'));
    expect(verify(result.html!).problems).toEqual(['the HTML was changed after it was checked and signed']);
    rmSync(dir, { recursive: true, force: true });
  }, 60000);

  it.skipIf(!chrome)('prints an A4 PDF through Chrome and signs its hash', async () => {
    const result = await build(example, { out, outputs: ['web', 'pdf'] });
    const pdf = readFileSync(result.pdf!);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[\s*0 0 594\.9\d* 841\.9\d*\s*\]|\/MediaBox \[\s*0 0 595 842\s*\]/);
    expect(pdf.toString('latin1')).toMatch(/\/StructTreeRoot/); // tagged PDF
    expect(verify(result.html!, result.pdf).problems).toEqual([]);
    writeFileSync(result.pdf!, Buffer.concat([pdf, Buffer.from('%')]));
    expect(verify(result.html!, result.pdf).problems).toEqual(['the PDF does not match the signed manifest']);
  }, 60000);

  it.skipIf(!chrome)('makes a Word file with the figure drawn, checks its structure and signs its hash', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'libka-cli-docx-'));
    const result = await build(example, { out: dir, outputs: ['web', 'docx'] });
    expect(result.problems).toEqual([]);
    expect(result.pdf).toBeUndefined();
    const docx = readFileSync(result.docx!);
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    const check = result.report!.checks.find((c) => c.id === 'docx')!;
    expect(check).toMatchObject({ title: 'Word file structure', violations: [] });
    expect(check.checked).toBeGreaterThan(50);
    // the SVG figure is a PNG picture in the Word file, with the figure's alt text
    const files = unzipSync(docx);
    expect(Object.keys(files).filter((k) => /^word\/media\/.+\.png$/.test(k))).toHaveLength(1);
    expect(strFromU8(files['word/document.xml']!)).toMatch(/<wp:docPr id="1" name="Picture 1" descr="Diagram: the Markdown source is linted/);
    const manifest = JSON.parse(readFileSync(result.manifest!, 'utf8'));
    expect(manifest.outputs.docx).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(result.conformance!, 'utf8')).toMatch(/subtitle: Web page and Word file, WCAG 2\.2/);
    expect(verify(result.html!, undefined, result.docx).problems).toEqual([]);
    writeFileSync(result.docx!, Buffer.concat([docx, Buffer.from('x')]));
    expect(verify(result.html!, undefined, result.docx).problems).toEqual(['the Word file does not match the signed manifest']);
    rmSync(dir, { recursive: true, force: true });
  }, 120000);
});

describe('output choice', () => {
  const doc = (outputs?: string) => parse(`---\ntitle: T\n${outputs ?? ''}\n---\n\nText.\n`).document;

  it('builds what the document asks for, a given list instead, plus the added outputs', () => {
    expect(chosenOutputs(doc(), {})).toEqual(['web', 'pdf']);
    expect(chosenOutputs(doc('outputs: [web, docx]'), {})).toEqual(['web', 'docx']);
    expect(chosenOutputs(doc('outputs: [web, docx]'), { outputs: ['web', 'deck'] })).toEqual(['web', 'deck']);
    expect(chosenOutputs(doc(), { deck: true, docx: true })).toEqual(['web', 'pdf', 'deck', 'docx']);
    expect(chosenOutputs(doc('outputs: [deck]'), { pdf: true })).toEqual(['pdf', 'deck']);
  });

  it('stops when the PDF or the Word file is asked for without the web page', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'libka-cli-choice-'));
    const src = join(dir, 'slides.md');
    writeFileSync(src, '---\ntitle: Slides only\noutputs: [deck]\n---\n\n## One\n\nText.\n');
    const r = await build(src, { out: join(dir, 'dist'), docx: true });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.stringMatching(/slides\.md: the PDF and the Word file are made from the web page and signed with it: add web to the outputs/)]);
    rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(!chrome)('a document that asks for slides only gets slides only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'libka-cli-deck-only-'));
    const src = join(dir, 'slides.md');
    writeFileSync(src, '---\ntitle: Slides only\noutputs: [deck]\n---\n\n## One\n\nText.\n');
    const r = await build(src, { out: join(dir, 'dist') });
    expect(r.problems).toEqual([]);
    expect(r.html).toBeUndefined();
    expect(r.deck?.manifest).toMatch(/slides\.deck\.manifest\.json$/);
    expect(existsSync(join(dir, 'dist', 'slides.html'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  }, 60000);
});

describe('signing keys', () => {
  it('trusts active and retired keys, never revoked ones (key rotation, docs/admin/signing-keys.md)', () => {
    const file = join(out, 'trusted-keys.json');
    writeFileSync(file, JSON.stringify({ keys: [
      { fingerprint: 'aaaaaaaaaaaaaaaa', owner: 'old workstation', added: '2026-10-03', retired: '2026-11-01' },
      { fingerprint: 'bbbbbbbbbbbbbbbb', owner: 'new workstation', added: '2026-11-01' },
      { fingerprint: 'cccccccccccccccc', owner: 'lost laptop', added: '2026-10-03', revoked: '2026-10-20' },
    ] }));
    const keys = trustedKeys(file);
    expect(trustedFingerprints(keys)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
    expect(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'cccccccccccccccc', 'dddddddddddddddd'].map((f) => keyStatus(f, keys))).toEqual(['retired', 'active', 'revoked', 'unknown']);
  });

  it('lists the maintainer key as active in the repository', () => {
    expect(trustedKeys().every((k) => /^[0-9a-f]{16}$/.test(k.fingerprint))).toBe(true);
    expect(trustedKeys().some((k) => keyStatus(k.fingerprint) === 'active')).toBe(true);
  });
});
