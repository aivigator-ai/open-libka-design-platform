/**
 * The project controller: opens projects into the editor, saves as the author types, keeps versions, and moves projects
 * in and out of the browser (zip, folders). The interface calls these through commands.
 */
import { batch } from '@preact/signals';
import { block as blockDefinition } from '@libka/blocks';
import { StudioDb, type FolderRecord, type ProjectRecord, type VersionRecord } from '../storage/db.ts';
import { localFiles, markdownName, safeName, typeOf } from '../storage/paths.ts';
import { createProject, displayName, duplicateProject, filesOf, renameProject, saveSource } from '../storage/projects.ts';
import { collect, exportZip, foldersSupported, listFolder, markdownIn, readFile, readZip, writable, writeFolder, type ProjectFiles } from '../storage/transfer.ts';
import { AUTO_PAUSE_MS, autoDue, lastAutoAt, recordVersion, unpack } from '../storage/versions.ts';
import { registry } from '../state/commands.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { render, scheduleRender } from '../core/pipeline.ts';
import type { ActiveEditor } from '../editor/active.ts';
import { editorPrefs, noteRecent } from '../state/prefs.ts';
import { parse } from '@libka/model';

let db: StudioDb | null = null;
const store = (): StudioDb => { if (!db) throw new Error('storage is not open'); return db; };

/** The editor in use (source or visual), once the interface has made it. */
export const bridge: { editor: ActiveEditor | null } = { editor: null };

export const BLANK = `---
title: Untitled document
lang: en
---

## First section

Start writing here.
`;

/* ---------- start ---------- */

/** Opens storage (asking the browser to keep it), moves an old prototype draft in, and opens the last project. */
export async function start(): Promise<void> {
  try {
    db = await StudioDb.open();
    void navigator.storage?.persist?.().catch(() => false);
  } catch (e) {
    // no IndexedDB (some private modes): work in memory, and say so
    console.warn('LibKa Studio: no browser storage', e);
    const { IDBFactory } = await import('fake-indexeddb');
    db = await StudioDb.open(new IDBFactory());
    s.storageError.value = String((e as Error)?.message ?? e);
  }
  await migrateDraft();
  await refreshLibrary();
  const last = s.prefs.get('last');
  const list = s.projects.value;
  const open = list.find((p) => p.id === last) ?? [...list].sort((a, b) => b.opened - a.opened)[0];
  if (open) await openProject(open.id);
  else await openExample();
  s.ready.value = true;
}

/** The single-file prototype kept one draft in localStorage: it becomes a project once. */
async function migrateDraft(): Promise<void> {
  const draft = s.prefs.get('draft');
  if (draft === null) return;
  await createProject(store(), { name: s.prefs.get('name') ?? 'draft.md', source: draft, origin: 'draft' });
  s.prefs.remove('draft');
  s.prefs.remove('name');
}

export async function refreshLibrary(): Promise<void> {
  s.projects.value = await store().listProjects();
}
const refreshVersions = async () => { if (s.project.value) s.versions.value = await store().listVersions(s.project.value.id); };

/* ---------- open, save ---------- */

let lastAuto: number | null = null;

function setFiles(records: { path: string; type: string; data: Uint8Array }[]): void {
  for (const f of s.files.value.values()) URL.revokeObjectURL(f.url);
  s.files.value = new Map(records.map((f) => [f.path, { data: f.data, type: f.type, url: URL.createObjectURL(new Blob([f.data as Uint8Array<ArrayBuffer>], { type: f.type })) }]));
}

export async function openProject(id: string): Promise<void> {
  await flushSave();
  const p = await store().getProject(id);
  if (!p) { s.toast(t('library.gone')); await refreshLibrary(); return; }
  const opened = { ...p, opened: Date.now() };
  await store().putProject(opened);
  setFiles(await store().listFiles(id));
  const folder = await store().getFolder(id);
  batch(() => {
    s.project.value = opened;
    s.source.value = p.source;
    s.folderName.value = folder?.name ?? null;
    s.saveState.value = 'saved';
    s.view.value = 'editor';
    // the editor it was last edited in; documents saved before the editor was recorded were edited as source
    s.mode.value = p.mode ?? 'source';
    s.place.value = 0;
  });
  s.prefs.set('last', id);
  // the text as opened is a version (skipped when it equals the newest one)
  await recordVersion(store(), id, p.source, 'safety', 'open');
  lastAuto = await lastAutoAt(store(), id);
  await refreshVersions();
  await refreshLibrary();
  render();
  await registry.hook('opened', opened);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pauseTimer: ReturnType<typeof setTimeout> | undefined;

/** The editor changed the text: save soon, render soon, and take a version after a pause. */
export function edited(text: string): void {
  s.source.value = text;
  s.saveState.value = 'saving';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), 400);
  scheduleRender();
  clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => void autoVersion(), AUTO_PAUSE_MS);
}

/**
 * The text with the editor's last change in it. The visual editor writes its text a moment after an edit; anything
 * that changes the whole text (a document property, the outputs, a fix) or saves it takes this first, so a quick
 * second change never undoes the first.
 */
export function currentText(): string {
  bridge.editor?.flush?.();
  return s.source.value;
}

/** Writes the current text to storage now (when it changed). */
export async function flushSave(): Promise<void> {
  currentText();
  clearTimeout(saveTimer);
  const p = s.project.value;
  if (!p || !db) return;
  const text = s.source.value;
  if (p.source === text) { s.saveState.value = 'saved'; return; }
  try {
    const saved = await saveSource(store(), p.id, text);
    if (saved && s.project.value?.id === p.id) {
      s.project.value = saved;
      s.saveState.value = s.source.value === text ? 'saved' : 'saving';
      s.projects.value = [saved, ...s.projects.value.filter((x) => x.id !== saved.id)];
    }
  } catch (e) {
    console.error('LibKa Studio: saving failed', e);
    s.saveState.value = 'failed';
  }
}

async function autoVersion(): Promise<void> {
  const p = s.project.value;
  if (!p || !autoDue(Date.now(), lastAuto)) return;
  const v = await recordVersion(store(), p.id, s.source.value, 'auto');
  if (v) { lastAuto = v.created; await refreshVersions(); }
}

/** Replaces the text by an action (keeping the text before as a version); the editor can undo it. */
export async function replaceText(text: string, reason: string): Promise<void> {
  const p = s.project.value;
  if (!p) return;
  await flushSave();
  await registry.hook('beforeReplace', p, reason);
  await recordVersion(store(), p.id, s.source.value, 'safety', reason);
  if (bridge.editor) bridge.editor.replaceAll(text); else edited(text);
  await flushSave();
  await refreshVersions();
}

/* ---------- versions ---------- */

export async function saveNamedVersion(): Promise<void> {
  const p = s.project.value;
  if (!p) return;
  const name = await s.promptFor({ title: 'history.saveTitle', label: 'history.nameLabel', value: '', confirm: 'history.save' });
  if (name === null) return;
  await flushSave();
  await recordVersion(store(), p.id, s.source.value, 'named', name.trim() || t('history.unnamed'));
  await refreshVersions();
  s.toast(t('history.saved'));
}

/** Restores a version: the text before is kept as a version, and the restored text is recorded as a new one. */
export async function restoreVersion(v: VersionRecord): Promise<void> {
  const p = s.project.value;
  if (!p) return;
  const text = unpack(v);
  await replaceText(text, 'restore');
  await recordVersion(store(), p.id, text, 'safety', `restored:${v.created}`);
  await refreshVersions();
  s.toast(t('history.restored'));
}

/* ---------- library ---------- */

async function create(p: Parameters<typeof createProject>[1]): Promise<void> {
  // a new document opens in the mode the author prefers for new documents
  const record = await createProject(store(), { mode: editorPrefs.value.defaultMode, ...p });
  await refreshLibrary();
  await openProject(record.id);
}

export const newProject = () => create({ name: 'untitled.md', source: BLANK, origin: 'new' });

export async function openExample(): Promise<void> {
  const example = await import('studio:example');
  await create({ name: example.name, source: example.source, files: new Map(Object.entries(example.files)), origin: 'example' });
}

/** The tutorial: a learn-by-doing document in the interface language (its Tutorial tab lists the steps). */
export async function openTutorial(): Promise<void> {
  const tutorial = await import('studio:tutorial');
  const name = s.lang.value === 'cs' ? 'prvni-dokument.md' : 'first-document.md';
  await create({ name, source: tutorial.sources[s.lang.value], files: new Map(Object.entries(tutorial.files)), origin: 'tutorial', mode: 'visual' });
}

export async function rename(p: ProjectRecord): Promise<void> {
  const name = await s.promptFor({ title: 'library.renameTitle', label: 'library.fileName', value: p.name, confirm: 'library.rename' });
  if (!name?.trim()) return;
  const renamed = await renameProject(store(), p.id, name);
  if (s.project.value?.id === p.id) s.project.value = { ...renamed, source: s.project.value.source };
  await refreshLibrary();
}

export async function duplicate(p: ProjectRecord): Promise<void> {
  await flushSave();
  await duplicateProject(store(), p.id, safeName(t('library.copySuffix')));
  await refreshLibrary();
  s.toast(t('library.duplicated', { name: displayName(p) }));
}

export async function remove(p: ProjectRecord): Promise<void> {
  const ok = await s.ask({ title: 'library.deleteTitle', message: t('library.deleteMessage', { name: displayName(p) }), confirm: 'library.delete', danger: true });
  if (!ok) return;
  await store().deleteProject(p.id);
  await refreshLibrary();
  if (s.project.value?.id === p.id) {
    const next = s.projects.value[0];
    if (next) await openProject(next.id);
    else { s.project.value = null; await newProject(); s.view.value = 'library'; }
  }
  s.toast(t('library.deleted', { name: displayName(p) }));
}

/* ---------- files: images, zip, folders, downloads ---------- */

export function download(name: string, type: string, content: string | Uint8Array): void {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([content as BlobPart], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const baseName = (): string => (s.project.value?.name ?? 'document.md').replace(/\.(md|markdown)$/i, '');

/** Adds dropped or pasted images to the project under images/ and puts a figure in the text for each. */
export async function addImages(list: File[]): Promise<void> {
  const p = s.project.value;
  if (!p) return;
  const added: string[] = [];
  for (const file of list) {
    let path = `images/${safeName(file.name, 'image.png')}`;
    for (let i = 2; s.files.value.has(path); i++) path = path.replace(/(-\d+)?(\.\w+)?$/, (_, _n, ext = '') => `-${i}${ext}`);
    const data = new Uint8Array(await file.arrayBuffer());
    const type = file.type || typeOf(path);
    await store().putFile({ project: p.id, path, type, data });
    const next = new Map(s.files.value);
    next.set(path, { data, type, url: URL.createObjectURL(new Blob([data], { type })) });
    s.files.value = next;
    added.push(path);
  }
  bridge.editor?.insertMarkdown(added.map((path) => `![](${path} "")`).join('\n\n'));
  s.toast(t('image.dropped'));
}

/** Inserts a block's starter text at the cursor, on its own lines. */
export function insertBlock(kind: string, snippets: Record<string, string>): void {
  const snippet = snippets[kind] ?? blockDefinition(kind)?.example ?? '';
  bridge.editor?.insertMarkdown(snippet);
  noteRecent(kind);
}

/** Switches the open document between the visual editor, the source editor and both (Split), keeping the place. */
export async function setMode(mode: s.Mode): Promise<void> {
  if (s.mode.value === mode) return;
  // where the author is, as an offset in the Markdown (the visual editor writes its latest text first)
  s.place.value = bridge.editor?.offset() ?? 0;
  await flushSave();
  s.mode.value = mode;
  const p = s.project.value;
  if (p && p.mode !== mode) {
    const stored = await store().getProject(p.id);
    if (stored) await store().putProject({ ...stored, mode });
    s.project.value = { ...p, mode };
  }
}

const currentFiles = (): Map<string, Uint8Array> => new Map([...s.files.value].map(([path, f]) => [path, f.data]));

export async function exportProjectZip(p?: ProjectRecord): Promise<void> {
  if (!p || p.id === s.project.value?.id) {
    await flushSave();
    const project = s.project.value;
    if (!project) return;
    download(`${baseName()}.zip`, 'application/zip', exportZip({ name: project.name, source: s.source.value, files: currentFiles() }));
    return;
  }
  download(`${p.name.replace(/\.(md|markdown)$/i, '')}.zip`, 'application/zip', exportZip({ name: p.name, source: p.source, files: await filesOf(store(), p.id) }));
}

/** Picks the Markdown file to open when a folder or zip has several. */
async function pickMarkdown(paths: string[], from: string): Promise<string | null> {
  const md = markdownIn(paths);
  if (!md.length) { s.toast(t('import.noMarkdown', { name: from })); return null; }
  if (md.length === 1) return md[0]!;
  return s.choose({ title: 'import.chooseTitle', message: t('import.chooseMessage', { name: from }), options: md });
}

function reportMissing(pf: ProjectFiles): void {
  if (pf.missing.length) s.toast(t('import.missing', { n: pf.missing.length, list: pf.missing.slice(0, 3).join(', ') }));
}

/** Imports a .zip of a project folder, or a single Markdown file, as a new project. */
export async function importFile(file: File): Promise<void> {
  if (/\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith('text/')) {
    await create({ name: markdownName(file.name), source: await file.text(), origin: 'file' });
    const missing = localFiles(parse(s.source.value).document);
    if (missing.length) s.toast(t('import.missing', { n: missing.length, list: missing.slice(0, 3).join(', ') }));
    return;
  }
  let entries: Map<string, Uint8Array>;
  try { entries = readZip(new Uint8Array(await file.arrayBuffer())); }
  catch { s.toast(t('import.notZip', { name: file.name })); return; }
  const md = await pickMarkdown([...entries.keys()], file.name);
  if (!md) return;
  const pf = await collect(md, async (path) => entries.get(path) ?? null);
  await create({ name: pf.name, source: pf.source, files: pf.files, origin: 'zip' });
  reportMissing(pf);
}

export const canUseFolders = foldersSupported;

/** The folders picked in this session, by project: their handles are used directly (no permission prompt again). */
const liveFolders = new Map<string, FolderRecord>();
/** A stored handle is usable when the browser gave it back as a handle (not every one survives storage). */
const usable = (f: FolderRecord | undefined): f is FolderRecord => typeof f?.handle?.getFileHandle === 'function';
const folderOf = async (project: string): Promise<FolderRecord | undefined> => {
  const f = liveFolders.get(project) ?? await store().getFolder(project);
  return usable(f) ? f : undefined;
};
async function linkFolder(f: FolderRecord): Promise<void> {
  liveFolders.set(f.project, f);
  await store().putFolder(f);
  if (s.project.value?.id === f.project) s.folderName.value = f.name;
}

async function linkedProjectFor(dir: FileSystemDirectoryHandle, path: string): Promise<FolderRecord | undefined> {
  for (const f of [...liveFolders.values(), ...await store().listFolders()]) {
    if (f.path === path && usable(f) && await f.handle.isSameEntry(dir).catch(() => false)) return f;
  }
  return undefined;
}

/** Opens a project folder from disk. A folder already linked to a project refreshes that project from disk. */
export async function openFolder(): Promise<void> {
  let dir: FileSystemDirectoryHandle;
  try { dir = await window.showDirectoryPicker!({ id: 'libka-project', mode: 'readwrite' }); }
  catch { return; }   // the author closed the picker
  const md = await pickMarkdown(await listFolder(dir), dir.name);
  if (!md) return;
  const pf = await collect(md, (path) => readFile(dir, path));
  const linked = await linkedProjectFor(dir, md);
  if (linked && await store().getProject(linked.project)) {
    await openProject(linked.project);
    const p = s.project.value!;
    for (const [path, data] of pf.files) await store().putFile({ project: p.id, path, type: typeOf(path), data });
    setFiles(await store().listFiles(p.id));
    await replaceText(pf.source, 'folder');
    s.toast(t('folder.refreshed', { name: dir.name }));
  } else {
    const record = await createProject(store(), { name: pf.name, source: pf.source, files: pf.files, origin: 'folder' });
    await linkFolder({ project: record.id, name: dir.name, path: md, handle: dir });
    await refreshLibrary();
    await openProject(record.id);
  }
  reportMissing(pf);
}

/** Saves the project into its folder on disk (asking for one the first time). */
export async function saveToFolder(): Promise<void> {
  const p = s.project.value;
  if (!p) return;
  await flushSave();
  let folder = await folderOf(p.id);
  if (!folder) {
    let dir: FileSystemDirectoryHandle;
    try { dir = await window.showDirectoryPicker!({ id: 'libka-project', mode: 'readwrite' }); }
    catch { return; }
    const existing = await readFile(dir, p.name);
    if (existing && new TextDecoder().decode(existing) !== s.source.value) {
      const ok = await s.ask({ title: 'folder.replaceTitle', message: t('folder.replaceMessage', { name: p.name, folder: dir.name }), confirm: 'folder.replace', danger: true });
      if (!ok) return;
    }
    folder = { project: p.id, name: dir.name, path: p.name, handle: dir };
    await linkFolder(folder);
  }
  try {
    if (!await writable(folder.handle)) { s.toast(t('folder.denied', { name: folder.name })); return; }
    const written = await writeFolder(folder.handle, { name: folder.path, source: s.source.value, files: currentFiles() });
    s.toast(written.length ? t('folder.saved', { name: folder.name, n: written.length }) : t('folder.unchanged', { name: folder.name }));
  } catch (e) {
    s.toast(t('folder.failed', { name: folder.name, error: String((e as Error)?.message ?? e) }));
  }
}

/** Ctrl+S: save to the project's folder when it has one; otherwise say where the work is. */
export async function save(): Promise<void> {
  await flushSave();
  if (s.folderName.value && canUseFolders()) await saveToFolder();
  else s.toast(t('save.browser'));
}
