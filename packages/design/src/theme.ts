/**
 * A theme: a design style, independent of the brand (typography, density, radius). A theme file only selects:
 * every choice is an id or an enum whose CSS LibKa ships, so no theme can carry free CSS or a failing colour. Plain
 * JSON with a JSON Schema (`schema/theme-1.schema.json`); the format's version is the number in `$schema`.
 *
 * Format 1 holds the type pairing, the type scale, the heading weight, density and corner radius.
 */
import { FONTS, fontById, type FontRole } from './fonts.ts';
import { hasErrors, problem, suggestion, type DesignProblem } from './problems.ts';

export const THEME_VERSION = 1;
export const THEME_SCALES = ['standard', 'large'] as const;
export const THEME_HEADINGS = ['standard', 'bold'] as const;
export const THEME_DENSITIES = ['comfortable', 'compact'] as const;
export const THEME_RADII = ['none', 'small', 'medium', 'large'] as const;

export interface Words { readonly en: string; readonly cs: string }

export interface Theme {
  readonly id: string;
  readonly name: Words;
  readonly description?: Words;
  readonly fonts: { readonly heading: string; readonly body: string };
  readonly scale: (typeof THEME_SCALES)[number];
  readonly headings: (typeof THEME_HEADINGS)[number];
  readonly density: (typeof THEME_DENSITIES)[number];
  readonly radius: (typeof THEME_RADII)[number];
}

export const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/** A theme file's path, relative and inside the project (no address, no absolute path, no `..`). */
export const isThemePath = (path: string): boolean =>
  /\.theme\.json$/i.test(path) && !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.startsWith('/') && !path.split(/[\\/]/).includes('..');
const KEYS = ['$schema', 'id', 'name', 'description', 'fonts', 'scale', 'headings', 'density', 'radius'] as const;
const SCHEMA = /(?:^|\/)theme-(\d+)\.schema\.json$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function words(v: unknown, path: string, problems: DesignProblem[]): Words | undefined {
  if (!isObject(v) || typeof v.en !== 'string' || typeof v.cs !== 'string' || !v.en.trim() || !v.cs.trim()) {
    problems.push(problem('theme-words', 'error', path, `${path} needs "en" and "cs", each a non-empty string.`));
    return undefined;
  }
  for (const k of Object.keys(v)) if (k !== 'en' && k !== 'cs') problems.push(problem('theme-key-unknown', 'error', `${path}.${k}`, `${path} takes only "en" and "cs".`));
  return { en: v.en, cs: v.cs };
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string, problems: DesignProblem[]): T | undefined {
  if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
  problems.push(problem('theme-value', 'error', path,
    `${path} must be one of ${options.map((o) => `"${o}"`).join(', ')}${typeof v === 'string' ? `, not "${v}".${suggestion(v, options)}` : '.'}`));
  return undefined;
}

function fontFor(v: unknown, role: FontRole, path: string, problems: DesignProblem[]): string | undefined {
  const ids = FONTS.filter((f) => f.roles.includes(role)).map((f) => f.id);
  if (typeof v !== 'string' || !fontById(v)) {
    problems.push(problem('theme-font-unknown', 'error', path,
      `${path} must name a font from LibKa's list: ${ids.join(', ')}${typeof v === 'string' ? `.${suggestion(v, FONTS.map((f) => f.id))}` : '.'}`));
    return undefined;
  }
  if (!fontById(v)!.roles.includes(role)) {
    problems.push(problem('theme-font-role', 'error', path, `${fontById(v)!.family} cannot be the ${role} font; for the ${role} use one of: ${ids.join(', ')}.`));
    return undefined;
  }
  return v;
}

/** Validate a parsed theme file against the allowlist. Every key outside it is an error, never ignored. */
export function validateTheme(data: unknown): { theme: Theme | null; problems: DesignProblem[] } {
  const problems: DesignProblem[] = [];
  if (!isObject(data)) return { theme: null, problems: [problem('theme-not-object', 'error', '', 'A theme file is a JSON object.')] };
  for (const k of Object.keys(data))
    if (!(KEYS as readonly string[]).includes(k)) problems.push(problem('theme-key-unknown', 'error', k, `"${k}" is not a theme setting.${suggestion(k, KEYS)}`));

  const schema = data.$schema;
  const version = typeof schema === 'string' ? SCHEMA.exec(schema)?.[1] : undefined;
  if (version === undefined) problems.push(problem('theme-schema', 'error', '$schema', `"$schema" must point to a LibKa theme schema, ending in theme-${THEME_VERSION}.schema.json.`));
  else if (Number(version) !== THEME_VERSION) problems.push(problem('theme-schema-version', 'error', '$schema', `This LibKa reads theme format ${THEME_VERSION}, not ${version}.`));

  const id = typeof data.id === 'string' && ID.test(data.id) ? data.id : undefined;
  if (!id) problems.push(problem('theme-id', 'error', 'id', '"id" must be lower-case letters, digits and hyphens (for example "modern").'));
  const name = words(data.name, 'name', problems);
  const description = data.description === undefined ? undefined : words(data.description, 'description', problems);

  let fonts: Theme['fonts'] | undefined;
  if (!isObject(data.fonts)) problems.push(problem('theme-fonts', 'error', 'fonts', '"fonts" needs "heading" and "body".'));
  else {
    for (const k of Object.keys(data.fonts)) if (k !== 'heading' && k !== 'body') problems.push(problem('theme-key-unknown', 'error', `fonts.${k}`, `"fonts" takes only "heading" and "body" (code always uses JetBrains Mono).`));
    const heading = fontFor(data.fonts.heading, 'heading', 'fonts.heading', problems);
    const body = fontFor(data.fonts.body, 'body', 'fonts.body', problems);
    if (heading && body) fonts = { heading, body };
  }
  const scale = oneOf(data.scale, THEME_SCALES, 'scale', problems);
  const headings = oneOf(data.headings, THEME_HEADINGS, 'headings', problems);
  const density = oneOf(data.density, THEME_DENSITIES, 'density', problems);
  const radius = oneOf(data.radius, THEME_RADII, 'radius', problems);

  if (hasErrors(problems) || !id || !name || !fonts || !scale || !headings || !density || !radius) return { theme: null, problems };
  return { theme: { id, name, ...(description ? { description } : {}), fonts, scale, headings, density, radius }, problems };
}

/** Parse and validate the text of a `.theme.json` file. */
export function parseTheme(text: string): { theme: Theme | null; problems: DesignProblem[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { theme: null, problems: [problem('theme-json', 'error', '', `The theme file is not valid JSON: ${(e as Error).message}`)] };
  }
  return validateTheme(data);
}

const schemaRef = `theme-${THEME_VERSION}.schema.json`;

/** The built-in themes. */
export const BUILTIN_THEMES: readonly Theme[] = [
  {
    id: 'classic',
    name: { en: 'Classic', cs: 'Klasický' },
    description: { en: 'LibKa\'s own look: Fraunces headings over Inter.', cs: 'Vzhled LibKa: nadpisy ve Fraunces, text v Inter.' },
    fonts: { heading: 'fraunces', body: 'inter' },
    scale: 'standard', headings: 'standard', density: 'comfortable', radius: 'medium',
  },
  {
    id: 'modern',
    name: { en: 'Modern', cs: 'Moderní' },
    description: { en: 'A grotesque for titles and slides: Space Grotesk headings over Inter.', cs: 'Groteskní písmo pro nadpisy a snímky: Space Grotesk nad textem v Inter.' },
    fonts: { heading: 'space-grotesk', body: 'inter' },
    scale: 'standard', headings: 'bold', density: 'comfortable', radius: 'small',
  },
];

export const DEFAULT_THEME_ID = 'classic';

export function builtinTheme(id: string): Theme | undefined {
  return BUILTIN_THEMES.find((t) => t.id === id);
}

/** A theme as the file a project would write (for the schema test and as a starting point). */
export function themeFile(theme: Theme, schemaPath = `./${schemaRef}`): string {
  return `${JSON.stringify({ $schema: schemaPath, ...theme }, null, 2)}\n`;
}
