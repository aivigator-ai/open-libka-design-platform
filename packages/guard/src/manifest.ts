/**
 * The LibKa manifest: what an output was built from and which checks it passed, signed.
 *
 * Embedded in the HTML as <script type="application/libka-manifest+json"> (inert), and written next
 * to it as <name>.manifest.json together with the hashes of the PDF and the Word file. The HTML hash is computed over the page
 * without the manifest element, so embedding does not change it. No timestamps: the same source and
 * versions give the same manifest.
 *
 * Signing key (Ed25519): LIBKA_SIGNING_KEY (PEM) or .libka/signing-key.pem in the project (the CLI decides
 * which folder that is), created on first use and never committed. A trusted-key list names the fingerprints
 * a verifier should trust; a valid signature from any other key proves integrity, not origin.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GuardReport } from './index.ts';
import type { Conformance } from './wcag.ts';

/** One piece of content marked as AI-written: a summary (with its reviewer) or an AI badge, and the section it is in. */
export interface AiContent { kind: 'summary' | 'badge'; section: string; reviewedBy?: string; label?: string }

export const MANIFEST_FORMAT = 'libka-manifest/1';
const OPEN = '<script type="application/libka-manifest+json" id="libka-manifest">';
const CLOSE = '</script>';

export interface Manifest {
  format: typeof MANIFEST_FORMAT;
  /** What the HTML is: a manual (web page, A4 PDF) or a deck (slides, 16:9 PDF). */
  target?: 'manual' | 'deck';
  source: { name: string; sha256: string };
  tokens: { version: string };
  /** SHA-256 of each output: the HTML without the manifest element, the PDF and the Word file (manual only). */
  outputs: { html: string; pdf?: string; docx?: string };
  checks: { id: string; mode: string; checked: number; skipped: number; violations: number }[];
  guard: { axe: string };
  /**
   * The PDF validated by veraPDF: PDF/UA-1 passed (it gates the build), and the PDF/UA-2 result for the record;
   * or, when no validator ran, why not, so the record never reads as if the PDF had been validated.
   */
  pdfua?: { validator: string; ua1: boolean; ua2: { compliant: boolean; failedRules: number } } | { skipped: string };
  /** WCAG 2.2 A/AA criteria by status, with the EN 301 549 version the clause numbers follow. */
  conformance?: Conformance;
  /** Content marked as written by AI (EU AI Act, Article 50): AI summaries with their reviewer, AI badges, where they are. */
  ai?: AiContent[];
  key: { algorithm: 'ed25519'; publicKey: string; fingerprint: string };
  signature?: string;
}

export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

/** JSON with sorted keys, so the signed bytes do not depend on property order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface SigningKey { privateKey: KeyObject; publicKey: string; fingerprint: string }

export function loadSigningKey(root: string, log: (m: string) => void = () => {}): SigningKey {
  let pem = process.env.LIBKA_SIGNING_KEY;
  const file = join(root, '.libka', 'signing-key.pem');
  if (!pem && existsSync(file)) pem = readFileSync(file, 'utf8');
  let privateKey: KeyObject;
  if (pem) {
    privateKey = createPrivateKey(pem);
  } else {
    privateKey = generateKeyPairSync('ed25519').privateKey;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { mode: 0o600 });
    log(`created a signing key in .libka/signing-key.pem (local only, never commit it)`);
  }
  const publicKey = (createPublicKey(privateKey).export({ type: 'spki', format: 'der' }) as Buffer).toString('base64');
  return { privateKey, publicKey, fingerprint: sha256(Buffer.from(publicKey, 'base64')).slice(0, 16) };
}

export function stripManifest(html: string): string {
  const start = html.indexOf(OPEN);
  if (start < 0) return html;
  const end = html.indexOf(CLOSE, start) + CLOSE.length;
  return html.slice(0, start) + html.slice(end + (html[end] === '\n' ? 1 : 0));
}

export function readManifest(html: string): Manifest | null {
  const start = html.indexOf(OPEN);
  if (start < 0) return null;
  return JSON.parse(html.slice(start + OPEN.length, html.indexOf(CLOSE, start))) as Manifest;
}

export function buildManifest(args: { target?: 'manual' | 'deck'; sourceName: string; source: string; tokensVersion: string; html: string; report: GuardReport; axe: string; key: SigningKey; pdf?: Buffer; docx?: Uint8Array; pdfua?: Manifest['pdfua']; conformance?: Conformance; ai?: AiContent[] }): Manifest {
  const manifest: Manifest = {
    format: MANIFEST_FORMAT,
    ...(args.target ? { target: args.target } : {}),
    source: { name: args.sourceName, sha256: sha256(args.source) },
    tokens: { version: args.tokensVersion },
    outputs: { html: sha256(stripManifest(args.html)), ...(args.pdf ? { pdf: sha256(args.pdf) } : {}), ...(args.docx ? { docx: sha256(args.docx) } : {}) },
    checks: args.report.checks.map((c) => ({ id: c.id, mode: c.mode, checked: c.checked, skipped: c.skipped, violations: c.violations.length })),
    guard: { axe: args.axe },
    ...(args.pdfua ? { pdfua: args.pdfua } : {}),
    ...(args.conformance ? { conformance: args.conformance } : {}),
    ...(args.ai?.length ? { ai: args.ai } : {}),
    key: { algorithm: 'ed25519', publicKey: args.key.publicKey, fingerprint: args.key.fingerprint },
  };
  manifest.signature = sign(null, Buffer.from(canonical(manifest)), args.key.privateKey).toString('base64');
  return manifest;
}

/** Insert the manifest before </head>; the HTML hash inside it ignores this element. */
export function embedManifest(html: string, manifest: Manifest): string {
  const clean = stripManifest(html);
  const json = JSON.stringify(manifest).replace(/</g, '\\u003c');
  return clean.replace('</head>', `${OPEN}${json}${CLOSE}\n</head>`);
}

/** fingerprint: the one computed from the key that signed, never the one the manifest claims. */
export interface Verification { ok: boolean; trusted: boolean; problems: string[]; manifest: Manifest | null; fingerprint: string | null }

export function verifyHtml(html: string, trustedFingerprints: readonly string[] = [], pdf?: Buffer, docx?: Uint8Array): Verification {
  const manifest = readManifest(html);
  if (!manifest) return { ok: false, trusted: false, problems: ['no LibKa manifest in this file'], manifest, fingerprint: null };
  const problems: string[] = [];
  const { signature, ...unsigned } = manifest;
  // Trust follows the key that verifies the signature. The fingerprint written in the manifest is only a claim:
  // anyone can sign with their own key and write a trusted fingerprint next to it.
  const fingerprint = sha256(Buffer.from(manifest.key?.publicKey ?? '', 'base64')).slice(0, 16);
  if (manifest.key?.fingerprint !== fingerprint) {
    problems.push(`the key fingerprint in the manifest (${manifest.key?.fingerprint}) does not belong to the key that signed it (${fingerprint})`);
  }
  try {
    const key = createPublicKey({ key: Buffer.from(manifest.key.publicKey, 'base64'), format: 'der', type: 'spki' });
    if (!signature || !verify(null, Buffer.from(canonical(unsigned)), key, Buffer.from(signature, 'base64'))) {
      problems.push('signature does not match the manifest (the manifest was changed after signing)');
    }
  } catch {
    problems.push('the manifest key or signature is malformed');
  }
  if (sha256(stripManifest(html)) !== manifest.outputs.html) problems.push('the HTML was changed after it was checked and signed');
  if (pdf && manifest.outputs.pdf !== sha256(pdf)) problems.push('the PDF does not match the signed manifest');
  if (docx && manifest.outputs.docx !== sha256(docx)) problems.push('the Word file does not match the signed manifest');
  const failed = manifest.checks.filter((c) => c.violations > 0);
  if (failed.length) problems.push(`the manifest records failed checks: ${failed.map((c) => `${c.id}/${c.mode}`).join(', ')}`);
  return { ok: problems.length === 0, trusted: problems.length === 0 && trustedFingerprints.includes(fingerprint), problems, manifest, fingerprint };
}
