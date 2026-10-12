# {{name}}

LibKa documents: each Markdown file in `docs/` builds into a web page, an A4 PDF, 16:9 slides and an editable Word file, checked for accessibility and signed.

## First steps

1. `npm install`: installs LibKa ({{version}}) into this folder.
2. `npm run doctor`: shows what this computer has. LibKa needs **Node.js 22.18 or newer** and **Google Chrome** (its checks run in Chrome, which also prints the PDFs). Java with veraPDF is optional: with it, every PDF is also validated against PDF/UA-1; without it, the PDF is built and marked as not validated.
3. `npm run build`: builds `docs/guide.md` into `dist/`. Open `dist/guide.html` in a browser, and `dist/guide.deck.html` for the slides.
4. `npm run verify`: checks that the files in `dist/` (the web page with its PDF and Word file, and the slides with their PDF) are the ones that were checked and signed.

`npm run check` reads the source only, in a couple of seconds, and lists problems with their line numbers: run it while you write.

## Signing

The first build makes a signing key for this project in `.libka/signing-key.pem` and lists it as trusted in `.libka/trusted-keys.json`.

- **Commit** `.libka/trusted-keys.json`: it says which keys this project trusts.
- **Never commit** `.libka/signing-key.pem`: `.libka/.gitignore` keeps it out. Anyone with it can sign as this project.
- A key made elsewhere (another computer, or CI) is not trusted until you add its fingerprint to the list; `npm run verify` says "NOT in .libka/trusted-keys.json" until then. That is expected in CI.

## Writing

- The blocks (callouts, steps, tables, timelines, charts, diagrams and more) are listed in the catalog: {{docs}}/blocks.md
- To build another file, run `npx libka build docs/other.md --out dist`, or add it to the scripts in `package.json`.
- The front matter's `outputs` line chooses what a build makes: `web`, `pdf`, `deck`, `docx`.

## With AI tools

The LibKa skill and the LibKa MCP server let Claude and other AI tools write, check and build LibKa documents for you: {{docs}}/ai-tools.md

## CI

`.github/workflows/libka.yml` builds and checks the document on every push to GitHub and keeps the outputs as an artifact for 14 days. Commit `package-lock.json` after `npm install`, so CI installs the same versions.
