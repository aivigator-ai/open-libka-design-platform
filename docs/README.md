# LibKa documentation

:::table{caption="The documents in this folder and what each one is"}

| Document | What it is |
|---|---|
| [getting-started.md](getting-started.md) | Install LibKa, start a project and build your first document |
| [ai-tools.md](ai-tools.md) | LibKa with AI tools: the Claude Code plugin, the Claude Desktop extension, the skill for claude.ai, the API and SDK, and any MCP client |
| [blocks.md](blocks.md) | Every block: its syntax, attributes, accessibility rules and what each output does with it. Generated from the block registry |
| [problem-codes.md](problem-codes.md) | Every problem `libka lint` and the build report, with its code and the fixes LibKa can apply. Generated |
| [design-system/manual.md](design-system/manual.md) | The LibKa design system: colour, typography, layout, motion, components, data visualisation and the rules for AI generation |
| [tokens.md](tokens.md) | How the DTCG token files become CSS, SCSS and Tailwind themes, and how the build checks them |
| [acr/libka-outputs.md](acr/libka-outputs.md) | The draft accessibility conformance report for the outputs LibKa builds (WCAG 2.2, EN 301 549) |
| [acr/studio.md](acr/studio.md) | The accessibility self-audit of LibKa Studio |
| [admin/](admin/README.md) | The maintainer guide: every tool LibKa uses, how to install, run, check and repair it |

:::

The live verification page of the tokens is [`libka-verification.html`](../libka-verification.html) in the repository root: open it in a browser to see every contrast and colour-blindness check computed from the current tokens.
