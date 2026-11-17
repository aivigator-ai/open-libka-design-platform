/**
 * The golden test: LibKa's default design (LibKa's brand, the Classic theme) builds the same bytes as the
 * outputs recorded in golden.json, so plumbing a design through the renderers changes nothing a reader gets.
 *
 * Two parts:
 * - **without Chrome** (every run): the web page and the deck as rendered, and the Word file, for every
 *   document below. The Word file is hashed in two parts, its theme (`word/theme/theme1.xml`,
 *   `word/fontTable.xml`) and everything else, so a deliberate change to the Word theme is recorded on its own.
 * - **with Chrome:** the full build (diagrams drawn, the deck fitted, the PDF printed and repaired), by
 *   the Chrome version, since Chrome's bytes change with it. A version without a record is skipped, and the test says so.
 *
 * The HTML is compared without its manifest (the manifest says which design was used; its signature differs
 * per key). `LIBKA_GOLDEN_RECORD=1` rewrites the record for this machine's run: only when the outputs are
 * meant to change, and the commit says why.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveDesign } from '@libka/design';
import { renderDocx } from '@libka/docx';
import { launchBrowser } from '@libka/guard';
import { stripManifest } from '@libka/guard/manifest';
import { parse } from '@libka/model';
import { renderManual } from '@libka/render';
import { renderDeck } from '@libka/render/deck';
import { readAsset } from '../src/assets.ts';
import { build } from '../src/libka.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const FILE = join(HERE, 'golden.json');
const RECORD = process.env.LIBKA_GOLDEN_RECORD === '1';

/** The documents: the examples, the catalog of every block, and the starter's guide in English and Czech. */
const DOCUMENTS = [
  'examples/manual/guide.md',
  'examples/open-source-guide/guide.md',
  'docs/blocks.md',
  'packages/create-libka/templates/en/docs/guide.md',
  'packages/create-libka/templates/cs/docs/guide.md',
];
/** The documents the Chrome part builds in full (every output). */
const FULL = ['examples/open-source-guide/guide.md', 'packages/create-libka/templates/cs/docs/guide.md'];
/** The Word file's theme parts, hashed apart from the rest. */
const WORD_THEME = ['word/theme/theme1.xml', 'word/fontTable.xml'];

interface Hashes { web: string; deck?: string; pdf?: string; deckPdf?: string; docx: string; docxTheme: string }
interface Golden {
  format: 1;
  /** The commit or release whose outputs were recorded, and why they were recorded then. */
  recorded: { commit: string; reason: string };
  documents: Record<string, Hashes>;
  chrome: Record<string, Record<string, Hashes>>;
}

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const chrome = [process.env.LIBKA_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .some((p) => p && existsSync(p));

/** The Word file's hashes: its theme parts, and every other part (name and bytes, in name order). */
function wordHashes(docx: Uint8Array): Pick<Hashes, 'docx' | 'docxTheme'> {
  const files = unzipSync(docx);
  const of = (names: string[]) => sha(names.sort().map((n) => `${n}\n${sha(files[n]!)}\n`).join(''));
  const names = Object.keys(files);
  return { docx: of(names.filter((n) => !WORD_THEME.includes(n))), docxTheme: of(names.filter((n) => WORD_THEME.includes(n))) };
}

const golden: Golden = existsSync(FILE)
  ? JSON.parse(readFileSync(FILE, 'utf8')) as Golden
  : { format: 1, recorded: { commit: '', reason: '' }, documents: {}, chrome: {} };
const fresh: Golden = { ...golden, documents: {}, chrome: { ...golden.chrome } };

afterAll(() => {
  if (!RECORD) return;
  fresh.recorded = { commit: process.env.LIBKA_GOLDEN_COMMIT ?? golden.recorded.commit, reason: process.env.LIBKA_GOLDEN_REASON ?? golden.recorded.reason };
  writeFileSync(FILE, JSON.stringify(fresh, null, 2) + '\n');
});

describe('the default design builds the recorded bytes, without Chrome', () => {
  const styles = { tokens: readAsset('libka-tokens.css'), bridge: readAsset('lk-bridge.css'), components: readAsset('components.css') };
  // as the build passes it: LibKa's brand × Classic, solved and locked
  const design = resolveDesign();
  for (const path of DOCUMENTS) {
    it(path, async () => {
      const { document } = parse(readFileSync(join(ROOT, path), 'utf8'));
      const web = renderManual(document, { styles: { ...styles, manual: readAsset('manual.css') }, fontsHref: 'fonts/libka-fonts.css', source: 'guide.md', design });
      const deck = renderDeck(document, { styles: { ...styles, deck: readAsset('deck.css') }, fontsHref: 'fonts/libka-fonts.css', design });
      const hashes: Hashes = { web: sha(web), deck: sha(deck), ...wordHashes(await renderDocx(document, { design })) };
      fresh.documents[path] = hashes;
      if (!RECORD) expect(hashes).toEqual(golden.documents[path]);
    }, 60000);
  }
});

describe.runIf(chrome)('the default design builds the recorded bytes, with Chrome', () => {
  // inside the repository (dist/, ignored by git): a page built here links the repository's fonts by a relative
  // path, which is the same wherever the repository is (a temporary folder elsewhere made it depend on that place:
  // the public export's verify, in dist/public-export/verify, built other bytes)
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const dir = mkdtempSync(join(ROOT, 'dist', 'golden-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('the full build of each document, for this Chrome version', async () => {
    const browser = await launchBrowser();
    const version = browser.version();
    await browser.close();
    const recorded = golden.chrome[version];
    if (!recorded && !RECORD) {
      console.log(`golden: no record for Chrome ${version} (recorded: ${Object.keys(golden.chrome).join(', ') || 'none'}); the full build is not compared`);
      return;
    }
    const results: Record<string, Hashes> = {};
    for (const [i, path] of FULL.entries()) {
      const out = join(dir, String(i));
      const r = await build(join(ROOT, path), { out, outputs: ['web', 'pdf', 'deck', 'docx'], check: false });
      expect(r.problems).toEqual([]);
      const deck = r.deck!;
      results[path] = {
        web: sha(stripManifest(readFileSync(r.html!, 'utf8'))), deck: sha(stripManifest(readFileSync(deck.html, 'utf8'))),
        pdf: sha(readFileSync(r.pdf!)), deckPdf: sha(readFileSync(deck.pdf!)), ...wordHashes(readFileSync(r.docx!)),
      };
    }
    fresh.chrome[version] = results;
    if (!RECORD) expect(results).toEqual(recorded);
  }, 600000);
});
