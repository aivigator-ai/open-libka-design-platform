# LibKa: instructions for AI coding agents

LibKa is a design system (W3C DTCG tokens) and a document platform. One LibKa Markdown file (Markdown with LibKa blocks) becomes a web page, an A4 PDF, 16:9 slides and an editable Word file, each checked for accessibility (the front matter `outputs` chooses). Guard checks every output (in Chrome: axe-core WCAG 2.2 A/AA, text contrast 4.5:1 and 7:1 in high contrast, structure rules, reflow at 320 CSS pixels; veraPDF for the PDF; the Word file's structure), and outputs that pass are signed. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; it applies to agents too.

## Commands

```bash
npx --yes pnpm@12.8.1 install                       # once / after dependency changes
npx --yes pnpm@12.8.1 -r typecheck                  # strict TypeScript in every package
npx --yes pnpm@12.8.1 -r --no-bail test             # Vitest everywhere (Chrome tests run when Chrome is installed)
.venv/Scripts/python.exe check.py                   # full health check (.venv/bin/python on macOS and Linux) -> "HEALTHY"
node packages/cli/src/libka.ts lint file.md         # parse-only check (problems, outline, slide hints); --json
node packages/cli/src/libka.ts build file.md        # the outputs the front matter asks for (default web + PDF), Guard, signed
node packages/cli/src/libka.ts build file.md --outputs web,pdf,deck,docx
node packages/cli/src/libka.ts check page.html      # Guard on any HTML; verify page.html --pdf file.pdf --docx file.docx
node apps/studio/build.mjs                          # the Studio into apps/studio/dist/
node packages/cli/src/libka.ts studio               # serve it on http://localhost:5178/ (a service worker needs http)
node npm/build.mts                                  # the npm packages, the skill .zip and the Desktop extension into dist/npm/
node npm/smoke.mts                                  # the quick start from those packed files only
node scripts/set-version.mts <version>              # the product version (root package.json) and every copy of it
```

Regenerate after changing their sources (the tests fail when a generated file is stale):

```bash
.venv/Scripts/python.exe generate.py                # token outputs, lk-bridge.css, the Word theme
node packages/blocks/src/build-catalog.ts           # docs/blocks.md
node packages/blocks/src/build-skill.ts             # .claude/skills/libka-author/reference.md
node packages/guard/src/build-acr.ts                # docs/acr/libka-outputs.md
node packages/model/src/build-codes.ts              # docs/problem-codes.md
node packages/render/src/build-runtimes.ts          # packages/render/src/runtimes.ts
node apps/studio/audit/build-acr.ts                 # docs/acr/studio.md
node npm/build-plugin.mts                           # the Claude Code plugin (plugins/libka) and .claude-plugin/marketplace.json
```

## Map

- **`tokens/*.tokens.json` + `libka.resolver.json`:** the DTCG source of truth. `generate.py` validates it (with contrast gates for text, buttons and badges) and writes `libka-tokens.css`, `lk-bridge.css` (from `libka_bridge.py`), the SCSS, the Tailwind themes, parts of the manual and the verification page.
- **`packages/blocks`:** the block registry, the single definition of every block, its Czech text (`i18n.ts`), what to write for content without a block (`fallbacks.ts`), the catalog and skill-reference generators.
- **`packages/model`:** LibKa Markdown to typed blocks; problems by line, each with a code and, where safe, fixes; a sample document per code.
- **`packages/render`:** the web page (`index.ts`), the deck (`deck.ts`), slide fitting (`fit.ts`), the Content Security Policy (`csp.ts`), Czech typography, charts, UI specimens, the page runtime, and the block styles (`src/components.css`, tokens only).
- **`packages/guard`:** in-page rules (`scan.ts`), Chrome checks, the Word file checks, the WCAG 2.2 / EN 301 549 mapping and the signed manifest.
- **`packages/pdf`:** PDF/UA-1 repair of Chrome's PDFs and veraPDF validation.
- **`packages/docx`:** the Word file, byte-identical packaging, LibreOffice conversion.
- **`packages/editor`:** visual editing: the ProseMirror schema, the lossless LibKa Markdown round-trip, the block commands, fixes applied to text.
- **`packages/cli`**, **`packages/mcp`:** `libka build|lint|check|verify|studio|doctor`, and the MCP server; `packages/cli/src/assets.ts` finds the shipped files in the repository or the npm package, and a document's project (its `.libka/` signing key and trusted keys).
- **`packages/create-libka`:** the starter (`npm create libka`), with its templates.
- **`npm/`:** the npm build (`build.mts`: `@libka/cli`, `@libka/mcp`, `@libka/tokens`, `create-libka`, the skill `.zip`, the Claude Desktop extension), the quick-start test from the packed files (`smoke.mts`), the packages' READMEs and the extension's manifest; `build-plugin.mts` writes the Claude Code plugin (`plugins/libka`) and `.claude-plugin/marketplace.json`.
- **The version:** one for everything, in the root `package.json`; `scripts/set-version.mts` writes its copies.
- **`apps/studio`:** LibKa Studio, a local-first web app (Preact with signals, CodeMirror 6, ProseMirror); see `docs/admin/studio.md`.
- **`.claude/skills/libka-author/`:** the authoring skill (`SKILL.md` hand-written, `reference.md` generated).

## Rules

- **Never hand-edit generated files:** `libka-tokens*`, `lk-bridge.css`, `libka.tailwind.*`, `libka-verification.html`, `packages/docx/src/theme.ts`, `docs/blocks.md`, `docs/problem-codes.md`, `docs/acr/*.md`, `packages/render/src/runtimes.ts`, `.claude/skills/libka-author/reference.md`, `plugins/libka/**` (except its hand-written `README.md`), `.claude-plugin/marketplace.json`. Change the source, then regenerate.
- **Verify and report honestly:** run the tests and `check.py`; run Guard on any page you change; say plainly what failed and what was not verified.
- **Accessibility wording:** say "passes these automated checks", never "accessible" or "compliant".
- **English** for code, comments and docs; output and Studio text in English and Czech.
- **After `pnpm add`, check `package.json`:** a dependency can move between `dependencies` and `devDependencies`; a package with an install script needs a decision in `allowBuilds` (`pnpm-workspace.yaml`).
- **Studio:** no `eval` or `new Function` anywhere (it runs under a strict policy); a change to a page runtime needs `build-runtimes.ts`.
