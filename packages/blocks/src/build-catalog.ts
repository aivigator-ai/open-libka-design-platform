// Writes docs/blocks.md (the block catalog) from the registry. With --check, fails if it is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogMarkdown } from './catalog.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = join(root, 'docs', 'blocks.md');
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;   // the product version
const text = catalogMarkdown(version);
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(out, 'utf8'); } catch { /* missing */ }
  if (current !== text) { console.error('blocks: docs/blocks.md is out of date; run node packages/blocks/src/build-catalog.ts'); process.exit(1); }
  console.log('blocks: docs/blocks.md is up to date');
} else {
  writeFileSync(out, text);
  console.log(`blocks: wrote docs/blocks.md (${text.split('\n').length} lines)`);
}
