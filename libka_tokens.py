"""LibKa design tokens: DTCG 2025.10 loader, validator and resolver.

The source of truth is the DTCG token files in tokens/, wired together by
libka.resolver.json (Design Tokens Resolver Module 2025.10): the sets are merged
in order and the "theme" modifier adds the dark overrides.

    resolve({'theme': 'dark'})   merged token tree for one theme (aliases kept)
    tokens({'theme': 'dark'})    {path: Token} with types, values and aliases
    legacy_view()                the legacy JSON shape the generators read

Values DTCG cannot express exactly (clamp() sizes, em letter-spacing, the 72ch
measure, CSS motion snippets, font stacks with their original quoting) keep a
valid DTCG $value and carry the exact CSS in $extensions["org.libka"].css;
everything generated from the tokens uses that CSS.

Any violation raises TokenError, so a broken token file fails the build.
"""
import copy, json, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
RESOLVER = os.path.join(ROOT, 'libka.resolver.json')
EXT = 'org.libka'
TYPES = {'color', 'dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier', 'number',
         'shadow', 'typography', 'transition', 'strokeStyle', 'border', 'gradient'}
ALIAS = re.compile(r'^\{([^{}]+)\}$')


class TokenError(Exception):
    pass


class Token:
    def __init__(self, path, type_, value, description, extensions):
        self.path, self.type, self.value = path, type_, value
        self.description, self.extensions = description, extensions or {}
        m = ALIAS.match(value) if isinstance(value, str) else None
        self.alias = m.group(1) if m else None

    @property
    def css(self):
        return self.extensions.get(EXT, {}).get('css')


# ---- resolver ---------------------------------------------------------------
def _read(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _is_token(node):
    return isinstance(node, dict) and '$value' in node


def _merge(dst, src):
    """Merge a token document into the tree: tokens are replaced whole (last
    declaration wins), groups merge, group properties ($type, ...) override."""
    for key, val in src.items():
        if _is_token(val) or not isinstance(val, dict) or not isinstance(dst.get(key), dict) \
                or _is_token(dst.get(key)):
            dst[key] = copy.deepcopy(val)
        else:
            _merge(dst[key], val)


def _sources(doc, sources, base):
    for src in sources:
        if '$ref' in src:
            ref = src['$ref']
            if ref.startswith('#/'):
                raise TokenError(f'set or context sources must reference token files, got {ref}')
            yield _read(os.path.join(base, ref))
        else:
            yield src


def resolve(inputs=None, resolver=RESOLVER):
    """Merged token tree for the given modifier inputs (defaults applied)."""
    doc, base, inputs = _read(resolver), os.path.dirname(resolver), dict(inputs or {})
    if doc.get('version') != '2025.10':
        raise TokenError(f"{os.path.basename(resolver)}: version must be '2025.10'")
    modifiers = doc.get('modifiers', {})
    unknown = set(inputs) - set(modifiers)
    if unknown:
        raise TokenError(f'unknown modifier input(s): {sorted(unknown)}')
    tree = {}
    for item in doc['resolutionOrder']:
        ref = item.get('$ref', '')
        kind, _, name = ref.partition('#/')[2].partition('/')
        if kind == 'sets':
            if name not in doc.get('sets', {}):
                raise TokenError(f'resolutionOrder references missing set {ref}')
            for part in _sources(doc, doc['sets'][name]['sources'], base):
                _merge(tree, part)
        elif kind == 'modifiers':
            mod = modifiers.get(name)
            if mod is None:
                raise TokenError(f'resolutionOrder references missing modifier {ref}')
            context = inputs.get(name, mod.get('default'))
            if context not in mod['contexts']:
                raise TokenError(f"modifier '{name}': unknown context {context!r} "
                                 f"(expected one of {sorted(mod['contexts'])})")
            for part in _sources(doc, mod['contexts'][context], base):
                _merge(tree, part)
        else:
            raise TokenError(f'resolutionOrder entries must reference #/sets/* or #/modifiers/*, got {ref!r}')
    return tree


def context_paths(modifier, context, resolver=RESOLVER):
    """Token paths declared by one modifier context (e.g. everything dark overrides)."""
    doc, base = _read(resolver), os.path.dirname(resolver)
    tree = {}
    for part in _sources(doc, doc['modifiers'][modifier]['contexts'][context], base):
        _merge(tree, part)
    return set(_collect(tree))


# ---- validation -------------------------------------------------------------
def _check_name(name, path):
    if name.startswith('$') or any(c in name for c in '{}.'):
        raise TokenError(f"{path or '(root)'}: invalid name {name!r} "
                         "(no '.', '{', '}', and no leading '$')")


def _collect(tree, path='', inherited=None, out=None):
    out = {} if out is None else out
    group_type = tree.get('$type', inherited) if isinstance(tree, dict) else inherited
    for key, node in tree.items():
        if key.startswith('$'):
            continue
        _check_name(key, path)
        p = f'{path}.{key}' if path else key
        if _is_token(node):
            bad = set(k for k in node if k.startswith('$')) - {
                '$value', '$type', '$description', '$extensions', '$deprecated'}
            if bad:
                raise TokenError(f'{p}: unknown token properties {sorted(bad)}')
            out[p] = Token(p, node.get('$type', group_type), node['$value'],
                           node.get('$description'), node.get('$extensions'))
        elif isinstance(node, dict):
            _collect(node, p, group_type, out)
        else:
            raise TokenError(f'{p}: expected a token (with $value) or a group')
    return out


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _check_value(t, v, type_, where):
    """Validate a literal value (or a sub-value alias) against its DTCG type."""
    if isinstance(v, str) and ALIAS.match(v):
        return  # alias: checked in _check_aliases
    ok = True
    if type_ == 'color':
        comps = v.get('components') if isinstance(v, dict) else None
        ok = (isinstance(v, dict) and v.get('colorSpace') == 'srgb' and isinstance(comps, list)
              and len(comps) == 3 and all(_num(c) and 0 <= c <= 1 for c in comps)
              and (_num(v.get('alpha', 1)) and 0 <= v.get('alpha', 1) <= 1))
        if ok and 'hex' in v:
            ok = bool(re.fullmatch(r'#[0-9A-Fa-f]{6}', v['hex'])) and all(
                round(c * 255) == int(v['hex'][1 + 2 * i:3 + 2 * i], 16) for i, c in enumerate(comps))
    elif type_ == 'dimension':
        ok = isinstance(v, dict) and _num(v.get('value')) and v.get('unit') in ('px', 'rem')
    elif type_ == 'duration':
        ok = isinstance(v, dict) and _num(v.get('value')) and v.get('unit') in ('ms', 's')
    elif type_ == 'number':
        ok = _num(v)
    elif type_ == 'fontFamily':
        ok = isinstance(v, str) or (isinstance(v, list) and v and all(isinstance(x, str) for x in v))
    elif type_ == 'fontWeight':
        ok = (_num(v) and 1 <= v <= 1000) or isinstance(v, str)
    elif type_ == 'cubicBezier':
        ok = isinstance(v, list) and len(v) == 4 and all(_num(x) for x in v) \
            and 0 <= v[0] <= 1 and 0 <= v[2] <= 1
    elif type_ == 'shadow':
        layers = v if isinstance(v, list) else [v]
        ok = bool(layers)
        for layer in layers:
            if not (isinstance(layer, dict) and {'color', 'offsetX', 'offsetY', 'blur', 'spread'} <= set(layer)):
                ok = False
                break
            _check_value(t, layer['color'], 'color', f'{where}.color')
            for k in ('offsetX', 'offsetY', 'blur', 'spread'):
                _check_value(t, layer[k], 'dimension', f'{where}.{k}')
    elif type_ == 'typography':
        ok = isinstance(v, dict) and {'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'} <= set(v)
        if ok:
            for k, sub in (('fontFamily', 'fontFamily'), ('fontSize', 'dimension'), ('fontWeight', 'fontWeight'),
                           ('letterSpacing', 'dimension'), ('lineHeight', 'number')):
                _check_value(t, v[k], sub, f'{where}.{k}')
    elif type_ == 'transition':
        ok = isinstance(v, dict) and {'duration', 'delay', 'timingFunction'} <= set(v)
        if ok:
            for k, sub in (('duration', 'duration'), ('delay', 'duration'), ('timingFunction', 'cubicBezier')):
                _check_value(t, v[k], sub, f'{where}.{k}')
    elif type_ not in TYPES:
        raise TokenError(f'{where}: unknown $type {type_!r}')
    if not ok:
        raise TokenError(f'{where}: invalid {type_} value {json.dumps(v)}')


def _sub_aliases(value):
    """Aliases used inside composite values: [(json path inside value, target)]."""
    found = []
    def walk(v, at):
        if isinstance(v, str) and ALIAS.match(v):
            found.append((at, ALIAS.match(v).group(1)))
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(x, f'{at}.{k}' if at else k)
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, f'{at}[{i}]')
    walk(value, '')
    return found


SUB_TYPES = {('typography', 'fontFamily'): 'fontFamily', ('typography', 'fontSize'): 'dimension',
             ('typography', 'fontWeight'): 'fontWeight', ('typography', 'letterSpacing'): 'dimension',
             ('typography', 'lineHeight'): 'number', ('transition', 'duration'): 'duration',
             ('transition', 'delay'): 'duration', ('transition', 'timingFunction'): 'cubicBezier'}


def _check_aliases(toks):
    for t in toks.values():
        if t.alias:
            seen, cur = [t.path], t
            while cur.alias:
                if cur.alias not in toks:
                    raise TokenError(f'{t.path}: alias {{{cur.alias}}} points to no token')
                if cur.alias in seen:
                    raise TokenError(f"{t.path}: alias cycle {' -> '.join(seen + [cur.alias])}")
                seen.append(cur.alias)
                cur = toks[cur.alias]
            if toks[t.alias].type != t.type:
                raise TokenError(f'{t.path}: $type {t.type!r} does not match alias target '
                                 f'{t.alias} ({toks[t.alias].type!r})')
        else:
            for at, target in _sub_aliases(t.value):
                if target not in toks:
                    raise TokenError(f'{t.path}.{at}: alias {{{target}}} points to no token')
                want = SUB_TYPES.get((t.type, at.split('.')[0]))
                if want and toks[target].type != want:
                    raise TokenError(f'{t.path}.{at}: alias {{{target}}} is {toks[target].type!r}, '
                                     f'expected {want!r}')


def tokens(inputs=None, resolver=RESOLVER):
    """Validated {path: Token} for one set of modifier inputs."""
    toks = _collect(resolve(inputs, resolver))
    for t in toks.values():
        if t.type is None:
            raise TokenError(f'{t.path}: no $type (set it on the token or a parent group)')
        if t.type not in TYPES:
            raise TokenError(f'{t.path}: unknown $type {t.type!r}')
        _check_value(t, t.value, t.type, t.path)
    _check_aliases(toks)
    return toks


def validate(resolver=RESOLVER):
    """Validate every context of every modifier. Returns {context: token count}."""
    doc = _read(resolver)
    counts = {'(defaults)': len(tokens({}, resolver))}
    for name, mod in doc.get('modifiers', {}).items():
        for context in mod['contexts']:
            counts[f'{name}={context}'] = len(tokens({name: context}, resolver))
    return counts


# ---- CSS formatting ---------------------------------------------------------
def _n(v):
    return str(int(v)) if float(v).is_integer() else format(v, 'g')


def _short(v):
    """Number without a leading zero, as written in the legacy CSS (.2, .16, 0, 1)."""
    s = _n(v)
    return s[1:] if s.startswith('0.') else ('-' + s[2:] if s.startswith('-0.') else s)


def css_color(v):
    rgb = [round(c * 255) for c in v['components']]
    alpha = v.get('alpha', 1)
    if alpha < 1:   # the legacy CSS wrote alpha with two decimals and no leading zero: / .07, / .30
        return f'rgb({rgb[0]} {rgb[1]} {rgb[2]} / {format(alpha, ".2f")[1:]})'
    return v.get('hex') or '#' + ''.join(f'{c:02X}' for c in rgb)


def css_dimension(v):
    return f"{_n(v['value'])}{v['unit']}"


def css_shadow(v):
    layers = v if isinstance(v, list) else [v]
    def d(x):
        return '0' if x['value'] == 0 else css_dimension(x)
    parts = []
    for s in layers:
        spread = '' if s['spread']['value'] == 0 else ' ' + d(s['spread'])
        parts.append(f"{d(s['offsetX'])} {d(s['offsetY'])} {d(s['blur'])}{spread} {css_color(s['color'])}")
    return ', '.join(parts)


def css(t, toks):
    """CSS text of a token value (aliases followed, $extensions css preferred)."""
    while t.alias:
        t = toks[t.alias]
    if t.css is not None:
        return t.css
    v = t.value
    return {
        'color': lambda: css_color(v),
        'dimension': lambda: css_dimension(v),
        'duration': lambda: f"{_n(v['value'])}{v['unit']}",
        'number': lambda: v,
        'cubicBezier': lambda: 'cubic-bezier(' + ','.join(_short(x) for x in v) + ')',
        'shadow': lambda: css_shadow(v),
        'fontWeight': lambda: v,
        'fontFamily': lambda: v if isinstance(v, str) else ', '.join(v),
    }[t.type]()


# ---- legacy view for the generators (and the deprecated compat JSON) ----------
# Groups whose descendants were written as dotted keys in the legacy shape ("hover.background").
_FLATTEN = re.compile(r'^(color\.component\.button\.[^.]+|color\.component\.(?!button$)[^.]+|'
                      r'typography\.scale|motion\.preset|icon\.color)$')
# the legacy shape kept these notes as plain keys; DTCG keeps them as the group $description.
_NOTE_KEYS = {'shadow': 'note', 'motion': 'reducedMotionNote', 'visualization': 'colorblindNote'}


def legacy_view(resolver=RESOLVER):
    """The token data in the legacy JSON shape, built from the DTCG source.

    Themed tokens become {"light", "dark"}, aliases {"ref"}, unthemed component
    literals {"fixed"}; every value is CSS text as in the legacy shape."""
    light, dark = tokens({'theme': 'light'}, resolver), tokens({'theme': 'dark'}, resolver)
    dark_paths = context_paths('theme', 'dark', resolver)
    tree_light = resolve({'theme': 'light'}, resolver)

    def node(p):
        t = light[p]
        if t.alias:
            return {'ref': t.alias}
        if p in dark_paths:
            return {'light': css(t, light), 'dark': css(dark[p], dark)}
        if p.startswith('color.component.'):
            return {'fixed': css(t, light)}
        return css(t, light)

    def last(alias):
        return alias.split('.')[-1]

    def composite(p):
        t, ext = light[p], light[p].extensions.get(EXT, {})
        if t.type == 'typography':
            v, c = t.value, ext.get('css', {})
            out = {'size': c.get('fontSize') or css_dimension(v['fontSize']),
                   'lineHeight': v['lineHeight'], 'weight': v['fontWeight'],
                   'letterSpacing': c.get('letterSpacing') or css_dimension(v['letterSpacing'])}
            if 'textTransform' in ext:
                out['transform'] = ext['textTransform']
            out['family'] = last(ALIAS.match(v['fontFamily']).group(1))
            return out
        if t.type == 'transition':
            c = ext.get('css', {})
            out = {k: c[k] for k in ('from', 'to') if k in c}
            out['duration'] = last(ALIAS.match(t.value['duration']).group(1))
            out['ease'] = last(ALIAS.match(t.value['timingFunction']).group(1))
            return out
        if p.startswith('visualization.series.'):
            return {'color': css(t, light), 'name': t.description, 'pattern': ext['pattern']}
        return None

    def build(group, path):
        out = {}
        for key, child in group.items():
            if key.startswith('$'):
                continue
            p = f'{path}.{key}' if path else key
            if _is_token(child):
                out[key] = composite(p) or node(p)
            elif _FLATTEN.match(p):
                out[key] = {sub[len(p) + 1:]: (composite(sub) or node(sub))
                            for sub in light if sub.startswith(p + '.')}
            else:
                out[key] = build(child, p)
        if path in _NOTE_KEYS and group.get('$description'):
            out[_NOTE_KEYS[path]] = group['$description']
            if path == 'visualization':   # the legacy shape placed this note right after "series"
                keys = list(out)
                keys.insert(keys.index('series') + 1, keys.pop())
                out = {k: out[k] for k in keys}
        if path == 'spacing':
            out = {k.replace('_', '.'): v for k, v in out.items()}
        return out

    view = {'brand': tree_light.get('$extensions', {}).get(EXT, {}).get('brand', {})}
    view.update(build(tree_light, ''))
    return view


if __name__ == '__main__':
    for ctx, n in validate().items():
        print(f'{ctx}: {n} tokens valid')
