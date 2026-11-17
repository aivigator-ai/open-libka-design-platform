# Security policy

## Reporting a vulnerability

Please do not report security problems in public issues, discussions or pull requests.

- **Preferred:** GitHub's private vulnerability reporting, under this repository's **Security** tab ("Report a vulnerability").
- **Or by e-mail:** opensource@aivigator.ai

Describe what you found, how to reproduce it, and what an attacker could do with it. We acknowledge a report within five working days and send a plan for a fix within 30 days, keep you informed while we fix it, and credit you in the release notes unless you prefer otherwise. Please give us reasonable time to release a fix before you publish anything.

## What is in scope

- Content Security Policy bypasses in LibKa's outputs or in LibKa Studio;
- script execution from a LibKa document (Markdown, front matter, diagrams, charts) in the web page, slides or Studio;
- a way to make `libka verify` accept a changed output, or a forged signature;
- the Studio exposing documents across sites, or sending anything off the device;
- the CLI or the MCP server reading or writing files outside the paths it was given.

Accessibility defects are bugs, not security problems: please report them as issues.

## Supported versions

| Version | Security fixes |
|---|---|
| 2.0.4, the latest release | Yes |
| Older versions | No |

Security fixes go into the latest release. When a new minor version is released (for example 2.1), the one before it (2.0.x) still receives security fixes for three months, so you have time to upgrade; this table then says until when.

## Software bill of materials

Each release on GitHub carries a software bill of materials (SBOM) for each of its npm packages, in CycloneDX JSON (`<package>-<version>.cdx.json`): every dependency with its version, licence and integrity hash, as npm installs it for you. The release's `SHA256SUMS` lists them with the other files.
