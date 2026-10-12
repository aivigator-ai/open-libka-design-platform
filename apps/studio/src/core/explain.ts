/**
 * Guard's findings in plain words: what the rule protects, and how to put it right in a LibKa document. Guard's own
 * rules and the Word file checks are all here, and the axe-core rules an author's text can cause; any other axe rule
 * falls back to axe's own one-line help (it then points at the Studio or at LibKa, not at the author's text). Nothing
 * here changes the document: the author fixes it, the Studio shows where.
 */
import type { Lang } from '../i18n.ts';

export interface Explanation { why: string; fix: string }

type Table = Readonly<Record<string, Readonly<Record<Lang, Explanation>>>>;

export const EXPLAIN: Table = {
  /* ---- Guard's own rules ---- */
  contrast: {
    en: { why: 'Text must stand out from its background so people with low vision can read it: 4.5:1 for normal text, 3:1 for large text (7:1 and 4.5:1 in high contrast).', fix: 'LibKa\'s colours pass by themselves, so a failure usually comes from a picture with text in it or from raw HTML in the document. Remove the raw colours or use a block that carries the meaning (a callout, a badge).' },
    cs: { why: 'Text se musí odlišovat od pozadí, aby ho přečetli i lidé se slabším zrakem: 4,5:1 u běžného textu, 3:1 u velkého (ve vysokém kontrastu 7:1 a 4,5:1).', fix: 'Barvy LibKa vyhovují samy, takže chyba obvykle pochází z obrázku s textem nebo z HTML vloženého do dokumentu. Odstraňte vlastní barvy, nebo použijte blok, který význam nese (zvýraznění, štítek).' },
  },
  'figure-caption': {
    en: { why: 'A caption tells every reader what a picture shows and lets it be referred to.', fix: 'Write the caption as the image\'s title in quotes: ![Alt text](picture.png "Caption"). In Visual mode select the picture and fill in Caption in the Inspector.' },
    cs: { why: 'Popisek všem čtenářům řekne, co obrázek ukazuje, a dá se na něj odkázat.', fix: 'Napište popisek jako titulek obrázku v uvozovkách: ![Alternativní text](obrazek.png "Popisek"). Ve vizuálním režimu vyberte obrázek a vyplňte Popisek v Inspektoru.' },
  },
  'table-caption': {
    en: { why: 'Screen readers announce a table by its caption; without one, readers must guess what the numbers are.', fix: 'Put the table in :::table{caption="What the data shows"}. The problem list offers this as a fix.' },
    cs: { why: 'Čtečky obrazovky ohlašují tabulku jejím titulkem; bez něj čtenář hádá, co čísla znamenají.', fix: 'Vložte tabulku do :::table{caption="Co data ukazují"}. Seznam problémů to nabízí jako opravu.' },
  },
  'table-header-scope': {
    en: { why: 'Header cells must say whether they head a column or a row, so screen readers can read each cell with its header.', fix: 'LibKa sets this for Markdown tables. A table written in raw HTML needs scope="col" or scope="row" on each <th>; better, write it as a Markdown table.' },
    cs: { why: 'Buňky záhlaví musí říct, zda nadepisují sloupec, nebo řádek, aby čtečka četla každou buňku s jejím záhlavím.', fix: 'U tabulek v Markdownu to LibKa nastaví sama. Tabulka v HTML potřebuje u každého <th> scope="col" nebo scope="row"; lepší je napsat ji v Markdownu.' },
  },
  'slide-overflow': {
    en: { why: 'Text that does not fit on a slide is cut off for the audience.', fix: 'Shorten the slide\'s text, or split it: a new ## heading or a :::section starts a new slide; long lists read better as two slides.' },
    cs: { why: 'Text, který se na snímek nevejde, publikum neuvidí celý.', fix: 'Zkraťte text snímku, nebo ho rozdělte: nový nadpis ## nebo :::section začne nový snímek; dlouhé seznamy se lépe čtou na dvou snímcích.' },
  },
  'chart-text-clipped': {
    en: { why: 'A chart\'s labels must be readable in full.', fix: 'Shorten the labels in the chart\'s table (the first column), or use fewer rows.' },
    cs: { why: 'Popisky grafu musí být čitelné celé.', fix: 'Zkraťte popisky v tabulce grafu (první sloupec), nebo použijte méně řádků.' },
  },
  'no-inline-style': {
    en: { why: 'Colours and spacing come from the LibKa tokens so every theme, high contrast and print work; a style attribute overrides them.', fix: 'Remove the style="…" from raw HTML in the document, and use a LibKa block for the effect.' },
    cs: { why: 'Barvy a rozestupy pocházejí z tokenů LibKa, aby fungovaly všechny motivy, vysoký kontrast i tisk; atribut style je přebíjí.', fix: 'Odstraňte style="…" z HTML v dokumentu a pro požadovaný vzhled použijte blok LibKa.' },
  },
  reflow: {
    en: { why: 'On a phone, a page that scrolls sideways makes readers scroll back and forth on every line.', fix: 'Break a long address or command into a code block (```), where it scrolls on its own, or shorten it; wide pictures and raw HTML need a width that fits.' },
    cs: { why: 'Když se stránka na telefonu posouvá do strany, musí ji čtenář u každého řádku posouvat sem a tam.', fix: 'Dlouhou adresu nebo příkaz zkraťte, nebo je dejte do bloku kódu (```), který se posouvá samostatně; široké obrázky a HTML v dokumentu potřebují šířku, která se vejde na obrazovku.' },
  },
  'csp-blocked': {
    en: { why: 'The page\'s security policy blocked something it tried to load.', fix: 'Pictures and videos must be files next to the document or allowed video sites; remove scripts and other outside resources from raw HTML.' },
    cs: { why: 'Bezpečnostní pravidla stránky zablokovala něco, co se pokusila načíst.', fix: 'Obrázky a videa musí být soubory vedle dokumentu nebo povolené videoslužby; z HTML odstraňte skripty a jiné vnější zdroje.' },
  },
  /* ---- the Word file ---- */
  'docx-package': {
    en: { why: 'The Word file must be a valid package that Word and LibreOffice open.', fix: 'This is LibKa\'s side, not your text: report it with the document attached.' },
    cs: { why: 'Soubor Word musí být platný balíček, který Word i LibreOffice otevřou.', fix: 'Tohle je chyba LibKa, ne vašeho textu: nahlaste ji i s dokumentem.' },
  },
  'docx-title': {
    en: { why: 'The file\'s title is what assistive technology and file lists show.', fix: 'Set the document\'s title (title: in the front matter, or Document properties in the Inspector).' },
    cs: { why: 'Název souboru ukazují asistivní technologie i seznamy souborů.', fix: 'Nastavte název dokumentu (title: v úvodních údajích, nebo Vlastnosti dokumentu v Inspektoru).' },
  },
  'docx-language': {
    en: { why: 'The language tells screen readers how to pronounce the text and spell checkers which dictionary to use.', fix: 'Set lang: en or lang: cs in the front matter.' },
    cs: { why: 'Jazyk říká čtečkám, jak text vyslovit, a kontrole pravopisu, který slovník použít.', fix: 'Nastavte v úvodních údajích lang: en nebo lang: cs.' },
  },
  'docx-heading-order': {
    en: { why: 'Headings form the outline readers navigate by; a skipped level breaks it.', fix: 'Go down one level at a time: ## then ###, never ## then ####.' },
    cs: { why: 'Nadpisy tvoří osnovu, podle které se čtenáři pohybují; přeskočená úroveň ji rozbije.', fix: 'Klesejte vždy o jednu úroveň: ## a pak ###, nikdy ## a hned ####.' },
  },
  'docx-alt-text': {
    en: { why: 'People who cannot see a picture get its alt text instead.', fix: 'Write what the picture shows in the brackets: ![What it shows](picture.png "Caption").' },
    cs: { why: 'Kdo obrázek nevidí, dostane místo něj alternativní text.', fix: 'Napište do hranatých závorek, co obrázek ukazuje: ![Co ukazuje](obrazek.png "Popisek").' },
  },
  'docx-table-header': {
    en: { why: 'A table\'s header row is repeated and announced with each cell.', fix: 'Give the table a header row (the first row above the |---| line).' },
    cs: { why: 'Řádek záhlaví tabulky se opakuje a ohlašuje s každou buňkou.', fix: 'Dejte tabulce řádek záhlaví (první řádek nad čarou |---|).' },
  },
  'docx-link-text': {
    en: { why: 'Links are often read out of context, so their text must say where they lead.', fix: 'Write link text that names the target, not "here" or "click": [The install guide](install.md).' },
    cs: { why: 'Odkazy se často čtou mimo souvislosti, proto musí jejich text říct, kam vedou.', fix: 'Napište text odkazu, který cíl pojmenuje, ne „zde“ nebo „klikněte“: [Návod k instalaci](install.md).' },
  },
  'docx-contrast': {
    en: { why: 'Text in the Word file must stand out from its background, as on the web page.', fix: 'This follows the LibKa theme: report it if it appears, with the document attached.' },
    cs: { why: 'Text v souboru Word se musí odlišovat od pozadí stejně jako na webové stránce.', fix: 'Řídí se motivem LibKa: pokud se objeví, nahlaste ho i s dokumentem.' },
  },
  /* ---- axe-core rules an author's text can cause ---- */
  'image-alt': {
    en: { why: 'People who cannot see a picture get its alt text instead.', fix: 'Write what the picture shows in the brackets: ![What it shows](picture.png "Caption"). In Visual mode, select the picture and fill in Alt text.' },
    cs: { why: 'Kdo obrázek nevidí, dostane místo něj alternativní text.', fix: 'Napište do hranatých závorek, co obrázek ukazuje: ![Co ukazuje](obrazek.png "Popisek"). Ve vizuálním režimu vyberte obrázek a vyplňte Alternativní text.' },
  },
  'link-name': {
    en: { why: 'A link without text is announced as just "link".', fix: 'Give the link words: [The install guide](install.md), not [](install.md).' },
    cs: { why: 'Odkaz bez textu se ohlásí jen jako „odkaz“.', fix: 'Dejte odkazu slova: [Návod k instalaci](install.md), ne [](install.md).' },
  },
  'color-contrast': {
    en: { why: 'Text must stand out from its background so people with low vision can read it.', fix: 'LibKa\'s colours pass by themselves; remove raw colours from HTML in the document, or replace a picture of text with real text.' },
    cs: { why: 'Text se musí odlišovat od pozadí, aby ho přečetli i lidé se slabším zrakem.', fix: 'Barvy LibKa vyhovují samy; odstraňte vlastní barvy z HTML v dokumentu, nebo nahraďte obrázek textu skutečným textem.' },
  },
  'heading-order': {
    en: { why: 'Headings form the outline readers navigate by; a skipped level breaks it.', fix: 'Go down one level at a time: ## then ###, never ## then ####.' },
    cs: { why: 'Nadpisy tvoří osnovu, podle které se čtenáři pohybují; přeskočená úroveň ji rozbije.', fix: 'Klesejte vždy o jednu úroveň: ## a pak ###, nikdy ## a hned ####.' },
  },
  'empty-heading': {
    en: { why: 'An empty heading is announced with nothing to say.', fix: 'Write the heading\'s text, or remove the # marks.' },
    cs: { why: 'Prázdný nadpis se ohlásí, ale nic neřekne.', fix: 'Napište text nadpisu, nebo odstraňte znaky #.' },
  },
  'page-has-heading-one': {
    en: { why: 'The page\'s main heading names it for everyone navigating by headings.', fix: 'Set the document\'s title in the front matter; LibKa makes it the main heading.' },
    cs: { why: 'Hlavní nadpis stránku pojmenuje všem, kdo se pohybují podle nadpisů.', fix: 'Nastavte název dokumentu v úvodních údajích; LibKa z něj udělá hlavní nadpis.' },
  },
  'document-title': {
    en: { why: 'The title names the page in tabs, bookmarks and screen readers.', fix: 'Set title: in the front matter.' },
    cs: { why: 'Název pojmenuje stránku v kartách, záložkách i čtečkách obrazovky.', fix: 'Nastavte title: v úvodních údajích.' },
  },
  'html-lang-valid': {
    en: { why: 'The language tells screen readers how to pronounce the text.', fix: 'Set lang: en or lang: cs in the front matter.' },
    cs: { why: 'Jazyk říká čtečkám, jak text vyslovit.', fix: 'Nastavte v úvodních údajích lang: en nebo lang: cs.' },
  },
  'valid-lang': {
    en: { why: 'A language change inside the text must name a real language.', fix: 'Correct the lang attribute in raw HTML in the document (en, cs, de …).' },
    cs: { why: 'Změna jazyka uvnitř textu musí uvádět skutečný jazyk.', fix: 'Opravte atribut lang v HTML vloženém do dokumentu (en, cs, de …).' },
  },
  'duplicate-id': {
    en: { why: 'Two elements with the same id break links and labels that point to them.', fix: 'Two headings, terms or footnotes have the same name: make one of them different.' },
    cs: { why: 'Dva prvky se stejným id rozbijí odkazy a popisky, které na ně míří.', fix: 'Dva nadpisy, pojmy nebo poznámky mají stejný název: jeden z nich změňte.' },
  },
  'link-in-text-block': {
    en: { why: 'Links inside text must be told apart from it by more than colour.', fix: 'LibKa underlines links; raw HTML that removes the underline must be removed.' },
    cs: { why: 'Odkazy v textu se od něj musí lišit víc než barvou.', fix: 'LibKa odkazy podtrhává; HTML, které podtržení odstraňuje, je třeba odstranit.' },
  },
  list: {
    en: { why: 'A list may hold only list items, or screen readers miscount it.', fix: 'This comes from raw HTML in the document: write the list in Markdown (- or 1.).' },
    cs: { why: 'Seznam smí obsahovat jen položky, jinak ho čtečka špatně spočítá.', fix: 'Pochází z HTML v dokumentu: napište seznam v Markdownu (- nebo 1.).' },
  },
  listitem: {
    en: { why: 'A list item must sit in a list.', fix: 'This comes from raw HTML in the document: write the list in Markdown (- or 1.).' },
    cs: { why: 'Položka seznamu musí být v seznamu.', fix: 'Pochází z HTML v dokumentu: napište seznam v Markdownu (- nebo 1.).' },
  },
  'frame-title': {
    en: { why: 'An embedded frame (a video) needs a title to be announced.', fix: 'Give the :::video block its title in brackets: :::video[What the video shows].' },
    cs: { why: 'Vložený rámec (video) potřebuje název, aby se dal ohlásit.', fix: 'Dejte bloku :::video název v hranatých závorkách: :::video[Co video ukazuje].' },
  },
  'svg-img-alt': {
    en: { why: 'A drawing (a diagram or a chart) needs a text alternative.', fix: 'Give the diagram its accTitle and accDescr, and the chart its caption.' },
    cs: { why: 'Kresba (diagram nebo graf) potřebuje textovou alternativu.', fix: 'Dejte diagramu accTitle a accDescr a grafu titulek (caption).' },
  },
};

/** The plain-language explanation of a finding's rule, or null when there is none (the finding's own message stands). */
export function explain(rule: string, lang: Lang): Explanation | null {
  return EXPLAIN[rule]?.[lang] ?? null;
}
