/**
 * Split: the visual and the source editor side by side, live both ways. What the author writes on one side reaches the
 * other a moment later (only the blocks or characters that differ are replaced, outside that side's undo history, so
 * each side keeps its own undo, scroll and place), and the block being edited is marked on both sides. The side the
 * author last used is the active editor (`bridge.editor`) for the rest of the Studio.
 */
import { blockAt } from '@libka/editor';
import type { ActiveEditor } from '../editor/active.ts';
import type { VisualEditor } from '../visual/view.ts';
import { bridge } from './project.ts';

type Side = 'visual' | 'source';
const editors = new Map<Side, ActiveEditor>();
let pending: { to: Side; text: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

const other = (side: Side): Side => (side === 'visual' ? 'source' : 'visual');
const split = () => editors.size === 2;

/** An editor opened (the visual one first); returns how to detach it when it closes. */
export function attach(editor: ActiveEditor): () => void {
  editors.set(editor.mode, editor);
  return () => {
    if (editors.get(editor.mode) !== editor) return;
    editors.delete(editor.mode);
    if (pending?.to === editor.mode || pending?.to === other(editor.mode)) { clearTimeout(timer); pending = null; }
    editors.get(other(editor.mode))?.link(null);
  };
}

/** Sends the waiting text to its side now. */
export function flushSync(): void {
  clearTimeout(timer);
  const p = pending;
  pending = null;
  if (p) { editors.get(p.to)?.sync(p.text); placed(other(p.to)); }
}

/**
 * One side changed the text. The visual editor reports a moment after typing already; the source editor reports each
 * keystroke, so the visual side (which parses the text) follows after a short pause.
 */
export function changed(from: Side, text: string): void {
  if (!split()) return;
  pending = { to: other(from), text };
  clearTimeout(timer);
  timer = setTimeout(flushSync, from === 'source' ? 250 : 0);
}

/** A side got the focus: it becomes the active editor, with everything from the other side in it first. */
export function focused(side: Side): void {
  const editor = editors.get(side);
  if (!editor || !split()) return;
  editors.get(other(side))?.flush?.();
  if (pending?.to === side) flushSync();
  bridge.editor = editor;
}

/** The text on each side (for tests): equal once the sides are in step. */
export function texts(): Partial<Record<Side, string>> {
  return Object.fromEntries([...editors].map(([side, e]) => [side, e.text()]));
}

/** The cursor moved on a side: the block it is in is marked on both sides. */
export function placed(side: Side): void {
  if (!split()) return;
  const v = editors.get('visual') as VisualEditor;
  const range = side === 'visual' ? v.blockRange() : (() => {
    const { ranges } = v.current();
    return ranges[blockAt(ranges, editors.get('source')!.offset())] ?? null;
  })();
  // the other side scrolls to it when it is out of sight; the side being used stays where the author is
  for (const [s, e] of editors) e.link(range, s !== side);
}
