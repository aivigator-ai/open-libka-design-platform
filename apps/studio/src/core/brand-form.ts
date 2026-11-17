/**
 * The brand editor's form and the brand file's YAML: the form read from the file, and the form written back into the
 * same YAML, changing only what the form changed (comments, order, other keys and the author's own way of writing an
 * unchanged value all kept). Pure, so it is tested in Node.
 */
import { isMap, isScalar, parseDocument, type Document } from 'yaml';
import { CHART_SERIES, fontById, isHex, normalizeHex, parseBrand } from '@libka/design';

export interface BrandForm {
  name: string;
  primary: string;
  secondary: string;
  link: string;
  /** The chart colours in order (up to six). */
  charts: string[];
  /** Font families from LibKa's list; '' for the theme's. */
  heading: string;
  body: string;
  tinted: boolean;
  /** The logo files, relative to the brand file, and their alt text. */
  logo: { light: string; dark: string; alt: string };
}

const familyOf = (id?: string) => (id ? fontById(id)?.family ?? '' : '');

/** The form of a brand file's text; an absent file gives an empty form with `name` (the document's title). */
export function readForm(source: string | null, name = ''): BrandForm {
  const empty: BrandForm = { name, primary: '', secondary: '', link: '', charts: [], heading: '', body: '', tinted: false, logo: { light: '', dark: '', alt: '' } };
  if (source === null) return empty;
  const { brand } = parseBrand(source);
  if (!brand) return { ...empty, name: '' };
  const size = brand.logo?.medium ?? brand.logo?.small ?? brand.logo?.large;
  return {
    name: brand.name?.full ?? brand.name?.short ?? '',
    primary: brand.color.primary ?? '', secondary: brand.color.secondary ?? '', link: brand.color.link ?? '',
    charts: [...(brand.charts ?? [])],
    heading: familyOf(brand.fonts.heading), body: familyOf(brand.fonts.body),
    tinted: brand.neutral === 'tinted',
    logo: { light: size?.light.path ?? '', dark: size?.dark?.path ?? '', alt: size?.light.alt ?? '' },
  };
}

/** A colour value as the file holds it: a palette name stays when its colour is the one chosen. */
function colourValue(doc: Document, hex: string): string {
  const palette = doc.getIn(['color', 'palette']);
  if (isMap(palette)) for (const item of palette.items) {
    const v = isScalar(item.value) ? String(item.value.value) : '';
    if (isHex(v) && normalizeHex(v) === hex && isScalar(item.key)) return String(item.key.value);
  }
  return hex;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const colour = (v: string) => (isHex(v) ? normalizeHex(v) : '');

/** The brand file's text with the form written into it: only what changed; a key the form empties is removed. */
export function writeForm(source: string | null, form: BrandForm): string {
  const before = readForm(source);
  const doc = parseDocument(source ?? '');
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  let changed = false;
  const set = (path: (string | number)[], value: unknown) => {
    changed = true;
    if (value === '' || value === undefined || value === false || (Array.isArray(value) && !value.length)) { if (doc.hasIn(path)) doc.deleteIn(path); }
    else doc.setIn(path, value);
  };
  const hex = (v: string) => (isHex(v) ? colourValue(doc, normalizeHex(v)) : '');
  if (form.name.trim() !== before.name) {
    // kept as a mapping when the file has full and short, else one string
    if (isMap(doc.getIn(['meta', 'name']))) set(['meta', 'name', 'full'], form.name.trim());
    else set(['meta', 'name'], form.name.trim());
  }
  if (colour(form.primary) !== before.primary) set(['color', 'primary'], hex(form.primary));
  if (colour(form.secondary) !== before.secondary) set(['color', 'secondary'], hex(form.secondary));
  if (colour(form.link) !== before.link) {
    if (isMap(doc.getIn(['typography', 'link']))) set(['typography', 'link', 'color'], hex(form.link));
    else set(['typography', 'link'], form.link ? { color: hex(form.link) } : '');
  }
  if (form.heading !== before.heading) set(['typography', 'headings'], form.heading);
  if (form.body !== before.body) set(['typography', 'base'], form.body);
  const charts = form.charts.filter(isHex).slice(0, CHART_SERIES).map(normalizeHex);
  if (!same(charts, before.charts)) set(['defaults', 'libka', 'charts'], charts.map(hex));
  if (form.tinted !== before.tinted) set(['defaults', 'libka', 'neutral'], form.tinted ? 'tinted' : '');
  // the logo, as named images with their alt text, in the medium size
  const logo = { light: form.logo.light, dark: form.logo.light ? form.logo.dark : '', alt: form.logo.light ? form.logo.alt.trim() : '' };
  if (!same(logo, before.logo)) {
    if (logo.light) {
      const alt = logo.alt || form.name.trim();
      set(['logo'], {
        images: { logo: { path: logo.light, alt }, ...(logo.dark ? { 'logo-dark': { path: logo.dark, alt } } : {}) },
        medium: logo.dark ? { light: 'logo', dark: 'logo-dark' } : 'logo',
      });
    } else set(['logo'], '');
  }
  // nothing changed: the file as it is, byte for byte
  if (!changed) return source ?? '';
  // empty sections go
  for (const section of [['typography'], ['color'], ['defaults', 'libka'], ['defaults'], ['meta']]) {
    const v = doc.getIn(section);
    if (isMap(v) && v.items.length === 0) doc.deleteIn(section);
  }
  const out = String(doc);
  return out.trim() === '{}' ? '' : out;
}
