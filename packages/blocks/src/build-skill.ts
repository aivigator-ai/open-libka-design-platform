// Writes .claude/skills/libka-author/reference.md from the registry. With --check, fails if it is stale.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillReference } from './skill-reference.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = join(root, '.claude', 'skills', 'libka-author', 'reference.md');
const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;   // the product version
const text = skillReference(version);
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(out, 'utf8'); } catch { /* missing */ }
  if (current !== text) { console.error('skill: reference.md is out of date; run node packages/blocks/src/build-skill.ts'); process.exit(1); }
  console.log('skill: reference.md is up to date');
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`skill: wrote .claude/skills/libka-author/reference.md (${text.split('\n').length} lines)`);
}
