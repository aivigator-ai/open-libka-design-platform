/**
 * Opens Word files in LibreOffice, headless, and converts them to PDF: proof that a second office suite reads them.
 * See docs/admin/word-and-libreoffice.md for installing it. Where it looks:
 *
 * - LIBKA_SOFFICE: the soffice program;
 * - otherwise %LOCALAPPDATA%\libka\libreoffice\program\soffice.exe on Windows (the portable install), the usual
 *   install folders, and soffice or libreoffice on the PATH (CI on Linux).
 *
 * Node only (it starts a program); the renderer itself stays browser-safe.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The soffice program on this machine, or null when LibreOffice is not installed. */
export function findSoffice(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [env.LIBKA_SOFFICE,
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'libka', 'libreoffice', 'program', 'soffice.exe') : undefined,
    'C:/Program Files/LibreOffice/program/soffice.exe', '/usr/bin/soffice', '/usr/bin/libreoffice', '/opt/libreoffice/program/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'].filter((p): p is string => Boolean(p));
  for (const c of candidates) if (existsSync(c)) return c;
  for (const name of ['soffice', 'libreoffice']) {
    try { execFileSync(name, ['--version'], { stdio: 'ignore', timeout: 60000 }); return name; } catch { /* not on the PATH */ }
  }
  return null;
}

/** The LibreOffice version, such as "LibreOffice 26.2.6.2", or null. */
export function sofficeVersion(soffice = findSoffice()): string | null {
  if (!soffice) return null;
  // on Windows soffice.exe is the window program and may wait without answering; soffice.com is its console twin
  const console = soffice.replace(/soffice\.exe$/i, 'soffice.com');
  if (console !== soffice && existsSync(console)) soffice = console;
  try { return execFileSync(soffice, ['--version'], { encoding: 'utf8', timeout: 60000 }).trim().split(/\s+/).slice(0, 2).join(' ') || null; } catch { return null; }
}

/**
 * Converts a Word file to PDF in LibreOffice and returns the PDF's path in `outDir`. A private profile keeps the
 * run apart from any LibreOffice the user has open. Throws when LibreOffice cannot read the file.
 */
export function convertToPdf(docx: string, outDir: string, soffice = findSoffice()): string {
  if (!soffice) throw new Error('LibreOffice was not found (see docs/admin/word-and-libreoffice.md)');
  mkdirSync(outDir, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'libka-soffice-'));
  try {
    execFileSync(soffice, ['--headless', '--norestore', '--nolockcheck', `-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--convert-to', 'pdf:writer_pdf_Export', '--outdir', outDir, docx], { stdio: 'pipe', timeout: 180000 });
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  const pdf = join(outDir, `${basename(docx, extname(docx))}.pdf`);
  if (!existsSync(pdf)) throw new Error(`LibreOffice did not convert ${docx}`);
  return pdf;
}
