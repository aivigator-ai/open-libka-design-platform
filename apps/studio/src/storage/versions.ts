/**
 * Version history: automatic snapshots after a pause in typing (at most every few minutes), safety snapshots before
 * anything replaces the text, and versions the author names. Restoring adds a version too, so nothing is lost.
 */
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { StudioDb, VersionKind, VersionRecord } from './db.ts';

/** A pause in typing this long may take an automatic snapshot… */
export const AUTO_PAUSE_MS = 3000;
/** …but at most this often. */
export const AUTO_EVERY_MS = 5 * 60_000;
/** Automatic and safety versions kept per project; named ones are always kept. */
export const KEEP_UNNAMED = 50;

export const pack = (text: string): Uint8Array => gzipSync(strToU8(text), { mtime: 0 });
export const unpack = (v: Pick<VersionRecord, 'data'>): string => strFromU8(gunzipSync(v.data));

/** Whether a pause in typing should take an automatic snapshot now. */
export function autoDue(now: number, lastAuto: number | null): boolean {
  return lastAuto === null || now - lastAuto >= AUTO_EVERY_MS;
}

/**
 * Records the text as a version. An automatic or safety version is skipped when the text equals the newest version's
 * (returns null); a named one is always recorded. Old unnamed versions beyond KEEP_UNNAMED are removed.
 */
export async function recordVersion(db: StudioDb, project: string, text: string, kind: VersionKind, label = '', now = Date.now()): Promise<VersionRecord | null> {
  const list = await db.listVersions(project);
  if (kind !== 'named' && list[0] && list[0].size === text.length && unpack(list[0]) === text) return null;
  const v: VersionRecord = { project, created: now, kind, label, size: text.length, data: pack(text) };
  v.id = await db.addVersion(v);
  const unnamed = [v, ...list].filter((x) => x.kind !== 'named');
  if (unnamed.length > KEEP_UNNAMED) await db.deleteVersions(unnamed.slice(KEEP_UNNAMED).map((x) => x.id!));
  return v;
}

/** When the last automatic version was taken (null when there is none). */
export async function lastAutoAt(db: StudioDb, project: string): Promise<number | null> {
  return (await db.listVersions(project)).find((v) => v.kind === 'auto')?.created ?? null;
}
