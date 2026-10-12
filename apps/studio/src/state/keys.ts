/**
 * The keys of the Studio's commands. Each command may have a default (`Command.keys`, in CodeMirror's notation:
 * `Mod-Shift-s` is Ctrl+Shift+S, or Cmd+Shift+S on a Mac); the author can change any of them in Preferences, and the
 * choice is kept per browser. The editors' own keys (formatting, undo, block moves) are fixed and listed as taken, so a
 * new key never silently steals one of them.
 */
import { signal } from '@preact/signals';
import { prefs } from './store.ts';
import type { Command } from './commands.ts';

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** The author's keys, by command id ('' removes a command's key). */
export const keyOverrides = signal<Readonly<Record<string, string>>>((() => {
  try {
    const saved = JSON.parse(prefs.get('keys') ?? '{}') as unknown;
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? Object.fromEntries(Object.entries(saved).filter(([, v]) => typeof v === 'string')) : {};
  } catch { return {}; }
})());

/** The keys a command runs on now (the author's, or its default). */
export function keysOf(c: Pick<Command, 'id' | 'keys'>): string | undefined {
  const own = keyOverrides.value[c.id];
  return own === undefined ? c.keys : own || undefined;
}

/** Sets a command's keys (null: back to the default, '': none). */
export function setKeys(id: string, keys: string | null): void {
  const next = { ...keyOverrides.value };
  if (keys === null) delete next[id]; else next[id] = keys;
  keyOverrides.value = next;
  prefs.set('keys', JSON.stringify(next));
}

/** The editors' own keys: always taken. */
export const EDITOR_KEYS: readonly string[] = [
  'Mod-z', 'Mod-y', 'Mod-Shift-z', 'Mod-b', 'Mod-i', 'Mod-e', 'Mod-Shift-x', 'Mod-d', 'Mod-/', 'Mod-a', 'Mod-c', 'Mod-v', 'Mod-x', 'Mod-f', 'Mod-g',
  'Mod-]', 'Mod-[', 'Mod-Enter', 'Mod-Shift-Enter', 'Mod-Home', 'Mod-End', 'Mod-Shift-ArrowUp', 'Mod-Shift-ArrowDown', 'Shift-F10', 'F1',
];

/** The same keys written the same way (modifiers in one order, the key in lower case). */
export function normalKeys(keys: string): string {
  const parts = keys.split('-');
  const key = parts.pop()!;
  const mods = ['Mod', 'Shift', 'Alt'].filter((m) => parts.includes(m));
  return [...mods, key.length === 1 ? key.toLowerCase() : key].join('-');
}

/** The keys of a key press, or null for a press of modifiers alone or a plain key (commands need a modifier or F-key). */
export function keysFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Meta', 'Shift', 'Alt', 'AltGraph'].includes(e.key)) return null;
  const mod = mac ? e.metaKey : e.ctrlKey;
  const fkey = /^F\d{1,2}$/.test(e.key);
  if (!mod && !e.altKey && !fkey) return null;
  // with Shift, e.key is the shifted character; the code names the key itself (Digit1, KeyK)
  const key = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.code.startsWith('Digit') ? e.code.slice(5) : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return normalKeys([mod ? 'Mod' : '', e.shiftKey ? 'Shift' : '', e.altKey ? 'Alt' : '', key].filter(Boolean).join('-'));
}

/** Whether a key press is these keys. */
export function matchesKeys(keys: string, e: KeyboardEvent): boolean {
  const got = keysFromEvent(e);
  return got !== null && got === normalKeys(keys);
}

/** The keys for reading: Ctrl+Shift+S (⌘⇧S on a Mac). */
export function keyText(keys: string): string {
  return keys.split('-').map((p) => (p === 'Mod' ? (mac ? '⌘' : 'Ctrl') : p === 'Shift' ? (mac ? '⇧' : 'Shift') : p === 'Alt' ? (mac ? '⌥' : 'Alt')
    : p.length === 1 ? p.toUpperCase() : p.replace(/^Arrow/, ''))).join(mac ? '' : '+');
}

/** Who else uses these keys: other commands by id, or "editor" for the editors' own keys. */
export function conflicts(keys: string, commands: readonly Pick<Command, 'id' | 'keys'>[], except?: string): string[] {
  const want = normalKeys(keys);
  const out = commands.filter((c) => c.id !== except && keysOf(c) && normalKeys(keysOf(c)!) === want).map((c) => c.id);
  if (EDITOR_KEYS.some((k) => normalKeys(k) === want)) out.push('editor');
  return out;
}
