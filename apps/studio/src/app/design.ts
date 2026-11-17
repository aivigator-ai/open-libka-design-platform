/**
 * The Design tab's actions: the theme and the brand go into the front matter (`theme:`, `brand:`), as an author would
 * write them; another document's brand comes over as files of this one (its `_brand.yml` beside this document, its
 * logos at the same places relative to it), so the document stays what `libka build` reads.
 */
import { parse } from '@libka/model';
import { parseBrand } from '@libka/design';
import * as s from '../state/store.ts';
import { designPaths, designSources } from '../storage/design-files.ts';
import { withField } from '../core/frontmatter.ts';
import { bridge, currentText, store } from './project.ts';
import { t } from '../state/text.ts';

/** Writes one front matter key (null removes it), through the editor, so it is one step to undo. */
function setField(key: string, value: string | null): void {
  const text = currentText();
  const next = withField(text, key, value);
  if (next !== null && next !== text) bridge.editor?.replaceAll(next);
}

/** The theme by id; Classic, the default, is written only when a brand names another theme. */
export function setTheme(id: string): void {
  const brandTheme = s.design.value?.themeFrom === 'brand' || (s.design.value?.themeFrom === 'front matter' && s.design.value.brandPath);
  setField('theme', id === 'classic' && !brandTheme ? null : id);
}

/** LibKa's own design (`brand: libka` when the project has a brand file, so it is not found by itself), or the project's. */
export function setBrand(which: 'libka' | 'project'): void {
  if (which === 'libka') setField('brand', s.design.value?.brandPath && !s.design.value.named ? 'libka' : null);
  else setField('brand', null);
}

export interface BrandSource { id: string; title: string; name?: string }

/** The library's other documents that have a brand among their files. */
export async function brandsInLibrary(): Promise<BrandSource[]> {
  const out: BrandSource[] = [];
  for (const p of s.projects.value) {
    if (p.id === s.project.value?.id) continue;
    const files = new Map((await store().listFiles(p.id)).map((f) => [f.path, f.data]));
    const d = designSources(parse(p.source).document, (path) => files.get(path), parseBrand);
    if (d.brandPath && files.has(d.brandPath) && d.brand) out.push({ id: p.id, title: p.title || p.name, ...(d.brand.name?.full ? { name: d.brand.name.full } : {}) });
  }
  return out;
}

/**
 * Copies another document's brand into this one: its brand file as `_brand.yml` beside this document and its logos
 * and theme file at the same places relative to it; the front matter's `brand:` goes, so the brand is found by itself.
 */
export async function useBrandOf(id: string): Promise<void> {
  const p = s.project.value;
  const other = s.projects.value.find((x) => x.id === id);
  if (!p || !other) return;
  const files = new Map((await store().listFiles(id)).map((f) => [f.path, f]));
  const d = designSources(parse(other.source).document, (path) => files.get(path)?.data, parseBrand);
  if (!d.brandPath) return;
  // the brand's folder becomes this document's folder
  const base = d.brandPath.includes('/') ? d.brandPath.slice(0, d.brandPath.lastIndexOf('/') + 1) : '';
  const next = new Map(s.files.value);
  for (const path of designPaths(d)) {
    const f = files.get(path);
    if (!f) continue;
    const at = path === d.brandPath ? '_brand.yml' : path.startsWith(base) ? path.slice(base.length) : null;
    if (!at || at.startsWith('../')) continue;
    await store().putFile({ project: p.id, path: at, type: f.type, data: f.data });
    const old = next.get(at);
    if (old) URL.revokeObjectURL(old.url);
    next.set(at, { data: f.data, type: f.type, url: URL.createObjectURL(new Blob([f.data as Uint8Array<ArrayBuffer>], { type: f.type })) });
  }
  s.files.value = next;
  setField('brand', null);
  s.toast(t('design.brandCopied', { title: other.title || other.name }));
}
