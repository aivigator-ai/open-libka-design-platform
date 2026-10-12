---
title: Welcome to LibKa
subtitle: Your first document, built four ways
lang: en
outputs: [web, pdf, deck, docx]
---

## What this file is

This is a LibKa document: Markdown with a few blocks. One build turns it into a web page, an A4 PDF, 16:9 slides and an editable Word file, and checks each of them for accessibility before signing them.

:::callout[Change anything]{variant=tip}
Edit this text, then run `npm run build` again. If something is missing, such as a picture's description or a table's caption, the build stops and names the line.
:::

## Build it

:::steps
1. **Check the source** Run `npm run check`: it reads the file in a couple of seconds and lists any problem with its line number.
2. **Build** Run `npm run build`: the outputs appear in `dist/`, each one checked in Chrome.
3. **Verify** Run `npm run verify`: it confirms that the files are the ones that were checked and signed.
:::

## What you get

:::dl[The outputs of one build]
- **Web page** `dist/guide.html`, for reading on any screen, in high contrast when the reader asks for it
- **PDF** `dist/guide.pdf`, for printing and sending, tagged for screen readers
- **Slides** `dist/guide.deck.html`, for presenting, light or dark: every `##` starts a section
- **Word file** `dist/guide.docx`, for editing further, with real headings and lists
:::

:::notes
These are presenter notes: they show only with the slides, in the notes panel (N) and the presenter view (P).
:::

## Next

Write your own sections below, one `##` heading each. The README in this folder lists the blocks and the AI tools that can write LibKa for you.
