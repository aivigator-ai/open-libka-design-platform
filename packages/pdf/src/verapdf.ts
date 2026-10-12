/**
 * Runs veraPDF, the reference validator of the PDF Association, on built PDFs. It needs Java (LibKa installs Java 21); see
 * docs/admin/verapdf.md for installing both. Where it looks:
 *
 * - LIBKA_VERAPDF: the veraPDF launcher (verapdf.bat on Windows, verapdf elsewhere);
 * - LIBKA_JAVA: the Java executable veraPDF should use (passed to the launcher as JAVACMD);
 * - otherwise %LOCALAPPDATA%\libka\verapdf with %LOCALAPPDATA%\libka\jre21 on Windows, and verapdf on the PATH or
 *   in /opt/verapdf elsewhere.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type Flavour = 'ua1' | 'ua2';

export interface RuleFailure { rule: string; clause: string; test: number; description: string; count: number }

export interface VeraPdfResult {
  file: string;
  flavour: Flavour;
  compliant: boolean;
  passedRules: number;
  failedRules: number;
  failures: RuleFailure[];
}

/**
 * Rules Chrome's output cannot meet, each with its reason. They are shown in the report, never hidden, and do
 * not fail a build. Empty: every rule of PDF/UA-1 passes.
 */
export const KNOWN_LIMITS: Readonly<Record<string, string>> = {};

interface Launcher { command: string; args: string[]; env: NodeJS.ProcessEnv }

/** How to start veraPDF on this machine, or null when it is not installed. */
export function findVeraPdf(env: NodeJS.ProcessEnv = process.env): Launcher | null {
  const java = env.LIBKA_JAVA ?? (env.LOCALAPPDATA && existsSync(join(env.LOCALAPPDATA, 'libka', 'jre21', 'bin', 'java.exe'))
    ? join(env.LOCALAPPDATA, 'libka', 'jre21', 'bin', 'java.exe') : undefined);
  const candidates = [env.LIBKA_VERAPDF,
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'libka', 'verapdf', 'verapdf.bat') : undefined,
    '/opt/verapdf/verapdf'].filter((p): p is string => Boolean(p));
  const runEnv = { ...env, ...(java ? { JAVACMD: java } : {}) };
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    return c.toLowerCase().endsWith('.bat')
      ? { command: 'cmd.exe', args: ['/c', c], env: runEnv }
      : { command: c, args: [], env: runEnv };
  }
  // on the PATH (CI on Linux)
  try { execFileSync('verapdf', ['--version'], { stdio: 'ignore', env: runEnv }); return { command: 'verapdf', args: [], env: runEnv }; } catch { return null; }
}

/** The validator's name and version ("veraPDF 1.30.2"), or null when it is not installed. */
export function veraPdfVersion(launcher = findVeraPdf()): string | null {
  if (!launcher) return null;
  try {
    const out = execFileSync(launcher.command, [...launcher.args, '--version'], { env: launcher.env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return out.split(/\r?\n/)[0]!.trim() || null;
  } catch { return null; }
}

/** Validates PDFs against a PDF/UA level in one run; null when veraPDF is not installed. */
export function validatePdfs(files: string[], flavour: Flavour, launcher = findVeraPdf()): VeraPdfResult[] | null {
  if (!launcher || !files.length) return launcher ? [] : null;
  let out = '';
  try {
    out = execFileSync(launcher.command, [...launcher.args, '--flavour', flavour, '--format', 'json', ...files],
      { env: launcher.env, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }).toString();
  } catch (e) {
    // veraPDF exits with 1 when a file is not compliant; its report is still on stdout
    out = (e as { stdout?: Buffer }).stdout?.toString() ?? '';
  }
  const report = JSON.parse(out) as { report: { jobs: { itemDetails: { name: string }; validationResult: unknown }[] } };
  return report.report.jobs.map((job) => {
    const v = (Array.isArray(job.validationResult) ? job.validationResult[0] : job.validationResult) as {
      compliant: boolean; details: { passedRules: number; failedRules: number; ruleSummaries: { clause: string; testNumber: number; description: string; failedChecks: number }[] };
    };
    return {
      file: job.itemDetails.name, flavour, compliant: v.compliant, passedRules: v.details.passedRules, failedRules: v.details.failedRules,
      failures: v.details.ruleSummaries.map((r) => ({ rule: `${r.clause}-${r.testNumber}`, clause: r.clause, test: r.testNumber, description: r.description, count: r.failedChecks })),
    };
  });
}
