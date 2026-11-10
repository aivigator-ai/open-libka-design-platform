import { EditorState, NodeSelection, TextSelection, type Command } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { BLOCKS, block } from '@libka/blocks';
import { barPartHolder, barTarget, load, quickSetting, saveMapped, selectBlockAt, setBlockAttribute } from '../src/index.ts';

const HEAD = '---\ntitle: Bar\nlang: en\n---\n\n';
/** A document, the cursor in the text that contains `needle`. */
function at(markdown: string, needle: string): { state: EditorState; loaded: ReturnType<typeof load> } {
  const loaded = load(`${HEAD}${markdown.trim()}\n`);
  let pos = -1;
  loaded.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text!.includes(needle)) pos = p + n.text!.indexOf(needle); });
  expect(pos, needle).toBeGreaterThan(0);
  return { state: EditorState.create({ doc: loaded.doc, selection: TextSelection.create(loaded.doc, pos) }), loaded };
}
function apply(state: EditorState, c: Command): EditorState {
  let next = state;
  expect(c(state, (tr) => { next = state.apply(tr); })).toBe(true);
  return next;
}

describe('the block bar', () => {
  it('acts on the innermost LibKa block around the cursor, and on nothing in plain text', () => {
    const md = 'Plain text.\n\n::::cards\n:::card[First]\nA card with a callout:\n\n:::callout[Careful]{variant=warning}\nInside.\n:::\n:::\n::::';
    expect(barTarget(at(md, 'Plain').state)).toBeNull();
    // a card is a part of its cards, not a block of its own
    expect(barTarget(at(md, 'A card').state)?.name).toBe('cards');
    expect(barTarget(at(md, 'Inside').state)?.name).toBe('callout');
  });

  it('acts on the selected block, and finds the block of every registry example from its first text', () => {
    for (const b of BLOCKS) {
      if (!b.example.startsWith(':::')) continue;
      const loaded = load(`${HEAD}${b.example}\n`);
      // (the front matter is the document's first node)
      const start = loaded.doc.firstChild!.nodeSize;
      const first = loaded.doc.child(1);
      let pos = -1;
      first.descendants((n, p) => { if (pos < 0 && n.isTextblock && n.content.size) pos = start + 1 + p + 1; });
      // the selected block itself
      const selected = EditorState.create({ doc: loaded.doc, selection: NodeSelection.create(loaded.doc, start) });
      expect(barTarget(selected), b.name).toMatchObject({ name: first.attrs.name, pos: start });
      if (pos < 0) continue;
      // the cursor in its first text: that block, or a registry block inside it
      const t = barTarget(EditorState.create({ doc: loaded.doc, selection: TextSelection.create(loaded.doc, pos) }));
      expect(t && block(t.name), b.name).toBeTruthy();
      expect(t!.pos, b.name).toBeGreaterThanOrEqual(start);
      expect(t!.pos, b.name).toBeLessThan(start + first.nodeSize);
    }
  });

  it('acts on a figure', () => {
    const { state } = at('Before.\n\n![A chart of the year](chart.png "Sales by month")', 'Before');
    const fig = state.doc.child(2);
    const pos = state.doc.child(0).nodeSize + state.doc.child(1).nodeSize;
    const image = EditorState.create({ doc: state.doc, selection: NodeSelection.create(state.doc, pos + 1) });
    expect(barTarget(image)).toMatchObject({ name: 'figure', pos, node: fig });
    expect(barTarget(apply(state, selectBlockAt(pos)))?.name).toBe('figure');
  });

  it('offers the setting the registry marks, named in the language', () => {
    expect(quickSetting('callout', 'en')).toMatchObject({ key: 'variant', spec: { title: 'Kind' } });
    const cs = quickSetting('decision', 'cs')!;
    expect(cs.key).toBe('status');
    expect(cs.spec.labels?.accepted).toBeTruthy();
    expect(quickSetting('cards', 'en')).toBeNull();
    expect(quickSetting('figure', 'en')).toBeNull();
  });

  it('changes the setting with the rest of the document byte for byte, and the cursor stays', () => {
    const md = 'Intro.\n\n:::callout[Back up first]{variant=info}\nExport your data.\n:::\n\nAfter.';
    const { state, loaded } = at(md, 'Export');
    const t = barTarget(state)!;
    const next = apply(state, setBlockAttribute(t.pos, 'variant', 'warning'));
    expect(next.selection.from).toBe(state.selection.from);
    expect(saveMapped(next.doc, loaded).text).toBe(`${HEAD}${md.replace('variant=info', 'variant=warning')}\n`);
    // removed, and no change when the value is the same
    const gone = apply(next, setBlockAttribute(t.pos, 'variant', null));
    expect(saveMapped(gone.doc, loaded).text).toContain(':::callout[Back up first]\n');
    expect(setBlockAttribute(t.pos, 'variant', 'warning')(next)).toBe(false);
    // a selected block stays selected
    const sel = apply(state, selectBlockAt(t.pos));
    expect((apply(sel, setBlockAttribute(t.pos, 'variant', 'tip')).selection as NodeSelection).node.attrs.attributes).toEqual({ variant: 'tip' });
  });

  it('adds parts to the block or to its part holder, and has none for a matrix', () => {
    const flow = at(block('flow')!.example, 'customer writes');
    expect(barPartHolder(flow.state, barTarget(flow.state)!)?.node.attrs.name).toBe('flow');
    const pc = block('pros-cons')!.example;
    const inPros = at(pc, pc.split('\n').find((l) => l.startsWith('- '))!.slice(2, 8));
    expect(barTarget(inPros.state)?.name).toBe('pros-cons');
    expect(barPartHolder(inPros.state, barTarget(inPros.state)!)?.node.attrs.name).toBe('pros');
    const mx = block('matrix')!.example;
    const m = EditorState.create({ doc: load(`${HEAD}${mx}\n`).doc });
    const sel = apply(m, selectBlockAt(m.doc.firstChild!.nodeSize));
    expect(barPartHolder(sel, barTarget(sel)!)).toBeNull();
  });
});
