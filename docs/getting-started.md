---
title: Getting started with LibKa
subtitle: Install LibKa, start a project and build your first document into a web page, a PDF, slides and a Word file.
lang: en
---

LibKa turns one LibKa Markdown file into a web page, an A4 PDF, 16:9 slides and an editable Word file. Every output is checked for accessibility before it is signed: the pages in a real browser, the PDF against PDF/UA-1 (with Java and veraPDF installed, see below), the Word file's structure. This page takes you from nothing to your first checked document.

## What you need

:::table{caption="What a computer needs for LibKa, and what each part is for"}

| You need | For |
|---|---|
| Node.js 22.18 or newer | Running LibKa |
| Google Chrome | Building and checking documents: LibKa renders and checks every page in Chrome |
| Java 21 and veraPDF | Validating PDFs against PDF/UA-1. Optional: without them a PDF is still built, and its manifest, its conformance report and `verify` say it was not validated |

:::

`libka doctor` tells you what your computer has and links to the install page of anything missing. Installing Java and veraPDF needs no administrator rights: see [Java and veraPDF](admin/verapdf.md).

## Start a project

:::steps
1. **Create the project** Run `npm create libka@latest my-docs`. Add `-- --lang cs` for the document in Czech, and `--template report` (after the same `--`) to start from a template instead of the example: `report`, `talk`, `manual`, `policy` or `decision-record`. Both together: `npm create libka@latest my-docs -- --lang cs --template report`.
2. **Install it** Run `cd my-docs`, then `npm install`.
3. **Build** Run `npm run build`. The outputs the document's front matter names land in `dist/`, checked and signed: for the example, the web page, the PDF, the slides and the Word file.
4. **Verify** Run `npm run verify`. It confirms the files are the ones that were checked and signed.
:::

```bash title="Terminal"
npm create libka@latest my-docs
cd my-docs
npm install
npm run build
npm run verify
```

The starter also gives you `npm run check`, which checks the source in a couple of seconds without a browser, a GitHub Actions workflow that builds and checks every push and pull request with the LibKa Guard action, marking a problem in the source on its line and a finding in an output on its file, and a README of next steps.

:::callout[Your signing key]{variant=note}
The first build makes a signing key in the project's `.libka/` folder and trusts it in `.libka/trusted-keys.json`. The key stays on your computer: the starter's `.gitignore` keeps it out of git. [Signing keys](admin/signing-keys.md) explains what a signature proves and what it does not.
:::

## Write a document

A document is written in LibKa Markdown: Markdown with front matter and LibKa blocks. The file stays `.md` and opens in any text editor; only LibKa renders the blocks, other Markdown viewers show them as plain `:::` lines. Front matter names the document, its language and the outputs it wants:

```markdown title="router.md"
---
title: Setting up the router
lang: en
outputs: [web, pdf, deck, docx]
---

## Connect it

:::steps
1. **Plug in the power** The light turns orange.
2. **Connect the cable** Use the yellow port.
:::

:::callout[Before you start]{variant=important}
Keep the box: the Wi-Fi password is on its label.
:::
```

- Without an `outputs` line a document gets the web page and the PDF.
- Every `##` and `###` heading is also a slide; `:::notes` holds what a presenter says.
- Czech documents (`lang: cs`) get Czech labels and Czech typography.
- The [block catalog](blocks.md) lists every block with its syntax, its attributes and what each output does with it.

## Give it your look

A document's look is a theme and a brand, and every output takes both. The theme sets the type, the heading weight, the corners and the density: `theme: classic` (the default) or `theme: modern` in the front matter. The brand is a `_brand.yml` file at the project's root (the nearest folder above the document with `.libka/`, else the nearest with `package.json` or `.git`, as a project from `npm create libka` has), which every document in the project takes:

```yaml title="_brand.yml"
meta:
  name: Riverside Library
color:
  primary: "#0B5CAD"
typography:
  headings: Bitter
logo: brand/logo.svg
```

- The colours are where the brand starts: where a colour would fail a contrast check, in light, dark or high contrast, LibKa uses the nearest shade of the same hue that passes, and the build says so in words.
- The fonts come from the eight families LibKa ships; a font outside the list is reported with the ones you can use.
- The first build writes the solved design as a lock next to the brand file, to commit with it.
- [Brand file](../.claude/skills/libka-author/reference.md#brand-file) lists every key LibKa reads, and the [problem codes](problem-codes.md#brand-and-theme-files) what each finding in a brand or theme file means. In LibKa Studio the Design tab chooses the theme and the brand, and its brand editor writes `_brand.yml` for you.

## When a check fails

A build stops on any finding and leaves the unsigned files for you to inspect. Each problem in the source names its line, and many come with a fix LibKa can apply: the [problem codes](problem-codes.md) list them all. [When a check fails](admin/when-a-check-fails.md) explains what to do with a finding in the rendered page.

## Edit visually

LibKa Studio is an installable web app with a visual editor, a source editor, or both side by side, a live preview and the page and Word checks while you type. Your documents stay on your own device. Run it locally with `npx -y @libka/cli studio` and open the address it prints, or try it without installing anything in the hosted copy linked from the [README](../README.md).

## Write with AI tools

The LibKa skill and the MCP server let Claude and other AI tools write LibKa documents and repair them until every check passes. [AI tools](ai-tools.md) shows how to add them to Claude Code, Claude Desktop, claude.ai or any MCP client.
