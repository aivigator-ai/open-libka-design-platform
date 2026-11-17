/**
 * The brand and theme files' problem codes for docs/problem-codes.md: one file per code that makes it happen, the
 * code's severity and an example of its message. The test of the codes checks each sample produces its code.
 */
import { parseBrand } from './brand.ts';
import { parseTheme } from './theme.ts';
import type { DesignProblem } from './problems.ts';

const T = (fields: Record<string, unknown>) => JSON.stringify({
  $schema: './theme-1.schema.json', id: 'house', name: { en: 'House', cs: 'Domácí' }, fonts: { heading: 'fraunces', body: 'inter' },
  scale: 'standard', headings: 'standard', density: 'comfortable', radius: 'medium', ...fields,
});

/** A brand file (`brand`) or a theme file (`theme`) per code. */
export const DESIGN_SAMPLES: Readonly<Record<string, { readonly file: 'brand' | 'theme'; readonly text: string }>> = {
  'brand-yaml': { file: 'brand', text: 'color: [unclosed\n' },
  'brand-not-object': { file: 'brand', text: '- a list\n' },
  'brand-key-unknown': { file: 'brand', text: 'colour:\n  primary: "#0F8FA1"\n' },
  'brand-key-unsupported': { file: 'brand', text: 'meta:\n  name: Acme\n  description: Our company\n' },
  'brand-meta': { file: 'brand', text: 'meta: Acme\n' },
  'brand-color': { file: 'brand', text: 'color: "#0F8FA1"\n' },
  'brand-color-format': { file: 'brand', text: 'color:\n  primary: teal\n' },
  'brand-color-not-applied': { file: 'brand', text: 'color:\n  primary: "#0F8FA1"\n  background: "#FAFAFA"\n' },
  'brand-typography': { file: 'brand', text: 'typography: Inter\n' },
  'brand-font-unknown': { file: 'brand', text: 'typography:\n  base: Comic Sans\n' },
  'brand-font-role': { file: 'brand', text: 'typography:\n  base: Space Grotesk\n' },
  'brand-font-source': { file: 'brand', text: 'typography:\n  fonts:\n    - family: Inter\n      source: google\n' },
  'brand-logo': { file: 'brand', text: 'logo: 42\n' },
  'brand-logo-path': { file: 'brand', text: 'meta:\n  name: Acme\nlogo: https://example.com/logo.svg\n' },
  'brand-logo-format': { file: 'brand', text: 'meta:\n  name: Acme\nlogo: logo.jpg\n' },
  'brand-logo-alt': { file: 'brand', text: 'logo: logo.svg\n' },
  'brand-defaults': { file: 'brand', text: 'defaults: libka\n' },
  'brand-defaults-other': { file: 'brand', text: 'defaults:\n  quarto:\n    format: html\n' },
  'brand-id': { file: 'brand', text: 'defaults:\n  libka:\n    id: Acme Corp\n' },
  'brand-version': { file: 'brand', text: 'defaults:\n  libka:\n    version: [1]\n' },
  'brand-issuer': { file: 'brand', text: 'defaults:\n  libka:\n    issuer: ""\n' },
  'brand-neutral': { file: 'brand', text: 'defaults:\n  libka:\n    neutral: grey\n' },
  'brand-theme': { file: 'brand', text: 'defaults:\n  libka:\n    theme: ../themes/house.json\n' },
  'brand-charts': { file: 'brand', text: 'defaults:\n  libka:\n    charts: "#0F8FA1"\n' },
  'theme-json': { file: 'theme', text: '{ "id": "house", }' },
  'theme-not-object': { file: 'theme', text: '["house"]' },
  'theme-key-unknown': { file: 'theme', text: T({ colors: { primary: '#0F8FA1' } }) },
  'theme-schema': { file: 'theme', text: T({ $schema: undefined }) },
  'theme-schema-version': { file: 'theme', text: T({ $schema: './theme-2.schema.json' }) },
  'theme-id': { file: 'theme', text: T({ id: 'House Theme' }) },
  'theme-words': { file: 'theme', text: T({ name: 'House' }) },
  'theme-fonts': { file: 'theme', text: T({ fonts: 'inter' }) },
  'theme-font-unknown': { file: 'theme', text: T({ fonts: { heading: 'helvetica', body: 'inter' } }) },
  'theme-font-role': { file: 'theme', text: T({ fonts: { heading: 'fraunces', body: 'space-grotesk' } }) },
  'theme-value': { file: 'theme', text: T({ radius: 'round' }) },
};

/** The problems a sample makes. */
export function sampleProblems(code: string): readonly DesignProblem[] {
  const s = DESIGN_SAMPLES[code];
  if (!s) throw new Error(`no sample for ${code}`);
  return s.file === 'brand' ? parseBrand(s.text).problems : parseTheme(s.text).problems;
}

/** The rows of the brand and theme codes' table: code, severity, file, an example message. */
export function designCodeRows(): { code: string; severity: string; file: string; message: string }[] {
  return Object.keys(DESIGN_SAMPLES).sort().map((code) => {
    const p = sampleProblems(code).find((x) => x.code === code);
    if (!p) throw new Error(`the sample for ${code} does not make it`);
    return { code, severity: p.severity, file: DESIGN_SAMPLES[code]!.file === 'brand' ? 'brand' : 'theme', message: `${p.path && !p.message.includes(p.path) ? `${p.path}: ` : ''}${p.message}` };
  });
}
