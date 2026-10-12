/**
 * Commands and extensions. Every user action is a named command; the menus, keyboard shortcuts and the command
 * palette run commands by name. Features arrive as extensions, the built-in ones included: each registers
 * commands, menu entries, panels, importers, exporters and project hooks through the same interface.
 */
import type { ComponentChildren } from 'preact';
import type { Key } from '../i18n.ts';
import type { ProjectRecord } from '../storage/db.ts';
import { keysOf } from './keys.ts';

export interface Command<A = undefined> {
  id: string;
  title: Key;
  /** A shortcut in CodeMirror's notation (`Mod-s`: Ctrl+S, or Cmd+S on a Mac). */
  keys?: string;
  /** False hides or disables the command where it is offered (a browser without folder access, say). */
  available?(): boolean;
  run(arg: A): void | Promise<void>;
}

/** Where a command is offered. */
export type MenuId = 'file' | 'export' | 'library' | 'help';
export interface MenuEntry { menu: MenuId; command: string; order: number }

/** A tab in the side panel. */
export interface Panel {
  id: string;
  title: Key;
  order: number;
  /** False leaves the tab out (the Tutorial tab shows only in the tutorial). */
  visible?(): boolean;
  /** The number shown on the tab (null: none or not known yet). */
  count?(): number | null;
  render(): ComponentChildren;
}

export interface ProjectHooks {
  /** A project was opened in the editor. */
  opened?(p: ProjectRecord): void | Promise<void>;
  /** The text is about to be replaced by an action (open, import, restore): a moment to keep a version. */
  beforeReplace?(p: ProjectRecord, reason: string): void | Promise<void>;
}

/** One thing the command palette offers: run it, and it is done (and the palette closes). */
export interface PaletteItem {
  id: string;
  label: string;
  /** A second line: where it is, what it does. */
  detail?: string;
  /** Keys that run it too (shown, never pressed here). */
  keys?: string;
  /** Other words it is found by (another language, a syntax name). */
  words?: string;
  run(): void | Promise<void>;
}

/** A group of things the palette finds: commands, blocks, places, settings, documents ... */
export interface PaletteSource {
  id: string;
  title: Key;
  order: number;
  items(): PaletteItem[];
}

export interface Extension {
  id: string;
  commands?: Command<unknown>[];
  menu?: MenuEntry[];
  panels?: Panel[];
  hooks?: ProjectHooks;
  /** What the command palette finds, beyond the commands themselves. */
  palette?: PaletteSource[];
}

export class Registry {
  readonly extensions: Extension[] = [];
  private readonly commands = new Map<string, Command<unknown>>();

  register(ext: Extension): void {
    if (this.extensions.some((e) => e.id === ext.id)) throw new Error(`extension "${ext.id}" is already registered`);
    for (const c of ext.commands ?? []) {
      if (this.commands.has(c.id)) throw new Error(`command "${c.id}" is already registered`);
      this.commands.set(c.id, c);
    }
    this.extensions.push(ext);
  }

  command(id: string): Command<unknown> | undefined { return this.commands.get(id); }
  available(id: string): boolean { const c = this.commands.get(id); return Boolean(c && (c.available?.() ?? true)); }

  /** Runs a command by name; an unknown or unavailable command is an error in the Studio, not the author's. */
  async run<A>(id: string, arg?: A): Promise<void> {
    const c = this.commands.get(id);
    if (!c) throw new Error(`unknown command "${id}"`);
    if (c.available && !c.available()) return;
    for (const l of this.listeners) l(id);
    await c.run(arg);
  }

  /** The commands of a menu, in order, leaving out unavailable ones. */
  menu(id: MenuId): Command[] {
    return this.extensions.flatMap((e) => e.menu ?? []).filter((m) => m.menu === id).sort((a, b) => a.order - b.order)
      .map((m) => this.commands.get(m.command)).filter((c): c is Command => Boolean(c && (c.available?.() ?? true)));
  }

  panels(): Panel[] { return this.extensions.flatMap((e) => e.panels ?? []).filter((p) => p.visible?.() ?? true).sort((a, b) => a.order - b.order); }

  private readonly listeners: ((id: string) => void)[] = [];
  /** Hears every command that runs (the tutorial ticks its steps by them). */
  onRun(listener: (id: string) => void): void { this.listeners.push(listener); }

  /** Every command, available or not, in the order registered. */
  all(): Command[] { return [...this.commands.values()]; }

  paletteSources(): PaletteSource[] { return this.extensions.flatMap((e) => e.palette ?? []).sort((a, b) => a.order - b.order); }

  /** Commands with a shortcut (the author's or the default), for the keymap. */
  shortcuts(): Command[] { return [...this.commands.values()].filter((c) => keysOf(c)); }

  async hook<K extends keyof ProjectHooks>(name: K, ...args: Parameters<NonNullable<ProjectHooks[K]>>): Promise<void> {
    for (const e of this.extensions) {
      const fn = e.hooks?.[name] as ((...a: typeof args) => void | Promise<void>) | undefined;
      if (fn) await fn(...args);
    }
  }
}

/** The Studio's one registry. */
export const registry = new Registry();
