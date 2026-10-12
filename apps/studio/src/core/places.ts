/** Places in a document's source that the command palette can go to: headings and titled blocks (:::callout[Title]). */

export type Place =
  | { kind: 'heading'; level: number; label: string; line: number }
  | { kind: 'block'; name: string; label: string; line: number };

/** Inline Markdown marks dropped, a link's text kept: what the reader sees. */
const plain = (text: string) => text.replace(/\[([^\]]*)\]\([^)]*\)|[*_`]/g, (_m, link: string | undefined) => link ?? '').trim();

/** The text inside the brackets that open at `at`, nested brackets included (a link in a title); null when unclosed or empty. */
function bracketed(line: string, at: number): string | null {
  let depth = 0;
  for (let i = at; i < line.length; i++) {
    if (line[i] === '[') depth++;
    else if (line[i] === ']' && --depth === 0) return line.slice(at + 1, i).trim() || null;
  }
  return null;
}

/** The places of a source, in order; the front matter and fenced code are skipped. */
export function places(source: string): Place[] {
  const out: Place[] = [];
  const lines = source.split('\n');
  let i = 0;
  if (lines[0]?.trim() === '---') { i = 1; while (i < lines.length && lines[i]!.trim() !== '---') i++; i++; }
  let fence: string | null = null;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (f) { if (fence === null) fence = f[1]!; else if (l.trim().startsWith(fence)) fence = null; continue; }
    if (fence !== null) continue;
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) { out.push({ kind: 'heading', level: h[1]!.length, label: plain(h[2]!), line: i + 1 }); continue; }
    const d = /^\s*:{3,}([\w-]+)\[/.exec(l);
    const label = d && bracketed(l, d[0].length - 1);
    if (d && label) out.push({ kind: 'block', name: d[1]!, label: plain(label), line: i + 1 });
  }
  return out;
}
