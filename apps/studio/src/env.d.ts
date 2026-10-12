/** Modules the build (build.mjs) generates. */
declare module 'studio:assets' {
  import type { ManualStyles } from '@libka/render';
  /** The stylesheets every rendered page and deck carries. */
  export const styles: ManualStyles & { deck: string };
  export const tokensVersion: string;
  export const axeVersion: string;
  /** Where axe-core's script is served (it is loaded into the check frame when Guard first runs). */
  export const axeUrl: string;
  /** The LibKa fonts' stylesheet, relative to the Studio. */
  export const fontsHref: string;
  /** The Studio's own version (the build's content hash), shown in the status bar. */
  export const buildId: string;
}

declare module 'studio:about' {
  /** What the About dialog says (hosting.mjs): the product version, the source repository when the build knows it, and for a hosted copy who provides it. */
  export const about: {
    version: string;
    source: string | null;
    hosted: { by: string; siteUrl: string | null; imprintUrl: { en: string; cs: string } | null; privacyUrl: { en: string; cs: string } | null } | null;
  };
}

declare module 'studio:audit' {
  /** The self-audit's results (audit/audit.ts): criteria that are supported, partly, not, or do not apply. */
  export const counts: { supports: number; partial: number; not: number; na: number };
  /** What the audit does not cover, in both languages. */
  export const limits: { en: string; cs: string }[];
}

declare module 'studio:tutorial' {
  /** The tutorial document in each interface language, and its picture. */
  export const sources: { en: string; cs: string };
  export const files: Record<string, Uint8Array>;
}

declare module 'studio:example' {
  /** The example manual: its file name, text and the files it uses. */
  export const name: string;
  export const source: string;
  export const files: Record<string, Uint8Array>;
}
