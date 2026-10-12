/**
 * The Studio's state: one typed store of signals. Components read signals; only commands and the project controller
 * change them. Derived values (the parsed document, the rendered pages, the checks) are set by the render pipeline.
 */
import { computed, effect, signal } from '@preact/signals';
import type { LibkaDocument, Problem } from '@libka/model';
import type { ScanResult } from '@libka/guard/scan';
import type { ProjectRecord, VersionRecord } from '../storage/db.ts';
import type { Key, Lang } from '../i18n.ts';

/** Interface preferences are per-browser conveniences in localStorage; documents never go there. */
export const prefs = {
  get(key: string): string | null { try { return localStorage.getItem(`libka-studio:${key}`); } catch { return null; } },
  set(key: string, value: string): void { try { localStorage.setItem(`libka-studio:${key}`, value); } catch { /* private mode: not remembered */ } },
  remove(key: string): void { try { localStorage.removeItem(`libka-studio:${key}`); } catch { /* nothing to remove */ } },
};
const media = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;

export type CheckId = 'axe' | 'contrast' | 'structure' | 'docx';
export type Target = 'manual' | 'deck' | 'docx';
export interface Check extends ScanResult { target: Target; id: CheckId; mode: 'standard' | 'more-contrast' }
export type Device = 'web' | 'phone' | 'a4' | 'slides';
export type Pane = 'write' | 'preview' | 'checks';
export type PanelTab = 'problems' | 'guard' | 'inspector' | 'structure' | 'history' | 'tutorial';
export type View = 'library' | 'editor';
/** The editor of the open document: visual, source, or both side by side (Split, on wide screens). */
export type Mode = 'visual' | 'source' | 'split';

/** A file of the open project, with an object URL for previews. */
export interface ProjectFile { data: Uint8Array; type: string; url: string }

export const lang = signal<Lang>(prefs.get('lang') === 'cs' ? 'cs' : 'en');
export const theme = signal<'light' | 'dark'>((prefs.get('theme') as 'light' | 'dark' | null) ?? (media('(prefers-color-scheme: dark)') ? 'dark' : 'light'));
export const highContrast = signal<boolean>(prefs.get('contrast') ? prefs.get('contrast') === 'high' : media('(prefers-contrast: more)'));

/** The Studio's theme and contrast follow the system until the author chooses (and then the choice is remembered). */
export function followSystem(): void {
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { if (!prefs.get('theme')) theme.value = e.matches ? 'dark' : 'light'; });
  matchMedia('(prefers-contrast: more)').addEventListener('change', (e) => { if (!prefs.get('contrast')) highContrast.value = e.matches; });
  effect(() => {
    const root = document.documentElement;
    root.lang = lang.value;
    root.dataset.theme = theme.value;
    root.dataset.contrast = highContrast.value ? 'high' : 'standard';
  });
}

export const view = signal<View>('editor');
/** False until storage has been read; the interface shows nothing but the frame before. */
export const ready = signal(false);
/** Set when the browser gives the Studio no storage (some private modes): work is then lost on closing. */
export const storageError = signal<string | null>(null);

export const projects = signal<ProjectRecord[]>([]);
export const project = signal<ProjectRecord | null>(null);
/** The text in the editor (the editor writes it; commands that replace the text go through the editor bridge). */
export const source = signal('');
export const files = signal<ReadonlyMap<string, ProjectFile>>(new Map());
/** The folder on disk the project is saved to, when it has one (Chrome and Edge). */
export const folderName = signal<string | null>(null);
export const saveState = signal<'saved' | 'saving' | 'failed'>('saved');
export const versions = signal<VersionRecord[]>([]);

export const doc = signal<LibkaDocument | null>(null);
export const problems = signal<Problem[]>([]);
export const html = signal('');
export const deckHtml = signal('');
export const checks = signal<Check[] | null>(null);
export const guardRunning = signal(false);

/** The editor of the open document, and where to start in it (an offset in the Markdown). */
export const mode = signal<Mode>('visual');
/** The window is wide enough for Split (two editors next to the preview and the panel). */
export const SPLIT_MEDIA = '(min-width: 1280px)';
export const wide = signal(media(SPLIT_MEDIA));
if (typeof matchMedia === 'function') matchMedia(SPLIT_MEDIA).addEventListener('change', (e) => { wide.value = e.matches; });
/** The mode shown: Split falls back to Visual on narrow screens (the choice is kept for wider ones). */
export const shownMode = computed<Mode>(() => (mode.value === 'split' && !wide.value ? 'visual' : mode.value));
export const place = signal(0);
/** Counts changes of the visual editor's selection and document (the Inspector and the structure follow). */
export const selectionTick = signal(0);
/** What screen readers hear next (moves, deletions), in a polite live region. */
export const announcement = signal('');

export const device = signal<Device>('web');
export const pane = signal<Pane>('write');
export const panelTab = signal<PanelTab>('problems');
export const cursor = signal({ line: 1, col: 1 });

export const toastText = signal<string | null>(null);
/** A service-worker update is waiting: the Studio offers to reload. */
export const updateReady = signal(false);

export const issues = computed(() => problems.value.length + (checks.value?.reduce((n, c) => n + c.violations.length, 0) ?? 0));
export const status = computed<'fix' | 'ready' | 'checking'>(() => (issues.value ? 'fix' : checks.value ? 'ready' : 'checking'));

/** Dialogs the Studio shows (one at a time). */
export type DialogState =
  | { kind: 'confirm'; title: Key; message: string; confirm: Key; danger?: boolean; resolve(ok: boolean): void }
  | { kind: 'prompt'; title: Key; label: Key; value: string; confirm: Key; resolve(value: string | null): void }
  | { kind: 'choose'; title: Key; message: string; options: string[]; resolve(choice: string | null): void }
  | { kind: 'compare'; version: VersionRecord }
  | { kind: 'shortcuts' }
  | { kind: 'prefs' }
  | { kind: 'palette' }
  | { kind: 'accessibility' }
  | { kind: 'about' };
export const dialog = signal<DialogState | null>(null);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string): void {
  toastText.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastText.value = null; }, 6000);
}

export function ask(d: Omit<Extract<DialogState, { kind: 'confirm' }>, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => { dialog.value = { kind: 'confirm', ...d, resolve }; });
}
export function promptFor(d: Omit<Extract<DialogState, { kind: 'prompt' }>, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => { dialog.value = { kind: 'prompt', ...d, resolve }; });
}
export function choose(d: Omit<Extract<DialogState, { kind: 'choose' }>, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => { dialog.value = { kind: 'choose', ...d, resolve }; });
}
