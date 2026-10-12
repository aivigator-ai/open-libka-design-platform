/** The document's properties in its front matter: read and change one field, keeping everything else as written. */
import { parseDocument } from 'yaml';

const FM = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

/** The fields of the front matter as text (an empty object without one; null when the YAML cannot be read). */
export function frontMatter(source: string): Record<string, unknown> | null {
  const m = FM.exec(source);
  if (!m) return {};
  const doc = parseDocument(m[1]!);
  if (doc.errors.length) return null;
  const value = doc.toJS() as unknown;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * The source with one front matter field set (or removed, for null or ''). Comments, order and the quoting of the other
 * fields stay as written; a front matter is added when there is none. Returns null when the YAML cannot be read.
 */
export function withField(source: string, key: string, value: string | string[] | null): string | null {
  const m = FM.exec(source);
  const doc = parseDocument(m ? m[1]! : '');
  if (doc.errors.length) return null;
  if (value === null || value === '' || (Array.isArray(value) && !value.length)) doc.delete(key);
  else if (Array.isArray(value)) {
    const seq = doc.createNode(value);
    (seq as { flow?: boolean }).flow = true;   // outputs: [web, pdf] as LibKa's documents write it
    doc.set(key, seq);
  } else doc.set(key, value);
  // as LibKa's documents write YAML: long values never folded, flow lists as [a, b]
  const body = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n$/, '');
  if (!m) return body ? `---\n${body}\n---\n\n${source}` : source;
  return `---\n${body}\n---${m[2]}${source.slice(m[0].length)}`;
}
