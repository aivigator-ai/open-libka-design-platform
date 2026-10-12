// One product version for everything: the root package.json is the source (scripts/set-version.mts writes the copies).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/libka.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const json = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));
const version = json('package.json').version as string;
/** Every workspace package, found as scripts/set-version.mts finds them: under packages/ and apps/, and top-level folders. */
const packages = () => {
  const inside = (dir: string) => readdirSync(join(root, dir), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, dir, d.name, 'package.json'))).map((d) => `${dir}/${d.name}/package.json`);
  const top = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'node_modules' && !d.name.startsWith('.') && existsSync(join(root, d.name, 'package.json'))).map((d) => `${d.name}/package.json`);
  return [...inside('packages'), ...inside('apps'), ...top];
};

describe('the product version', () => {
  it('is a version number in the root package.json, and the CLI reports it', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(VERSION).toBe(version);
    expect(execFileSync(process.execPath, [join(root, 'packages', 'cli', 'src', 'libka.ts'), '--version'], { encoding: 'utf8' }).trim()).toBe(version);
  }, 30_000);   // starting the CLI loads the whole engine: 6 s once while every package's tests ran at the same time

  it('is the same in every package, the tokens and the manual (run node scripts/set-version.mts)', () => {
    expect(packages()).toContain('npm/package.json');
    for (const p of packages()) expect(json(p).version, p).toBe(version);
    expect(json('tokens/primitive.tokens.json').$extensions['org.libka'].brand.version, 'tokens/primitive.tokens.json').toBe(version);
    expect(readFileSync(join(root, 'docs', 'design-system', 'manual.md'), 'utf8')).toMatch(new RegExp(`^\\*\\*Version ${version.replace(/\./g, '\\.')}\\*\\* \\|`, 'm'));
  });

  it('every package states its licence', () => {
    for (const p of ['package.json', ...packages()]) expect(json(p).license, p).toBe('Apache-2.0');
  });
});
