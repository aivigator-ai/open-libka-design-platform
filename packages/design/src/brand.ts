/**
 * A brand: an organisation's identity (colours, logo, fonts from LibKa's list, name), read from a strict subset of
 * brand.yml (Posit's tool-neutral brand format, MIT; `_brand.yml` or `brand.yml`). LibKa takes the subset it can
 * prove and reports every other key with a code: brand.yml keys LibKa does not use are warnings, keys brand.yml
 * does not have are errors, and other tools' `defaults` are noted. Nothing is ignored silently.
 *
 * Brand colours are inputs to the solver, never literal output. LibKa's own fields go under `defaults.libka`,
 * which brand.yml reserves for one tool's settings, so a LibKa brand stays a file Quarto can read too:
 * the brand's identity (`id`, `version`, `issuer`, recorded with every design) and the opt-in neutral tint.
 */
import { parseDocument } from 'yaml';
import { isHex, normalizeHex, type Hex } from './color.ts';
import { FONTS, fontByFamily, type FontRole } from './fonts.ts';
import { hasErrors, problem, suggestion, type DesignProblem } from './problems.ts';
import { ID, isThemePath } from './theme.ts';

export interface BrandLogo {
  /** A path relative to the brand file. */
  readonly path: string;
  readonly alt: string;
}

export interface Brand {
  readonly id?: string;
  readonly version?: string;
  readonly issuer?: string;
  readonly name?: { readonly full?: string; readonly short?: string };
  /**
   * The colours that seed the solver: `primary` the accent family, `secondary` the AI family, `link` (brand.yml's
   * `typography.link.color`) links and accent text instead of the primary colour.
   */
  readonly color: { readonly primary?: Hex; readonly secondary?: Hex; readonly link?: Hex };
  /** Fonts from LibKa's list (by id) that replace the theme's in every theme. */
  readonly fonts: { readonly heading?: string; readonly body?: string };
  /** Logos by size, each with its light and, optionally, dark variant. */
  readonly logo?: { readonly [size in 'small' | 'medium' | 'large']?: { readonly light: BrandLogo; readonly dark?: BrandLogo } };
  /** `tinted`: the greys of the standard modes take the primary colour's hue. */
  readonly neutral: 'none' | 'tinted';
  /** True only for LibKa's own brand: its palette is the tokens' and the solver verifies it, never moves it. */
  readonly pinned: boolean;
  /**
   * The project's theme (`defaults.libka.theme`): a built-in theme's id or a `.theme.json` path relative to the brand
   * file. A document's `theme:` wins.
   */
  readonly theme?: string;
  /** The chart series' colours in order (`defaults.libka.charts`); absent, the primary and secondary colours lead. */
  readonly charts?: readonly Hex[];
}

const BRAND_YML_KEYS = ['meta', 'logo', 'color', 'typography', 'defaults'];
const COLOR_KEYS = ['palette', 'primary', 'secondary', 'tertiary', 'success', 'info', 'warning', 'danger', 'light', 'dark', 'foreground', 'background'];
const TYPOGRAPHY_KEYS = ['fonts', 'base', 'headings', 'monospace', 'monospace-inline', 'monospace-block', 'link'];
const LIBKA_KEYS = ['id', 'version', 'issuer', 'neutral', 'theme', 'charts'];
/** How many chart series a palette has. */
export const CHART_SERIES = 6;
const LOGO_SIZES = ['small', 'medium', 'large'] as const;
const IMAGE = /\.(svg|png)$/i;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parse and validate the text of a brand.yml file. */
export function parseBrand(text: string): { brand: Brand | null; problems: DesignProblem[] } {
  const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  if (doc.errors.length) return { brand: null, problems: doc.errors.map((e) => problem('brand-yaml', 'error', '', `The brand file is not valid YAML: ${e.message}`)) };
  return validateBrand(doc.toJS());
}

/** Validate a parsed brand.yml object against LibKa's subset. */
export function validateBrand(data: unknown): { brand: Brand | null; problems: DesignProblem[] } {
  const problems: DesignProblem[] = [];
  const err = (code: string, path: string, message: string) => problems.push(problem(code, 'error', path, message));
  const warn = (code: string, path: string, message: string) => problems.push(problem(code, 'warning', path, message));
  const note = (code: string, path: string, message: string) => problems.push(problem(code, 'info', path, message));
  if (!isObject(data)) return { brand: null, problems: [problem('brand-not-object', 'error', '', 'A brand file is a YAML mapping (brand.yml).')] };

  for (const k of Object.keys(data)) if (!BRAND_YML_KEYS.includes(k)) err('brand-key-unknown', k, `"${k}" is not a brand.yml section.${suggestion(k, BRAND_YML_KEYS)}`);

  // meta: the name (a string or full/short) and links (brand.yml's schema says `link`, its documentation `links`)
  let name: Brand['name'];
  if (data.meta !== undefined) {
    if (!isObject(data.meta)) err('brand-meta', 'meta', '"meta" must be a mapping.');
    else {
      for (const k of Object.keys(data.meta)) if (!['name', 'link', 'links'].includes(k)) warn('brand-key-unsupported', `meta.${k}`, `LibKa does not use meta.${k}.`);
      const n = data.meta.name;
      if (typeof n === 'string' && n.trim()) name = { full: n.trim() };
      else if (isObject(n) && (typeof n.full === 'string' || typeof n.short === 'string')) {
        name = { ...(typeof n.full === 'string' ? { full: n.full.trim() } : {}), ...(typeof n.short === 'string' ? { short: n.short.trim() } : {}) };
        for (const k of Object.keys(n)) if (k !== 'full' && k !== 'short') err('brand-key-unknown', `meta.name.${k}`, 'meta.name takes "full" and "short".');
      } else if (n !== undefined) err('brand-meta', 'meta.name', 'meta.name must be a string or have "full" and/or "short".');
    }
  }

  // color: palette names and hex values; primary and secondary seed the solver
  const color: { primary?: Hex; secondary?: Hex; link?: Hex } = {};
  // the named colours, which defaults.libka.charts may name too
  const palette: Record<string, Hex> = {};
  if (data.color !== undefined) {
    if (!isObject(data.color)) err('brand-color', 'color', '"color" must be a mapping.');
    else {
      const c = data.color;
      for (const k of Object.keys(c)) if (!COLOR_KEYS.includes(k)) err('brand-key-unknown', `color.${k}`, `"${k}" is not a brand.yml colour.${suggestion(k, COLOR_KEYS)}`);
      if (c.palette !== undefined) {
        if (!isObject(c.palette)) err('brand-color', 'color.palette', 'color.palette must map names to hex colours.');
        else for (const [k, v] of Object.entries(c.palette)) {
          if (typeof v === 'string' && isHex(v)) palette[k] = normalizeHex(v);
          else err('brand-color-format', `color.palette.${k}`, `color.palette.${k} must be a hex colour such as "#0F8FA1"; LibKa reads no other colour syntax.`);
        }
      }
      const value = (key: string): Hex | undefined => {
        const v = c[key];
        if (v === undefined) return undefined;
        if (typeof v === 'string' && isHex(v)) return normalizeHex(v);
        if (typeof v === 'string' && palette[v]) return palette[v];
        err('brand-color-format', `color.${key}`, `color.${key} must be a hex colour or a name from color.palette${typeof v === 'string' ? `, not "${v}".${suggestion(v, Object.keys(palette))}` : '.'}`);
        return undefined;
      };
      const primary = value('primary'), secondary = value('secondary');
      if (primary) color.primary = primary;
      if (secondary) color.secondary = secondary;
      for (const key of ['foreground', 'background']) if (value(key))
        note('brand-color-not-applied', `color.${key}`, `LibKa keeps its own ${key === 'foreground' ? 'text colours' : 'backgrounds'}, which are proven in every mode; color.${key} is not applied.`);
      for (const key of ['tertiary', 'success', 'info', 'warning', 'danger', 'light', 'dark']) if (value(key))
        warn('brand-key-unsupported', `color.${key}`, key === 'light' || key === 'dark'
          ? `color.${key} is a colour role in brand.yml, not a mode; LibKa derives its light, dark and high-contrast modes itself.`
          : `LibKa keeps its own ${['success', 'info', 'warning', 'danger'].includes(key) ? 'status colours, so they stay distinguishable from each other and from the brand' : 'colour roles'}; color.${key} is not used.`);
    }
  }

  // typography: a heading and a body family from LibKa's list
  const fonts: { heading?: string; body?: string } = {};
  if (data.typography !== undefined) {
    if (!isObject(data.typography)) err('brand-typography', 'typography', '"typography" must be a mapping.');
    else {
      const t = data.typography;
      for (const k of Object.keys(t)) if (!TYPOGRAPHY_KEYS.includes(k)) err('brand-key-unknown', `typography.${k}`, `"${k}" is not a brand.yml typography setting.${suggestion(k, TYPOGRAPHY_KEYS)}`);
      const family = (v: unknown, role: FontRole, path: string): string | undefined => {
        const fam = typeof v === 'string' ? v : isObject(v) ? v.family : undefined;
        if (isObject(v)) for (const k of Object.keys(v)) if (k !== 'family')
          warn('brand-key-unsupported', `${path}.${k}`, `LibKa's theme sets the ${k === 'color' ? 'colour' : k}; ${path}.${k} is not used.`);
        if (fam === undefined) return undefined;
        const f = typeof fam === 'string' ? fontByFamily(fam) : undefined;
        const allowed = FONTS.filter((x) => x.roles.includes(role)).map((x) => x.family);
        if (!f) { err('brand-font-unknown', `${path}`, `${typeof fam === 'string' ? `"${fam}"` : 'This'} is not in LibKa's font list; for the ${role} use one of: ${allowed.join(', ')}.${typeof fam === 'string' ? suggestion(fam, FONTS.map((x) => x.family)) : ''}`); return undefined; }
        if (!f.roles.includes(role)) { err('brand-font-role', `${path}`, `${f.family} cannot be the ${role} font; use one of: ${allowed.join(', ')}.`); return undefined; }
        return f.id;
      };
      const body = family(t.base, 'body', 'typography.base');
      const heading = family(t.headings, 'heading', 'typography.headings');
      if (body) fonts.body = body;
      if (heading) fonts.heading = heading;
      if (t.fonts !== undefined) {
        if (!Array.isArray(t.fonts)) err('brand-typography', 'typography.fonts', 'typography.fonts must be a list.');
        else t.fonts.forEach((entry, i) => {
          const fam = isObject(entry) ? entry.family : undefined;
          if (typeof fam !== 'string' || !fontByFamily(fam)) err('brand-font-unknown', `typography.fonts.${i}`, `typography.fonts.${i} must name a family from LibKa's list.${typeof fam === 'string' ? suggestion(fam, FONTS.map((x) => x.family)) : ''}`);
          else if (isObject(entry) && entry.source !== undefined) note('brand-font-source', `typography.fonts.${i}.source`, `LibKa ships ${fam} itself and never fetches fonts; the source is not used.`);
        });
      }
      for (const k of ['monospace', 'monospace-inline', 'monospace-block']) if (t[k] !== undefined)
        warn('brand-key-unsupported', `typography.${k}`, `Code always uses JetBrains Mono; typography.${k} is not used.`);
      // links: their colour seeds links and accent text (solved to pass like every role); LibKa keeps them underlined
      if (t.link !== undefined) {
        const v = isObject(t.link) ? t.link.color : t.link;
        if (isObject(t.link)) for (const k of Object.keys(t.link)) if (k !== 'color')
          warn('brand-key-unsupported', `typography.link.${k}`, `LibKa keeps links underlined in the text's weight, so they stay recognisable; typography.link.${k} is not used.`);
        if (typeof v === 'string' && isHex(v)) color.link = normalizeHex(v);
        else if (typeof v === 'string' && palette[v]) color.link = palette[v];
        else if (v !== undefined) err('brand-color-format', 'typography.link.color', `typography.link.color must be a hex colour or a name from color.palette${typeof v === 'string' ? `, not "${v}".${suggestion(v, Object.keys(palette))}` : '.'}`);
      }
    }
  }

  // logo: SVG or PNG files next to the brand, each with alt text (from images.<name>.alt, else the brand's name)
  let logo: Brand['logo'];
  if (data.logo !== undefined) {
    const images: Record<string, { path: string; alt?: string }> = {};
    const alt = name?.full ?? name?.short;
    const one = (v: unknown, path: string): BrandLogo | undefined => {
      const ref = typeof v === 'string' ? v : undefined;
      const img = ref !== undefined && images[ref] ? images[ref] : ref !== undefined ? { path: ref } : undefined;
      if (!img) { err('brand-logo', path, `${path} must be a file path or the name of an entry in logo.images.`); return undefined; }
      if (/^[a-z][a-z0-9+.-]*:/i.test(img.path) || img.path.startsWith('/') || img.path.split(/[\\/]/).includes('..')) {
        err('brand-logo-path', path, `${path}: a logo is a file next to the brand file or below it, never a web address or an absolute path, so builds work offline.`);
        return undefined;
      }
      if (!IMAGE.test(img.path)) { err('brand-logo-format', path, `${path}: a logo is an SVG or PNG file.`); return undefined; }
      const text = img.alt ?? alt;
      if (!text) { err('brand-logo-alt', path, `${path} needs alt text: give the image an "alt" in logo.images, or the brand a meta.name.`); return undefined; }
      return { path: img.path, alt: text };
    };
    if (typeof data.logo === 'string') {
      const l = one(data.logo, 'logo');
      if (l) logo = { medium: { light: l } };
    } else if (isObject(data.logo)) {
      const lg = data.logo;
      for (const k of Object.keys(lg)) if (k !== 'images' && !(LOGO_SIZES as readonly string[]).includes(k)) err('brand-key-unknown', `logo.${k}`, `"${k}" is not a brand.yml logo setting.${suggestion(k, ['images', ...LOGO_SIZES])}`);
      if (lg.images !== undefined) {
        if (!isObject(lg.images)) err('brand-logo', 'logo.images', 'logo.images must map names to files.');
        else for (const [k, v] of Object.entries(lg.images)) {
          if (typeof v === 'string') images[k] = { path: v };
          else if (isObject(v) && typeof v.path === 'string') {
            images[k] = { path: v.path, ...(typeof v.alt === 'string' && v.alt.trim() ? { alt: v.alt.trim() } : {}) };
            for (const x of Object.keys(v)) if (x !== 'path' && x !== 'alt') err('brand-key-unknown', `logo.images.${k}.${x}`, 'A logo image takes "path" and "alt".');
          } else err('brand-logo', `logo.images.${k}`, `logo.images.${k} must be a path or have "path" and "alt".`);
        }
      }
      const sizes: Record<string, { light: BrandLogo; dark?: BrandLogo }> = {};
      for (const size of LOGO_SIZES) {
        const v = lg[size];
        if (v === undefined) continue;
        if (isObject(v)) {
          for (const x of Object.keys(v)) if (x !== 'light' && x !== 'dark') err('brand-key-unknown', `logo.${size}.${x}`, `logo.${size} takes "light" and "dark".`);
          const light = v.light === undefined ? undefined : one(v.light, `logo.${size}.light`);
          const dark = v.dark === undefined ? undefined : one(v.dark, `logo.${size}.dark`);
          if (!light && v.light === undefined) err('brand-logo', `logo.${size}`, `logo.${size} needs a "light" variant.`);
          if (light) sizes[size] = { light, ...(dark ? { dark } : {}) };
        } else {
          const l = one(v, `logo.${size}`);
          if (l) sizes[size] = { light: l };
        }
      }
      if (Object.keys(sizes).length) logo = sizes;
    } else err('brand-logo', 'logo', '"logo" must be a path or a mapping of sizes.');
  }

  // defaults: LibKa's own under defaults.libka; other tools' settings are noted, not errors
  let seam: { id?: string; version?: string; issuer?: string } = {};
  let neutral: Brand['neutral'] = 'none';
  let theme: string | undefined;
  let charts: Hex[] | undefined;
  if (data.defaults !== undefined) {
    if (!isObject(data.defaults)) err('brand-defaults', 'defaults', '"defaults" must be a mapping.');
    else for (const [tool, v] of Object.entries(data.defaults)) {
      if (tool !== 'libka') { note('brand-defaults-other', `defaults.${tool}`, `defaults.${tool} is for another tool; LibKa reads only defaults.libka.`); continue; }
      if (!isObject(v)) { err('brand-defaults', 'defaults.libka', 'defaults.libka must be a mapping.'); continue; }
      for (const k of Object.keys(v)) if (!LIBKA_KEYS.includes(k)) err('brand-key-unknown', `defaults.libka.${k}`, `"${k}" is not a LibKa brand setting.${suggestion(k, LIBKA_KEYS)}`);
      if (v.id !== undefined) {
        if (typeof v.id === 'string' && ID.test(v.id)) seam = { ...seam, id: v.id };
        else err('brand-id', 'defaults.libka.id', 'defaults.libka.id must be lower-case letters, digits and hyphens.');
      }
      for (const k of ['version', 'issuer'] as const) if (v[k] !== undefined) {
        const s = typeof v[k] === 'number' ? String(v[k]) : v[k];
        if (typeof s === 'string' && s.trim() && s.length <= 200) seam = { ...seam, [k]: s.trim() };
        else err(`brand-${k}`, `defaults.libka.${k}`, `defaults.libka.${k} must be a short text.`);
      }
      if (v.neutral !== undefined) {
        if (v.neutral === 'tinted' || v.neutral === 'none') neutral = v.neutral;
        else err('brand-neutral', 'defaults.libka.neutral', `defaults.libka.neutral is "tinted" or "none".${typeof v.neutral === 'string' ? suggestion(v.neutral, ['tinted', 'none']) : ''}`);
      }
      if (v.charts !== undefined) {
        if (!Array.isArray(v.charts) || v.charts.length === 0 || v.charts.length > CHART_SERIES) {
          err('brand-charts', 'defaults.libka.charts', `defaults.libka.charts is a list of 1 to ${CHART_SERIES} colours, the chart series in order.`);
        } else {
          const list: Hex[] = [];
          v.charts.forEach((x: unknown, i: number) => {
            if (typeof x === 'string' && isHex(x)) list.push(normalizeHex(x));
            else if (typeof x === 'string' && palette[x]) list.push(palette[x]!);
            else err('brand-color-format', `defaults.libka.charts.${i}`, `defaults.libka.charts.${i} must be a hex colour or a name from color.palette${typeof x === 'string' ? `, not "${x}".${suggestion(x, Object.keys(palette))}` : '.'}`);
          });
          if (list.length === v.charts.length) charts = list;
        }
      }
      if (v.theme !== undefined) {
        if (typeof v.theme === 'string' && (ID.test(v.theme) || isThemePath(v.theme))) theme = v.theme;
        else err('brand-theme', 'defaults.libka.theme', 'defaults.libka.theme names a built-in theme (classic, modern) or a .theme.json file next to the brand file.');
      }
    }
  }
  if (neutral === 'tinted' && !color.primary) err('brand-neutral', 'defaults.libka.neutral', 'A tint takes the hue of color.primary, so the brand needs one.');

  if (hasErrors(problems)) return { brand: null, problems };
  return {
    brand: { ...seam, ...(name ? { name } : {}), color, fonts, ...(logo ? { logo } : {}), neutral, pinned: false, ...(theme ? { theme } : {}), ...(charts ? { charts } : {}) },
    problems,
  };
}

/** LibKa's own brand: pinned to the tokens' palette, so the default design builds as 2.0.3 did. */
export const LIBKA_BRAND: Brand = {
  id: 'libka',
  name: { full: 'LibKa' },
  color: { primary: '#0F8FA1', secondary: '#4C4ECC' },
  fonts: {},
  neutral: 'none',
  pinned: true,
};
