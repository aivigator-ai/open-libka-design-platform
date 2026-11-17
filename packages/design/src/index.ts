/**
 * @libka/design: brands and themes, and the solver that makes every brand × theme pass.
 *
 * - `parseBrand` reads a brand.yml subset; `parseTheme` a `.theme.json` (format 1); both report problems by path.
 * - `solve` derives every colour role of the four modes from a brand's colours; `gate` checks every pair the token
 *   build gates, with a strict margin; `design` combines a brand and a theme; `lockText` records the result.
 * - Browser-safe and deterministic: no Node APIs, no `Math.pow`, `cbrt` or trigonometry in the colour arithmetic.
 */
export * from './color.ts';
export * from './palette-model.ts';
export * from './gates.ts';
export * from './fonts.ts';
export * from './problems.ts';
export * from './theme.ts';
export * from './brand.ts';
export * from './solver.ts';
export * from './lock.ts';
export * from './resolve.ts';
export * from './css.ts';
export * from './codes.ts';
export * from './words.ts';
export * from './charts.ts';
export { sha256Bytes, sha256Hex } from './sha256.ts';
export { SRGB_LINEAR } from './srgb-table.ts';
