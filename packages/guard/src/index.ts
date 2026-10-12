/**
 * LibKa Guard: checks rendered output in headless Chrome.
 *
 *   axe            axe-core with the WCAG 2.0/2.1/2.2 A and AA rules
 *   contrast       every visible text against its real (composited) background:
 *                    standard colors       4.5:1, large text 3:1   (WCAG AA)
 *                    prefers-contrast:more 7:1,   large text 4.5:1 (what LibKa high contrast promises)
 *   structure      LibKa rules: tables have a caption and scoped headers, figures have a caption,
 *                  no chart label is cut off at the edge of its drawing,
 *                  no inline style attributes (colors come from tokens); in decks, every slide fits
 *                  its 1280×720 canvas (Guard checks a deck with all slides shown, via libkaDeck.showAll);
 *                  reflow: loaded 320 CSS pixels wide, nothing scrolls sideways (WCAG 1.4.10)
 *
 * Chrome: the installed one (channel "chrome") or the browser at LIBKA_BROWSER.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Browser, Page } from 'playwright-core';
import { AXE_RULES_OFF, AXE_TAGS, expandPage, mergeScans, scanContrast, scanReflow, scanStructure, settle, type ContrastArgs, type ScanResult } from './scan.ts';

export interface Violation {
  rule: string;
  message: string;
  target: string;
}

export interface CheckResult {
  id: 'axe' | 'contrast' | 'structure' | 'pdfua' | 'docx';
  mode: 'standard' | 'more-contrast';
  title: string;
  checked: number;
  skipped: number;
  violations: Violation[];
  /** The WCAG success criteria the check exercised (axe: its rules that applied to the page). */
  covered?: string[];
}

export interface GuardReport {
  passed: boolean;
  checks: CheckResult[];
}

const require = createRequire(import.meta.url);
export const AXE_VERSION: string = (require('axe-core/package.json') as { version: string }).version;
const AXE_SOURCE = () => readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  const executablePath = process.env.LIBKA_BROWSER;
  return chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
}

async function open(page: Page, url: string, contrast: 'no-preference' | 'more') {
  await page.emulateMedia({ contrast, reducedMotion: 'reduce' });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // a deck shows every slide at full size, so all of them are checked
  await page.evaluate(() => (window as unknown as { libkaDeck?: { showAll(): void } }).libkaDeck?.showAll());
  await page.evaluate(settle);
}

/** axe-core's WCAG 2.2 A/AA rules on the page as it is now (axe must be injected first). */
function axeOn(page: Page): Promise<ScanResult> {
  return page.evaluate(async ({ tags, rules }) => {
    // @ts-expect-error axe is injected by evaluating its source
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules, resultTypes: ['violations', 'passes'], preload: false });
    // the criteria of every rule that applied ("wcag143" → "1.4.3")
    const covered = [...new Set([...r.passes, ...r.violations].flatMap((x: { tags: string[] }) => x.tags)
      .filter((t: string) => /^wcag\d{3,5}$/.test(t)).map((t: string) => `${t[4]}.${t[5]}.${t.slice(6)}`))];
    return {
      checked: r.passes.length + r.violations.length, skipped: 0,
      violations: r.violations.flatMap((v: { id: string; help: string; nodes: { target: string[] }[] }) =>
        v.nodes.map((n) => ({ rule: v.id, message: v.help, target: n.target.join(' ') }))),
      covered,
    };
  }, { tags: [...AXE_TAGS], rules: { ...AXE_RULES_OFF } });
}

/**
 * Guard on an open page exactly as it is now, without reloading it: a view of an app such as the Studio's library or
 * an open dialog. axe-core, contrast with standard colours and with more contrast requested, and the structure rules.
 */
export async function guardPage(page: Page): Promise<GuardReport> {
  await page.emulateMedia({ contrast: 'no-preference', reducedMotion: 'reduce' });
  await page.evaluate(settle);
  await page.evaluate(AXE_SOURCE());
  const checks: CheckResult[] = [
    { id: 'axe', mode: 'standard', title: `axe-core ${AXE_VERSION}, WCAG 2.2 A/AA rules`, ...await axeOn(page) },
    { id: 'contrast', mode: 'standard', title: 'Text contrast, AA (4.5:1, large 3:1)', ...await page.evaluate(scanContrast, { normal: 4.5, large: 3 }) },
    { id: 'structure', mode: 'standard', title: 'LibKa structure rules', ...await page.evaluate(scanStructure) },
  ];
  await page.emulateMedia({ contrast: 'more' });
  // the page hears of the change at its next frames (a media query's change event), then its transitions run
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(settle);
  checks.push({ id: 'contrast', mode: 'more-contrast', title: 'Text contrast with "more contrast" requested (7:1, large 4.5:1)', ...await page.evaluate(scanContrast, { normal: 7, large: 4.5 }) });
  await page.emulateMedia({ contrast: 'no-preference' });
  return { passed: checks.every((c) => c.violations.length === 0), checks };
}

/** Guard on a page: a file, or a page served over http (such as the Studio). */
export async function guardHtml(htmlPath: string, browser?: Browser): Promise<GuardReport> {
  const own = !browser;
  const b = browser ?? (await launchBrowser());
  const url = /^https?:\/\//.test(htmlPath) ? htmlPath : pathToFileURL(htmlPath).href;
  const checks: CheckResult[] = [];
  try {
    const page = await b.newPage();
    // the page's own Content Security Policy stays on: anything it blocks is a finding (axe is injected through
    // the debugging protocol, which the policy does not govern)
    const blocked: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) blocked.push(m.text()); });
    const runAxe = () => axeOn(page);
    /** As loaded, then (when the page has tabs or details) with everything shown. */
    const bothStates = async (args: ContrastArgs, withAxe: boolean) => {
      if (withAxe) await page.evaluate(AXE_SOURCE());
      const axe = withAxe ? await runAxe() : { checked: 0, skipped: 0, violations: [] };
      const contrast = await page.evaluate(scanContrast, args);
      const expanded = await page.evaluate(expandPage);
      if (expanded) await page.evaluate(settle);
      return {
        axe: expanded && withAxe ? mergeScans(axe, await runAxe()) : axe,
        contrast: expanded ? mergeScans(contrast, await page.evaluate(scanContrast, args)) : contrast,
      };
    };

    await open(page, url, 'no-preference');
    const standard = await bothStates({ normal: 4.5, large: 3 }, true);
    checks.push({ id: 'axe', mode: 'standard', title: `axe-core ${AXE_VERSION}, WCAG 2.2 A/AA rules`, ...standard.axe });
    checks.push({ id: 'contrast', mode: 'standard', title: 'Text contrast, AA (4.5:1, large 3:1)', ...standard.contrast });
    const structure = await page.evaluate(scanStructure);

    await open(page, url, 'more');
    const more = await bothStates({ normal: 7, large: 4.5 }, false);
    checks.push({ id: 'contrast', mode: 'more-contrast', title: 'Text contrast with "more contrast" requested (7:1, large 4.5:1)', ...more.contrast });
    await page.close();
    // reflow: the page loaded on its own 320 CSS pixels wide, as on a small phone (WCAG 1.4.10)
    const narrow = await b.newPage({ viewport: { width: 320, height: 640 } });
    await narrow.emulateMedia({ reducedMotion: 'reduce' });
    await narrow.goto(url, { waitUntil: 'load' });
    await narrow.evaluate(() => document.fonts.ready);
    await narrow.evaluate(settle);
    const reflow = await narrow.evaluate(scanReflow);
    await narrow.close();
    // the page worked under its own policy: nothing it needs was blocked, in either contrast mode
    checks.splice(2, 0, {
      id: 'structure', mode: 'standard', title: 'LibKa structure rules', ...structure,
      checked: structure.checked + 1 + reflow.checked,
      violations: [...structure.violations, ...reflow.violations,
        ...[...new Set(blocked)].map((m) => ({ rule: 'csp-blocked', message: `the page's Content Security Policy blocked something it needs: ${m.slice(0, 200)}`, target: 'page' }))],
    });
  } finally {
    if (own) await b.close();
  }
  return { passed: checks.every((c) => c.violations.length === 0), checks };
}

export function formatReport(report: GuardReport): string {
  const lines = report.checks.map((c) => {
    const head = `${c.violations.length ? '✗' : '✓'} ${c.title}${c.mode === 'more-contrast' ? '' : ''}: ` +
      `${c.checked} checked${c.skipped ? `, ${c.skipped} not measurable` : ''}, ${c.violations.length} violation(s)`;
    return [head, ...c.violations.slice(0, 20).map((v) => `    ${v.rule}: ${v.message} [${v.target}]`)].join('\n');
  });
  return lines.join('\n');
}
