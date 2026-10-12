/**
 * Charts as static SVG, drawn at build time (no script, identical in web, PDF and slides).
 *
 * Manual section 11: series colors in their fixed order (--lk-viz-series-1..6), and hue is never the
 * only encoding: bars and donut parts get the pattern of their series, line points get a marker
 * shape per series. Axes start at zero, no 3D, no gradients, no animation. Every chart has a title,
 * a text summary and its data as a real table ("Show the data", always printed).
 */
import type { Block } from '@libka/model';
import { escapeHtml } from './escape.ts';
import { fill, plural, type Lang, type Labels } from './labels.ts';

type Chart = Extract<Block, { type: 'chart' }>;

const W = 640, H = 360, LEFT_MIN = 56, RIGHT = 16, TOP = 28, BOTTOM = 44;
const PATTERNS = ['', 'M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2', 'dots', 'M0,0 L8,8 M8,0 L0,8', 'M0,4 H8', 'M4,0 V8'];

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
    case 4: return `<path d="M${x - r},${y - r} L${x + r},${y + r} M${x + r},${y - r} L${x - r},${y + r}" class="lk-chart-marker lk-chart-stroke-${i + 1}"/>`;
    default: return `<circle cx="${x}" cy="${y}" r="${r}" class="lk-chart-marker lk-chart-ring lk-chart-stroke-${i + 1}"/>`;
  }
}

/**
 * A chart's words, shared by every output: its values formatted in the document's language, the one-sentence
 * summary (the SVG's description, the Word picture's alt text) and, for a donut, each part with its share.
 */
export function chartText(c: Chart, lang: Lang, L: Labels): { fmt: (v: number) => string; summary: string; parts: string[] } {
  const nf = new Intl.NumberFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', { maximumFractionDigits: 2 });
  const fmt = (v: number) => (c.unit === '%' ? (lang === 'cs' ? `${nf.format(v)} %` : `${nf.format(v)}%`) : c.unit ? `${nf.format(v)} ${c.unit}` : nf.format(v));
  const kind = L[c.kind];
  if (c.kind === 'donut') {
    const values = c.series[0]?.values ?? [];
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const parts = c.labels.map((l, i) => `${l} ${fmt(values[i] ?? 0)} (${nf.format(Math.round(((values[i] ?? 0) / total) * 1000) / 10)} %)`);
    return { fmt, parts, summary: fill(L.donutSummary, { kind, caption: c.caption, parts: parts.join(', ') }) };
  }
  let max = -Infinity, min = Infinity, where = '', whereMin = '';
  c.series.forEach((s) => s.values.forEach((v, i) => {
    const at = c.series.length > 1 ? `${s.name}, ${c.labels[i]}` : `${c.labels[i]}`;
    if (v > max) { max = v; where = at; }
    if (v < min) { min = v; whereMin = at; }
  }));
  const count = c.series.reduce((n, s) => n + s.values.length, 0);
  return { fmt, parts: [], summary: fill(L.summary, {
    kind, caption: c.caption, values: plural(L.chartValues, count, lang), inSeries: plural(L.chartSeries, c.series.length, lang),
    max: fmt(max), where, min: fmt(min), whereMin,
  }) };
}

export function renderChart(c: Chart, id: string, lang: Lang, L: Labels): string {
  const { fmt, summary, parts } = chartText(c, lang, L);
  const all = c.series.flatMap((s) => s.values);
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
    const min = Math.min(0, ...all);
    const { top, step } = nice(Math.max(...all, 0));
    const bottom = min < 0 ? -nice(-min).top : 0;
    const values: number[] = [];
    for (let v = bottom; v <= top + step / 2; v += step) values.push(v);
    const tickLabels = values.map((v) => fmt(Math.round(v * 100) / 100));
    // the axis takes the width of its longest label ("300 members"), about 8 px a character at 13 px
    const LEFT = Math.max(LEFT_MIN, Math.ceil(Math.max(...tickLabels.map((t) => t.length)) * 8) + 14);
    const plotW = W - LEFT - RIGHT, plotH = H - TOP - BOTTOM;
    const y = (v: number) => TOP + plotH - ((v - bottom) / (top - bottom)) * plotH;
    const ticks = values.map((v, i) => `<line x1="${LEFT}" x2="${W - RIGHT}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="lk-chart-grid"/>` +
      `<text x="${LEFT - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="lk-chart-tick">${escapeHtml(tickLabels[i]!)}</text>`);
    const band = plotW / Math.max(1, c.labels.length);
    const xLabels = c.labels.map((l, i) => `<text x="${(LEFT + band * (i + 0.5)).toFixed(1)}" y="${H - BOTTOM + 20}" text-anchor="middle" class="lk-chart-tick lk-chart-category">${escapeHtml(l)}</text>`).join('');
    const direct = c.labels.length * c.series.length <= 12;
    let marks = '';
    if (c.kind === 'bar') {
      const group = band * 0.72, bw = group / Math.max(1, c.series.length);
      marks = c.series.map((s, si) => s.values.map((v, i) => {
        const x = LEFT + band * i + (band - group) / 2 + bw * si;
        const h = y(0) - y(v);
        const label = direct ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y(v) - 6).toFixed(1)}" text-anchor="middle" class="lk-chart-value">${escapeHtml(fmt(v))}</text>` : '';
        return `<rect x="${(x + 1).toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="url(#${id}-p${si + 1})" class="lk-chart-shape"/>${label}`;
      }).join('')).join('');
    } else {
      marks = c.series.map((s, si) => {
        const pts = s.values.map((v, i) => [LEFT + band * (i + 0.5), y(v)] as const);
        const line = `<polyline points="${pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}" class="lk-chart-line lk-chart-stroke-${si + 1}"/>`;
        const labels = direct ? pts.map(([px, py], i) => `<text x="${px.toFixed(1)}" y="${(py - 10).toFixed(1)}" text-anchor="middle" class="lk-chart-value">${escapeHtml(fmt(s.values[i]!))}</text>`).join('') : '';
        return line + pts.map(([px, py]) => marker(si, px, py)).join('') + labels;
      }).join('');
    }
    svg =`<svg class="lk-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-title ${id}-desc">` +
      `<title id="${id}-title">${escapeHtml(c.caption)}</title><desc id="${id}-desc">${escapeHtml(summary)}</desc>` +
      `<defs>${patterns(id, c.series.length)}</defs>${ticks.join('')}` +
      `<line x1="${LEFT}" x2="${W - RIGHT}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="lk-chart-axis"/>${marks}${xLabels}</svg>`;
    if (c.series.length > 1 || c.kind === 'line') {
      legend = c.series.map((s, i) => `<li><svg class="lk-chart-key" viewBox="0 0 16 16" aria-hidden="true">${c.kind === 'bar'
        ? `<rect width="16" height="16" fill="url(#${id}-p${i + 1})" class="lk-chart-shape"/>`
        : `<line x1="0" x2="16" y1="8" y2="8" class="lk-chart-line lk-chart-stroke-${i + 1}"/>${marker(i, 8, 8)}`}</svg>${escapeHtml(s.name)}</li>`).join('');
    }
  }

  const table = `<table class="lk-table"><caption>${escapeHtml(c.caption)}</caption>` +
    `<thead><tr><th scope="col">${escapeHtml(c.category)}</th>${c.series.map((s) => `<th scope="col">${escapeHtml(s.name)}</th>`).join('')}</tr></thead>` +
    `<tbody>${c.labels.map((l, i) => `<tr><th scope="row">${escapeHtml(l)}</th>${c.series.map((s) => `<td>${escapeHtml(fmt(s.values[i] ?? 0))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return [`<figure class="lk-block lk-chart" id="${id}">`,
    `<div class="lk-chart-plot">${svg}</div>`,
    legend ? `<ul class="lk-chart-legend">${legend}</ul>` : '',
    `<figcaption>${escapeHtml(c.caption)}</figcaption>`,
    `<details class="lk-chart-data"><summary>${escapeHtml(L.showData)}</summary><div class="lk-table-scroll">${table}</div></details>`,
    '</figure>'].filter(Boolean).join('\n');
}
