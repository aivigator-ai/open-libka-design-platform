/** Paths inside a project folder: which local files a document uses, and how paths combine. */
import type { LibkaDocument } from '@libka/model';

const FILE_KEYS = new Set(['src', 'poster', 'captions']);

/** A path to a file next to the document (not a web address, a data URL or an absolute path). */
export const isLocal = (path: string): boolean => path !== '' && !/^([a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(path);

/** The local files the document refers to (images, video posters and caption files), in order, each once. */
export function localFiles(doc: LibkaDocument): string[] {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (FILE_KEYS.has(k) && typeof v === 'string') { const p = normalize(v); if (p !== null && isLocal(v)) out.add(p); }
        else if (k !== 'position') walk(v);
      }
    }
  };
  walk(doc.blocks);
  return [...out];
}

/** `a/./b/../c.png` → `a/c.png`; null when the path leaves the folder (`../x`). Query and fragment are dropped. */
export function normalize(path: string): string | null {
  const parts: string[] = [];
  let plain = path.replace(/[?#].*$/, '');
  try { plain = decodeURI(plain); } catch { /* a stray % stays as written */ }
  for (const part of plain.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.length ? parts.join('/') : null;
}

/** The directory part of a path inside the project (`docs/guide.md` → `docs`; `guide.md` → ``). */
export const dirOf = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

/** A path relative to a directory, normalized (null when it leaves the folder). */
export const join = (dir: string, path: string): string | null => normalize(dir ? `${dir}/${path}` : path);

/** A safe file name from what the user typed or dropped: letters, digits, dot, dash and underscore. */
export function safeName(name: string, fallback = 'file'): string {
  const clean = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+$/g, '');
  return clean || fallback;
}

/** A Markdown file name for the project (adds `.md`). */
export const markdownName = (name: string): string => {
  const base = safeName(name.replace(/\.(md|markdown)$/i, ''), 'document');
  return `${base}.md`;
};

/** The MIME type of a project file from its extension. */
export function typeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', vtt: 'text/vtt', md: 'text/markdown' } as Record<string, string>)[ext]
    ?? 'application/octet-stream';
}
