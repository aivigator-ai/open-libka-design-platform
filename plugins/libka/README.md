# LibKa for Claude Code

Write documents with Claude that pass automated accessibility checks. This plugin adds two things: the **libka-author** skill, which teaches Claude to write LibKa documents in LibKa Markdown (Markdown with LibKa blocks), and the **LibKa MCP server**, which checks a document and builds it into a web page, an A4 PDF, 16:9 slides and an editable Word file. Every output is checked (axe-core with the WCAG 2.2 A and AA rules; the contrast of every visible text against its real background, 4.5:1, and 7:1 when more contrast is requested; structure rules; reflow at 320 CSS pixels; PDF/UA-1 by veraPDF when Java and veraPDF are installed; the Word file's structure), and the outputs that pass are signed.

## Install

```
/plugin marketplace add aivigator-ai/open-libka-design-platform
/plugin install libka@libka
```

It needs Node.js 22.18 or newer. Building needs Google Chrome (or a Chrome or Chromium program named in `LIBKA_BROWSER`); listing blocks and checking documents do not. Java with veraPDF is optional: without it, PDFs are still built, and their manifest says they were not validated against PDF/UA.

## What the MCP server offers

- `libka_list_blocks` and `libka_get_block`: the blocks a document can use, with their syntax and an example.
- `libka_check`: the problems in a LibKa document, each on its line, with fixes where they are safe.
- `libka_build`: the outputs the document asks for, each checked and, when it passes, signed.
- The resources `libka://guide`, `libka://reference` and `libka://schema/document` (how to write LibKa, the block reference, the document model), and the prompt `convert-to-libka`.

## What the plugin runs, fetches, reads and writes

- **Runs:** `launch.mjs` starts `npx -y @libka/mcp@2.0.2`, the MCP server at exactly this plugin's version. On Windows it goes through the command shell, because `npx` is a `.cmd` file there; the command is fixed.
- **Fetches:** the first start downloads that version of [`@libka/mcp`](https://www.npmjs.com/package/@libka/mcp) and its dependencies from the npm registry into npm's cache; later starts use the cache. Nothing else is fetched: a page's Content Security Policy blocks anything a document links by web address, and Guard reports it as a finding.
- **Starts on this computer:** Chrome without a window, to render and check each output; veraPDF (with Java), when it is installed, to validate PDFs.
- **Reads:** the documents Claude asks it to check or build and the images they reference; the project's signing key and trusted keys in `.libka/` (or `LIBKA_SIGNING_KEY`); the settings `LIBKA_OUT`, `LIBKA_BROWSER`, `LIBKA_VERAPDF`, `LIBKA_JAVA` and `LIBKA_REQUIRE_VERAPDF` when they are set.
- **Writes:** the outputs (web page, PDF, slides, Word file, manifest, conformance report, fonts and images), and the document when Claude gives its text, into the folder Claude names, else `LIBKA_OUT`, else `libka-out` in the server's working folder; a document Claude names by its path is only read. Besides these, only two places: the first build that signs creates the project's signing key, its list of trusted keys and a `.gitignore` that keeps the key out of git, in the project's `.libka/` folder (the key never leaves the computer); and temporary files, in the system's temporary folder, deleted afterwards.
- **Sends:** nothing. No account, no telemetry, no request of its own to any server.

## Licence and source

Apache License 2.0. The source, the documentation and the issue tracker: https://github.com/aivigator-ai/open-libka-design-platform. Security reports: https://github.com/aivigator-ai/open-libka-design-platform/security/policy.
