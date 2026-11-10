/** The front matter "outputs" as toggles. */
import { OUTPUTS, type OutputName } from '@libka/model';

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
