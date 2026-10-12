/** The library's operations on stored projects: create, copy, rename, and read a project with its files. */
import { parse } from '@libka/model';
import type { FileRecord, ProjectRecord, StudioDb } from './db.ts';
import { markdownName, typeOf } from './paths.ts';

export const newId = (): string => crypto.randomUUID();

/** The document title from the front matter (empty when there is none or it cannot be read). */
export function titleOf(source: string): string {
  try { return parse(source).document.meta.title?.trim() ?? ''; } catch { return ''; }
}

/** The name the library shows: the document title, or the file name without `.md`. */
export const displayName = (p: Pick<ProjectRecord, 'title' | 'name'>): string => p.title || p.name.replace(/\.(md|markdown)$/i, '');

export interface NewProject {
  name: string;
  source: string;
  files?: Map<string, Uint8Array>;
  origin: ProjectRecord['origin'];
  mode?: ProjectRecord['mode'];
}

/** Stores a new project with its files; returns it. */
export async function createProject(db: StudioDb, p: NewProject, now = Date.now()): Promise<ProjectRecord> {
  const record: ProjectRecord = { id: newId(), name: markdownName(p.name), title: titleOf(p.source), source: p.source, created: now, updated: now, opened: now, origin: p.origin, ...(p.mode ? { mode: p.mode } : {}) };
  const files: FileRecord[] = [...(p.files ?? new Map<string, Uint8Array>())].map(([path, data]) => ({ project: record.id, path, type: typeOf(path), data }));
  await db.putProjectWithFiles(record, files);
  return record;
}

/** The project's files by path. */
export async function filesOf(db: StudioDb, project: string): Promise<Map<string, Uint8Array>> {
  return new Map((await db.listFiles(project)).map((f) => [f.path, f.data]));
}

/** A copy of a project with its files (not its versions); the copy's file name says it is one (`guide-copy.md`). */
export async function duplicateProject(db: StudioDb, id: string, copyLabel: string, now = Date.now()): Promise<ProjectRecord> {
  const p = await db.getProject(id);
  if (!p) throw new Error('the project is gone');
  const name = `${p.name.replace(/\.(md|markdown)$/i, '')}-${copyLabel}`;
  return createProject(db, { name, source: p.source, files: await filesOf(db, id), origin: 'copy' }, now);
}

/** Renames the project's Markdown file. */
export async function renameProject(db: StudioDb, id: string, name: string, now = Date.now()): Promise<ProjectRecord> {
  const p = await db.getProject(id);
  if (!p) throw new Error('the project is gone');
  const renamed = { ...p, name: markdownName(name), updated: now };
  await db.putProject(renamed);
  return renamed;
}

/** Saves the text of a project (and the title the library shows). */
export async function saveSource(db: StudioDb, id: string, source: string, now = Date.now()): Promise<ProjectRecord | null> {
  const p = await db.getProject(id);
  if (!p) return null;
  const saved = { ...p, source, title: titleOf(source), updated: now };
  await db.putProject(saved);
  return saved;
}
