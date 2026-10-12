/**
 * The Studio's working store in IndexedDB: projects, the files they use, their versions and the folders they were
 * opened from. Nothing here leaves the device. File contents are kept as bytes (not Blobs), which every browser
 * stores alike and tests can run against a fake IndexedDB in Node.
 */

/** One LibKa document with its settings: what a CLI folder holds, plus what the library shows. */
export interface ProjectRecord {
  id: string;
  /** The Markdown file's name in the project folder, such as `guide.md`. */
  name: string;
  /** The document title from the front matter when it was last saved (for the library; empty without one). */
  title: string;
  source: string;
  created: number;
  updated: number;
  opened: number;
  origin: 'new' | 'example' | 'file' | 'zip' | 'folder' | 'draft' | 'copy' | 'tutorial';
  /** The editor it was last edited in (absent in documents saved before the editor was recorded: the source editor). */
  mode?: 'visual' | 'source' | 'split';
}

/** A file the document uses (an image, normally), keyed by its path relative to the Markdown file. */
export interface FileRecord {
  project: string;
  path: string;
  type: string;
  data: Uint8Array;
}

export type VersionKind = 'auto' | 'safety' | 'named';
export interface VersionRecord {
  id?: number;
  project: string;
  created: number;
  kind: VersionKind;
  /** The author's name for a named version; for the others, what caused it (an action's key). */
  label: string;
  /** Length of the text, for the list without unpacking it. */
  size: number;
  /** The source, gzip-compressed. */
  data: Uint8Array;
}

/** A folder on disk the project is saved to (File System Access API; Chrome and Edge). */
export interface FolderRecord {
  project: string;
  /** The folder's name, for the interface. */
  name: string;
  /** The Markdown file's path inside the folder (the project saves back to it). */
  path: string;
  handle: FileSystemDirectoryHandle;
}

export const DB_NAME = 'libka-studio';
const DB_VERSION = 1;

const done = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const finished = (t: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error ?? new Error('the transaction was aborted'));
});

type StoreName = 'projects' | 'files' | 'versions' | 'folders';

export class StudioDb {
  private constructor(readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<StudioDb> {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('files', { keyPath: ['project', 'path'] }).createIndex('project', 'project');
      db.createObjectStore('versions', { keyPath: 'id', autoIncrement: true }).createIndex('project', 'project');
      db.createObjectStore('folders', { keyPath: 'project' });
    };
    return done(request).then((db) => new StudioDb(db));
  }

  close(): void { this.db.close(); }

  private async run<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T>): Promise<T> {
    const t = this.db.transaction(stores, mode);
    const end = finished(t);
    const result = await fn(t);
    await end;
    return result;
  }
  private get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.run([store], 'readonly', (t) => done(t.objectStore(store).get(key) as IDBRequest<T | undefined>));
  }
  private put(store: StoreName, value: unknown): Promise<IDBValidKey> {
    return this.run([store], 'readwrite', (t) => done(t.objectStore(store).put(value)));
  }
  private byProject<T>(store: 'files' | 'versions', project: string): Promise<T[]> {
    return this.run([store], 'readonly', (t) => done(t.objectStore(store).index('project').getAll(project) as IDBRequest<T[]>));
  }

  /** Every project, the most recently changed first. */
  async listProjects(): Promise<ProjectRecord[]> {
    const all = await this.run(['projects'], 'readonly', (t) => done(t.objectStore('projects').getAll() as IDBRequest<ProjectRecord[]>));
    return all.sort((a, b) => b.updated - a.updated);
  }
  getProject(id: string): Promise<ProjectRecord | undefined> { return this.get('projects', id); }
  async putProject(p: ProjectRecord): Promise<void> { await this.put('projects', p); }

  /** Removes a project with its files, versions and folder link, in one transaction. */
  deleteProject(id: string): Promise<void> {
    return this.run(['projects', 'files', 'versions', 'folders'], 'readwrite', async (t) => {
      t.objectStore('projects').delete(id);
      t.objectStore('folders').delete(id);
      for (const store of ['files', 'versions'] as const) {
        const keys = await done(t.objectStore(store).index('project').getAllKeys(id));
        for (const k of keys) t.objectStore(store).delete(k);
      }
    });
  }

  listFiles(project: string): Promise<FileRecord[]> { return this.byProject('files', project); }
  async putFile(f: FileRecord): Promise<void> { await this.put('files', f); }
  /** Stores a project and all its files at once, so a new or imported project is never half there. */
  putProjectWithFiles(p: ProjectRecord, files: FileRecord[]): Promise<void> {
    return this.run(['projects', 'files'], 'readwrite', async (t) => {
      t.objectStore('projects').put(p);
      for (const f of files) t.objectStore('files').put(f);
    });
  }

  /** The project's versions, the newest first. */
  async listVersions(project: string): Promise<VersionRecord[]> {
    return (await this.byProject<VersionRecord>('versions', project)).sort((a, b) => b.created - a.created || (b.id ?? 0) - (a.id ?? 0));
  }
  getVersion(id: number): Promise<VersionRecord | undefined> { return this.get('versions', id); }
  async addVersion(v: VersionRecord): Promise<number> { return (await this.put('versions', v)) as number; }
  deleteVersions(ids: number[]): Promise<void> {
    return this.run(['versions'], 'readwrite', async (t) => { for (const id of ids) t.objectStore('versions').delete(id); });
  }

  getFolder(project: string): Promise<FolderRecord | undefined> { return this.get('folders', project); }
  listFolders(): Promise<FolderRecord[]> {
    return this.run(['folders'], 'readonly', (t) => done(t.objectStore('folders').getAll() as IDBRequest<FolderRecord[]>));
  }
  async putFolder(f: FolderRecord): Promise<void> { await this.put('folders', f); }
}
