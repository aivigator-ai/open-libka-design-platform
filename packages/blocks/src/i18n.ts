/**
 * The registry's text in Czech, for editors (the Studio's menus, palette and Inspector work in English and Czech).
 * The catalog, the AI skill and the MCP server stay English; the block names, attribute names and values are the
 * syntax and are never translated, only their labels. A test makes sure every block, attribute, child directive,
 * value and inline element here has its Czech text, and nothing here names something the registry does not have.
 */
import type { BlockGroup } from './index.ts';

export interface CzechAttribute {
  help: string;
  /** Labels of the values it takes, by value (`info` → `Informace`). */
  values?: Readonly<Record<string, string>>;
}

export interface CzechBlock {
  title: string;
  summary: string;
  attributes?: Readonly<Record<string, CzechAttribute>>;
  /** Child directives (`tab`, `card`, `button` ...), with their attributes. */
  children?: Readonly<Record<string, { attributes: Readonly<Record<string, CzechAttribute>> }>>;
}

/** Titles of child directives in both languages (the registry names only their attributes). */
export const CHILD_TITLES: Readonly<Record<string, { en: string; cs: string }>> = {
  tab: { en: 'Tab', cs: 'Karta' },
  item: { en: 'Item', cs: 'Položka' },
  do: { en: 'Do', cs: 'Dělejte' },
  dont: { en: "Don't", cs: 'Nedělejte' },
  card: { en: 'Card', cs: 'Dlaždice' },
  button: { en: 'Button', cs: 'Tlačítko' },
  field: { en: 'Field', cs: 'Pole' },
  badge: { en: 'Badge', cs: 'Štítek' },
  toast: { en: 'Toast', cs: 'Oznámení' },
  modal: { en: 'Dialog', cs: 'Dialog' },
  empty: { en: 'Empty state', cs: 'Prázdný stav' },
  added: { en: 'Added', cs: 'Přidáno' },
  changed: { en: 'Changed', cs: 'Změněno' },
  deprecated: { en: 'Deprecated', cs: 'Zastaralé' },
  removed: { en: 'Removed', cs: 'Odstraněno' },
  fixed: { en: 'Fixed', cs: 'Opraveno' },
  security: { en: 'Security', cs: 'Bezpečnost' },
};

export const GROUPS_CS: Readonly<Record<BlockGroup, string>> = {
  text: 'Text',
  document: 'Dokument',
  'how-to': 'Návody',
  explain: 'Vysvětlení',
  highlight: 'Důraz',
  media: 'Média',
  data: 'Data',
  ui: 'Ukázky rozhraní',
};

const date = (help: string): CzechAttribute => ({ help });
const status = { info: 'Informace', success: 'Úspěch', warning: 'Varování', error: 'Chyba' };

export const BLOCKS_CS: Readonly<Record<string, CzechBlock>> = {
  heading: {
    title: 'Nadpis',
    summary: 'Oddíly (##), pododdíly (###) a menší nadpisy (####). Název dokumentu se bere z úvodních údajů.',
  },
  paragraph: {
    title: 'Odstavec',
    summary: 'Běžný text s **tučným**, *kurzívou*, `kódem`, odkazy a klávesami :kbd[Ctrl+S].',
  },
  list: {
    title: 'Seznam',
    summary: 'Seznam s odrážkami (-) nebo číslovaný (1.). Pro návody použijte :::steps, pro úkoly :::checklist.',
  },
  dl: {
    title: 'Seznam definic',
    summary: 'Pojmy a jejich hodnoty ve dvou sloupcích, například „Vlastník: Tým dokumentace“. Hodnoty mohou obsahovat odkazy, e-mailové adresy a kód. Pro pojmy, které se čtenář učí, použijte :::glossary.',
  },
  'doc-status': {
    title: 'Stav dokumentu',
    summary: 'Stav, vlastník a data revizí. Klíče status, owner, reviewed a next-review v úvodních údajích se samy zobrazí pod názvem a v zápatí; :::doc-status je umístí jako panel tam, kde je chcete (a může je i nastavit).',
    attributes: {
      status: { help: 'Koncept, Schváleno, Zastaralé… (nebo nastavte v úvodních údajích). Zastaralý dokument dostane nahoře pruh s upozorněním.' },
      owner: { help: 'Kdo udržuje dokument správný: tým nebo role.' },
      reviewed: date('Datum poslední revize, RRRR-MM-DD.'),
      'next-review': date('Kdy je na řadě další revize, RRRR-MM-DD; po jejím uplynutí kontrola upozorní.'),
    },
  },
  toc: {
    title: 'Obsah',
    summary: 'Obsah na místě, kde stojí: oddíly ## a části (depth=2, výchozí) nebo i pododdíly ### (depth=3). Nahradí automatický obsah; v prezentaci je to program.',
    attributes: {
      depth: { help: '2 vypíše oddíly ## a části, 3 přidá pododdíly ###.', values: { 2: 'Oddíly', 3: 'Oddíly a pododdíly' } },
    },
  },
  references: {
    title: 'Literatura',
    summary: 'Seznam citovaných zdrojů z úvodních údajů (references), v číselném ([1]) nebo autor–rok ((W3C, 2023)) stylu. Bez tohoto bloku se číselný seznam přidá na konec.',
    attributes: {
      style: {
        help: 'numeric: [1] v textu a číslovaný seznam (výchozí); author-date: (Autor, 2023) a seznam řazený podle autorů.',
        values: { numeric: 'Číselný', 'author-date': 'Autor–rok' },
      },
    },
  },
  release: {
    title: 'Poznámky k vydání',
    summary: 'Jedna verze s datem a změnami v typových skupinách. Každé vydání je nadpis 2. úrovně s kotvou (#v1-4-0), je v obsahu a má vlastní snímek. Skupiny jdou v pořadí Keep a Changelog. Upozornění k celému vydání (odstavec nebo zvýraznění, například ukončená platforma) může stát před skupinami; co přestává fungovat, patří do :::removed, co ještě funguje, ale skončí, do :::deprecated. Verze se píše tak, jak ji píše zdroj (3.2.0 nebo v3.2.0).',
    attributes: {
      date: date('Datum vydání, RRRR-MM-DD (povinné, pokud verze není Unreleased).'),
    },
    children: { added: { attributes: {} }, changed: { attributes: {} }, deprecated: { attributes: {} }, removed: { attributes: {} }, fixed: { attributes: {} }, security: { attributes: {} } },
  },
  section: {
    title: 'Oddělovač části',
    summary: 'Oddělovač části: linka a velký nadpis s volitelnou větou; break=page začne v tisku novou stránku. Ve snímcích je to celý snímek části.',
    attributes: {
      break: { help: 'page začne část v PDF na nové stránce.', values: { page: 'Nová stránka', none: 'Bez zalomení' } },
    },
  },
  code: {
    title: 'Kód',
    summary: 'Ohraničený blok kódu s volitelným názvem souboru a zvýrazněnými řádky; čtenáři dostanou tlačítko pro kopírování.',
    attributes: {
      title: { help: 'Název souboru nebo popisek nad kódem: title="install.sh".' },
      '{n,m-k}': { help: 'Řádky ke zvýraznění, například {2} nebo {1,3-5}.' },
    },
  },
  'code-group': {
    title: 'Skupina kódu',
    summary: 'Pojmenované bloky kódu jako karty: název každého bloku je jeho karta a volba čtenáře přepne všechny skupiny se stejnými názvy na stránce a zapamatuje se, dokud čtenář nezavře panel prohlížeče.',
  },
  callout: {
    title: 'Zvýraznění',
    summary: 'Zvýrazněné sdělení. Stav: info, success, warning, error. Rada: note, tip, important, caution. Upozornění ve stylu GitHubu (> [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]) se také stanou zvýrazněním.',
    attributes: {
      variant: {
        help: 'Význam sdělení.',
        // the tone words the reader sees and hears first (render's labels.ts), so the choice names what the box shows;
        // one Czech word per meaning across the callout, the badge and the toast (Úspěch, Varování)
        values: { info: 'Informace', success: 'Úspěch', warning: 'Varování', error: 'Chyba', note: 'Poznámka', tip: 'Tip', important: 'Důležité', caution: 'Pozor' },
      },
    },
  },
  steps: {
    title: 'Kroky',
    summary: 'Číslovaný návod, každý krok s tučným názvem a popisem. Text za tučným názvem je samostatný popis: napište ho celou větou, nebo ho vynechte. Chcete-li postup navázat v dalším :::steps (na dalším snímku), začněte seznam dalším číslem: 4.',
  },
  checklist: {
    title: 'Kontrolní seznam',
    summary: 'Úkoly hotové a otevřené.',
  },
  tabs: {
    title: 'Karty',
    summary: 'Varianty vedle sebe, například návod pro každý operační systém. Čtenář si jednu vybere; karty se stejným názvem se přepínají společně.',
    children: { tab: { attributes: { label: { help: 'Název karty v hranatých závorkách: :::tab[Windows].' } } } },
  },
  accordion: {
    title: 'Rozbalovací seznam / FAQ',
    summary: 'Otázky nebo témata, která se otevřou na požádání.',
    children: { item: { attributes: { label: { help: 'Otázka nebo téma: :::item[Otázka?].' } } } },
  },
  shortcuts: {
    title: 'Klávesové zkratky',
    summary: 'Tabulka kláves a toho, co dělají.',
    attributes: { caption: { help: 'K čemu zkratky slouží.' } },
  },
  glossary: {
    title: 'Slovníček',
    summary: 'Pojmy a jejich definice; na každý pojem lze odkázat (#pojem).',
  },
  diagram: {
    title: 'Diagram',
    summary: 'Diagram Mermaid zapsaný jako text v bloku ```mermaid, při sestavení dokumentu nakreslený jako SVG. accTitle (titulek) a accDescr (popis pro čtenáře, kteří ho nevidí) jsou povinné. Barvy a písma nastavuje LibKa, takže se řídí světlým, tmavým i vysoce kontrastním motivem.',
  },
  compare: {
    title: 'Dělejte a nedělejte',
    summary: 'Dobré a špatné příklady vedle sebe.',
    children: {
      do: { attributes: { label: { help: 'Co dělat.' } } },
      dont: { attributes: { label: { help: 'Čemu se vyhnout.' } } },
    },
  },
  quote: {
    title: 'Citát',
    summary: 'Citace, se zdrojem, pokud ho má. Funguje i obyčejná citace Markdownu > .',
    attributes: {
      source: { help: 'Kdo nebo co je citováno.' },
      cite: { help: 'Odkaz na zdroj.' },
    },
  },
  cards: {
    title: 'Dlaždice',
    summary: 'Mřížka souvisejících témat nebo odkazů, každé s názvem a krátkým textem.',
    children: {
      card: {
        attributes: {
          label: { help: 'Název dlaždice.' },
          href: { help: 'Kam dlaždice vede.' },
          badge: { help: 'Krátký štítek, například „Nové“.' },
        },
      },
    },
  },
  statement: {
    title: 'Hlavní sdělení',
    summary: 'Jedno klíčové sdělení velkým písmem. Určeno pro snímky; nejvýše 30 slov.',
  },
  metrics: {
    title: 'Klíčová čísla',
    summary: 'Dvě až čtyři čísla s tím, co znamenají.',
  },
  summary: {
    title: 'Shrnutí',
    summary: 'Hlavní body v rámečku, 3 až 5 bodů. source=ai s reviewed-by zobrazí štítek „S pomocí AI, zkontroloval(a) …“.',
    attributes: {
      source: { help: 'Kdo shrnutí napsal: human (výchozí) nebo ai.', values: { human: 'Člověk', ai: 'AI' } },
      'reviewed-by': { help: 'Jméno člověka, který shrnutí od AI zkontroloval, případně s rolí (povinné se source=ai).' },
    },
  },
  cta: {
    title: 'Výzva k akci',
    summary: 'Odkaz ve tvaru tlačítka, s volitelnou větou před ním. V tisku a ve snímcích se adresa vypíše.',
    attributes: {
      href: { help: 'Kam akce vede: adresa, soubor nebo #nadpis.' },
      variant: { help: 'primary pro hlavní akci (výchozí), secondary pro alternativu.', values: { primary: 'Hlavní', secondary: 'Vedlejší' } },
    },
  },
  figure: {
    title: 'Obrázek',
    summary: 'Obrázek s alternativním textem a popiskem, na samostatném řádku.',
  },
  gallery: {
    title: 'Galerie',
    summary: 'Několik obrázků s popisky v mřížce.',
  },
  video: {
    title: 'Video',
    summary: 'Video s titulky a přepisem. YouTube a Vimeo se načtou až tehdy, když o ně čtenář požádá.',
    attributes: {
      src: { help: 'Soubor videa (mp4, webm) nebo adresa na YouTube či Vimeo.' },
      captions: { help: 'Titulky WebVTT k souboru videa (u souborů povinné).' },
      poster: { help: 'Obrázek zobrazený před spuštěním videa.' },
    },
  },
  table: {
    title: 'Tabulka',
    summary: 'Tabulka Markdownu s titulkem.',
    attributes: { caption: { help: 'Co data ukazují.' } },
  },
  timeline: {
    title: 'Časová osa',
    summary: 'Data nebo období s tím, co se děje, v pořadí; každá položka začíná tučným datem. current= označí jednu položku slovem „Nyní“; položky před ní se čtou jako minulé, po ní jako plánované, takže štítky jako „(hotovo)“ vynechte.',
    attributes: { current: { help: 'Datum aktuální položky přesně tak, jak je napsané tučně: current="2026-Q2".' } },
  },
  comparison: {
    title: 'Srovnávací tabulka',
    summary: 'Tabulka možností proti vlastnostem s jedním zvýrazněným sloupcem. Buňky yes, no nebo partial (či ano, ne, částečně nebo ✓ ✗ ~) ukážou ikonu a slova „Obsahuje“, „Neobsahuje“ nebo „Částečně“; za závorkou, čárkou nebo dvojtečkou může následovat upřesnění (partial (50 měsíčně), yes, až 5). Jiný text, například cena, se zobrazí tak, jak je napsaný.',
    attributes: {
      highlight: { help: 'Záhlaví doporučeného sloupce přesně tak, jak je napsané: highlight=Standard. Sloupec dostane rámeček a viditelný štítek „Doporučeno“, takže „doporučeno“ sami nepište.' },
      badge: { help: 'Text štítku, když má být jiný než „Doporučeno“: badge="Nejoblíbenější" (vyžaduje highlight).' },
    },
  },
  chart: {
    title: 'Graf',
    summary: 'Sloupcový, spojnicový nebo prstencový graf nakreslený z tabulky Markdownu; tabulka zůstává dostupná jako přístupná verze.',
    attributes: {
      type: {
        help: 'Sloupcový pro srovnání, spojnicový pro vývoj, prstencový pro části celku (jedna řada, nejvýše 5 částí).',
        values: { bar: 'Sloupcový', line: 'Spojnicový', donut: 'Prstencový' },
      },
      caption: { help: 'Co graf ukazuje.' },
      unit: { help: 'Jednotka hodnot, například % nebo €.' },
    },
  },
  ui: {
    title: 'Ukázka rozhraní',
    summary: 'Skutečné komponenty LibKa tak, jak vypadají (světlé, tmavé nebo obojí), pro manuály, produktovou dokumentaci a specifikace. Jsou neaktivní: ilustrují, nic nedělají.',
    attributes: {
      caption: { help: 'Co ukázka předvádí.' },
      theme: { help: 'Zobrazit ve světlém motivu, v tmavém, nebo obojí vedle sebe.', values: { light: 'Světlý', dark: 'Tmavý', both: 'Oba' } },
      layout: { help: 'Komponenty v řadě (výchozí) nebo pod sebou.', values: { row: 'V řadě', stack: 'Pod sebou' } },
    },
    children: {
      button: {
        attributes: {
          label: { help: 'Text tlačítka, sloveso: ::button[Uložit koncept].' },
          variant: {
            help: 'Manuál 10.1.',
            values: { primary: 'Hlavní', accent: 'Akcent', iris: 'Iris', secondary: 'Vedlejší', destructive: 'Destruktivní', ghost: 'Průhledné' },
          },
          state: {
            help: 'Stavy podle manuálu 10.1.',
            values: { default: 'Výchozí', hover: 'Najetí myší', focus: 'Zaměření', disabled: 'Neaktivní', loading: 'Načítání' },
          },
        },
      },
      field: {
        attributes: {
          label: { help: 'Viditelný popisek: ::field[E-mail].' },
          type: {
            help: 'Druh vstupu.',
            values: {
              text: 'Text', email: 'E-mail', password: 'Heslo', number: 'Číslo', textarea: 'Víceřádkový text',
              select: 'Výběr', checkbox: 'Zaškrtávací pole', radio: 'Přepínač', switch: 'Vypínač',
            },
          },
          value: { help: 'Vyplněná hodnota (nebo vybraná možnost).' },
          placeholder: { help: 'Ukázkový text; nikdy místo popisku.' },
          hint: { help: 'Pomocný text pod polem.' },
          error: { help: 'Chybová zpráva: konkrétní a s cestou k nápravě.' },
          options: { help: 'Možnosti pro výběr a přepínače, oddělené znakem |.' },
          state: {
            help: 'Stavy podle manuálu 10.2.',
            values: { default: 'Výchozí', hover: 'Najetí myší', focus: 'Zaměření', disabled: 'Neaktivní', readonly: 'Jen ke čtení' },
          },
          required: { help: 'Označí pole jako povinné.' },
        },
      },
      badge: {
        attributes: {
          label: { help: 'Krátký stav: ::badge[Beta].' },
          variant: { help: 'Význam.', values: { neutral: 'Neutrální', ...status, ai: 'AI' } },
        },
      },
      toast: {
        attributes: {
          label: { help: 'Nadpis zprávy: ::toast[Koncept uložen].' },
          variant: { help: 'Význam.', values: status },
          text: { help: 'Jedna věta s podrobnostmi.' },
          action: { help: 'Jedna akce, například Zpět.' },
        },
      },
      modal: {
        attributes: {
          label: { help: 'Nadpis dialogu: ::modal[Smazat koncept?].' },
          text: { help: 'Co se stane, jednou nebo dvěma větami.' },
          primary: { help: 'Popisek hlavní akce.' },
          secondary: { help: 'Popisek cesty ven, například Zrušit.' },
          destructive: { help: 'Hlavní akce něco odstraní (červeně).' },
        },
      },
      empty: {
        attributes: {
          label: { help: 'Nadpis prázdného stavu: ::empty[Zatím žádné projekty].' },
          text: { help: 'Proč je prázdný a co udělat.' },
          action: { help: 'Jediná akce, která ho naplní.' },
        },
      },
    },
  },
  notes: {
    title: 'Poznámky řečníka',
    summary: 'Co přednášející říká. Zobrazí se jen v prezentaci (panel poznámek a pohled přednášejícího).',
  },
};

export const INLINES_CS: Readonly<Record<string, { title: string; summary: string }>> = {
  kbd: { title: 'Klávesa', summary: 'Klávesy a klávesové zkratky jako klávesy; + odděluje klávesy.' },
  badge: { title: 'Štítek', summary: 'Krátký štítek stavu v textu: neutral, info, success, warning, error nebo ai.' },
  footnote: {
    title: 'Poznámka pod čarou',
    summary: 'Poznámka nebo zdroj bez přerušení věty: `[^nazev]` v textu a `[^nazev]: poznámka` na samostatném řádku na nejvyšší úrovni (nejlépe na konci dokumentu). Poznámky se číslují podle prvního použití a shromáždí se pod Poznámkami na konci; prezentace dostane snímek s poznámkami. Každá poznámka musí být použita a každý odkaz definován.',
  },
  citation: {
    title: 'Citace',
    summary: 'Zdroj ze seznamu references v úvodních údajích: `[@id]`, se stránkou nebo oddílem za čárkou (`[@id, s. 33]`), více zdrojů oddělených středníkem (`[@a; @b]`). Zobrazí se jako [1] nebo (Autor, 2023) podle stylu bloku `:::references` a odkazuje do seznamu. Rozpozná se jen tehdy, když úvodní údaje mají references.',
  },
};

/**
 * Czech counterparts of each block's `useWhen` and `example`, for the Czech block showcase on the website. The syntax stays the registry's: directive, attribute and value names
 * are never translated, only the text. A test makes sure every block has both, that each example parses cleanly
 * and matches the block's schema, and that it is not the English text.
 */
export const EXAMPLES_CS: Readonly<Record<string, { useWhen: string; example: string }>> = {
  heading: {
    useWhen: 'Obsah má části, které čtenář hledá nebo mezi kterými přednášející přechází: jeden ## na téma, ### na podtéma (z každého vznikne snímek).',
    example: '## Instalace nástrojů\n\n### Ve Windows',
  },
  paragraph: {
    useWhen: 'Vysvětlení, souvislosti nebo argumenty ve větách. Výchozí volba; většinu obsahu tvoří odstavce.',
    example: 'Uložte stiskem :kbd[Ctrl+S]. Podrobnosti najdete v [poznámkách k vydání](https://example.org/notes).',
  },
  list: {
    useWhen: 'Tři a více souřadných položek bez pořadí (odrážky), nebo s pořadím (číslovaný seznam, pokud nejde o postup).',
    example: '- Tokeny\n- Bloky\n- Guard',
  },
  dl: {
    useWhen: 'Údaje, které se čtou jako dvojice pojem – hodnota: údaje dokumentu nebo faktury, specifikace, kontakty, údaje v životopise.',
    example: ':::dl[Údaje o projektu]\n- **Vlastník** Tým platformy\n- **Rozpočet** 1 000 000 Kč\n- **Termín** 31. března 2027\n:::',
  },
  'doc-status': {
    useWhen: 'Směrnice, postupy, specifikace a každá stránka, které musí čtenáři věřit: kdo ji vlastní, kdy prošla poslední revizí, kdy je na řadě další a zda ještě platí.',
    example: ':::doc-status{owner="Tým platformy" reviewed=2026-09-01 next-review=2027-03-01}\n:::',
  },
  toc: {
    useWhen: 'Dlouhé dokumenty, ve kterých čtenář přeskakuje na oddíly, nebo prezentace, která začíná programem. Manuál dostane obsah sám; :::toc určí, kde bude a jak podrobný.',
    example: ':::toc[Obsah]{depth=3}\n:::',
  },
  references: {
    useWhen: 'Zpráva, návrh nebo studie, která cituje zdroje pomocí `[@id]`; seznam umístíte, kam patří, a zvolíte jeho styl. Bez bloku se seznam přidá na konec.',
    example: 'Obrázky potřebují textovou alternativu [@wcag22].\n\n:::references[Zdroje]{style=author-date}\n:::',
  },
  release: {
    useWhen: 'Poznámky k vydání nebo přehled změn: co se v každé verzi změnilo, seskupené na přidáno, změněno, zastaralé, odstraněno, opraveno a bezpečnost (Keep a Changelog).',
    example: '::::release[v1.4.0]{date=2026-10-01}\n:::added\n- Srovnávací tabulky s doporučeným sloupcem.\n:::\n:::fixed\n- Dlouhé řádky kódu už v PDF nepřetékají.\n:::\n::::',
  },
  section: {
    useWhen: 'Dlouhý dokument nebo prezentace s částmi či kapitolami, z nichž každá sdružuje několik oddílů ## („Část 2: Výsledky“).',
    example: ':::section[Část 2: Výsledky]{break=page}\nCo jsme měřili a co se změnilo.\n:::',
  },
  code: {
    useWhen: 'Příkazy, obsah souborů, konfigurace nebo zdrojový kód, který čtenář píše nebo kopíruje.',
    example: '```bash title="sestaveni.sh" {2}\nnpm install --save-dev @libka/cli\nnpx @libka/cli build navod.md\n```',
  },
  'code-group': {
    useWhen: 'Tentýž příkaz nebo úryvek v několika variantách, ze kterých si čtenář vybere: npm, pnpm a yarn; Python a JavaScript; příkazová řádka ve Windows a v macOS.',
    example: ':::code-group\n```bash title="npm"\nnpm install @libka/cli\n```\n```bash title="pnpm"\npnpm add @libka/cli\n```\n:::',
  },
  callout: {
    useWhen: 'Jedno sdělení, které čtenář nesmí přehlédnout: předpoklad (info), riziko (warning), kritérium úspěchu nebo selhání; nebo rada: poznámka, tip, něco důležitého, varování před akcí.',
    example: ':::callout[Nejdřív zálohujte]{variant=warning}\nPřed aktualizací si data vyexportujte.\n:::\n\n> [!TIP]\n> Export funguje i z příkazové řádky.',
  },
  steps: {
    useWhen: 'Úkol, který čtenář provádí v daném pořadí: „Nainstalujte“, „Nastavte“, „Spusťte“. Každý krok začíná slovesem.',
    example: ':::steps\n1. **Otevřete nastavení** Zvolte *Data* a potom *Export*.\n2. **Spusťte instalační program** Ponechte výchozí složku.\n:::',
  },
  checklist: {
    useWhen: 'Co ověřit nebo odškrtnout, například „před zveřejněním“, nebo kritéria převzetí.',
    example: ':::checklist\n- [x] Záloha vyexportována\n- [ ] Instalační program stažen\n:::',
  },
  tabs: {
    useWhen: 'Tentýž úkol nebo obsah se liší podle platformy, jazyka, role nebo tarifu a každý čtenář potřebuje jen jednu variantu.',
    example: '::::tabs\n:::tab[Windows]\nSpusťte `setup.exe`.\n:::\n:::tab[macOS]\nOtevřete `Setup.dmg`.\n:::\n::::',
  },
  accordion: {
    useWhen: 'Otázky a odpovědi (FAQ) nebo volitelné podrobnosti, které většina čtenářů přeskočí.',
    example: '::::accordion\n:::item[Mohu stránku vytisknout?]\nAno, v tisku se zobrazí všechny odpovědi.\n:::\n:::item[Funguje to bez internetu?]\nAno, každý výstup je jeden místní soubor.\n:::\n::::',
  },
  shortcuts: {
    useWhen: 'Klávesové zkratky nebo kombinace kláves a co dělají.',
    example: ':::shortcuts{caption="Editor"}\n- :kbd[Ctrl+S] Uložit koncept\n- :kbd[Ctrl+Shift+P] Otevřít paletu příkazů\n:::',
  },
  glossary: {
    useWhen: 'Pojmy, které publikum nemusí znát, vysvětlené na jednom místě, kam se dá odkázat.',
    example: ':::glossary\n- **Token** Pojmenované rozhodnutí o vzhledu, například barva nebo krok odsazení.\n- **Guard** Kontroly, kterými projde každý výstup, než je podepsán.\n:::',
  },
  diagram: {
    useWhen: 'Proces, sled zpráv, stavy a přechody, model tříd nebo dat, které obrázek vysvětlí lépe než seznam: vývojové diagramy, sekvenční a stavové diagramy, diagramy tříd a ER diagramy.',
    example: '```mermaid\nflowchart LR\n  accTitle: Jak vzniká dokument LibKa\n  accDescr: Markdown se rozloží na bloky, Guard zkontroluje vykreslenou stránku a výstupy, které projdou, se podepíší.\n  A[Markdown] --> B[Bloky] --> C{Guard}\n  C -->|projde| D[Podepsané výstupy]\n  C -.->|neprojde| A\n```',
  },
  compare: {
    useWhen: 'Pokyny se správným a špatným postupem: styl psaní, popisky v rozhraní, pravidla návrhu.',
    example: '::::compare\n:::do[Pojmenujte akci]\n„Uložit koncept“\n:::\n:::dont[Nepoužívejte vágní popisky]\n„OK“ nebo „Klikněte sem“\n:::\n::::',
  },
  quote: {
    useWhen: 'Slova osoby nebo zdroje citovaná s uvedením původu: zákazník, norma, zákon.',
    example: ':::quote{source="Listina základních práv a svobod, článek 1"}\nLidé jsou svobodní a rovní v důstojnosti i v právech.\n:::',
  },
  cards: {
    useWhen: 'Odkazy na související stránky, produkty, možnosti nebo další kroky, každý s názvem a jednou větou.',
    example: '::::cards\n:::card[Kód]{href="#code"}\nNázvy souborů, zvýrazněné řádky a tlačítko pro kopírování.\n:::\n:::card[Grafy]{href="#chart" badge="Nové"}\nSloupcové, spojnicové a prstencové grafy nakreslené z tabulky.\n:::\n::::',
  },
  statement: {
    useWhen: 'Jediné nejdůležitější sdělení oddílu nebo snímku, v jedné větě.',
    example: ':::statement\nKaždá stránka se zkontroluje dřív, než se zveřejní.\n:::',
  },
  metrics: {
    useWhen: 'Dvě až čtyři hlavní čísla s tím, co znamenají: výsledky, cíle, ukazatele.',
    example: ':::metrics\n- **4** výstupy z jednoho souboru\n- **7:1** kontrast textu ve vysokém kontrastu\n- **0** požadavků na servery třetích stran\n:::',
  },
  summary: {
    useWhen: 'Tři až pět hlavních bodů, které zaneprázdněný čtenář potřebuje jako první: začátek zprávy, návrhu nebo dlouhé stránky. Když je napsala AI, označte je source=ai a uveďte, kdo je zkontroloval.',
    example: ':::summary[Hlavní body]{source=ai reviewed-by="Vedoucí dokumentace"}\n- Každá stránka projde kontrolami přístupnosti, než je podepsána.\n- Z jednoho souboru Markdown vznikne webová stránka, PDF i snímky.\n- Katalog bloků se generuje, takže se nikdy nerozejde s nástroji.\n:::',
  },
  cta: {
    useWhen: 'Jediný další krok na konci oddílu, stránky nebo prezentace: spustit výukový kurz, domluvit si ukázku, stáhnout šablonu.',
    example: ':::cta[Spustit výukový kurz]{href="https://example.org/tutorial"}\nZabere asi deset minut.\n:::',
  },
  figure: {
    useWhen: 'Diagram, snímek obrazovky, fotografie nebo ilustrace, která nese informaci.',
    example: '![Diagram: Markdown se rozloží, zkontroluje a vykreslí](images/pipeline.svg "Jak vzniká manuál")',
  },
  gallery: {
    useWhen: 'Několik souvisejících obrázků k porovnání nebo prohlížení, každý s vlastním popiskem.',
    example: ':::gallery\n![Diagram: Markdown se rozloží, zkontroluje a vykreslí](images/pipeline.svg "Jak vzniká manuál")\n\n![LibKa Studio se zdrojovým a vizuálním editorem vedle sebe](images/studio-split.png "LibKa Studio")\n:::',
  },
  video: {
    useWhen: 'Záznam, který něco ukáže lépe než text: průvodce, ukázka, přednáška.',
    example: ':::video[Big Buck Bunny, otevřený film nadace Blender Foundation]{src="https://www.youtube.com/watch?v=aqz-KE-bpKQ"}\nKrátký animovaný film bez dialogů: velký králík si užívá klidný den v lese, dokud ho nezačnou škádlit tři hlodavci.\n:::',
  },
  table: {
    useWhen: 'Data v řádcích a sloupcích, která čtenář vyhledává nebo porovnává: verze, ceny, specifikace.',
    example: ':::table{caption="Podporované verze"}\n| Verze | Podpora do |\n|---|---|\n| 2.1 | 2027 |\n:::',
  },
  timeline: {
    useWhen: 'Datované události nebo fáze v pořadí: plán, harmonogram projektu, historie, praxe v životopise. Současný stav označíte atributem current=.',
    example: ':::timeline[Stěhování kanceláře]{current="2026-Q2"}\n- **2026-Q1** Podepsaná nájemní smlouva na novou kancelář\n- **2026-Q2** Úpravy prostor a nábytek\n- **2026-Q3** Týmy se stěhují\n:::',
  },
  comparison: {
    useWhen: 'Možnosti, tarify nebo produkty porovnané vlastnost po vlastnosti, často s jednou doporučenou: cenové tarify, výběr nástroje, nabídky dodavatelů.',
    example: ':::comparison[Notebooky pro tým]{highlight=Standard}\n| Vlastnost | Základní | Standard | Pro |\n|---|---|---|---|\n| Paměť 16 GB | ano | ano | ano |\n| Druhý monitor | ne | ano | ano |\n| Oprava na místě | ne | částečně | ano |\n| Cena | 17 000 Kč | 27 000 Kč | 39 000 Kč |\n:::',
  },
  chart: {
    useWhen: 'Čísla, u kterých je důležitý celkový obraz: srovnání kategorií (sloupcový), vývoj v čase (spojnicový), části celku (prstencový).',
    example: ':::chart{type=bar caption="Zaměstnanci, kterým se příručka snadno používá" unit="%"}\n| Čtvrtletí | 2025 | 2026 |\n|---|---|---|\n| Q1 | 62 | 71 |\n| Q2 | 64 | 75 |\n| Q3 | 66 | 78 |\n:::',
  },
  ui: {
    useWhen: 'Dokumentace nebo specifikace rozhraní: které tlačítko, pole, zprávu nebo dialog čtenář uvidí.',
    example: ':::ui{caption="Uložení konceptu: jedna hlavní akce" theme=both}\n::button[Uložit koncept]{variant=primary}\n::button[Náhled]{variant=secondary}\n::button[Smazat]{variant=destructive state=disabled}\n:::',
  },
  notes: {
    useWhen: 'Co má přednášející říct a co nepatří na snímek.',
    example: ':::notes\nZmiňte, že kontroly běží při každém sestavení.\n:::',
  },
};
