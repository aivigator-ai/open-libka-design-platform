/**
 * The editor in use: the source editor (CodeMirror) or the visual editor (ProseMirror). The rest of the Studio talks
 * to whichever is active through this one interface; in Split both are open and the one last used is active.
 */
import type { Problem } from '@libka/model';

export interface ActiveEditor {
  mode: 'source' | 'visual';
  /** Replaces the whole text (a restore, an import into this project), as one step the author can undo where possible. */
  replaceAll(text: string): void;
  /** Inserts blocks written in Markdown at the cursor (after the selected block in visual mode). */
  insertMarkdown(markdown: string): void;
  /** Shows a source line: selects it, or the block that holds it. */
  goToLine(line: number): void;
  showProblems(problems: readonly Problem[]): void;
  setLabel(label: string): void;
  focus(): void;
  /** Where the author is, as an offset in the Markdown text (for switching modes). */
  offset(): number;
  /** The selected text, for tests and automation. */
  selection(): string;
  /** The editor's Markdown as it stands (the visual editor's as last written). */
  text(): string;
  /** Text is selected (not a block, not nothing): Ctrl/Cmd+K then makes a link of it. */
  textSelected(): boolean;
  /** The address of the link at the selection, when it is in one. */
  linkHref(): string | undefined;
  /** Makes the selected text a link to `href` (null: no longer a link). */
  setLink(href: string | null): void;
  /**
   * Takes the text the other editor of a Split wrote: only what differs is replaced, outside this editor's undo
   * history, keeping its selection and scroll; no change is reported back.
   */
  sync(text: string): void;
  /**
   * Marks the block at this range of the Markdown (Split: the block being edited on the other side); null clears.
   * `reveal` scrolls it into view when it is out of sight.
   */
  link(range: { from: number; to: number } | null, reveal?: boolean): void;
  /** Writes a change still waiting (the visual editor reports typing a moment later). */
  flush?(): void;
  destroy(): void;
}
