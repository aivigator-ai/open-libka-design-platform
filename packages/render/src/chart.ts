/**
 * Charts as static SVG, drawn at build time (no script, identical in web, PDF and slides).
 *
 * Manual section 11: series colors in their fixed order (--lk-viz-series-1..6), and hue is never the
 * only encoding: bars and donut parts get the pattern of their series, line points get a marker
 * shape per series. Axes start at zero, no 3D, no gradients, no animation. Every chart has a title,
 * a text summary and its data as a real table ("Show the data", always printed).
 *
 * Bars stand (bar) or lie (hbar, a row per category with its name beside it). Stacked bars put the
 * series of a category into one bar: the total at its end, and a part's value inside the part only
 * where it fits, on a chip of the surface color so its contrast never depends on the fill.
 */
import type { Block } from '@libka/model';
import { escapeHtml } from './escape.ts';
import { fill, plural, type Lang, type Labels } from './labels.ts';

type Chart = Extract<Block, { type: 'chart' }>;

const W = 640, H = 360, LEFT_MIN = 56, RIGHT = 16, TOP = 28, BOTTOM = 44;
const PATTERNS = ['', 'M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2', 'dots', 'M0,0 L8,8 M8,0 L0,8', 'M0,4 H8', 'M4,0 V8'];
/** About how wide a character of 13 px chart type is, and the height a value chip needs. */
const CHAR = 7.5, CHIP_H = 18;

function nice(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 0.25 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step };
}

function patterns(id: string, count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const p = PATTERNS[i]!;
    const hatch = p === 'dots' ? '<circle cx="4" cy="4" r="1.6" class="lk-chart-hatch"/>' : p ? `<path d="${p}" class="lk-chart-hatch"/>` : '';
    return `<pattern id="${id}-p${i + 1}" class="lk-chart-pattern-${i + 1}" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" class="lk-chart-fill-${i + 1}"/>${hatch}</pattern>`;
  }).join('');
}

function marker(i: number, x: number, y: number): string {
  const r = 5;
  const cls = `class="lk-chart-marker lk-chart-fill-${i + 1}"`;
  switch (i % 6) {
    case 0: return `<circle cx="${x}" cy="${y}" r="${r}" ${cls}/>`;
    case 1: return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" ${cls}/>`;
    case 2: return `<path d="M${x},${y - r - 1} L${x + r + 1},${y + r} L${x - r - 1},${y + r} Z" ${cls}/>`;
    case 3: return `<path d="M${x},${y - r - 1} L${x + r + 1},${y} L${x},${y + r + 1} L${x - r - 1},${y} Z" ${cls}/>`;
    // the drawn marks lie on a casing in the text colour, so their shape stands out from the page whatever the series colour
    case 4: { const d = `M${x - r},${y - r} L${x + r},${y + r} M${x + r},${y - r} L${x - r},${y + r}`; return `<path d="${d}" class="lk-chart-casing"/><path d="${d}" class="lk-chart-marker lk-chart-stroke-${i + 1}"/>`; }
    default: return `<circle cx="${x}" cy="${y}" r="${r}" class="lk-chart-casing"/><circle cx="${x}" cy="${y}" r="${r}" class="lk-chart-marker lk-chart-ring lk-chart-stroke-${i + 1}"/>`;
  }
}

const f1 = (n: number) => n.toFixed(1);

/** The width of a value chip for a text (bold figures and % are wider than the average character). */
const chipWidth = (text: string) => Math.ceil(text.length * 8 + 12);

/** A part's value inside a stacked bar: the figure alone (the axis and the total carry the unit), a percentage whole. */
const partText = (c: Chart, fmt: (v: number) => string, v: number) =>
  c.unit && c.unit !== '%' ? fmt(v).slice(0, -(c.unit.length + 1)) : fmt(v);

/** A part's value centred at (x, y) on a chip of the surface color. */
function chip(x: number, y: number, text: string): string {
  const w = chipWidth(text);
  return `<rect x="${f1(x - w / 2)}" y="${f1(y - CHIP_H / 2)}" width="${w}" height="${CHIP_H}" rx="3" class="lk-chart-chip"/>` +
    `<text x="${f1(x)}" y="${f1(y + 4.5)}" text-anchor="middle" class="lk-chart-value">${escapeHtml(text)}</text>`;
}

type Box = { l: number; t: number; r: number; b: number };
const overlaps = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** Whether the segment from (x1, y1) to (x2, y2) touches the box (Liang–Barsky clipping). */
function segmentHits(x1: number, y1: number, x2: number, y2: number, box: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - box.l], [dx, box.r - x1], [-dy, y1 - box.t], [dy, box.b - y1]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/**
 * The value labels of a line chart, each placed above its point, else below it, where it touches no marker, no line
 * (with its casing) and no other label; a value that fits neither way is left out of the drawing (every value stays
 * in the summary and the data table), so a label never sits on another series' mark.
 */
function lineLabels(c: Chart, all: (readonly (readonly [number, number])[])[], fmt: (v: number) => string, left: number): string[] {
  const CASING = 3.5;   // half the casing's width, and a pixel to spare
  const markers: Box[] = all.flat().map(([x, y]) => ({ l: x - 7, t: y - 7, r: x + 7, b: y + 7 }));
  const placed: Box[] = [];
  const out: string[] = [];
  c.series.forEach((s, si) => all[si]!.forEach(([px, py], i) => {
    const text = fmt(s.values[i]!);
    const w = text.length * 8;   // bold figures at 13 px
    // above, below, then beside the point at its corners, where a rising or falling line leaves room
    const spots: [anchor: 'middle' | 'start' | 'end', x: number, base: number][] = [
      ['middle', px, py - 10], ['middle', px, py + 21],
      ['start', px + 8, py - 7], ['end', px - 8, py - 7], ['start', px + 8, py + 18], ['end', px - 8, py + 18],
    ];
    for (const [anchor, x, base] of spots) {
      const l = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x : x - w;
      const box: Box = { l, t: base - 11, r: l + w, b: base + 3 };
      // inside the plot: clear of the value axis's labels on the left
      if (box.t < 2 || box.b > H - BOTTOM || box.l < left + 2 || box.r > W - 2) continue;
      const free = !markers.some((m) => overlaps(m, box)) && !placed.some((p) => overlaps(p, box)) &&
        !all.some((pts) => pts.some(([x1, y1], k) => k > 0 && segmentHits(pts[k - 1]![0], pts[k - 1]![1], x1, y1,
          { l: box.l - CASING, t: box.t - CASING, r: box.r + CASING, b: box.b + CASING })));
      if (!free) continue;
      placed.push(box);
      out.push(`<text x="${f1(x)}" y="${f1(base)}" text-anchor="${anchor}" class="lk-chart-value">${escapeHtml(text)}</text>`);
      break;
    }
  }));
  return out;
}

/** A category name broken into lines of at most `chars` characters (a word longer than that keeps its line). */
function wrap(text: string, chars: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= chars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length ? lines : [''];
}

/** The total of each category across the series (what a stacked bar adds up to). */
export function chartTotals(c: Chart): number[] {
  return c.labels.map((_, i) => c.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
}

/**
 * A chart's words, shared by every output: its values formatted in the document's language, the one-sentence
 * summary (the SVG's description, the Word picture's alt text) and, for a donut, each part with its share.
 */
export function chartText(c: Chart, lang: Lang, L: Labels): { fmt: (v: number) => string; summary: string; parts: string[] } {
  const nf = new Intl.NumberFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', { maximumFractionDigits: 2 });
  const fmt = (v: number) => (c.unit === '%' ? (lang === 'cs' ? `${nf.format(v)} %` : `${nf.format(v)}%`) : c.unit ? `${nf.format(v)} ${c.unit}` : nf.format(v));
  const kind = c.stacked ? (c.kind === 'hbar' ? L.stackedHbar : L.stackedBar) : L[c.kind];
  if (c.kind === 'donut') {
    const values = c.series[0]?.values ?? [];
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const parts = c.labels.map((l, i) => `${l} ${fmt(values[i] ?? 0)} (${nf.format(Math.round(((values[i] ?? 0) / total) * 1000) / 10)} %)`);
    return { fmt, parts, summary: fill(L.donutSummary, { kind, caption: c.caption, parts: parts.join(', ') }) };
  }
  const count = c.series.reduce((n, s) => n + s.values.length, 0);
  const words = { kind, caption: c.caption, values: plural(L.chartValues, count, lang), inSeries: plural(L.chartSeries, c.series.length, lang) };
  let max = -Infinity, min = Infinity, where = '', whereMin = '';
  if (c.stacked) {
    chartTotals(c).forEach((v, i) => {
      if (v > max) { max = v; where = c.labels[i]!; }
      if (v < min) { min = v; whereMin = c.labels[i]!; }
    });
    return { fmt, parts: [], summary: fill(L.stackedSummary, { ...words, max: fmt(max), where, min: fmt(min), whereMin }) };
  }
  c.series.forEach((s) => s.values.forEach((v, i) => {
    const at = c.series.length > 1 ? `${s.name}, ${c.labels[i]}` : `${c.labels[i]}`;
    if (v > max) { max = v; where = at; }
    if (v < min) { min = v; whereMin = at; }
  }));
  return { fmt, parts: [], summary: fill(L.summary, { ...words, max: fmt(max), where, min: fmt(min), whereMin }) };
}

/** The value axis: its ticks from the lowest value (or zero) to a round top. */
function scale(values: number[]): { bottom: number; top: number; ticks: number[] } {
  const min = Math.min(0, ...values);
  const { top, step } = nice(Math.max(...values, 0));
  const bottom = min < 0 ? -nice(-min).top : 0;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(v);
  return { bottom, top, ticks };
}

function svgOpen(c: Chart, id: string, summary: string, height: number, extra = ''): string {
  return `<svg class="lk-chart-svg${extra}" viewBox="0 0 ${W} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc">` +
    `<title id="${id}-title">${escapeHtml(c.caption)}</title><desc id="${id}-desc">${escapeHtml(summary)}</desc>`;
}

/** Standing bars and lines: categories along the bottom, values up the left. */
function columns(c: Chart, id: string, fmt: (v: number) => string, summary: string): string {
  const totals = c.stacked ? chartTotals(c) : [];
  const { bottom, top, ticks: values } = scale(c.stacked ? totals : c.series.flatMap((s) => s.values));
  const tickLabels = values.map((v) => fmt(Math.round(v * 100) / 100));
  // the axis takes the width of its longest label ("300 members"), about 8 px a character at 13 px
  const LEFT = Math.max(LEFT_MIN, Math.ceil(Math.max(...tickLabels.map((t) => t.length)) * 8) + 14);
  const plotW = W - LEFT - RIGHT, plotH = H - TOP - BOTTOM;
  const y = (v: number) => TOP + plotH - ((v - bottom) / (top - bottom)) * plotH;
  const ticks = values.map((v, i) => `<line x1="${LEFT}" x2="${W - RIGHT}" y1="${f1(y(v))}" y2="${f1(y(v))}" class="lk-chart-grid"/>` +
    `<text x="${LEFT - 8}" y="${f1(y(v) + 4)}" text-anchor="end" class="lk-chart-tick">${escapeHtml(tickLabels[i]!)}</text>`);
  const band = plotW / Math.max(1, c.labels.length);
  const xLabels = c.labels.map((l, i) => `<text x="${f1(LEFT + band * (i + 0.5))}" y="${H - BOTTOM + 20}" text-anchor="middle" class="lk-chart-tick lk-chart-category">${escapeHtml(l)}</text>`).join('');
  const direct = c.labels.length * c.series.length <= 12;
  let marks = '';
  if (c.kind === 'bar' && c.stacked) {
    const bw = band * 0.6;
    marks = c.labels.map((_, i) => {
      const x = LEFT + band * i + (band - bw) / 2;
      let sum = 0, parts = '', chips = '';
      c.series.forEach((s, si) => {
        const v = s.values[i] ?? 0;
        const y0 = y(sum), y1 = y(sum + v);
        sum += v;
        parts += `<rect x="${f1(x + 1)}" y="${f1(y1)}" width="${f1(Math.max(1, bw - 2))}" height="${f1(Math.max(0, y0 - y1))}" fill="url(#${id}-p${si + 1})" class="lk-chart-shape"/>`;
        const text = partText(c, fmt, v);
        if (v > 0 && y0 - y1 >= CHIP_H + 4 && bw - 2 >= chipWidth(text) + 4) chips += chip(x + bw / 2, (y0 + y1) / 2, text);
      });
      const total = c.labels.length <= 12 ? `<text x="${f1(x + bw / 2)}" y="${f1(y(sum) - 6)}" text-anchor="middle" class="lk-chart-value lk-chart-total">${escapeHtml(fmt(sum))}</text>` : '';
      return parts + chips + total;
    }).join('');
  } else if (c.kind === 'bar') {
    const group = band * 0.72, bw = group / Math.max(1, c.series.length);
    marks = c.series.map((s, si) => s.values.map((v, i) => {
      const x = LEFT + band * i + (band - group) / 2 + bw * si;
      const h = y(0) - y(v);
      const label = direct ? `<text x="${f1(x + bw / 2)}" y="${f1(y(v) - 6)}" text-anchor="middle" class="lk-chart-value">${escapeHtml(fmt(v))}</text>` : '';
      return `<rect x="${f1(x + 1)}" y="${f1(y(v))}" width="${f1(Math.max(1, bw - 2))}" height="${f1(Math.max(0, h))}" fill="url(#${id}-p${si + 1})" class="lk-chart-shape"/>${label}`;
    }).join('')).join('');
  } else {
    const all = c.series.map((s) => s.values.map((v, i) => [LEFT + band * (i + 0.5), y(v)] as const));
    const labels = direct ? lineLabels(c, all, fmt, LEFT) : [];
    marks = c.series.map((_, si) => {
      const pts = all[si]!;
      const points = pts.map(([px, py]) => `${f1(px)},${f1(py)}`).join(' ');
      // a line on a casing in the text colour: the line's shape passes 3:1 against the page in every mode (WCAG 1.4.11)
      const line = `<polyline points="${points}" class="lk-chart-casing"/><polyline points="${points}" class="lk-chart-line lk-chart-stroke-${si + 1}"/>`;
      return line + pts.map(([px, py]) => marker(si, px, py)).join('');
    }).join('') + labels.join('');
  }
  return svgOpen(c, id, summary, H) + `<defs>${patterns(id, c.series.length)}</defs>${ticks.join('')}` +
    `<line x1="${LEFT}" x2="${W - RIGHT}" y1="${f1(y(0))}" y2="${f1(y(0))}" class="lk-chart-axis"/>${marks}${xLabels}</svg>`;
}

/** Lying bars (hbar): a row per category with its name on the left, values along the bottom. */
function rows(c: Chart, id: string, fmt: (v: number) => string, summary: string): string {
  const totals = c.stacked ? chartTotals(c) : [];
  const { bottom, top, ticks: values } = scale(c.stacked ? totals : c.series.flatMap((s) => s.values));
  const tickLabels = values.map((v) => fmt(Math.round(v * 100) / 100));
  // the names take up to a third of the width, broken into lines; each row is tall enough for its bars and its name
  const chars = Math.floor(200 / CHAR);
  const names = c.labels.map((l) => wrap(l, chars));
  const nameW = Math.min(200, Math.ceil(Math.max(...names.flat().map((l) => l.length)) * CHAR));
  const LEFT = nameW + 20;
  const thick = c.stacked ? 30 : c.series.length === 1 ? 24 : 18;
  const group = c.stacked ? thick : thick * c.series.length;
  const band = Math.max(group + 16, Math.max(...names.map((n) => n.length)) * 16 + 10);
  const ends = c.stacked ? totals : c.series.flatMap((s) => s.values);
  // the value at a bar's end is bold: about 9 px a character, after a 6 px gap
  const valueW = Math.ceil(Math.max(...ends.map((v) => fmt(v).length)) * 9) + 12;
  const RIGHT_H = Math.max(RIGHT, valueW, Math.ceil(tickLabels[tickLabels.length - 1]!.length * CHAR / 2) + 4);
  const TOP_H = 8, plotH = band * c.labels.length, height = TOP_H + plotH + 30;
  const plotW = W - LEFT - RIGHT_H;
  const x = (v: number) => LEFT + ((v - bottom) / (top - bottom)) * plotW;
  const ticks = values.map((v, i) => `<line x1="${f1(x(v))}" x2="${f1(x(v))}" y1="${TOP_H}" y2="${TOP_H + plotH}" class="lk-chart-grid"/>` +
    `<text x="${f1(x(v))}" y="${TOP_H + plotH + 20}" text-anchor="middle" class="lk-chart-tick">${escapeHtml(tickLabels[i]!)}</text>`);
  const yLabels = names.map((lines, i) => {
    const mid = TOP_H + band * (i + 0.5), first = mid - ((lines.length - 1) * 16) / 2 + 4.5;
    return `<text x="${LEFT - 10}" y="${f1(first)}" text-anchor="end" class="lk-chart-tick lk-chart-category">${lines
      .map((l, k) => `<tspan x="${LEFT - 10}"${k ? ' dy="16"' : ''}>${escapeHtml(l)}</tspan>`).join('')}</text>`;
  }).join('');
  let marks = '';
  if (c.stacked) {
    marks = c.labels.map((_, i) => {
      const top0 = TOP_H + band * i + (band - thick) / 2;
      let sum = 0, parts = '', chips = '';
      c.series.forEach((s, si) => {
        const v = s.values[i] ?? 0;
        const x0 = x(sum), x1 = x(sum + v);
        sum += v;
        parts += `<rect x="${f1(x0)}" y="${f1(top0 + 1)}" width="${f1(Math.max(0, x1 - x0))}" height="${thick - 2}" fill="url(#${id}-p${si + 1})" class="lk-chart-shape"/>`;
        const text = partText(c, fmt, v);
        if (v > 0 && x1 - x0 >= chipWidth(text) + 6 && thick - 2 >= CHIP_H + 2) chips += chip((x0 + x1) / 2, top0 + thick / 2, text);
      });
      return parts + chips + `<text x="${f1(x(sum) + 6)}" y="${f1(top0 + thick / 2 + 4.5)}" class="lk-chart-value lk-chart-total">${escapeHtml(fmt(sum))}</text>`;
    }).join('');
  } else {
    marks = c.series.map((s, si) => s.values.map((v, i) => {
      const y0 = TOP_H + band * i + (band - group) / 2 + thick * si;
      return `<rect x="${f1(x(0))}" y="${f1(y0 + 1)}" width="${f1(Math.max(0, x(v) - x(0)))}" height="${thick - 2}" fill="url(#${id}-p${si + 1})" class="lk-chart-shape"/>` +
        `<text x="${f1(x(v) + 6)}" y="${f1(y0 + thick / 2 + 4.5)}" class="lk-chart-value">${escapeHtml(fmt(v))}</text>`;
    }).join('')).join('');
  }
  return svgOpen(c, id, summary, height, ' lk-chart-svg--hbar') + `<defs>${patterns(id, c.series.length)}</defs>${ticks.join('')}${marks}` +
    `<line x1="${f1(x(0))}" x2="${f1(x(0))}" y1="${TOP_H}" y2="${TOP_H + plotH}" class="lk-chart-axis"/>${yLabels}</svg>`;
}

export function renderChart(c: Chart, id: string, lang: Lang, L: Labels): string {
  const { fmt, summary, parts } = chartText(c, lang, L);
  let svg = '';
  let legend = '';

  if (c.kind === 'donut') {
    const values = c.series[0]?.values ?? [];
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = 180, cy = 180, ro = 140, ri = 84;
    let angle = -Math.PI / 2;
    const arcs = values.map((v, i) => {
      const a0 = angle, a1 = angle + (v / total) * Math.PI * 2;
      angle = a1;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
      const d = v >= total ? `M${p(ro, -Math.PI / 2)} A${ro},${ro} 0 1 1 ${p(ro, Math.PI * 1.5 - 0.0001)} L${p(ri, Math.PI * 1.5 - 0.0001)} A${ri},${ri} 0 1 0 ${p(ri, -Math.PI / 2)} Z`
        : `M${p(ro, a0)} A${ro},${ro} 0 ${large} 1 ${p(ro, a1)} L${p(ri, a1)} A${ri},${ri} 0 ${large} 0 ${p(ri, a0)} Z`;
      return `<path d="${d}" fill="url(#${id}-p${i + 1})" class="lk-chart-shape"/>`;
    }).join('');
    svg = `<svg class="lk-chart-svg lk-chart-svg--donut" viewBox="0 0 360 360" role="img" aria-labelledby="${id}-title ${id}-desc">`;
    svg +=`<title id="${id}-title">${escapeHtml(c.caption)}</title><desc id="${id}-desc">${escapeHtml(summary)}</desc><defs>${patterns(id, values.length)}</defs>${arcs}</svg>`;
    legend = c.labels.map((l, i) => `<li><svg class="lk-chart-key" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" fill="url(#${id}-p${i + 1})" class="lk-chart-shape"/></svg>${escapeHtml(parts[i]!)}</li>`).join('');
  } else {
    svg = c.kind === 'hbar' ? rows(c, id, fmt, summary) : columns(c, id, fmt, summary);
    if (c.series.length > 1 || c.kind === 'line') {
      legend = c.series.map((s, i) => `<li><svg class="lk-chart-key" viewBox="0 0 16 16" aria-hidden="true">${c.kind !== 'line'
        ? `<rect width="16" height="16" fill="url(#${id}-p${i + 1})" class="lk-chart-shape"/>`
        : `<line x1="0" x2="16" y1="8" y2="8" class="lk-chart-casing"/><line x1="0" x2="16" y1="8" y2="8" class="lk-chart-line lk-chart-stroke-${i + 1}"/>${marker(i, 8, 8)}`}</svg>${escapeHtml(s.name)}</li>`).join('');
    }
  }

  const totals = c.stacked ? chartTotals(c) : null;
  const table = `<table class="lk-table"><caption>${escapeHtml(c.caption)}</caption>` +
    `<thead><tr><th scope="col">${escapeHtml(c.category)}</th>${c.series.map((s) => `<th scope="col">${escapeHtml(s.name)}</th>`).join('')}${totals ? `<th scope="col">${escapeHtml(L.total)}</th>` : ''}</tr></thead>` +
    `<tbody>${c.labels.map((l, i) => `<tr><th scope="row">${escapeHtml(l)}</th>${c.series.map((s) => `<td>${escapeHtml(fmt(s.values[i] ?? 0))}</td>`).join('')}${totals ? `<td>${escapeHtml(fmt(totals[i]!))}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  return [`<figure class="lk-block lk-chart" id="${id}">`,
    `<div class="lk-chart-plot">${svg}</div>`,
    legend ? `<ul class="lk-chart-legend">${legend}</ul>` : '',
    `<figcaption>${escapeHtml(c.caption)}</figcaption>`,
    `<details class="lk-chart-data"><summary>${escapeHtml(L.showData)}</summary><div class="lk-table-scroll">${table}</div></details>`,
    '</figure>'].filter(Boolean).join('\n');
}
