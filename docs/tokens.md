# Design tokens: how the token source becomes code

The single source of truth is the [W3C DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/) token files in `tokens/`. `generate.py` validates them and turns them into platform-ready files. This page explains the architecture; the main README explains the platform.

## The files

:::table{caption="The token source, the build script and the files it generates"}

| File | What it is | How it's used |
|---|---|---|
| `tokens/*.tokens.json` | The token source (DTCG 2025.10) | `primitive`, `semantic` (light values), `component`, `foundation` (type, space, motion, …), `theme-dark` (dark overrides), `theme-light-hc` and `theme-dark-hc` (high-contrast overrides, 7:1 text) |
| `libka.resolver.json` | DTCG Resolver 2025.10 document | Merges the sets in order and applies the `theme` modifier: `light` (default), `dark`, `light-high-contrast`, `dark-high-contrast` |
| `libka_tokens.py` | Loader and validator | Validates names, types, values, aliases and the resolver; fails the build on any violation |
| `governance/a2-profiles.json` | AI generation profiles (manual Appendix A2) | Source for the profiles in the manual; the build checks every token, theme and density they name |
| `fonts/` | Self-hosted web fonts | Fraunces, Inter, JetBrains Mono as variable WOFF2 (Latin + Latin Extended, 296 KB total; browsers load only the subsets a page uses), `libka-fonts.css` with the `@font-face` rules, OFL licenses in `fonts/licenses/`. Verified loading over `file://` in Chrome; a browser that blocks local font files falls back to the system fonts in the stack (serving the folder over HTTP avoids that) |
| `packages/`, `package.json`, `pnpm-workspace.yaml` | TypeScript workspace (pnpm, strict TypeScript, Vitest) | The document platform: blocks, model, renderers, Guard, PDF, CLI, MCP server; `@libka/contrast` holds the WCAG math the Python build also uses. See the map in the main README |
| `generate.py` | The build + validator script | Resolves every `ref`, fails on broken chains or failing text/button contrast, emits the outputs below, and rewrites the generated blocks: the CSS copy in the manual (section 14.1), the A2 profiles in the manual, and the token data in `libka-verification.html` |
| `libka-tokens.css` | Generated CSS custom properties | Drop into any project; `:root` = light, `[data-theme="dark"]` = dark |
| `libka-tokens.scss` | Generated SCSS variables | For Sass-based build systems |
| `libka.tailwind.css` | Generated Tailwind CSS v4 theme | `@import` it after `tailwindcss` and `libka-tokens.css`. Semantic colors only (default palette removed), named like the CSS variables (`bg-bg-canvas`, `text-text-primary`), plus LibKa type scale, spacing step, radii, shadows, breakpoints (`tablet:`, `desktop:`, `wide:`) and easings |
| `libka.tailwind.config.js` | Generated Tailwind CSS v3 extension | Merge into your `tailwind.config.js`. Semantic colors only: components use the semantic layer |

:::

## The core idea: tokens resolve, they don't repeat

Every component value is a **reference**, never a duplicated hex. Tokens follow the DTCG format: a typed `$value`, and aliases in curly braces.

```json
"accent":     { "$value": { "colorSpace": "srgb", "components": [0.0588, 0.5608, 0.6314], "hex": "#0F8FA1" } },
"background": { "$value": "{color.semantic.action.accent-strong}" }
```

Themes are not stored as pairs. `tokens/semantic.tokens.json` holds the light values, `tokens/theme-dark.tokens.json` declares only what changes in dark, and `libka.resolver.json` applies it when the `theme` modifier is `dark`. Aliases resolve after the theme is applied, so a component alias follows the theme automatically.

`libka_tokens.py` validates both themes on every build: names (no `.`, `{`, `}`), a known `$type` for every token, the value shape of each type (for example `px`/`rem` only for dimensions, hex matching the color components), alias targets, alias cycles and alias type matches. Any violation **stops the build** — a broken token can never ship silently.

A few CSS values have no DTCG equivalent: fluid `clamp()` sizes, `em` letter-spacing, the `72ch` text measure, CSS motion snippets and font stacks with their exact quoting. Those tokens keep a valid standard `$value` (for example the maximum fluid size in `rem`) and carry the exact CSS in `$extensions["org.libka"].css`, which the generators use.

## Resolution order (never skip a layer)

```
primitive  →  semantic  →  component  →  generated CSS/SCSS/Tailwind
#0F8FA1       action.accent  button.accent.bg   --lk-action-accent
```

A component token must reference a semantic token, never a primitive directly. The build does not enforce this stylistically, but the manual (Section 14.2) requires it, and the validator confirms the chain resolves.

## Running it

```bash
.venv/Scripts/python.exe generate.py     # Windows; .venv/bin/python on macOS and Linux
```

Output:
```
DTCG VALIDATION PASSED: …
GENERATED: libka-tokens.css, lk-bridge.css, libka-tokens.scss, libka.tailwind.css (v4), libka.tailwind.config.js (v3), manual 14.1 + A2, verification data, Word theme
  CSS custom properties defined: …
```

A non-zero exit code means a broken reference — treat it as a failed build.

## How a value flows end to end (worked example)

1. **Primitive** — `color.primitive.aqua.750` = `#056F7D` (`tokens/primitive.tokens.json`)
2. **Semantic** — `color.semantic.action.accent-strong` = `#056F7D` in `semantic.tokens.json`, overridden with `#20C7D9` in `theme-dark.tokens.json`
3. **Component** — `color.component.button.accent.background` = `{color.semantic.action.accent-strong}` (`component.tokens.json`)
4. **Generated CSS** — `--lk-action-accent-strong: #056F7D;` (light) / `#20C7D9;` (dark)
5. **In your UI** — `background: var(--lk-action-accent-strong);`

Change a semantic token once, and every component alias above it follows on the next build, in both themes. Semantic values are literal colors chosen from the primitive palette (they are not aliases of primitives), so a primitive change must be applied to the semantic values that use it.

## Adapting to a production setup

This pipeline is intentionally a set of small readable Python scripts so the logic is transparent. Because the source is standard DTCG with a standard resolver, other DTCG tools such as [Terrazzo](https://terrazzo.app) or [Style Dictionary](https://styledictionary.com) can read it, which opens up platform outputs for iOS, Android and more. LibKa does not test them: check a tool's support for the 2025.10 colour and dimension objects before relying on it. Switching runners is a separate decision; the token files stay the same.

## Dark-mode elevation (why dark shadows differ)

Light-mode shadows are ink-tinted (`rgb(17 23 35 / .07)`). On the dark canvas (`#111723`) those are nearly invisible, so dark mode uses pure-black shadows at higher opacity (`rgb(0 0 0 / .40)`) **plus** the existing surface-lightening (canvas → surface → elevated get progressively lighter). Elevation in dark mode is therefore communicated two ways at once: a visible cast shadow and a lighter surface. Without it, elevation would be invisible in dark mode.
