import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT, LIBKA_BRAND, MODES, NEUTRAL_CHROMA, canonical, chroma, contrast, describeCheck, gateMode, hexToLab, hueDifference, hueOf, rgbToHex, solve,
  type Brand, type Hex,
} from '../src/index.ts';

const SEED = 20261114;
/** 150 brands per property on every run; LIBKA_DESIGN_FULL=1 (the weekly and release runs) tries 2,000. */
const RUNS = process.env.LIBKA_DESIGN_FULL === '1' ? 2000 : 150;
const brand =(primary?: string, secondary?: string, neutral: Brand['neutral'] = 'none'): Brand =>
  ({ color: { ...(primary ? { primary: primary as Hex } : {}), ...(secondary ? { secondary: secondary as Hex } : {}) }, fonts: {}, neutral, pinned: false });
const role = (s: ReturnType<typeof solve>, mode: string, key: string) => s.roles.find((r) => r.mode === mode && r.key === key)!;
const hex = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 })).map((c) => rgbToHex(c));
const failures = (s: ReturnType<typeof solve>) => s.gates.failures.map((f) => describeCheck(f, s.values));

describe('LibKa\'s own brand', () => {
  it('is pinned: the palette is the tokens\', verified, never moved', () => {
    const s = solve(LIBKA_BRAND);
    expect(s.pinned).toBe(true);
    expect(s.values).toBe(DEFAULT.values);
    expect(s.roles).toEqual([]);
    expect(failures(s)).toEqual([]);
  });
});

describe('six example brands', () => {
  const cases: Array<[string, string, string | undefined]> = [
    ['LibKa\'s colours, solved', '#0F8FA1', '#4C4ECC'], ['bright yellow', '#FFD400', undefined], ['purple', '#7A1FA2', undefined],
    ['dark navy', '#0B1F4D', undefined], ['signal red with teal', '#E30613', '#00A19A'], ['light pink', '#F7B5CD', undefined],
  ];
  for (const [name, p, s] of cases) for (const neutral of ['none', 'tinted'] as const) {
    it(`solves ${name}${neutral === 'tinted' ? ', tinted,' : ''} with every check passing`, () => {
      expect(failures(solve(brand(p, s, neutral)))).toEqual([]);
    });
  }
  it('keeps a brand colour that passes and moves one that fails only as far as it must', () => {
    expect(role(solve(brand('#7A1FA2')), 'light', 'semantic.text.accent')).toMatchObject({ value: '#7A1FA2', reason: 'kept' });
    expect(role(solve(brand('#0B1F4D')), 'light', 'semantic.text.accent')).toMatchObject({ value: '#0B1F4D', reason: 'kept' });
    const yellow = role(solve(brand('#FFD400')), 'light', 'semantic.text.accent');
    expect(yellow).toMatchObject({ value: '#7B6500', reason: 'moved' });   // the nearest passing shade at the yellow's hue
    expect(yellow.ratio).toBeLessThan(4.5 + 0.05 + 0.1);                 // the nearest passing shade, not a darker one
  });
  it('lifts a dark brand colour to the anchor lightness in the dark modes', () => {
    expect(role(solve(brand('#0B1F4D')), 'dark', 'semantic.text.accent')).toMatchObject({ value: '#9AB7F1', reason: 'lifted' });
    expect(role(solve(brand('#0F8FA1')), 'dark', 'semantic.action.accent')).toMatchObject({ value: '#5EC9DC', reason: 'lifted' });
  });
  it('keeps a bright brand fill on a button by giving it the dark label', () => {
    const s = solve(brand('#FFD400'));
    expect(role(s, 'light', 'component.button.accent.background')).toMatchObject({ value: '#FFD400', reason: 'label' });
    expect(s.values.light['semantic.action.on-accent']).toBe('#111723');
    expect(s.values.light['component.button.accent.text']).toBe('#111723');
  });
  it('moves the fill when no label passes on it', () => {
    const s = solve(brand('#0F8FA1'));
    expect(role(s, 'light-high-contrast', 'component.button.accent.background').reason).toBe('fill-moved');
  });
});

describe('what the brand does not touch', () => {
  const red = solve(brand('#E30613', '#00A19A'));
  it('leaves info and the status colours their own hues, so a red brand never looks like an error', () => {
    for (const mode of MODES) for (const key of ['semantic.status.info', 'semantic.text.info', 'semantic.status.error', 'semantic.text.error',
      'semantic.status.success', 'semantic.status.warning', 'component.badge.info.text', 'component.badge.info.background', 'semantic.focus.ring']) {
      expect(red.values[mode][key], `${mode} ${key}`).toBe(DEFAULT.values[mode][key]);
    }
  });
  it('leaves the greys alone without the tint', () => {
    for (const mode of MODES) for (const key of ['semantic.bg.canvas', 'semantic.text.primary', 'semantic.border.default'])
      expect(red.values[mode][key]).toBe(DEFAULT.values[mode][key]);
  });
  it('leaves the AI family alone without a secondary colour', () => {
    const s = solve(brand('#E30613'));
    for (const mode of MODES) for (const key of ['semantic.status.ai', 'semantic.text.ai', 'component.button.iris.background'])
      expect(s.values[mode][key]).toBe(DEFAULT.values[mode][key]);
  });
  it('keeps aliases and tints consistent: components follow their roles', () => {
    for (const mode of MODES) {
      const v = red.values[mode];
      expect(v['semantic.action.accent-strong']).toBe(v['semantic.text.accent']);
      expect(v['component.input.border.focus']).toBe(v['semantic.action.accent']);
      expect(v['component.card.ai.border']).toBe(v['semantic.action.iris']);
      expect(v['semantic.action.iris']).toBe(v['semantic.status.ai']);
    }
    const accent = red.values.light['semantic.action.accent']!;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
    expect(red.values.light['component.nav.item.active.background']).toBe(`rgb(${r} ${g} ${b} / .10)`);
    expect(red.values['light-high-contrast']['component.table.row.selected']).toBe(`rgb(${r} ${g} ${b} / .10)`);   // made of light's, as the tokens do
  });
});

describe('the neutral tint (opt-in)', () => {
  const s = solve(brand('#7A1FA2', undefined, 'tinted'));
  const purple = hueOf(hexToLab('#7A1FA2'))!;
  it('gives the standard modes\' greys the brand\'s hue at a small chroma, at their own lightness', () => {
    for (const mode of ['light', 'dark'] as const) for (const key of ['semantic.bg.canvas', 'semantic.bg.elevated', 'semantic.border.default']) {
      const lab = hexToLab(s.values[mode][key]!), base = hexToLab(DEFAULT.values[mode][key]!);
      expect(Math.abs(lab.L - base.L)).toBeLessThan(0.01);
      expect(chroma(lab)).toBeLessThan(NEUTRAL_CHROMA + 0.006);
      expect(hueDifference(hueOf(lab)!, purple)).toBeLessThanOrEqual(25);   // 8-bit steps move a near-grey's hue
    }
  });
  it('keeps near-black and near-white in high contrast', () => {
    for (const mode of ['light-high-contrast', 'dark-high-contrast'] as const) for (const key of ['semantic.bg.canvas', 'semantic.text.primary', 'semantic.border.default'])
      expect(s.values[mode][key]).toBe(DEFAULT.values[mode][key]);
  });
});

describe('properties over any brand (fast-check, fixed seed)', { timeout: process.env.LIBKA_DESIGN_FULL === '1' ? 600000 : 60000 }, () => {
  const anyBrand = fc.record({
    primary: hex, secondary: fc.option(hex, { nil: undefined }), neutral: fc.constantFrom<Brand['neutral']>('none', 'tinted'),
  }).map((b) => brand(b.primary, b.secondary, b.neutral));

  it('every gated pair passes in every mode', () => {
    fc.assert(fc.property(anyBrand, (b) => solve(b).gates.failures.length === 0), { seed: SEED, numRuns: RUNS });
  });
  it('the same brand gives the same palette, byte for byte', () => {
    fc.assert(fc.property(anyBrand, (b) => canonical(solve(b)) === canonical(solve(b))), { seed: SEED + 1, numRuns: 40 });
  });
  it('a moved colour keeps the brand\'s hue (unless it is nearly grey)', () => {
    fc.assert(fc.property(anyBrand, (b) => solve(b).roles.every((r) => {
      if (r.reason === 'fallback' || r.reason === 'tinted') return true;
      const seed = hueOf(hexToLab(r.seed)), value = hexToLab(r.value), hue = hueOf(value);
      return !seed || !hue || chroma(value) < 0.03 || hueDifference(seed, hue) <= 4;
    })), { seed: SEED + 2, numRuns: RUNS });
  });
  it('a brand colour that passes as text in light mode is used unchanged', () => {
    fc.assert(fc.property(hex, (p) => {
      const s = solve(brand(p));
      const passesAsIs = gateMode('light', { ...s.values.light, 'semantic.text.accent': p }, (fg) => fg === 'semantic.text.accent').every((c) => c.pass);
      return !passesAsIs || s.values.light['semantic.text.accent'] === p;
    }), { seed: SEED + 3, numRuns: RUNS });
  });
  // Not a property: solving the solved text colour again. The text colour must pass on a tint of the UI colour, which
  // is seeded from the brand too, so a darker seed gives a darker tint and the text may move once more.
  it('the hard cases pass: pure primaries, white, black, greys, a brand equal to a background', () => {
    for (const p of ['#FFFF00', '#FFFFFF', '#000000', '#808080', '#FF0000', '#0000FF', '#00FF00', '#F6F7F9', '#111723', '#1A2130'])
      for (const neutral of ['none', 'tinted'] as const) expect(failures(solve(brand(p, p, neutral))), `${p} ${neutral}`).toEqual([]);
  });
});

describe('the words the solver gives the CLI and the Studio', () => {
  it('records the seed, the value, the ratio, the need and the reason of each role', () => {
    const r = role(solve(brand('#FFD400')), 'light', 'semantic.text.accent');
    expect(r).toMatchObject({ mode: 'light', key: 'semantic.text.accent', seed: '#FFD400', value: '#7B6500', reason: 'moved', need: 4.5 });
    expect(contrast(r.value, '#F1F4F7')).toBeGreaterThanOrEqual(r.ratio - 1e-9);
  });
});

describe('a link colour (brand.yml typography.link.color)', () => {
  const yellow = (link?: string): Brand => ({ ...brand('#F2C500', '#1D4E89'), color: { primary: '#F2C500' as Hex, secondary: '#1D4E89' as Hex, ...(link ? { link: link as Hex } : {}) } });

  it('seeds links and accent text instead of the primary colour, which keeps bars, borders and the button', () => {
    const s = solve(yellow('#1D4E89'));
    expect(s.gates.failures).toEqual([]);
    expect(role(s, 'light', 'semantic.text.accent')).toMatchObject({ seed: '#1D4E89', value: '#1D4E89', reason: 'kept' });
    expect(s.values.light['semantic.action.accent-strong']).toBe('#1D4E89');
    expect(role(s, 'light', 'semantic.action.accent').seed).toBe('#F2C500');
    expect(role(s, 'light', 'component.button.accent.background').seed).toBe('#F2C500');
    for (const mode of MODES) expect(hueDifference(hueOf(hexToLab(role(s, mode, 'semantic.text.accent').value))!, hueOf(hexToLab('#1D4E89' as Hex))!)).toBeLessThan(4);
  });

  it('is solved like every role: a link colour too light for text moves to pass, at its hue', () => {
    const s = solve(yellow('#7FB8FF'));
    expect(s.gates.failures).toEqual([]);
    expect(role(s, 'light', 'semantic.text.accent')).toMatchObject({ seed: '#7FB8FF', reason: 'moved', need: 4.5 });
  });

  it('works without a primary colour: only links and accent text change', () => {
    const s = solve({ ...brand(), color: { link: '#1D4E89' as Hex } });
    expect(s.gates.failures).toEqual([]);
    expect(role(s, 'light', 'semantic.text.accent').value).toBe('#1D4E89');
    expect(s.values.light['semantic.action.accent']).toBe(DEFAULT.values.light['semantic.action.accent']);
  });

  it('changes nothing when it is absent', () => {
    expect(canonical(solve(yellow()).values)).toBe(canonical(solve(brand('#F2C500', '#1D4E89')).values));
  });
});
