import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES, FONTS, builtinTheme, parseTheme, themeFile, validateTheme } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '..', 'schema', 'theme-1.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const schemaValid = ajv.compile(schema);
const classic = { $schema: './theme-1.schema.json', ...builtinTheme('classic')! };

describe('the built-in themes', () => {
  it('are Classic (today\'s look) and Modern', () => {
    expect(BUILTIN_THEMES.map((t) => t.id)).toEqual(['classic', 'modern']);
    expect(builtinTheme('classic')).toMatchObject({ fonts: { heading: 'fraunces', body: 'inter' }, density: 'comfortable', radius: 'medium', scale: 'standard', headings: 'standard' });
    expect(builtinTheme('modern')!.fonts).toEqual({ heading: 'space-grotesk', body: 'inter' });
  });
  for (const t of BUILTIN_THEMES) {
    it(`${t.id} passes the validator and the JSON Schema as a file`, () => {
      const text = themeFile(t);
      expect(parseTheme(text)).toEqual({ theme: t, problems: [] });
      expect(schemaValid(JSON.parse(text)), JSON.stringify(schemaValid.errors)).toBe(true);
    });
  }
});

describe('the theme file\'s allowlist', () => {
  const invalid: Array<[string, Record<string, unknown>, string]> = [
    ['an unknown key', { ...classic, css: 'body { color: red }' }, 'theme-key-unknown'],
    ['a missing $schema', { ...classic, $schema: undefined }, 'theme-schema'],
    ['a later format', { ...classic, $schema: 'https://example.org/theme-2.schema.json' }, 'theme-schema-version'],
    ['a bad id', { ...classic, id: 'My Theme' }, 'theme-id'],
    ['a name in one language', { ...classic, name: { en: 'Classic' } }, 'theme-words'],
    ['an unknown font', { ...classic, fonts: { heading: 'comic-sans', body: 'inter' } }, 'theme-font-unknown'],
    ['a heading-only font as the body', { ...classic, fonts: { heading: 'inter', body: 'space-grotesk' } }, 'theme-font-role'],
    ['a mono font', { ...classic, fonts: { heading: 'inter', body: 'inter', mono: 'jetbrains-mono' } }, 'theme-key-unknown'],
    ['a density outside the list', { ...classic, density: 'spacious' }, 'theme-value'],
    ['a radius in pixels', { ...classic, radius: '12px' }, 'theme-value'],
  ];
  for (const [name, data, code] of invalid) {
    it(`rejects ${name} (${code}), as the JSON Schema does`, () => {
      const clean = JSON.parse(JSON.stringify(data));
      const r = validateTheme(clean);
      expect(r.theme).toBeNull();
      expect(r.problems.map((p) => p.code)).toContain(code);
      expect(schemaValid(clean)).toBe(false);
    });
  }
  it('suggests the nearest value', () => {
    expect(validateTheme({ ...classic, density: 'compakt' }).problems[0]!.message).toMatch(/Did you mean "compact"\?/);
  });
  it('reports a file that is not JSON', () => {
    expect(parseTheme('{ id: classic }').problems[0]!.code).toBe('theme-json');
  });
});

describe('the JSON Schema', () => {
  it('lists exactly the fonts each role may take', () => {
    const p = schema.properties.fonts.properties;
    expect(p.heading.enum).toEqual(FONTS.filter((f) => f.roles.includes('heading')).map((f) => f.id));
    expect(p.body.enum).toEqual(FONTS.filter((f) => f.roles.includes('body')).map((f) => f.id));
  });
});
