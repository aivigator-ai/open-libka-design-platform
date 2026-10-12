/** Text the renderers add around the author's content, in the document's language. */
export type Lang = 'en' | 'cs';
export const langOf = (lang: string): Lang => (lang.toLowerCase().startsWith('cs') ? 'cs' : 'en');

/** A word's forms by count, named as Intl.PluralRules names them; "{n}" is the number. */
export type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
/** The form for a count: "1 value", "3 values"; in Czech "1 hodnota", "3 hodnoty", "6 hodnot". "{v}" is Czech "v" or "ve". */
export const plural = (forms: Forms, n: number, lang: Lang): string =>
  (forms[new Intl.PluralRules(lang).select(n)] ?? forms.other).replace('{n}', String(n)).replace('{v}', czechIn(n));

/**
 * Czech "v" or "ve" before a whole number, by how the number is read: "ve" before dvě, tři, čtyři, dvanáct to
 * čtrnáct, dvacet to čtyřicet and sto ("ve dvou", "ve dvanácti", "ve dvaceti pěti", "ve stu"), else "v" ("v pěti",
 * "v tisíci", "v pěti stech").
 */
export function czechIn(n: number): 'v' | 've' {
  n = Math.floor(Math.abs(n));
  for (const unit of [1e9, 1e6, 1e3]) if (n >= unit) { const k = Math.floor(n / unit); return k === 1 ? 'v' : czechIn(k); }
  if (n >= 100) { const h = Math.floor(n / 100); return h === 1 ? 've' : czechIn(h); }
  if (n >= 20) return [2, 3, 4].includes(Math.floor(n / 10)) ? 've' : 'v';
  return [2, 3, 4, 12, 13, 14].includes(n) ? 've' : 'v';
}

const en = {
  skip: 'Skip to content', contents: 'Contents', version: 'Version', date: 'Date', status: 'Status',
  builtWith: 'Built with LibKa', from: 'from',
  done: 'Done: ', open: 'Open: ',
  copy: 'Copy', copied: 'Copied to the clipboard', copyCode: 'Copy code', marked: 'Highlighted line',
  tabs: 'Versions',
  do: 'Do', dont: "Don't",
  keys: 'Keys', action: 'Action',
  showData: 'Show the data', transcript: 'Transcript',
  play: 'Play the video: {title}', loadsFrom: 'Loads from {provider} only when you play it (privacy-enhanced mode).',
  videoAt: 'Video: {title}, {src}',
  bar: 'Bar chart', line: 'Line chart', donut: 'Donut chart',
  summary: '{kind}: {caption}. {values} {inSeries}. Highest: {max} ({where}). Lowest: {min} ({whereMin}).',
  chartValues: { one: '{n} value', other: '{n} values' } as Forms,
  chartSeries: { one: 'in {n} series', other: 'in {n} series' } as Forms,
  donutSummary: '{kind}: {caption}. {parts}.',
  tone: { info: 'Info', success: 'Success', warning: 'Warning', error: 'Error', note: 'Note', tip: 'Tip', important: 'Important', caution: 'Caution' },
  keyTakeaways: 'Key takeaways', aiAssisted: 'AI-assisted', reviewedBy: 'Reviewed by {name}.',
  docStatus: 'Document status', owner: 'Owner', reviewed: 'Reviewed', nextReview: 'Next review',
  deprecated: 'Deprecated', deprecatedText: 'This document is no longer maintained. Do not rely on it; ask the owner for its replacement.',
  notes: 'Notes', note: 'Note', backToText: 'Back to the text of note {n}', references: 'References', and: 'and', etAl: 'et al.', noDate: 'n.d.',
  slideN: 'slide {n}',
  timeline: 'Timeline', now: 'Now', past: 'Past', planned: 'Planned',
  mark: { yes: 'Included', no: 'Not included', partial: 'Partly' }, recommended: 'Recommended',
  release: { added: 'Added', changed: 'Changed', deprecated: 'Deprecated', removed: 'Removed', fixed: 'Fixed', security: 'Security' },
  released: 'Released',
  diagramSource: 'Show the source', continued: 'continued',
  diagramSources: 'Diagram sources', page: 'Page {n}', picture: 'Picture', data: 'data',
};
export type Labels = typeof en;

const cs: Labels = {
  skip: 'Přeskočit na obsah', contents: 'Obsah', version: 'Verze', date: 'Datum', status: 'Stav',
  builtWith: 'Vytvořeno v LibKa', from: 'ze souboru',
  done: 'Hotovo: ', open: 'Zbývá: ',
  copy: 'Kopírovat', copied: 'Zkopírováno do schránky', copyCode: 'Kopírovat kód', marked: 'Zvýrazněný řádek',
  tabs: 'Varianty',
  do: 'Správně', dont: 'Špatně',
  keys: 'Klávesy', action: 'Akce',
  showData: 'Zobrazit data', transcript: 'Přepis',
  play: 'Přehrát video: {title}', loadsFrom: 'Načte se ze služby {provider} až po spuštění (režim se zvýšeným soukromím).',
  videoAt: 'Video: {title}, {src}',
  bar: 'Sloupcový graf', line: 'Spojnicový graf', donut: 'Prstencový graf',
  summary: '{kind}: {caption}. {values} {inSeries}. Nejvyšší: {max} ({where}). Nejnižší: {min} ({whereMin}).',
  // integers only: one (1), few (2 to 4), other (0, 5 and more); {v} is "v" or "ve" as the number is read (czechIn)
  chartValues: { one: '{n} hodnota', few: '{n} hodnoty', other: '{n} hodnot' },
  chartSeries: { one: '{v} {n} řadě', other: '{v} {n} řadách' },
  donutSummary: '{kind}: {caption}. {parts}.',
  tone: { info: 'Informace', success: 'Úspěch', warning: 'Varování', error: 'Chyba', note: 'Poznámka', tip: 'Tip', important: 'Důležité', caution: 'Pozor' },
  keyTakeaways: 'Hlavní body', aiAssisted: 'S pomocí AI', reviewedBy: 'Zkontroloval(a) {name}.',
  docStatus: 'Stav dokumentu', owner: 'Vlastník', reviewed: 'Revize', nextReview: 'Příští revize',
  deprecated: 'Zastaralé', deprecatedText: 'Tento dokument se už neudržuje. Nespoléhejte na něj; o náhradu požádejte vlastníka.',
  notes: 'Poznámky', note: 'Poznámka', backToText: 'Zpět k textu poznámky {n}', references: 'Zdroje', and: 'a', etAl: 'a kol.', noDate: 'b. r.',
  slideN: 'snímek {n}',
  timeline: 'Časová osa', now: 'Nyní', past: 'Proběhlo', planned: 'Plánováno',
  mark: { yes: 'Obsahuje', no: 'Neobsahuje', partial: 'Částečně' }, recommended: 'Doporučeno',
  release: { added: 'Přidáno', changed: 'Změněno', deprecated: 'Označeno jako zastaralé', removed: 'Odstraněno', fixed: 'Opraveno', security: 'Bezpečnost' },
  released: 'Vydáno',
  diagramSource: 'Zobrazit zdroj', continued: 'pokračování',
  diagramSources: 'Zdroje diagramů', page: 'Strana {n}', picture: 'Obrázek', data: 'data',
};

export const LABELS: Record<Lang, Labels> = { en, cs };
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
