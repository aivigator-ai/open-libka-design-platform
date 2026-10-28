# @libka/cli

LibKa turns one LibKa Markdown file (Markdown with LibKa blocks) into a web page, an A4 PDF, 16:9 slides and an editable Word file. Guard checks every output for accessibility (axe-core WCAG 2.2 A/AA in Chrome, text contrast 4.5:1 and 7:1 in high contrast, LibKa's structure rules, reflow at 320 CSS pixels, PDF/UA-1 with veraPDF when Java and veraPDF are installed, the Word file's structure), and the outputs that pass are signed.

## Start a project

```bash
npm create libka@latest my-docs
```

The starter has an example document, npm scripts, a CI workflow and a README of next steps.

## Or add it to a project

```bash
npm install --save-dev @libka/cli
npx libka doctor                 # what this computer has: Node.js 22.18+, Chrome; optional Java with veraPDF
npx libka build docs/guide.md    # the outputs the document asks for, checked by Guard and signed
```

## Commands

| Command | What it does |
|---|---|
| `libka build <file.md> [--out <dir>] [--outputs web,pdf,deck,docx]` | builds, checks with Guard and signs; stops with `file:line` on a problem |
| `libka lint <file.md> [--json]` | reads the source only, in a couple of seconds: problems, outline, slide hints |
| `libka check <page.html>` | Guard on any HTML page |
| `libka verify <page.html> [--pdf <file>] [--docx <file>] [--require-trusted]` | the signature, the files unchanged since signing, the checks passed, and whether the key is trusted; `--require-trusted` also fails when the signing key is not trusted (the project's `.libka/trusted-keys.json`, or LibKa's own list when the project has none), so a CI job can refuse an output signed by an unknown key |
| `libka studio [--port <n>] [--dir <folder>]` | LibKa Studio, the local-first editor, on `http://localhost:5178/` (or the port given); `--dir` serves a Studio built somewhere else |
| `libka doctor` | what is installed, what works without each missing piece, and where to get it |
| `libka --version` | the version ({{version}}) |

**Requirements:** Node.js 22.18 or newer and Google Chrome (Guard runs in it, and it prints the PDFs). Java 21 with veraPDF is optional: without it, PDFs are built and their manifest says they were not validated against PDF/UA-1.

**Signing:** each project (the nearest folder above the document with `.libka/`, else the nearest with `package.json` or `.git`) gets its own key in `.libka/signing-key.pem` at its first build, with a `.libka/.gitignore` that keeps it out of git; the first key is listed as trusted in `.libka/trusted-keys.json` (commit that file).

Documentation, the block catalog and the source: {{repository}}

Licence: Apache-2.0. LibKa is a product name of its publisher, which the licence does not grant (see NOTICE).
