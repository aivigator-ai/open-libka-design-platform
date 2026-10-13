// The Claude Code plugin and its marketplace file are generated (npm/build-plugin.mts) and committed; the Desktop
// extension's manifest is a template (npm/mcpb/manifest.json). Both must name what the server really offers.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluginFiles } from '../../../npm/build-plugin.mts';
import { createServer } from '../src/server.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;

describe('the Claude Code plugin', () => {
  it('is in step with the skill and the version (run node npm/build-plugin.mts)', () => {
    for (const [path, text] of Object.entries(pluginFiles())) expect(readFileSync(join(root, path), 'utf8'), path).toBe(text);
  });

  it('starts the MCP server of the same version, and the marketplace lists the plugin', () => {
    const plugin = JSON.parse(readFileSync(join(root, 'plugins', 'libka', '.claude-plugin', 'plugin.json'), 'utf8'));
    expect(plugin.version).toBe(version);
    expect(plugin.mcpServers.libka).toEqual({ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/launch.mjs'] });
    expect(readFileSync(join(root, 'plugins', 'libka', 'launch.mjs'), 'utf8')).toContain(`'@libka/mcp@${version}'`);
    const market = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
    expect(market.plugins).toEqual([expect.objectContaining({ name: 'libka', source: './plugins/libka', version })]);
  });

  it("has a README (the plugin directory's requirement) that names every tool and what the plugin runs", () => {
    // hand-written: an overlay file here, plugins/libka/README.md in the public repository
    const path = [join(root, 'plugins', 'libka', 'README.md'), join(root, 'public-repo', 'overlay', 'plugins', 'libka', 'README.md')]
      .find((p) => existsSync(p));
    expect(path, 'plugins/libka/README.md').toBeDefined();
    const readme = readFileSync(path!, 'utf8');
    for (const tool of Object.keys((createServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools)) {
      expect(readme, tool).toContain(`\`${tool}\``);
    }
    // the overlay's version is filled in by the export; the public repository's must be this version exactly
    expect(readme).toContain(path!.includes('overlay') ? '`npx -y @libka/mcp@{{facts.version}}`' : `\`npx -y @libka/mcp@${version}\``);
    expect(readme.split(/\s+/).length).toBeGreaterThanOrEqual(40);
  });
});

describe('the Claude Desktop extension', () => {
  it('lists the tools the server offers', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'npm', 'mcpb', 'manifest.json'), 'utf8'));
    const registered = Object.keys((createServer() as unknown as { _registeredTools: Record<string, unknown> })._registeredTools).sort();
    expect(manifest.tools.map((t: { name: string }) => t.name).sort()).toEqual(registered);
    expect(manifest.server.mcp_config.env).toEqual({ LIBKA_OUT: '${user_config.out_dir}' });
  });
});
