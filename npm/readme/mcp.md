# @libka/mcp

The LibKa MCP server: AI tools list LibKa's blocks, read their syntax, check LibKa Markdown and build it into a web page, an A4 PDF, 16:9 slides and a Word file, each checked for accessibility by Guard and signed.

```bash
npx -y @libka/mcp@{{version}}
```

It speaks MCP over stdio. To add it to Claude Code:

```bash
claude mcp add libka -- npx -y @libka/mcp@{{version}}
```

Every other route (the Claude Code plugin with the authoring skill, the Claude Desktop extension, claude.ai, the API and other MCP clients) is in the guide: {{repository}}/blob/main/docs/ai-tools.md

| Tool | What it does |
|---|---|
| `libka_list_blocks` | every block with the content it fits, and what to write for content without a block |
| `libka_get_block` | one block: syntax, attributes, outputs, accessibility rules, anti-patterns, JSON schema |
| `libka_check` | parses LibKa Markdown: problems with line numbers, the outline, the slide count |
| `libka_build` | builds the outputs, runs Guard and signs; returns the files and every finding |

Resources: `libka://guide` (how to write LibKa), `libka://reference` (the block reference), `libka://schema/document`. Prompt: `convert-to-libka`.

**Requirements:** Node.js 22.18 or newer; Google Chrome for `libka_build` (checking and listing work without it). `libka_build` writes files on this computer: into the folder in `LIBKA_OUT`, else `./libka-out` under the server's working folder, unless given another folder.

Licence: Apache-2.0. Source: {{repository}}
