// Each project has its own signing key and its own list of trusted keys (.libka/ in the project), and the doctor.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isHomeOrAbove, projectRoot, projectTrustFile } from '../src/assets.ts';
import { formatDoctor, type Finding } from '../src/doctor.ts';
import { build, keyStatus, projectKey, trustedKeys, trustListFor, verify } from '../src/libka.ts';

const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));
const dirs: string[] = [];
const temp = (name: string) => { const d = mkdtempSync(join(tmpdir(), `libka-${name}-`)); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const env = process.env.LIBKA_SIGNING_KEY;

describe('the project of a document', () => {
  it('is the nearest folder with .libka/, else with package.json or .git, else the document\'s folder', () => {
    const p = temp('project');
    mkdirSync(join(p, 'docs', 'guides'), { recursive: true });
    expect(projectRoot(join(p, 'docs', 'guides', 'a.md'))).toBe(join(p, 'docs', 'guides'));
    writeFileSync(join(p, 'package.json'), '{}');
    expect(projectRoot(join(p, 'docs', 'guides', 'a.md'))).toBe(p);
    mkdirSync(join(p, 'docs', '.libka'));
    expect(projectRoot(join(p, 'docs', 'guides', 'a.md'))).toBe(join(p, 'docs'));
    // the home folder's own .libka (other tools keep one) and a stray package.json there never make it a project
    expect(projectRoot(join(p, 'docs', 'guides', 'a.md'), join(p, 'docs'))).toBe(join(p, 'docs', 'guides'));
    expect(projectRoot(join(p, 'docs', 'guides', 'a.md'), p)).toBe(join(p, 'docs'));
  });

  it('trusts its first key in its own list, and only reports a later one', () => {
    delete process.env.LIBKA_SIGNING_KEY;
    try {
      const p = temp('keys');
      const log: string[] = [];
      expect(projectTrustFile(p)).toBeNull();
      const first = projectKey(p, (m) => log.push(m));
      expect(existsSync(join(p, '.libka', 'signing-key.pem'))).toBe(true);
      expect(projectTrustFile(p)).toBe(join(p, '.libka', 'trusted-keys.json'));
      expect(trustedKeys(projectTrustFile(p)!).map((k) => k.fingerprint)).toEqual([first.fingerprint]);
      expect(log.join('\n')).toMatch(/created a signing key[\s\S]*trusted it in .*trusted-keys\.json/);
      // the key stays out of git wherever the project is, not only in a starter project
      expect(readFileSync(join(p, '.libka', '.gitignore'), 'utf8')).toMatch(/^\*\.pem$/m);

      // the same key again: nothing new
      log.length = 0;
      expect(projectKey(p, (m) => log.push(m)).fingerprint).toBe(first.fingerprint);
      expect(log).toEqual([]);

      // a new key (another computer): not trusted by itself
      rmSync(join(p, '.libka', 'signing-key.pem'));
      const second = projectKey(p, (m) => log.push(m));
      expect(second.fingerprint).not.toBe(first.fingerprint);
      expect(keyStatus(second.fingerprint, trustedKeys(projectTrustFile(p)!))).toBe('unknown');
      expect(log.join('\n')).toMatch(new RegExp(`this key \\(${second.fingerprint}\\) is not in .*trusted-keys\\.json`));
    } finally {
      if (env !== undefined) process.env.LIBKA_SIGNING_KEY = env;
    }
  });

  it('treats the home folder and the folders above it as no project (a signed build there is refused)', () => {
    const home = temp('home');
    expect(isHomeOrAbove(home, home)).toBe(true);
    expect(isHomeOrAbove(join(home, '..'), home)).toBe(true);
    expect(isHomeOrAbove(join(home, 'docs'), home)).toBe(false);
    expect(isHomeOrAbove(`${home}-other`, home)).toBe(false);
  });

  it('uses LibKa\'s own list when the project has none', () => {
    const p = temp('nolist');
    expect(trustListFor(join(p, 'page.html'))).toMatch(/trusted-keys\.json$/);
    expect(trustListFor(join(p, 'page.html'))).not.toContain(p);
  });

  it.skipIf(!chrome)('builds, signs and verifies as trusted in a new project', async () => {
    delete process.env.LIBKA_SIGNING_KEY;
    try {
      const p = temp('newproject');
      writeFileSync(join(p, 'package.json'), '{"private": true}');
      mkdirSync(join(p, 'docs'));
      writeFileSync(join(p, 'docs', 'hello.md'), '---\ntitle: Hello\nlang: en\noutputs: [web]\n---\n\n# Hello\n\nA first LibKa document.\n');
      const r = await build(join(p, 'docs', 'hello.md'), { out: join(p, 'dist') });
      expect(r.problems).toEqual([]);
      expect(existsSync(join(p, '.libka', 'trusted-keys.json'))).toBe(true);
      const v = verify(r.html!);
      expect(v.ok).toBe(true);
      expect(v.trusted).toBe(true);
      expect(JSON.parse(readFileSync(r.manifest!, 'utf8')).key.fingerprint).toBe(trustedKeys(join(p, '.libka', 'trusted-keys.json'))[0]!.fingerprint);
    } finally {
      if (env !== undefined) process.env.LIBKA_SIGNING_KEY = env;
    }
  }, 120_000);
});

describe('libka doctor', () => {
  it('says what is missing, what works without it and where to get it', () => {
    const findings: Finding[] = [
      { name: 'Node.js', ok: true, required: true, detail: '22.22.0' },
      { name: 'Chrome', ok: false, required: true, detail: 'not found', without: 'lint works', help: 'https://www.google.com/chrome/' },
      { name: 'Java and veraPDF', ok: false, required: false, detail: 'not found', without: 'PDFs are not validated', help: 'docs/admin/verapdf.md' },
    ];
    const text = formatDoctor(findings);
    expect(text).toMatch(/✓ Node\.js: 22\.22\.0/);
    expect(text).toMatch(/✗ Chrome: not found\n {6}without it: lint works\n {6}get it: https:\/\/www\.google\.com\/chrome\//);
    expect(text).toMatch(/! Java and veraPDF: not found \(optional\)/);
    expect(text).toMatch(/Chrome missing: building will not work/);
    expect(formatDoctor(findings.filter((f) => f.ok))).toMatch(/ready to build$/);
  });
});
