/**
 * Moving a project in and out of the browser: a `.zip` of the project folder (every browser) and a folder on disk
 * (File System Access API, Chrome and Edge). Both use the CLI's layout: the Markdown file, and the files it uses at
 * the paths it names, so a saved folder is exactly what `libka build` reads.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { parse } from '@libka/model';
import { dirOf, join, localFiles, normalize } from './paths.ts';

/** A project as files: the Markdown file's path in the folder, its text, and the files it uses (by their path in the text). */
export interface ProjectFiles {
  name: string;
  source: string;
  files: Map<string, Uint8Array>;
  /** Paths the document uses that the folder or zip does not have. */
  missing: string[];
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__MACOSX']);
const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);
const hidden = (path: string) => path.split('/').some((p) => p.startsWith('.') || SKIP_DIRS.has(p));
/** Zip entry times are fixed, so the same project always gives the same bytes. */
const ZIP_TIME = new Date(1980, 0, 1);

/** The project as a zip: the Markdown file at the top and the files the document uses, at their paths. */
export function exportZip(p: Pick<ProjectFiles, 'name' | 'source' | 'files'>): Uint8Array {
  const used = localFiles(parse(p.source).document);
  const entries: Zippable = { [p.name]: [strToU8(p.source), { mtime: ZIP_TIME }] };
  for (const path of used) {
    const data = p.files.get(path);
    if (data) entries[path] = [data, { mtime: ZIP_TIME, level: /\.(png|jpe?g|gif|webp|avif|mp4|webm)$/i.test(path) ? 0 : 6 }];
  }
  return zipSync(entries);
}

/** The entries of a zip, with one shared top folder removed (zips of a folder usually have one) and system files left out. */
export function readZip(data: Uint8Array): Map<string, Uint8Array> {
  const raw = Object.entries(unzipSync(data)).filter(([path]) => !path.endsWith('/') && !hidden(path));
  const tops = new Set(raw.map(([path]) => (path.includes('/') ? path.slice(0, path.indexOf('/')) : '')));
  const strip = tops.size === 1 && !tops.has('') ? [...tops][0]!.length + 1 : 0;
  const out = new Map<string, Uint8Array>();
  for (const [path, bytes] of raw) {
    const p = normalize(path.slice(strip));
    if (p) out.set(p, bytes);
  }
  return out;
}

/** The Markdown files among a folder's or zip's paths, the shallowest first. */
export const markdownIn = (paths: Iterable<string>): string[] =>
  [...paths].filter(isMarkdown).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

/** The project made of one Markdown file and the files it uses, read through `read` (null when a file is absent). */
export async function collect(mdPath: string, read: (path: string) => Promise<Uint8Array | null>): Promise<ProjectFiles> {
  const text = await read(mdPath);
  if (!text) throw new Error(`${mdPath} is missing`);
  const source = strFromU8(text);
  const files = new Map<string, Uint8Array>();
  const missing: string[] = [];
  const dir = dirOf(mdPath);
  for (const path of localFiles(parse(source).document)) {
    const at = join(dir, path);
    const data = at ? await read(at) : null;
    if (data) files.set(path, data); else missing.push(path);
  }
  return { name: mdPath.slice(mdPath.lastIndexOf('/') + 1), source, files, missing };
}

/* ---------- folders on disk (File System Access API) ---------- */

declare global {
  interface Window { showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> }
  interface FileSystemHandle {
    queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

/** Whether this browser can open and save folders. */
export const foldersSupported = (): boolean => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

/** Asks for write access to a folder the project remembers (the browser forgets it between visits). */
export async function writable(dir: FileSystemDirectoryHandle): Promise<boolean> {
  if (!dir.queryPermission) return true;
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await dir.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

/** Every file path in the folder, up to a few levels deep, leaving out hidden and build folders. */
export async function listFolder(dir: FileSystemDirectoryHandle, depth = 4, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of dir.values()) {
    const path = `${prefix}${entry.name}`;
    if (hidden(path)) continue;
    if (entry.kind === 'file') out.push(path);
    else if (depth > 0) out.push(...await listFolder(entry as FileSystemDirectoryHandle, depth - 1, `${path}/`));
  }
  return out;
}

async function parentOf(dir: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  let at = dir;
  for (const part of path.split('/').slice(0, -1)) at = await at.getDirectoryHandle(part, { create });
  return at;
}
const leaf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** A file's bytes, or null when it is not there. */
export async function readFile(dir: FileSystemDirectoryHandle, path: string): Promise<Uint8Array | null> {
  try {
    const file = await (await (await parentOf(dir, path, false)).getFileHandle(leaf(path))).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch { return null; }
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Writes the project into the folder: the Markdown file and the files the document uses. A file whose bytes are already
 * there is left alone. Returns the paths written.
 */
export async function writeFolder(dir: FileSystemDirectoryHandle, p: Pick<ProjectFiles, 'name' | 'source' | 'files'>): Promise<string[]> {
  const written: string[] = [];
  const entries: [string, Uint8Array][] = [[p.name, strToU8(p.source)]];
  for (const path of localFiles(parse(p.source).document)) {
    const data = p.files.get(path);
    const at = join(dirOf(p.name), path);
    if (data && at) entries.push([at, data]);
  }
  for (const [path, data] of entries) {
    const old = await readFile(dir, path);
    if (old && same(old, data)) continue;
    const handle = await (await parentOf(dir, path, true)).getFileHandle(leaf(path), { create: true });
    const out = await handle.createWritable();
    await out.write(data as Uint8Array<ArrayBuffer>);
    await out.close();
    written.push(path);
  }
  return written;
}
