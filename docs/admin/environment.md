# The working environment

Everything a machine needs to build, check and release LibKa, and how to check each piece. The commands are for Windows with Git Bash, which comes with Git for Windows, run from the repository folder; [Linux and macOS](#on-linux-and-macos) follow below.

**What you need for what:**
- **To build documents:** Node.js 22.18 or newer and Google Chrome. That is all `libka build` needs for web pages, slides and Word files.
- **To validate PDFs against PDF/UA-1:** Java 21 and veraPDF. Without them a PDF is still built and signed, and its manifest, its conformance report and `libka verify` say that PDF/UA-1 was not checked. `check.py` requires them.
- **To work on LibKa itself:** Python 3.12 or newer (the token build and `check.py`), Java 21 and veraPDF (`check.py` requires them), and optionally LibreOffice (the test that Word files open elsewhere is skipped without it locally; CI requires it) and Playwright's Firefox and WebKit.

:::table{caption="The tools a machine needs, the versions in use and how to check each"}

| Tool | Why | Version in use | Check |
|---|---|---|---|
| Git and Git Bash | History, commits, the shell all commands assume | any recent | `git --version` |
| Node.js | Runs the TypeScript packages directly (type stripping) | 22.18 or newer | `node --version` |
| pnpm | Installs the workspace packages | 12.8.1, started through npx | `npx --yes pnpm@12.8.1 --version` |
| Google Chrome | Renders pages, runs Guard, prints PDFs | the installed stable version | `"/c/Program Files/Google/Chrome/Application/chrome.exe" --version` |
| Python | `check.py` and the token generators | 3.12 or newer, in `.venv` | `.venv/Scripts/python.exe --version` |
| Java (Eclipse Temurin 21) | Runs veraPDF | 21 | see [verapdf.md](verapdf.md) |
| veraPDF | Validates every PDF against PDF/UA-1 | 1.30.2 | see [verapdf.md](verapdf.md) |
| LibreOffice | Proves that Word files open in a second office suite (a test converts them) | 26.2.6 | see [word-and-libreoffice.md](word-and-libreoffice.md) |
| Microsoft Word (optional) | Opens every Word file through a script; its accessibility checker is run by hand | Microsoft 365 | see [word-and-libreoffice.md](word-and-libreoffice.md) |
| Playwright's Firefox and WebKit | The Studio's smoke tests in other browsers (skipped without them) | the builds that match `playwright-core` | see [studio.md](studio.md) |
| GitHub CLI (`gh`) | Watches CI runs, releases | any recent | `gh auth status` |

:::

## First setup on a new machine

1. Install Git for Windows, Node.js 22.18 or newer (LTS), Google Chrome and Python 3.12 or newer from their official sites.
2. Clone the repository and open Git Bash in its folder.
3. Create the Python environment: `python -m venv .venv`. It needs no packages.
4. Install the workspace: `npx --yes pnpm@12.8.1 install`.
5. Install Java and veraPDF: [verapdf.md](verapdf.md). Install LibreOffice: [word-and-libreoffice.md](word-and-libreoffice.md).
6. The signing key, which is never committed: copy `.libka/signing-key.pem` from your backup, or let the first build make a new one ([signing-keys.md](signing-keys.md)).
7. Run the health check: `.venv/Scripts/python.exe check.py`. It must end with `HEALTHY: everything passed.`

## On Linux and macOS

**Linux** is what CI runs on (Ubuntu 24.04, `.github/workflows/typescript.yml` has every step):

1. Node.js 22.18 or newer, Google Chrome installed in its standard place (Guard finds it there), or its path in `LIBKA_BROWSER`, Python 3.12 or newer and Git from your distribution or their official sites.
2. `python3 -m venv .venv`, then `npx --yes pnpm@12.8.1 install`.
3. Java 21 (Eclipse Temurin) and veraPDF: the veraPDF installer runs headless with an answer file, exactly as in the CI workflow; point `LIBKA_VERAPDF` at its `verapdf` launcher ([verapdf.md](verapdf.md)).
4. LibreOffice Writer: `sudo apt-get install libreoffice-writer` on Debian and Ubuntu ([word-and-libreoffice.md](word-and-libreoffice.md)).
5. `.venv/bin/python check.py` must end with `HEALTHY`.

**macOS** is not tested. The same tools exist for it (Chrome and LibreOffice are found in their standard places in `/Applications`); please report what works and what does not.

## Everyday commands

:::table{caption="Everyday tasks and the command for each"}

| Task | Command |
|---|---|
| Strict type checks | `npx --yes pnpm@12.8.1 -r typecheck` |
| All tests | `npx --yes pnpm@12.8.1 -r --no-bail test` |
| The full health check | `.venv/Scripts/python.exe check.py` |
| Check a document without building | `node packages/cli/src/libka.ts lint file.md` |
| Build what the document asks for (front matter `outputs`; default web page and PDF), checked and signed | `node packages/cli/src/libka.ts build file.md` |
| Build all four outputs for one run: web page, PDF, slides, Word file | `node packages/cli/src/libka.ts build file.md --outputs web,pdf,deck,docx` |
| Verify a signed output | `node packages/cli/src/libka.ts verify page.html --pdf page.pdf` |
| Rebuild the Studio | `node apps/studio/build.mjs` |
| Run the Studio on your machine | `node packages/cli/src/libka.ts studio`, then open http://localhost:5178/ ([studio.md](studio.md)) |

:::

## Environment variables

:::table{caption="Environment variables and what each does"}

| Variable | What it does |
|---|---|
| `LIBKA_BROWSER` | The Chrome executable, when it is not in the usual place |
| `LIBKA_VERAPDF`, `LIBKA_JAVA` | Where veraPDF and its Java are ([verapdf.md](verapdf.md)) |
| `LIBKA_REQUIRE_VERAPDF=1` | A build fails when veraPDF is missing; `check.py` and CI set it |
| `LIBKA_SOFFICE` | Where LibreOffice's `soffice` is ([word-and-libreoffice.md](word-and-libreoffice.md)) |
| `LIBKA_REQUIRE_LIBREOFFICE=1` | The LibreOffice test fails instead of being skipped when LibreOffice is missing; CI sets it |
| `LIBKA_REQUIRE_BROWSERS=1` | The Studio's Firefox and WebKit tests fail instead of being skipped when Playwright's browsers are missing; CI sets it |
| `SOURCE_DATE_EPOCH` | A fixed date (seconds since 1970) written into PDFs and Word files; without it they carry no date, so builds are byte-identical |
| `LIBKA_SIGNING_KEY` | The signing key as PEM text, instead of the project's `.libka/signing-key.pem` ([signing-keys.md](signing-keys.md)) |
| `LIBKA_OUT` | The MCP server's output folder for `libka_build` (default `./libka-out`); the Claude Desktop extension sets it from its settings |
| `LIBKA_SMOKE_KEEP=1` | `npm/smoke.mts` keeps its temporary projects for a look afterwards |

:::

## CI on GitHub

CI is these workflow files in `.github/workflows/`:

:::table{caption="The CI workflow files, when they run and what they do"}

| File | Runs | What it does |
|---|---|---|
| `check.yml` | every push to `main`, every tag, every pull request | `check.py` on Ubuntu and Windows, and the TypeScript job |
| `typescript.yml` | when another workflow calls it | the TypeScript job: install, Java and veraPDF, LibreOffice, Firefox and WebKit, type check, every test |
| `ubuntu-next.yml` | Mondays at 05:00 UTC, or by hand (`gh workflow run ubuntu-next.yml`) | the TypeScript job on `ubuntu-latest` |
| `packages.yml` | every push to `main`, every tag, every pull request | builds the npm packages once (`npm/build.mts`), then the quick start from the packed files alone on fresh Ubuntu and Windows runners (`npm/smoke.mts`) |
| `dco.yml` | every pull request (not in the maintainers' development repository, where no outside pull requests arrive) | every commit carries a `Signed-off-by` line (the Developer Certificate of Origin, see CONTRIBUTING) |
| `publish.yml` | a `v*` release tag, after a maintainer approves the `npm` environment; by hand (`gh workflow run publish.yml`) it is a dry run unless `-f dry_run=false -f tag=vX` is given | builds the packages from the tag and runs the quick start, publishes them to npm with provenance (trusted publishing, no stored token), lists the MCP server in the MCP Registry, and makes a draft GitHub Release with the Desktop extension, the skill `.zip` and checksums; the dry run publishes nothing |

:::

**Actions are pinned to commits:** every `uses:` names a full commit SHA with its release as a comment (`actions/checkout@3d3c42e… # v7.0.1`), because a tag can be moved to other code and a commit cannot; `tests/test_repository.py` fails on a loose one. To update an action, find the commit of its new release (`gh api repos/<owner>/<action>/commits/<tag> -q .sha`) and change both the SHA and the comment.

**Why Ubuntu is pinned:** `check.yml` runs on `ubuntu-24.04`, not `ubuntu-latest`. GitHub moves `ubuntu-latest` to a new image from time to time, and a new image can lack a package the job installs. The pin keeps a release day safe; `ubuntu-next.yml` shows in advance whether the next image works.

**Moving the pin:** when `ubuntu-next.yml` passes (`gh run list --workflow ubuntu-next.yml`), change `ubuntu-24.04` in `check.yml` (the `os` list and the `runs-on` given to `typescript.yml`) to the new version, push, and check that CI is green. When it fails, read the failing step (`gh run view <id> --log-failed`), fix it in `typescript.yml`, and run `ubuntu-next.yml` again by hand.

**When a job never starts:** "The job was not acquired by Runner" is GitHub's outage, not LibKa's; rerun only the failed job: `gh run rerun <id> --failed`.
