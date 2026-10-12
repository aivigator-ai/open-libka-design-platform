/**
 * libka doctor: what this machine has for LibKa, what works without each missing piece, and where to get it.
 *
 *   Node.js 22.18+   required: LibKa runs on it
 *   Chrome           required to build (Guard checks every page in it, prints the PDFs, draws diagrams and fits slides);
 *                    lint works without it
 *   Java + veraPDF   optional: validates each PDF against PDF/UA-1; without them a PDF is built and marked "not validated"
 *   LibreOffice      optional: LibKa's own tests open the Word file in it; building does not need it
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findVeraPdf, veraPdfVersion } from '@libka/pdf/verapdf';
import { findSoffice, sofficeVersion } from '@libka/docx/libreoffice';
import { launchBrowser } from '@libka/guard';
import { PACKAGED, ROOT, VERSION } from './assets.ts';

export interface Finding {
  name: string;
  /** Found and working; for a missing required piece, false fails the doctor. */
  ok: boolean;
  required: boolean;
  /** What was found (a version), or what is missing. */
  detail: string;
  /** What works without it; only for a missing piece. */
  without?: string;
  /** Where to get it: a page in the LibKa docs. */
  help?: string;
}

/** The public repository's address, from the package's own package.json (written by npm/build.mts). */
function repositoryUrl(): string | null {
  if (!PACKAGED) return null;
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { repository?: { url?: string } };
  return pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? null;
}

/** A page of the LibKa docs: on GitHub from the npm package, the file itself in the repository. */
export function docsLink(path: string): string {
  const url = repositoryUrl();
  return url ? `${url}/blob/main/${path}` : path;
}

const CHROME_WITHOUT = 'lint works; build and check need Chrome (Guard runs in it, and it prints the PDFs)';

/** Chrome: started once; LIBKA_BROWSER, when set, must name a program that exists. */
export async function chromeFinding(env: NodeJS.ProcessEnv = process.env): Promise<Finding> {
  const pinned = env.LIBKA_BROWSER;
  if (pinned && !existsSync(pinned)) {
    return {
      name: 'Chrome', ok: false, required: true, detail: `LIBKA_BROWSER is set to ${pinned}, which does not exist`,
      without: CHROME_WITHOUT, help: 'set LIBKA_BROWSER to the path of a Chrome or Chromium program, or remove it to use the installed Chrome',
    };
  }
  let chrome: string | null = null;
  let chromeError = '';
  try {
    const browser = await launchBrowser();
    chrome = browser.version();
    await browser.close();
  } catch (e) {
    chromeError = String((e as Error).message ?? e).split('\n')[0]!;
  }
  return {
    name: 'Chrome', ok: Boolean(chrome), required: true,
    detail: chrome ? `${chrome}${pinned ? ' (LIBKA_BROWSER)' : ''}` : `not found${pinned ? ` at LIBKA_BROWSER (${chromeError})` : ''}`,
    ...(chrome ? {} : { without: CHROME_WITHOUT, help: 'https://www.google.com/chrome/ (or set LIBKA_BROWSER to a Chrome or Chromium program)' }),
  };
}

export async function doctor(): Promise<Finding[]> {
  const out: Finding[] = [];
  const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
  const nodeOk = major > 22 || (major === 22 && minor >= 18);
  out.push({ name: 'Node.js', ok: nodeOk, required: true, detail: nodeOk ? `${process.versions.node}` : `${process.versions.node}, but LibKa needs 22.18 or newer`, help: 'https://nodejs.org/en/download' });

  out.push(await chromeFinding());

  const launcher = findVeraPdf();
  const vera = veraPdfVersion(launcher);
  out.push({
    name: 'Java and veraPDF', ok: Boolean(vera), required: false,
    detail: vera ?? (launcher ? 'veraPDF found, but it did not start (is Java 21 installed?)' : 'not found'),
    ...(vera ? {} : { without: 'PDFs are built, and their manifest, conformance report and verify say they were not validated against PDF/UA-1', help: docsLink('docs/admin/verapdf.md') }),
  });

  const soffice = findSoffice();
  const lo = soffice ? sofficeVersion(soffice) : null;
  out.push({
    name: 'LibreOffice', ok: Boolean(lo), required: false,
    detail: lo ?? 'not found',
    ...(lo ? {} : { without: 'everything: building does not need it (LibKa\'s own tests open the Word file in it)', help: docsLink('docs/admin/word-and-libreoffice.md') }),
  });
  return out;
}

/** The report as printed by `libka doctor`. */
export function formatDoctor(findings: Finding[]): string {
  const lines = [`LibKa ${VERSION}${PACKAGED ? '' : ' (repository)'}`];
  for (const f of findings) {
    lines.push(`  ${f.ok ? '✓' : f.required ? '✗' : '!'} ${f.name}: ${f.detail}${!f.ok && !f.required ? ' (optional)' : ''}`);
    if (!f.ok && f.without) lines.push(`      without it: ${f.without}`);
    if (!f.ok && f.help) lines.push(`      get it: ${f.help}`);
  }
  const missing = findings.filter((f) => f.required && !f.ok);
  lines.push(missing.length ? `libka: ${missing.map((f) => f.name).join(' and ')} missing: building will not work until ${missing.length > 1 ? 'they are' : 'it is'} installed`
    : `libka: ready to build${findings.some((f) => !f.ok) ? ' (the optional pieces above add checks)' : ''}`);
  return lines.join('\n');
}

/** True when the error is Chrome not starting: the build then points to `libka doctor`. */
export function isBrowserMissing(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /Chromium distribution 'chrome' is not found|Failed to launch|Executable doesn't exist|browserType\.launch/i.test(m);
}
