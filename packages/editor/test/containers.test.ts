import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parse } from '@libka/model';
import { load, save, schema, type Loaded } from '../src/index.ts';
import { corpus } from './corpus.ts';

/** A block inside a container, as loaded: where its node is in the document and where its text is in the source. */
interface Child { name: string; pos: number; node: PMNode; from: number; to: number }

/** Every block inside every container, at every level, with its place in the document and in the source. */
function childrenOf(loaded: Loaded): Child[] {
  const out: Child[] = [];
  type O = Loaded['origins'][number];
  const visit = (node: PMNode, pos: number, o: O, path: string) => {
    if (!o.inner) return;
    let k = 0;
    node.forEach((c, offset) => {
      if (c.type.name === 'directive_label') return;
      const co = o.inner!.children[k++]!;
      const at = pos + 1 + offset;
      const name = `${path} > ${c.type.name === 'directive' ? c.attrs.name : c.type.name} ${k}`;
      out.push({ name, pos: at, node: c, from: co.start, to: co.start + co.text.length });
      visit(c, at, co, name);
    });
  };
  let pos = 0;
  loaded.origins.forEach((o, i) => {
    const node = loaded.doc.child(i);
    if (node.type.name === 'directive') visit(node, pos, o, `${node.attrs.name} ${i}`);
    pos += node.nodeSize;
  });
  return out;
}

/** The position at the end of the first textblock in a node at `pos`, or null when it has none (a source island). */
function typingPlace(node: PMNode, pos: number): number | null {
  if (node.isTextblock) return node.type.spec.code || node.inlineContent ? pos + 1 + node.content.size : null;
  let found: number | null = null;
  node.descendants((d, p) => {
    if (found !== null) return false;
    if (d.isTextblock) { found = pos + 1 + p + 1 + d.content.size; return false; }
    return true;
  });
  return found;
}

const canonical = (md: string) => save(load(md).doc, null);

describe('an edit inside a container block rewrites only the block that changed', () => {
  const cases = corpus.flatMap(([doc, md]) => {
    const loaded = load(md);
    return childrenOf(loaded).map((c) => [`${doc}: ${c.name}`, md, c] as [string, string, Child]);
  });

  it('has containers worth the name', () => {
    expect(cases.length).toBeGreaterThan(150);
  });

  it.each(cases)('%s: one letter typed, only its lines differ', (_name, md, child) => {
    const loaded = load(md);
    const at = typingPlace(child.node, child.pos);
    if (at === null) return;
    const state = EditorState.create({ doc: loaded.doc });
    const doc = state.apply(state.tr.insertText('x', at)).doc;
    const out = save(doc, loaded);
    expect(out.startsWith(md.slice(0, child.from)), 'the text before the block is kept').toBe(true);
    expect(out.endsWith(md.slice(child.to)), 'the text after the block is kept').toBe(true);
    // and it reads back as what the editor holds
    expect(canonical(out)).toBe(save(doc, null));
  });
});

describe('container blocks keep their writing', () => {
  const md = `---
title: Cards
lang: en
---

::::cards
:::card[Code]{href="#code" icon="code"}
Write it.
:::
:::card[Docs]{href="#docs"}
Read   it.
:::
::::
`;
  const edit = (src: string, f: (s: EditorState) => EditorState) => {
    const loaded = load(src);
    return save(f(EditorState.create({ doc: loaded.doc })).doc, loaded);
  };
  /** The position at the end of the first textblock whose text is `text`. */
  const endOfText = (doc: PMNode, text: string): number => {
    let at = -1;
    doc.descendants((n, p) => { if (at < 0 && n.isTextblock && n.textContent === text) at = p + 1 + n.content.size; return at < 0; });
    expect(at, text).toBeGreaterThan(0);
    return at;
  };

  it('typing in a card keeps the other card, the gaps and every quote', () => {
    const out = edit(md, (s) => s.apply(s.tr.insertText('!', endOfText(s.doc, 'Write it.'))));
    expect(out).toBe(md.replace('Write it.', 'Write it.!'));
  });

  it('a changed attribute rewrites only its own line', () => {
    const out = edit(md, (s) => {
      let pos = -1;
      s.doc.descendants((n, p) => { if (pos < 0 && n.type.name === 'directive' && n.attrs.name === 'card') pos = p; return pos < 0; });
      const card = s.doc.nodeAt(pos)!;
      return s.apply(s.tr.setNodeMarkup(pos, null, { ...card.attrs, attributes: { href: '#code' } }));
    });
    expect(out).toBe(md.replace(':::card[Code]{href="#code" icon="code"}', ':::card[Code]{href=#code}'));
  });

  it('a new card gets the spacing the others have', () => {
    const loaded = load(md);
    const added = schema.nodes.directive!.create({ name: 'card', attributes: {} },
      [schema.nodes.directive_label!.create(null, schema.text('New')), schema.nodes.paragraph!.create(null, schema.text('Fresh.'))]);
    const state = EditorState.create({ doc: loaded.doc });
    // inside the cards block, after its last card
    const end = loaded.doc.child(0).nodeSize + loaded.doc.child(1).nodeSize - 1;
    const out = save(state.apply(state.tr.insert(end, added)).doc, loaded);
    expect(out).toBe(md.replace(':::\n::::', ':::\n:::card[New]\nFresh.\n:::\n::::'));
  });

  it('a decision\'s options keep their writing down to the edited list', () => {
    const src = `---
title: Decisions
lang: en
---

## Before

::::::decision[Use a shared drive]{status=accepted date=2026-10-01 by="The board"}
We   chose the shared drive.

:::context
The files are scattered.
:::

:::::options
::::pros-cons[Shared drive]
:::pros
- One place
:::
:::cons
- Needs   a login
:::
::::
:::::
::::::
`;
    const out = edit(src, (s) => s.apply(s.tr.insertText('!', endOfText(s.doc, 'Needs   a login'))));
    expect(out).toBe(src.replace('- Needs   a login', '- Needs   a login!'));
    expect(parse(out).problems).toEqual([]);
  });

  it('a nested block that needs a longer fence makes the fences around it longer, and nothing else changes', () => {
    const src = '::::tabs\n:::tab[A]\nOne.\n:::\n:::tab[B]\nTwo.\n:::\n::::\n';
    const out = edit(src, (s) => {
      const callout = schema.nodes.directive!.create({ name: 'callout', attributes: { variant: 'info' } }, schema.nodes.paragraph!.create(null, schema.text('Note.')));
      return s.apply(s.tr.insert(endOfText(s.doc, 'One.') + 1, callout));
    });
    expect(out).toBe(':::::tabs\n::::tab[A]\nOne.\n\n:::callout{variant=info}\nNote.\n:::\n::::\n:::tab[B]\nTwo.\n:::\n:::::\n');
    // it reads back as two tabs, the first holding its text and the callout
    const tabs = load(out).doc.child(0);
    expect(tabs.childCount).toBe(2);
    expect([tabs.child(0).child(1).type.name, tabs.child(0).child(2).attrs.name]).toEqual(['paragraph', 'callout']);
  });

  it('an unclosed block, or one indented, is written in the canonical style as before', () => {
    const typed = (src: string) => edit(src, (s) => s.apply(s.tr.insertText('!', endOfText(s.doc, 'One.'))));
    expect(typed(':::callout{variant="info"}\nOne.\n\nTwo.\n')).toBe(':::callout{variant=info}\nOne.!\n\nTwo.\n:::\n');
    expect(typed('  :::callout{variant="info"}\n  One.\n  :::\n')).toBe(':::callout{variant=info}\nOne.!\n:::\n');
    expect(typed('Lead.\n\n  :::callout{variant="info"}\n  One.\n  :::\n')).toBe('Lead.\n\n:::callout{variant=info}\nOne.!\n:::\n');
  });

  it('keeps the blank lines around an edited top-level block when they hold an empty line', () => {
    const src = '## Head\nText   one.\n\n\n\nText two.\n';
    const out = edit(src, (s) => s.apply(s.tr.insertText('!', endOfText(s.doc, 'Text   one.'))));
    // a single line break after the heading becomes an empty line, as before; the three empty lines stay
    expect(out).toBe('## Head\n\nText   one.!\n\n\n\nText two.\n');
    // with Windows line breaks too
    const crlf = src.replaceAll('\n', '\r\n');
    expect(edit(crlf, (s) => s.apply(s.tr.insertText('!', endOfText(s.doc, 'Text   one.'))))).toBe('## Head\n\nText   one.!\r\n\r\n\r\n\r\nText two.\r\n');
  });

  it('a footnote inside a block keeps the block\'s writing', () => {
    const src = ':::callout{variant="info"}\nSee the note.[^n]\n\nMore.\n:::\n\n[^n]: The note.\n';
    const out = edit(src, (s) => s.apply(s.tr.insertText('!', endOfText(s.doc, 'More.'))));
    expect(out).toBe(src.replace('More.', 'More.!'));
  });
});
