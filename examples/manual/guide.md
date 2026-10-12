---
title: Writing a LibKa manual
subtitle: From one Markdown file to a web page, a PDF, slides and a Word file that pass the LibKa checks
version: "0.1"
date: "2026-10-03"
status: Draft
lang: en
outputs: [web, pdf, deck, docx]
---

## Before you start

You write a manual as one Markdown file. LibKa turns it into a self-contained web page and, if you ask for them, an A4 PDF, a slide deck and an editable Word file. Colors, type and spacing come from the LibKa tokens, so you never set them yourself.

:::callout[You need Node.js 22.18 or newer]{variant=info}
Install the workspace once with `npx --yes pnpm@12.8.1 install` in the repository folder. The PDF uses the Chrome already installed on your computer.
:::

## Write your first manual

:::steps
1. **Create the file** Start with a few lines of front matter: `title`, and optionally `subtitle`, `version`, `date` and `status`.
2. **Write sections** Use `##` for sections and `###` for subsections. The title comes from the front matter, so there is no `#` heading.
3. **Add blocks** Callouts, steps, tables, checklists and figures use the short block syntax shown below.
4. **Build** Run `node packages/cli/src/libka.ts build path/to/manual.md`. The front matter line `outputs: [web, pdf, deck, docx]` chooses what it makes; without it you get the web page and the PDF.
:::

:::notes
Show the four steps on screen; the build command is the only thing people need to remember.
:::

### How a manual is built

![Diagram: the Markdown source is linted, built into a web page, a PDF, slides and a Word file; Guard checks each output, and the outputs that pass get a signed manifest and a conformance report](images/pipeline.svg "How a manual is built: lint, build, check, sign")

## Blocks you can use

:::table{caption="Block syntax at a glance"}

| Block | Write it like this | Required |
|---|---|---|
| Callout | `:::callout[Title]{variant=warning}` | a title; variant is info, success, warning, error, note, tip, important or caution |
| Steps | `:::steps` around a numbered list | each step starts with a **bold title** |
| Table | `:::table{caption="..."}` around a Markdown table | a caption |
| Checklist | `:::checklist` around `- [x]` items | task-list items only |
| Figure | `![what it shows](image.png "caption")` on its own line | alt text and a caption |
| Notes | `:::notes` around what the presenter says | shown only in the deck |

:::

### When something is missing

:::callout[The build stops on mistakes]{variant=warning}
A missing caption, alt text or callout title stops the build with the file name and line number. Nothing is written until the manual is fixed, so a published manual never has these gaps.
:::

## Present it as slides

Add `deck` to the outputs and the same file becomes 16:9 slides: the title slide comes from the front matter, every `##` starts a section slide and every `###` a slide of its own.

:::callout[Keys in the deck]{variant=info}
Arrows or Space move between slides. N shows your notes, P opens the presenter view with the next slide and a timer, O shows all slides, F goes full screen, D switches to the dark theme and C to high contrast. The Letter shortcuts button turns the letter keys off, for example for speech input.
:::

:::notes
Open the deck next to this manual and press P to show how the presenter view follows along.
:::

## Before you publish

The build checks the rendered pages as a reader sees them: an automated accessibility scan, the contrast of every text in normal and in high-contrast mode, the structure rules above, and that the page fits a screen 320 CSS pixels wide without scrolling sideways; in a deck, also that every slide fits. When everything passes, it signs a record of the checks into the page, so anyone can later confirm the page is unchanged with `libka verify`.

:::checklist
- [x] Every figure has alt text and a caption
- [x] Every table has a caption
- [ ] The PDF has been opened and read once
:::

```bash
node packages/cli/src/libka.ts build examples/manual/guide.md
```
