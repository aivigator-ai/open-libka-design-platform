# @libka/tokens

The LibKa design tokens: W3C Design Tokens (DTCG 2025.10) with light, dark and high-contrast themes, generated into CSS custom properties, SCSS, and Tailwind themes. Every text, button and badge colour pair passes WCAG contrast gates when the tokens are built.

```bash
npm install @libka/tokens
```

| File | Import |
|---|---|
| CSS custom properties (`--lk-*`), all themes | `@libka/tokens/css` |
| SCSS variables | `@libka/tokens/scss` |
| Tailwind CSS v4 theme | `@libka/tokens/tailwind.css` |
| Tailwind CSS v3 preset (CommonJS) | `@libka/tokens/tailwind.config` |
| The DTCG source (`*.tokens.json`) and its resolver | `@libka/tokens/tokens/<name>.tokens.json`, `@libka/tokens/libka.resolver.json` |

```css
@import "@libka/tokens/css";
.note { color: var(--lk-text-primary); background: var(--lk-bg-canvas); }
```

Light is the default; `data-theme="dark"` on an element switches it and everything inside to dark, and `data-contrast="high"` or the reader's `prefers-contrast: more` setting to high contrast (7:1 text). Under `prefers-reduced-motion: reduce` the motion tokens become near zero. Version {{version}}; the documentation is in the repository: {{repository}}/blob/main/docs/tokens.md

Licence: Apache-2.0.
