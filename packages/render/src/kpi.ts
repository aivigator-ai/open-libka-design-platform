/**
 * A :::kpi figure in words and as a small trend line, shared by every output.
 *
 * The change is always written out ("up 6 pp since Q2") with "better" or "worse" when it went somewhere; the arrow and
 * the color only repeat it. The trend line is a picture for the eye, hidden from screen readers: the trend sentence
 * says its first, last, highest and lowest values, and the values themselves are listed under "Show the data".
 */
import type { KpiItem } from '@libka/model';
import { escapeHtml } from './escape.ts';
import { fill, type Lang, type Labels } from './labels.ts';

export interface KpiWords {
  /** "up 6 pp since Q2", or undefined without a change. */
  change?: string;
  /** Whether the change is good, bad or neither (no change). */
  tone?: 'good' | 'bad' | 'flat';
  /** "better" / "worse", or undefined. */
  verdict?: string;
  /** The trend sentence, or undefined without a trend. */
  trend?: string;
  /** The trend values as text ("81, 85, 88, 94"; with "; " where the language writes decimal commas). */
  values?: string;
}

export function kpiWords(k: KpiItem, lang: Lang, L: Labels): KpiWords {
  const out: KpiWords = {};
  if (k.change && k.direction) {
    const moved = k.direction === 'up' ? fill(L.kpiUp, { amount: k.change }) : k.direction === 'down' ? fill(L.kpiDown, { amount: k.change }) : L.kpiFlat;
    out.change = k.since ? fill(L.kpiSince, { change: moved, since: k.since }) : moved;
    out.tone = k.direction === 'flat' ? 'flat' : k.direction === (k.good ?? 'up') ? 'good' : 'bad';
    if (out.tone !== 'flat') out.verdict = out.tone === 'good' ? L.better : L.worse;
  }
  if (k.trend?.length) {
    const nf = new Intl.NumberFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', { maximumFractionDigits: 2 });
    const t = k.trend;
    out.trend = fill(L.kpiTrend, { n: t.length, first: nf.format(t[0]!), last: nf.format(t[t.length - 1]!), max: nf.format(Math.max(...t)), min: nf.format(Math.min(...t)) });
    out.values = t.map((v) => nf.format(v)).join(lang === 'cs' ? '; ' : ', ');
  }
  return out;
}

/**
 * How wide the widest figure of a row is, in em of the brand font, rounded up to half an em (from 2 to 10). A figure
 * stays on one line, so it is measured whole, spaces included; the widths are a little over the font's, so the
 * estimate errs towards a figure a little smaller than its card allows, never one that overflows.
 */
export function kpiFit(values: readonly string[]): number {
  const width = (ch: string) => /\d/.test(ch) ? 0.62 : /[\s ]/.test(ch) ? 0.28 : /[.,:;'’!|ijlt]/.test(ch) ? 0.34 : /[frI]/.test(ch) ? 0.42
    : /[%MW@]/.test(ch) ? 0.95 : /[mw]/.test(ch) ? 0.85 : /[A-Z€$£]/.test(ch) ? 0.74 : /[a-z]/.test(ch) ? 0.56 : 0.7;
  const em = Math.max(0, ...values.map((v) => [...v.normalize('NFD').replace(/\p{M}/gu, '')].reduce((sum, ch) => sum + width(ch), 0)));
  return Math.min(10, Math.max(2, Math.ceil(em * 2) / 2));
}

/** The trend as a small line, its last point marked; for the eye only (the words carry it). */
export function sparkline(values: number[]): string {
  const W = 120, H = 32, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (W - 2 * pad);
  const y = (v: number) => (max === min ? H / 2 : H - pad - ((v - min) / (max - min)) * (H - 2 * pad));
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values.length - 1;
  return `<svg class="lk-kpi-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><polyline points="${pts.join(' ')}" class="lk-kpi-spark-line"/>` +
    `<circle cx="${x(last).toFixed(1)}" cy="${y(values[last]!).toFixed(1)}" r="3.5" class="lk-kpi-spark-end"/></svg>`;
}

const ARROWS = { up: 'M8 13V3M3.5 7.5 8 3l4.5 4.5', down: 'M8 3v10M3.5 8.5 8 13l4.5-4.5', flat: 'M3 8h10M9 4l4 4-4 4' };

/** The arrow before the change, for the eye only. */
export function kpiArrow(direction: 'up' | 'down' | 'flat'): string {
  return `<svg class="lk-kpi-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${ARROWS[direction]}"/></svg>`;
}

/** One figure's HTML; `text` is its sentence, already rendered. */
export function kpiItemHtml(k: KpiItem, lang: Lang, L: Labels, text: string): string {
  const w = kpiWords(k, lang, L);
  return [
    '  <li class="lk-kpi-item">',
    `    <p class="lk-kpi-label">${escapeHtml(k.label)}</p>`,
    `    <p class="lk-kpi-value">${escapeHtml(k.value)}</p>`,
    w.change ? `    <p class="lk-kpi-change lk-kpi-change--${w.tone}">${kpiArrow(k.direction!)}<span>${escapeHtml(w.change)}</span>${w.verdict ? ` <strong class="lk-kpi-verdict">${escapeHtml(w.verdict)}</strong>` : ''}</p>` : '',
    k.trend ? `    ${sparkline(k.trend)}\n    <p class="lk-visually-hidden">${escapeHtml(w.trend!)}</p>` : '',
    text ? `    <p class="lk-kpi-text">${text}</p>` : '',
    k.trend ? `    <details class="lk-kpi-data"><summary>${escapeHtml(L.showData)}</summary><p>${escapeHtml(w.values!)}</p></details>` : '',
    '  </li>',
  ].filter(Boolean).join('\n');
}
