# {{name}}

Dokumenty LibKa: každý soubor Markdown ve složce `docs/` se sestaví do webové stránky, PDF ve formátu A4, prezentace 16:9 a upravitelného souboru Wordu, zkontrolovaných z hlediska přístupnosti a podepsaných.

## První kroky

1. `npm install`: nainstaluje LibKa ({{version}}) do této složky.
2. `npm run doctor`: ukáže, co tento počítač má. LibKa potřebuje **Node.js 22.18 nebo novější** a **Google Chrome** (kontroly běží v Chromu, který také tiskne PDF). Java s veraPDF je volitelná: s ní se každé PDF ověří i podle PDF/UA-1; bez ní se PDF sestaví a označí jako neověřené.
3. `npm run build`: sestaví `docs/guide.md` do složky `dist/`. Otevřete `dist/guide.html` v prohlížeči a `dist/guide.deck.html` pro prezentaci.
4. `npm run verify`: ověří, že soubory v `dist/` (webová stránka s jejím PDF a souborem Wordu a prezentace s jejím PDF) jsou ty, které byly zkontrolovány a podepsány.

`npm run check` čte jen zdroj, za pár vteřin, a vypíše problémy s čísly řádků: spouštějte ho při psaní.

## Podpis

První sestavení vytvoří pro tento projekt podpisový klíč `.libka/signing-key.pem` a zapíše ho jako důvěryhodný do `.libka/trusted-keys.json`.

- **Commitněte** `.libka/trusted-keys.json`: říká, kterým klíčům tento projekt věří.
- **Nikdy necommitujte** `.libka/signing-key.pem`: `.libka/.gitignore` ho vynechává. Kdo ho má, může podepisovat za tento projekt.
- Klíč vytvořený jinde (na jiném počítači nebo v CI) není důvěryhodný, dokud jeho otisk nepřidáte do seznamu; do té doby `npm run verify` hlásí „NOT in .libka/trusted-keys.json“. V CI je to v pořádku.

## Psaní

- Bloky (upozornění, kroky, tabulky, časové osy, grafy, diagramy a další) jsou v katalogu: {{docs}}/blocks.md
- Jiný soubor sestavíte příkazem `npx libka build docs/jiny.md --out dist`, nebo ho přidejte do skriptů v `package.json`.
- Řádek `outputs` v úvodní části (front matter) určuje, co sestavení vytvoří: `web`, `pdf`, `deck`, `docx`.

## S nástroji AI

Dovednost (skill) LibKa a server MCP LibKa umožní Claudovi a dalším nástrojům AI psát, kontrolovat a sestavovat dokumenty LibKa za vás: {{docs}}/ai-tools.md

## CI

`.github/workflows/libka.yml` sestaví a zkontroluje dokument při každém push na GitHub a výstupy uchová jako artefakt na 14 dní. Po `npm install` commitněte `package-lock.json`, aby CI instalovalo stejné verze.
