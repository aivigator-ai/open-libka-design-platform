/**
 * A design as CSS custom properties: the values a page or a deck sets over LibKa's token stylesheets
 * (`libka-tokens.css`, `lk-bridge.css`) so that a brand × a theme shows. Only values LibKa ships: the solved palette,
 * fonts from LibKa's list and the theme's enums, never free CSS. LibKa's default design needs none, so its outputs
 * stay the token build's, byte for byte.
 */
import type { Design } from './lock.ts';
import type { Mode } from './palette-model.ts';

/**
 * The token stylesheet's blocks and the mode each holds: the attribute blocks, and the two inside
 * `@media (prefers-contrast: more)` (indented) that apply when the reader asks for more contrast.
 */
export const MODE_BLOCKS: readonly { readonly selector: string; readonly indent: string; readonly mode: Mode }[] = [
  { selector: ':root', indent: '', mode: 'light' },
  { selector: '[data-theme="dark"]', indent: '', mode: 'dark' },
  { selector: '[data-contrast="high"]', indent: '', mode: 'light-high-contrast' },
  { selector: '[data-theme="dark"][data-contrast="high"]', indent: '', mode: 'dark-high-contrast' },
  { selector: ':root:not([data-contrast="standard"])', indent: '  ', mode: 'light-high-contrast' },
  { selector: '[data-theme="dark"]:not([data-contrast="standard"])', indent: '  ', mode: 'dark-high-contrast' },
];

/** The block selector of each mode's own attribute block. */
export const MODE_SELECTORS: Readonly<Record<Mode, string>> = {
  'light': ':root',
  'dark': '[data-theme="dark"]',
  'light-high-contrast': '[data-contrast="high"]',
  'dark-high-contrast': '[data-theme="dark"][data-contrast="high"]',
};

/**
 * The ways a mode's values are reached, as the blocks that apply in order (later wins, as in the cascade): the
 * attribute blocks, and the media blocks when the reader asks for more contrast.
 */
export const MODE_PATHS: readonly { readonly mode: Mode; readonly blocks: readonly number[] }[] = [
  { mode: 'light', blocks: [0] },
  { mode: 'dark', blocks: [0, 1] },
  { mode: 'light-high-contrast', blocks: [0, 2] },
  { mode: 'light-high-contrast', blocks: [0, 4] },
  { mode: 'dark-high-contrast', blocks: [0, 1, 2, 3] },
  // a page that follows the reader's dark preference puts the more-contrast block before the dark ones
  { mode: 'dark-high-contrast', blocks: [0, 2, 1, 3] },
  { mode: 'dark-high-contrast', blocks: [0, 1, 4, 5] },
];

/** A palette key's custom property (`semantic.text.accent` → `--lk-text-accent`, `component.button.accent.text` → `--lk-button-accent-text`). */
export const cssName = (key: string): string => `--lk-${key.replace(/^(semantic|component)\./, '').replace(/\./g, '-')}`;

/** The corner radii per theme setting; `medium` is the tokens' own. Pills (`--lk-radius-full`) stay round. */
const RADII: Readonly<Record<Design['theme']['radius'], readonly [number, number, number, number, number, number]>> = {
  none: [0, 0, 0, 0, 0, 0],
  small: [4, 6, 10, 14, 18, 24],
  medium: [6, 10, 16, 24, 32, 40],
  large: [8, 14, 22, 32, 40, 48],
};
const RADIUS_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;

/** The reading sizes a `large` scale sets (an eighth larger); headings keep theirs. */
const LARGE_SIZES: Readonly<Record<string, string>> = {
  '--lk-type-body-lg-size': '1.25rem',
  '--lk-type-body-md-size': '1.125rem',
  '--lk-type-body-sm-size': '1rem',
  '--lk-type-caption-size': '0.875rem',
};

/** The heading weights a `bold` theme sets. */
const BOLD_HEADINGS: Readonly<Record<string, string>> = {
  '--lk-type-display-xl-weight': '700',
  '--lk-type-display-lg-weight': '700',
  '--lk-type-heading-h1-weight': '700',
  '--lk-type-heading-h2-weight': '700',
  '--lk-type-heading-h3-weight': '700',
};

export interface DesignCss {
  /** Every gated colour and the chart series per mode, by custom property. */
  readonly colors: Readonly<Record<Mode, Readonly<Record<string, string>>>>;
  /** Over `libka-tokens.css`'s `:root`, outside the modes: the radii and the statement's bar. */
  readonly root: Readonly<Record<string, string>>;
  /** Over `lk-bridge.css`'s `:root`: the fonts, the heading weights, the reading sizes. */
  readonly bridge: Readonly<Record<string, string>>;
  /** Whether the theme asks for the compact density (the bridge's `[data-density="compact"]` values in `:root`). */
  readonly compact: boolean;
}

/**
 * The custom properties of a design. The statement's bar is LibKa's aqua 500, the brand's bright accent: a design
 * sets it to the dark mode's accent, which is what aqua 500 is in LibKa's own palette.
 */
export function designCss(d: Design): DesignCss {
  const colors = Object.fromEntries(Object.entries(d.palette).map(([mode, values]) =>
    [mode, {
      ...Object.fromEntries(Object.entries(values).map(([k, v]) => [cssName(k), v])),
      ...Object.fromEntries(d.charts.series[mode as Mode].map((v, i) => [`--lk-viz-series-${i + 1}`, v])),
    }])) as Record<Mode, Record<string, string>>;
  const root: Record<string, string> = { '--lk-aqua-500': d.palette.dark['semantic.action.accent']! };
  RADII[d.theme.radius].forEach((px, i) => { root[`--lk-radius-${RADIUS_NAMES[i]}`] = `${px}px`; });
  const bridge: Record<string, string> = {
    '--lk-font-brand': d.fonts.heading.css,
    '--lk-font-ui': d.fonts.body.css,
    '--lk-font-mono': d.fonts.mono.css,
    ...(d.theme.headings === 'bold' ? BOLD_HEADINGS : {}),
    ...(d.theme.scale === 'large' ? LARGE_SIZES : {}),
  };
  return { colors, root, bridge, compact: d.theme.density === 'compact' };
}
