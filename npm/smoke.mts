// The quick start from the packed packages only, as a newcomer runs it (and as CI runs it on fresh Windows and
// Ubuntu runners): no workspace, no repository packages, only dist/npm/*.tgz and what npm installs for them.
//
//   node npm/smoke.mts [dist/npm]
//
//   1. create-libka writes a project (npm exec, as `npm create libka` does)
//   2. npm install with @libka/cli from its tarball; libka --version and libka doctor
//   3. npm run check, npm run build (Guard), npm run verify: signed and trusted by the project's own key
//   4. the MCP server from its tarball answers initialize, lists its tools and checks a document
//   5. @libka/tokens resolves its CSS, SCSS, Tailwind and DTCG files by their package paths
//   6. the Claude Desktop extension's own server builds and signs a page into LIBKA_OUT
// Prints each step; exits 1 on the first failure.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const packs = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'dist', 'npm'));
const tgz = (prefix: string) => {
  const f = readdirSync(packs).find((x) => x.startsWith(prefix) && x.endsWith('.tgz'));
  if (!f) throw new Error(`no ${prefix}*.tgz in ${packs}`);
  return join(packs, f).split('\\').join('/');
};
const cliTgz = tgz('libka-cli-'), mcpTgz = tgz('libka-mcp-'), tokensTgz = tgz('libka-tokens-'), createTgz = tgz('create-libka-');
const version = cliTgz.match(/libka-cli-(.+)\.tgz$/)![1]!;
const work = mkdtempSync(join(tmpdir(), 'libka-smoke-'));
const win = process.platform === 'win32';
const sh = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, encoding: 'utf8', shell: win, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' } });
let step = 0;
const ok = (m: string) => console.log(`smoke ${++step}: ${m}`);
const expect = (cond: unknown, m: string) => { if (!cond) throw new Error(m); };

try {
  // 1. the starter
  sh('npm', ['exec', '--yes', `--package=${createTgz}`, '--', 'create-libka', 'my-docs', '--lang', 'en'], work);
  const project = join(work, 'my-docs');
  for (const f of ['docs/guide.md', 'package.json', '.gitignore', '.github/workflows/libka.yml', 'README.md']) expect(existsSync(join(project, f)), `create-libka did not write ${f}`);
  ok('create-libka wrote the project');

  // 2. install the CLI from its tarball (the registry version once published)
  const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
  expect(pkg.devDependencies['@libka/cli'] === version, `the starter asks for @libka/cli ${pkg.devDependencies['@libka/cli']}, not ${version}`);
  pkg.devDependencies['@libka/cli'] = `file:${cliTgz}`;
  writeFileSync(join(project, 'package.json'), JSON.stringify(pkg, null, 2));
  sh('npm', ['install'], project);
  expect(sh('npx', ['libka', '--version'], project).trim() === version, 'libka --version');
  const doctor = sh('npx', ['libka', 'doctor'], project);
  expect(/✓ Node\.js/.test(doctor) && /✓ Chrome/.test(doctor), `libka doctor:\n${doctor}`);
  ok(`installed @libka/cli ${version}; doctor:\n${doctor.trim().split('\n').map((l) => `      ${l}`).join('\n')}`);

  // 3. the quick start
  sh('npm', ['run', 'check'], project);
  const built = sh('npm', ['run', 'build'], project);
  for (const f of ['guide.html', 'guide.pdf', 'guide.docx', 'guide.deck.html', 'guide.manifest.json', 'fonts/libka-fonts.css']) expect(existsSync(join(project, 'dist', f)), `build did not write dist/${f}:\n${built}`);
  expect(existsSync(join(project, '.libka', 'signing-key.pem')) && existsSync(join(project, '.libka', 'trusted-keys.json')), 'the first build made no key or trusted list');
  const verified = sh('npm', ['run', 'verify'], project);
  expect((verified.match(/signature valid \(key [0-9a-f]{16}, trusted\)/g) ?? []).length === 2, `verify (the page and the slides):\n${verified}`);
  expect(/^\*\.pem$/m.test(readFileSync(join(project, '.libka', '.gitignore'), 'utf8')), 'the first build left the key without .libka/.gitignore');
  ok('npm run check, build (Guard passed, signed) and verify (trusted by the project\'s own key)');

  // 4. the MCP server
  const server = join(work, 'mcp');
  mkdirSync(server);
  sh('npm', ['init', '-y'], server);
  sh('npm', ['install', mcpTgz, cliTgz], server);
  const replies = await mcpSession(join(server, 'node_modules', '@libka', 'mcp', 'dist', 'server.js'), server, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'libka_check', arguments: { markdown: '---\ntitle: T\n---\n\n## A\n\nText.\n' } } },
    { jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'libka://guide' } },
  ]);
  expect(replies[1]?.result?.serverInfo?.version === version, `initialize: ${JSON.stringify(replies[1])}`);
  const tools = (replies[2]?.result?.tools ?? []).map((t: { name: string }) => t.name).sort();
  expect(JSON.stringify(tools) === JSON.stringify(['libka_build', 'libka_check', 'libka_get_block', 'libka_list_blocks']), `tools: ${tools}`);
  expect(JSON.parse(replies[3]?.result?.content?.[0]?.text ?? '{}').ok === true, `libka_check: ${JSON.stringify(replies[3])}`);
  expect(/LibKa/.test(replies[4]?.result?.contents?.[0]?.text ?? ''), 'libka://guide is empty');
  ok(`the MCP server answered (version ${version}, tools ${tools.join(', ')}, a document checked, the guide read)`);

  // 5. the tokens
  const tokens = join(work, 'tokens');
  mkdirSync(tokens);
  sh('npm', ['init', '-y'], tokens);
  sh('npm', ['install', tokensTgz], tokens);
  writeFileSync(join(tokens, 'probe.mjs'), "for (const p of ['@libka/tokens/css', '@libka/tokens/scss', '@libka/tokens/tailwind.css', '@libka/tokens/tailwind.config', '@libka/tokens/tokens/primitive.tokens.json']) console.log(import.meta.resolve(p));\n");
  const resolved = execFileSync(process.execPath, [join(tokens, 'probe.mjs')], { cwd: tokens, encoding: 'utf8' }).trim().split('\n');
  expect(resolved.length === 5 && resolved.every((u) => existsSync(new URL(u))), `tokens: ${resolved.join(', ')}`);
  expect(/--lk-text-primary/.test(readFileSync(new URL(resolved[0]!), 'utf8')), 'the token CSS has no --lk-text-primary');
  ok('@libka/tokens resolves its CSS, SCSS, Tailwind and DTCG files');

  // 6. the Claude Desktop extension: its server, as Desktop starts it (LIBKA_OUT from the extension's settings)
  const extension = join(packs, 'mcpb', 'server', 'node_modules', '@libka', 'mcp', 'dist', 'server.js');
  if (existsSync(extension)) {
    const outDir = join(work, 'desktop-out');
    const r = await mcpSession(extension, work, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'libka_build', arguments: { markdown: '---\ntitle: From Desktop\nlang: en\n---\n\n## A\n\nText.\n', name: 'desktop', outputs: ['web'] } } },
    ], { LIBKA_OUT: outDir });
    const result = JSON.parse(r[2]?.result?.content?.[0]?.text ?? '{}') as { ok?: boolean; problems?: string[] };
    expect(result.ok === true && existsSync(join(outDir, 'desktop.html')) && existsSync(join(outDir, 'desktop.manifest.json')), `libka_build in the extension: ${JSON.stringify(r[2])}`);
    ok('the Desktop extension\'s server built and signed a page into LIBKA_OUT');
  } else console.log('smoke: no Desktop extension to try (built with --no-mcpb)');
  console.log(`smoke: PASSED (${process.platform}, Node ${process.versions.node}, LibKa ${version})`);
} catch (e) {
  console.error(`smoke: FAILED at step ${step + 1}: ${(e as Error).message}${(e as { stdout?: string }).stdout ? `\n${(e as { stdout?: string }).stdout}` : ''}${(e as { stderr?: string }).stderr ? `\n${(e as { stderr?: string }).stderr}` : ''}`);
  process.exitCode = 1;
} finally {
  // the temporary projects go; a folder Windows still holds (Chrome closing late) is left to the system's temp cleanup
  if (!process.env.LIBKA_SMOKE_KEEP) {
    try { rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
    catch (e) { console.log(`smoke: could not remove ${work} (${(e as NodeJS.ErrnoException).code}); the result above stands`); }
  }
  else console.log(`smoke: kept ${work}`);
}

/** Runs the server over stdio, sends each message, and returns the replies by id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mcpSession(server: string, cwd: string, messages: object[], env: Record<string, string> = {}): Promise<Record<number, { result?: any; error?: unknown }>> {
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [server], { stdio: ['pipe', 'pipe', 'inherit'], cwd, env: { ...process.env, ...env } });
    const replies: Record<number, { result?: unknown }> = {};
    const want = messages.filter((m) => 'id' in m).length;
    let buffer = '';
    const timer = setTimeout(() => { child.kill(); failed(new Error(`the MCP server answered ${Object.keys(replies).length} of ${want} requests in 120 s`)); }, 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let i: number;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { id?: number; result?: unknown };
        if (typeof msg.id === 'number') replies[msg.id] = msg;
        // wait until the server has exited: on Windows a running process keeps its folder from being removed
        if (Object.keys(replies).length === want) { clearTimeout(timer); child.once('exit', () => done(replies as never)); child.kill(); }
      }
    });
    child.on('error', failed);
    for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
  });
}
