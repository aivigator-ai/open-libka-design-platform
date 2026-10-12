import { Fragment } from 'prosemirror-model';
import { NodeSelection, TextSelection, EditorState, type Command } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parse } from '@libka/model';
import {
  blockInfo, BlockSelection, changeType, conversionsFor, deleteBlocks, duplicateBlocks, enterBlock, extendSelection, insertBlock, load, markdownOf, moveBlocks,
  objectRange, save, selectedObject, selectParent, selectSibling, sliceFromMarkdown, unwrap, wrapIn, INSERTABLE,
} from '../src/index.ts';

const md = `---
title: Commands
lang: en
---

## One

Para A.

:::callout[Heads up]{variant=info}
Inside the callout.
:::

- item one
- item two
`;

/** A state with the cursor in the text that contains `needle`. */
function at(source: string, needle: string): { state: EditorState; loaded: ReturnType<typeof load> } {
  const loaded = load(source);
  let pos = -1;
  loaded.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text!.includes(needle)) pos = p + n.text!.indexOf(needle); });
  return { state: EditorState.create({ doc: loaded.doc, selection: TextSelection.create(loaded.doc, pos) }), loaded };
}
function run(state: EditorState, ...commands: Command[]): EditorState {
  for (const c of commands) {
    let next = state;
    expect(c(state, (tr) => { next = state.apply(tr); })).toBe(true);
    state = next;
  }
  return state;
}
const types = (s: EditorState) => { const out: string[] = []; s.doc.forEach((n) => out.push(n.type.name)); return out; };

describe('selecting blocks as objects', () => {
  it('Esc selects the block around the cursor, again its parent; Enter goes back in', () => {
    let { state } = at(md, 'Inside');
    state = run(state, selectParent);
    expect((state.selection as NodeSelection).node.type.name).toBe('paragraph');
    state = run(state, selectParent);
    expect((state.selection as NodeSelection).node.attrs.name).toBe('callout');
    expect(blockInfo((state.selection as NodeSelection).node).title).toBe('Callout');
    state = run(state, enterBlock);
    expect(state.selection.$from.parent.type.name).toBe('directive_label');   // into its title
  });

  it('the first paragraph of a list item stands for the item', () => {
    const { state } = at(md, 'item two');
    expect(selectedObject(state)?.node.type.name).toBe('list_item');
  });

  it('arrows move between sibling blocks, Shift+arrows select a run of them', () => {
    let { state } = at(md, 'Para A');
    state = run(state, selectParent, selectSibling(1));
    expect((state.selection as NodeSelection).node.attrs.name).toBe('callout');
    state = run(state, extendSelection(-1), extendSelection(-1));
    expect(state.selection).toBeInstanceOf(BlockSelection);
    const r = objectRange(state)!;
    expect([r.start, r.end]).toEqual([1, 4]);
    const top = run(state, selectSibling(-1));
    expect((top.selection as NodeSelection).node.type.name).toBe('front_matter');   // the front matter is a block too
    expect(selectSibling(-1)(top)).toBe(false);   // nothing above it
  });
});

describe('selections on the parts of a block', () => {
  it('a selected title row stands for its block, and a run never takes the title row in', () => {
    const loaded = load(md);
    let labelPos = -1;
    loaded.doc.descendants((n, p) => { if (labelPos < 0 && n.type.name === 'directive_label') labelPos = p; });
    const onLabel = EditorState.create({ doc: loaded.doc, selection: NodeSelection.create(loaded.doc, labelPos) });
    expect(selectedObject(onLabel)?.node.attrs.name).toBe('callout');
    // a text selection from the title into the body covers the body's blocks only, so wrapping it is valid
    const across = EditorState.create({ doc: loaded.doc, selection: TextSelection.create(loaded.doc, labelPos + 2, labelPos + 14) });
    const r = objectRange(across)!;
    expect(r.parent.child(r.start).type.name).not.toBe('directive_label');
    expect(() => wrapIn('callout')(across)).not.toThrow();
  });

  it('a selected picture stands for its figure', () => {
    const loaded = load('Text.\n\n![A screen](images/a.png "The screen")\n');
    const pos = loaded.doc.child(0).nodeSize + 1;
    const state = EditorState.create({ doc: loaded.doc, selection: NodeSelection.create(loaded.doc, pos) });
    expect(state.selection instanceof NodeSelection && state.selection.node.type.name).toBe('image');
    expect(selectedObject(state)?.node.type.name).toBe('paragraph');
    expect(blockInfo(selectedObject(state)!.node).title).toBe('Figure');
  });
});

describe('moving, duplicating, deleting', () => {
  it('moves the block at the cursor up and down; untouched blocks keep their bytes', () => {
    const { state: s0, loaded } = at(md, 'Para A');
    const up = run(s0, moveBlocks(-1));
    expect(types(up)).toEqual(['front_matter', 'paragraph', 'heading', 'directive', 'bullet_list']);
    expect(up.selection.$from.parent.textContent).toBe('Para A.');   // the cursor stays in its text
    expect(save(up.doc, loaded)).toBe(md.replace('## One\n\nPara A.', 'Para A.\n\n## One'));
    const down = run(s0, moveBlocks(1), moveBlocks(1));
    expect(save(down.doc, loaded)).toBe(md.replace('Para A.\n\n', '').replace('- item two\n', '- item two\n\nPara A.\n'));
    expect(moveBlocks(1)(down)).toBe(false);   // already last
  });

  it('moves a selected run, keeps it selected, and stops at the edge', () => {
    let { state } = at(md, 'Para A');
    state = run(state, selectParent, extendSelection(1), moveBlocks(1));
    expect(types(state)).toEqual(['front_matter', 'heading', 'bullet_list', 'paragraph', 'directive']);
    expect(objectRange(state)).toMatchObject({ start: 3, end: 5 });
  });

  it('duplicates below and selects the copy; deletes; a last block leaves an empty paragraph', () => {
    const { state, loaded } = at(md, 'Inside');
    const dup = run(state, selectParent, selectParent, duplicateBlocks);
    expect(types(dup)).toEqual(['front_matter', 'heading', 'paragraph', 'directive', 'directive', 'bullet_list']);
    expect(objectRange(dup)).toMatchObject({ start: 4, end: 5 });
    expect(save(dup.doc, loaded)).toContain(':::callout[Heads up]{variant=info}\nInside the callout.\n:::\n\n:::callout[Heads up]{variant=info}\nInside the callout.\n:::');
    const del = run(dup, deleteBlocks);
    expect(save(del.doc, loaded)).toBe(md);
    const lone = at('Only.\n', 'Only');
    expect(types(run(lone.state, deleteBlocks))).toEqual(['paragraph']);
  });
});

describe('changing, wrapping, inserting', () => {
  it('offers the types a block can become, with what would be lost', () => {
    const para = load('Some **bold** text.\n').doc.firstChild!;
    expect(conversionsFor(para).map((c) => c.key)).toEqual(['heading1', 'heading2', 'heading3', 'heading4', 'blockquote', 'code']);
    expect(conversionsFor(para).find((c) => c.key === 'code')!.lost).toEqual(['formatting (bold, italic, links)']);
    const callout = load(':::callout[T]{variant=warning}\nx\n:::\n').doc.firstChild!;
    const toSummary = conversionsFor(callout).find((c) => c.key === 'summary')!;
    expect(toSummary.lost).toEqual(['the setting "variant"']);
    // only blocks that hold running content are offered: not a contents list or release notes
    expect(conversionsFor(callout).map((c) => c.key).sort()).toEqual(['notes', 'quote', 'statement', 'summary']);
  });

  it('changes a paragraph into a heading, and a list into a checklist that still parses', () => {
    const { state, loaded } = at(md, 'Para A');
    expect(save(run(state, changeType('heading3')).doc, loaded)).toContain('### Para A.');
    const list = run(at(md, 'item one').state, selectParent, selectParent, changeType('checklist'));
    const out = save(list.doc, loaded);
    expect(out).toContain(':::checklist\n- [ ] item one\n- [ ] item two\n:::');
    expect(parse(out).problems).toEqual([]);
  });

  it('wraps blocks in a callout and unwraps it again', () => {
    const { state, loaded } = at(md, 'Para A');
    const wrapped = run(state, wrapIn('callout'));
    const out = save(wrapped.doc, loaded);
    expect(out).toMatch(/\n:::callout\[[^\]]+\]\{variant=warning\}\nPara A\.\n:::\n/);   // the registry example's title and setting, to edit
    expect(parse(out).problems).toEqual([]);
    // unwrapped, the blocks are back as written, after the title it was given
    const back = save(run(wrapped, unwrap).doc, loaded);
    expect(back).not.toContain(':::callout{');
    expect(back).toMatch(/## One\n\n[^\n]+\n\nPara A\.\n\n:::callout\[Heads up\]/);
    // unwrapping keeps the title as a paragraph
    const titled = run(at(md, 'Inside').state, selectParent, selectParent, unwrap);
    expect(save(titled.doc, loaded)).toContain('Para A.\n\nHeads up\n\nInside the callout.\n\n- item one');
  });

  it('inserts any registry block from its example; it parses without problems', () => {
    expect(INSERTABLE.length).toBeGreaterThan(30);
    for (const b of INSERTABLE.filter((x) => !['references', 'notes'].includes(x.name))) {
      const { state, loaded } = at(md, 'Para A');
      const next = run(state, insertBlock(b.name));
      const out = save(next.doc, loaded);
      expect(parse(out).problems.map((p) => `${b.name}: ${p.message}`)).toEqual([]);
    }
  });

  it('an empty paragraph is replaced by the inserted block; inside a list item, blocks go into the item', () => {
    const empty = load('Text.\n\n:::steps\n1. **Do** it.\n:::\n');
    let state = EditorState.create({ doc: empty.doc, selection: TextSelection.create(empty.doc, 6) });
    state = run(state, insertBlock('paragraph'), insertBlock('heading'));
    expect(types(state)).toEqual(['paragraph', 'heading', 'heading', 'directive']);   // the example: a section and a subsection
  });
});

describe('Markdown on the clipboard', () => {
  it('copies blocks as LibKa Markdown and pastes Markdown as blocks', () => {
    const { state } = at(md, 'Inside');
    const selected = run(state, selectParent, selectParent);
    expect(markdownOf(selected.selection.content())).toBe(':::callout[Heads up]{variant=info}\nInside the callout.\n:::');
    const slice = sliceFromMarkdown('## Pasted\n\n- a\n- b\n');
    expect(slice.content.childCount).toBe(2);
    expect(sliceFromMarkdown('just *words*').openStart).toBe(1);   // a single paragraph pastes into the text
    expect(markdownOf(sliceFromMarkdown('> [!TIP]\r\n> Pasted on Windows.\r\n'))).toBe('> [!TIP]\n> Pasted on Windows.');
  });

  it('copies a selected list item inside its own kind of list, numbered from its place', () => {
    const item = (source: string, needle: string) => {
      const { state } = at(source, needle);
      const $pos = state.selection.$from;
      return NodeSelection.create(state.doc, $pos.before($pos.depth - 1));
    };
    const bullet = item(md, 'item two');
    expect(markdownOf(bullet.content(), bullet.$from)).toBe('- item two');
    const ordered = item('1. first\n2. second\n3. third\n', 'second');
    expect(markdownOf(ordered.content(), ordered.$from)).toBe('2. second');
    expect(markdownOf(ordered.content())).toBe('- second');   // without the selection's place, a bullet list
  });

  it('writes a GitHub alert\'s marker as it is, never escaped', () => {
    const quote = load('> [!TIP]\n> The export also works.\n').doc.firstChild!;
    expect(markdownOf(Fragment.from(quote.type.create(null, quote.content)))).toBe('> [!TIP]\n> The export also works.');
    expect(markdownOf(load('> Not [!TIP] first\n').doc.content)).toBe('> Not \\[!TIP] first');   // only at the start
  });
});
