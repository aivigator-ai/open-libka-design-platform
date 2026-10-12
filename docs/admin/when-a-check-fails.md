# When a check fails

Each check prints what failed and where. This page says what each kind of failure means and the usual fix. Never silence a check to get a build through. Fix the cause, or agree an exception with a maintainer and write it down.

:::table{caption="Failure messages, what they mean and the usual fix"}

| Message starts with | It means | Usual fix |
|---|---|---|
| `file.md:12: …` (lint problem) | The Markdown breaks a LibKa rule at that line | Follow the message; the block syntax is in `.claude/skills/libka-author/reference.md` |
| `guard axe: …` | axe-core found a WCAG problem on the rendered page | Change the content (alternative text, link text, heading order). If the block itself renders wrongly, fix its renderer and add a test |
| `guard contrast: …` | A text is below 4.5:1 (or 7:1 when more contrast is requested) | Never add colours to a document. If a block's colours fail, fix the tokens or the component CSS; the token gates in `generate.py` should then catch it |
| `guard (deck) structure: slide N … does not fit` | A slide overflows and the build could not continue it | Give the block its own `###`, or shorten it; see the skill's slide section |
| `guard structure: csp-blocked` | The page's Content Security Policy blocked something the page needs | A renderer added a script, style or resource the policy does not allow; fix the renderer (`packages/render/src/csp.ts`) |
| `guard structure: reflow …` (or `guard (deck) structure: reflow …`) | Loaded 320 CSS pixels wide, the page scrolls sideways (WCAG 1.4.10); the message names the element that sticks out and its first words | In your text, give a long word a place to break: a long address as a link with words, a long command in a code block. A LibKa block that sticks out is a styling fault: fix its CSS (`packages/render/src/components.css`) and add a test |
| `guard pdfua: ISO 14289-1 …` | The PDF fails a PDF/UA-1 rule | See [verapdf.md](verapdf.md), "When a PDF fails PDF/UA-1" |
| `PDF/UA not checked: veraPDF was not found` | veraPDF or Java is missing | Install them: [verapdf.md](verapdf.md) |
| `guard docx docx-…: …` | The Word file breaks a structure rule (heading order, alternative text, table header, language, title, link text, contrast) | A LibKa-made file should never fail: fix `packages/docx` and add a test. See [word-and-libreoffice.md](word-and-libreoffice.md) |
| `… made from the web page and signed with it: add web` | The outputs ask for the PDF or the Word file without the web page | Add `web` to `outputs` in the front matter (or to `--outputs`) |
| LibreOffice test or the Word script fails | LibreOffice or Word cannot read a Word file | See [word-and-libreoffice.md](word-and-libreoffice.md), "When a Word check fails" |
| `check.py`: `stale` or `changed files` | A generated file is out of date, or not committed | Run the generator it names (or `check.py` locally), then commit the regenerated file with the change that caused it |
| `check.py`: browser self-check failed (only where `check.extra.json` names a self-check page) | The token self-check page found a contrast problem in a theme | Read the artifact `check-artifacts/` (CI uploads it) and fix the token |
| A test fails | A behaviour changed | Read the test name and the assertion. Fix the code, or, when the change is intended, update the test in the same commit and say why |
| `libka verify`: `does NOT verify` | The file changed after signing, or the manifest was edited | Rebuild the document; never edit a signed file by hand |

:::

## Where to look

- The full Guard report is printed by the build. The manifest (`<name>.manifest.json`) records every check.
- The accessibility report of a build is `<name>.conformance.md`, next to the outputs.
- CI runs are on GitHub under Actions. `gh run watch <id>` follows one from the terminal.
