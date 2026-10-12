/** Side-by-side comparison of two texts by line: changed lines paired up, long unchanged stretches folded. */
import { diffLines } from 'diff';

export interface Side { n: number; text: string }
export type Row =
  | { kind: 'same'; left: Side; right: Side }
  | { kind: 'change'; left: Side | null; right: Side | null }
  | { kind: 'fold'; count: number };

export interface Comparison { rows: Row[]; added: number; removed: number }

const lines = (value: string) => value.replace(/\n$/, '').split('\n');

/** Compares `before` (left) with `after` (right); unchanged runs longer than 2 × context are folded. */
export function compare(before: string, after: string, context = 2): Comparison {
  const rows: Row[] = [];
  let l = 1, r = 1, added = 0, removed = 0;
  const parts = diffLines(before, after);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (!part.added && !part.removed) {
      const same = lines(part.value);
      const first = i === 0, last = i === parts.length - 1;
      const keepHead = first ? 0 : context, keepTail = last ? 0 : context;
      if (same.length > keepHead + keepTail + 1) {
        same.slice(0, keepHead).forEach((text) => rows.push({ kind: 'same', left: { n: l++, text }, right: { n: r++, text } }));
        const folded = same.length - keepHead - keepTail;
        rows.push({ kind: 'fold', count: folded });
        l += folded; r += folded;
        same.slice(same.length - keepTail).forEach((text) => rows.push({ kind: 'same', left: { n: l++, text }, right: { n: r++, text } }));
      } else same.forEach((text) => rows.push({ kind: 'same', left: { n: l++, text }, right: { n: r++, text } }));
      continue;
    }
    // a removal followed by an addition is one change: pair the lines up side by side
    const gone = part.removed ? lines(part.value) : [];
    const next = part.removed && parts[i + 1]?.added ? parts[++i]! : part.added ? part : null;
    const come = next ? lines(next.value) : [];
    removed += gone.length; added += come.length;
    for (let k = 0; k < Math.max(gone.length, come.length); k++) {
      rows.push({ kind: 'change', left: k < gone.length ? { n: l++, text: gone[k]! } : null, right: k < come.length ? { n: r++, text: come[k]! } : null });
    }
  }
  return { rows, added, removed };
}
