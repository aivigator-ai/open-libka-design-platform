/**
 * The design and its lock. A design is a brand × a theme: the solved palette, the fonts (the brand's, else the
 * theme's), the theme's choices and the hashes of its inputs. The lock (`<brand>.<theme>.design.lock.json`) records
 * it as canonical JSON (sorted keys, two-space indent, LF, upper-case hex), so a newer solver never changes an older
 * document's colours silently: a build uses the lock while its input hashes match, and solves again (and says so)
 * when they do not. The manifest records the lock's hash.
 */
import type { Brand } from './brand.ts';
import { fontById, type Font } from './fonts.ts';
import { DEFAULT, type Palette, type PaletteValues } from './palette-model.ts';
import { sha256Hex } from './sha256.ts';
import { SOLVER_ID, solve, type RoleResult } from './solver.ts';
import { SRGB_LINEAR } from './srgb-table.ts';
import type { Theme } from './theme.ts';
import type { GateResult } from './gates.ts';
import { solveCharts, type Charts } from './charts.ts';

export const LOCK_FORMAT = 1;

/** JSON with every object's keys sorted, two-space indent and a final LF. */
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

export const hashOf = (value: unknown): string => sha256Hex(canonical(value));

export interface DesignInputs {
  readonly brand: string;
  readonly theme: string;
  /** The sRGB table and the base palette the solver read. */
  readonly table: string;
  readonly palette: string;
}

export interface Design {
  readonly brand: Brand;
  readonly theme: Theme;
  readonly fonts: { readonly heading: Font; readonly body: Font; readonly mono: Font };
  readonly palette: PaletteValues;
  readonly roles: readonly RoleResult[];
  /** The chart series per mode, solved like the palette. */
  readonly charts: Charts;
  readonly gates: GateResult;
  readonly pinned: boolean;
  readonly inputs: DesignInputs;
}

export function inputsOf(brand: Brand, theme: Theme, base: Palette = DEFAULT): DesignInputs {
  return { brand: hashOf(brand), theme: hashOf(theme), table: hashOf(SRGB_LINEAR), palette: hashOf(base) };
}

/** A brand × a theme, solved. The fonts a brand names replace the theme's. */
export function design(brand: Brand, theme: Theme, base: Palette = DEFAULT): Design {
  const solution = solve(brand, base);
  const font = (id: string) => {
    const f = fontById(id);
    if (!f) throw new Error(`unknown font: ${id}`);
    return f;
  };
  return {
    brand, theme,
    fonts: { heading: font(brand.fonts.heading ?? theme.fonts.heading), body: font(brand.fonts.body ?? theme.fonts.body), mono: font('jetbrains-mono') },
    palette: solution.values, roles: solution.roles, charts: solveCharts(brand, solution.values), gates: solution.gates, pinned: solution.pinned,
    inputs: inputsOf(brand, theme, base),
  };
}

export interface Lock {
  readonly format: typeof LOCK_FORMAT;
  readonly solver: typeof SOLVER_ID;
  readonly inputs: DesignInputs;
  readonly brand: string | null;
  readonly theme: string;
  readonly pinned: boolean;
  readonly fonts: { readonly heading: string; readonly body: string; readonly mono: string };
  readonly palette: PaletteValues;
  readonly charts: Readonly<Record<string, readonly string[]>>;
  readonly roles: readonly RoleResult[];
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** The lock of a design, as its canonical text. */
export function lockText(d: Design): string {
  if (d.gates.failures.length) throw new Error(`a design that fails ${d.gates.failures.length} check(s) cannot be locked`);
  const lock: Lock = {
    format: LOCK_FORMAT, solver: SOLVER_ID, inputs: d.inputs, brand: d.brand.id ?? null, theme: d.theme.id, pinned: d.pinned,
    fonts: { heading: d.fonts.heading.id, body: d.fonts.body.id, mono: d.fonts.mono.id },
    palette: d.palette,
    charts: d.charts.series,
    roles: d.roles.map((r) => ({ ...r, ratio: round4(r.ratio) })),
  };
  return canonical(lock);
}

export const lockHash = (text: string): string => sha256Hex(text);

/** Read a lock; null when it is not one this LibKa wrote. */
export function readLock(text: string): Lock | null {
  try {
    const lock = JSON.parse(text) as Lock;
    return lock && lock.format === LOCK_FORMAT && lock.solver === SOLVER_ID && lock.inputs && lock.palette ? lock : null;
  } catch {
    return null;
  }
}

/** Whether a lock was made from these inputs (so a build may use it as it is). */
export function lockMatches(lock: Lock, inputs: DesignInputs): boolean {
  return lock.inputs.brand === inputs.brand && lock.inputs.theme === inputs.theme
    && lock.inputs.table === inputs.table && lock.inputs.palette === inputs.palette;
}

/** A design's file name for its lock. */
export const lockName = (brandId: string, themeId: string): string => `${brandId}.${themeId}.design.lock.json`;
