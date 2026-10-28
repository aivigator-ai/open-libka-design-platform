---
name: libka-author
description: Turn any content (documents, notes, transcripts, web pages, spreadsheets, CSV or JSON data, outlines or ideas) into a LibKa document, the LibKa Markdown that LibKa builds into a web page, an A4 PDF, 16:9 slides and an editable Word file, each checked for accessibility. Use it when someone asks for a LibKa manual, guide, report, proposal, policy, release notes, case study or slide deck; asks to convert or restructure content "for LibKa"; or asks to write, check or repair LibKa Markdown.
---

# Writing LibKa documents

LibKa takes one LibKa Markdown file: Markdown with front matter and LibKa blocks. Only LibKa renders the blocks; other Markdown viewers show them as plain `:::` lines. It builds a web page, a PDF, slides and a Word file from it, and checks every output for accessibility (WCAG 2.2 AA, and 7:1 contrast in high-contrast mode). Your job is to turn the user's content into that LibKa Markdown so it passes the checks the first time and uses the block that fits each piece of content.

The exact syntax of every block is in [reference.md](reference.md). It is generated from the block registry, so it is always what the tools accept. Read the "Choose a block" table and the sections of the blocks you use. Never invent syntax. For content listed under "Content without a block", write what the table says.

## Workflow

1. **Understand the source and the goal.** What is the content: instructions, explanation, data, a decision, a pitch? Who reads it, and will it be presented? Keep every fact. Restructure, don't rewrite the meaning, and don't add claims the source does not make.
2. **Plan the structure.**
   - Write the front matter `title` (required); add `subtitle`, `version`, `date`, `status` and `lang` when known. For policies, procedures and anything with an owner or review cycle, also add `owner`, `reviewed` and `next-review` (dates as YYYY-MM-DD) when the source gives them; never invent them, and keep a review trigger that is not a date ("when the data passes 50 GB") in the text. `date` is the publication date; leave it out when the source gives none (never invent today's date) or when it would only repeat `reviewed`. `date` and `status` show under the title. Set `outputs` from what the user needs: add `deck` when the content will be presented and `docx` when people will edit it in Word or receive it as a Word file (`outputs: [web, pdf, deck, docx]`); leave it out for the web page and the PDF.
   - Drop the source's own heading numbers ("1.", "1.1"); the outline comes from the headings. Leave out notes addressed to the author ("this will be presented…"); act on them instead.
   - Use one `##` per topic and `###` per sub-topic. Every `##` and `###` becomes a slide that holds about 120 words, fewer with a figure, chart or UI specimen. Split long sections with `###`; don't trim the content. The build fits slides for you: a little overflow is shrunk (to 85% at most), more is continued on a "(continued)" slide, and long steps, lists, tables, description lists, accordions, cards and the contents agenda continue item by item; an accordion question that alone is taller than a slide is opened on the slides, so its answer continues paragraph by paragraph. What it cannot split must fit on its own slide: a do-and-don't pair, a long code block or code group, a chart or diagram with text around it. Give such a block its own `###` with at most one sentence. A `##` that holds only a lead sentence before its `###` slides is fine. When the source has parts that group several topics ("Part one"), open each with `:::section[...]`.
   - Content before the first `##` lands on the title slide; keep it to one or two sentences (a `:::notes` there holds the title slide's speaker notes). The exception is a `:::summary` of the key points: put it before the first `##`, and it gets a slide of its own. Headline numbers the reader should see first go in the first `##` section. A summary only repeats points the body covers; when the source's summary holds a fact the body lacks, add that fact to the body too, in the section it belongs to.
3. **Map content to blocks.** Use the "Choose a block" table in reference.md. Prefer the most specific fitting block over paragraphs, but don't force one: plain paragraphs and lists are right for plain prose. Common mappings:
   - instructions → `:::steps`;
   - prerequisites or risks → `:::callout`, choosing the variant by meaning: "Note:" → `note`, "Tip:" → `tip`, a risk of harm or loss ("Never…", "Warning") → `warning`, something to weigh before acting ("Caution:", a cost or penalty) → `caution`, a must-know that is not a risk (a rule change, a deadline, how the system behaves) → `important`; the meaning wins over the marker word: "IMPORTANT: misuse leads to dismissal" is a penalty, so `caution`, and "Note!! Never…" is a risk, so `warning`; put a callout next to the content it concerns, and one about the whole document in the first `##` section;
   - key points at the top → `:::summary`: a summary taken over from the source keeps the default `source=human`; one you or another AI wrote needs `source=ai reviewed-by="Name"`. When the user names no reviewer, never invent one and leave the `:::summary` out; if they asked for an AI-written summary, put its points at the start of the first `##` section after `:badge[AI draft]{variant=ai}` (in a Czech document `:badge[Koncept od AI]{variant=ai}`), and tell them that a reviewer's name turns it into a summary block;
   - a decision record (ADR) → `##` sections for the context, the options, the decision and its consequences; status and date in the front matter; the record's number stays in the title ("ADR 24: Store uploaded files"); options weighed on the same criteria → `:::comparison` with `highlight=` on the chosen one, otherwise a list;
   - key-value facts (contacts, addresses, specifications) → `:::dl`;
   - the one next step → `:::cta`;
   - asides that would break a sentence → footnotes (`[^name]`);
   - sources the content relies on → a `references` list in the front matter, cited as `[@id]` (keep every fact the source gives about a source: authors, year, title, publisher, address; never fill in what it does not give from your own knowledge: when it names no title, use its own words, such as "Wilson et al. (2017), scientific computing practices"); a formal report or study may place `:::references` and pick `style=author-date`;
   - a long document readers navigate, or a deck that needs an agenda → `:::toc` (manuals already get automatic contents);
   - dated events, phases or a roadmap → `:::timeline` (`current=` for where things stand);
   - options or plans compared feature by feature → `:::comparison` (yes / no / partial cells, `highlight=` for the recommended one, quoted when it has spaces (`highlight="Team plan"`), and `badge="Most popular"` when the source says something else; a feature the source lists only for a higher plan is "no" for the lower ones, and only a fact the source truly leaves open says "Not stated"; write drawbacks as words, such as "Vendor lock-in", because "yes" would show "Included");
   - a process, message sequence, state machine, class or data model a picture explains → a ```` ```mermaid ```` diagram (flowchart, sequenceDiagram, stateDiagram-v2, classDiagram or erDiagram) with `accTitle:` and `accDescr:` lines; describe in `accDescr` what a reader would see, step by step; never add colours (`style`, `classDef`) or init blocks; for a simple linear process use `:::steps` instead;
   - the same command in several tools or languages → `:::code-group` around code blocks, each with `title="npm"` and so on; it stands under its own heading, not inside `:::steps`;
   - release notes or a changelog → one `::::release` per version with `:::added`, `:::changed`, `:::deprecated`, `:::removed`, `:::fixed`, `:::security`; a release is a `##` level heading, so do not add your own heading above it;
   - per-platform or per-role variants → `::::tabs`;
   - FAQ → `::::accordion`;
   - tabular data → `:::table`;
   - numbers with a pattern → `:::chart`;
   - 2–4 headline numbers → `:::metrics` (with more, the four that matter most go in it and the rest in a sentence below);
   - the one key message → `:::statement`;
   - right and wrong ways → `::::compare`;
   - terms → `:::glossary`;
   - related links → `::::cards`;
   - interface descriptions → `:::ui` specimens;
   - presenter talk → `:::notes`.
4. **Write the LibKa Markdown.** Follow reference.md exactly, including its "Syntax details": one more colon per nesting level, single quotes around attribute values that contain double quotes, and heading ids for in-page links.
5. **Check and repair until clean.**
   - **With the LibKa MCP server** (tools `libka_check`, `libka_build`): call `libka_check` with the LibKa Markdown, fix every problem, repeat. Then call `libka_build` with `outputs: ["web", "deck"]` (the slides show what does not fit), fix any Guard finding, repeat; finish with one `libka_build` without `outputs`, which makes what the front matter asks for.
   - **Without it,** with the LibKa command: `npx libka` in a project that has `@libka/cli` (one made with `npm create libka`), `npx -y @libka/cli` anywhere else, or `node packages/cli/src/libka.ts` inside the LibKa repository. Run `libka lint <file.md>` until it reports no problems; act on its hints where they point to a natural break (a slide hint means the build would shrink or continue the slide, so split it yourself with `###` when the content has a better place to break). Then run `libka build <file.md> --outputs web,deck` while you repair (the slides show what does not fit), and finally `libka build <file.md>`, which makes what the front matter asks for; the files go to `dist/` next to the file, or to `--out <folder>`. If the build cannot start Chrome, `libka doctor` says what is missing.
   - **With neither** (a chat without tools): write the LibKa Markdown by reference.md alone, and say that it is unchecked: the user checks it with `libka lint` or in LibKa Studio.
   - Guard findings tell you what to change. A slide that does not fit holds a block the build cannot split: give that block its own `###`, and when it holds one table, comparison, chart, diagram or code group plus a sentence, fold the sentence into the caption or give it its own `###`. Moving text into `:::notes` removes it from the web page and the PDF as well, so do that only for presenter talk. A contrast or alt-text problem means fixing the content, never adding colors.
6. **Deliver.** Hand over the `.md` file. Say which outputs were built and checked, and whether anything could not be represented.

## Rules the tools enforce

- No raw HTML, no colors, no inline styles. Every visual decision comes from LibKa tokens.
- Only `##`, `###` and `####` headings, and no headings inside tabs, accordions, cards, do-and-don't pairs, quotes or notes.
- Images have alt text and a caption: `![what it shows](file.png "why it is here")`; the path is relative to the Markdown file. Tables are wrapped in `:::table{caption="..."}`.
- `:::callout` blocks have a title and a variant: info, success, warning, error, note, tip, important or caution. GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) are callouts too; their title is optional (text after the marker on the same line), and without one the tone word is shown.
- Steps start with a **bold title**; the text after it is a separate description, so write it as a full sentence ("**Request the vendor** Use the form in the portal."), never as the rest of the title's sentence, or leave it out when the source says nothing more (never invent one). Checklists are task lists.
- Summaries have 3 to 5 points; `source=ai` needs `reviewed-by` (the reviewer's name, optionally with the role). `:::doc-status` and `:::section` stand at the top level only; `reviewed` and `next-review` are real dates, the second after the first.
- Statements have at most 30 words; key figures have 2 to 4 items; donut charts at most 5 parts; charts at most 6 series.
- Videos have a title and a transcript; video files also need captions (WebVTT).
- Chart cells are plain numbers; the unit goes in `unit=`.
- `::::compare` needs at least one `:::do` and one `:::dont`; `::::tabs` needs two or more tabs; `:::gallery` needs two or more images.

## Writing well for LibKa

- Write for scanning: short paragraphs, specific headings, verbs in step titles and button labels.
- Link text says where it goes; never "click here".
- Use a callout only where missing it would hurt. More than two per `##` section and they stop standing out (lint hints).
- A `:::cta` label starts with a verb and names the result ("Request a new vendor"); one primary action per section.
- A chart needs a caption that states the point ("Pages passing on the first build"), not a generic name ("Chart 1").
- For slides: one idea per slide, and let speaker notes carry the talk.
- A list of links stays a list (cards are for up to about 6 pointers with a sentence each). A video you have no transcript for stays a link. A step may hold a nested list. A `:::dl` label is optional when the heading already names the list.
- When the content refers to an image you do not have (a screenshot, a photo), do not invent a figure: say what it would show in the text or in the speaker notes.
- Quote front matter values that contain `:`, `&`, `#`, `*`, `!`, `|`, `>`, `%`, `@` or start with a quote: `title: "Travel & expense policy"`.
- Credit sources. When content comes from someone else's text (openly licensed, CC0 or public domain), add a short final section ("Source and licence"; in Czech "Zdroj a licence") naming the source with its link, its authors (organisations as they are), the licence with a link to its text when it has one (public domain has none) and, in one or two sentences, what you changed (obvious typos you corrected count). The source page itself needs no `references` entry unless the text cites it. When the source itself cites works, keep those citations as `[@id]` with a `references` entry each, rather than as loose links; other links stay links.
- In `:kbd[...]` write a backslash key twice: `:kbd[Ctrl+\\]` shows Ctrl + \.

## From data

- **CSV, spreadsheet ranges or JSON arrays** become a `:::table` with a caption. Use the first column as row labels.
- **When the pattern matters,** add or replace with a `:::chart`:
  - categories: `type=bar`;
  - over time with 3 or more points: `type=line`;
  - parts of a whole with up to 5 parts: `type=donut`.
- **Headline results** become `:::metrics`.
- **Never truncate axes or drop rows silently.** Say in the text what you left out and why.
