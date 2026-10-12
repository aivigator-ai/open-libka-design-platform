/** Builds the Studio once before the tests (vitest.config.ts): the browser tests serve apps/studio/dist/. */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), '..', 'build.mjs')], { stdio: 'pipe' });
}
