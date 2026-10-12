# Signing keys: what signs the outputs, and how to replace a key

**What it is.** Every output that passes Guard gets a manifest of its checks, signed with an Ed25519 key: `<name>.manifest.json`, also embedded in the HTML. Anyone can check with `libka verify page.html --pdf page.pdf` that the page and PDF have not changed since they were checked, and which key signed them.

**Each project has its own keys.** A project is the folder a document belongs to: the nearest folder above it with a `.libka/` folder, else the nearest with `package.json` or `.git` (a project made with `npm create libka` is one), else the document's own folder. The search never reaches the home folder, and a document directly in the home folder is not built (only `--no-check` builds it, unsigned): the build asks you to move it into a folder of its own.

**Where the keys are:**
- **The private key** signs. It is in the project's `.libka/signing-key.pem`, or in the environment variable or CI secret `LIBKA_SIGNING_KEY`. If neither exists, the first build creates one. Never commit the file: the build that creates it also writes `.libka/.gitignore`, which keeps every `.pem` file there out of git in any repository.
- **The trusted list** says which keys the project trusts. It holds only public fingerprints (16 hexadecimal characters), and it is meant to be committed. It is the project's `.libka/trusted-keys.json`; in the LibKa repository itself it is `governance/trusted-keys.json`. A project without a list falls back on LibKa's own list, which knows only the LibKa maintainers' keys.
- **The first key a project gets is trusted at once:** the build that creates it also writes `.libka/trusted-keys.json` with it, if the project has no list yet, and says so. A key made later, on another computer or in CI, is not added: the build prints its fingerprint and the list to add it to.

**What verify says:**
- `trusted`: the key is on the list and active.
- `trusted (a retired key …)`: the key was replaced, but its manifests were signed before that and stay valid.
- `REVOKED key: not trusted`: the key was compromised; do not rely on what it signed.
- `NOT in .libka/trusted-keys.json` (or the list it used): the signature proves the files are unchanged, but not who signed them. In CI that is expected: CI makes a key of its own for each run unless it has the `LIBKA_SIGNING_KEY` secret.

`libka verify` exits 0 for an untrusted key, because the files are still unchanged. Add `--require-trusted` where only your own keys count, such as a CI job that publishes outputs: it then exits 1 unless the key is on the list and not revoked (an active key, or a retired one).

## What a signature proves, and what it does not

**It proves:**
- the files are byte for byte the ones that were checked;
- which checks ran, with which tool versions, and what they found: the manifest lists them. A PDF was validated against PDF/UA-1 only if the manifest's `pdfua` entry names a `validator`; `pdfua: { "skipped": … }` means it was not checked (without veraPDF the build still signs, and the manifest, the conformance report and `libka verify` say "PDF/UA-1 not checked");
- which key signed, and whether your trusted list knows that key.

**It does not prove:**
- that a document is accessible: automated checks cover part of WCAG, and the conformance report next to each output says what a person still has to review;
- that the checks were LibKa's own, unmodified: anyone can build LibKa from source and sign with their own key. A signature is worth what the key behind it is worth;
- who you are to someone else: your outputs verify as trusted only against a list that holds your key. An organisation that relies on signatures keeps its own trusted list of its own keys.

## Back up the key

Copy `.libka/signing-key.pem` to a safe place outside the project, for example an encrypted password manager entry. Without it, new builds sign with a new key and the old fingerprint stops appearing.

## Use the same key in CI

Set the secret `LIBKA_SIGNING_KEY` to the content of the `.pem` file (GitHub: the repository's Settings, Secrets and variables, Actions), and pass it to the build step as an environment variable. CI's outputs then verify as trusted like yours. Anyone who can change the workflow can then sign as the project, so only do this where you trust everyone with write access.

## Replace a key (rotation)

Do this when a machine changes, or every couple of years. **If you suspect the key was copied, do not rotate: revoke it** ([below](#if-a-key-was-compromised)). A retired key stays fully trusted, for whatever it signed and anything signed with it later: the date in a manifest is written by whoever signs, so it cannot tell old signatures from new ones.

1. Move the old key out of the project: put `.libka/signing-key.pem` somewhere outside it (for example your password manager), and keep it until step 4 is done.
2. Create the new key: run any build, for example `npm run build` in a project made by the starter, or `npx -y @libka/cli build docs/guide.md` elsewhere (in the LibKa repository: `node packages/cli/src/libka.ts build examples/manual/guide.md`). It prints that it created a new signing key, with its fingerprint.
3. If you missed the fingerprint, `libka verify` on the new output shows `key <fingerprint>, NOT in …`.
4. Update the trusted list:
   - add the new key: `{ "fingerprint": "<new>", "owner": "<which machine>", "added": "<today>" }`;
   - mark the old one as replaced by adding `"retired": "<today>"` to its entry.
5. If CI signs too, set the secret `LIBKA_SIGNING_KEY` to the content of the new `.pem` file.
6. Commit the trusted-key list. Then delete the old key file, or keep it offline if you want to re-sign old documents.

## If a key was compromised

Also when you only suspect it.

1. Add `"revoked": "<today>"` to its entry in the trusted list and commit the change. From then on, verify reports everything it signed as not trusted.
2. Create a new key (steps 1 to 5 above).
3. Rebuild the documents that matter, so they carry a manifest from the new key.

A revoked key cannot be un-revoked by mistake: any change to the list goes through a commit you approve.

## Checked by

- `packages/cli/test/cli.test.ts` ("signing keys"): active and retired keys are trusted, revoked ones are not.
- `packages/cli/test/project.test.ts`: a document's project; the first key trusted in the project's own list, a later one only reported; LibKa's list when a project has none; a new project's build verifies as trusted.
- `packages/guard/test/guard.test.ts` ("signed manifest"): a changed page, PDF or manifest fails verification, and a manifest that claims a trusted fingerprint for another key is neither valid nor trusted.
