import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { build, lint, verify } from '@libka/cli';
// @ts-expect-error plain JavaScript without types
import { create, ownerOf, packageName, templates, VERSION } from '../index.mjs';

const here = join(import.meta.dirname, '..');
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));
const base = mkdtempSync(join(tmpdir(), 'libka-create-'));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('create-libka', () => {
  it('writes the example, the scripts, the workflow, the .gitignore and the README', () => {
    const files = create(join(base, 'My Docs'), { lang: 'en' });
    expect(files).toEqual(['.github/workflows/libka.yml', '.gitignore', 'README.md', 'docs/guide.md', 'package.json']);
    const dir = join(base, 'My Docs');
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-docs');
    expect(pkg.devDependencies).toEqual({ '@libka/cli': VERSION });   // the same version as the workflow's `cli:`
    expect(Object.keys(pkg.scripts)).toEqual(['build', 'check', 'verify', 'doctor']);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toMatch(/^\.libka\/\*\.pem$/m);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).not.toMatch(/^\.libka\/?$/m);   // the trusted list is committed
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    expect(readme).toMatch(/^# my-docs/);
    expect(readme).not.toMatch(/\{\{/);
    expect(readme).toContain(`(${VERSION})`);
  });

  it('writes the Czech example on request, and refuses a folder that is not empty or an unknown language', () => {
    create(join(base, 'cs'), { lang: 'cs' });
    expect(readFileSync(join(base, 'cs', 'docs', 'guide.md'), 'utf8')).toMatch(/^lang: cs$/m);
    expect(readFileSync(join(base, 'cs', 'README.md'), 'utf8')).toMatch(/První kroky/);
    expect(() => create(join(base, 'cs'))).toThrow(/not empty/);
    expect(() => create(join(base, 'de'), { lang: 'de' })).toThrow(/--lang takes en or cs/);
    expect(packageName('Návody a Příručky')).toBe('navody-a-prirucky');
  });

  it('runs as a program with --lang and a folder', () => {
    const out = execFileSync(process.execPath, [join(here, 'index.mjs'), join(base, 'cli'), '--lang', 'cs'], { encoding: 'utf8' });
    expect(out).toMatch(/\(Example guide, in Czech\)/);
    expect(out).toMatch(/npm install/);
    expect(out).toMatch(/npm run build {6}the web page, PDF, slides and Word file in dist\//);
    expect(existsSync(join(base, 'cli', 'docs', 'guide.md'))).toBe(true);
    // a template names itself and only the outputs it makes
    const report = execFileSync(process.execPath, [join(here, 'index.mjs'), join(base, 'cli-report'), '--lang', 'en', '--template', 'report'], { encoding: 'utf8' });
    expect(report).toMatch(/\(Report, in English\)/);
    expect(report).toMatch(/npm run build {6}the web page, PDF and Word file in dist\//);
  });

  it('starts from a template: its document, its scripts, its README line, in either language', () => {
    expect(templates().map((x: { id: string }) => x.id)).toEqual(['guide', 'decision-record', 'manual', 'policy', 'report', 'talk']);
    const report = create(join(base, 'report'), { lang: 'en', template: 'report' });
    expect(report).toContain('docs/report.md');
    expect(report).not.toContain('docs/guide.md');
    expect(readFileSync(join(base, 'report', 'docs', 'report.md'), 'utf8')).toBe(readFileSync(join(here, 'gallery', 'report', 'en.md'), 'utf8'));
    const pkg = JSON.parse(readFileSync(join(base, 'report', 'package.json'), 'utf8'));
    expect(pkg.scripts).toMatchObject({ build: 'libka build docs/report.md --out dist', check: 'libka lint docs/report.md',
      verify: 'libka verify dist/report.html --pdf dist/report.pdf --docx dist/report.docx' });
    expect(readFileSync(join(base, 'report', 'README.md'), 'utf8')).toMatch(/builds `docs\/report\.md` into `dist\/`\. Open `dist\/report\.html` in a browser\.$/m);
    // verify names only the files the template builds (a report has no slides)
    expect(readFileSync(join(base, 'report', 'README.md'), 'utf8')).toMatch(/that the files in `dist\/` \(the web page with its PDF and Word file\) are the ones/);
    create(join(base, 'talk-cs'), { lang: 'cs', template: 'talk' });
    expect(readFileSync(join(base, 'talk-cs', 'docs', 'talk.md'), 'utf8')).toMatch(/^lang: cs$/m);
    expect(readFileSync(join(base, 'talk-cs', 'README.md'), 'utf8')).toMatch(/soubory v `dist\/` \(webová stránka s jejím PDF a prezentace s jejím PDF\) jsou ty/);
    expect(JSON.parse(readFileSync(join(base, 'talk-cs', 'package.json'), 'utf8')).scripts.verify)
      .toBe('libka verify dist/talk.html --pdf dist/talk.pdf && libka verify dist/talk.deck.html --pdf dist/talk.deck.pdf');
    expect(readFileSync(join(base, 'talk-cs', 'README.md'), 'utf8')).toMatch(/Otevřete `dist\/talk\.html` v prohlížeči a `dist\/talk\.deck\.html` pro prezentaci\.$/m);
    // the example keeps today's scripts
    expect(JSON.parse(readFileSync(join(base, 'cs', 'package.json'), 'utf8')).scripts.verify)
      .toBe('libka verify dist/guide.html --pdf dist/guide.pdf --docx dist/guide.docx && libka verify dist/guide.deck.html --pdf dist/guide.deck.pdf');
    expect(() => create(join(base, 'x'), { template: 'memo' })).toThrow(/--template takes guide, decision-record, manual, policy, report, talk, not "memo"/);
    const out = execFileSync(process.execPath, [join(here, 'index.mjs'), join(base, 'cli-talk'), '--lang', 'en', '--template', 'talk'], { encoding: 'utf8' });
    expect(out).toMatch(/docs\/talk\.md/);
  });

  it('has each template in both languages, with its theme, and pictures made from the text as it is now', () => {
    const pictures = JSON.parse(readFileSync(join(here, 'gallery', 'pictures.json'), 'utf8')) as Record<string, Record<string, string>>;
    for (const t of templates().slice(1) as { id: string; theme: string; outputs: string[] }[]) {
      for (const lang of ['en', 'cs']) {
        const text = readFileSync(join(here, 'gallery', t.id, `${lang}.md`), 'utf8');
        const r = lint(text);
        expect(r.problems, `${t.id} ${lang}`).toEqual([]);
        expect(r.outputs).toEqual(t.outputs);
        expect(text).toMatch(new RegExp(`^theme: ${t.theme}$`, 'm'));
        expect(text).toMatch(new RegExp(`^lang: ${lang}$`, 'm'));
        expect(text).not.toMatch(/^brand:/m);
        expect(existsSync(join(here, 'gallery', t.id, `${lang}.png`))).toBe(true);
        expect(pictures[t.id]?.[lang], `${t.id} ${lang}: run node packages/create-libka/build-pictures.mts`)
          .toBe(createHash('sha256').update(readFileSync(join(here, 'gallery', t.id, `${lang}.md`))).digest('hex'));
      }
    }
  });

  it.skipIf(!chrome)('builds each template in both languages, every output passing Guard', async () => {
    for (const t of templates().slice(1) as { id: string; file: string }[]) for (const lang of ['en', 'cs']) {
      const dir = join(base, `built-${t.id}-${lang}`);
      create(dir, { lang, template: t.id });
      const r = await build(join(dir, 'docs', `${t.file}.md`), { out: join(dir, 'dist') });
      expect(r.problems, `${t.id} ${lang}`).toEqual([]);
      expect(r.ok).toBe(true);
      expect(verify(r.html!).problems).toEqual([]);
    }
  }, 600000);

  it('pins every action in the workflow to a commit', () => {
    const yml = readFileSync(join(here, 'templates', 'common', 'github', 'workflows', 'libka.yml'), 'utf8');
    const refs = [...yml.matchAll(/uses: \S+@(\S+)/g)].map((m) => m[1]);
    expect(refs).toHaveLength(3);
    for (const ref of refs) expect(ref).toMatch(/^[0-9a-f]{40}$/);
  });

  it("checks with the Guard action beside the LibKa repository, running the project's own LibKa version", () => {
    const dir = join(base, 'ci');
    create(dir);
    const yml = readFileSync(join(dir, '.github', 'workflows', 'libka.yml'), 'utf8');
    expect(yml).not.toMatch(/\{\{/);
    // a package built without the repository address (as here) names OWNER; a published one its owner
    expect(yml).toMatch(/uses: OWNER\/open-libka-guard-action@[0-9a-f]{40} # v\d+\.\d+\.\d+$/m);
    expect(yml).toContain(`cli: '@libka/cli@${VERSION}'`);
    expect(yml).toMatch(/documents: docs\/\*\.md$/m);
    // kept also when Guard fails, and no warning when a failed build wrote nothing
    expect(yml).toMatch(/if: always\(\)[\s\S]*if-no-files-found: ignore/);
    expect(ownerOf('https://github.com/someone/open-libka-design-platform')).toBe('someone');
    expect(ownerOf(undefined)).toBe('OWNER');
  });

  it.each(['en', 'cs'])('has an example (%s) with no problems', (lang) => {
    const r = lint(readFileSync(join(here, 'templates', lang, 'docs', 'guide.md'), 'utf8'));
    expect(r.problems).toEqual([]);
    expect(r.hints).toEqual([]);
    expect(r.outputs).toEqual(['web', 'pdf', 'deck', 'docx']);
  });

  it.skipIf(!chrome).each(['en', 'cs'])('builds the %s example with Guard passing, and it verifies as trusted', async (lang) => {
    const dir = join(base, `built-${lang}`);
    create(dir, { lang });
    const r = await build(join(dir, 'docs', 'guide.md'), { out: join(dir, 'dist'), outputs: ['web', 'deck', 'docx'] });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(verify(r.html!, undefined, r.docx).trusted).toBe(true);
    expect(existsSync(join(dir, '.libka', 'trusted-keys.json'))).toBe(true);
  }, 180_000);
});

