/**
 * Editor preferences, kept per browser (a convenience, like the language or the theme). Every one can be switched
 * on or off: as many configurable abilities as are useful, chosen from a survey of comparable editors.
 */
import { signal } from '@preact/signals';
import { prefs } from './store.ts';

export interface EditorPrefs {
  /** The side palette of blocks in visual mode. */
  palette: boolean;
  /** Block handles always shown, or only on the hovered and the selected block. */
  handles: 'always' | 'hover';
  /** Typing "## ", "- ", "> " and the like makes the block it stands for. */
  shortcuts: boolean;
  /** The mode new documents open in. */
  defaultMode: 'visual' | 'source' | 'split';
  density: 'comfortable' | 'compact';
  /** Words next to the icons of the editing toolbar. */
  labels: boolean;
  /** Only the editor: the preview and the side panel are hidden. */
  focus: boolean;
  /** The line being edited stays in the middle of the editor. */
  typewriter: boolean;
  /** What screen readers hear after a move: a word, or the block's name and its new place. */
  announce: 'brief' | 'full';
}

export const DEFAULT_PREFS: EditorPrefs = {
  palette: true, handles: 'hover', shortcuts: true, defaultMode: 'visual', density: 'comfortable', labels: true, focus: false, typewriter: false, announce: 'full',
};

function read(): EditorPrefs {
  try {
    const saved = JSON.parse(prefs.get('editor') ?? '{}') as Partial<EditorPrefs>;
    const out = { ...DEFAULT_PREFS };
    for (const k of Object.keys(DEFAULT_PREFS) as (keyof EditorPrefs)[]) {
      if (k in saved && typeof saved[k] === typeof DEFAULT_PREFS[k]) (out as Record<string, unknown>)[k] = saved[k];
    }
    return out;
  } catch { return { ...DEFAULT_PREFS }; }
}

export const editorPrefs = signal<EditorPrefs>(read());

export function setPref<K extends keyof EditorPrefs>(key: K, value: EditorPrefs[K]): void {
  editorPrefs.value = { ...editorPrefs.value, [key]: value };
  prefs.set('editor', JSON.stringify(editorPrefs.value));
}

/** The blocks inserted most recently, newest first (the "/" menu lists them first). */
export const recentBlocks = signal<string[]>((() => { try { return JSON.parse(prefs.get('recent') ?? '[]') as string[]; } catch { return []; } })());
export function noteRecent(name: string): void {
  recentBlocks.value = [name, ...recentBlocks.value.filter((n) => n !== name)].slice(0, 6);
  prefs.set('recent', JSON.stringify(recentBlocks.value));
}
