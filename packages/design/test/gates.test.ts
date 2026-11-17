import { contrastRatio } from '@libka/contrast';
import { describe, expect, it } from 'vitest';
import { DEFAULT, MARGIN, describeCheck, gate, type PaletteValues } from '../src/index.ts';

const withValue = (mode: keyof PaletteValues, key: string, value: string): PaletteValues =>
  ({ ...DEFAULT.values, [mode]: { ...DEFAULT.values[mode], [key]: value } });

describe('the gates ported from generate.py', () => {
  const { checks, failures } = gate(DEFAULT.values);
  const legacy = checks.filter((c) => c.kind !== 'brand-ui');
  const count = (kind: string) => checks.filter((c) => c.kind === kind).length;

  it('run the same 366 checks as generate.py on the default palette', () => {
    // generate.py: "TEXT CONTRAST … 102 checks (light, dark); 168 checks (high contrast)", "BUTTON … 36", "BADGE … 60"
    expect(count('text') + count('ui') + count('control')).toBe(102 + 168);
    expect(count('button')).toBe(36);
    expect(count('badge')).toBe(60);
    expect(legacy).toHaveLength(366);
  });
  it('add 24 checks of the brand-driven UI colours at 3:1 in the standard modes', () => {
    expect(count('brand-ui')).toBe(24);
  });
  it('pass the default palette with room above the margin', () => {
    expect(failures.map((f) => describeCheck(f, DEFAULT.values))).toEqual([]);
    const headroom = Math.min(...checks.map((c) => c.ratio - c.need));
    expect(headroom).toBeGreaterThan(MARGIN);
    expect(headroom).toBeCloseTo(0.09, 2);   // 0.113 in generate.py, which keeps a tint's fractions
  });
  it('measure solid pairs exactly as the Python build does', () => {
    const solid = legacy.filter((c) => !c.on.includes('%') && c.kind !== 'badge');
    for (const c of solid.slice(0, 200)) {
      const fg = DEFAULT.values[c.mode][c.fg]!;
      const bg = `#${c.bg.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
      expect(Math.abs(c.ratio - contrastRatio(fg, bg))).toBeLessThan(1e-12);
    }
  });
});

describe('a strict gate', () => {
  it('fails a pair at the threshold and one just under the margin', () => {
    // #767676 on white is 4.54:1: AA by generate.py's rule (>= 4.5), not by axe's strict rule with LibKa's margin
    const r = gate(withValue('light', 'semantic.text.muted', '#767676'));
    const f = r.failures.filter((c) => c.fg === 'semantic.text.muted');
    expect(f.length).toBeGreaterThan(0);
    expect(describeCheck(f[0]!)).toMatch(/^light: semantic\.text\.muted on semantic\.bg\.\w+ = 4\.\d\d:1 \(needs 4\.5:1 plus 0\.05\)$/);
  });
  it('fails a button label that loses its fill', () => {
    const r = gate(withValue('light', 'component.button.accent.background', '#0F8FA1'));
    expect(r.failures.some((c) => c.kind === 'button' && c.fg === 'component.button.accent.text')).toBe(true);
  });
  it('fails a coloured text on its own tint, a badge on its fill, and a brand colour under 3:1', () => {
    const tint = gate(withValue('light', 'semantic.action.accent', '#00303A'));   // a darker tint under text.accent
    expect(tint.failures.some((c) => c.fg === 'semantic.text.accent' && c.on.includes('12%'))).toBe(true);
    const badge = gate(withValue('light', 'component.badge.ai.background', 'rgb(76 78 204 / .9)'));
    expect(badge.failures.some((c) => c.kind === 'badge' && c.fg === 'component.badge.ai.text')).toBe(true);
    const ui = gate(withValue('light', 'semantic.status.ai', '#B9BAF0'));
    expect(ui.failures.some((c) => c.kind === 'brand-ui' && c.fg === 'semantic.status.ai')).toBe(true);
  });
  it('fails high-contrast UI colours under 4.5:1', () => {
    const r = gate(withValue('light-high-contrast', 'semantic.border.default', '#767676'));
    expect(r.failures.some((c) => c.kind === 'ui' && c.mode === 'light-high-contrast')).toBe(true);
  });
  it('throws when a colour the gates need is missing', () => {
    const values = { ...DEFAULT.values, dark: { ...DEFAULT.values.dark, 'semantic.text.primary': 'transparent' } };
    expect(() => gate(values)).toThrow(/semantic\.text\.primary is not a solid colour/);
  });
});
