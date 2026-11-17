/** What a brand or theme file got wrong, by path, with a code a tool can act on. */

export type Severity = 'error' | 'warning' | 'info';

export interface DesignProblem {
  readonly code: string;
  readonly severity: Severity;
  /** The key path in the file (`color.primary`, `typography.base.family`), or '' for the whole file. */
  readonly path: string;
  readonly message: string;
}

export const problem = (code: string, severity: Severity, path: string, message: string): DesignProblem =>
  ({ code, severity, path, message });

export const hasErrors = (problems: readonly DesignProblem[]): boolean => problems.some((p) => p.severity === 'error');

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j]!;
      row[j] = next;
    }
  }
  return row[b.length]!;
}

/** The closest of `options` to `value` (case-insensitive), if it is near enough to be a likely typo. */
export function nearest(value: string, options: readonly string[]): string | undefined {
  const v = value.toLowerCase();
  let best: string | undefined, bestD = Infinity;
  for (const o of options) {
    const d = distance(v, o.toLowerCase());
    if (d < bestD) { best = o; bestD = d; }
  }
  return best !== undefined && bestD <= Math.max(2, Math.floor(v.length / 3)) ? best : undefined;
}

/** ` Did you mean "x"?` when one option is near, else ''. */
export function suggestion(value: string, options: readonly string[]): string {
  const n = nearest(value, options);
  return n ? ` Did you mean "${n}"?` : '';
}
