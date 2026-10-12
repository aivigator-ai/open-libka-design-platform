// The command line's answers to a wrong or incomplete call: help, unknown commands, options without a value, missing
// files; and doctor's Chrome finding and the "Chrome did not start" hint, without starting Chrome.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chromeFinding, isBrowserMissing } from '../src/doctor.ts';

const cli = join(import.meta.dirname, '..', 'src', 'libka.ts');
const libka = (...args: string[]) => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: import.meta.dirname });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

describe('the command line', () => {
  it('prints the usage and exits 0 for --help, -h, help and no command', () => {
    for (const args of [['--help'], ['-h'], ['help'], []]) {
      const r = libka(...args);
      expect(r.code, args.join(' ')).toBe(0);
      expect(r.out).toMatch(/^usage:/);
    }
  }, 60_000);

  it('names an unknown command, and a command without its file, before the usage, and exits 2', () => {
    const unknown = libka('biuld', 'x.md');
    expect(unknown.code).toBe(2);
    expect(unknown.err).toMatch(/^libka: unknown command "biuld"\nusage:/);
    expect(libka('build').err).toMatch(/^libka: build needs a file/);
    expect(libka('build', '--out', 'x').err).toMatch(/^libka: build needs a file/);
    expect(libka('verify').err).toMatch(/^libka: verify needs a page/);
  }, 60_000);

  it('refuses an option without its value instead of reading the next option as it', () => {
    const r = libka('verify', 'page.html', '--pdf');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^libka: --pdf needs a file/);
    expect(libka('verify', 'page.html', '--pdf', '--docx', 'a.docx').err).toMatch(/^libka: --pdf needs a file/);
    expect(libka('build', 'x.md', '--out').err).toMatch(/^libka: --out needs a folder/);
    expect(libka('studio', '--dir').err).toMatch(/^libka: --dir needs a folder/);
  }, 60_000);

  it('says "file not found" for a missing page, PDF or Word file instead of a stack trace', () => {
    const r = libka('verify', 'nope.html');
    expect(r.code).toBe(1);
    expect(r.err.trim()).toBe('libka: nope.html: file not found');
    expect(libka('verify', 'usage.test.ts', '--pdf', 'nope.pdf').err.trim()).toBe('libka: nope.pdf: file not found');
    expect(libka('verify', 'usage.test.ts', '--docx', 'nope.docx').err.trim()).toBe('libka: nope.docx: file not found');
    expect(libka('check', 'nope.html').err.trim()).toBe('libka: nope.html: file not found');
  }, 60_000);
});

describe('doctor and the Chrome hint', () => {
  it('reports a LIBKA_BROWSER that names no program, without trying to start it', async () => {
    const f = await chromeFinding({ LIBKA_BROWSER: join(import.meta.dirname, 'no-such-browser.exe') });
    expect(f.ok).toBe(false);
    expect(f.detail).toMatch(/^LIBKA_BROWSER is set to .*no-such-browser\.exe, which does not exist$/);
    expect(f.help).toMatch(/set LIBKA_BROWSER to the path of a Chrome or Chromium program, or remove it/);
  });

  it('knows a Chrome that did not start from any other failure', () => {
    for (const m of ["Chromium distribution 'chrome' is not found at /x", 'browserType.launch: Failed to launch the browser process',
      "Executable doesn't exist at C:\\chrome.exe", 'browserType.launch: Target page, context or browser has been closed']) {
      expect(isBrowserMissing(new Error(m)), m).toBe(true);
      expect(isBrowserMissing(m), m).toBe(true);
    }
    for (const other of [new Error('ENOENT: no such file or directory'), 'a document problem', undefined, null]) {
      expect(isBrowserMissing(other), String(other)).toBe(false);
    }
  });
});
