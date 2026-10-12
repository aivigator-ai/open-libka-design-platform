/** The front matter "outputs" as toggles. */
import { OUTPUTS, type OutputName } from '@libka/model';

/** The source with its front matter "outputs" set to the list (a front matter is added when there is none). */
export function withOutputs(source: string, list: readonly OutputName[]): string {
  const line = `outputs: [${list.join(', ')}]`;
  const fm = source.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!fm) return `---\n${line}\n---\n\n${source}`;
  const lines = fm[1]!.split(/\r?\n/);
  const at = lines.findIndex((l) => /^outputs\s*:/.test(l));
  if (at < 0) lines.push(line);
  else {
    let end = at + 1;
    while (end < lines.length && /^\s+-\s/.test(lines[end]!)) end++;   // a block list under it
    lines.splice(at, end - at, line);
  }
  return `---\n${lines.join('\n')}\n---${fm[2]}${source.slice(fm[0].length)}`;
}

/**
 * The outputs after the author ticks or unticks one. The PDF and the Word file are made from the web page, as in the
 * build: they bring it back, and dropping it drops them. Returns null when nothing would be left.
 */
export function toggleOutput(current: readonly OutputName[], output: OutputName, on: boolean): OutputName[] | null {
  const set = new Set(current);
  if (on) set.add(output); else set.delete(output);
  if (!on && output === 'web') { set.delete('pdf'); set.delete('docx'); }
  if (on && (output === 'pdf' || output === 'docx')) set.add('web');
  return set.size ? OUTPUTS.filter((o) => set.has(o)) : null;
}
