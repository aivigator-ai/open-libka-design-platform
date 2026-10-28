---
title: Vítejte v LibKa
subtitle: Váš první dokument, sestavený čtyřikrát
lang: cs
outputs: [web, pdf, deck, docx]
---

## Co je tento soubor

Toto je dokument LibKa napsaný v LibKa Markdownu, tedy v Markdownu s několika bloky LibKa. Jedno sestavení z něj udělá webovou stránku, PDF ve formátu A4, prezentaci 16:9 a upravitelný soubor Wordu a každý z nich před podpisem zkontroluje z hlediska přístupnosti.

:::callout[Změňte cokoli]{variant=tip}
Upravte tento text a znovu spusťte `npm run build`. Pokud něco chybí, třeba popis obrázku nebo titulek tabulky, sestavení se zastaví a uvede řádek.
:::

## Sestavení

:::steps
1. **Kontrola zdroje** Spusťte `npm run check`: soubor přečte za pár vteřin a vypíše každý problém s číslem řádku.
2. **Sestavení** Spusťte `npm run build`: výstupy se objeví ve složce `dist/` a každý je zkontrolovaný v Chromu.
3. **Ověření** Spusťte `npm run verify`: potvrdí, že soubory jsou přesně ty, které byly zkontrolovány a podepsány.
:::

## Co dostanete

:::dl[Výstupy jednoho sestavení]
- **Webová stránka** `dist/guide.html`, ke čtení na jakékoli obrazovce, ve vysokém kontrastu, když si ho čtenář nastaví
- **PDF** `dist/guide.pdf`, k tisku a odeslání, s tagy pro čtečky obrazovky
- **Prezentace** `dist/guide.deck.html`, k promítání, světlá nebo tmavá: každý nadpis `##` začíná oddíl
- **Soubor Wordu** `dist/guide.docx`, k dalším úpravám, se skutečnými nadpisy a seznamy
:::

:::notes
Toto jsou poznámky přednášejícího: ukazují se jen u prezentace, v panelu poznámek (N) a v pohledu přednášejícího (P).
:::

## Dál

Pod tento oddíl napište vlastní oddíly, každý s nadpisem `##`. Soubor README v této složce uvádí bloky a nástroje AI, které za vás LibKa napíšou.
