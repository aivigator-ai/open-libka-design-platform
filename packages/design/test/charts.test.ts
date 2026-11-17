import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALIKE, contrast, hexToLab, isHighContrast, LIBKA_BRAND, LIBKA_SERIES, MARGIN, MODES, parseBrand, resolveDesign, solveCharts, type Brand } from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const brand = (yaml: string): Brand => { const r = parseBrand(yaml); expect(r.problems.filter((p) => p.severity === 'error')).toEqual([]); return r.brand!; };
const BACKGROUNDS = ['semantic.bg.canvas', 'semantic.bg.surface', 'semantic.bg.elevated'];

describe('the chart series of a design', () => {
  it('are LibKa\'s own per mode for LibKa\'s brand, each passing in its mode, as the tokens have them', () => {
    const css = readFileSync(join(root, 'libka-tokens.css'), 'utf8');
    const block = (sel: string) => { const s = css.indexOf(`${sel} {\n`); return css.slice(s, css.indexOf('\n}', s)); };
    const SEL = { 'light': ':root', 'dark': '[data-theme="dark"]', 'light-high-contrast': '[data-contrast="high"]', 'dark-high-contrast': '[data-theme="dark"][data-contrast="high"]' } as const;
    const d = resolveDesign(LIBKA_BRAND).design;
    for (const mode of MODES) {
      LIBKA_SERIES[mode].forEach((hex, i) => expect(block(SEL[mode]), `${mode} ${i + 1}`).toContain(`--lk-viz-series-${i + 1}: ${hex};`));
      expect(d.charts.series[mode]).toEqual(LIBKA_SERIES[mode]);
      const need = isHighContrast(mode) ? 4.5 : 3;
      for (const hex of LIBKA_SERIES[mode]) for (const bg of BACKGROUNDS) expect(contrast(hex, d.palette[mode][bg]!), `${mode} ${hex}`).toBeGreaterThanOrEqual(need);
    }
    // the light set differs from the dark one: each mode has its own lightness
    expect(LIBKA_SERIES.light).not.toEqual(LIBKA_SERIES.dark);
  });

  it('fill a brand\'s empty places with LibKa\'s value of that mode', () => {
    const b = brand('color:\n  primary: "#7A1FA2"\n');
    const d = resolveDesign(b).design;
    for (const mode of MODES) {
      const fill = d.charts.results.filter((r) => r.mode === mode && r.source === 'libka');
      expect(fill.length).toBeGreaterThan(0);
      for (const r of fill) expect(LIBKA_SERIES[mode]).toContain(r.value);
    }
  });

  it('lead with the primary and secondary colours, and reach 3:1 (4.5:1 in high contrast) in every mode, keeping the hue', () => {
    const b = brand('color:\n  primary: "#FFD400"\n  secondary: "#C2185B"\n');
    const d = resolveDesign(b).design;
    for (const mode of MODES) {
      const need = isHighContrast(mode) ? 4.5 : 3;
      expect(d.charts.series[mode]).toHaveLength(6);
      for (const hex of d.charts.series[mode]) for (const bg of BACKGROUNDS) expect(contrast(hex, d.palette[mode][bg]!), `${mode} ${hex}`).toBeGreaterThanOrEqual(need + MARGIN);
    }
    const first = d.charts.results.filter((r) => r.index === 0);
    expect(first.every((r) => r.seed === '#FFD400' && r.source === 'primary')).toBe(true);
    const hue = (h: string) => { const l = hexToLab(h); return Math.atan2(l.b, l.a); };
    for (const r of first) expect(Math.abs(hue(r.value) - hue(r.seed))).toBeLessThan(0.07);
    expect(d.charts.results.find((r) => r.index === 1 && r.mode === 'light')!.source).toBe('secondary');
  });

  it('take a brand\'s own list, by hex or palette name, fill the rest from LibKa skipping colours too alike, and name pairs too alike', () => {
    const b = brand('color:\n  palette:\n    sun: "#FFD400"\n    teal: "#0F8FA1"\ndefaults:\n  libka:\n    charts: [sun, teal, "#FFE14D"]\n');
    expect(b.charts).toEqual(['#FFD400', '#0F8FA1', '#FFE14D']);
    const c = solveCharts(b, resolveDesign(b).design.palette);
    const light = c.results.filter((r) => r.mode === 'light');
    expect(light.map((r) => r.source)).toEqual(['charts', 'charts', 'charts', 'libka', 'libka', 'libka']);
    // LibKa's aqua is the brand's teal: not repeated
    expect(light.slice(3).map((r) => r.seed)).not.toContain('#0F8FA1');
    expect(c.alike).toEqual([[1, 3]]);
    expect(resolveDesign(b).design.charts.series.light.every((h, i, all) => all.indexOf(h) === i)).toBe(true);
    void ALIKE;
  });

  it('refuse a list that is not 1 to 6 colours, or names a colour the palette does not have', () => {
    expect(parseBrand('defaults:\n  libka:\n    charts: "#0F8FA1"\n').problems.map((p) => p.code)).toEqual(['brand-charts']);
    expect(parseBrand(`defaults:\n  libka:\n    charts: [${Array(7).fill('"#0F8FA1"').join(', ')}]\n`).problems.map((p) => p.code)).toEqual(['brand-charts']);
    expect(parseBrand('defaults:\n  libka:\n    charts: [sky]\n').problems.map((p) => p.code)).toEqual(['brand-color-format']);
  });
});
