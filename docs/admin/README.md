# LibKa maintainer guide

For anyone who builds LibKa from source, contributes to it or runs its checks: how to install, run, check and repair everything LibKa depends on. It is written so a person can follow it step by step and an AI agent can act on it. Each chapter says what a piece is, why it is needed, how to install and run it, how to check it, and what to do when it fails.

:::table{caption="The chapters of the maintainer guide and what each covers"}

| Chapter | Covers |
|---|---|
| [environment.md](environment.md) | Every tool a machine needs, first setup, everyday commands, environment variables, CI |
| [verapdf.md](verapdf.md) | Java and veraPDF, the PDF/UA validator: install without admin rights, CI, updates, failures |
| [word-and-libreoffice.md](word-and-libreoffice.md) | Word files: LibreOffice (install without admin rights, CI), the Word script, Word's accessibility checker, failures |
| [studio.md](studio.md) | The Studio: build, serve, install, where documents live, its tests and browsers, its policy, performance budget and accessibility audit, failures |
| [screen-readers.md](screen-readers.md) | NVDA for the Studio's screen-reader tests: set up without admin rights, run, failures |
| [signing-keys.md](signing-keys.md) | The keys that sign the manifests of the checks, one set per project: creation, trust, CI, backup, rotation, revocation |
| [when-a-check-fails.md](when-a-check-fails.md) | What each failure means and the usual fix |

:::
