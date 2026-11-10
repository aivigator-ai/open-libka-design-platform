import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parse } from '@libka/model';
import { BLOCKS } from '@libka/blocks';
import { addPart, canAddPart, LAID_OUT, LAID_PARTS, load, partCount, partHolder, partName, save, saveMapped } from '../src/index.ts';

/** A document with one block's registry example, the cursor in the text that contains `needle`. */
function doc(markdown: string, needle: string): { state: EditorState; loaded: ReturnType<typeof load> } {
  const loaded = load(`---\ntitle: Parts\nlang: en\n---\n\n${markdown.trim()}\n`);
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
const type = (state: EditorState, text: string) => state.apply(state.tr.insertText(text));
const example = (name: string) => BLOCKS.find((b) => b.name === name)!.example;
/** What the model still asks for after the test has typed only the new part's first text. */
const PENDING: Record<string, string[]> = {
  metrics: ['metrics-label'],   // the figure is typed, its label not yet
  timeline: ['timeline-item'],   // the date, not yet what happens then
  cards: ['card-text'],   // the title, not yet the card's text
  compare: ['missing-label'],   // the do, not yet the don't
};

describe('laid-out blocks and their parts', () => {
  it('names a part in both languages and knows every laid-out block in the registry', () => {
    expect(partName('flow', 'en')).toBe('Stage');
    expect(partName('cards', 'cs')).toBe('Dlaždice');
    expect(partName('matrix', 'en')).toBeNull();
    for (const name of [...LAID_OUT, ...Object.keys(LAID_PARTS)]) {
      expect(BLOCKS.some((b) => b.name === name || Object.keys(b.children ?? {}).includes(name)), name).toBe(true);
    }
  });

  it('takes its limits from the registry (a flow has six stages at most, the key figures four)', () => {
    expect(LAID_PARTS.flow!.max).toBe(6);
    expect(LAID_PARTS.metrics!.max).toBe(4);
    expect(LAID_PARTS.steps!.max).toBeUndefined();
  });

  for (const [name, needle, typed, expected] of [
    ['flow', 'confirms it is solved', 'The case is closed', /4\. The customer confirms it is solved\n5\. The case is closed\n:::/],
    ['steps', 'Keep the default', 'Restart', /2\. \*\*Run the installer\*\* Keep the default folder\.\n3\. \*\*Restart\*\*/],
    ['metrics', 'third-party requests', '12', /- \*\*0\*\* third-party requests\n- \*\*12\*\*\n:::/],
    ['timeline', 'Teams move in', '2026-Q4', /- \*\*2026-Q3\*\* Teams move in\n- \*\*2026-Q4\*\*\n:::/],
    ['pros-cons', 'Quiet time', 'Fewer interruptions', /- Quiet time for focused work\n- Fewer interruptions\n:::\n\n?:::cons/],
    ['cards', 'drawn from a table', 'Diagrams', /:::card\[Diagrams\]\n\n?:::\n::::/],
    ['compare', '"OK" or', 'Say what it does', /:::do\[Say what it does\]\n\n?:::\n\n?:::dont\n\n?:::\n::::/],
    ['tabs', 'Setup.dmg', 'Linux', /:::tab\[Linux\]\n\n?:::\n::::/],
    ['accordion', 'one local file', 'Is it free?', /:::item\[Is it free\?\]\n\n?:::\n::::/],
  ] as const) {
    // (an edit inside a block writes that block anew, as typing does: "the rest" is every block before it)
    it(`adds a part to ${name} at its end, the cursor in it, the blocks before it byte for byte`, () => {
      const { state, loaded } = doc(example(name), needle);
      const holder = partHolder(state)!;
      expect(holder).not.toBeNull();
      const before = partCount(holder.node);
      const next = type(apply(state, addPart()), typed);
      const after = partHolder(next)!;
      expect(partCount(after.node)).toBe(before + 1);
      const text = saveMapped(next.doc, loaded).text;
      expect(text).toMatch(expected);
      // the document before the block is unchanged, and the block keeps its parts' text
      const original = save(loaded.doc);
      expect(text.startsWith(original.slice(0, original.indexOf(':::')))).toBe(true);
      expect(text).toContain(needle);
      // a new list item is complete once typed; a new card or pair still wants its text, which the model asks for
      expect(parse(text).problems.map((p) => p.code)).toEqual(PENDING[name] ?? []);
    });
  }

  it('stops at the limit, and a matrix adds no quadrant', () => {
    const six = ':::flow[Six]\n1. a\n2. b\n3. c\n4. d\n5. e\n6. f\n:::';
    const { state } = doc(six, 'f');
    expect(canAddPart(partHolder(state)!.node)).toBe(false);
    expect(addPart()(state)).toBe(false);
    const m = doc(example('matrix'), 'Translate old');
    expect(partHolder(m.state)).toBeNull();
    expect(addPart()(m.state)).toBe(false);
  });

  it('adds a list when the block has none yet, and works from the block\'s position', () => {
    const { state, loaded } = doc(':::metrics\nSoon.\n:::', 'Soon');
    const pos = partHolder(state)!.pos;
    const next = type(apply(state, addPart(pos)), 'First');
    expect(saveMapped(next.doc, loaded).text).toMatch(/:::metrics\nSoon\.\n\n- First\n:::/);
  });
});
