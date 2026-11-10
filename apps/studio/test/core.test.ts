import { describe, expect, it, vi } from 'vitest';
import { compare } from '../src/core/compare.ts';
import { toggleOutput } from '../src/core/outputs.ts';
import { aiFields, authorText, authorValue, frontMatter, withAiField, withField } from '../src/core/frontmatter.ts';
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
  it('keeps the PDF and the Word file tied to the web page, and never leaves nothing', () => {
    expect(toggleOutput(['web', 'pdf', 'docx'], 'web', false)).toBeNull();
    expect(toggleOutput(['web', 'pdf', 'deck'], 'web', false)).toEqual(['deck']);
    expect(toggleOutput(['deck'], 'docx', true)).toEqual(['web', 'deck', 'docx']);
    expect(toggleOutput(['web'], 'web', false)).toBeNull();
  });
});

describe('the authors in the document properties', () => {
  it('shows them as one line and writes them back as the front matter writes them', () => {
    expect(authorText([{ name: 'Ann Novak', role: 'Security lead' }, 'Petr Svoboda'])).toBe('Ann Novak (Security lead); Petr Svoboda');
    expect(authorText('Ann Novak')).toBe('Ann Novak');
    expect(authorValue('Ann Novak')).toBe('Ann Novak');
    expect(authorValue(' Ann Novak ; Petr Svoboda ')).toEqual(['Ann Novak', 'Petr Svoboda']);
    expect(authorValue('Ann Novak (Security lead); Petr Svoboda')).toEqual([{ name: 'Ann Novak', role: 'Security lead' }, { name: 'Petr Svoboda' }]);
    expect(authorValue(' ; ')).toBeNull();
    const md = '---\ntitle: Policy # keep\n---\n\nText.\n';
    const people = withField(md, 'author', authorValue('Ann Novak (Security lead); Petr Svoboda'))!;
    expect(people).toBe('---\ntitle: Policy # keep\nauthor:\n  - name: Ann Novak\n    role: Security lead\n  - name: Petr Svoboda\n---\n\nText.\n');
    expect(authorText(frontMatter(people)!.author)).toBe('Ann Novak (Security lead); Petr Svoboda');
    expect(withField(md, 'author', authorValue('Ann Novak; Petr Svoboda'))).toBe('---\ntitle: Policy # keep\nauthor: [Ann Novak, Petr Svoboda]\n---\n\nText.\n');
  });
});

describe('AI in the document properties', () => {
  it('writes ai short while it has only its use, as fields once it has more, and drops it with the use', () => {
    const md = '---\ntitle: Policy # keep\n---\n\nText.\n';
    const short = withAiField(md, 'use', 'ai-generated')!;
    expect(short).toBe('---\ntitle: Policy # keep\nai: ai-generated\n---\n\nText.\n');
    expect(aiFields(frontMatter(short)!.ai)).toEqual({ use: 'ai-generated', label: false });
    const reviewed = withAiField(withAiField(short, 'reviewed-by', 'Ann Novak')!, 'label', true)!;
    expect(reviewed).toBe('---\ntitle: Policy # keep\nai:\n  use: ai-generated\n  reviewed-by: Ann Novak\n  label: true\n---\n\nText.\n');
    expect(aiFields(frontMatter(reviewed)!.ai)).toEqual({ use: 'ai-generated', reviewedBy: 'Ann Novak', label: true });
    // the other fields stay; without the label and the reviewer it is short again; without the use it goes
    const tool = '---\ntitle: T\nai:\n  use: ai-assisted\n  tool: Claude\n  label: true\n---\n';
    expect(withAiField(tool, 'label', false)).toBe('---\ntitle: T\nai:\n  use: ai-assisted\n  tool: Claude\n---\n');
    expect(withAiField(withAiField(reviewed, 'label', false)!, 'reviewed-by', null)).toBe(short);
    expect(withAiField(reviewed, 'use', null)).toBe(md);
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
      menu: [{ menu: 'export', command: 'b', order: 102 }, { menu: 'export', command: 'a', order: 1 }, { menu: 'export', command: 'c', order: 0 }],
      hooks: { opened },
    });
    r.register({
      id: 'pro', hooks: { opened },
      panels: [{ id: 'p', title: 'panel.versions', order: 5, render: () => null }, { id: 'l', title: 'panel.outline', order: 1, region: 'left', render: () => null }],
    });
    await r.run('a');
    await r.run('b', 7);
    await r.run('c');   // unavailable: nothing happens
    expect(ran).toEqual(['a', 'b:7']);
    expect(r.menu('export').map((c) => c.id)).toEqual(['a', 'b']);
    // groups by the hundred of the order, for the separators (the unavailable one left out)
    expect(r.menuGroups('export').map((g) => g.map((c) => c.id))).toEqual([['a'], ['b']]);
    expect(r.shortcuts().map((c) => c.id)).toEqual(['b']);
    // the companion's tabs (the default region) and the left pane's
    expect(r.panels().map((p) => p.id)).toEqual(['l', 'p']);
    expect(r.panels('companion').map((p) => p.id)).toEqual(['p']);
    expect(r.panels('left').map((p) => p.id)).toEqual(['l']);
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

describe('the editor in use', () => {
  it('passes to an editor still open when one closes, whatever order the cleanups run in', async () => {
    // the project controller needs the browser build; the editor in use is all this needs of it
    const bridge: { editor: unknown } = { editor: null };
    vi.doMock('../src/app/project.ts', () => ({ bridge }));
    const { attach, released } = await import('../src/app/split.ts');
    type Active = Parameters<typeof attach>[0];
    const editor = (mode: 'visual' | 'source') => ({ mode, link: () => {} }) as unknown as Active;
    // the start in Source: a visual editor first; the source editor mounts before the visual one's cleanup runs
    const visual = editor('visual');
    bridge.editor = visual;
    const closeVisual = attach(visual);
    const source = editor('source');
    if (!bridge.editor) bridge.editor = source;   // as the source editor does: in Split the visual one stays in use
    const closeSource = attach(source);
    closeVisual();
    released(visual);
    expect(bridge.editor).toBe(source);
    // another document: the new source editor mounts before the old one closes
    const next = editor('source');
    const closeNext = attach(next);
    closeSource();
    released(source);
    expect(bridge.editor).toBe(next);
    closeNext();
    released(next);
    expect(bridge.editor).toBeNull();
  });
});

describe('the editor preferences and the layout', () => {
  it('drops the side palette (the Catalog replaced it in 2.0.3) and keeps the other preferences', async () => {
    const { readPrefs, DEFAULT_PREFS, PREFS_VERSION } = await import('../src/state/prefs.ts');
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
    expect('palette' in readPrefs(JSON.stringify({ palette: true, labels: false }))).toBe(false);
    expect(readPrefs(JSON.stringify({ palette: true, labels: false, v: PREFS_VERSION }))).toMatchObject({ labels: false });
    expect(readPrefs('not json')).toEqual(DEFAULT_PREFS);
  });

  it('reads the saved layout: each mode its panes, anything unknown replaced by the default', async () => {
    const { readLayout, DEFAULT_LAYOUT, COMP_MIN } = await import('../src/state/layout.ts');
    expect(readLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(DEFAULT_LAYOUT).toMatchObject({ mode: 'write', write: { left: null, comp: 'preview' }, blocks: { left: 'catalog', comp: 'properties' } });
    expect(readLayout(JSON.stringify({ mode: 'blocks', write: { left: 'outline', comp: null }, width: 512.4, outlineAll: true }))).toEqual({
      ...DEFAULT_LAYOUT, mode: 'blocks', write: { left: 'outline', comp: null }, width: 512, outlineAll: true,
    });
    // a mode, a tab or a width it does not know
    expect(readLayout(JSON.stringify({ mode: 'review', blocks: { left: 'shelf', comp: 7 }, width: COMP_MIN - 1 }))).toEqual(DEFAULT_LAYOUT);
    expect(readLayout('{')).toEqual(DEFAULT_LAYOUT);
  });
});

describe('one Checks list', () => {
  const source = [
    '---', 'title: T', 'lang: en', 'outputs: [web, deck, docx]', '---', '',   // 1-6
    '## Before you start', '',                                                // 7
    '![](images/pic.png "A picture")', '',                                    // 9
    'Plain text that is hard to read.', '',                                   // 11
    '---', '',                                                                // 13: a rule no output shows (a hint)
    '## Next', '', 'More.', '',                                               // 15, 17
  ].join('\n');
  it('merges one block\'s problem and findings of the same thing across outputs into one item, places the rest, counts items', async () => {
    const { parse } = await import('@libka/model');
    const { buildChecklist, forPlace, placeAt, placesOf } = await import('../src/core/checklist.ts');
    const r = parse(source);
    expect(r.problems.map((p) => `${p.code}:${p.line}`)).toEqual(['image-alt:9']);
    const checks = [
      { target: 'manual', id: 'axe', mode: 'standard', checked: 9, skipped: 0, violations: [{ rule: 'image-alt', message: 'Images must have alternative text', target: 'img', line: 9 }] },
      { target: 'manual', id: 'contrast', mode: 'standard', checked: 9, skipped: 0, violations: [{ rule: 'contrast', message: '3.10:1 for normal text, needs 4.5:1 ("Plain text that is hard to read.")', target: 'p' }] },
      { target: 'deck', id: 'axe', mode: 'standard', checked: 9, skipped: 0, violations: [{ rule: 'image-alt', message: 'Images must have alternative text', target: 'img', line: 9 }] },
      { target: 'deck', id: 'structure', mode: 'standard', checked: 9, skipped: 0, violations: [{ rule: 'slide-overflow', message: 'slide 3 does not fit', target: '#s3' }] },
      { target: 'docx', id: 'docx', mode: 'standard', checked: 3, skipped: 0, violations: [{ rule: 'docx-alt-text', message: 'picture "images/pic.png" has no alternative text', target: 'pic' }] },
    ] as const;
    const list = buildChecklist({ doc: r.document, source, problems: r.problems, hints: r.hints, checks: checks as never });
    // the picture's alt text: one item, the problem's words and fix, failing in the source and all three outputs
    const groups = list.groups.map((g) => [typeof g.place === 'string' ? g.place : g.place.line, g.items.map((i) => `${i.kind}:${i.rule}:${i.outputs.join('+')}`)]);
    expect(groups).toEqual([
      [9, ['fix:image-alt:source+web+slides+word']],
      // the contrast finding is placed by the text it quotes; the rule (---) is no block, so its hint is the paragraph's
      [11, ['fix:contrast:web', 'advice:hint:source']],
      ['unplaced', ['fix:slide-overflow:slides']],
    ]);
    const alt = list.groups[0]!.items[0]!;
    expect(alt.message).toMatch(/alt/i);
    expect(alt.problems).toHaveLength(1);
    expect(alt.findings.map((f) => f.output)).toEqual(['web', 'slides', 'word']);
    // the readiness chip counts items to fix (3), not findings (5) plus the problem; advice never counts
    expect(list.fix).toBe(3);
    expect(list.advice).toBe(1);
    // "This block": the picture's place holds only its item
    const places = placesOf(r.document);
    expect(forPlace(list, placeAt(places, 9)).flatMap((g) => g.items).map((i) => i.rule)).toEqual(['image-alt']);
    expect(placeAt(places, 3)).toBeNull();   // in the front matter: the document's properties
  });
});
