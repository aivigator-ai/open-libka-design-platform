/**
 * The plain names of the blocks' settings, for editors (the Studio's Properties, the catalog): "Next review" for
 * `next-review`, "Tab name" for a tab's `label`. One name per key, unless a block or a child directive means something
 * else by it (`block.key` or `block.child.key` overrides the key's name). Every setting of the registry has a name in
 * both languages (tested); the help stays in each setting's `description` and its Czech `help`.
 */
export interface SettingTitle { en: string; cs: string }

const BY_KEY: Readonly<Record<string, SettingTitle>> = {
  status: { en: 'Status', cs: 'Stav' },
  owner: { en: 'Owner', cs: 'Vlastník' },
  reviewed: { en: 'Last reviewed', cs: 'Poslední revize' },
  'next-review': { en: 'Next review', cs: 'Příští revize' },
  depth: { en: 'Depth', cs: 'Hloubka' },
  style: { en: 'Citation style', cs: 'Styl citací' },
  date: { en: 'Date', cs: 'Datum' },
  by: { en: 'Decided by', cs: 'Kdo rozhodl' },
  break: { en: 'Page break', cs: 'Zalomení stránky' },
  title: { en: 'Title', cs: 'Název' },
  '{n,m-k}': { en: 'Highlighted lines', cs: 'Zvýrazněné řádky' },
  variant: { en: 'Variant', cs: 'Varianta' },
  label: { en: 'Label', cs: 'Popisek' },
  caption: { en: 'Caption', cs: 'Popisek' },
  shape: { en: 'Shape', cs: 'Tvar' },
  type: { en: 'Type', cs: 'Typ' },
  x: { en: 'Horizontal axis', cs: 'Vodorovná osa' },
  y: { en: 'Vertical axis', cs: 'Svislá osa' },
  source: { en: 'Source', cs: 'Zdroj' },
  cite: { en: 'Source link', cs: 'Odkaz na zdroj' },
  href: { en: 'Link', cs: 'Odkaz' },
  badge: { en: 'Badge', cs: 'Štítek' },
  'reviewed-by': { en: 'Reviewed by', cs: 'Kdo zkontroloval' },
  src: { en: 'Video', cs: 'Video' },
  captions: { en: 'Captions', cs: 'Titulky' },
  poster: { en: 'Poster image', cs: 'Úvodní obrázek' },
  size: { en: 'File size', cs: 'Velikost souboru' },
  pages: { en: 'Pages', cs: 'Počet stran' },
  current: { en: 'Current item', cs: 'Aktuální položka' },
  highlight: { en: 'Recommended column', cs: 'Doporučený sloupec' },
  unit: { en: 'Unit', cs: 'Jednotka' },
  theme: { en: 'Theme', cs: 'Motiv' },
  layout: { en: 'Layout', cs: 'Rozvržení' },
  state: { en: 'State', cs: 'Stav' },
  value: { en: 'Value', cs: 'Hodnota' },
  placeholder: { en: 'Placeholder', cs: 'Zástupný text' },
  hint: { en: 'Hint', cs: 'Nápověda' },
  error: { en: 'Error message', cs: 'Chybová zpráva' },
  options: { en: 'Options', cs: 'Možnosti' },
  required: { en: 'Required', cs: 'Povinné' },
  text: { en: 'Text', cs: 'Text' },
  action: { en: 'Action', cs: 'Akce' },
  primary: { en: 'Main action', cs: 'Hlavní akce' },
  secondary: { en: 'Way out', cs: 'Cesta zpět' },
  destructive: { en: 'Removes something', cs: 'Něco odstraní' },
};

/** Where a block or a child directive means something else by a key: `block.key` or `block.child.key`. */
const BY_PLACE: Readonly<Record<string, SettingTitle>> = {
  'code.title': { en: 'Title above the code', cs: 'Popisek nad kódem' },
  'callout.variant': { en: 'Kind', cs: 'Druh' },
  'cta.variant': { en: 'Emphasis', cs: 'Důraz' },
  'matrix.type': { en: 'Kind', cs: 'Druh' },
  'download.type': { en: 'Format', cs: 'Formát' },
  'download.href': { en: 'File', cs: 'Soubor' },
  'chart.type': { en: 'Chart type', cs: 'Typ grafu' },
  'summary.source': { en: 'Written by', cs: 'Kdo napsal' },
  'comparison.badge': { en: 'Badge text', cs: 'Text štítku' },
  'tabs.tab.label': { en: 'Tab name', cs: 'Název karty' },
  'accordion.item.label': { en: 'Question or topic', cs: 'Otázka nebo téma' },
  'compare.do.label': { en: 'What to do', cs: 'Co dělat' },
  'compare.dont.label': { en: 'What to avoid', cs: 'Čemu se vyhnout' },
  'matrix.q.label': { en: 'Quadrant name', cs: 'Název kvadrantu' },
  'cards.card.label': { en: 'Card title', cs: 'Název dlaždice' },
  'ui.button.label': { en: 'Button text', cs: 'Text tlačítka' },
  'ui.field.type': { en: 'Input type', cs: 'Typ pole' },
  'ui.badge.label': { en: 'Text', cs: 'Text' },
  'ui.badge.variant': { en: 'Meaning', cs: 'Význam' },
  'ui.toast.label': { en: 'Title', cs: 'Nadpis' },
  'ui.toast.variant': { en: 'Meaning', cs: 'Význam' },
  'ui.modal.label': { en: 'Title', cs: 'Nadpis' },
  'ui.empty.label': { en: 'Title', cs: 'Nadpis' },
  // the inline elements (`badge` in text: ::badge[Beta]{variant=...}, `kbd`)
  'badge.label': { en: 'Text', cs: 'Text' },
  'badge.variant': { en: 'Meaning', cs: 'Význam' },
  'kbd.label': { en: 'Keys', cs: 'Klávesy' },
};

/**
 * A setting's plain name: `block` is the block (or inline element), `child` the child directive when the setting is
 * one of its own. Undefined for a key the table does not know (a test keeps every registry setting named).
 */
export function settingTitle(block: string, key: string, child?: string): SettingTitle | undefined {
  return BY_PLACE[child ? `${block}.${child}.${key}` : `${block}.${key}`] ?? BY_KEY[key];
}
