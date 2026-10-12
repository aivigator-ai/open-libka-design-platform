# Word files: LibreOffice, Microsoft Word and the DOCX checks

**What it is.**
- A document can ask for an editable Word file: front matter `outputs: [web, pdf, docx]`, or `libka build file.md --docx`.
- LibKa writes it itself (`packages/docx`, with the `docx` library), so building one needs no office program.
- Guard checks every Word file's structure (headings, alternative text, table header rows, language, title, link text, contrast) and signs its hash in the manifest. A file that fails is not signed.

**Why two office programs are still involved.** A check of the file's XML cannot prove that the programs people use actually open it:
- **LibreOffice:** a test converts the Word file to PDF headlessly, on this machine and in CI.
- **Microsoft Word:** a script opens each file in Word and saves it as PDF. A maintainer runs Word's own accessibility checker on sample documents.

**What happens without them.**
- Building Word files works without either program.
- Without LibreOffice, its test is skipped with a message; CI requires it.
- Without Word, the Word script cannot run. The automated checks and LibreOffice still run.

**Versions in use:** LibreOffice 26.2.6 (the "still" line, the more conservative of the two current releases) and Microsoft Word from Microsoft 365 (Office 16).

## Install LibreOffice on Windows (no administrator rights needed)

As with veraPDF, everything goes into `%LOCALAPPDATA%\libka`, where LibKa looks by default.

1. **Download the installer and its checksum** (about 370 MB):
   - `https://download.documentfoundation.org/libreoffice/stable/26.2.6/win/x86_64/LibreOffice_26.2.6_Win_x86-64.msi`
   - the same address with `.sha256` at the end.

   Save both in `%LOCALAPPDATA%\libka\downloads`. Compare the checksums: in Git Bash, `sha256sum LibreOffice_26.2.6_Win_x86-64.msi` must print the value in the `.sha256` file.
2. **Unpack it without installing.** An "administrative install" only copies the program files. It needs no administrator prompt, registers nothing in Windows and does not touch an office suite you already have. In PowerShell:

   ```powershell
   $d = "$env:LOCALAPPDATA\libka"
   Start-Process msiexec.exe -Wait -ArgumentList '/a', "`"$d\downloads\LibreOffice_26.2.6_Win_x86-64.msi`"", '/qn', "TARGETDIR=`"$d\libreoffice`""
   ```

   It finishes silently in a minute or two.
3. **Check it:** `& "$env:LOCALAPPDATA\libka\libreoffice\program\soffice.exe" --version` prints `LibreOffice 26.2.6…`.
4. **Check that LibKa finds it.** From the repository folder, run `npx --yes pnpm@12.8.1 --filter @libka/docx test`. The test "LibreOffice opens the Word file" runs and passes; without LibreOffice it is skipped.

You can delete the downloaded installer afterwards.

**With administrator rights instead:** `winget install --id TheDocumentFoundation.LibreOffice --exact` installs it system-wide. Windows asks for confirmation in a prompt that can hide behind other windows. LibKa finds `C:\Program Files\LibreOffice\program\soffice.exe` by itself.

## Other locations, and CI

LibKa looks for LibreOffice in this order:
1. **`LIBKA_SOFFICE`:** the full path of `soffice` (`soffice.exe` on Windows).
2. **The defaults:**
   - Windows: `%LOCALAPPDATA%\libka\libreoffice\program\soffice.exe`, then `C:\Program Files\LibreOffice\program\soffice.exe`;
   - Linux: `/usr/bin/soffice`, `/usr/bin/libreoffice`, `/opt/libreoffice/program/soffice`;
   - macOS: `/Applications/LibreOffice.app/Contents/MacOS/soffice`;
   - finally `soffice` or `libreoffice` on the PATH.

`LIBKA_REQUIRE_LIBREOFFICE=1` turns "not found" into a failed test.

**In CI (GitHub Actions):** the TypeScript job installs LibreOffice Writer from Ubuntu's packages (`apt-get install libreoffice-writer`) and sets `LIBKA_REQUIRE_LIBREOFFICE=1`.

**Converting a file yourself:**

```bash
"$LOCALAPPDATA/libka/libreoffice/program/soffice.exe" --headless --convert-to pdf --outdir out file.docx
```

A message "Could not find platform independent libraries" comes from LibreOffice's bundled Python and is harmless. Close any open LibreOffice window first, or the command waits for it. LibKa's own tests use a private profile, so they do not have to.

## Microsoft Word: open every file, and the accessibility checker

**The script.** `packages/docx/scripts/word-check.ps1` opens Word invisibly through COM, opens each Word file read-only, and saves it as `<name>.word.pdf` next to it. Word never repairs a file on its own here, so a file Word cannot read fails with an error instead. In PowerShell, from the repository folder:

```powershell
powershell -ExecutionPolicy Bypass -File packages\docx\scripts\word-check.ps1 examples\manual\dist\guide.docx examples\open-source-guide\dist\guide.docx
```

It prints one line per file, such as `ok    …guide.docx (3 pages, 7 headings) -> guide.word.pdf`, and exits with 1 if any file failed. Close Word first. A Word that is still running with a dialog open can block the script.

**Word's accessibility checker (by hand).** Word's checker has no automation interface, so a person runs it:
1. Open the Word file in Word.
2. **Review > Check Accessibility.** The pane lists Errors, Warnings, Intelligent Services and Tips.
3. A release needs **no Errors**. Note any Warnings and Tips in the release notes or as an issue.
4. If Word opens the file in Protected View (files from the internet or another computer), choose **Enable Editing** first; the checker needs it.

What LibKa does for the checker's rules:

:::table{caption="Word's accessibility checker rules and what LibKa writes for each"}

| Word's rule | What LibKa writes |
|---|---|
| Missing alternative text | Every picture carries the figure's alt text, the chart's summary, the diagram's description or the specimen's description; every table its caption |
| Missing table header | The first row of every table is a header row that repeats on each page |
| Heading order and heading styles | Title, then Heading 1 to 3 from `##` to `####`, never a skipped level |
| Hard-to-read text contrast | Every color comes from the tokens; Guard measures every run against its shading |
| Document title and language | Set in the file's properties and on every run of text |
| Layout tables | Never: callouts, cards and other panels are shaded paragraphs, not tables |

:::

## When a Word check fails

- **Guard (`guard docx …` in the build output):** the rule names what is wrong (see `packages/guard/src/docx.ts`). A finding in a LibKa-made file is a bug in `packages/docx`: fix the renderer and add a test in `packages/docx/test`. Do not loosen the check.
- **LibreOffice test fails:** convert the file by hand (above) to see LibreOffice's message. Then open the file in LibreOffice Writer: a dialog about a damaged or "general input/output" file points at invalid XML. Unzip the file, and compare `word/document.xml` with a passing build to find the part that differs.
- **Word script fails, or Word asks to repair the file:** the file breaks a rule of the Office Open XML format. Word's repair dialog names the part, for example `/word/document.xml, Line 2, Column 3456`. Unzip the file, find that position and the element there. Fix the renderer, rebuild, and run the script again.
- **The accessibility checker reports an Error:** take a screenshot of the pane and of the place it points to. Then find the rule in the table above. If LibKa should have prevented it, it is a bug: fix the renderer, and add the rule to Guard's DOCX checks so the build catches it from then on.

## Updating

1. **LibreOffice:**
   - Download the newer MSI as above, delete the folder `%LOCALAPPDATA%\libka\libreoffice` and unpack the new one.
   - Run the docx tests and `check.py`.
   - Note the version in the CHANGELOG.
2. **Word** updates itself with Microsoft 365. After a major update, run the script on the examples once.
3. **The `docx` library** is pinned in `packages/docx/package.json`. After updating it:
   - run the tests: they check that every block still renders and that builds are byte-identical;
   - run the Word script and the LibreOffice test on the examples.
