"""The token bridge: the --lk-* custom properties that libka-tokens.css does not carry.

generate.py writes them to lk-bridge.css, which every LibKa page loads after libka-tokens.css:
  - typography: the font stacks and the type scale (--lk-font-*, --lk-type-*);
  - density presets, switched at runtime by [data-density] (comfortable by default);
  - the glow shadows (shadow.glow, nested in the tokens, so the main CSS skips them);
  - the canvas colour as an RGB triplet per theme and contrast, for translucent layers;
  - extensions the blocks need: var() references or color-mix() of existing tokens only.

Rules: no new hex values; every var(--lk-*) referenced must be defined in libka-tokens.css or
here, or the build fails (BridgeError)."""
import re

import libka_tokens


class BridgeError(Exception):
    """The tokens lack something the bridge needs, or a reference is undefined."""


# Each extension: (value, why). Values are var() references or color-mix() of existing tokens.
EXTENSIONS = {
    '--lk-text-heading': ('var(--lk-text-primary)',
        'headings; a brand profile may override it, text-primary by default'),
    '--lk-action-accent-hover': ('var(--lk-action-accent)',
        'accent hover; a slot for a brand profile, no shift by default'),
    '--lk-accent-bg': ('color-mix(in srgb, var(--lk-action-accent) 10%, transparent)',
        'accent background tint, derived'),
    '--lk-accent-border': ('color-mix(in srgb, var(--lk-action-accent) 25%, transparent)',
        'accent border, derived'),
    '--lk-status-success-bg': ('color-mix(in srgb, var(--lk-status-success) 12%, transparent)',
        'background tint of success blocks'),
    '--lk-status-success-border': ('color-mix(in srgb, var(--lk-status-success) 35%, transparent)',
        'border of success blocks'),
    '--lk-decor-grid': ('color-mix(in srgb, var(--lk-action-accent) 6%, transparent)',
        'decorative grid background (slides, UI)'),
    '--lk-slide-pad-x': ('72px',
        'horizontal slide padding; a fixed component value outside the spacing scale'),
    '--lk-slide-pad-y': ('var(--lk-space-10)',
        'vertical slide padding = space-10 (40px)'),
}

DENSITY_PROPS = {
    'rowHeight': 'row-height',
    'controlPaddingY': 'control-pad-y',
    'controlPaddingX': 'control-pad-x',
    'stackGap': 'stack-gap',
    'fontScale': 'font-scale',
}


def _rgb_triplet(value, path, errors):
    m = re.fullmatch(r'#([0-9A-Fa-f]{6})', str(value).strip())
    if not m:
        errors.append(f"expected #RRGGBB at {path}, found {value!r}")
        return None
    h = m.group(1)
    return f"{int(h[0:2], 16)}, {int(h[2:4], 16)}, {int(h[4:6], 16)}"


def bridge_css(tokens_css):
    """The text of lk-bridge.css. tokens_css is the text of libka-tokens.css, for the reference check."""
    tok = libka_tokens.legacy_view()
    errors = []

    def need(path):
        cur = tok
        for part in path.split('.'):
            if not isinstance(cur, dict) or part not in cur:
                errors.append(f"missing in the tokens: {path}")
                return None
            cur = cur[part]
        return cur

    fonts = need('typography.font') or {}
    scale = need('typography.scale') or {}
    font_lines = [f"  --lk-font-{k}: {v};" for k, v in fonts.items()]
    type_lines = []
    for key, spec in scale.items():
        s = key.replace('.', '-')
        type_lines.append(f"  --lk-type-{s}-size: {spec['size']};")
        type_lines.append(f"  --lk-type-{s}-line: {spec['lineHeight']};")
        type_lines.append(f"  --lk-type-{s}-weight: {spec['weight']};")
        type_lines.append(f"  --lk-type-{s}-tracking: {spec['letterSpacing']};")
        fam = spec.get('family')
        if fam not in fonts:
            errors.append(f"typography.scale.{key}.family names an unknown font: {fam!r}")
        type_lines.append(f"  --lk-type-{s}-family: var(--lk-font-{fam});")
        if 'transform' in spec:
            type_lines.append(f"  --lk-type-{s}-transform: {spec['transform']};")

    density = need('density') or {}
    if 'comfortable' not in density:
        errors.append("density.comfortable (the default preset) is missing")

    def density_block(preset):
        vals = density.get(preset, {})
        out = []
        for jkey, css_key in DENSITY_PROPS.items():
            if jkey not in vals:
                errors.append(f"density.{preset}.{jkey} is missing")
                continue
            out.append(f"  --lk-density-{css_key}: {vals[jkey]};")
        return "\n".join(out)

    glow = need('shadow.glow') or {}
    glow_lines = {'light': [], 'dark': []}
    for name, themes in glow.items():
        for theme in ('light', 'dark'):
            if theme not in themes:
                errors.append(f"shadow.glow.{name}.{theme} is missing")
                continue
            glow_lines[theme].append(f"  --lk-shadow-glow-{name}: {themes[theme]};")

    canvas = need('color.semantic.bg.canvas') or {}
    canvas_rgb = {theme: _rgb_triplet(canvas.get(theme), f"color.semantic.bg.canvas.{theme}", errors)
                  for theme in ('light', 'dark')}
    for hc in ('light-high-contrast', 'dark-high-contrast'):   # the canvas changes with high contrast too
        t = libka_tokens.tokens({'theme': hc})
        canvas_rgb[hc] = _rgb_triplet(libka_tokens.css(t['color.semantic.bg.canvas'], t),
                                      f"color.semantic.bg.canvas ({hc})", errors)

    ext_lines = [f"  {name}: {value};" for name, (value, _why) in EXTENSIONS.items()]

    if errors:
        raise BridgeError("; ".join(errors))

    nl = "\n"
    css = f""":root {{
{nl.join(font_lines)}
{nl.join(type_lines)}
{density_block('comfortable')}
  --lk-bg-canvas-rgb: {canvas_rgb['light']};
{nl.join(glow_lines['light'])}
{nl.join(ext_lines)}
}}
[data-theme="dark"] {{
  --lk-bg-canvas-rgb: {canvas_rgb['dark']};
{nl.join(glow_lines['dark'])}
}}
[data-contrast="high"] {{
  --lk-bg-canvas-rgb: {canvas_rgb['light-high-contrast']};
}}
[data-theme="dark"][data-contrast="high"] {{
  --lk-bg-canvas-rgb: {canvas_rgb['dark-high-contrast']};
}}
@media (prefers-contrast: more) {{
  :root:not([data-contrast="standard"]) {{ --lk-bg-canvas-rgb: {canvas_rgb['light-high-contrast']}; }}
  [data-theme="dark"]:not([data-contrast="standard"]) {{ --lk-bg-canvas-rgb: {canvas_rgb['dark-high-contrast']}; }}
}}
[data-density="compact"] {{
{density_block('compact')}
}}
[data-density="spacious"] {{
{density_block('spacious')}
}}
"""
    missing = sorted(undefined_references(css, tokens_css, css))
    if missing:
        raise BridgeError("undefined references: " + ", ".join(missing))
    return css


def defined_names(*css_texts):
    """Every --lk-* custom property the given CSS texts define."""
    return set().union(*(re.findall(r'(--lk-[\w-]+)\s*:', t) for t in css_texts))


def undefined_references(css, tokens_css, bridge):
    """The var(--lk-*) references in css that neither libka-tokens.css nor the bridge defines."""
    return set(re.findall(r'var\((--lk-[\w-]+)\)', css)) - defined_names(tokens_css, bridge)
