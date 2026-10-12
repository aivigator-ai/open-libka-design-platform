// Writes docs/problem-codes.md (the list of problem codes) from the model. With --check, fails if it is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { problemCodesMarkdown } from './problem-codes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = join(root, 'docs', 'problem-codes.md');
const text = problemCodesMarkdown();
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(out, 'utf8'); } catch { /* missing */ }
  if (current !== text) { console.error('model: docs/problem-codes.md is out of date; run node packages/model/src/build-codes.ts'); process.exit(1); }
  console.log('model: docs/problem-codes.md is up to date');
} else {
  writeFileSync(out, text);
  console.log(`model: wrote docs/problem-codes.md (${text.split('\n').length} lines)`);
}
