#!/usr/bin/env python3
"""LibKa token build + validator. Resolves refs, validates the chain, emits CSS/SCSS/Tailwind.

Source of truth: the DTCG 2025.10 token files in tokens/, wired by libka.resolver.json
and validated by libka_tokens.py. The generators below read them in the legacy shape."""
import decimal, hashlib, json, sys, re, os

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
    """Resolve a token node to a concrete value for a given mode (light or dark)."""
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
# on every background, in both modes. Colored text roles must also reach it on
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

# Every mode context in the resolver, with its thresholds: the standard modes need AA
# (text 4.5:1); the high-contrast contexts promise AAA text (7:1) and 4.5:1 for UI colors.
CONTEXTS = {'light': (TEXT_MIN, None), 'dark': (TEXT_MIN, None),
            'light-high-contrast': (7.0, 4.5), 'dark-high-contrast': (7.0, 4.5)}
CONTROL_MIN = 3.0   # a control's boundary (WCAG 1.4.11 non-text contrast)
UI_ROLES = ['border.default', 'border.strong', 'border.control', 'action.accent', 'action.iris', 'focus.ring',
            'status.success', 'status.warning', 'status.error', 'status.info', 'status.ai']
declared = set(json.load(open(libka_tokens.RESOLVER, encoding='utf-8'))['modifiers']['mode']['contexts'])
if declared != set(CONTEXTS):
    print(f"CONTEXT VALIDATION FAILED: resolver mode contexts {sorted(declared)} != gated contexts {sorted(CONTEXTS)}")
    sys.exit(1)
CTX = {}   # context -> (tokens, {semantic name: CSS value})
for ctx in CONTEXTS:
    toks = libka_tokens.tokens({'mode': ctx})
    CTX[ctx] = (toks, {p[len('color.semantic.'):]: libka_tokens.css(t, toks)
                       for p, t in toks.items() if p.startswith('color.semantic.')})

# High-contrast files must override every semantic color and the chart series, and nothing else.
series_paths = {p for p in CTX['light'][0] if re.fullmatch(r'visualization\.series\.\d+', p)}
semantic_paths = {p for p in CTX['light'][0] if p.startswith('color.semantic.')} | series_paths
for hc_file in ('tokens/theme-light-hc.tokens.json', 'tokens/theme-dark-hc.tokens.json'):
    declared_paths = set(libka_tokens._collect(json.load(open(os.path.join(ROOT, hc_file), encoding='utf-8'))))
    if declared_paths != semantic_paths:
        print(f"HIGH CONTRAST VALIDATION FAILED: {hc_file} must override exactly the semantic colors and the chart series; "
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

# ---- Validate the chart series per mode (manual section 11) ----
# Each series is a graphic: 3:1 against every background (4.5:1 in high contrast, as UI colours), and every pair is
# told apart under protanopia, deuteranopia and tritanopia (Machado 2009, severity 1) by at least CIE76 ΔE 15.
SERIES_DE_MIN = 15
MACHADO = {
    'protan': ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    'deutan': ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
    'tritan': ((1.255528, -0.076749, -0.178779), (-0.078411, 0.930809, 0.147602), (0.004733, 0.691367, 0.303900)),
}

def series_of(ctx):
    toks = CTX[ctx][0]
    return [libka_tokens.css(toks[p], toks) for p in sorted(series_paths, key=lambda p: int(p.rsplit('.', 1)[1]))]

def seen_lab(hex_, matrix):
    """CIE L*a*b* (D65) of a colour as a vision sees it: normal (matrix None) or simulated in linear sRGB."""
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in hex_rgb(hex_)]   # channels 0..1
    if matrix:
        lin = [min(1.0, max(0.0, sum(row[i] * lin[i] for i in range(3)))) for row in matrix]
    r, g, b = lin
    x, y, z = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116
    return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))

series_errors, series_worst = [], {}
for ctx, (text_min, ui_min) in CONTEXTS.items():
    need = ui_min or CONTROL_MIN
    bgs = {k: hex_rgb(v) for k, v in CTX[ctx][1].items() if k.startswith('bg.')}
    colours = series_of(ctx)
    for i, hex_ in enumerate(colours, 1):
        for bg_name, bg in bgs.items():
            ratio = contrast(hex_rgb(hex_), bg)
            if ratio < need:
                series_errors.append(f"{ctx}: series {i} {hex_} on {bg_name} = {ratio:.2f}:1 (needs {need}:1)")
    worst = (float('inf'), '')
    for vision, matrix in (('normal', None), *MACHADO.items()):
        labs = [seen_lab(h, matrix) for h in colours]
        for i in range(len(labs)):
            for j in range(i + 1, len(labs)):
                d = sum((labs[i][k] - labs[j][k]) ** 2 for k in range(3)) ** 0.5
                worst = min(worst, (d, f"{vision} {i + 1}-{j + 1}"))
                if d < SERIES_DE_MIN:
                    series_errors.append(f"{ctx}: series {i + 1} and {j + 1} are dE {d:.1f} apart for {vision} vision (needs {SERIES_DE_MIN})")
    series_worst[ctx] = worst
if series_errors:
    print("CHART SERIES VALIDATION FAILED:")
    for e in series_errors: print("  " + e)
    sys.exit(1)
print("CHART SERIES VALIDATION PASSED: every series at 3:1 (4.5:1 in high contrast) on every background; worst colour-blind "
      "dE " + ", ".join(f"{ctx} {d:.1f} ({where})" for ctx, (d, where) in series_worst.items()) + ".")

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
    # Primitives never change with the mode, so only :root declares them.
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
    else:
        # each mode has its own lightness for the series (they pass in that mode); the light set is the base
        out += [f"  --lk-viz-series-{i}: {hex_};" for i, hex_ in enumerate(series_of(theme), 1)]
    out.append(f"  --lk-viz-grid: {viz['grid']['color'][theme]};")
    return out

def hc_css():
    """High contrast: [data-contrast="high"] on the root, or the OS preference (prefers-contrast: more)
    unless the page opts out with data-contrast="standard". Dark + high uses the dark palette."""
    def block(ctx, pad):
        return "\n".join([f"{pad}--lk-{k.replace('.', '-')}: {v};" for k, v in CTX[ctx][1].items()]
                         + [f"{pad}--lk-viz-series-{i}: {hex_};" for i, hex_ in enumerate(series_of(ctx), 1)])
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
_light = libka_tokens.tokens({'mode': 'light'})
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
modes = set(json.load(open(libka_tokens.RESOLVER, encoding='utf-8'))['modifiers']['mode']['contexts'])
profile_errors = []
for p in profiles:
    for name, paths in p.get('tokens', {}).items():
        profile_errors += [f"{p['id']}.tokens.{name}: no token '{x}'" for x in paths if x not in _light]
    profile_errors += [f"{p['id']}.mode: unknown mode '{t.strip()}'"
                       for t in p['spec'].get('mode', '').split('|') if t.strip() not in modes]
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
    [':::table{caption="The high-contrast value of every semantic color in the light and dark modes"}', '',
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
# uses its smallest value. Colors are the light mode's semantic colors, already contrast-checked above.
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

# ---- Emit the design package's data (packages/design/src/srgb-table.ts and palette.ts) ----
# The sRGB transfer function as a 256-entry table: @libka/design reads luminance from it, so the solver and
# its gates compute the same numbers in every JavaScript engine (no Math.pow) and the same as this build.
def srgb_linear(c8):
    # in decimal arithmetic at 60 digits, rounded once to the nearest double: the platform's pow differs in the
    # last bit between Windows and Linux, the decimal module's arithmetic is the same everywhere
    with decimal.localcontext() as dctx:
        dctx.prec = 60
        c = decimal.Decimal(c8) / 255
        if c <= decimal.Decimal('0.04045'):
            return float(c / decimal.Decimal('12.92'))
        return float(((c + decimal.Decimal('0.055')) / decimal.Decimal('1.055')) ** decimal.Decimal('2.4'))
SRGB_TABLE = [srgb_linear(i) for i in range(256)]
DESIGN_HEADER = '// Generated by generate.py from the DTCG tokens; do not edit.\n'
write('packages/design/src/srgb-table.ts', DESIGN_HEADER
      + '/** The sRGB transfer function for each 8-bit channel value: SRGB_LINEAR[c] is the linear light of c / 255. */\n'
      + 'export const SRGB_LINEAR: readonly number[] = [\n'
      + ',\n'.join('  ' + ', '.join(repr(x) for x in SRGB_TABLE[i:i + 8]) for i in range(0, 256, 8)) + ',\n];\n')

# The default palette: every color the gates read, per mode, with the alias each value comes from. The default
# LibKa brand is pinned to it: the solver verifies it and never moves it.
COLOR_VALUE = re.compile(r'#[0-9A-Fa-f]{6}|rgb\(\s*\d+\s+\d+\s+\d+\s*(?:/\s*[\d.]+)?\s*\)|transparent')
design_values, design_refs = {}, {}
for ctx in CONTEXTS:
    toks = CTX[ctx][0]
    vals = {}
    for p, t in toks.items():
        if not (p.startswith('color.semantic.') or p.startswith('color.component.')):
            continue
        v = libka_tokens.css(t, toks)
        if isinstance(v, str) and COLOR_VALUE.fullmatch(v):
            vals[p[len('color.'):]] = v.upper() if v.startswith('#') else v
    design_values[ctx] = vals
    design_refs[ctx] = {p[len('color.'):]: t.alias[len('color.'):] for p, t in toks.items()
                        if p[len('color.'):] in vals and t.alias and t.alias[len('color.'):] in vals}
write('packages/design/src/palette.ts', DESIGN_HEADER
      + '/** LibKa\'s default palette per mode (the values the token build gates), and the alias each value comes from. */\n'
      + 'export const DEFAULT_PALETTE = ' + json.dumps({'values': design_values, 'refs': design_refs}, indent=2)
      + ' as const;\n')
# LibKa's chart series per mode (the six in order), the same values as --lk-viz-series-1..6 in each mode's block
write('packages/design/src/series.ts', DESIGN_HEADER
      + '/** LibKa\'s chart series per mode, in order (visualization.series in the tokens, gated per mode). */\n'
      + 'export const DEFAULT_SERIES = ' + json.dumps({ctx: [h.upper() for h in series_of(ctx)] for ctx in CONTEXTS}, indent=2)
      + ' as const;\n')

# The built-in design locks (packages/design/locks/, written by build-locks.ts). LibKa's brand is pinned, so every
# lock must hold exactly the palette above and name the palette and sRGB table this build wrote, by their hashes
# (canonical JSON as @libka/design writes it: sorted keys, two-space indent, a final LF).
def design_canonical(value):
    def js(v):   # numbers as JavaScript writes them (1, not 1.0)
        if isinstance(v, float):
            return str(int(v)) if v.is_integer() else repr(v)
        if isinstance(v, list):
            return '[\n' + ',\n'.join('  ' + js(x) for x in v) + '\n]' if v else '[]'
        return json.dumps(v, sort_keys=True, indent=2, ensure_ascii=False)
    return js(value) + '\n'

def design_hash(value):
    return hashlib.sha256(design_canonical(value).encode('utf-8')).hexdigest()

LOCKS_DIR = os.path.join('packages', 'design', 'locks')
lock_files = sorted(f for f in os.listdir(LOCKS_DIR) if f.endswith('.design.lock.json')) if os.path.isdir(LOCKS_DIR) else []
lock_problems = [] if 'libka.classic.design.lock.json' in lock_files else ['libka.classic.design.lock.json is missing']
palette_hash, table_hash = design_hash({'values': design_values, 'refs': design_refs}), design_hash(SRGB_TABLE)
for name in lock_files:
    with open(os.path.join(LOCKS_DIR, name), encoding='utf-8') as fh:
        lock = json.load(fh)
    expected = f"{lock.get('brand')}.{lock.get('theme')}.design.lock.json"
    if lock.get('format') != 1 or lock.get('solver') != 'libka-solver/1':
        lock_problems.append(f'{name}: not a lock of format 1 from libka-solver/1')
    elif name != expected or lock.get('brand') != 'libka' or lock.get('pinned') is not True:
        lock_problems.append(f'{name}: a built-in lock is LibKa\'s pinned brand, named {expected}')
    elif lock['inputs'].get('palette') != palette_hash or lock['inputs'].get('table') != table_hash:
        lock_problems.append(f'{name}: made from another palette or sRGB table than this build wrote')
    elif lock.get('palette') != design_values:
        lock_problems.append(f'{name}: its palette is not the token palette')
if lock_problems:
    for p in lock_problems:
        print(f'DESIGN LOCK FAILED: {p}')
    print('  rebuild them with `node packages/design/src/build-locks.ts`, then run generate.py again')
    sys.exit(1)
print(f'DESIGN LOCKS VERIFIED: {len(lock_files)} built-in locks hold the token palette ({", ".join(lock_files)})')

print("GENERATED: libka-tokens.css, lk-bridge.css, libka-tokens.scss, libka.tailwind.css (v4), libka.tailwind.config.js (v3), manual 14.1 + A2, verification data, Word theme, design data")
print(f"  CSS custom properties defined: {len(set(re.findall(r'(--lk-[A-Za-z0-9-]+)\s*:', css)))}")
