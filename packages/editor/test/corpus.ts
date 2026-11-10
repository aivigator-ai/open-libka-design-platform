import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKS } from '@libka/blocks';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return f === 'node_modules' ? [] : statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
});

/** Folders of more LibKa documents a repository lists in check.extra.json ("corpus"), if it has one. */
export const extra: string[] = existsSync(join(root, 'check.extra.json'))
  ? (JSON.parse(readFileSync(join(root, 'check.extra.json'), 'utf8')) as { corpus?: string[] }).corpus ?? [] : [];

/** Every LibKa document in the repository: the registry's examples, the examples, the catalog and any extra corpus. */
export const corpus: [string, string][] = [
  ...BLOCKS.map((b) => [`block ${b.name}`, b.frontMatter ? `---\n${b.frontMatter}\n---\n\n${b.example}\n` : b.example] as [string, string]),
  ...[join(root, 'examples', 'manual', 'guide.md'), join(root, 'examples', 'open-source-guide', 'guide.md'), join(root, 'docs', 'blocks.md'),
    ...extra.flatMap((dir) => walk(join(root, dir)))].map((p) => [relative(root, p).split('\\').join('/'), readFileSync(p, 'utf8')] as [string, string]),
];
