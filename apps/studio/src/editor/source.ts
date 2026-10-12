/**
 * The source editor: CodeMirror 6 with undo and redo, search, line numbers, LibKa directive highlighting and the
 * source problems on their lines. Tab is left to keyboard navigation (no focus trap); Ctrl+F searches.
 */
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Annotation, Compartment, EditorSelection, EditorState, RangeSetBuilder, StateEffect, StateField, Transaction, type Extension } from '@codemirror/state';
import {
  Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, MatchDecorator,
  ViewPlugin, type DecorationSet, type ViewUpdate,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { MarkdownConfig } from '@lezer/markdown';
import type { Problem } from '@libka/model';

/** Markdown in the token colours: classes only, the colours live in studio.css. */
const highlight = HighlightStyle.define([
  { tag: tags.heading, class: 'cm-lk-heading' },
  { tag: [tags.strong], class: 'cm-lk-strong' },
  { tag: [tags.emphasis], class: 'cm-lk-em' },
  { tag: tags.url, class: 'cm-lk-link' },
  { tag: [tags.monospace], class: 'cm-lk-code' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator, tags.list, tags.quote], class: 'cm-lk-mark' },
  { tag: [tags.comment], class: 'cm-lk-comment' },
]);

/** The front matter at the top (`---` … `---`) is one block, not a paragraph with a heading underline. */
const frontMatter: MarkdownConfig = {
  defineNodes: [{ name: 'FrontMatter', block: true, style: tags.meta }],
  parseBlock: [{
    name: 'FrontMatter',
    parse(cx, line) {
      if (cx.lineStart !== 0 || line.text.trimEnd() !== '---') return false;
      const start = cx.lineStart;
      while (cx.nextLine()) if (line.text.trimEnd() === '---') { cx.nextLine(); break; }
      cx.addElement(cx.elt('FrontMatter', start, cx.prevLineEnd()));
      return true;
    },
  }],
};

/** LibKa's own syntax: `:::name[label]{attributes}` fences and inline `:kbd[…]`, `:badge[…]`. */
const directives = new MatchDecorator({
  regexp: /^(\s*:{3,})([\w-]*)|:(?:kbd|badge)\[|\{[^{}\n]*\}(?=\s*$)/g,
  decoration: (m) => Decoration.mark({ class: m[1] !== undefined ? 'cm-lk-directive' : m[0].startsWith('{') ? 'cm-lk-attrs' : 'cm-lk-directive' }),
});
const directivePlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = directives.createDeco(view); }
  update(u: ViewUpdate) { this.decorations = directives.updateDeco(u, this.decorations); }
}, { decorations: (v) => v.decorations });

/** A change that came from the other editor of a Split: not the author's typing here, so not reported back. */
const fromOtherSide = Annotation.define<boolean>();

/** The block being edited in the other editor of a Split, as a range of the text: its lines are marked. */
const setLinked = StateEffect.define<{ from: number; to: number } | null>();
const linked = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let out = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setLinked)) continue;
      if (!e.value) { out = Decoration.none; continue; }
      const doc = tr.state.doc;
      const b = new RangeSetBuilder<Decoration>();
      const first = doc.lineAt(Math.min(e.value.from, doc.length)).number, last = doc.lineAt(Math.min(Math.max(e.value.from, e.value.to - 1), doc.length)).number;
      for (let n = first; n <= last; n++) b.add(doc.line(n).from, doc.line(n).from, Decoration.line({ class: 'cm-lk-linked' }));
      out = b.finish();
    }
    return out;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** The change that turns `from` into `to`: the common start and end are kept. */
export function minimalChange(from: string, to: string): { from: number; to: number; insert: string } | null {
  if (from === to) return null;
  let a = 0;
  while (a < from.length && a < to.length && from.charCodeAt(a) === to.charCodeAt(a)) a++;
  let b = 0;
  while (b < from.length - a && b < to.length - a && from.charCodeAt(from.length - 1 - b) === to.charCodeAt(to.length - 1 - b)) b++;
  return { from: a, to: from.length - b, insert: to.slice(a, to.length - b) };
}

export interface SourceEditor {
  view: EditorView;
  /** Starts over with this text and an empty undo history (another project). */
  load(text: string): void;
  /** Replaces the text as one step the author can undo (only what differs changes; the cursor stays where it was). */
  replaceAll(text: string): void;
  /** Takes the other editor's text (Split): what differs changes, outside the undo history, and is not reported. */
  sync(text: string): void;
  /** Marks the lines of a range (Split: the block being edited on the other side). */
  link(range: { from: number; to: number } | null, reveal?: boolean): void;
  /** The address of a selected Markdown link ([text](address)). */
  linkHref(): string | undefined;
  /** Makes the selected text a Markdown link (null: back to plain text). */
  setLink(href: string | null): void;
  /** Inserts text at the cursor (or over the selection), selecting nothing, and focuses the editor. */
  insert(text: string): void;
  /** Selects a line and scrolls it into view. */
  goToLine(line: number): void;
  /** Shows the source problems on their lines. */
  showProblems(problems: readonly Problem[]): void;
  setLabel(label: string): void;
  focus(): void;
  destroy(): void;
}

export interface EditorOptions {
  parent: HTMLElement;
  text: string;
  label: string;
  onChange(text: string): void;
  onCursor(line: number, col: number): void;
  /** The cursor moved (or the text changed under it): its offset in the text. */
  onPlace?(offset: number): void;
  /** The editor got the focus. */
  onFocus?(): void;
  /** Files dropped or pasted into the editor (images). */
  onFiles(files: File[]): void;
  /** Typewriter scrolling (a preference): the line being edited stays in the middle. */
  typewriter?(): boolean;
  /** A problem's fixes, offered as actions on its diagnostic. */
  actions?(problem: Problem): { name: string; apply(): void }[];
}

export function createEditor(o: EditorOptions): SourceEditor {
  const label = new Compartment();
  let currentLabel = o.label;
  const attrs = (l: string) => EditorView.contentAttributes.of({ 'aria-label': l, tabindex: '0', spellcheck: 'true', autocapitalize: 'off', autocorrect: 'off' });
  const imagesFrom = (list: FileList | undefined | null) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
  const extensions = (): Extension[] => [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorView.lineWrapping,
    markdown({ extensions: [frontMatter] }),
    syntaxHighlighting(highlight),
    directivePlugin,
    lintGutter(),
    linked,
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    label.of(attrs(currentLabel)),
    EditorView.updateListener.of((u) => {
      const external = u.transactions.some((tr) => tr.annotation(fromOtherSide));
      if (u.docChanged && !external) o.onChange(u.state.doc.toString());
      if (u.focusChanged && u.view.hasFocus) o.onFocus?.();
      if ((u.docChanged && !external) || u.selectionSet) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        o.onCursor(line.number, head - line.from + 1);
        o.onPlace?.(head);
        if (o.typewriter?.()) requestAnimationFrame(() => u.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) }));
      }
    }),
    EditorView.domEventHandlers({
      drop(e) {
        const files = imagesFrom(e.dataTransfer?.files);
        if (!files.length) return false;
        e.preventDefault();
        o.onFiles(files);
        return true;
      },
      paste(e) {
        const files = imagesFrom(e.clipboardData?.files);
        if (!files.length) return false;
        e.preventDefault();
        o.onFiles(files);
        return true;
      },
    }),
  ];
  const view = new EditorView({ state: EditorState.create({ doc: o.text, extensions: extensions() }), parent: o.parent });

  return {
    view,
    load(text) { view.setState(EditorState.create({ doc: text, extensions: extensions() })); },
    replaceAll(text) {
      const change = minimalChange(view.state.doc.toString(), text);
      if (change) view.dispatch({ changes: change, scrollIntoView: true });
    },
    sync(text) {
      const change = minimalChange(view.state.doc.toString(), text);
      if (change) view.dispatch({ changes: change, annotations: [fromOtherSide.of(true), Transaction.addToHistory.of(false)] });
    },
    linkHref() {
      const { from, to } = view.state.selection.main;
      return /^\[[^\]]*\]\(([^)\s]*)\)$/.exec(view.state.sliceDoc(from, to))?.[1];
    },
    setLink(href) {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      const text = /^\[([^\]]*)\]\([^)]*\)$/.exec(selected)?.[1] ?? selected;
      const insert = href ? `[${text}](${href})` : text;
      view.dispatch({ changes: { from, to, insert }, selection: EditorSelection.range(from, from + insert.length) });
    },
    link(range, reveal) {
      const at = range && Math.min(range.from, view.state.doc.length);
      view.dispatch({ effects: [setLinked.of(range), ...(reveal && at !== null ? [EditorView.scrollIntoView(at, { y: 'nearest' })] : [])] });
    },
    insert(text) {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: EditorSelection.cursor(from + text.length), scrollIntoView: true });
      view.focus();
    },
    goToLine(n) {
      const line = view.state.doc.line(Math.min(Math.max(1, n), view.state.doc.lines));
      view.dispatch({ selection: EditorSelection.range(line.from, line.to), effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
      view.focus();
    },
    showProblems(problems) {
      const doc = view.state.doc;
      const diagnostics: Diagnostic[] = problems.map((p) => {
        const line = doc.line(Math.min(Math.max(1, p.line), doc.lines));
        const actions = o.actions?.(p) ?? [];
        return { from: line.from, to: line.to, severity: 'error', message: p.message, ...(actions.length ? { actions: actions.map((a) => ({ name: a.name, apply: () => a.apply() })) } : {}) };
      });
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    setLabel(l) { currentLabel = l; view.dispatch({ effects: label.reconfigure(attrs(l)) }); },
    focus() { view.focus(); },
    destroy() { view.destroy(); },
  };
}

/** The text before the cursor needs this to start a new block: nothing, one or two line breaks. */
export function blockLead(before: string): string {
  return before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
}
