# The Studio: build, serve, install, test, and where documents live

**What it is.**
- LibKa Studio is the authors' app (`apps/studio`): a visual editor and a source editor, apart or side by side, a live preview (web, phone, A4, slides), Guard's checks while typing, a library of documents, version history, and downloads (Markdown, HTML, slides, Word, zip).
- It is an installable web app (a PWA): a static folder, `apps/studio/dist/`, with a service worker that keeps the whole app in the browser's cache, so it starts offline once it has been opened.
- It needs no server of its own and has no account. Documents, their images and their versions stay in the browser that is used (IndexedDB), or in a folder on disk that the author picks.

**Three ways to edit.** Visual: the document as it looks, blocks as objects with an Inspector. Source: the LibKa Markdown in CodeMirror. Split: both side by side, in step as the author writes (only the changed blocks or characters are replaced on the other side, outside its undo history, so each side keeps its own undo, scroll and place; the block being edited is marked on both sides). Split needs a window at least 1280 pixels wide; on a narrower one the document shows in Visual. The switch above the editor changes the mode of the open document at any time, keeping the place; new documents open in the mode chosen under File → Preferences. Switching never changes the text: blocks you did not edit stay byte for byte as written, and an edited block is written in LibKa's canonical style (`@libka/editor`).

**Quick fixes.** Every source problem has a code (the list: [`docs/problem-codes.md`](../problem-codes.md)) and, where it is safe, fixes: a misspelt block or setting renamed, an unknown setting removed, a task list put in a checklist, a table put in `:::table` for its caption, a heading level or list type changed, the outputs corrected. They are offered in the Problems tab, in the Inspector, on the problem marks at the right of blocks in Visual, and as actions on the problem's line in Source; each is one step the author can undo. A fix that needs the author's words (alt text, a caption, a title) never writes them: it takes the author to the empty field. Guard's findings are explained in plain words (why it matters, how to fix it, in English and Czech) with "Go to the text".

**The command palette.** Ctrl+K (Cmd+K on a Mac) or F1 searches commands (with their keys), blocks to insert, places in the document (headings and titled blocks), settings and the library's documents, in English and Czech, accents optional. Ctrl+K on text selected in either editor makes a link instead. The keys of the Studio's commands can be changed under File → Preferences → Keys of the Studio's commands (Backspace removes one, Default goes back; keys the editors or another command use are refused and named); they are kept per browser (`localStorage`, key `libka-studio:keys`).

**Czech throughout.** With CS chosen, block names, summaries and the help of every setting come from the registry's Czech text (`packages/blocks/src/i18n.ts`); value labels are shown next to the values the Markdown keeps (`warning` stays `warning`). The catalog, the AI skill and the MCP server stay English, and so do the source problems' messages (their codes and fixes are the same in both languages).

**Onboarding.** On the first visit a short tour points at the parts of the Studio (non-modal; Escape or "Skip the tour" ends it; Help → Take the tour shows it again). It ends by offering the tutorial (Help → Open the tutorial): a document in the interface language (`apps/studio/tutorial/`) with a Tutorial tab whose nine steps tick themselves as the author does them, ending when the document is ready to publish and has been exported. The tour's "seen" mark is `libka-studio:toured`; the tutorial's progress is `libka-studio:tutorial`, per document.

**Preferences** (File → Preferences, kept per browser): the block palette, block handles always or on hover, Markdown shortcuts, text on buttons or icons only, spacing, focus mode (Ctrl+Shift+F), typewriter scrolling, the mode of new documents (Visual, Split or Source), short or full screen-reader messages, and the keys of the Studio's commands. File → Keyboard shortcuts (also "?" on a selected block, or Shift+Alt+H) lists every key, with the author's own.

**Accessibility.** The Studio itself is audited against WCAG 2.2 A/AA: `apps/studio/audit/audit.ts` lists every criterion with its result and evidence, `node apps/studio/audit/build-acr.ts` writes the report `docs/acr/studio.md` (a test fails when it is stale or cites a test that does not exist), and Help → Accessibility shows a short statement with the same numbers and limits. Screen-reader tests with NVDA run on request: [screen-readers.md](screen-readers.md).

**Content Security Policy.** The Studio runs under its own strict policy: scripts only from its own files plus, by hash, the two inline runtimes its previews carry (a web page's and a deck's, in English and Czech); no `eval`, no inline handlers; inline styles allowed (the Studio places popovers with them, and Mermaid styles its diagrams; styles run no code). The build computes the policy (`dist/csp.txt`), writes it into `index.html`, and `libka studio` also sends it as a header with `frame-ancestors 'none'`. The previews are `srcdoc` frames, which take the Studio's policy over; the code the Studio runs inside them (Guard's scans, slide measuring) is `assets/frame-agent.js`, loaded as a file and called by name. The runtimes' text is generated (`node packages/render/src/build-runtimes.ts`, a test fails when stale), so the minified Studio writes exactly the scripts the policy names.

**Performance budget.** Tests fail (`apps/studio/test/performance.test.ts`) when the Studio is over a budget: first load (main.js and studio.css) 1.5 MB (the build fails too), ready to edit 2 s, a keystroke 50 ms (95th percentile) in the 27-page Open Source Guide, the checks back 5 s after typing stops, the guide's 90 slides laid out again 10 s after an edit. `LIBKA_PERF_SLACK` multiplies the time budgets on a slower machine; CI sets 2. The tests print the numbers either way.

**Why it is served over http.** A service worker (offline start, installing as an app) works only on an http address (localhost counts) or https, never on a file opened from disk. `libka studio` serves the folder on your machine; the hosted Studio serves the same folder.

## Build and run

1. **Build:** `node apps/studio/build.mjs`. It writes `apps/studio/dist/` and prints the Studio's version (a hash of everything built), the number of files and the size of the first load. The same sources always give the same files.
2. **Serve:** `node packages/cli/src/libka.ts studio`. It prints the address, `http://localhost:5178/`. Open it in Chrome, Edge, Firefox or Safari. `--port <n>` chooses another port; `--dir <folder>` serves another build. Ctrl+C stops it.
3. **Install as an app (optional):** in Chrome or Edge, the install icon in the address bar (or the menu, "Install LibKa Studio"). It then opens in its own window and from the Start menu. Uninstall it from the app's own menu.

After a rebuild, an open Studio shows "A new version of the Studio is ready" with a Reload button; the new version takes over when the author reloads. Nothing is lost: the text is saved as it is typed.

**A hosted copy.** `node apps/studio/build.mjs --hosted --publisher <file> --out <folder>` builds the copy for a web address of its own (its own origin, so no other site's script can reach the documents people keep in it). Its Help, About LibKa Studio names who provides it, with links to their site, imprint and privacy policy, read when it is built from the JSON file `--publisher <file>` names (its `public` block: `copyrightHolder`, `siteUrl`, `imprintUrl`, `privacyUrl`, and `githubOwner` for the link to the source; the file stays with the publisher, never in a repository); the build says which of them is missing. It also writes `_headers` for the host: the Studio's Content Security Policy with `frame-ancestors 'none'`, no referrer, `nosniff`, HSTS, a Permissions-Policy, and `Cache-Control` with `no-transform` (so a host cannot add a statistics script to the pages). A host may answer `/index.html` with a redirect to `/` (Cloudflare does); the service worker serves such an answer as a plain one, because a browser refuses a redirected answer to a page load. Every build, hosted or not, has the About dialog (the version, the licence, the third-party notices, the source when the build knows it, what happens to your documents) and no analytics.

## Where documents live

:::table{caption="Where the Studio keeps documents and settings, and for how long"}

| What | Where | How long |
|---|---|---|
| Documents (one LibKa Markdown text each), their images, their versions, the folders they are linked to | IndexedDB of that browser, database `libka-studio`, for the address the Studio was opened on | until the author deletes them, or the browser's site data for that address is cleared |
| Interface choices: language, theme, contrast, the last open document, editor preferences, the keys of commands, the tour seen, the tutorial's progress | `localStorage`, keys starting `libka-studio:` | the same |
| A copy on disk | a folder the author picked (Chrome and Edge), or a downloaded `.zip` | the author's own files |

:::

- **The address matters.** `http://localhost:5178/` and `http://127.0.0.1:5178/` are two different sites to the browser, with separate documents. Always use the address `libka studio` prints.
- **The Studio asks the browser to keep its storage** (persistent storage), so the browser does not clear it when the disk runs low. Clearing site data by hand still deletes it.
- **Private windows** may give no storage at all. The Studio then says so in the library and works in memory only; the work is lost when the window closes unless it is downloaded as a zip.
- **Versions:** after a pause in typing (at most every 5 minutes), before anything replaces the text (opening, a restore, reloading from a folder), and whenever the author saves a named version. The last 50 automatic ones are kept per document; named ones always.
- **A folder** has exactly the layout `libka build` reads: the Markdown file and the images it uses at the paths it names. "Open folder" on a folder already linked to a document reloads that document from disk (the text before stays in the history). Folders work in Chrome and Edge only; other browsers use the zip.

### Clearing the Studio's data on one machine

In Chrome or Edge: open the Studio, then the padlock or site icon in the address bar → Site settings → Delete data (or DevTools → Application → Storage → Clear site data). Firefox: Settings → Privacy → Manage Data. This deletes every document kept there; download what you need first.

## Tests

- `npx --yes pnpm@12.8.1 --filter @libka/studio test` builds the Studio once (the global setup in `vitest.config.ts`), then runs:
  - unit tests of storage, versions, zip, folders, the comparison, the outputs and the command registry (`test/storage.test.ts`, `test/core.test.ts`; IndexedDB is faked in Node);
  - Chrome tests of the app served on localhost (`test/studio.test.ts`): Guard on the Studio's own views, the same Guard counts as the CLI, persistence across reloads, images, undo, versions and the comparison, zip, folders, starting offline, the move of the old draft;
  - Chrome tests of visual mode (`test/visual.test.ts`): the Markdown kept byte for byte, keyboard-only editing (select, climb, move, extend, duplicate, delete, undo, announcements), the "/" menu, the Inspector, inline keys and badges, the handle menu and the palette (click and drag), the structure tree, the preferences, the shortcut list, restoring a version, and Guard on every view in standard and high contrast;
  - Chrome tests of Split, fixes and the palette (`test/split.test.ts`): Split in step both ways with separate undo, Split on wide screens only, every text fix kind from the Problems tab with its undo, CodeMirror's fix actions, problem marks and fields to fill in Visual, Guard findings explained, the command palette and its sources, links on selected text in both editors, changing the keys of commands, Czech, and Guard on the new views;
  - Chrome tests of onboarding (`test/onboarding.test.ts`): the tour by keyboard (first visit, skipped, again from Help), the tutorial done end to end until it is exported, both languages;
  - Node tests of the palette's places, the keys of commands, the Guard explanations (every rule, both languages) and Split's minimal change (`test/switchable.test.ts`);
  - Chrome tests of quality (`test/quality.test.ts`): the Studio under its own policy through a whole workflow, forced colours, text-field contrast, reflow at 320 px, text spacing, the focus never hidden, names and visible labels, the window title and the document's language, About LibKa Studio, the accessibility statement, and touch on a tablet and a phone;
  - the performance budget (`test/performance.test.ts`) and the accessibility audit's consistency (`test/audit.test.ts`);
  - screen-reader tests with NVDA (`test/screen-reader.test.ts`), on request only: [screen-readers.md](screen-readers.md);
  - smoke tests in Firefox and WebKit, Safari's engine (`test/browsers.test.ts`): the tour skipped, editing in both modes.
- The tests set the cursor with `window.libkaStudio.placeCaret(text)`, a hook for automation (`window.libkaStudio.sides` gives the text on each side of a Split); the keys under test are pressed for real. The older tests in `test/studio.test.ts` drive the source editor and set "new documents open in Source" before the page loads. Every test except the onboarding ones marks the tour as seen first (`libka-studio:toured`), since the tour takes the focus on a first visit.
- **Firefox and WebKit for the tests** are Playwright's own builds, not browsers you browse with: `npx playwright-core install firefox webkit`, run in `apps/studio` (about 200 MB, into `%LOCALAPPDATA%\ms-playwright`, no administrator rights). Without them the smoke tests are skipped with a message; CI installs them and sets `LIBKA_REQUIRE_BROWSERS=1`, so a missing browser fails there. Update them after a `playwright-core` update with the same command.
- **Folders in the tests:** Chrome's tests stand a folder in the origin private file system in for one the author picks. Chrome crashes when it reads such a handle back from IndexedDB (an ordinary picked folder is fine), so the test wraps it in a plain object.

## When something fails

:::table{caption="Studio problems: symptoms, likely causes and what to do"}

| Symptom | Likely cause | What to do |
|---|---|---|
| `libka studio` says there is no Studio | not built | `node apps/studio/build.mjs` |
| `port 5178 is in use` | another `libka studio`, or another program | stop the other one, or `--port 5179` (note: a new port is a new site with its own documents) |
| The Studio shows an old version | the service worker serves its cache until the author reloads | use the Reload button in the notice, or reload twice |
| "Not kept: this browser gives no storage" | private window, or storage blocked for the site | use a normal window; download the work as a zip |
| "Saving to … failed" or "did not allow writing" | the browser's permission for the folder expired or was refused | Save to folder again and allow; or download a zip |
| The Studio's own Guard test reports `no-inline-style` | a style attribute outside the editor | the Studio writes no style attributes; CodeMirror's geometry inside `.cm-editor` is the only exemption |
| Firefox or WebKit tests skipped | Playwright's browsers not installed | `npx playwright-core install firefox webkit` in `apps/studio` |
| A test types into the wrong place right after closing a dialog | the dialog's close event came after the next step | wait until the dialog is gone (`waitForSelector('dialog', { state: 'detached' })`) before the next key |
| A Split button is missing | the window is narrower than 1280 pixels | widen the window; the document shows in Visual meanwhile |
| A command's key does nothing | the author changed or removed it | File → Preferences → Keys of the Studio's commands → Default |
| A preview stays blank, or the checks never finish, and the console says "Refused to execute" | a page runtime changed but its text was not regenerated, so the policy does not name its hash | `node packages/render/src/build-runtimes.ts`, then rebuild the Studio |
| "the frame agent did not load" in the console | `assets/frame-agent.js` is missing (an old or partial build) | `node apps/studio/build.mjs` |
| A performance test fails on a slow machine | the budgets are set for a developer machine | close other programs, or set `LIBKA_PERF_SLACK=2`; on a fast machine, look at what got slower |
| The build stops: "the first load is … over the budget" | new code in the first load | load it when it is needed, with a dynamic `import()` |

:::
