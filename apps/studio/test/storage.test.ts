import { IDBFactory } from 'fake-indexeddb';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { StudioDb } from '../src/storage/db.ts';
import { localFiles, markdownName, normalize, safeName } from '../src/storage/paths.ts';
import { createProject, displayName, duplicateProject, filesOf, renameProject, saveSource } from '../src/storage/projects.ts';
import { collect, exportZip, listFolder, markdownIn, readFile, readZip, writeFolder } from '../src/storage/transfer.ts';
import { AUTO_EVERY_MS, autoDue, KEEP_UNNAMED, lastAutoAt, recordVersion, unpack } from '../src/storage/versions.ts';
import { parse } from '@libka/model';

const open = () => StudioDb.open(new IDBFactory());
const png = (n: number) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, n]);
const DOC = `---
title: Onboarding guide
lang: en
---

## Start

![A screen](images/screen.png "The first screen")
`;

describe('paths', () => {
  it('finds the local files a document uses, and only those', () => {
    const doc = parse(`${DOC}\n![Logo](https://example.org/logo.png "Remote")\n\n![Again](./images/screen.png "Same file")\n\n:::gallery\n![One](images/a.png "A")\n\n![Two](images/b%20c.png "B")\n:::\n`).document;
    expect(localFiles(doc)).toEqual(['images/screen.png', 'images/a.png', 'images/b c.png']);
  });
  it('normalizes paths and refuses ones that leave the folder', () => {
    expect(normalize('./a/../images//x.png?v=2')).toBe('images/x.png');
    expect(normalize('../secret.png')).toBeNull();
    expect(normalize('100%.png')).toBe('100%.png');
  });
  it('makes safe file names', () => {
    expect(safeName('Příliš žluťoučký kůň.png')).toBe('Prilis-zlutoucky-kun.png');
    expect(markdownName('My guide')).toBe('My-guide.md');
    expect(markdownName('guide.md')).toBe('guide.md');
  });
});

describe('projects in IndexedDB', () => {
  it('creates, lists (newest first), saves, renames, copies and deletes projects with their files', async () => {
    const db = await open();
    const a = await createProject(db, { name: 'guide.md', source: DOC, files: new Map([['images/screen.png', png(1)]]), origin: 'example' }, 1000);
    const b = await createProject(db, { name: 'notes', source: '## Notes\n', origin: 'new' }, 2000);
    expect(a.title).toBe('Onboarding guide');
    expect(displayName(b)).toBe('notes');
    expect((await db.listProjects()).map((p) => p.id)).toEqual([b.id, a.id]);

    await saveSource(db, a.id, DOC.replace('Onboarding guide', 'Welcome'), 3000);
    expect((await db.listProjects())[0]).toMatchObject({ id: a.id, title: 'Welcome', updated: 3000 });
    expect((await renameProject(db, a.id, 'welcome')).name).toBe('welcome.md');

    const copy = await duplicateProject(db, a.id, 'copy', 4000);
    expect(copy).toMatchObject({ name: 'welcome-copy.md', title: 'Welcome', origin: 'copy' });
    expect([...(await filesOf(db, copy.id)).keys()]).toEqual(['images/screen.png']);

    await recordVersion(db, a.id, 'old text', 'named', 'First draft');
    await db.deleteProject(a.id);
    expect(await db.getProject(a.id)).toBeUndefined();
    expect(await db.listFiles(a.id)).toEqual([]);
    expect(await db.listVersions(a.id)).toEqual([]);
    expect((await filesOf(db, copy.id)).get('images/screen.png')).toEqual(png(1));   // the copy keeps its own files
    db.close();
  });
});

describe('versions', () => {
  it('takes an automatic version after a pause at most every few minutes', () => {
    expect(autoDue(10_000, null)).toBe(true);
    expect(autoDue(10_000 + AUTO_EVERY_MS - 1, 10_000)).toBe(false);
    expect(autoDue(10_000 + AUTO_EVERY_MS, 10_000)).toBe(true);
  });

  it('records compressed versions, skips unchanged unnamed ones, keeps named ones and prunes the rest', async () => {
    const db = await open();
    const p = 'project-1';
    const first = await recordVersion(db, p, 'one', 'auto', '', 1);
    expect(first && unpack(first)).toBe('one');
    expect(await recordVersion(db, p, 'one', 'safety', 'open', 2)).toBeNull();     // nothing changed
    expect(await recordVersion(db, p, 'one', 'named', 'Sent to legal', 3)).not.toBeNull();   // the author asked for it
    for (let i = 0; i < KEEP_UNNAMED + 5; i++) await recordVersion(db, p, `text ${i}`, i % 2 ? 'auto' : 'safety', '', 10 + i);
    const list = await db.listVersions(p);
    expect(list.filter((v) => v.kind !== 'named')).toHaveLength(KEEP_UNNAMED);
    expect(list.find((v) => v.kind === 'named')?.label).toBe('Sent to legal');
    expect(unpack(list[0]!)).toBe(`text ${KEEP_UNNAMED + 4}`);                     // newest first
    expect(await lastAutoAt(db, p)).toBe(10 + KEEP_UNNAMED + 3);
    db.close();
  });
});

describe('zip', () => {
  it('exports the Markdown file and the files it uses, byte-identical every time, and reads it back', async () => {
    const files = new Map([['images/screen.png', png(1)], ['images/unused.png', png(2)]]);
    const zip = await exportZip({ name: 'guide.md', source: DOC, files });
    expect(await exportZip({ name: 'guide.md', source: DOC, files })).toEqual(zip);
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(['guide.md', 'images/screen.png']);

    const entries = readZip(zip);
    expect(markdownIn(entries.keys())).toEqual(['guide.md']);
    const back = await collect('guide.md', async (path) => entries.get(path) ?? null);
    expect(back).toEqual({ name: 'guide.md', source: DOC, files: new Map([['images/screen.png', png(1)]]), missing: [] });
  });

  it('reads a zip of a folder (one top folder), finds every Markdown file and reports missing images', async () => {
    const { zipSync } = await import('fflate');
    const zip = zipSync({ 'project/docs/guide.md': strToU8(DOC), 'project/README.md': strToU8('# Read me'), 'project/.git/HEAD': strToU8('x'), '__MACOSX/x': strToU8('') });
    const entries = readZip(zip);
    expect([...entries.keys()].sort()).toEqual(['README.md', 'docs/guide.md']);
    expect(markdownIn(entries.keys())).toEqual(['README.md', 'docs/guide.md']);
    const p = await collect('docs/guide.md', async (path) => entries.get(path) ?? null);
    expect(p.missing).toEqual(['images/screen.png']);
    expect(strFromU8(entries.get('README.md')!)).toBe('# Read me');
  });
});

describe('a document\'s design files', () => {
  const BRAND = 'meta:\n  name: Sunny Lane\ncolor:\n  primary: "#FFD400"\nlogo: brand/logo.svg\n';
  const SVG = strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>');

  it('reads a project\'s _brand.yml from a folder above the document, with its logo, as the build finds it', async () => {
    const folder = new Map([['docs/guide.md', strToU8(DOC)], ['_brand.yml', strToU8(BRAND)], ['brand/logo.svg', SVG]]);
    const p = await collect('docs/guide.md', async (path) => folder.get(path) ?? null);
    expect([...p.files.keys()].sort()).toEqual(['../_brand.yml', '../brand/logo.svg']);
    expect(p.missing).toEqual(['images/screen.png']);
  });

  it('puts the design\'s files in the zip: a brand from above the document at the zip\'s top, with its logo beside it', async () => {
    const files = new Map([['images/screen.png', png(1)], ['../_brand.yml', strToU8(BRAND)], ['../brand/logo.svg', SVG]]);
    const zip = await exportZip({ name: 'guide.md', source: DOC, files });
    expect(Object.keys(unzipSync(zip)).sort()).toEqual(['_brand.yml', 'brand/logo.svg', 'guide.md', 'images/screen.png']);
    // a brand the front matter names, beside the document
    const named = DOC.replace('---\n', '---\nbrand: house.yml\n');
    const own = await exportZip({ name: 'guide.md', source: named, files: new Map([['house.yml', strToU8(BRAND)], ['brand/logo.svg', SVG]]) });
    expect(Object.keys(unzipSync(own)).sort()).toEqual(['brand/logo.svg', 'guide.md', 'house.yml']);
  });

  it('writes the design\'s files to the folder: beside the document, and a project\'s brand above it in place', async () => {
    const dir = new MemoryDir('project');
    const files = new Map([['images/screen.png', png(1)], ['_brand.yml', strToU8(BRAND)], ['brand/logo.svg', SVG]]);
    const written = await writeFolder(dir as unknown as FileSystemDirectoryHandle, { name: 'docs/guide.md', source: DOC, files });
    expect(written.sort()).toEqual(['docs/_brand.yml', 'docs/brand/logo.svg', 'docs/guide.md', 'docs/images/screen.png']);
    const above = new MemoryDir('project');
    const up = await writeFolder(above as unknown as FileSystemDirectoryHandle, { name: 'docs/guide.md', source: DOC, files: new Map([['../_brand.yml', strToU8(BRAND)], ['../brand/logo.svg', SVG]]) });
    expect(up.sort()).toEqual(['_brand.yml', 'brand/logo.svg', 'docs/guide.md']);
    // written again, nothing has changed: nothing is written
    expect(await writeFolder(above as unknown as FileSystemDirectoryHandle, { name: 'docs/guide.md', source: DOC, files: new Map([['../_brand.yml', strToU8(BRAND)], ['../brand/logo.svg', SVG]]) })).toEqual([]);
  });
});

/** An in-memory folder with the parts of the File System Access API the Studio uses. */
class MemoryDir {
  readonly kind = 'directory';
  readonly entries = new Map<string, MemoryDir | MemoryFile>();
  constructor(readonly name: string) {}
  async *values() { yield* this.entries.values(); }
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    let d = this.entries.get(name);
    if (!d && o?.create) this.entries.set(name, d = new MemoryDir(name));
    if (!(d instanceof MemoryDir)) throw new DOMException('not found', 'NotFoundError');
    return d;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    let f = this.entries.get(name);
    if (!f && o?.create) this.entries.set(name, f = new MemoryFile(name));
    if (!(f instanceof MemoryFile)) throw new DOMException('not found', 'NotFoundError');
    return f;
  }
}
class MemoryFile {
  readonly kind = 'file';
  data = new Uint8Array();
  writes = 0;
  constructor(readonly name: string) {}
  async getFile() { return new Blob([this.data]); }
  async createWritable() {
    const chunks: Uint8Array[] = [];
    return { write: async (d: Uint8Array) => { chunks.push(d); }, close: async () => { this.data = Uint8Array.from(chunks.flatMap((c) => [...c])); this.writes++; } };
  }
}

describe('folders', () => {
  it('writes the project into a folder, skips files that are already there, and reads it back', async () => {
    const root = new MemoryDir('guide');
    const dir = root as unknown as FileSystemDirectoryHandle;
    const files = new Map([['images/screen.png', png(1)]]);
    expect(await writeFolder(dir, { name: 'guide.md', source: DOC, files })).toEqual(['guide.md', 'images/screen.png']);
    expect(await writeFolder(dir, { name: 'guide.md', source: DOC, files })).toEqual([]);   // nothing changed
    expect(await writeFolder(dir, { name: 'guide.md', source: `${DOC}\nMore.\n`, files })).toEqual(['guide.md']);

    root.entries.set('node_modules', new MemoryDir('node_modules'));
    expect((await listFolder(dir)).sort()).toEqual(['guide.md', 'images/screen.png']);
    const back = await collect('guide.md', (path) => readFile(dir, path));
    expect(back.files).toEqual(files);
    expect(back.source).toBe(`${DOC}\nMore.\n`);
    expect(await readFile(dir, 'images/none.png')).toBeNull();
  });
});
