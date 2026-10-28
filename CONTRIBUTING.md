# Contributing to LibKa

Thank you for helping. LibKa turns one LibKa Markdown file into a web page, PDF, slides and Word file, checks each one for accessibility and records what it checked; every contribution keeps that promise intact.

## Before you start

- **Questions and ideas:** ask in Discussions ([SUPPORT.md](SUPPORT.md)); an idea for a new block is welcome there too. Open an issue first for anything larger than a fix, so we can agree on the approach before you spend time on it.
- **Bugs:** use the bug report form; include the smallest document that shows the problem and the output of `libka lint` or the build.
- **Security problems:** never in a public issue; see [SECURITY.md](SECURITY.md).
- **Sign-off:** every commit carries a `Signed-off-by: Your Name <address>` line (`git commit -s` adds it; your GitHub no-reply address is fine). It certifies the [Developer Certificate of Origin](https://developercertificate.org/): that you wrote the change, or otherwise have the right to submit it under the project's licence. A check on the pull request lists any commit without it (`git commit --amend -s`, or `git rebase --signoff main`, then push again). Contributions are licensed under the [Apache License 2.0](LICENSE); there is no separate agreement to sign.
- **Conduct:** everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need Node.js 22.18 or newer, Google Chrome, Python 3.12 or newer, and Java 21 with veraPDF: `check.py` requires them, because every PDF a test builds must pass PDF/UA-1 ([install without administrator rights](docs/admin/verapdf.md)). LibreOffice is optional locally (the Word file conversion test is skipped without it) and required in CI. [docs/admin/environment.md](docs/admin/environment.md) has every tool, with checks.

```bash
npx --yes pnpm@12.8.1 install
python -m venv .venv
.venv/Scripts/python.exe check.py      # Windows; .venv/bin/python check.py on macOS and Linux
```

`check.py` must end with `HEALTHY` before and after your change. It runs the Python tests, the strict TypeScript type check, every package's tests (Chrome tests included), the token build, and a check that no generated file is stale.

## Making a change

- **One topic per pull request,** with tests that prove it: a failing test first where you fix a bug.
- **Generated files are never edited by hand.** Change the source and regenerate: the token files from `tokens/` with `generate.py`; `docs/blocks.md` and the skill reference from the block registry; `docs/problem-codes.md`; the conformance reports in `docs/acr/`; the page runtimes. The tests fail when one is stale, and [AGENTS.md](AGENTS.md) lists the commands.
- **Styles use tokens only:** no raw colour values in CSS; contrast is checked by the token build and by Guard.
- **A new block** is defined once in `packages/blocks` (syntax, attributes, accessibility rules, per-output behaviour), styled in `packages/render/src/components.css`, and must pass Guard on the web page, slides, PDF (veraPDF) and Word file.
- **Accessibility claims stay precise:** LibKa says what was checked automatically and what a person still has to review, never "compliant".
- **Text:** code, comments and docs in English; the page text of outputs and the Studio comes in English and Czech (`labels.ts`, the Studio's `i18n.ts`).
- **Commits** describe what changed and how it was proven.

## How a pull request is merged

This repository is published from the maintainers' development repository. A maintainer reviews your pull request here; once it is accepted, it is applied there and appears here with the next release. The release commit names you in a `Co-authored-by` line, with the address your pull request's commits used (so GitHub shows the commit on your profile), and the changelog thanks you by your GitHub name and pull request number. Your pull request is then closed with a link to the release.

## Using AI tools

You may use AI coding agents; [AGENTS.md](AGENTS.md) is their starting point. You remain responsible for every line: run `check.py`, read the diff, and say in the pull request what the tool did.
