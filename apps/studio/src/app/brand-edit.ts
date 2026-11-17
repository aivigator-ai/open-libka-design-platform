/**
 * Editing a document's brand file: the brand editor's form, written into the brand file's YAML (`core/brand-form.ts`),
 * stored as the document's file and drawn at once. Loaded with the brand editor (it uses @libka/design).
 */
import * as s from '../state/store.ts';
import { safeName, typeOf } from '../storage/paths.ts';
import { scheduleRender } from '../core/pipeline.ts';
import { readForm as formOf, writeForm, type BrandForm } from '../core/brand-form.ts';
import { store } from './project.ts';

export type { BrandForm };

/** The brand file the editor works on: the document's (named, or the project's), else a new `_brand.yml` beside it. */
export const brandFile = (): string => s.design.value?.brandPath ?? '_brand.yml';
/** The folder of the brand file, relative to the document ('' beside it). */
export const brandDir = (path = brandFile()): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

const text = (path: string): string | null => { const f = s.files.value.get(path); return f ? new TextDecoder().decode(f.data) : null; };

/** The form of a brand file's text; a document without one gets an empty form named after its title. */
export const readForm = (source: string | null): BrandForm => formOf(source, s.doc.value?.meta.title ?? '');

/** The current brand file's text, or null when the document has none. */
export const currentBrandText = (): string | null => text(brandFile());

/** Stores a file of the document and draws the document again. */
export async function putDesignFile(path: string, data: Uint8Array, type = typeOf(path)): Promise<void> {
  const p = s.project.value;
  if (!p) return;
  await store().putFile({ project: p.id, path, type, data });
  const next = new Map(s.files.value);
  const old = next.get(path);
  if (old) URL.revokeObjectURL(old.url);
  next.set(path, { data, type, url: URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type })) });
  s.files.value = next;
  scheduleRender(0);
}

/** Removes files of the document and draws it again. */
export async function removeDesignFiles(paths: string[]): Promise<void> {
  const p = s.project.value;
  if (!p) return;
  const next = new Map(s.files.value);
  for (const path of paths) {
    await store().deleteFile(p.id, path);
    const old = next.get(path);
    if (old) URL.revokeObjectURL(old.url);
    next.delete(path);
  }
  s.files.value = next;
  scheduleRender(0);
}

/** Writes the form to the brand file (a new one when the document has none and the form says something). */
export async function saveForm(form: BrandForm): Promise<void> {
  const path = brandFile();
  const old = text(path);
  const next = writeForm(old, form);
  if (next === old || (old === null && next.trim() === '')) return;
  await putDesignFile(path, new TextEncoder().encode(next), 'application/yaml');
}

/** A logo file the author chose: stored beside the brand file in `brand/`, its path relative to the brand file. */
export async function addLogo(file: File): Promise<string> {
  const relativePath = `brand/${safeName(file.name, 'logo.svg')}`;
  await putDesignFile(`${brandDir()}${relativePath}`, new Uint8Array(await file.arrayBuffer()), file.type || typeOf(relativePath));
  return relativePath;
}
