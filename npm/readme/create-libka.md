# create-libka

Starts a LibKa project:

```bash
npm create libka@latest my-docs
npm create libka@latest my-docs -- --lang cs     # the example document in Czech
npm create libka@latest my-docs -- --template report   # or talk, manual, policy, decision-record: a template instead of the example
```

It writes, into a new folder: an example document (`docs/guide.md`, in English or Czech) or one of five templates, in English or Czech (`report`: a summary, key figures, a chart and a decision, for the web, a PDF and Word; `talk`: an agenda, speaker notes and a closing slide, for the web, a PDF and slides; `manual`: steps, callouts and a checklist, for the web, a PDF, slides for training and Word; `policy`: numbered rules, retention periods and a revision history, for the web, a PDF and Word; `decision-record`: decisions with their options and consequences, for the web, a PDF and Word), `package.json` with `npm run build`, `check`, `verify` and `doctor`, a GitHub Actions workflow that builds and checks every push and pull request with the LibKa Guard action, marking a problem in the source on its line and a finding in an output on its file, a `.gitignore` that keeps the signing key out of git, and a README of next steps. It installs nothing and runs nothing.

Then:

```bash
cd my-docs
npm install
npm run doctor
npm run build
```

LibKa needs Node.js 22.18 or newer and Google Chrome. More: {{repository}}

Licence: Apache-2.0.
