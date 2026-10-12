# Screen readers: NVDA for the Studio's tests

**What it is.** NVDA is the free, open-source screen reader for Windows (NV Access). The Studio's screen-reader tests (`apps/studio/test/screen-reader.test.ts`) run the Studio in Chrome with NVDA listening, and check what NVDA says at each step (the tour, the editor, moving a block, the "/" menu, the side panel's tabs, the command palette, a dialog), in English and in Czech. They are driven by Guidepup (`@guidepup/guidepup`, MIT), which talks to NVDA through NVDA Remote on this machine only (127.0.0.1).

**What happens without it.** The tests are skipped: they run only when asked for, on Windows, because NVDA takes over the keyboard and Chrome opens a window while they run. Everything else (the other Studio tests, CI) is unaffected. The accessibility report (`docs/acr/studio.md`) names these tests as evidence for 1.1.1, 1.3.1, 4.1.2 and 4.1.3, so run them before every Studio release.

**Versions in use:** Guidepup 0.35.0 with its portable NVDA build `0.2.1-2026.2` (NVDA 2026.2 with the Remote add-on preconfigured).

## Set it up (no administrator rights needed)

From `apps/studio`:

```bash
node scripts/screen-reader-setup.mjs
```

- It downloads Guidepup's portable NVDA into `%LOCALAPPDATA%\guidepup\nvda\all\<version>\extracted` (about 120 MB). Nothing is installed, nothing goes into the registry, and Windows' own settings are not changed.
- It sets NVDA's voice to **silent** (`[speech] synth = silence` in that copy's `userConfig\nvda.ini`), so a test run captures what NVDA would say without speaking aloud. To hear it while it runs, run the script with `--voice`; run it again without to go back to silent.
- After updating `@guidepup/guidepup`, run it again: a new Guidepup may need a newer NVDA build.

## Run the tests

On Windows, with nobody using the machine (NVDA reads the keyboard and the focused window for a few minutes):

```bash
cd apps/studio
LIBKA_SCREEN_READER=1 npx vitest run test/screen-reader.test.ts
```

- A Chrome window opens maximised and must stay in front; do not click elsewhere while it runs.
- NVDA starts and stops by itself (`nvda.start()`, `nvda.stop()`). NVDA's quit takes a few seconds and was once seen still running minutes after a run, so the tests also wait for Guidepup's copy to end and ask it to quit again (`nvda.exe -q`). If a run is interrupted, quit it the same way: `%LOCALAPPDATA%\guidepup\nvda\all\<version>\extracted\nvda.exe -q` (or Task Manager).
- In the editor the tests switch NVDA's focus mode on by hand (NVDA+Space), as the Studio's accessibility statement tells NVDA users. In the focus mode NVDA switches on by itself, Escape is NVDA's key back to browse mode and never reaches the editor, where it selects a block. The tests recognise NVDA's reply by its English words ("focus mode"); with NVDA in another language they toggle twice, which ends in focus mode from where NVDA starts in the editor.
- Guidepup presses keys through Windows Script Host's `SendKeys`, which toggles Num Lock with every press. A keyboard or mouse utility that shows Num Lock on screen can take the focus for a moment, and NVDA then speaks that window. The tests check names by asking NVDA for the focus (NVDA+Tab) and ask again, with Chrome brought back to the front, when another window had it. Turning the utility's Num Lock notice off avoids the detour.
- The tests assert the Studio's own words (names, labels, announcements). NVDA's own words, such as "dialog" or "button", follow NVDA's language, which follows Windows; they are not asserted.

## Your own session (about 15 minutes, before each Studio release)

The automated flows prove the names and announcements; only a person can tell whether working this way makes sense. Use NVDA with its voice: run `node scripts/screen-reader-setup.mjs --voice` and start `nvda.exe` from Guidepup's folder (above), or use an installed NVDA. Start the Studio (`node packages/cli/src/libka.ts studio`), open http://localhost:5178/ in Chrome, and go through the steps without looking at the screen where you can.

:::table{caption="The steps of the screen-reader session and what you should hear at each"}

| # | Do | You should hear |
|---|---|---|
| 1 | Open the Studio in a fresh browser profile (or clear its site data) | the tour's heading, "Welcome to LibKa Studio" |
| 2 | Escape | "Skip to the editor", then the editor: "Document (visual editor), edit, multi line" |
| 3 | NVDA+Space once (focus mode set by hand) | "focus mode" |
| 4 | Arrow down a few lines, then Escape | whatever NVDA says of the selected block (not checked by the automated flows): note whether you can tell which block is selected |
| 5 | Ctrl+Shift+Arrow Up | "… moved to position N of M"; Ctrl+Z undoes it |
| 6 | Arrow to the end of a paragraph, Enter, then "/" | "Insert a block, dialog", "Search blocks, combo box" |
| 7 | Type "call", Arrow Down, Enter | the options as you move; "Callout inserted" |
| 8 | F1, type "pref", Enter | "Command palette", the results count, then "Preferences, dialog" |
| 9 | Escape; Tab on to the side panel's tabs; Left and Right arrows along them | "Checks, outline and history, tab list", then each tab by name, such as "Inspector, tab" or "Problems, tab", with its count when it has one |
| 10 | The same in Czech: the language switch at the top, then steps 2 to 9 | the Studio's words in Czech (NVDA's own words stay in NVDA's language) |

:::

Note what was unclear, too long or missing, in your words; that is the finding. Run the setup again without `--voice` before the next automated run.

## When something fails

:::table{caption="Screen-reader test failures: symptoms, likely causes and what to do"}

| Symptom | Likely cause | What to do |
|---|---|---|
| Tests skipped | `LIBKA_SCREEN_READER` not set, or not Windows | set it, on Windows |
| "NVDA is not installed" | the setup was not run, or Guidepup was updated | `node scripts/screen-reader-setup.mjs` |
| Nothing was heard | the Chrome window was not in front, or NVDA Remote could not connect | keep the window in front; check that nothing else uses port 6837 |
| NVDA speaks aloud | the voice was set with `--voice` | run the setup again without it |
| A flow fails on a name | the Studio's text changed (`src/i18n.ts`) or an element lost its name | compare with the expected text in the test; axe on the same view usually names the element |
| What was heard names another window ("… agent, window") | a utility's on-screen display took the focus after a Num Lock toggle | turn its Num Lock notice off and run again |
| "UI specimen selected" or similar instead of a move | NVDA was in browse mode: Escape went to NVDA, and Ctrl+Shift+arrows selected text | the focus-mode step failed; check NVDA's keyboard settings (NVDA key: Insert) |
| `nvda.exe` still running after a run | the run was interrupted | `nvda.exe -q` from Guidepup's folder (above) |

:::
