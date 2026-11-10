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

/** A front matter value the Studio writes: text, a list of words, or a list of people. */
export type FieldValue = string | readonly (string | Readonly<Record<string, string>>)[];

/** The front matter "author" as one line of text: "Ann Novak (Security lead); Petr Svoboda". */
export function authorText(value: unknown): string {
  const one = (p: unknown): string => {
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const { name, role } = p as Record<string, unknown>;
      return name ? `${String(name)}${role ? ` (${String(role)})` : ''}` : '';
    }
    return p === undefined || p === null ? '' : String(p);
  };
  return (Array.isArray(value) ? value : [value]).map(one).filter(Boolean).join('; ');
}

/** That line back as the front matter writes it: one name as text, else a list (people with a role as name and role). */
export function authorValue(text: string): FieldValue | null {
  const people = text.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(.*?)\s*\(([^()]*)\)$/.exec(s);
    return m && m[1]!.trim() && m[2]!.trim() ? { name: m[1]!.trim(), role: m[2]!.trim() } : { name: s };
  });
  if (!people.length) return null;
  if (people.every((p) => !('role' in p))) return people.length === 1 ? people[0]!.name : people.map((p) => p.name);
  return people;
}

/**
 * The source with one front matter field set (or removed, for null or ''). Comments, order and the quoting of the other
 * fields stay as written; a front matter is added when there is none. Returns null when the YAML cannot be read.
 */
export function withField(source: string, key: string, value: FieldValue | null): string | null {
  return edit(source, (doc) => {
    if (value === null || value === '' || (Array.isArray(value) && !value.length)) doc.delete(key);
    else if (Array.isArray(value)) {
      const seq = doc.createNode(value);
      // outputs: [web, pdf] as LibKa's documents write it; a list of people one per line
      (seq as { flow?: boolean }).flow = value.every((v) => typeof v === 'string');
      doc.set(key, seq);
    } else doc.set(key, value);
  });
}

/** The front matter "ai" as the Studio's fields: how AI took part, who reviewed it, whether the label shows. */
export function aiFields(value: unknown): { use?: string; reviewedBy?: string; label: boolean } {
  if (typeof value === 'string') return { use: value, label: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { label: false };
  const v = value as Record<string, unknown>;
  return { ...(v.use ? { use: String(v.use) } : {}), ...(v['reviewed-by'] ? { reviewedBy: String(v['reviewed-by']) } : {}), label: v.label === true };
}

/**
 * The source with one field of "ai" set or removed (null, '' or false). Without a use "ai" goes; with only the use it is
 * written short (ai: ai-generated); its other fields (tool, date ...) stay.
 */
export function withAiField(source: string, field: 'use' | 'reviewed-by' | 'label', value: string | boolean | null): string | null {
  return edit(source, (doc) => {
    const now = doc.toJS()?.ai as unknown;
    const ai: Record<string, unknown> = typeof now === 'string' ? { use: now } : now && typeof now === 'object' && !Array.isArray(now) ? { ...now as Record<string, unknown> } : {};
    if (value === null || value === '' || value === false) delete ai[field];
    else ai[field] = value;
    const keys = Object.keys(ai);
    if (!ai.use) doc.delete('ai');
    else doc.set('ai', keys.length === 1 ? ai.use : doc.createNode(ai));
  });
}

/** The source with its front matter changed by `change` (added when there is none); null when the YAML cannot be read. */
function edit(source: string, change: (doc: ReturnType<typeof parseDocument>) => void): string | null {
  const m = FM.exec(source);
  const doc = parseDocument(m ? m[1]! : '');
  if (doc.errors.length) return null;
  change(doc);
  // as LibKa's documents write YAML: long values never folded, flow lists as [a, b]
  const body = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n$/, '');
  if (!m) return body ? `---\n${body}\n---\n\n${source}` : source;
  return `---\n${body}\n---${m[2]}${source.slice(m[0].length)}`;
}
