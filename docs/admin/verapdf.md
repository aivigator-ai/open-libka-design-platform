# Java and veraPDF: the PDF/UA validator

**What it is.** veraPDF is the reference validator of the PDF Association. LibKa runs it on every PDF it builds and checks it against PDF/UA-1 (ISO 14289-1), the accessible-PDF standard that US Section 508 asks authoring tools to produce. veraPDF checks every rule a machine can check; the rest of PDF/UA (a meaningful reading order, good alternative texts) needs a person. The result appears in Guard's report and in the signed manifest. A PDF that fails is not signed. veraPDF is written in Java, so it needs a Java runtime.

**What happens without it.**
- `libka build --pdf` still builds and signs.
- It prints "PDF/UA not checked: veraPDF was not found"; the manifest records `pdfua: { "skipped": "veraPDF was not found" }`, the conformance report opens with a warning that the PDF was not validated, and `libka verify` prints "PDF/UA-1 not checked".
- CI and `check.py` require it, so a release is always checked.

**Versions in use:** Eclipse Temurin 21 (Java runtime, free, from the Eclipse Foundation) and veraPDF 1.30.2.

## Install on Windows (no administrator rights needed)

Everything goes into your user folder `%LOCALAPPDATA%\libka` (for example `C:\Users\<you>\AppData\Local\libka`), where LibKa looks by default.

1. **Java runtime.**
   - Download the Temurin 21 JRE as a zip: `https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse`.
   - Unpack it into `%LOCALAPPDATA%\libka`.
   - Rename the folder it creates (for example `jdk-21.0.12.1+1-jre`) to `jre21`.
   - Check it: `%LOCALAPPDATA%\libka\jre21\bin\java.exe -version` prints `openjdk version "21…" … Temurin`.
2. **veraPDF.**
   - Download `https://software.verapdf.org/releases/verapdf-installer.zip` and unpack it.
   - Create a file `verapdf-auto-install.xml` with the content below; it tells the installer where to install without asking.
   - Run the installer with the Java from step 1: `%LOCALAPPDATA%\libka\jre21\bin\java.exe -jar verapdf-izpack-installer-1.30.2.jar verapdf-auto-install.xml`. Use the jar name in the unpacked folder.
   - It ends with "Automated installation done".
3. **Check that LibKa finds both.** In Git Bash, from the repository folder:

   ```bash
   JAVACMD="$LOCALAPPDATA\\libka\\jre21\\bin\\java.exe" cmd //c "%LOCALAPPDATA%\\libka\\verapdf\\verapdf.bat --version"
   ```

   It prints `veraPDF 1.30.2`. Then build any example with `--pdf`: Guard's output ends with `✓ PDF/UA-1, veraPDF 1.30.2: 106 checked, 0 violation(s)`.

The installer's answers file (`verapdf-auto-install.xml`), with your own install path:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<AutomatedInstallation langpack="eng">
    <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
    <com.izforge.izpack.panels.target.TargetPanel id="install_dir">
        <installpath>C:/Users/YOUR-NAME/AppData/Local/libka/verapdf</installpath>
    </com.izforge.izpack.panels.target.TargetPanel>
    <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
        <pack index="0" name="veraPDF GUI" selected="true"/>
        <pack index="1" name="veraPDF Batch files" selected="true"/>
        <pack index="2" name="veraPDF Validation model" selected="false"/>
        <pack index="3" name="veraPDF Documentation" selected="false"/>
        <pack index="4" name="veraPDF Sample Plugins" selected="false"/>
    </com.izforge.izpack.panels.packs.PacksPanel>
    <com.izforge.izpack.panels.install.InstallPanel id="install"/>
    <com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>
```

**With administrator rights instead:**
- Java can also be installed system-wide with `winget install --id EclipseAdoptium.Temurin.21.JRE --exact`. Windows asks for confirmation in a prompt.
- Then point LibKa at it (see "Other locations").

## Other locations, and CI

LibKa looks for veraPDF in this order:
1. **`LIBKA_VERAPDF`:** the full path of the veraPDF launcher (`verapdf.bat` on Windows, `verapdf` on Linux and macOS).
2. **`LIBKA_JAVA`:** the full path of the `java` executable veraPDF should use. Needed when Java is not on the PATH.
3. **The defaults:** `%LOCALAPPDATA%\libka\verapdf\verapdf.bat` with `%LOCALAPPDATA%\libka\jre21\bin\java.exe` on Windows; `/opt/verapdf/verapdf`, or `verapdf` on the PATH, elsewhere.

`LIBKA_REQUIRE_VERAPDF=1` turns "not found" into a build error. CI and `check.py` set it.

**In CI (GitHub Actions):** the workflow installs Temurin 21 with `actions/setup-java`. It downloads the same veraPDF installer, installs it to `/opt/verapdf` with the same answers file, and sets `LIBKA_REQUIRE_VERAPDF=1`.

## Updating

1. Download the newer installer, as in step 2, and run it with the same answers file; it replaces the old version.
2. Run `.venv/Scripts/python.exe check.py` and build the examples with `--pdf`.
3. Move CI to it: in `.github/workflows/typescript.yml`, set `VERAPDF_URL` to the new versioned installer (from https://software.verapdf.org/releases/) and `VERAPDF_SHA256` to its checksum (`sha256sum` of the downloaded zip). CI refuses an installer whose checksum differs.
4. Note the new version in the CHANGELOG. It appears in every manifest as `pdfua.validator`.

A new Java 21 update installs the same way as step 1: replace the `jre21` folder.

## When a PDF fails PDF/UA-1

Guard lists each failed rule with its clause of ISO 14289-1, for example `ISO 14289-1 7.18.5 (test 2): Links shall contain an alternate description … (3×)`.

- **A new block or a change in Chrome** can produce a structure the repair step does not handle. Read the rule, find the element (veraPDF's own report has the exact location: run `verapdf.bat --flavour ua1 --format html file.pdf > report.html` and open it), and extend the repair in `packages/pdf/src/remediate.ts` with a test.
- **A rule Chrome cannot meet at all:** add it to `KNOWN_LIMITS` in `packages/pdf/src/verapdf.ts` with its reason. It is then reported, not failed, and it shows in every report. Agree this with a maintainer first.

Never mark a rule as a known limit just to get a build through.

## What LibKa repairs, and why

Chrome writes tagged PDFs but misses six things PDF/UA-1 requires. `@libka/pdf` adds them after printing and keeps Chrome's tags:

:::table{caption="The PDF/UA-1 rules Chrome misses and what LibKa adds for each"}

| Rule | What Chrome writes | What LibKa adds |
|---|---|---|
| 7.1 (test 8) | No XMP metadata | Metadata with the PDF/UA-1 identifier, title and language; the title is shown instead of the file name |
| 7.1 (test 5) | `Em` and `Strong` tags, unknown to PDF 1.7 | A role map to `Span` |
| 7.3 (test 1) | An HTML `<figure>` as a Figure without alternative text around the image's own Figure | The outer element becomes a `Div` |
| 7.2 (test 20) | List items holding a link or bold text directly | An `LBody` around everything after the label |
| 7.18.1, 7.18.5 | Links without a description | The link's text from the page, else its address |
| 7.1 (test 3) | Backgrounds, borders and icons drawn outside any tag | Marked as artifacts (decoration) |

:::

PDF/UA-2 (ISO 14289-2) is reported but does not gate the build: it needs PDF 2.0 features that Chrome does not write (namespaces, structure destinations).
