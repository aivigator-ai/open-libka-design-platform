/**
 * A design in a page or a deck: the token stylesheets with the design's values set (`designCss` in @libka/design),
 * and the brand's logo. LibKa's default design changes nothing, so its outputs stay byte for byte.
 *
 * The token stylesheet keeps its shape: a colour written as a value takes the design's value, an alias
 * (`var(--lk-text-info)`) stays an alias, so a mode that overrides the colour it points to still reaches it. Then each
 * mode's values are resolved as the cascade reaches them (the attribute blocks, and the blocks for a reader who asks
 * for more contrast), and a colour that would not come out as the design's is written into that mode's own block.
 */
import type { ResolvedDesign } from '@libka/design';
import { designCss, MODE_BLOCKS, MODE_PATHS } from '@libka/design/css';
import { escapeHtml } from './escape.ts';

/** The brand's logo as a page shows it: image data (a `data:` URL, so the output stays one file) and its alt text. */
export interface DesignLogo {
  readonly src: string;
  readonly alt: string;
  /** The variant for dark mode, when the brand has one. */
  readonly darkSrc?: string;
}

interface Span { readonly start: number; readonly end: number; readonly indent: string }

/** Where a block (`selector {` on a line of its own, at this indent) starts and ends, or null. */
function span(css: string, selector: string, indent = ''): Span | null {
  const head = `${indent}${selector} {\n`;
  const start = css.startsWith(head) ? 0 : css.indexOf(`\n${head}`) + 1;
  if (start <= 0 && !css.startsWith(head)) return null;
  return { start, end: css.indexOf(`\n${indent}}`, start), indent };
}

/** The custom properties declared in a block. */
function declared(css: string, s: Span): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.slice(s.start, s.end).matchAll(/^\s+(--[\w-]+): (.+);$/gm)) out[m[1]!] = m[2]!;
  return out;
}

/** A block with these custom properties set: a declared one takes its value (or `keep` decides), the rest are added at its end. */
function setVars(css: string, s: Span, values: Readonly<Record<string, string>>, keep?: (old: string) => boolean): string {
  const left = new Map(Object.entries(values));
  const body = css.slice(s.start, s.end).replace(/^(\s+)(--[\w-]+): (.+);$/gm, (line, pad: string, name: string, old: string) => {
    const value = left.get(name);
    if (value === undefined) return line;
    left.delete(name);
    return keep?.(old) ? line : `${pad}${name}: ${value};`;
  });
  const added = [...left].filter(() => !keep).map(([name, value]) => `\n${s.indent}  ${name}: ${value};`).join('');
  return `${css.slice(0, s.start)}${body}${added}${css.slice(s.end)}`;
}

const isAlias = (value: string) => /^var\(--[\w-]+\)$/.test(value);

/** A custom property's value through its aliases, in a merged set of declarations. */
function resolveVar(vars: Readonly<Record<string, string>>, name: string): string | undefined {
  let v = vars[name];
  for (let i = 0; v !== undefined && isAlias(v) && i < 20; i++) v = vars[v.slice(4, -1)];
  return v;
}

/** The token stylesheet with a design's colours in every mode, and its radii and statement bar. */
function designTokens(tokens: string, design: ResolvedDesign): string {
  const css = designCss(design.design);
  let out = tokens;
  // the colours written as values take the design's; aliases stay
  for (const b of MODE_BLOCKS) {
    const s = span(out, b.selector, b.indent);
    if (s) out = setVars(out, s, css.colors[b.mode], isAlias);
  }
  out = setVars(out, span(out, ':root')!, css.root);
  // then each way to a mode: a colour that does not come out as the design's is set in the mode's own block
  for (const path of MODE_PATHS) {
    const spans = path.blocks.map((i) => span(out, MODE_BLOCKS[i]!.selector, MODE_BLOCKS[i]!.indent));
    if (spans.some((s) => !s)) continue;
    const merged = Object.assign({}, ...spans.map((s) => declared(out, s!))) as Record<string, string>;
    const wrong = Object.fromEntries(Object.entries(css.colors[path.mode]).filter(([name, v]) => resolveVar(merged, name)?.toUpperCase() !== v.toUpperCase()));
    if (Object.keys(wrong).length) out = setVars(out, spans.at(-1)!, wrong);
  }
  return out;
}

/** The token stylesheets with a design's values; the same objects for LibKa's default design. */
export function withDesign<S extends { tokens: string; bridge: string }>(styles: S, design: ResolvedDesign | undefined): S {
  if (!design || design.isDefault) return styles;
  const css = designCss(design.design);
  const compact = css.compact ? declared(styles.bridge, span(styles.bridge, '[data-density="compact"]')!) : {};
  const bridge = setVars(styles.bridge, span(styles.bridge, ':root')!, { ...compact, ...css.bridge });
  return { ...styles, tokens: designTokens(styles.tokens, design), bridge };
}

/** The logo above a page's or a title slide's title. */
export function logoHtml(logo: DesignLogo | undefined, indent = ''): string {
  if (!logo) return '';
  const img = (src: string, cls: string) => `<img class="${cls}" src="${escapeHtml(src)}" alt="${escapeHtml(logo.alt)}">`;
  return `${indent}<div class="lk-logo">${img(logo.src, 'lk-logo-light')}${logo.darkSrc ? img(logo.darkSrc, 'lk-logo-dark') : ''}</div>\n`;
}

/** The logo's styles: only in an output that shows a logo, so other outputs keep their bytes. */
export function logoCss(logo: DesignLogo | undefined, darkMedia: boolean): string {
  if (!logo) return '';
  const dark = logo.darkSrc
    ? `.lk-logo .lk-logo-dark { display: none; }
[data-theme="dark"] .lk-logo .lk-logo-light { display: none; }
[data-theme="dark"] .lk-logo .lk-logo-dark { display: block; }
${darkMedia ? `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .lk-logo .lk-logo-light { display: none; }
  :root:not([data-theme="light"]) .lk-logo .lk-logo-dark { display: block; }
}
` : ''}` : '';
  return `.lk-logo { margin: 0 0 var(--lk-space-4); line-height: 0; }
.lk-logo img { display: block; max-height: 3rem; max-width: 12rem; width: auto; height: auto; }
.lk-slide--title .lk-logo img { max-height: 4.5rem; max-width: 18rem; }
${dark}`;
}
