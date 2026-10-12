#!/usr/bin/env python3
"""LibKa token build + validator. Resolves refs, validates the chain, emits CSS/SCSS/Tailwind.

Source of truth: the DTCG 2025.10 token files in tokens/, wired by libka.resolver.json
and validated by libka_tokens.py. The generators below read them in the legacy shape."""
import json, sys, re, os

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import libka_tokens

def write(name, text):
    """Write a generated file next to this script (UTF-8, LF), whatever the cwd."""
    with open(os.path.join(ROOT, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)

try:
    counts = libka_tokens.validate()
    TOK = libka_tokens.legacy_view()
except libka_tokens.TokenError as e:
    print(f"DTCG VALIDATION FAILED: {e}")
    sys.exit(1)
print("DTCG VALIDATION PASSED: " + ", ".join(f"{ctx} {n} tokens" for ctx, n in counts.items()
                                             if ctx != '(defaults)') + " (format + resolver 2025.10).")

def get_path(d, dotted):
    cur = d
    for part in dotted.split('.'):
        if part not in cur: return None
        cur = cur[part]
    return cur

errors = []
def resolve(node, themed='light', path=''):
    """Resolve a token node to a concrete value for a given theme."""
    if isinstance(node, dict):
        if 'ref' in node:
            target = get_path(TOK, node['ref'])
            if target is None:
                errors.append(f"BROKEN REF at {path}: {node['ref']}")
                return None
            return resolve(target, themed, node['ref'])
        if 'fixed' in node:
            return node['fixed']
        if themed in node and ('light' in node or 'dark' in node):
            return node[themed]
        return node
    return node

# ---- Validate every ref resolves ----
def walk(node, path=''):
    if isinstance(node, dict):
        if 'ref' in node:
            resolve(node, 'light', path)
            resolve(node, 'dark', path)
        else:
            for k,v in node.items():
                walk(v, f"{path}.{k}" if path else k)
walk(TOK)

if errors:
    print("REF VALIDATION FAILED:")
    for e in errors: print("  "+e)
    sys.exit(1)
print(f"REF VALIDATION PASSED: all token references resolve cleanly.")

# ---- Validate text contrast (WCAG 2.2 AA, normal text 4.5:1) ----
# Every color.semantic.text.* token is text by definition, so it must reach 4.5:1
# on every background, in both themes. Colored text roles must also reach it on
# a tint of their own family up to TINT_MAX (callouts, badges, selected rows).
TEXT_MIN = 4.5
TINT_MAX = 0.12
TINT_SOURCE = {
    'accent': 'action.accent', 'info': 'status.info', 'success': 'status.success',
    'warning': 'status.warning', 'error': 'status.error', 'ai': 'status.ai',
}

def hex_rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]

def luminance(rgb):
    r, g, b = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return .2126 * r + .7152 * g + .0722 * b

def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)

# Every theme context in the resolver, with its thresholds: the standard themes need AA
# (text 4.5:1); the high-contrast contexts promise AAA text (7:1) and 4.5:1 for UI colors.
CONTEXTS = {'light': (TEXT_MIN, None), 'dark': (TEXT_MIN, None),
            'light-high-contrast': (7.0, 4.5), 'dark-high-contrast': (7.0, 4.5)}
CONTROL_MIN = 3.0   # a control's boundary (WCAG 1.4.11 non-text contrast)
UI_ROLES = ['border.default', 'border.strong', 'border.control', 'action.accent', 'action.iris', 'focus.ring',
            'status.success', 'status.warning', 'status.error', 'status.info', 'status.ai']
declared = set(json.load(open(libka_tokens.RESOLVER, encoding='utf-8'))['modifiers']['theme']['contexts'])
if declared != set(CONTEXTS):
    print(f"CONTEXT VALIDATION FAILED: resolver theme contexts {sorted(declared)} != gated contexts {sorted(CONTEXTS)}")
    sys.exit(1)
CTX = {}   # context -> (tokens, {semantic name: CSS value})
for ctx in CONTEXTS:
    toks = libka_tokens.tokens({'theme': ctx})
    CTX[ctx] = (toks, {p[len('color.semantic.'):]: libka_tokens.css(t, toks)
                       for p, t in toks.items() if p.startswith('color.semantic.')})

# High-contrast files must override every semantic color and nothing else.
semantic_paths = {p for p in CTX['light'][0] if p.startswith('color.semantic.')}
for hc_file in ('tokens/theme-light-hc.tokens.json', 'tokens/theme-dark-hc.tokens.json'):
    declared_paths = set(libka_tokens._collect(json.load(open(os.path.join(ROOT, hc_file), encoding='utf-8'))))
    if declared_paths != semantic_paths:
        print(f"HIGH CONTRAST VALIDATION FAILED: {hc_file} must override exactly the semantic colors; "
              f"missing {sorted(semantic_paths - declared_paths)}, extra {sorted(declared_paths - semantic_paths)}")
        sys.exit(1)

contrast_errors, contrast_checks = [], {}
for ctx, (text_min, ui_min) in CONTEXTS.items():
    sem = CTX[ctx][1]
    bgs = {k: hex_rgb(v) for k, v in sem.items() if k.startswith('bg.')}
    n = 0
    for name, val in sem.items():
        if not name.startswith('text.'):
            continue
        role, fg = name.split('.', 1)[1], hex_rgb(val)
        targets = dict(bgs)
        if role in TINT_SOURCE:
            src = hex_rgb(sem[TINT_SOURCE[role]])
            for bg_name, bg in bgs.items():
                targets[f"{TINT_SOURCE[role]} {round(TINT_MAX * 100)}% on {bg_name}"] =                     [src[i] * TINT_MAX + bg[i] * (1 - TINT_MAX) for i in range(3)]
        for bg_name, bg in targets.items():
            n += 1
            ratio = contrast(fg, bg)
            if ratio < text_min:
                contrast_errors.append(f"{ctx}: {name} {val} on {bg_name} = {ratio:.2f}:1 (needs {text_min}:1)")
    for name in (UI_ROLES if ui_min else []):
        for bg_name, bg in bgs.items():
            n += 1
            ratio = contrast(hex_rgb(sem[name]), bg)
            if ratio < ui_min:
                contrast_errors.append(f"{ctx}: {name} {sem[name]} on {bg_name} = {ratio:.2f}:1 (needs {ui_min}:1)")
    # the boundary of a control that only its boundary identifies (a text field) and the focus indicator: WCAG 1.4.11
    # asks 3:1 in every context, not only in high contrast (where every UI role is held to 4.5:1 above)
    for name in ('border.control', 'focus.ring'):
        for bg_name, bg in bgs.items():
            n += 1
            need = max(CONTROL_MIN, ui_min or 0)
            ratio = contrast(hex_rgb(sem[name]), bg)
            if ratio < need:
                contrast_errors.append(f"{ctx}: {name} {sem[name]} on {bg_name} = {ratio:.2f}:1 (needs {need}:1)")
    contrast_checks[ctx] = n

if contrast_errors:
    print("TEXT CONTRAST VALIDATION FAILED:")
    for e in contrast_errors: print("  " + e)
    sys.exit(1)
standard = contrast_checks['light'] + contrast_checks['dark']
high = contrast_checks['light-high-contrast'] + contrast_checks['dark-high-contrast']
print(f"TEXT CONTRAST VALIDATION PASSED: {standard} checks at {TEXT_MIN}:1 (light, dark); "
      f"{high} checks at 7:1 text / 4.5:1 UI (high contrast).")

# ---- Validate button labels on their fills (default + hover, every context) ----
# Labels are normal-size text (14px/700 is below WCAG large text), so the text threshold applies.
# Fills that are not a plain color (e.g. transparent ghost) are covered by the text checks.
HEX = re.compile(r'#[0-9A-Fa-f]{6}')
button_errors, button_checks = [], 0
variants = sorted({p.split('.')[3] for p in CTX['light'][0] if p.startswith('color.component.button.')},
                  key=list(TOK['color']['component']['button']).index)
for ctx, (text_min, _) in CONTEXTS.items():
    toks = CTX[ctx][0]
    for variant in variants:
        base = f'color.component.button.{variant}'
        if f'{base}.text' not in toks:
            continue
        fg = libka_tokens.css(toks[f'{base}.text'], toks)
        for fill in ('background', 'hover.background'):
            if f'{base}.{fill}' not in toks:
                continue
            bg = libka_tokens.css(toks[f'{base}.{fill}'], toks)
            if not (HEX.fullmatch(str(fg)) and HEX.fullmatch(str(bg))):
                continue
            button_checks += 1
            ratio = contrast(hex_rgb(fg), hex_rgb(bg))
            if ratio < text_min:
                button_errors.append(
                    f"{ctx}: button.{variant} text {fg} on {fill} {bg} = {ratio:.2f}:1 (needs {text_min}:1)")

if button_errors:
    print("BUTTON CONTRAST VALIDATION FAILED:")
    for e in button_errors: print("  " + e)
    sys.exit(1)
print(f"BUTTON CONTRAST VALIDATION PASSED: {button_checks} checks (4.5:1 standard, 7:1 high contrast).")

# ---- Validate badge labels on their tinted fills over every background, every context ----
def css_rgba(v):
    v = v.strip()
    if v.startswith('#'): return hex_rgb(v), 1.0
    m = re.match(r'rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:/\s*([\d.]+))?\s*\)', v)
    if not m: raise SystemExit(f"BADGE CONTRAST VALIDATION FAILED: cannot read color {v}")
    return [int(m.group(i)) / 255 for i in (1, 2, 3)], float(m.group(4) or 1)

badge_errors, badge_checks = [], 0
for ctx, (text_min, _) in CONTEXTS.items():
    toks, sem = CTX[ctx]
    variants = sorted({p.split('.')[3] for p in toks if p.startswith('color.component.badge.')})
    for variant in variants:
        fg, _ = css_rgba(libka_tokens.css(toks[f'color.component.badge.{variant}.text'], toks))
        tint, alpha = css_rgba(libka_tokens.css(toks[f'color.component.badge.{variant}.background'], toks))
        for bg_name, bg_val in sem.items():
            if not bg_name.startswith('bg.'): continue
            bg = hex_rgb(bg_val)
            fill = [tint[i] * alpha + bg[i] * (1 - alpha) for i in range(3)]
            badge_checks += 1
            ratio = contrast(fg, fill)
            if ratio < text_min:
                badge_errors.append(f"{ctx}: badge.{variant}.text on its fill over {bg_name} = {ratio:.2f}:1 (needs {text_min}:1)")
if badge_errors:
    print("BADGE CONTRAST VALIDATION FAILED:")
    for e in badge_errors: print("  " + e)
    sys.exit(1)
print(f"BADGE CONTRAST VALIDATION PASSED: {badge_checks} checks (4.5:1 standard, 7:1 high contrast).")

# ---- Emit CSS custom properties ----
def flat_color_css(theme, primitives=True):
    # Primitives never change with the theme, so only :root declares them.
    lines=[]
    for fam,vals in (TOK['color']['primitive'].items() if primitives else ()):
        for k,v in vals.items():
            lines.append(f"  --lk-{fam}-{k}: {v};")
    for grp,items in TOK['color']['semantic'].items():
        for k,v in items.items():
            val = v[theme] if isinstance(v,dict) and theme in v else v
            lines.append(f"  --lk-{grp}-{k.replace('.','-')}: {val};")
    return "\n".join(lines)

def scale_css():
    out=[]
    for k,v in TOK['spacing'].items(): out.append(f"  --lk-space-{k.replace('.','_')}: {v};")
    for k,v in TOK['radius'].items(): out.append(f"  --lk-radius-{k}: {v};")
    for k,v in TOK['opacity'].items(): out.append(f"  --lk-opacity-{k}: {v};")
    for k,v in TOK['zIndex'].items(): out.append(f"  --lk-z-{k}: {v};")
    for k,v in TOK['motion']['duration'].items(): out.append(f"  --lk-duration-{k}: {v};")
    for k,v in TOK['motion']['ease'].items(): out.append(f"  --lk-ease-{k}: {v};")
    for k,v in TOK['shadow'].items():
        if isinstance(v,dict) and 'light' in v: out.append(f"  --lk-shadow-{k}: {v['light']};")
    out += viz_css('light') + component_css('light')
    return "\n".join(out)

def component_ref(path):
    # A component token points at the semantic layer (or a scale); emit that link, never a copied value.
    parts = path.split('.')
    if parts[:2] == ['color', 'semantic']: return f"var(--lk-{parts[2]}-{'-'.join(parts[3:])})"
    if parts[:2] == ['color', 'primitive']: return f"var(--lk-{parts[2]}-{'-'.join(parts[3:])})"
    prefix = {'opacity': 'opacity', 'spacing': 'space', 'shadow': 'shadow', 'radius': 'radius'}.get(parts[0])
    if prefix: return f"var(--lk-{prefix}-{'_'.join(parts[1:]) if prefix == 'space' else '-'.join(parts[1:])})"
    raise SystemExit(f"COMPONENT TOKEN FAILED: cannot emit a reference to {path}")

def component_css(theme):
    # Component tokens (button, input, badge, card, nav, table, modal, drawer): --lk-button-primary-background ...
    out = []
    def walk(node, name):
        for key, v in node.items():
            n = f"{name}-{key.replace('.', '-')}"
            if not ({'ref', 'light', 'fixed'} & set(v)): walk(v, n)            # a group, e.g. button.primary
            elif 'light' in v: out.append(f"  {n}: {v[theme]};")
            elif theme == 'light': out.append(f"  {n}: {component_ref(v['ref']) if 'ref' in v else v['fixed']};")
    for comp, items in TOK['color']['component'].items():
        walk(items, f"--lk-{comp}")
    return out

def viz_css(theme):
    # Data visualization (manual section 11): series colors in their fixed order, axis, labels, grid.
    viz = TOK['visualization']
    out = []
    if theme == 'light':
        out += [f"  --lk-viz-series-{k}: {v['color']};" for k, v in viz['series'].items()]
        out += ["  --lk-viz-axis: var(--lk-border-default);", "  --lk-viz-label: var(--lk-text-muted);"]
    out.append(f"  --lk-viz-grid: {viz['grid']['color'][theme]};")
    return out

def hc_css():
    """High contrast: [data-contrast="high"] on the root, or the OS preference (prefers-contrast: more)
    unless the page opts out with data-contrast="standard". Dark + high uses the dark palette."""
    def block(ctx, pad):
        return "\n".join(f"{pad}--lk-{k.replace('.', '-')}: {v};" for k, v in CTX[ctx][1].items())
    light, dark = block("light-high-contrast", "  "), block("dark-high-contrast", "  ")
    light4, dark4 = block("light-high-contrast", "    "), block("dark-high-contrast", "    ")
    return "\n".join([
        '[data-contrast="high"] {', light, '}',
        '[data-theme="dark"][data-contrast="high"] {', dark, '}',
        '@media (prefers-contrast: more) {',
        '  :root:not([data-contrast="standard"]) {', light4, '  }',
        '  [data-theme="dark"]:not([data-contrast="standard"]) {', dark4, '  }',
        '}'])

def shadow_dark():
    return "\n".join([f"  --lk-shadow-{k}: {v['dark']};" for k,v in TOK['shadow'].items() if isinstance(v,dict) and 'dark' in v] + viz_css('dark') + component_css('dark'))

css = f""":root {{
{flat_color_css('light')}
{scale_css()}
}}
[data-theme="dark"] {{
{flat_color_css('dark', primitives=False)}
{shadow_dark()}
}}
{hc_css()}
@media (prefers-reduced-motion: reduce) {{
  *, *::before, *::after {{ animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }}
}}
"""
write('libka-tokens.css', css)

# The bridge (lk-bridge.css): typography, density, glow and the blocks' extensions, loaded after the tokens.
import libka_bridge
try:
    write('lk-bridge.css', libka_bridge.bridge_css(css))
except libka_bridge.BridgeError as e:
    print(f"BRIDGE BUILD FAILED: {e}")
    sys.exit(1)

# ---- Generated blocks inside documents (never hand-written) ----
# Each target holds exactly one BEGIN/END marker pair per block; the build fails if it does not.
def sync_block(target, name, content):
    begin, end = f'<!-- BEGIN GENERATED: {name} -->', f'<!-- END GENERATED: {name} -->'
    doc = open(os.path.join(ROOT, target), encoding='utf-8').read()
    if doc.count(begin) != 1 or doc.count(end) != 1:
        print(f"GENERATED BLOCK SYNC FAILED: {target} needs exactly one {begin} / {end} pair.")
        sys.exit(1)
    head, rest = doc.split(begin)
    _, tail = rest.split(end)
    write(target, f"{head}{begin}\n{content}\n{end}{tail}")

sync_block('docs/design-system/manual.md', 'libka-tokens.css', f"```css\n{css}```")   # section 14.1

# Token data for the browser verification page, so it checks the real tokens, not copies.
_light = libka_tokens.tokens({'theme': 'light'})
token_data = {
    'version': TOK['brand']['version'],
    'theme': {mode: {f'{grp}.{k}': v[mode] for grp, items in TOK['color']['semantic'].items()
                     for k, v in items.items()} for mode in ('light', 'dark')},
    'series': {k: v['color'] for k, v in TOK['visualization']['series'].items()},
    'refs': {p[len('color.component.'):]: t.alias for p, t in _light.items()
             if p.startswith('color.component.') and t.alias},
    'paths': sorted(_light),
}
# AI generation profiles (manual Appendix A2) from governance/a2-profiles.json.
def _yaml(obj, indent=0):
    def scalar(v):
        if isinstance(v, bool):
            return 'true' if v else 'false'
        return f'"{v}"' if re.fullmatch(r'[\d.]+', str(v)) else str(v)
    pad = '  ' * indent
    for k, v in obj.items():
        if isinstance(v, dict):
            yield f'{pad}{k}:'
            yield from _yaml(v, indent + 1)
        elif isinstance(v, list):
            yield f'{pad}{k}:'
            yield from (f'{pad}  - {scalar(x)}' for x in v)
        else:
            yield f'{pad}{k}: {scalar(v)}'

profiles = json.load(open(os.path.join(ROOT, 'governance', 'a2-profiles.json'), encoding='utf-8'))['profiles']
themes = set(json.load(open(libka_tokens.RESOLVER, encoding='utf-8'))['modifiers']['theme']['contexts'])
profile_errors = []
for p in profiles:
    for name, paths in p.get('tokens', {}).items():
        profile_errors += [f"{p['id']}.tokens.{name}: no token '{x}'" for x in paths if x not in _light]
    profile_errors += [f"{p['id']}.theme: unknown theme '{t.strip()}'"
                       for t in p['spec'].get('theme', '').split('|') if t.strip() not in themes]
    if p['spec'].get('density') not in TOK['density']:
        profile_errors.append(f"{p['id']}.density: unknown density '{p['spec'].get('density')}'")
if profile_errors:
    print("A2 PROFILE VALIDATION FAILED:")
    for e in profile_errors: print("  " + e)
    sys.exit(1)
profile_version = '.'.join(TOK['brand']['version'].split('.')[:2])
sync_block('docs/design-system/manual.md', 'a2-profiles', '\n'.join(
    f"#### A2.{i} {p['title']}\n```yaml\n"
    + '\n'.join(_yaml({'brand_system': 'LibKa', 'version': profile_version, **p['spec'], 'tokens': p['tokens']}))
    + '\n```\n' for i, p in enumerate(profiles, 1)))
print(f"A2 PROFILE VALIDATION PASSED: {len(profiles)} profiles, "
      f"{sum(len(v) for p in profiles for v in p['tokens'].values())} token references resolve.")

# High-contrast palette table (manual section 4.6).
sync_block('docs/design-system/manual.md', 'hc-table', "\n".join(
    [':::table{caption="The high-contrast value of every semantic color in the light and dark themes"}', '',
     "| Semantic token | Light high contrast | Dark high contrast |", "|---|---:|---:|"]
    + [f"| `color.semantic.{name}` | `{value}` | `{CTX['dark-high-contrast'][1][name]}` |"
       for name, value in CTX['light-high-contrast'][1].items()]
    + ['', ':::']))

sync_block('libka-verification.html', 'token-data',
           '<script type="application/json" id="lk-token-data">\n'
           + json.dumps(token_data, indent=1, ensure_ascii=False).replace('</', '<\\/') + '\n</script>')

# ---- Emit SCSS ----
scss_lines=["// LibKa design tokens. Generated by generate.py from the DTCG tokens; do not edit."]
for fam,vals in TOK['color']['primitive'].items():
    for k,v in vals.items(): scss_lines.append(f"$lk-{fam}-{k}: {v};")
for k,v in TOK['spacing'].items(): scss_lines.append(f"$lk-space-{k.replace('.','_')}: {v};")
for k,v in TOK['radius'].items(): scss_lines.append(f"$lk-radius-{k}: {v};")
write('libka-tokens.scss',"\n".join(scss_lines)+"\n")

# ---- Emit Tailwind ----
# Semantic colors only, named like the CSS variables: --lk-bg-canvas -> bg-canvas (class bg-bg-canvas).
# Values read the CSS variables, so [data-theme="dark"] switches them at runtime.
SEMANTIC_COLORS = {f"{grp}-{k}": f"var(--lk-{grp}-{k})"
                   for grp, items in TOK['color']['semantic'].items() for k in items}

# Tailwind CSS v4 (CSS-first): libka.tailwind.css
v4 = ["/* LibKa theme for Tailwind CSS v4. Generated by generate.py from the DTCG tokens; do not edit.",
      "   Use in your CSS entry file:",
      '     @import "tailwindcss";',
      '     @import "./libka-tokens.css";',
      '     @import "./libka.tailwind.css";',
      "   Colors are LibKa's semantic tokens only (Tailwind's default palette is removed), named like",
      "   the CSS variables: --lk-bg-canvas -> bg-bg-canvas, --lk-text-primary -> text-text-primary.",
      "   Utilities read var(--lk-*), so [data-theme=\"dark\"] switches them at runtime. */",
      "@theme inline {",
      "  --color-*: initial;"]
v4 += [f"  --color-{name}: {value};" for name, value in SEMANTIC_COLORS.items()]
fonts = TOK['typography']['font']
v4 += ["", "  --font-*: initial;",
       f"  --font-sans: {fonts['ui']};", f"  --font-serif: {fonts['brand']};", f"  --font-mono: {fonts['mono']};",
       f"  --font-brand: {fonts['brand']};", f"  --font-ui: {fonts['ui']};",
       "", "  --text-*: initial;"]
for name, s in TOK['typography']['scale'].items():
    n = name.replace('.', '-')
    v4 += [f"  --text-{n}: {s['size']};", f"  --text-{n}--line-height: {s['lineHeight']};",
           f"  --text-{n}--letter-spacing: {s['letterSpacing']};", f"  --text-{n}--font-weight: {s['weight']};"]
v4 += ["", f"  --spacing: {TOK['spacing']['1']};   /* LibKa spacing step: p-4 = {TOK['spacing']['4']} */",
       "", "  --radius-*: initial;"]
v4 += [f"  --radius-{k}: var(--lk-radius-{k});" for k in TOK['radius']]
v4 += ["", "  --shadow-*: initial;"]
v4 += [f"  --shadow-{k}: var(--lk-shadow-{k});" for k, v in TOK['shadow'].items() if isinstance(v, dict) and 'light' in v]
v4 += ["", "  --breakpoint-*: initial;"]
v4 += [f"  --breakpoint-{k}: {v};" for k, v in TOK['breakpoint'].items() if k in ('tablet', 'desktop', 'wide')]
v4 += ["", "  --ease-*: initial;"]
v4 += [f"  --ease-{k}: var(--lk-ease-{k});" for k in TOK['motion']['ease'] if k != 'linear']
v4 += ["}", ""]
write('libka.tailwind.css', "\n".join(v4))

# Tailwind CSS v3 (JS config): semantic colors only. The raw palette is not included
# (manual 14.2: components use the semantic layer).
tw = ("// LibKa extension for Tailwind CSS v3. Generated by generate.py; do not edit.\n"
      "// Tailwind v4 projects: use libka.tailwind.css instead.\n"
      "module.exports = {\n  theme: {\n    extend: {\n      colors: {\n"
      "        // Semantic colors (class bg-bg-canvas, text-text-primary, ...). They read the CSS\n"
      "        // variables from libka-tokens.css, so dark mode follows [data-theme].\n"
      + ",\n".join(f'        "{k}": "{v}"' for k, v in SEMANTIC_COLORS.items()) + "\n      },\n")
tw += "      borderRadius: "+json.dumps(TOK['radius'],indent=8)+",\n"
tw += "      spacing: "+json.dumps({k.replace('.','_'):v for k,v in TOK['spacing'].items()},indent=8)+",\n"
tw += "      zIndex: "+json.dumps({k:str(v) for k,v in TOK['zIndex'].items()},indent=8)+"\n"
tw += "    }\n  }\n};\n"
write('libka.tailwind.config.js', tw)

# ---- Emit the Word theme (packages/docx/src/theme.ts) ----
# Word has no font fallback list, so each family names one font that Word and LibreOffice both have
# ($extensions["org.libka"].docx). Sizes are the print sizes in half-points (1rem = 12pt); a fluid size
# uses its smallest value. Colors are the light theme's semantic colors, already contrast-checked above.
OFFICE_FONTS = {'Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana'}
docx_fonts = {}
for fam in ('brand', 'ui', 'mono'):
    name = _light[f'typography.font.{fam}'].extensions.get('org.libka', {}).get('docx')
    if name not in OFFICE_FONTS:
        print(f"DOCX THEME FAILED: typography.font.{fam} needs $extensions[\"org.libka\"].docx, one of {', '.join(sorted(OFFICE_FONTS))} (got {name!r})")
        sys.exit(1)
    docx_fonts[fam] = name

def half_points(size):
    rem = re.search(r'([\d.]+)rem', size)
    if not rem:
        print(f"DOCX THEME FAILED: cannot read a rem size from {size!r}")
        sys.exit(1)
    return round(float(rem.group(1)) * 24)

SCALE = TOK['typography']['scale']
docx_theme = {
    'fonts': docx_fonts,
    # the manual's sizes: the title is h1, ## is h3, ### is h4, #### is body text in bold
    'sizes': {'title': half_points(SCALE['heading.h1']['size']), 'subtitle': half_points(SCALE['body.lg']['size']),
              'h2': half_points(SCALE['heading.h3']['size']), 'h3': half_points(SCALE['heading.h4']['size']),
              'h4': half_points(SCALE['body.md']['size']), 'body': half_points(SCALE['body.md']['size']),
              'small': half_points(SCALE['body.sm']['size']), 'caption': half_points(SCALE['caption']['size']),
              'code': half_points(SCALE['code']['size'])},
    'families': {'title': SCALE['heading.h1']['family'], 'h2': SCALE['heading.h2']['family'],
                 'h3': SCALE['heading.h4']['family'], 'body': SCALE['body.md']['family']},
    'lineHeight': SCALE['body.md']['lineHeight'],
    'colors': {f'{grp}-{k}': CTX['light'][1][f'{grp}.{k}'].lstrip('#').upper()
               for grp in ('text', 'border', 'bg') for k in TOK['color']['semantic'][grp]
               if re.fullmatch(r'#[0-9A-Fa-f]{6}', CTX['light'][1][f'{grp}.{k}'])},
}
write('packages/docx/src/theme.ts', '/** The Word theme: generated by generate.py from the DTCG tokens; do not edit. */\n'
      + 'export const THEME = ' + json.dumps(docx_theme, indent=2) + ' as const;\n')

print("GENERATED: libka-tokens.css, lk-bridge.css, libka-tokens.scss, libka.tailwind.css (v4), libka.tailwind.config.js (v3), manual 14.1 + A2, verification data, Word theme")
print(f"  CSS custom properties defined: {len(set(re.findall(r'(--lk-[A-Za-z0-9-]+)\s*:', css)))}")
