import { describe, expect, it, vi } from 'vitest';
import { compare } from '../src/core/compare.ts';
import { toggleOutput, withOutputs } from '../src/core/outputs.ts';
import { Registry } from '../src/state/commands.ts';
import { blockLead } from '../src/editor/source.ts';

describe('comparison', () => {
  it('pairs changed lines side by side and counts them', () => {
    const { rows, added, removed } = compare('a\nb\nc\n', 'a\nB\nc\nd\n');
    expect({ added, removed }).toEqual({ added: 2, removed: 1 });
    expect(rows).toEqual([
      { kind: 'same', left: { n: 1, text: 'a' }, right: { n: 1, text: 'a' } },
      { kind: 'change', left: { n: 2, text: 'b' }, right: { n: 2, text: 'B' } },
      { kind: 'same', left: { n: 3, text: 'c' }, right: { n: 3, text: 'c' } },
      { kind: 'change', left: null, right: { n: 4, text: 'd' } },
    ]);
  });

  it('folds long unchanged stretches but keeps two lines of context, and numbers lines on both sides', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    const after = before.replace('line 10', 'line ten');
    const { rows } = compare(before, after);
    expect(rows.map((r) => r.kind)).toEqual(['fold', 'same', 'same', 'change', 'same', 'same', 'fold']);
    expect(rows[0]).toEqual({ kind: 'fold', count: 7 });
    expect(rows[3]).toEqual({ kind: 'change', left: { n: 10, text: 'line 10' }, right: { n: 10, text: 'line ten' } });
    expect(rows.at(-1)).toEqual({ kind: 'fold', count: 8 });
  });

  it('says nothing changed for equal texts', () => {
    expect(compare('x\ny', 'x\ny')).toMatchObject({ added: 0, removed: 0 });
  });
});

describe('outputs', () => {
  it('writes the list into the front matter, replacing a block list, or adds a front matter', () => {
    expect(withOutputs('---\ntitle: A\noutputs:\n  - web\n  - pdf\nlang: en\n---\n\nText\n', ['deck'])).toBe('---\ntitle: A\noutputs: [deck]\nlang: en\n---\n\nText\n');
    expect(withOutputs('Text\n', ['web', 'docx'])).toBe('---\noutputs: [web, docx]\n---\n\nText\n');
  });
  it('keeps the PDF and the Word file tied to the web page, and never leaves nothing', () => {
    expect(toggleOutput(['web', 'pdf', 'docx'], 'web', false)).toBeNull();
    expect(toggleOutput(['web', 'pdf', 'deck'], 'web', false)).toEqual(['deck']);
    expect(toggleOutput(['deck'], 'docx', true)).toEqual(['web', 'deck', 'docx']);
    expect(toggleOutput(['web'], 'web', false)).toBeNull();
  });
});

describe('commands and extensions', () => {
  it('runs commands by name, offers available ones in menu order, and calls project hooks in turn', async () => {
    const r = new Registry();
    const ran: string[] = [];
    const opened = vi.fn();
    r.register({
      id: 'core', commands: [
        { id: 'a', title: 'file.new', run: () => { ran.push('a'); } },
        { id: 'b', title: 'file.example', keys: 'Mod-s', run: (x: unknown) => { ran.push(`b:${String(x)}`); } },
        { id: 'c', title: 'folder.open', available: () => false, run: () => { ran.push('c'); } },
      ],
      menu: [{ menu: 'file', command: 'b', order: 2 }, { menu: 'file', command: 'a', order: 1 }, { menu: 'file', command: 'c', order: 0 }],
      hooks: { opened },
    });
    r.register({ id: 'pro', panels: [{ id: 'p', title: 'panel.history', order: 5, render: () => null }], hooks: { opened } });
    await r.run('a');
    await r.run('b', 7);
    await r.run('c');   // unavailable: nothing happens
    expect(ran).toEqual(['a', 'b:7']);
    expect(r.menu('file').map((c) => c.id)).toEqual(['a', 'b']);
    expect(r.shortcuts().map((c) => c.id)).toEqual(['b']);
    expect(r.panels().map((p) => p.id)).toEqual(['p']);
    await r.hook('opened', { id: 'x' } as never);
    expect(opened).toHaveBeenCalledTimes(2);
    await expect(r.run('nope')).rejects.toThrow('unknown command');
    expect(() => r.register({ id: 'core' })).toThrow('already registered');
    expect(() => r.register({ id: 'other', commands: [{ id: 'a', title: 'file.new', run: () => undefined }] })).toThrow('already registered');
  });

  it('starts a block on its own lines', () => {
    expect(blockLead('')).toBe('');
    expect(blockLead('text')).toBe('\n\n');
    expect(blockLead('text\n')).toBe('\n');
    expect(blockLead('text\n\n')).toBe('');
  });
});
