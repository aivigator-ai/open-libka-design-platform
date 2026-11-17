import { describe, expect, it } from 'vitest';
import { parseBrand, type DesignProblem } from '../src/index.ts';

const codes = (problems: DesignProblem[]) => problems.map((p) => `${p.severity} ${p.code} ${p.path}`);

/** A brand as Quarto's documentation writes one, plus LibKa's fields (the organisation and colours are invented). */
const QUARTO_STYLE = `
meta:
  name:
    full: Larkspur Research Institute
    short: Larkspur
  link:
    home: https://example.org
logo:
  images:
    mark: { path: logos/mark.svg, alt: Larkspur logo }
    mark-dark: logos/mark-dark.svg
  small: mark
  medium:
    light: mark
    dark: mark-dark
color:
  palette:
    pine: "#1B5E4A"
    sand: "#E9D8A6"
  primary: pine
  secondary: "#6A4C93"
  background: "#FFFFFF"
  danger: "#C1121F"
typography:
  fonts:
    - family: Literata
      source: google
  base:
    family: Literata
    size: 16px
  headings: Space Grotesk
defaults:
  bootstrap:
    defaults:
      enable-rounded: false
  libka:
    id: larkspur
    version: 2026.1
    issuer: Larkspur Communications
    neutral: tinted
`;

describe('a brand.yml file', () => {
  const { brand, problems } = parseBrand(QUARTO_STYLE);

  it('gives LibKa the subset it can prove', () => {
    expect(brand).toEqual({
      id: 'larkspur', version: '2026.1', issuer: 'Larkspur Communications',
      name: { full: 'Larkspur Research Institute', short: 'Larkspur' },
      color: { primary: '#1B5E4A', secondary: '#6A4C93' },
      fonts: { body: 'literata', heading: 'space-grotesk' },
      logo: {
        small: { light: { path: 'logos/mark.svg', alt: 'Larkspur logo' } },
        medium: { light: { path: 'logos/mark.svg', alt: 'Larkspur logo' }, dark: { path: 'logos/mark-dark.svg', alt: 'Larkspur Research Institute' } },
      },
      neutral: 'tinted',
      pinned: false,
    });
  });
  it('reports every key it does not use, never ignoring one silently', () => {
    expect(codes(problems)).toEqual([
      'info brand-color-not-applied color.background',
      'warning brand-key-unsupported color.danger',
      'warning brand-key-unsupported typography.base.size',
      'info brand-font-source typography.fonts.0.source',
      'info brand-defaults-other defaults.bootstrap',
    ]);
    expect(problems.find((p) => p.code === 'brand-key-unsupported' && p.path === 'color.danger')!.message).toMatch(/status colours/);
  });
});

describe('brand problems', () => {
  const check = (text: string) => codes(parseBrand(text).problems);

  it('are errors for keys brand.yml does not have, with a suggestion', () => {
    const r = parseBrand('colour:\n  primary: "#123456"\n');
    expect(r.brand).toBeNull();
    expect(r.problems[0]).toMatchObject({ code: 'brand-key-unknown', path: 'colour' });
    expect(r.problems[0]!.message).toMatch(/Did you mean "color"\?/);
    expect(check('defaults:\n  libka:\n    neutrl: tinted\n')).toEqual(['error brand-key-unknown defaults.libka.neutrl']);
  });
  it('read hex and palette names only', () => {
    expect(check('color:\n  primary: rebeccapurple\n')).toEqual(['error brand-color-format color.primary']);
    expect(check('color:\n  palette:\n    blue: "#0000ff"\n  primary: bleu\n')).toEqual(['error brand-color-format color.primary']);
    expect(parseBrand('color:\n  palette:\n    blue: "#0000ff"\n  primary: bleu\n').problems[0]!.message).toMatch(/Did you mean "blue"\?/);
    expect(parseBrand('color:\n  primary: "#abc"\n').brand!.color.primary).toBe('#AABBCC');
  });
  it('take fonts from LibKa\'s list only, each in a role it can take', () => {
    expect(check('typography:\n  base: Comic Sans MS\n')).toEqual(['error brand-font-unknown typography.base']);
    expect(check('typography:\n  base: Space Grotesk\n')).toEqual(['error brand-font-role typography.base']);
    expect(parseBrand('typography:\n  base: { family: inter }\n').brand!.fonts).toEqual({ body: 'inter' });
    expect(check('typography:\n  monospace: Fira Code\n')).toEqual(['warning brand-key-unsupported typography.monospace']);
  });
  it('keep logos local, in SVG or PNG, with alt text', () => {
    expect(check('logo: https://example.org/logo.svg\n')).toEqual(['error brand-logo-path logo']);
    expect(check('logo: ../logo.svg\nmeta: { name: X }\n')).toEqual(['error brand-logo-path logo']);
    expect(check('logo: logo.gif\nmeta: { name: X }\n')).toEqual(['error brand-logo-format logo']);
    expect(check('logo: logo.svg\n')).toEqual(['error brand-logo-alt logo']);
    expect(parseBrand('meta: { name: Acme }\nlogo: logo.png\n').brand!.logo).toEqual({ medium: { light: { path: 'logo.png', alt: 'Acme' } } });
  });
  it('need a primary colour for the tint', () => {
    expect(check('defaults:\n  libka:\n    neutral: tinted\n')).toEqual(['error brand-neutral defaults.libka.neutral']);
  });
  it('check the seam fields', () => {
    expect(check('defaults:\n  libka:\n    id: Not An Id\n')).toEqual(['error brand-id defaults.libka.id']);
  });
  it('read YAML 1.2, so "no" stays a word, and refuse duplicate keys', () => {
    expect(parseBrand('meta:\n  name: no\n').brand!.name).toEqual({ full: 'no' });
    expect(check('color:\n  primary: "#111111"\n  primary: "#222222"\n')).toEqual(['error brand-yaml ']);
  });
  it('take brand.yml\'s light and dark only as logo variants, never as modes', () => {
    const r = parseBrand('color:\n  light: "#FFFFFF"\n  dark: "#000000"\n');
    expect(codes(r.problems)).toEqual(['warning brand-key-unsupported color.light', 'warning brand-key-unsupported color.dark']);
    expect(r.problems[0]!.message).toMatch(/not a mode/);
  });
  it('accept an empty brand: LibKa\'s colours, the theme\'s fonts', () => {
    expect(parseBrand('meta:\n  name: Plain\n')).toEqual({
      brand: { name: { full: 'Plain' }, color: {}, fonts: {}, neutral: 'none', pinned: false }, problems: [],
    });
  });
});

describe('typography.link', () => {
  const head = 'color:\n  palette:\n    blue: "#1D4E89"\n  primary: "#F2C500"\n';
  it('takes its colour as a hex or a palette name, for links and accent text', () => {
    expect(parseBrand(`${head}typography:\n  link:\n    color: blue\n`).brand?.color).toEqual({ primary: '#F2C500', link: '#1D4E89' });
    expect(parseBrand(`${head}typography:\n  link:\n    color: "#1d4e89"\n`).brand?.color.link).toBe('#1D4E89');
  });
  it('warns about the link settings LibKa keeps (links stay underlined) and refuses an unknown colour', () => {
    const r = parseBrand(`${head}typography:\n  link:\n    color: blue\n    decoration: none\n    weight: 700\n`);
    expect(codes(r.problems)).toEqual(['warning brand-key-unsupported typography.link.decoration', 'warning brand-key-unsupported typography.link.weight']);
    const bad = parseBrand(`${head}typography:\n  link:\n    color: bleu\n`);
    expect(bad.brand).toBeNull();
    expect(bad.problems[0]!.message).toMatch(/typography\.link\.color must be a hex colour or a name from color\.palette, not "bleu"\. Did you mean "blue"\?/);
  });
});
