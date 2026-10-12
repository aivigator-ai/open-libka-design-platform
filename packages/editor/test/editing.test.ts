import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { blockAt, load, loadedRanges, save, saveMapped, schema } from '../src/index.ts';

const md = `---
title: Editing
lang: en
---

## First   section

A paragraph   kept as written.

:::steps
1. **Open** the file.
2. **Save** it.
:::

Last  paragraph.
`;

/** The position just inside the end of the top-level block at `index`. */
function endOf(state: EditorState, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  return pos + state.doc.child(index).nodeSize - 1;
}

describe('editing with ProseMirror transactions', () => {
  it('typing in one block rewrites only that block', () => {
    const loaded = load(md);
    let state = EditorState.create({ doc: loaded.doc });
    state = state.apply(state.tr.insertText(' More.', endOf(state, 2)));
    expect(save(state.doc, loaded)).toBe(md.replace('A paragraph   kept as written.', 'A paragraph   kept as written. More.'));
  });

  it('undoing by hand back to the original text gives the original bytes again', () => {
    const loaded = load(md);
    let state = EditorState.create({ doc: loaded.doc });
    const at = endOf(state, 2);
    state = state.apply(state.tr.insertText('!', at));
    state = state.apply(state.tr.delete(at, at + 1));
    expect(save(state.doc, loaded)).toBe(md);
  });

  it('moving a block keeps its text and the text of every block', () => {
    const loaded = load(md);
    let state = EditorState.create({ doc: loaded.doc });
    const steps = state.doc.child(3);
    const from = endOf(state, 2) + 1;
    // move the steps above the paragraph: delete it, insert the same node before the paragraph
    let tr = state.tr.delete(from, from + steps.nodeSize);
    tr = tr.insert(endOf(state, 1) + 1, steps);
    state = state.apply(tr);
    const out = save(state.doc, loaded);
    expect(out).toContain(':::steps\n1. **Open** the file.\n2. **Save** it.\n:::\n\nA paragraph   kept as written.');
    expect(out).toContain('## First   section');
    expect(out.indexOf(':::steps')).toBeLessThan(out.indexOf('A paragraph'));
  });

  it('says where every block is, before and after an edit, so switching modes keeps the place', () => {
    const loaded = load(md);
    const ranges = loadedRanges(loaded);
    expect(ranges.map((r) => md.slice(r.from, r.to).split('\n')[0])).toEqual(['---', '## First   section', 'A paragraph   kept as written.', ':::steps', 'Last  paragraph.']);
    expect(blockAt(ranges, md.indexOf('**Save**'))).toBe(3);
    expect(blockAt(ranges, md.indexOf('\n\nLast'))).toBe(3);   // between blocks: the one before
    let state = EditorState.create({ doc: loaded.doc });
    state = state.apply(state.tr.insertText('Zero ', 1 + state.doc.child(0).nodeSize));
    const { text, ranges: after } = saveMapped(state.doc, loaded);
    expect(text.slice(after[1]!.from, after[1]!.to)).toBe('## Zero First   section');
    expect(text.slice(after[4]!.from, after[4]!.to)).toBe('Last  paragraph.');
  });

  it('splitting a paragraph after a space writes no stray space (no &#x20;)', () => {
    const loaded = load('One two three.\n');
    let state = EditorState.create({ doc: loaded.doc });
    state = state.apply(state.tr.split(5));   // after "One "
    expect(save(state.doc, loaded)).toBe('One\n\ntwo three.\n');
  });

  it('keeps a selection inside the schema: a cursor can sit in a directive label and in a table cell', () => {
    const loaded = load(':::callout[Read me]{variant=tip}\nBody.\n:::\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    const state = EditorState.create({ doc: loaded.doc, selection: TextSelection.create(loaded.doc, 3) });
    expect(state.selection.$from.parent.type).toBe(schema.nodes.directive_label);
    expect(loaded.doc.child(1).type).toBe(schema.nodes.table);
  });
});
