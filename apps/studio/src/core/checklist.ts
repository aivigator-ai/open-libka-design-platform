/**
 * One Checks list (since 2.0.3): the problems in the source, Guard's findings in the outputs and the lint
 * hints, merged by where they are in the document. A finding is placed on its block by the source line the Studio's
 * render marks (`data-lk-line`, read by Guard's scan), or by the text it quotes; what cannot be placed is listed for
 * the whole document. One item per block and rule across outputs: the same finding on the web page and the slides is
 * one item tagged with both, and a source problem and Guard's finding of the same thing are one item with the
 * problem's fixes. Pure: no signals, no DOM (tested in Node).
 */
import { sourceLine, type Block, type Hint, type LibkaDocument, type Problem } from '@libka/model';
import type { Check } from '../state/store.ts';

/** Where an item fails: the source, or one of the outputs (the web page and PDF, the slides, the Word file). */
export type Output = 'source' | 'web' | 'slides' | 'word';
export const OUTPUT_ORDER: readonly Output[] = ['source', 'web', 'slides', 'word'];
export const outputOf = (target: Check['target']): Exclude<Output, 'source'> => (target === 'manual' ? 'web' : target === 'deck' ? 'slides' : 'word');

/** A finding of Guard's, with the check it came from (for its explanation and "Show in the preview"). */
export interface Finding { output: Exclude<Output, 'source'>; target: Check['target']; mode: Check['mode']; rule: string; message: string; selector: string }

export interface Item {
  key: string;
  /** Must fix (a problem, a finding), or advice (a lint hint: never counted, never stops anything). */
  kind: 'fix' | 'advice';
  /** Where in the source it is (the problem's line, or the block's). */
  line: number | null;
  /** The problem's code, Guard's rule, or "hint". */
  rule: string;
  message: string;
  outputs: Output[];
  /** The source problems (each with its fixes; two pictures without alt text in one gallery are two). */
  problems: Problem[];
  findings: Finding[];
}

/** A top-level block of the document: its index, the line it starts on, its type, and the section it is in. */
export interface Place { index: number; line: number; type: string; section: string | null }

export interface Group {
  /** The block, or `document` (its properties: the front matter, the title) or `unplaced` (the whole document). */
  place: Place | 'document' | 'unplaced';
  items: Item[];
}

export interface Checklist {
  groups: Group[];
  /** How many items must be fixed (the readiness chip's number) and how many are advice. */
  fix: number;
  advice: number;
}

/** Different words for the same thing: a source problem and Guard's findings that merge into one item. */
const SAME: Readonly<Record<string, string>> = {
  'image-alt': 'alt', 'svg-img-alt': 'alt', 'role-img-alt': 'alt', 'docx-alt-text': 'alt',
  'image-caption': 'caption', 'figure-caption': 'caption',
};
const same = (rule: string) => SAME[rule] ?? rule;

const text = (inline: unknown): string => (Array.isArray(inline) ? inline.map((n) => (n as { value?: string; children?: unknown }).value ?? text((n as { children?: unknown }).children)).join('') : '');

/** The document's top-level blocks as places, each with the ## or ### section it is in. */
export function placesOf(doc: LibkaDocument | null): Place[] {
  let section: string | null = null;
  return (doc?.blocks ?? []).map((b: Block, index) => {
    if (b.type === 'heading' && b.level <= 3) section = text(b.text);
    return { index, line: sourceLine(b) ?? 0, type: b.type, section };
  }).filter((p) => p.line > 0);
}

/** The place a source line is in: the last block that starts on or before it (null: before the first block). */
export function placeAt(places: readonly Place[], line: number): Place | null {
  let found: Place | null = null;
  for (const p of places) { if (p.line <= line) found = p; else break; }
  return found;
}

/** The source line holding the text a message quotes ("…"), when it is long enough to tell. */
export function quotedLine(source: string, message: string): number | null {
  const quoted = message.match(/"([^"]{3,}?)…?"/)?.[1]?.replace(/…$/, '');
  if (!quoted) return null;
  const at = source.split('\n').findIndex((l) => l.includes(quoted));
  return at >= 0 ? at + 1 : null;
}

export interface ChecklistInput {
  doc: LibkaDocument | null;
  source: string;
  problems: readonly Problem[];
  hints: readonly Hint[];
  checks: readonly Check[] | null;
}

export function buildChecklist({ doc, source, problems, hints, checks }: ChecklistInput): Checklist {
  const places = placesOf(doc);
  const items = new Map<string, Item>();
  const where = new Map<string, Group['place']>();
  const keyOf = (line: number | null) => {
    if (line === null) return { k: 'unplaced', place: 'unplaced' as const };
    const p = placeAt(places, line);
    return p ? { k: String(p.index), place: p } : { k: 'document', place: 'document' as const };
  };
  const add = (line: number | null, rule: string, kind: Item['kind'], message: string, output: Output, finding?: Finding) => {
    const { k, place } = keyOf(line);
    const key = `${k}|${kind}|${kind === 'advice' ? message : same(rule)}`;
    let item = items.get(key);
    if (!item) {
      item = { key, kind, line, rule, message, outputs: [], problems: [], findings: [] };
      items.set(key, item);
      where.set(key, place);
    }
    if (!item.outputs.includes(output)) item.outputs.push(output);
    if (finding) item.findings.push(finding);
    if (item.line === null && line !== null) item.line = line;
    return item;
  };
  // the problems first: an item they share with Guard's findings keeps the problem's words and fixes
  for (const p of problems) add(p.line, p.code, 'fix', p.message, 'source').problems.push(p);
  for (const c of checks ?? []) {
    const output = outputOf(c.target);
    for (const v of c.violations) {
      const line = v.line ?? quotedLine(source, v.message);
      add(line, v.rule, 'fix', v.message, output, { output, target: c.target, mode: c.mode, rule: v.rule, message: v.message, selector: v.target });
    }
  }
  for (const h of hints) add(h.line, 'hint', 'advice', h.message, 'source');

  // groups in the document's order: its properties first, then each block, the unplaced last; in each, fixes first
  const order = (p: Group['place']) => (p === 'document' ? -1 : p === 'unplaced' ? Number.MAX_SAFE_INTEGER : p.index);
  const groups = new Map<string, Group>();
  for (const [key, item] of items) {
    const place = where.get(key)!;
    const gk = typeof place === 'string' ? place : String(place.index);
    if (!groups.has(gk)) groups.set(gk, { place, items: [] });
    groups.get(gk)!.items.push(item);
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => (a.kind === b.kind ? (a.line ?? 0) - (b.line ?? 0) : a.kind === 'fix' ? -1 : 1));
    for (const i of g.items) i.outputs.sort((a, b) => OUTPUT_ORDER.indexOf(a) - OUTPUT_ORDER.indexOf(b));
  }
  const list = [...groups.values()].sort((a, b) => order(a.place) - order(b.place));
  const all = [...items.values()];
  return { groups: list, fix: all.filter((i) => i.kind === 'fix').length, advice: all.filter((i) => i.kind === 'advice').length };
}

/** The groups of one place (the "This block" filter): the block's, or the document's properties. */
export function forPlace(list: Checklist, place: Place | 'document' | null): Group[] {
  if (!place) return [];
  return list.groups.filter((g) => (place === 'document' ? g.place === 'document' : typeof g.place !== 'string' && g.place.index === place.index));
}
