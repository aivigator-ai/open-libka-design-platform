/**
 * What each check covers, in the terms buyers and regulators use: WCAG 2.2 success criteria (A and AA) and the
 * matching clauses of EN 301 549 v4.1.1, the European standard behind the European Accessibility Act (clause 9 for
 * web content, clause 10 for non-web documents such as a PDF). Automated checks prove only part of a criterion, so
 * a report says "checked automatically", never "conforms", and lists what needs a person.
 */
import { createRequire } from 'node:module';
import type { GuardReport } from './index.ts';

export interface Criterion { sc: string; title: string; level: 'A' | 'AA' }

/** The 55 success criteria of WCAG 2.2 at levels A and AA (4.1.1 Parsing is obsolete in 2.2). */
export const WCAG22: readonly Criterion[] = ([
  ['1.1.1', 'Non-text Content', 'A'], ['1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A'], ['1.2.2', 'Captions (Prerecorded)', 'A'],
  ['1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'A'], ['1.2.4', 'Captions (Live)', 'AA'], ['1.2.5', 'Audio Description (Prerecorded)', 'AA'],
  ['1.3.1', 'Info and Relationships', 'A'], ['1.3.2', 'Meaningful Sequence', 'A'], ['1.3.3', 'Sensory Characteristics', 'A'], ['1.3.4', 'Orientation', 'AA'],
  ['1.3.5', 'Identify Input Purpose', 'AA'], ['1.4.1', 'Use of Color', 'A'], ['1.4.2', 'Audio Control', 'A'], ['1.4.3', 'Contrast (Minimum)', 'AA'],
  ['1.4.4', 'Resize Text', 'AA'], ['1.4.5', 'Images of Text', 'AA'], ['1.4.10', 'Reflow', 'AA'], ['1.4.11', 'Non-text Contrast', 'AA'],
  ['1.4.12', 'Text Spacing', 'AA'], ['1.4.13', 'Content on Hover or Focus', 'AA'], ['2.1.1', 'Keyboard', 'A'], ['2.1.2', 'No Keyboard Trap', 'A'],
  ['2.1.4', 'Character Key Shortcuts', 'A'], ['2.2.1', 'Timing Adjustable', 'A'], ['2.2.2', 'Pause, Stop, Hide', 'A'], ['2.3.1', 'Three Flashes or Below Threshold', 'A'],
  ['2.4.1', 'Bypass Blocks', 'A'], ['2.4.2', 'Page Titled', 'A'], ['2.4.3', 'Focus Order', 'A'], ['2.4.4', 'Link Purpose (In Context)', 'A'],
  ['2.4.5', 'Multiple Ways', 'AA'], ['2.4.6', 'Headings and Labels', 'AA'], ['2.4.7', 'Focus Visible', 'AA'], ['2.4.11', 'Focus Not Obscured (Minimum)', 'AA'],
  ['2.5.1', 'Pointer Gestures', 'A'], ['2.5.2', 'Pointer Cancellation', 'A'], ['2.5.3', 'Label in Name', 'A'], ['2.5.4', 'Motion Actuation', 'A'],
  ['2.5.7', 'Dragging Movements', 'AA'], ['2.5.8', 'Target Size (Minimum)', 'AA'], ['3.1.1', 'Language of Page', 'A'], ['3.1.2', 'Language of Parts', 'AA'],
  ['3.2.1', 'On Focus', 'A'], ['3.2.2', 'On Input', 'A'], ['3.2.3', 'Consistent Navigation', 'AA'], ['3.2.4', 'Consistent Identification', 'AA'],
  ['3.2.6', 'Consistent Help', 'A'], ['3.3.1', 'Error Identification', 'A'], ['3.3.2', 'Labels or Instructions', 'A'], ['3.3.3', 'Error Suggestion', 'AA'],
  ['3.3.4', 'Error Prevention (Legal, Financial, Data)', 'AA'], ['3.3.7', 'Redundant Entry', 'A'], ['3.3.8', 'Accessible Authentication (Minimum)', 'AA'],
  ['4.1.2', 'Name, Role, Value', 'A'], ['4.1.3', 'Status Messages', 'AA'],
] as const).map(([sc, title, level]) => ({ sc, title, level }));

/** The EN 301 549 v4.1.1 clause for a criterion: 9.x for web content, 10.x for a document such as a PDF. */
export const enClause = (sc: string, kind: 'web' | 'document') => `${kind === 'web' ? 9 : 10}.${sc}`;

const require = createRequire(import.meta.url);
let axeMap: Map<string, string[]> | undefined;
/** The criteria each axe rule tests, from axe-core's own tags ("wcag143" → 1.4.3). */
export function axeCriteria(): Map<string, string[]> {
  if (axeMap) return axeMap;
  const axe = require('axe-core') as { getRules(tags?: string[]): { ruleId: string; tags: string[] }[] };
  axeMap = new Map(axe.getRules().map((r) => [r.ruleId, r.tags.filter((t) => /^wcag\d{3,5}$/.test(t)).map(tagToSc)]));
  return axeMap;
}
const tagToSc = (tag: string) => { const d = tag.slice(4); return `${d[0]}.${d[1]}.${d.slice(2)}`; };

/** The criteria Guard's own rules test (rules with no criterion are LibKa's quality or security rules). */
export const GUARD_CRITERIA: Readonly<Record<string, string[]>> = {
  contrast: ['1.4.3'],
  'figure-caption': ['1.1.1', '1.3.1'],
  'table-caption': ['1.3.1'],
  'table-header-scope': ['1.3.1'],
  'slide-overflow': [],
  reflow: ['1.4.10'],
  'chart-text-clipped': [],
  'no-inline-style': [],
  'csp-blocked': [],
};
/** The criteria each Word-file rule tests (packages/guard/src/docx.ts); EN 301 549 clause 10 covers non-web documents. */
export const DOCX_CRITERIA: Readonly<Record<string, string[]>> = {
  'docx-package': [],
  'docx-title': ['2.4.2'],
  'docx-language': ['3.1.1'],
  'docx-heading-order': ['1.3.1', '2.4.6'],
  'docx-alt-text': ['1.1.1'],
  'docx-table-header': ['1.3.1'],
  'docx-link-text': ['2.4.4'],
  'docx-contrast': ['1.4.3'],
};
/** What a PDF that passes PDF/UA-1 shows for these criteria (tagged structure, alternative text, order, title, link purpose, language). */
export const PDFUA_CRITERIA = ['1.1.1', '1.3.1', '1.3.2', '2.4.2', '2.4.4', '3.1.1'];

/** What the content holds, for criteria that cannot apply without it. */
export interface ContentFacts { media: boolean; forms: boolean }

export interface Conformance {
  wcag: '2.2';
  level: 'AA';
  en301549: 'v4.1.1';
  /** Automated checks for these ran and passed (a person may still need to review other aspects). */
  checked: string[];
  failed: string[];
  /** No automated check covers these: a person decides. */
  review: string[];
  notApplicable: string[];
}

/** Criteria that cannot apply without media, forms or live content. */
function notApplicable(facts: ContentFacts): Set<string> {
  const na = new Set(['1.2.4']);   // LibKa outputs have no live media
  if (!facts.media) for (const sc of ['1.2.1', '1.2.2', '1.2.3', '1.2.5', '1.4.2']) na.add(sc);
  if (!facts.forms) for (const sc of ['1.3.5', '3.3.1', '3.3.2', '3.3.3', '3.3.4', '3.3.7', '3.3.8']) na.add(sc);
  return na;
}

/**
 * The status of every WCAG 2.2 A/AA criterion for one output, from its Guard report: failed if any check for it
 * failed, checked if checks for it ran and passed, not applicable when the content cannot have it, otherwise review.
 */
export function conformance(report: GuardReport, facts: ContentFacts): Conformance {
  const axe = axeCriteria();
  const failed = new Set<string>();
  const ran = new Set<string>();
  for (const c of report.checks) {
    if (c.id === 'axe') {
      for (const sc of c.covered ?? []) ran.add(sc);
      for (const v of c.violations) for (const sc of axe.get(v.rule) ?? []) failed.add(sc);
    } else if (c.id === 'pdfua') {
      for (const sc of PDFUA_CRITERIA) (c.violations.length ? failed : ran).add(sc);
    } else if (c.id === 'contrast') {
      if (c.mode === 'standard') (c.violations.length ? failed : ran).add('1.4.3');
    } else if (c.id === 'docx') {
      for (const sc of new Set(Object.values(DOCX_CRITERIA).flat())) ran.add(sc);
      for (const v of c.violations) for (const sc of DOCX_CRITERIA[v.rule] ?? []) failed.add(sc);
    } else {
      for (const sc of new Set(Object.values(GUARD_CRITERIA).flat())) if (sc !== '1.4.3') ran.add(sc);
      for (const v of c.violations) for (const sc of GUARD_CRITERIA[v.rule] ?? []) failed.add(sc);
    }
  }
  const na = notApplicable(facts);
  const out: Conformance = { wcag: '2.2', level: 'AA', en301549: 'v4.1.1', checked: [], failed: [], review: [], notApplicable: [] };
  for (const { sc } of WCAG22) {
    if (failed.has(sc)) out.failed.push(sc);
    else if (na.has(sc)) out.notApplicable.push(sc);
    else if (ran.has(sc)) out.checked.push(sc);
    else out.review.push(sc);
  }
  return out;
}

/** A readable report of one output's conformance: a LibKa document. `pdfuaSkipped` says why the PDF was not validated. */
export function conformanceMarkdown(name: string, target: 'manual' | 'deck', c: Conformance, pdf: boolean, docx = false, pdfuaSkipped?: string): string {
  const status = (sc: string) => (c.failed.includes(sc) ? 'failed' : c.checked.includes(sc) ? 'checked automatically' : c.notApplicable.includes(sc) ? 'not applicable' : 'needs a person');
  const rows = WCAG22.map((x) => `| ${x.sc} ${x.title} | ${x.level} | ${enClause(x.sc, 'web')}${pdf || docx ? `, ${enClause(x.sc, 'document')}` : ''} | ${status(x.sc)} |`);
  const documents = [pdf ? 'PDF' : '', docx ? 'Word file' : ''].filter(Boolean);
  const what = [target === 'deck' ? 'Slides' : 'Web page', ...documents];
  return [
    '---', `title: "Accessibility checks: ${name}"`, `subtitle: ${what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}` : what[0]}, WCAG 2.2 level AA and EN 301 549 v4.1.1`, 'lang: en', '---', '',
    ':::metrics',
    `- **${c.checked.length}** criteria checked automatically`,
    `- **${c.failed.length}** failed`,
    `- **${c.review.length}** need a person`,
    `- **${c.notApplicable.length}** not applicable`,
    ':::', '',
    'Automated checks cover part of each criterion they test. "Checked automatically" means those checks ran and passed, not that the criterion is fully met; a person reviews the rest before claiming conformance.', '',
    ...(pdf && pdfuaSkipped ? [
      ':::callout[The PDF was not validated]{variant=warning}',
      `PDF/UA-1 was not checked: ${pdfuaSkipped}. The statuses below come from the checks of the ${target === 'deck' ? 'slides' : 'web page'}${docx ? ' and the Word file' : ''}; the PDF's own tags, reading order and alternative text are not covered. Build again with veraPDF installed to check them.`,
      ':::', '',
    ] : []),
    `:::table{caption="WCAG 2.2 A and AA success criteria for ${name}"}`, '',
    '| Criterion | Level | EN 301 549 clause | Status |', '|---|---|---|---|', ...rows, '', ':::', '',
  ].join('\n');
}
