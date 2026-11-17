/**
 * The resolved design: what the renderers take. A brand × a theme, solved and locked, with the facts a signed
 * manifest records about it. LibKa's default design is LibKa's brand × the Classic theme; its outputs are today's
 * token build, byte for byte (the golden test).
 */
import { LIBKA_BRAND, type Brand } from './brand.ts';
import { SOLVER_ID } from './solver.ts';
import { design, lockHash, lockText, type Design } from './lock.ts';
import { builtinTheme, DEFAULT_THEME_ID, type Theme } from './theme.ts';

export interface ResolvedDesign {
  readonly design: Design;
  /** The lock, as its canonical text. */
  readonly lock: string;
  /** SHA-256 of the lock text. */
  readonly lockHash: string;
  /** LibKa's default design (LibKa's brand, the Classic theme). */
  readonly isDefault: boolean;
}

/** What a manifest says about the design an output was built with. */
export interface ManifestDesign {
  /** The brand's seam fields, when it has them, and the SHA-256 of the brand as LibKa read it. */
  readonly brand: { readonly id?: string; readonly version?: string; readonly issuer?: string; readonly sha256: string };
  /** The theme's id and the SHA-256 of the theme as LibKa read it. */
  readonly theme: { readonly id: string; readonly sha256: string };
  readonly solver: string;
  /** SHA-256 of the design's lock. */
  readonly lock: string;
}

const classic = (): Theme => builtinTheme(DEFAULT_THEME_ID)!;
let defaultLock: string | undefined;

/** A brand × a theme, solved and locked; LibKa's brand and the Classic theme when none is given. */
export function resolveDesign(brand: Brand = LIBKA_BRAND, theme: Theme = classic()): ResolvedDesign {
  const d = design(brand, theme);
  const lock = lockText(d);
  defaultLock ??= brand === LIBKA_BRAND && theme.id === DEFAULT_THEME_ID ? lock : lockText(design(LIBKA_BRAND, classic()));
  return { design: d, lock, lockHash: lockHash(lock), isDefault: lock === defaultLock };
}

export function manifestDesign(r: ResolvedDesign): ManifestDesign {
  const { brand, theme, inputs } = r.design;
  return {
    brand: {
      ...(brand.id ? { id: brand.id } : {}), ...(brand.version ? { version: brand.version } : {}),
      ...(brand.issuer ? { issuer: brand.issuer } : {}), sha256: inputs.brand,
    },
    theme: { id: theme.id, sha256: inputs.theme },
    solver: SOLVER_ID,
    lock: r.lockHash,
  };
}
