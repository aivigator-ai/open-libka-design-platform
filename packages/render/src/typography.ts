/**
 * Language-specific typography applied to a finished page. Czech: a one-letter preposition or conjunction
 * (k, s, v, z, o, u, a, i) never ends a line, and a number stays with its unit and with its other digit groups
 * ("1 240 000 Kč"). Only text between tags changes: never attributes, code, scripts or styles. The Markdown
 * source stays as written.
 */

const NBSP = ' ';
/** Elements whose text stays exactly as written. */
const VERBATIM = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style', 'textarea']);
const UNITS = ['%', '‰', 'Kč', '€', '°C', 'km', 'kg', 'cm', 'mm', 'ml', 'm', 'g', 'l', 'h', 'min', 's', 'ks', 'kB', 'MB', 'GB', 'TB', 'px', 'let', 'dní', 'dnů', 'hod'];
const unit = new RegExp(`(\\d) (${UNITS.map((u) => u.replace(/[$%]/g, '\\$&')).join('|')})(?=[\\s.,;:!?)\\]]|$)`, 'g');

/** Czech rules on one run of text. */
export function czechText(text: string): string {
  return text
    // a one-letter word keeps the next word on its line: "v Praze", "a také"
    // (a lookbehind, so "i v noci" binds both words)
    .replace(/(?<=^|[\s(\[„"'“‚«>])([ksvzouaiKSVZOUAI]) (?=\S|$)/g, `$1${NBSP}`)
    // a number keeps its unit and its digit groups together
    .replace(unit, `$1${NBSP}$2`)
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`);
}

/** A finished page with the typography of its language applied to every text run outside verbatim elements. */
export function typeset(html: string, lang: string): string {
  if (!/^cs\b/i.test(lang)) return html;
  const out: string[] = [];
  let skip = 0;   // depth of open verbatim elements (code, pre, kbd ...)
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    const text = html.slice(i, lt < 0 ? html.length : lt);
    out.push(skip > 0 ? text : czechText(text));
    if (lt < 0) break;
    const gt = html.indexOf('>', lt);
    if (gt < 0) { out.push(html.slice(lt)); break; }
    const tag = html.slice(lt, gt + 1);
    out.push(tag);
    i = gt + 1;
    const m = tag.match(/^<(\/?)([a-zA-Z][\w-]*)/);
    if (!m) continue;
    const name = m[2]!.toLowerCase();
    if (RAW.has(name) && !m[1]) {
      // script, style and textarea hold raw text that may contain "<": copy it through to the closing tag
      const end = html.toLowerCase().indexOf(`</${name}`, i);
      const stop = end < 0 ? html.length : end;
      out.push(html.slice(i, stop));
      i = stop;
    } else if (VERBATIM.has(name)) skip = Math.max(0, skip + (m[1] ? -1 : tag.endsWith('/>') ? 0 : 1));
  }
  return out.join('');
}

/** Elements whose content is raw text, not markup. */
const RAW = new Set(['script', 'style', 'textarea']);
