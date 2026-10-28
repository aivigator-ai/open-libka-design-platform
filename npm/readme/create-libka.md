# create-libka

Starts a LibKa project:

```bash
npm create libka@latest my-docs
npm create libka@latest my-docs -- --lang cs     # the example document in Czech
```

It writes, into a new folder: an example document (`docs/guide.md`, in English or Czech), `package.json` with `npm run build`, `check`, `verify` and `doctor`, a GitHub Actions workflow that builds and checks every push and pull request with the LibKa Guard action, marking a problem in the source on its line and a finding in an output on its file, a `.gitignore` that keeps the signing key out of git, and a README of next steps. It installs nothing and runs nothing.

Then:

```bash
cd my-docs
npm install
npm run doctor
npm run build
```

LibKa needs Node.js 22.18 or newer and Google Chrome. More: {{repository}}

Licence: Apache-2.0.
