/**
 * Write the locks of the built-in designs (LibKa's brand × each built-in theme) to packages/design/locks/. The tests
 * fail when they are stale. Run: node packages/design/src/build-locks.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBKA_BRAND } from './brand.ts';
import { design, lockName, lockText } from './lock.ts';
import { BUILTIN_THEMES } from './theme.ts';

export const LOCKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'locks');

/** The built-in locks by file name. */
export function builtinLocks(): Record<string, string> {
  return Object.fromEntries(BUILTIN_THEMES.map((t) => [lockName(LIBKA_BRAND.id!, t.id), lockText(design(LIBKA_BRAND, t))]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(LOCKS_DIR, { recursive: true });
  for (const [name, text] of Object.entries(builtinLocks())) {
    writeFileSync(join(LOCKS_DIR, name), text);
    console.log(`wrote packages/design/locks/${name}`);
  }
}
