// Writes docs/acr/studio.md, the Studio's Accessibility Conformance Report, from audit.ts. A test fails when it is stale.
//   node apps/studio/audit/build-acr.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { studioAcrMarkdown } from './audit.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'acr', 'studio.md');
writeFileSync(out, studioAcrMarkdown());
console.log(`acr: wrote ${out}`);
