/**
 * What the solver did with a brand's colours, in words: the build says it, so an author learns why the outputs do not
 * show their exact hex everywhere (and that they still pass in every mode). In English (the CLI, the MCP server) and
 * in Czech (LibKa Studio in Czech).
 */
import type { Design } from './lock.ts';
import type { RoleResult } from './solver.ts';

export type WordsLang = 'en' | 'cs';

/** The phrases of one language. */
interface Phrases {
  /** What each solved role colours, and whether the words are plural. */
  uses: Readonly<Record<string, readonly [string, boolean]>>;
  colour: Readonly<Record<'primary' | 'secondary' | 'link', string>>;
  kept(use: string, plural: boolean): string;
  label(use: string, plural: boolean, passes: boolean): string;
  moved(use: string, plural: boolean, value: string, need: string): string;
  allKept(colour: string, seed: string, uses: string[]): string;
  some(colour: string, seed: string, roles: string[]): string;
  shifted(items: { n: number; seed: string; value: string }[]): string;
  filled(ns: number[], brand: number): string;
  alike(a: number, b: number): string;
  modes: string;
  type(heading: string, body: string, own: 'brand' | 'both' | string, office: string[]): string;
  and: string;
}

const EN: Phrases = {
  uses: {
    'semantic.action.accent': ['bars, borders and charts', true],
    'semantic.text.accent': ['links and accent text', true],
    'component.button.accent.background': ['the accent button', false],
    'semantic.status.ai': ['the AI marks', true],
    'semantic.text.ai': ['AI text', false],
    'component.button.iris.background': ['the AI button', false],
  },
  colour: { primary: 'the primary colour', secondary: 'the secondary colour', link: 'the link colour' },
  kept: (use, plural) => `${use} keep${plural ? '' : 's'} it`,
  label: (use, plural, passes) => `${use} keep${plural ? '' : 's'} it with a ${passes ? 'label that passes' : 'dark label'}`,
  moved: (use, plural, value, need) => `${use} use${plural ? '' : 's'} ${value} to reach ${need}`,
  allKept: (colour, seed, uses) => `${colour} ${seed} passes as it is: ${uses.join(', ')} use it`,
  some: (colour, seed, roles) => `${colour} ${seed}: ${roles.join('; ')}`,
  shifted: (items) => `chart series ${items.map((r) => `${r.n} (${r.seed}) uses ${r.value}`).join(', ')} to reach 3:1 against the page`,
  filled: (ns, brand) => `chart series ${listOf(ns.map(String), 'and')} ${ns.length === 1 ? 'is' : 'are'} LibKa's, after the brand's ${brand === 1 ? 'colour' : `${brand} colours`}`,
  alike: (a, b) => `chart series ${a} and ${b} look much alike: readers still tell them apart by their patterns, but colours further apart read faster`,
  modes: 'the dark and high-contrast modes take their own shades of the same hue, each passing in its mode',
  type: (heading, body, own, office) => `type: ${heading} headings over ${body} text (${own === 'brand' ? 'the brand\'s' : own === 'both' ? 'the brand\'s and the theme\'s' : `the ${own} theme's`}); a Word file uses ${office.length === 1 ? `${office[0]} for both` : `${office[0]} and ${office[1]}`} in their place`,
  and: 'and',
};

const CS: Phrases = {
  uses: {
    'semantic.action.accent': ['sloupce, okraje a grafy', true],
    'semantic.text.accent': ['odkazy a zvýrazněný text', true],
    'component.button.accent.background': ['zvýrazňující tlačítko', false],
    // "označení" reads as singular in Czech, so the verb agrees in the singular
    'semantic.status.ai': ['označení AI', false],
    'semantic.text.ai': ['text AI', false],
    'component.button.iris.background': ['tlačítko AI', false],
  },
  colour: { primary: 'hlavní barva', secondary: 'doplňková barva', link: 'barva odkazů' },
  kept: (use, plural) => `${use} ji ${plural ? 'používají' : 'používá'} beze změny`,
  label: (use, plural, passes) => `${use} ji ${plural ? 'používají' : 'používá'} beze změny a ${plural ? 'mají' : 'má'} ${passes ? 'popisek s dostatečným kontrastem' : 'tmavý popisek'}`,
  moved: (use, plural, value, need) => `${use} ${plural ? 'používají' : 'používá'} ${value} kvůli kontrastu ${need}`,
  // "používá se pro" + accusative: every use's accusative is its nominative, and the verb agrees with the colour
  allKept: (colour, seed, uses) => `${cap(colour)} ${seed} má dostatečný kontrast i beze změny: používá se pro ${uses.join(', ')}`,
  some: (colour, seed, roles) => `${cap(colour)} ${seed}: ${roles.join('; ')}`,
  shifted: (items) => `${items.map((r, i) => `${i ? 'řada' : 'řada grafu'} ${r.n} (${r.seed}) používá ${r.value}`).join(', ')} kvůli kontrastu 3:1 vůči pozadí stránky`,
  filled: (ns, brand) => `${ns.length === 1 ? 'řada' : 'řady'} grafu ${listOf(ns.map(String), 'a')} ${ns.length === 1 ? 'následuje' : 'následují'} za ${brand === 1 ? 'barvou' : `${instrumental(brand)} barvami`} značky a ${ns.length === 1 ? 'má barvu' : 'mají barvy'} LibKa`,
  alike: (a, b) => `řady grafu ${a} a ${b} mají hodně podobné barvy: čtenáři je i tak rozliší podle vzorů, odlišnější barvy se ale čtou rychleji`,
  modes: 'tmavý režim a režimy s vysokým kontrastem mají vlastní odstíny téhož tónu; každý odstín má ve svém režimu dostatečný kontrast',
  type: (heading, body, own, office) => `písmo: nadpisy ${heading}, text ${body} (${own === 'brand' ? 'ze značky' : own === 'both' ? 'ze značky a z motivu' : `z motivu ${own}`}); soubor Word místo nich použije ${office.length === 1 ? `písmo ${office[0]} pro nadpisy i text` : `písma ${office[0]} a ${office[1]}`}`,
  and: 'a',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A Czech count in the instrumental ("za dvěma barvami"), in words up to ten, as digits above (still read correctly). */
const INSTRUMENTAL = ['', 'jednou', 'dvěma', 'třemi', 'čtyřmi', 'pěti', 'šesti', 'sedmi', 'osmi', 'devíti', 'deseti'];
const instrumental = (n: number) => INSTRUMENTAL[n] || String(n);
/** "1, 2 and 3". */
const listOf = (xs: readonly string[], and: string) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);

/**
 * The solver's result for a brand in sentences, one per brand colour, read in the light mode; a last sentence for
 * the other modes, and one for the type. LibKa's own brand (pinned) says nothing.
 */
export function designWords(d: Design, lang: WordsLang = 'en'): string[] {
  if (d.pinned) return [];
  const P = lang === 'cs' ? CS : EN;
  const light = d.roles.filter((r) => r.mode === 'light');
  const out: string[] = [];
  const { primary, secondary, link } = d.brand.color;
  const role = (r: RoleResult): string => {
    const [use, plural] = P.uses[r.key] ?? [r.key, false];
    if (r.reason === 'kept') return P.kept(use, plural);
    if (r.reason === 'label') return P.label(use, plural, r.value === r.seed);
    return P.moved(use, plural, r.value, `${r.need}:1`);
  };
  // each role under the colour that seeded it: with a link colour, links and accent text are the link colour's
  const of = (name: string, r: RoleResult) => (r.key === 'semantic.text.accent' && link ? name === 'link' : name !== 'link');
  for (const [name, seed] of [['primary', primary], ['secondary', secondary], ['link', link]] as const) {
    if (!seed) continue;
    const roles = light.filter((r) => r.seed.toUpperCase() === seed.toUpperCase() && P.uses[r.key] && of(name, r));
    if (!roles.length) continue;
    out.push(roles.every((r) => r.reason === 'kept')
      ? P.allKept(P.colour[name], seed, roles.map((r) => P.uses[r.key]![0]))
      : P.some(P.colour[name], seed, roles.map(role)));
  }
  // the chart series that come from the brand, read in the light mode
  const series = d.charts.results.filter((r) => r.mode === 'light' && r.source !== 'libka');
  const shifted = series.filter((r) => r.value !== r.seed);
  if (shifted.length) out.push(P.shifted(shifted.map((r) => ({ n: r.index + 1, seed: r.seed, value: r.value }))));
  const filled = d.charts.results.filter((r) => r.mode === 'light' && r.source === 'libka').map((r) => r.index + 1);
  if (series.length && filled.length) out.push(P.filled(filled, series.length));
  for (const [a, b] of d.charts.alike) out.push(P.alike(a, b));
  const moved = d.roles.filter((r) => r.mode !== 'light' && r.reason !== 'kept').length
    + d.charts.results.filter((r) => r.mode !== 'light' && r.source !== 'libka' && r.value !== r.seed).length;
  if (out.length && moved) out.push(P.modes);
  // the type, and what a Word file takes instead (it carries no fonts of its own)
  const { heading, body } = d.fonts;
  const named = [d.brand.fonts.heading, d.brand.fonts.body].filter(Boolean).length;
  const own = named === 2 ? 'brand' : named === 1 ? 'both' : d.theme.name[lang] ?? d.theme.name.en;
  out.push(P.type(heading.family, body.family, own, heading.office === body.office ? [heading.office] : [heading.office, body.office]));
  return lang === 'cs' ? out.map(cap) : out;
}
