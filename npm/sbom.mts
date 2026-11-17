// A software bill of materials (SBOM) for each npm package of a release, in CycloneDX JSON, from the packed files only:
//
//   node npm/sbom.mts [dist/npm]
//
// Each dist/npm/<name>-<version>.tgz is unpacked into a temporary folder, its production dependencies are installed
// as npm would install them for a user (no scripts run), and `npm sbom` lists the package itself as the root component
// with every dependency, version, licence and integrity hash. Writes dist/npm/<name>-<version>.cdx.json; the release
// workflow (publish.yml) adds them to SHA256SUMS and the GitHub release. Exits 1 when a package gives no SBOM.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const packs = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'dist', 'npm'));
const win = process.platform === 'win32';
const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, {
  cwd, encoding: 'utf8', shell: win, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' },
});
const tarballs = readdirSync(packs).filter((f) => f.endsWith('.tgz')).sort();
if (!tarballs.length) { console.error(`sbom: no .tgz in ${packs}: run node npm/build.mts first`); process.exit(1); }
/** This release's packages by name, each to its packed file (`@libka/cli` → …/libka-cli-X.tgz). */
const ours = new Map(tarballs.map((t) => {
  const m = /^(libka-(cli|mcp|tokens)|create-libka)-\d/.exec(t);
  const name = m?.[2] ? `@libka/${m[2]}` : 'create-libka';
  return [name, join(packs, t).split('\\').join('/')] as const;
}));

for (const tgz of tarballs) {
  const work = mkdtempSync(join(tmpdir(), 'libka-sbom-'));
  try {
    // unpacked by its name in the folder (GNU tar reads "K:/…" as a remote host)
    copyFileSync(join(packs, tgz), join(work, tgz));
    run('tar', ['-xzf', tgz], work);
    const dir = join(work, 'package');
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string; version: string; dependencies?: Record<string, string> };
    // a dependency on another package of this release (@libka/mcp on @libka/cli) comes from its packed file beside
    // this one: the registry has it only once the release is published, after the SBOMs are made
    const deps = { ...pkg.dependencies };
    for (const name of Object.keys(deps)) {
      const sibling = ours.get(name);
      if (sibling) deps[name] = `file:${sibling}`;
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ ...pkg, dependencies: deps }, null, 2));
    run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-package-lock=false'], dir);
    const sbom = JSON.parse(run('npm', ['sbom', '--sbom-format', 'cyclonedx', '--omit', 'dev'], dir)) as {
      bomFormat?: string; metadata?: { component?: { name?: string; group?: string; version?: string; purl?: string } }; components?: unknown[];
    };
    const root = sbom.metadata?.component;
    const purl = `pkg:npm/${pkg.name.replace(/^@/, '%40')}@${pkg.version}`;
    if (sbom.bomFormat !== 'CycloneDX' || !root || decodeURIComponent(root.purl ?? '') !== decodeURIComponent(purl)) {
      throw new Error(`${tgz}: npm sbom did not describe ${pkg.name}@${pkg.version} (root ${JSON.stringify(root)})`);
    }
    // npm names the root after its folder ("package"): the package's own name, its scope as the group (CycloneDX)
    const scope = /^(@[^/]+)\/(.+)$/.exec(pkg.name);
    root.name = scope ? scope[2]! : pkg.name;
    if (scope) root.group = scope[1]!;
    const file = join(packs, tgz.replace(/\.tgz$/, '.cdx.json'));
    writeFileSync(file, `${JSON.stringify(sbom, null, 2)}\n`);
    console.log(`sbom: ${pkg.name}@${pkg.version}: ${sbom.components?.length ?? 0} components → ${file.split(/[\\/]/).slice(-2).join('/')}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
