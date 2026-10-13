# LibKa Design System Manual
**Version 2.0.1** | 2026-10-13

---

What changed in each release is in the CHANGELOG. The token files in `tokens/` are the source of truth; this manual explains how to use them.

---

:::section[Part A — Core Manual]
:::

---

## 1. Overview

### 1.1 Purpose
The LibKa design system is the set of design tokens, rules and component styles that every LibKa output is built from: web pages, PDFs, slides, Word files and LibKa Studio. It is defined once, as W3C DTCG tokens in `tokens/`, and generated into CSS custom properties, SCSS and Tailwind themes, so any project can use it without LibKa's document tools.

### 1.2 What it covers

:::table{caption="The areas the system covers and what it defines for each"}

| Area | What the system defines |
|---|---|
| Colour | Primitive and semantic colours for light, dark and two high-contrast themes |
| Typography | Three font roles (brand serif, interface sans, monospace), a type scale, self-hosted fonts |
| Layout | Spacing, radius, elevation, grid, density, z-index, opacity and breakpoints |
| Motion | Durations, easings and presets, with reduced motion respected |
| Components | The styles of every LibKa block (`packages/render/src/components.css`), written with tokens only |
| Data visualisation | A colour-blind-checked palette with pattern fills |
| AI generation | Profiles that tell AI tools which tokens and densities to use (Appendix A2) |

:::

### 1.3 Properties the build enforces

:::table{caption="The properties the build enforces and how each is held"}

| Property | How it is held |
|---|---|
| Text contrast | Every text colour reaches 4.5:1 on every background it is used on, 7:1 in the high-contrast themes; the token build fails otherwise |
| Control contrast | Buttons, badges, the boundary of text fields and the focus ring reach 3:1 or more in every theme; the token build fails otherwise |
| Themes | Every semantic colour has a light, dark, light high-contrast and dark high-contrast value |
| Tokens only | Block, page and slide styles use only `--lk-*` custom properties; a test rejects raw colour values |
| Motion | Under reduced motion, transitions and animations finish at once |
| Neutral | No client or product branding; a brand is applied by changing tokens |

:::

### 1.4 Avoid
- colour as the only carrier of meaning
- gradients and decorative effects without a function
- low contrast, also in disabled-looking states that are not disabled
- values outside the token set
- marketing language in documentation

---

## 2. Design principles

:::table{caption="The design principles and the rule behind each"}

| Principle | Rule |
|---|---|
| Clarity first | Layout and hierarchy must be readable at a glance |
| Calm structure | Precise grids with quiet surfaces and generous spacing |
| Token discipline | Use tokens before custom styling, always |
| Controlled accent | Accent colours support orientation and actions, not decoration |
| Accessibility first | Contrast and focus visibility are requirements, not options |
| Low noise | Short copy, clean screens |
| Checked output | Anything generated, by a person or an AI, passes the same checks |
| Semantic intent | Every token carries a meaning, not just a value |

:::

---

## 3. Visual direction

### 3.1 Character
Calm and readable first: neutral surfaces, one accent colour for actions, generous spacing. Precise where data is shown: tables, values and code in a monospace face. The serif face is kept for titles and brand moments.

### 3.2 Visual signature

:::table{caption="The elements of the visual signature and their definitions"}

| Element | Definition |
|---|---|
| Logo symbol | Single glowing dot |
| Base surfaces | Soft light neutrals (light) or deep ink surfaces (dark) |
| Accent logic | Aqua for system intelligence and actions, apricot for focus, iris for AI/secondary state |
| Layout | Modular grid, generous spacing, low visual noise |
| Typography | Serif for brand moments, sans for UI, mono for system values |

:::

---

## 4. Color system

### 4.1 Palette intent
The palette is built for current and near-future digital systems. Calm, modern, user-friendly. Bright accents carry meaning, not decoration. Every accent has a verified accessible text variant.

### 4.2 Primitive colors

:::table{caption="Primitive color tokens with their names, hex values and usage"}

| Token | Name | HEX | Usage |
|---|---|---:|---|
| `color.ink.950` | Deep Ink | `#111723` | Main dark background |
| `color.ink.900` | Quiet Ink | `#1A2130` | Text, dark cards |
| `color.graphite.800` | Slate Graphite | `#2A3345` | Secondary dark tone |
| `color.cloud.50` | Soft Cloud | `#F6F7F9` | Main light background |
| `color.pearl.100` | Pale Pearl | `#ECEFF3` | Panels, subtle surfaces |
| `color.mist.200` | Mist Line | `#D7DDE7` | Borders (light mode) |
| `color.aqua.500` | Clear Aqua | `#20C7D9` | Bright accent surface/icon |
| `color.aqua.650` | Deep Aqua | `#0F8FA1` | Accent action, icons, borders (3:1 UI; not for small text) |
| `color.aqua.750` | Ink Aqua | `#056F7D` | Accent text: links, badges, labels (≥4.5:1) |
| `color.apricot.500` | Soft Apricot | `#F0B35E` | Warm focus and highlight |
| `color.apricot.700` | Grounded Apricot | `#A66B1F` | Warning UI, large text (3:1) |
| `color.apricot.800` | Deep Apricot | `#8F5804` | Warning text (≥4.5:1) |
| `color.iris.500` | Soft Iris | `#7A7CFF` | AI/secondary state surface |
| `color.iris.700` | Deep Iris | `#4C4ECC` | Accessible iris text |
| `color.coral.600` | Calm Coral | `#D8576B` | Error and destructive states (UI) |
| `color.coral.750` | Deep Coral | `#B4364E` | Error text (≥4.5:1) |
| `color.mint.650` | Verified Mint | `#2E8B65` | Success (UI) |
| `color.mint.800` | Forest Mint | `#16633F` | Success text (≥4.5:1); viz series 4 |

:::

**Note on Iris:** Iris carries the "AI assistant / secondary state" semantic role. `iris.500` is surface and icon use only. `iris.700` is the accessible text/action variant (contrast ratio 6.42:1 on white, AA). Iris must not be used interchangeably with Aqua — Aqua is system navigation and primary actions, Iris is AI signals and secondary state.

### 4.3 Semantic colors

:::table{caption="Semantic color tokens with their light and dark values and use"}

| Semantic token | Light value | Dark value | Use |
|---|---:|---:|---|
| `color.bg.canvas` | `#F6F7F9` | `#111723` | Page background |
| `color.bg.surface` | `#FFFFFF` | `#1A2130` | Cards and panels |
| `color.bg.elevated` | `#F1F4F7` | `#2A3345` | Raised surfaces |
| `color.text.primary` | `#1A2130` | `#F6F7F9` | Main text |
| `color.text.secondary` | `#556074` | `#C6CDD8` | Supporting text |
| `color.text.muted` | `#5F6A7B` | `#95A0B2` | Metadata (≥4.5:1) |
| `color.text.accent` | `#056F7D` | `#20C7D9` | Links and accent-colored text |
| `color.text.info` | `#056F7D` | `#20C7D9` | Info text, e.g. callout titles |
| `color.text.success` | `#16633F` | `#67D5AA` | Success text |
| `color.text.warning` | `#8F5804` | `#F0B35E` | Warning text |
| `color.text.error` | `#B4364E` | `#FF9FAE` | Error text, validation messages |
| `color.border.default` | `#D7DDE7` | `#384255` | Standard border |
| `color.border.strong` | `#B0B9C8` | `#4A5568` | Emphasis border |
| `color.action.primary` | `#111723` | `#F6F7F9` | Main action |
| `color.action.accent` | `#0F8FA1` | `#20C7D9` | Accent action surfaces, icons, borders (text: `color.text.accent`) |
| `color.action.iris` | `#4C4ECC` | `#7A7CFF` | AI/secondary action |
| `color.action.accent-strong` | `#056F7D` | `#20C7D9` | Fill of accent controls that carry a label |
| `color.action.destructive` | `#B4364E` | `#FF9FAE` | Fill of destructive controls |
| `color.action.on-accent` | `#FFFFFF` | `#111723` | Label on `action.accent-strong` |
| `color.action.on-iris` | `#FFFFFF` | `#111723` | Label on `action.iris` |
| `color.action.on-destructive` | `#FFFFFF` | `#111723` | Label on `action.destructive` |
| `color.focus.ring` | `#B87A22` | `#F0B35E` | Focus ring (one value per theme, both verified ≥3:1) |
| `color.status.success` | `#2E8B65` | `#67D5AA` | Success |
| `color.status.warning` | `#A66B1F` | `#F0B35E` | Warning |
| `color.status.error` | `#D8576B` | `#FF9FAE` | Error |
| `color.status.info` | `#0F8FA1` | `#20C7D9` | Info |
| `color.status.ai` | `#4C4ECC` | `#7A7CFF` | AI state indicator |

:::

### 4.4 Component-level color tokens

:::table{caption="Component-level color tokens, what they resolve to and in which mode"}

| Component token | Resolves to | Mode |
|---|---|---|
| `button.primary.background` | `color.action.primary` | semantic |
| `button.primary.text` | `color.bg.canvas` | semantic |
| `button.primary.hover` | `color.graphite.800` / `color.pearl.100` | primitive |
| `button.accent.background` | `color.action.accent-strong` | semantic |
| `button.accent.text` | `color.action.on-accent` | semantic |
| `button.iris.text` | `color.action.on-iris` | semantic |
| `button.secondary.background` | `color.bg.surface` | semantic |
| `button.secondary.border` | `color.border.default` | semantic |
| `button.destructive.background` | `color.action.destructive` | semantic |
| `button.destructive.text` | `color.action.on-destructive` | semantic |
| `input.background` | `color.bg.surface` | semantic |
| `input.border.default` | `color.border.default` | semantic |
| `input.border.focus` | `color.action.accent` | semantic |
| `input.border.error` | `color.status.error` | semantic |
| `input.text` | `color.text.primary` | semantic |
| `input.placeholder` | `color.text.muted` | semantic |
| `card.background` | `color.bg.surface` | semantic |
| `card.border` | `color.border.default` | semantic |
| `card.shadow` | `shadow.2` | elevation |
| `badge.success.background` | `color.status.success` at 12% opacity | derived |
| `badge.success.text` | `color.text.success` | semantic |
| `nav.item.active.background` | `color.action.accent` at 10% | derived |
| `nav.item.active.text` | `color.text.primary` | semantic |
| `nav.item.hover.background` | `color.bg.elevated` | semantic |

:::

### 4.5 Contrast rules

:::table{caption="Contrast rules and their requirements"}

| Rule | Requirement |
|---|---|
| Small text on light | Minimum 4.5:1. Use `color.text.*` tokens (`ink.900`, `aqua.750`, `apricot.800`, `coral.750`, `mint.800`, `iris.700`) |
| Colored text | Use `color.text.accent/info/success/warning/error`. They hold 4.5:1 on canvas, surface, elevated and on a tint of their own family up to 12%. `color.action.*` and `color.status.*` are UI colors (3:1) for icons, borders and fills, never for text below large size |
| Small text on dark | Minimum 4.5:1. Use `cloud.50` or equivalent semantic light value |
| Large text / UI components | Minimum 3:1 |
| Bright accents (`aqua.500`, `iris.500`, `apricot.500`) | Surface, icons, highlights only — never for text |
| Labels on filled buttons | Minimum 4.5:1 (a 14px/700 label is not large text). Use `color.action.on-*` on `action.accent-strong`, `action.iris` or `action.destructive`: white on the darker light-theme fills, ink on the bright dark-theme fills. White on `aqua.650` is 3.84:1 and fails; apricot fills always take dark text |
| Focus ring | Light uses grounded apricot #B87A22 (3.35:1 on light canvas), dark uses #F0B35E (9.67:1). A single bright apricot cannot pass on near-white — the theme split is required, verified by computation |

:::


### 4.6 High contrast

A high-contrast palette exists for both themes. It is stricter than AA: every text color reaches **7:1 (WCAG AAA)** on every background and on a 12% tint of its own color, button labels reach 7:1 on their fills, and UI colors (borders, icons, focus ring) reach 4.5:1. The build checks all of it and fails otherwise. In the resolver these are the theme contexts `light-high-contrast` and `dark-high-contrast`; in CSS, `data-contrast="high"` or the system preference `prefers-contrast: more` (section 14.1). In high contrast a brand profile keeps its fonts, but its colors are not applied.

Generated from the token files by `generate.py`:

<!-- BEGIN GENERATED: hc-table -->
:::table{caption="The high-contrast value of every semantic color in the light and dark themes"}

| Semantic token | Light high contrast | Dark high contrast |
|---|---:|---:|
| `color.semantic.bg.canvas` | `#FFFFFF` | `#000000` |
| `color.semantic.bg.surface` | `#FFFFFF` | `#0D0D0D` |
| `color.semantic.bg.elevated` | `#F0F0F0` | `#1F1F1F` |
| `color.semantic.text.primary` | `#000000` | `#FFFFFF` |
| `color.semantic.text.secondary` | `#1A1A1A` | `#F2F2F2` |
| `color.semantic.text.muted` | `#333333` | `#D9D9D9` |
| `color.semantic.text.accent` | `#004A54` | `#37D3E5` |
| `color.semantic.text.info` | `#004A54` | `#37D3E5` |
| `color.semantic.text.success` | `#024D2E` | `#67D5AA` |
| `color.semantic.text.warning` | `#623A01` | `#F3B661` |
| `color.semantic.text.error` | `#86012C` | `#FFAAB6` |
| `color.semantic.text.ai` | `#352DAA` | `#B6BEFF` |
| `color.semantic.border.default` | `#000000` | `#FFFFFF` |
| `color.semantic.border.strong` | `#000000` | `#FFFFFF` |
| `color.semantic.border.control` | `#000000` | `#FFFFFF` |
| `color.semantic.action.primary` | `#000000` | `#FFFFFF` |
| `color.semantic.action.accent` | `#004A54` | `#37D3E5` |
| `color.semantic.action.iris` | `#352DAA` | `#B6BEFF` |
| `color.semantic.action.accent-strong` | `#004A54` | `#37D3E5` |
| `color.semantic.action.destructive` | `#86012C` | `#FFAAB6` |
| `color.semantic.action.on-accent` | `#FFFFFF` | `#000000` |
| `color.semantic.action.on-iris` | `#FFFFFF` | `#000000` |
| `color.semantic.action.on-destructive` | `#FFFFFF` | `#000000` |
| `color.semantic.focus.ring` | `#965F05` | `#F0B35E` |
| `color.semantic.status.success` | `#024D2E` | `#67D5AA` |
| `color.semantic.status.warning` | `#623A01` | `#F3B661` |
| `color.semantic.status.error` | `#86012C` | `#FFAAB6` |
| `color.semantic.status.info` | `#004A54` | `#37D3E5` |
| `color.semantic.status.ai` | `#352DAA` | `#B6BEFF` |

:::
<!-- END GENERATED: hc-table -->

---

## 5. Typography

### 5.1 Font roles

:::table{caption="Font roles and their use"}

| Role | Use |
|---|---|
| Brand serif | Hero, brand title, section moments, editorial headers |
| UI sans | Navigation, body text, inputs, labels, all components |
| Mono | Tokens, code, measurements, system syntax |

:::

### 5.2 Recommended stack

```css
--font-brand: "Fraunces", "Instrument Serif", Georgia, serif;
--font-ui: "Inter", "Manrope", system-ui, sans-serif;
--font-mono: "JetBrains Mono", Consolas, monospace;
```

The three families are self-hosted in `fonts/` (variable WOFF2, Latin and Latin Extended subsets, which cover Czech) under the SIL Open Font License 1.1, with the licenses in `fonts/licenses/`. Pages link `fonts/libka-fonts.css`; no page requests fonts from a third party. Where the files are not reachable (a copied single file, or a browser that blocks local font files), the system fonts in the stack take over.

### 5.3 Type scale

:::table{caption="The type scale: size, line height, weight, letter spacing and use of each token"}

| Token | Size | Line-height | Weight | Letter-spacing | Use |
|---|---:|---:|---:|---:|---|
| `type.display.xl` | `clamp(3.8rem, 8vw, 7rem)` | 0.96 | 650 | −0.04em | Main hero title |
| `type.display.lg` | `clamp(3rem, 6vw, 5rem)` | 0.98 | 650 | −0.035em | Section hero |
| `type.heading.h1` | `clamp(2.4rem, 5vw, 3.8rem)` | 1.02 | 700 | −0.03em | Main page title |
| `type.heading.h2` | `clamp(1.9rem, 4vw, 2.8rem)` | 1.08 | 650 | −0.025em | Main section heading |
| `type.heading.h3` | `1.4rem` | 1.2 | 650 | −0.02em | Card title |
| `type.heading.h4` | `1.125rem` | 1.3 | 700 | −0.01em | Sub-section label |
| `type.body.lg` | `1.125rem` | 1.7 | 450 | 0 | Lead paragraph |
| `type.body.md` | `1rem` | 1.6 | 450 | 0 | Standard body |
| `type.body.sm` | `0.875rem` | 1.5 | 450 | 0 | Secondary body |
| `type.caption` | `0.75rem` | 1.4 | 600 | +0.06em | Labels, metadata |
| `type.overline` | `0.6875rem` | 1.4 | 800 | +0.16em | Kicker, section label |
| `type.code` | `0.8125rem` | 1.5 | 500 | 0 | System syntax |

:::

**Rules:**
- Brand serif (`Fraunces`) is used for `type.display.*`, `type.heading.h1`, `type.heading.h2` and brand moments only.
- UI sans is used for all other tokens.
- Mono is used exclusively for `type.code` and system value display.
- Optical size (`opsz`) must be enabled for Fraunces — use `font-variation-settings: "opsz" 144` at display sizes, `"opsz" 36` at heading sizes.
- `type.overline` is always uppercase via `text-transform: uppercase`.

---

## 6. Layout tokens

### 6.1 Spacing

:::table{caption="Spacing tokens, their values and typical use"}

| Token | Value | Typical use |
|---|---:|---|
| `space.0.5` | 2px | Micro gap |
| `space.1` | 4px | Inline gap, icon gap |
| `space.2` | 8px | Tight component padding |
| `space.3` | 12px | Compact component padding |
| `space.4` | 16px | Standard component padding |
| `space.5` | 20px | Card inner padding |
| `space.6` | 24px | Section sub-gap |
| `space.8` | 32px | Component gap |
| `space.10` | 40px | Section gap (mobile) |
| `space.12` | 48px | Section gap |
| `space.16` | 64px | Section padding |
| `space.20` | 80px | Large section gap |
| `space.24` | 96px | Hero section padding |
| `space.32` | 128px | Full-bleed section |

:::

### 6.2 Radius

:::table{caption="Radius tokens, their values and use"}

| Token | Value | Use |
|---|---:|---|
| `radius.xs` | 6px | Tags, inline chips |
| `radius.sm` | 10px | Controls |
| `radius.md` | 16px | Inputs, buttons |
| `radius.lg` | 24px | Cards |
| `radius.xl` | 32px | Large panels |
| `radius.2xl` | 40px | Hero surfaces |
| `radius.full` | 999px | Pills, status markers, dot logo |

:::

### 6.3 Elevation

:::table{caption="Elevation tokens, their shadow values and use"}

| Token | Value | Use |
|---|---|---|
| `shadow.0` | `none` | Flat surfaces |
| `shadow.1` | `0 1px 2px rgb(17 23 35 / .06)` | Inputs, small controls |
| `shadow.2` | `0 4px 16px rgb(17 23 35 / .07), 0 1px 3px rgb(17 23 35 / .05)` | Cards |
| `shadow.3` | `0 20px 60px rgb(17 23 35 / .14)` | Dialogs, modals |
| `shadow.4` | `0 32px 80px rgb(17 23 35 / .20)` | Drawer, overlay panels |
| `shadow.glow.aqua` | `0 0 36px rgb(32 199 217 / .18)` | Dot glow, controlled highlight |
| `shadow.glow.iris` | `0 0 28px rgb(122 124 255 / .16)` | AI state glow |

:::

**Dark-mode elevation.** Ink-tinted shadows are nearly invisible on the dark canvas (`#111723`). Dark mode therefore uses pure-black shadows at higher opacity, communicating depth two ways at once: a visible cast shadow plus the existing surface lightening (canvas → surface → elevated grow progressively lighter).

:::table{caption="Elevation tokens with their light and dark shadow values"}

| Token | Light value | Dark value |
|---|---|---|
| `shadow.1` | `0 1px 2px rgb(17 23 35 / .06)` | `0 1px 2px rgb(0 0 0 / .30)` |
| `shadow.2` | `0 4px 16px rgb(17 23 35 / .07), 0 1px 3px rgb(17 23 35 / .05)` | `0 4px 16px rgb(0 0 0 / .40), 0 1px 3px rgb(0 0 0 / .30)` |
| `shadow.3` | `0 20px 60px rgb(17 23 35 / .14)` | `0 20px 60px rgb(0 0 0 / .55)` |
| `shadow.4` | `0 32px 80px rgb(17 23 35 / .20)` | `0 32px 80px rgb(0 0 0 / .65)` |

:::

**Rule:** Elevation must increase with logical layer depth. Flat → card → dialog → drawer. Never use a higher shadow on a lower layer.

### 6.4 Grid

:::table{caption="Grid columns, gutter and margin for each context"}

| Context | Columns | Gutter | Margin |
|---|---:|---:|---:|
| Mobile (< 640px) | 4 | 16px | 16px |
| Tablet (640–1024px) | 8 | 20px | 24px |
| Desktop (1024–1440px) | 12 | 24px | 40px |
| Wide (> 1440px) | 12 | 32px | max-width 1440px centered |

:::

**Max content width:** `1440px`. **Max text measure:** `72ch`.

### 6.5 Density
Density is set by tokens, in three modes:

:::table{caption="Density modes with their row height, control padding, stack gap and font scale"}

| Density | Row height | Control padding | Stack gap | Font scale |
|---|---:|---:|---:|---:|
| `density.comfortable` | 44px | 12px / 16px | 16px | 1.00 |
| `density.compact` | 36px | 8px / 12px | 8px | 0.95 |
| `density.spacious` | 56px | 16px / 20px | 24px | 1.05 |

:::

Comfortable is the default. Compact must still respect the 44px minimum touch target for primary interactive controls even though rows compress.

### 6.6 Z-index scale
Every layer has a named place in the stacking order.

:::table{caption="Z-index tokens, their values and the layer each is for"}

| Token | Value | Layer |
|---|---:|---|
| `zIndex.base` | 0 | Page content |
| `zIndex.raised` | 10 | Cards on hover |
| `zIndex.sticky` | 20 | Sticky topbar/header |
| `zIndex.dropdown` | 30 | Menus, selects |
| `zIndex.overlay` | 40 | Scrims |
| `zIndex.drawer` | 50 | Side drawer |
| `zIndex.modal` | 60 | Dialogs |
| `zIndex.toast` | 70 | Toasts |
| `zIndex.tooltip` | 80 | Tooltips (always on top) |

:::

### 6.7 Opacity scale
:::table{caption="Opacity tokens, their values and use"}

| Token | Value | Use |
|---|---:|---|
| `opacity.disabled` | 0.45 | Disabled controls |
| `opacity.muted` | 0.65 | De-emphasized content |
| `opacity.overlay` | 0.48 | Modal scrim |
| `opacity.hover` | 0.08 | Tint-on-hover surfaces |
| `opacity.subtle` | 0.05 | Faint row hover, AI tint |
| `opacity.scrim` | 0.60 | Drawer scrim |

:::

### 6.8 Breakpoints
:::table{caption="Breakpoint tokens and their values"}

| Token | Value |
|---|---:|
| `breakpoint.mobile` | 0px |
| `breakpoint.tablet` | 640px |
| `breakpoint.desktop` | 1024px |
| `breakpoint.wide` | 1440px |
| `breakpoint.maxContentWidth` | 1440px |
| `breakpoint.maxTextMeasure` | 72ch |

:::

---

## 7. Motion

### 7.1 Duration tokens

:::table{caption="Duration tokens, their values and use"}

| Token | Value | Use |
|---|---:|---|
| `motion.duration.instant` | 80ms | State toggle, checkbox |
| `motion.duration.fast` | 160ms | Hover, focus ring |
| `motion.duration.base` | 240ms | Component transition |
| `motion.duration.slow` | 480ms | Section reveal, page enter |
| `motion.duration.crawl` | 720ms | Hero entrance, onboarding |

:::

### 7.2 Easing tokens

:::table{caption="Easing tokens, their values and use"}

| Token | Value | Use |
|---|---|---|
| `motion.ease.standard` | `cubic-bezier(.2,.8,.2,1)` | Standard transitions |
| `motion.ease.soft` | `cubic-bezier(.16,1,.3,1)` | Premium reveal, card lift |
| `motion.ease.sharp` | `cubic-bezier(.4,0,.2,1)` | Data updates, state changes |
| `motion.ease.linear` | `linear` | Progress bars, loading |

:::

### 7.3 Motion presets
Named presets so "functional motion only" has reference implementations.

:::table{caption="Motion presets: what each animates from and to, its duration and easing"}

| Preset | From → To | Duration | Ease |
|---|---|---|---|
| `motion.preset.fade.in` | opacity 0 → 1 | base | standard |
| `motion.preset.rise.in` | opacity 0 + translateY(8px) → settled | slow | soft |
| `motion.preset.lift.hover` | → translateY(−2px) | fast | standard |
| `motion.preset.drawer.in` | translateX(100%) → 0 | slow | soft |
| `motion.preset.modal.in` | opacity 0 + scale(.98) → 1 | base | soft |

:::

Under `prefers-reduced-motion`, only `fade.in` opacity is preserved; all transform-based presets resolve instantly.

### 7.4 Motion choreography rules

1. **Functional only.** Every animated element must help the user understand what changed or where to look next.
2. **One entrance per viewport.** Don't animate more than 3 elements simultaneously on initial load.
3. **Stagger correctly.** Stagger delay must be `motion.duration.instant` (80ms) maximum between sibling items.
4. **No loops by default.** Looping animations are forbidden unless they carry live status meaning (e.g. loading spinner, pulse on active connection).
5. **Reduced motion.** Under `prefers-reduced-motion: reduce`, the tokens make every transition and animation finish at once (0.01 ms), so nothing moves.
6. **Hover lift.** Cards and interactive surfaces may use `translateY(-2px)` on hover. Maximum lift is 4px.
7. **Focus transitions.** Focus ring appearance must use `motion.duration.fast` only — never instant, never slow.

### 7.5 Forbidden motion
- Parallax scrolling backgrounds
- Spinning logos or brand marks
- Bounce or elastic easing on functional UI
- Full-page transition animations
- Auto-playing carousels or slideshows

---

## 8. Icons

### 8.1 Icon style rules
- Use outline/stroke icons only. No filled solid icons in UI.
- Stroke weight: `1.5px` at 16px, `1.75px` at 20px, `2px` at 24px+.
- Recommended library: Lucide, Phosphor (regular weight), or equivalent outline set.
- Custom icons must follow the same stroke weight and corner radius as system icons.
- No decorative icons. Every icon must serve a labeling, navigation, status, or action function.

### 8.2 Icon size tokens

:::table{caption="Icon size tokens, their values and use"}

| Token | Value | Use |
|---|---:|---|
| `icon.size.xs` | 12px | Inline tag, badge decoration |
| `icon.size.sm` | 16px | Input prefix/suffix, caption |
| `icon.size.md` | 20px | Button icon, nav item |
| `icon.size.lg` | 24px | Card header, section marker |
| `icon.size.xl` | 32px | Feature icon, empty state |
| `icon.size.2xl` | 48px | Hero illustration icon |

:::

### 8.3 Icon color tokens

:::table{caption="Icon color tokens, what they resolve to and their use"}

| Token | Resolves to | Use |
|---|---|---|
| `icon.primary` | `color.text.primary` | Default icon |
| `icon.secondary` | `color.text.secondary` | Supporting icon |
| `icon.muted` | `color.text.muted` | Decorative or disabled |
| `icon.on.dark` | `color.cloud.50` | Icon on dark surface |
| `icon.accent` | `color.action.accent` | Action icon |
| `icon.ai` | `color.action.iris` | AI feature icon |
| `icon.status.success` | `color.status.success` | Success indicator |
| `icon.status.warning` | `color.status.warning` | Warning indicator |
| `icon.status.error` | `color.status.error` | Error indicator |
| `icon.status.info` | `color.status.info` | Info indicator |

:::

### 8.4 Forbidden icon patterns
- Emoji as UI icons
- Raster icon images (.png, .jpg) — use SVG only
- Icons without accessible labels (`aria-label` or adjacent visible text)
- Icons that visually resemble AI tropes (sparkles, neural networks, robot faces)
- Mixing icon libraries within one product surface

---

## 9. Logo system

### 9.1 Symbol
The LibKa symbol is a **single glowing dot**.

### 9.2 Meaning

:::table{caption="What each property of the logo symbol stands for"}

| Property | Definition |
|---|---|
| Dot | Point of focus |
| Glow | Active state / signal |
| Minimal form | Neutral and reusable |

:::

### 9.3 Usage rules
- Use the dot alone or with the wordmark.
- Keep the glow subtle — `shadow.glow.aqua` token only.
- Do not add frames, diamonds, AI sparkles, rings or extra geometry.
- Keep enough clear space: minimum 1× dot diameter on all sides.
- The wordmark uses `type.heading.h1` weight (700) in Fraunces.

### 9.4 Minimum size

:::table{caption="The minimum size of the logo for each use"}

| Use | Minimum |
|---|---:|
| Dot icon | 10px |
| Navigation mark | 12–16px |
| App mark | 24px |
| Print minimum | 8mm |

:::

### 9.5 Forbidden logo treatments
- Gradient applied to the dot
- Drop shadow on the wordmark
- Outlined or hollow dot
- Dot in any color other than `color.aqua.500` (default) or `color.cloud.50` (dark surface)

---

## 10. Component rules

### 10.1 Buttons

:::table{caption="Button variants and when to use each"}

| Variant | Use |
|---|---|
| Primary | Main action |
| Accent | Secondary highlight or exploration |
| Secondary | Alternative action |
| Tertiary | Low-emphasis action |
| Destructive | Removal or irreversible action |
| Ghost | Inline action in dense contexts |

:::

**Rules:**
- One primary action per decision area.
- Use verb-based labels.
- Focus ring must remain visible in all themes.
- Minimum size: `44px` height, `44px` width on touch targets.
- Loading state: replace label with spinner, disable interaction, preserve button size.
- Icon buttons must have `aria-label`.

**States required:** default, hover, active/pressed, focus, disabled, loading.

### 10.2 Inputs

**Required:**
- Visible label above the input (never placeholder-only).
- Visible focus state using `input.border.focus`.
- Helper text below for guidance.
- Clear error state with `input.border.error` + error message.
- Minimum 44px touch target.
- Character counter where limits apply.

**States required:** default, hover, focus, filled, error, disabled, read-only.

### 10.3 Cards

:::table{caption="Card types and when to use each"}

| Type | Use |
|---|---|
| Standard | Grouped content |
| Insight | Metric or signal |
| Decision | Choice set |
| System | Technical content |
| AI | AI-generated or AI-assisted content (uses iris tint) |

:::

**Rules:**
- Cards are containers, not decoration.
- Prefer `card.border` + `card.shadow` over heavy effects.
- Use accent glow only when semantically justified (active state, live data).
- AI cards must carry a visible AI indicator (iris accent + `icon.ai`).

### 10.4 Table

**Structure:** thead, tbody, optional tfoot. All rows must be keyboard navigable.

**Tokens:**
- `table.header.background`: `color.bg.elevated`
- `table.header.text`: `color.text.primary` at 700 weight
- `table.row.default`: `color.bg.surface`
- `table.row.alternate`: `color.bg.elevated` (optional zebra)
- `table.row.hover`: `color.action.accent` at 5% opacity
- `table.row.selected`: `color.action.accent` at 10% opacity
- `table.border`: `color.border.default`
- `table.cell.padding`: `space.3` vertical, `space.4` horizontal

**Rules:** Always include a visible column header. Sort indicators must use `icon.secondary`. Sticky first column and sticky header are allowed. Maximum visible columns before horizontal scroll: 6 on desktop.

**Accessibility (mandatory).** Tables must be real `<table>` elements — never CSS-grid `<div>`s styled to look like tables. Required:
- `<thead>` with `<th scope="col">` for every column header.
- `<th scope="row">` for the row's identifying cell where one exists.
- Selectable rows carry `aria-selected="true|false"` and are keyboard focusable (`tabindex="0"`), supporting Arrow Up/Down to move and Enter/Space to select.
- Row-level action buttons must stop event propagation so activating them does not also toggle row selection.

This rule exists because a table built from `<div>` grids can look right and still be invisible to assistive technology.

### 10.5 Navigation (sidebar + topbar)

**Sidebar tokens:**
- `sidebar.background`: `color.bg.surface` with `backdrop-filter: blur(18px)`
- `sidebar.border`: `color.border.default`
- `sidebar.item.active`: `nav.item.active.background` / `nav.item.active.text`
- `sidebar.item.hover`: `nav.item.hover.background`
- `sidebar.width`: 280px (desktop), collapsible to 64px (icon-only)

**Topbar tokens:**
- `topbar.background`: `color.bg.canvas` at 86% opacity with blur
- `topbar.border`: `color.border.default`
- `topbar.height`: 56px
- `topbar.z-index`: 20

**Rules:**
- Navigation must always answer: Where am I? What can I do? What is important now?
- Active item must be visually distinct from all other states.
- Mobile navigation must convert to bottom nav or hamburger drawer.

### 10.6 Modal and drawer

**Modal:**
- `modal.background`: `color.bg.surface`
- `modal.overlay`: `rgb(0 0 0 / 0.48)`
- `modal.border-radius`: `radius.xl`
- `modal.shadow`: `shadow.3`
- `modal.max-width`: 560px (small), 720px (medium), 960px (large)
- Opens with `motion.duration.base` + `motion.ease.soft`

**Drawer:**
- `drawer.background`: `color.bg.surface`
- `drawer.shadow`: `shadow.4`
- `drawer.width`: 400px (default), 560px (wide)
- Slides in from right with `motion.duration.slow` + `motion.ease.soft`

**Rules for both:**
- Must trap keyboard focus while open.
- Must close on `Escape`.
- Overlay click closes modal; drawer may require explicit close button.
- Must have `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.

### 10.7 Feedback patterns

:::table{caption="Feedback patterns and the rule for each"}

| Pattern | Rule |
|---|---|
| Alert | Persistent, contextual, inline |
| Toast | 3–5 second auto-dismiss, bottom-center |
| Tooltip | Non-critical information only, 280ms delay |
| Empty state | Title + description + one action |
| Loading skeleton | Match layout shape, 1.5s shimmer cycle |
| Progress | Determinate where possible, show percentage |
| Error | Specific, human, recoverable — never "Something went wrong" |

:::

---

## 11. Data visualization

### 11.1 Chart color sequence
Use this order when assigning colors to multi-series charts. Never assign colors arbitrarily.

:::table{caption="The order of chart series colors, with their tokens, hex values, names and pattern fills"}

| Order | Token | Hex | Name | Pattern fill |
|---|---|---:|---|---|
| 1 | `viz.series.1` | `#0F8FA1` | Deep Aqua | solid |
| 2 | `viz.series.2` | `#7A7CFF` | Soft Iris | diagonal lines |
| 3 | `viz.series.3` | `#F0B35E` | Soft Apricot | dots |
| 4 | `viz.series.4` | `#16633F` | Forest Mint | cross-hatch |
| 5 | `viz.series.5` | `#D8576B` | Calm Coral | horizontal lines |
| 6 | `viz.series.6` | `#B8C0CC` | Light Slate | vertical lines |

:::

**Colorblind verification.** This palette and ordering were verified by simulating deuteranopia, protanopia and tritanopia and measuring CIE76 ΔE between every pair. Worst-case ΔE = 17.1 (threshold 15). That is why series 4 is the darker forest mint and series 6 the lighter slate: with plain mint and gray, aqua and gray fall to ΔE 3.8 under protanopia.

**Rule:** Hue is never the only encoding. Pattern fills are mandatory for any chart with 4+ series and for all print output. Series 5 may resemble the error status color — only use it for data when no status meaning is present on the same screen.

### 11.2 Structural tokens

:::table{caption="Chart structural tokens, their values and use"}

| Token | Value | Use |
|---|---|---|
| `viz.axis.color` | `color.border.default` | Axis line and tick |
| `viz.axis.label` | `color.text.muted` | Axis text |
| `viz.grid.color` | light `rgb(215 221 231 / .60)` · dark `rgb(56 66 85 / .60)` | Grid line (themed) |
| `viz.tooltip.background` | `color.ink.950` | Tooltip fill |
| `viz.tooltip.text` | `color.cloud.50` | Tooltip label |
| `viz.tooltip.radius` | `radius.md` | Tooltip shape |
| `viz.highlight.stroke` | `color.action.accent` | Active/hover series |

:::

### 11.3 Data density

:::table{caption="Data density levels and the rule for each"}

| Density | Rule |
|---|---|
| Comfortable | 8+ data points: labels on hover only |
| Compact | 4–7 data points: direct labels allowed |
| Sparse | 1–3 data points: always direct-labeled |

:::

### 11.4 Chart type rules

:::table{caption="Chart types: when to use and when to avoid each"}

| Chart type | Use | Avoid |
|---|---|---|
| Bar (vertical) | Comparison, ranking | Time series with many points |
| Bar (horizontal) | Long labels, ranking | Fewer than 3 items |
| Line | Trend, time series | Non-continuous data |
| Area | Cumulative trend | Multiple overlapping series |
| Donut | Part of whole (max 5 slices) | More than 6 slices |
| Scatter | Correlation | Single variable |

:::

### 11.5 Forbidden visualization patterns
- Pie charts with more than 6 slices
- 3D charts of any type
- Dual Y-axis without explicit explanation
- Truncated Y-axis that exaggerates differences
- Decorative gradients on data bars
- Animations on initial data load (reduced motion impact)

---

## 12. Patterns

### 12.1 Hero
Required:
- concise title (brand serif)
- one short description (body.lg)
- one main action (button.primary)
- optional secondary action (button.secondary or button.accent)
- clear identity marker (dot logo)

### 12.2 Dashboard
Required:
- topbar with identity, current context, primary action
- sidebar or top navigation
- key metrics row (insight cards)
- main content panel
- status indicators
- empty state for zero data

### 12.3 Documentation page
Required structure:
```
title
purpose
changelog (for versioned documents)
rules
examples
tokens used
accessibility notes
anti-patterns
implementation
```

### 12.4 Onboarding
Required:
- Welcome screen with clear product value
- Progressive steps (no more than 5)
- Skip option always visible
- Progress indicator
- Completion confirmation

---

## 13. Accessibility

:::table{caption="Accessibility requirements by area"}

| Area | Requirement |
|---|---|
| Contrast | WCAG 2.2 AA minimum. AAA for body text where achievable |
| Keyboard | Full keyboard navigation on all interactive elements |
| Focus | Visible on all interactive controls in all themes |
| Motion | `prefers-reduced-motion` supported: transitions and animations finish at once |
| Touch | Interactive targets at least 24×24 px (WCAG 2.5.8, checked by axe); 44×44 px where space allows (WCAG 2.5.5) |
| Language | Clear, factual, low-noise. Reading level: plain language preferred |
| Error states | Human-readable, specific, and recoverable |
| Screen readers | All images have alt text. Icons have labels. ARIA landmarks used |
| Color alone | Never use color as the only differentiator. Always add shape or text |
| Forms | Every input has a visible label. Error messages are associated via `aria-describedby` |
| Tables | Always include `<thead>` with `scope="col"` headers |
| Live regions | Use `aria-live` for toast and dynamic content updates |

:::

---

## 14. Implementation

### 14.1 CSS custom properties

This block is generated from the DTCG token files (`tokens/*.tokens.json` via `libka.resolver.json`) by `generate.py` and is identical to `libka-tokens.css`. Do not edit it by hand: change the token file and run the build.

<!-- BEGIN GENERATED: libka-tokens.css -->
```css
:root {
  --lk-ink-950: #111723;
  --lk-ink-900: #1A2130;
  --lk-graphite-800: #2A3345;
  --lk-cloud-50: #F6F7F9;
  --lk-pearl-100: #ECEFF3;
  --lk-mist-200: #D7DDE7;
  --lk-slate-450: #7F8A9C;
  --lk-slate-550: #5F6A7B;
  --lk-aqua-500: #20C7D9;
  --lk-aqua-650: #0F8FA1;
  --lk-aqua-750: #056F7D;
  --lk-apricot-500: #F0B35E;
  --lk-apricot-600: #B87A22;
  --lk-apricot-700: #A66B1F;
  --lk-apricot-800: #8F5804;
  --lk-iris-500: #7A7CFF;
  --lk-iris-700: #4C4ECC;
  --lk-coral-600: #D8576B;
  --lk-coral-750: #B4364E;
  --lk-mint-650: #2E8B65;
  --lk-mint-800: #16633F;
  --lk-bg-canvas: #F6F7F9;
  --lk-bg-surface: #FFFFFF;
  --lk-bg-elevated: #F1F4F7;
  --lk-text-primary: #1A2130;
  --lk-text-secondary: #556074;
  --lk-text-muted: #5F6A7B;
  --lk-text-accent: #056F7D;
  --lk-text-info: #056F7D;
  --lk-text-success: #16633F;
  --lk-text-warning: #8F5804;
  --lk-text-error: #B4364E;
  --lk-text-ai: #4C4ECC;
  --lk-border-default: #D7DDE7;
  --lk-border-strong: #B0B9C8;
  --lk-border-control: #5F6A7B;
  --lk-action-primary: #111723;
  --lk-action-accent: #0F8FA1;
  --lk-action-iris: #4C4ECC;
  --lk-action-accent-strong: #056F7D;
  --lk-action-destructive: #B4364E;
  --lk-action-on-accent: #FFFFFF;
  --lk-action-on-iris: #FFFFFF;
  --lk-action-on-destructive: #FFFFFF;
  --lk-focus-ring: #B87A22;
  --lk-status-success: #2E8B65;
  --lk-status-warning: #A66B1F;
  --lk-status-error: #D8576B;
  --lk-status-info: #0F8FA1;
  --lk-status-ai: #4C4ECC;
  --lk-space-0_5: 2px;
  --lk-space-1: 4px;
  --lk-space-2: 8px;
  --lk-space-3: 12px;
  --lk-space-4: 16px;
  --lk-space-5: 20px;
  --lk-space-6: 24px;
  --lk-space-8: 32px;
  --lk-space-10: 40px;
  --lk-space-12: 48px;
  --lk-space-16: 64px;
  --lk-space-20: 80px;
  --lk-space-24: 96px;
  --lk-space-32: 128px;
  --lk-radius-xs: 6px;
  --lk-radius-sm: 10px;
  --lk-radius-md: 16px;
  --lk-radius-lg: 24px;
  --lk-radius-xl: 32px;
  --lk-radius-2xl: 40px;
  --lk-radius-full: 999px;
  --lk-opacity-disabled: 0.45;
  --lk-opacity-muted: 0.65;
  --lk-opacity-overlay: 0.48;
  --lk-opacity-hover: 0.08;
  --lk-opacity-subtle: 0.05;
  --lk-opacity-scrim: 0.6;
  --lk-z-base: 0;
  --lk-z-raised: 10;
  --lk-z-sticky: 20;
  --lk-z-dropdown: 30;
  --lk-z-overlay: 40;
  --lk-z-drawer: 50;
  --lk-z-modal: 60;
  --lk-z-toast: 70;
  --lk-z-tooltip: 80;
  --lk-duration-instant: 80ms;
  --lk-duration-fast: 160ms;
  --lk-duration-base: 240ms;
  --lk-duration-slow: 480ms;
  --lk-duration-crawl: 720ms;
  --lk-ease-standard: cubic-bezier(.2,.8,.2,1);
  --lk-ease-soft: cubic-bezier(.16,1,.3,1);
  --lk-ease-sharp: cubic-bezier(.4,0,.2,1);
  --lk-ease-linear: linear;
  --lk-shadow-0: none;
  --lk-shadow-1: 0 1px 2px rgb(17 23 35 / .06);
  --lk-shadow-2: 0 4px 16px rgb(17 23 35 / .07), 0 1px 3px rgb(17 23 35 / .05);
  --lk-shadow-3: 0 20px 60px rgb(17 23 35 / .14);
  --lk-shadow-4: 0 32px 80px rgb(17 23 35 / .20);
  --lk-viz-series-1: #0F8FA1;
  --lk-viz-series-2: #7A7CFF;
  --lk-viz-series-3: #F0B35E;
  --lk-viz-series-4: #16633F;
  --lk-viz-series-5: #D8576B;
  --lk-viz-series-6: #B8C0CC;
  --lk-viz-axis: var(--lk-border-default);
  --lk-viz-label: var(--lk-text-muted);
  --lk-viz-grid: rgb(215 221 231 / .60);
  --lk-button-primary-background: var(--lk-action-primary);
  --lk-button-primary-text: var(--lk-bg-canvas);
  --lk-button-primary-hover-background: #2A3345;
  --lk-button-primary-focus-ring: var(--lk-focus-ring);
  --lk-button-primary-disabled-opacity: var(--lk-opacity-disabled);
  --lk-button-accent-background: var(--lk-action-accent-strong);
  --lk-button-accent-text: var(--lk-action-on-accent);
  --lk-button-accent-hover-background: #02606C;
  --lk-button-accent-focus-ring: var(--lk-focus-ring);
  --lk-button-iris-background: var(--lk-action-iris);
  --lk-button-iris-text: var(--lk-action-on-iris);
  --lk-button-iris-hover-background: #3E40A8;
  --lk-button-iris-focus-ring: var(--lk-focus-ring);
  --lk-button-secondary-background: var(--lk-bg-surface);
  --lk-button-secondary-border: var(--lk-border-default);
  --lk-button-secondary-text: var(--lk-text-primary);
  --lk-button-destructive-background: var(--lk-action-destructive);
  --lk-button-destructive-text: var(--lk-action-on-destructive);
  --lk-button-ghost-background: transparent;
  --lk-button-ghost-text: var(--lk-text-secondary);
  --lk-button-ghost-hover-background: var(--lk-bg-elevated);
  --lk-input-background: var(--lk-bg-surface);
  --lk-input-border-default: var(--lk-border-control);
  --lk-input-border-focus: var(--lk-action-accent);
  --lk-input-border-error: var(--lk-status-error);
  --lk-input-text: var(--lk-text-primary);
  --lk-input-placeholder: var(--lk-text-muted);
  --lk-input-label: var(--lk-text-primary);
  --lk-input-helper: var(--lk-text-secondary);
  --lk-input-error-text: var(--lk-text-error);
  --lk-card-background: var(--lk-bg-surface);
  --lk-card-border: var(--lk-border-default);
  --lk-card-shadow: var(--lk-shadow-2);
  --lk-card-ai-border: var(--lk-action-iris);
  --lk-card-ai-tint: rgb(76 78 204 / .05);
  --lk-badge-success-background: rgb(46 139 101 / .12);
  --lk-badge-success-text: var(--lk-text-success);
  --lk-badge-info-background: rgb(15 143 161 / .12);
  --lk-badge-info-text: var(--lk-text-info);
  --lk-badge-warning-background: rgb(240 179 94 / .16);
  --lk-badge-warning-text: var(--lk-text-warning);
  --lk-badge-error-background: rgb(216 87 107 / .12);
  --lk-badge-error-text: var(--lk-text-error);
  --lk-badge-ai-background: rgb(76 78 204 / .10);
  --lk-badge-ai-text: var(--lk-text-ai);
  --lk-nav-item-active-background: rgb(15 143 161 / .10);
  --lk-nav-item-active-text: var(--lk-text-primary);
  --lk-nav-item-hover-background: var(--lk-bg-elevated);
  --lk-nav-item-default-text: var(--lk-text-secondary);
  --lk-table-header-background: var(--lk-bg-elevated);
  --lk-table-header-text: var(--lk-text-primary);
  --lk-table-row-default: var(--lk-bg-surface);
  --lk-table-row-hover: rgb(15 143 161 / .05);
  --lk-table-row-selected: rgb(15 143 161 / .10);
  --lk-table-border: var(--lk-border-default);
  --lk-table-cell-padding-y: var(--lk-space-3);
  --lk-table-cell-padding-x: var(--lk-space-4);
  --lk-modal-background: var(--lk-bg-surface);
  --lk-modal-overlay: rgb(0 0 0 / .48);
  --lk-modal-shadow: var(--lk-shadow-3);
  --lk-drawer-background: var(--lk-bg-surface);
  --lk-drawer-shadow: var(--lk-shadow-4);
}
[data-theme="dark"] {
  --lk-bg-canvas: #111723;
  --lk-bg-surface: #1A2130;
  --lk-bg-elevated: #2A3345;
  --lk-text-primary: #F6F7F9;
  --lk-text-secondary: #C6CDD8;
  --lk-text-muted: #95A0B2;
  --lk-text-accent: #20C7D9;
  --lk-text-info: #20C7D9;
  --lk-text-success: #67D5AA;
  --lk-text-warning: #F0B35E;
  --lk-text-error: #FF9FAE;
  --lk-text-ai: #ABADFF;
  --lk-border-default: #384255;
  --lk-border-strong: #4A5568;
  --lk-border-control: #7F8A9C;
  --lk-action-primary: #F6F7F9;
  --lk-action-accent: #20C7D9;
  --lk-action-iris: #7A7CFF;
  --lk-action-accent-strong: #20C7D9;
  --lk-action-destructive: #FF9FAE;
  --lk-action-on-accent: #111723;
  --lk-action-on-iris: #111723;
  --lk-action-on-destructive: #111723;
  --lk-focus-ring: #F0B35E;
  --lk-status-success: #67D5AA;
  --lk-status-warning: #F0B35E;
  --lk-status-error: #FF9FAE;
  --lk-status-info: #20C7D9;
  --lk-status-ai: #7A7CFF;
  --lk-shadow-0: none;
  --lk-shadow-1: 0 1px 2px rgb(0 0 0 / .30);
  --lk-shadow-2: 0 4px 16px rgb(0 0 0 / .40), 0 1px 3px rgb(0 0 0 / .30);
  --lk-shadow-3: 0 20px 60px rgb(0 0 0 / .55);
  --lk-shadow-4: 0 32px 80px rgb(0 0 0 / .65);
  --lk-viz-grid: rgb(56 66 85 / .60);
  --lk-button-primary-hover-background: #ECEFF3;
  --lk-button-accent-hover-background: #35D4E6;
  --lk-button-iris-hover-background: #9698FF;
  --lk-card-ai-tint: rgb(122 124 255 / .07);
  --lk-badge-success-background: rgb(103 213 170 / .12);
  --lk-badge-info-background: rgb(32 199 217 / .12);
  --lk-badge-warning-background: rgb(240 179 94 / .12);
  --lk-badge-error-background: rgb(255 159 174 / .12);
  --lk-badge-ai-background: rgb(122 124 255 / .12);
  --lk-nav-item-active-background: rgb(32 199 217 / .12);
  --lk-table-row-hover: rgb(32 199 217 / .06);
  --lk-table-row-selected: rgb(32 199 217 / .12);
}
[data-contrast="high"] {
  --lk-bg-canvas: #FFFFFF;
  --lk-bg-surface: #FFFFFF;
  --lk-bg-elevated: #F0F0F0;
  --lk-text-primary: #000000;
  --lk-text-secondary: #1A1A1A;
  --lk-text-muted: #333333;
  --lk-text-accent: #004A54;
  --lk-text-info: #004A54;
  --lk-text-success: #024D2E;
  --lk-text-warning: #623A01;
  --lk-text-error: #86012C;
  --lk-text-ai: #352DAA;
  --lk-border-default: #000000;
  --lk-border-strong: #000000;
  --lk-border-control: #000000;
  --lk-action-primary: #000000;
  --lk-action-accent: #004A54;
  --lk-action-iris: #352DAA;
  --lk-action-accent-strong: #004A54;
  --lk-action-destructive: #86012C;
  --lk-action-on-accent: #FFFFFF;
  --lk-action-on-iris: #FFFFFF;
  --lk-action-on-destructive: #FFFFFF;
  --lk-focus-ring: #965F05;
  --lk-status-success: #024D2E;
  --lk-status-warning: #623A01;
  --lk-status-error: #86012C;
  --lk-status-info: #004A54;
  --lk-status-ai: #352DAA;
}
[data-theme="dark"][data-contrast="high"] {
  --lk-bg-canvas: #000000;
  --lk-bg-surface: #0D0D0D;
  --lk-bg-elevated: #1F1F1F;
  --lk-text-primary: #FFFFFF;
  --lk-text-secondary: #F2F2F2;
  --lk-text-muted: #D9D9D9;
  --lk-text-accent: #37D3E5;
  --lk-text-info: #37D3E5;
  --lk-text-success: #67D5AA;
  --lk-text-warning: #F3B661;
  --lk-text-error: #FFAAB6;
  --lk-text-ai: #B6BEFF;
  --lk-border-default: #FFFFFF;
  --lk-border-strong: #FFFFFF;
  --lk-border-control: #FFFFFF;
  --lk-action-primary: #FFFFFF;
  --lk-action-accent: #37D3E5;
  --lk-action-iris: #B6BEFF;
  --lk-action-accent-strong: #37D3E5;
  --lk-action-destructive: #FFAAB6;
  --lk-action-on-accent: #000000;
  --lk-action-on-iris: #000000;
  --lk-action-on-destructive: #000000;
  --lk-focus-ring: #F0B35E;
  --lk-status-success: #67D5AA;
  --lk-status-warning: #F3B661;
  --lk-status-error: #FFAAB6;
  --lk-status-info: #37D3E5;
  --lk-status-ai: #B6BEFF;
}
@media (prefers-contrast: more) {
  :root:not([data-contrast="standard"]) {
    --lk-bg-canvas: #FFFFFF;
    --lk-bg-surface: #FFFFFF;
    --lk-bg-elevated: #F0F0F0;
    --lk-text-primary: #000000;
    --lk-text-secondary: #1A1A1A;
    --lk-text-muted: #333333;
    --lk-text-accent: #004A54;
    --lk-text-info: #004A54;
    --lk-text-success: #024D2E;
    --lk-text-warning: #623A01;
    --lk-text-error: #86012C;
    --lk-text-ai: #352DAA;
    --lk-border-default: #000000;
    --lk-border-strong: #000000;
    --lk-border-control: #000000;
    --lk-action-primary: #000000;
    --lk-action-accent: #004A54;
    --lk-action-iris: #352DAA;
    --lk-action-accent-strong: #004A54;
    --lk-action-destructive: #86012C;
    --lk-action-on-accent: #FFFFFF;
    --lk-action-on-iris: #FFFFFF;
    --lk-action-on-destructive: #FFFFFF;
    --lk-focus-ring: #965F05;
    --lk-status-success: #024D2E;
    --lk-status-warning: #623A01;
    --lk-status-error: #86012C;
    --lk-status-info: #004A54;
    --lk-status-ai: #352DAA;
  }
  [data-theme="dark"]:not([data-contrast="standard"]) {
    --lk-bg-canvas: #000000;
    --lk-bg-surface: #0D0D0D;
    --lk-bg-elevated: #1F1F1F;
    --lk-text-primary: #FFFFFF;
    --lk-text-secondary: #F2F2F2;
    --lk-text-muted: #D9D9D9;
    --lk-text-accent: #37D3E5;
    --lk-text-info: #37D3E5;
    --lk-text-success: #67D5AA;
    --lk-text-warning: #F3B661;
    --lk-text-error: #FFAAB6;
    --lk-text-ai: #B6BEFF;
    --lk-border-default: #FFFFFF;
    --lk-border-strong: #FFFFFF;
    --lk-border-control: #FFFFFF;
    --lk-action-primary: #FFFFFF;
    --lk-action-accent: #37D3E5;
    --lk-action-iris: #B6BEFF;
    --lk-action-accent-strong: #37D3E5;
    --lk-action-destructive: #FFAAB6;
    --lk-action-on-accent: #000000;
    --lk-action-on-iris: #000000;
    --lk-action-on-destructive: #000000;
    --lk-focus-ring: #F0B35E;
    --lk-status-success: #67D5AA;
    --lk-status-warning: #F3B661;
    --lk-status-error: #FFAAB6;
    --lk-status-info: #37D3E5;
    --lk-status-ai: #B6BEFF;
  }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
```
<!-- END GENERATED: libka-tokens.css -->

#### High contrast

The block above includes the high-contrast mode, generated from `tokens/theme-light-hc.tokens.json` and `tokens/theme-dark-hc.tokens.json`. It applies when the root element has `data-contrast="high"` (with `data-theme="dark"` for the dark variant), or automatically when the operating system asks for more contrast (`prefers-contrast: more`) unless the page sets `data-contrast="standard"`. Values: section 4.6.

### 14.2 Token resolution order
```
primitive → semantic → component → implementation
```
Never skip layers: a component references semantic tokens. The exceptions are fills with no semantic role of their own: the buttons' hover fills (`button.*.hover`), the translucent tints (the badge backgrounds, the AI card's tint, the active navigation item, table rows on hover and when selected), the modal overlay and the ghost button's transparent fill. They are set as values in the component tokens, and the dark theme sets its own for all of them except the overlay and the transparent fill.

---

## 15. Final checks

:::table{caption="The final checks and the requirement for each"}

| Check | Requirement |
|---|---|
| Readability | Clear hierarchy and low noise |
| Contrast | All text verified against WCAG 2.2 AA |
| Token discipline | No arbitrary values outside the token set |
| Component states | All states defined and implemented |
| Copy | Short, factual, verb-based for actions |
| Identity | Dot symbol only — no modifications |
| Theme support | Light, dark, high-contrast, reduced-motion |
| Icon compliance | Outline style, labeled, no emoji |
| Motion compliance | Functional only, reduced-motion suppressed |
| AI output validation | Every AI output passes Section A3 checklist |

:::

---

---

:::section[Part B — Appendices]
:::

---

## Appendix A — AI Governance

### A1. Principles
AI systems generating LibKa outputs must treat this manual as a hard constraint set, not a style reference. Tokens are non-negotiable. Layout rules are non-negotiable. Copy rules are non-negotiable.

### A2. Generation profiles

Generated from `governance/a2-profiles.json` by `generate.py`, which stamps the current version and fails the build if a profile names a token, theme or density that does not exist. Edit the JSON, not this section. Each profile ends with a `tokens` map: the exact DTCG token paths behind its prose rules.

<!-- BEGIN GENERATED: a2-profiles -->
#### A2.1 Dashboard profile
```yaml
brand_system: LibKa
version: "2.0"
screen_type: dashboard
theme: light | dark
density: comfortable
required_components:
  - topbar
  - sidebar
  - insight-cards (min 3)
  - data-table or chart
  - status-badges
primary_action: single verb label
accessibility:
  contrast: WCAG 2.2 AA
  keyboard: true
  reduced_motion: true
avoid:
  - decorative gradients
  - ai sparkle icons
  - corporate blue monotony
  - text in aqua.500 or iris.500
token_check:
  - all colors reference semantic layer
  - no arbitrary hex values
  - shadows use shadow.1 or shadow.2 only
tokens:
  never_as_text:
    - color.primitive.aqua.500
    - color.primitive.iris.500
  allowed_shadows:
    - shadow.1
    - shadow.2
```

#### A2.2 Landing / hero profile
```yaml
brand_system: LibKa
version: "2.0"
screen_type: landing
theme: light | dark
density: spacious
required_components:
  - hero (title + lead + primary CTA)
  - dot logo mark
  - max 2 CTAs total
  - one supporting section
typography:
  hero_title: type.display.xl or type.display.lg (Fraunces)
  body: type.body.lg
primary_action: single verb label
accessibility:
  contrast: WCAG 2.2 AA
  keyboard: true
avoid:
  - background video autoplay
  - parallax
  - more than 2 fonts
  - marketing superlatives
tokens:
  hero_title:
    - typography.scale.display.xl
    - typography.scale.display.lg
  body:
    - typography.scale.body.lg
```

#### A2.3 Documentation page profile
```yaml
brand_system: LibKa
version: "2.0"
screen_type: documentation
theme: light
density: comfortable
structure:
  - title (type.heading.h1)
  - purpose paragraph
  - rules section
  - examples
  - tokens used (code blocks)
  - accessibility notes
  - anti-patterns
typography:
  headings: Inter (UI sans) except top H1
  code: JetBrains Mono
avoid:
  - marketing language
  - vague rules ("use appropriately")
  - missing anti-patterns section
tokens:
  title:
    - typography.scale.heading.h1
  headings_font:
    - typography.font.ui
  code_font:
    - typography.font.mono
```

#### A2.4 Form / onboarding profile
```yaml
brand_system: LibKa
version: "2.0"
screen_type: form
theme: light | dark
density: comfortable
required_components:
  - progress indicator
  - labeled inputs (never placeholder-only)
  - inline validation
  - primary submit button
  - back/skip option
accessibility:
  contrast: WCAG 2.2 AA
  keyboard: true
  error_association: aria-describedby
avoid:
  - multi-column form layout on mobile
  - more than 7 fields per step
  - password reveal hidden by default
tokens:
  error_text:
    - color.semantic.text.error
  input_border_error:
    - color.component.input.border.error
```

<!-- END GENERATED: a2-profiles -->

### A3. Validation schema
Every AI output must pass this checklist before acceptance.

#### A3.1 Token compliance
:::checklist
- [ ] All background colors reference semantic tokens (`color.bg.*`)
- [ ] All text colors reference semantic tokens (`color.text.*`) or verified component tokens
- [ ] No raw hex values outside the primitive list in section 4.2
- [ ] Accent colors (`aqua.500`, `iris.500`, `apricot.500`) not used for text
- [ ] Focus ring uses `color.focus.ring` only
:::

#### A3.2 Typography compliance
:::checklist
- [ ] Brand serif used only for brand moments and display headings
- [ ] UI sans used for all body, labels, nav, inputs
- [ ] Mono used only for code and system values
- [ ] `type.overline` is uppercase
- [ ] No custom font sizes outside the type scale
:::

#### A3.3 Component compliance
:::checklist
- [ ] One primary button per decision area
- [ ] All inputs have visible labels
- [ ] Interactive elements have focus states
- [ ] Icon buttons have `aria-label`
- [ ] Cards do not use decorative glow unless semantically justified
:::

#### A3.4 Motion compliance
:::checklist
- [ ] No looping animations on non-status elements
- [ ] `prefers-reduced-motion` handled
- [ ] Stagger delay ≤ 80ms between siblings
- [ ] No parallax or background video
:::

#### A3.5 Copy compliance
:::checklist
- [ ] Action labels are verb-based
- [ ] No marketing superlatives or filler
- [ ] Error messages are specific and human
- [ ] Kicker/overline text is uppercase and short (≤ 4 words)
:::

#### A3.6 Forbidden outputs (automatic fail)
- Any sci-fi, cyberpunk or neon visual
- AI sparkle icons or robot imagery
- Low-contrast glass with decorative blur only
- Random colors outside the token set
- Duplicate primary actions in one decision area
- Emoji used as UI icons

---

## Appendix B — Token Reference

*See accompanying files: `tokens/*.tokens.json` and `libka.resolver.json`*

The token files are the authoritative source for all primitive, semantic, component, type, spacing, motion, and dark mode values. They follow the W3C Design Tokens Format 2025.10, and `libka.resolver.json` follows the Resolver Module 2025.10:

:::table{caption="The token files and what each contains"}

| File | Contents |
|---|---|
| `tokens/primitive.tokens.json` | Primitive palette; brand metadata in `$extensions` |
| `tokens/semantic.tokens.json` | Semantic colors, light theme values |
| `tokens/component.tokens.json` | Component tokens, mostly aliases of semantic tokens |
| `tokens/foundation.tokens.json` | Typography, spacing, density, radius, opacity, z-index, breakpoints, shadows, motion, icons, data viz |
| `tokens/theme-dark.tokens.json` | Only the values that change in the dark theme |
| `tokens/theme-light-hc.tokens.json`, `tokens/theme-dark-hc.tokens.json` | High-contrast overrides of every semantic color (section 4.6) |
| `libka.resolver.json` | Merges the four base sets, then the `theme` modifier: `light` (default), `dark`, `light-high-contrast`, `dark-high-contrast` (stacked on dark) |

:::

Values CSS needs but DTCG cannot express (fluid `clamp()` sizes, `em` letter-spacing, `72ch`, CSS motion snippets, exact font-stack quoting) keep a valid standard `$value` and carry the exact CSS in `$extensions["org.libka"].css`.

When the manual and the token files conflict, the token files are correct for implementation and the manual should be updated.

---

## Appendix C — Version control and governance

### C1. Token change rules
- Primitive additions: allowed with documentation and contrast verification.
- Primitive changes: require full impact audit across semantic and component layers.
- Semantic token additions: allowed with use-case documentation.
- Semantic token removal: requires deprecation notice in one version before removal.
- Component token additions: allowed when a component is added.

### C2. AI output review cadence
- Any AI-generated output used in production must be validated against Appendix A3 before shipping.
- Validation failures must be corrected — not overridden.
- Repeated validation failures from the same AI system require a profile update in A2.

### C3. Contribution rules
- New components must follow the existing token mapping pattern.
- New patterns must include an anti-patterns section.
- Every addition to the manual must include a corresponding token or rule — no orphaned guidance.

---

## Appendix D — Verification & Build

### D1. Verification suite
`libka-verification.html` recomputes the token checks in the browser with zero setup:
- Token reference resolution (every `ref` resolves to a real value)
- Contrast matrix for light and dark themes (WCAG 2.2 AA)
- Colorblind distinguishability (CIE76 ΔE under deuteranopia, protanopia, tritanopia)

Open it and read the numbers. Toggle the theme to confirm both modes. The page computes from token data that `generate.py` writes into it, so it always checks the current tokens, and `generate.py` runs the same contrast gates on every build: a failing value stops the build.

### D2. Build pipeline
`generate.py` is the reference build. It:
1. Loads the DTCG token files through `libka.resolver.json` and validates every theme (light, dark and the two high-contrast themes) with `libka_tokens.py` (names, types, value shapes, aliases, cycles); any violation fails the build with a non-zero exit code.
2. Checks contrast and fails below it: text, buttons and badges at 4.5:1 (7:1 in the high-contrast themes), the boundary of text fields and the focus ring at 3:1.
3. Generates `libka-tokens.css` (custom properties for every theme), `lk-bridge.css`, `libka-tokens.scss`, `libka.tailwind.config.js`, the Tailwind v4 theme, and the CSS copy in section 14.1.

`check.py` runs this together with the unit tests, the TypeScript checks and tests, and a check that no generated file is stale. Because the source is standard DTCG, other DTCG tools can read it directly. See `docs/tokens.md` for the full recipe.

### D3. Verification policy
- No accessibility claim ships without a computed value behind it.
- Contrast and colorblind checks are re-run whenever a color token changes.
- A failing check is fixed, never waived: a claim that does not survive computation is not made.

