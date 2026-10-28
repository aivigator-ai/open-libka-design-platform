# LibKa with AI tools

LibKa reaches AI tools in two parts, and most routes use both:

- **The skill** (`libka-author`): how to write a LibKa document, which block fits which content, and the full block reference. It works wherever Claude can read a skill, with or without tools.
- **The MCP server** (`@libka/mcp`): tools that list the blocks, check LibKa Markdown line by line and build it, with Guard checking every output. It needs Node.js 22.18 or newer on the computer, and Google Chrome for building.

:::table{caption="Each AI tool, its route to LibKa, and whether it has the skill and the checks and builds"}

| You use | Route | Skill | Checks and builds |
|---|---|---|---|
| Claude Code | [the LibKa plugin](#claude-code) | ✓ | ✓ |
| Claude Desktop | [the LibKa extension](#claude-desktop) and the skill's `.zip` | ✓ | ✓ |
| claude.ai in the browser | [the skill's `.zip`](#claude-in-the-browser) | ✓ | no: Claude writes, you check |
| The Claude API or the Agent SDK | [the skill and the server in your code](#the-claude-api-and-the-agent-sdk) | ✓ | ✓ where your code runs |
| Another MCP client | [the server's settings](#other-mcp-clients) | your client's way, if any | ✓ |

:::

The version in every command below is the one this page belongs to (2.0.2); use the same version for the server and the skill.

## Claude Code

The plugin brings the skill and the MCP server together. In Claude Code:

```text
/plugin marketplace add aivigator-ai/open-libka-design-platform
/plugin install libka@libka
```

or from a terminal: `claude plugin marketplace add aivigator-ai/open-libka-design-platform`, then `claude plugin install libka@libka`. The skill is then called `libka:libka-author`; ask Claude for a LibKa document and it uses both. The plugin starts the server with `npx`, which downloads `@libka/mcp` once.

**Without the plugin:** add the server and copy the skill yourself.

```bash
claude mcp add libka -- npx -y @libka/mcp@2.0.2              # macOS, Linux
claude mcp add libka -- cmd /c npx -y @libka/mcp@2.0.2       # Windows
```

Add `--scope project` to share it through the project's `.mcp.json`, or `--scope user` for every project. For the skill, copy the folder [`.claude/skills/libka-author`](../.claude/skills/libka-author) into your project's `.claude/skills/` (or into `~/.claude/skills/` for every project).

## Claude Desktop

1. Download `libka-2.0.2.mcpb` from [the release on GitHub](https://github.com/aivigator-ai/open-libka-design-platform/releases/tag/v2.0.2) and open it: Claude Desktop shows what the extension does and asks for an **output folder**, where LibKa writes the documents it builds (by default `LibKa` in your Documents folder). The extension carries the server and everything it needs; it uses Chrome from your computer. What is tested: its server, run with Node.js on Windows and Ubuntu, building and signing a page; installing the extension in Claude Desktop is not tested.
2. Download `libka-author-skill-2.0.2.zip` from the same release and add it where Claude Desktop lists your skills (Settings).

Ask for a LibKa document: Claude writes it with the skill, checks and builds it with the extension, and the files appear in the output folder.

**Without the extension**, add the server to `claude_desktop_config.json` (Settings, Developer, Edit Config):

```json
{
  "mcpServers": {
    "libka": { "command": "npx", "args": ["-y", "@libka/mcp@2.0.2"], "env": { "LIBKA_OUT": "/path/to/your/LibKa folder" } }
  }
}
```

On Windows, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "@libka/mcp@2.0.2"]`. Restart Claude Desktop afterwards.

## Claude in the browser

Upload `libka-author-skill-2.0.2.zip` (from [the release](https://github.com/aivigator-ai/open-libka-design-platform/releases/tag/v2.0.2)) where claude.ai lists your skills (Settings); skills need code execution to be turned on. Claude then writes LibKa documents in the chat, but it cannot run LibKa's checks there: build and check the result yourself, with `npx -y @libka/cli build <file.md>` or in LibKa Studio (`npx -y @libka/cli studio`).

## The Claude API and the Agent SDK

- **The skill:** upload the `libka-author` folder through the Skills API (Anthropic's documentation: "Agent Skills" in the Claude Developer Platform docs), or, with the Agent SDK, keep it in the project's `.claude/skills/` folder, where the SDK finds skills.
- **The server:** start it as a stdio MCP server where your code runs: command `npx`, arguments `-y @libka/mcp@2.0.2`. Set `LIBKA_OUT` to the folder for the outputs. Building needs Chrome on that machine; listing and checking do not.

## Other MCP clients

Most MCP clients take the same settings:

```json
{
  "mcpServers": {
    "libka": { "command": "npx", "args": ["-y", "@libka/mcp@2.0.2"], "env": { "LIBKA_OUT": "/path/to/your/LibKa folder" } }
  }
}
```

Set `LIBKA_OUT`: without it the outputs go to `./libka-out` under whatever folder the client starts the server in. Without a skill, point the client's model at the server's own guide: the resource `libka://guide`, and the prompt `convert-to-libka`.

## What the server does on your computer

- `libka_list_blocks`, `libka_get_block` and `libka_check` only read what they are given.
- `libka_build` writes the document and its outputs into the output folder (`LIBKA_OUT`, or `./libka-out` under the server's working folder); a file it is given is read where it is, and its outputs go to the output folder too. It starts Chrome to check and print, and the first build in a project makes the project's signing key in its `.libka/` folder, with a `.gitignore` that keeps the key out of git. The project is the nearest folder above the document with `.libka/`, else the nearest with `package.json` or `.git` ([signing keys](admin/signing-keys.md)).
- The server sends nothing anywhere of its own accord. `npx` downloads it from npm the first time; a page's Content Security Policy blocks anything the document links by web address (a picture, for example), and Guard reports that as a finding.
