/// <reference types="node" />
/**
 * In Node: the palette's places, the keys of commands (reading a key press, conflicts, the author's
 * keys), every Guard rule explained in both languages, and Split's minimal text change.
 */
import { describe, expect, it } from 'vitest';
import { DOCX_CRITERIA, GUARD_CRITERIA } from '@libka/guard/wcag';
import { places } from '../src/core/places.ts';
import { EXPLAIN, explain } from '../src/core/explain.ts';
import { conflicts, keysFromEvent, keysOf, keyText, normalKeys, setKeys } from '../src/state/keys.ts';
import { minimalChange } from '../src/editor/source.ts';

describe('places in the document', () => {
  it('lists headings and titled blocks with their lines, skipping the front matter and code', () => {
    const source = [
      '---', 'title: T', '# not a heading in YAML', '---', '',
      '## Start **here**', '', ':::callout[Mind the [gap](#gap)]{variant=info}', 'Text.', ':::', '',
      '```md', '## inside code', ':::callout[no]', '```', '', '### Deeper', '',
    ].join('\n');
    expect(places(source)).toEqual([
      { kind: 'heading', level: 2, label: 'Start here', line: 6 },
      { kind: 'block', name: 'callout', label: 'Mind the gap', line: 8 },
      { kind: 'heading', level: 3, label: 'Deeper', line: 17 },
    ]);
  });
});

describe('keys of commands', () => {
  const press = (key: string, code: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
    ({ key, code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent;

  it('reads a key press (the key itself, not the character Shift makes), and needs a modifier or an F-key', () => {
    expect(keysFromEvent(press('P', 'KeyP', { ctrlKey: true, shiftKey: true }))).toBe('Mod-Shift-p');
    expect(keysFromEvent(press('!', 'Digit1', { ctrlKey: true, shiftKey: true }))).toBe('Mod-Shift-1');
    expect(keysFromEvent(press('F2', 'F2'))).toBe('F2');
    expect(keysFromEvent(press('k', 'KeyK'))).toBeNull();
    expect(keysFromEvent(press('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(normalKeys('Shift-Mod-K')).toBe('Mod-Shift-k');
    expect(keyText('Mod-Shift-s')).toBe('Ctrl+Shift+S');
  });

  it('names who else uses keys: other commands, or the editors', () => {
    const commands = [{ id: 'save', keys: 'Mod-s' }, { id: 'palette.open', keys: 'Mod-k' }];
    expect(conflicts('Mod-S', commands, 'palette.open')).toEqual(['save']);
    expect(conflicts('Mod-b', commands)).toEqual(['editor']);
    expect(conflicts('Mod-Shift-p', commands)).toEqual([]);
  });

  it('takes the author\'s keys over the default, and goes back', () => {
    const c = { id: 'test.command', keys: 'Mod-k' };
    setKeys(c.id, 'Mod-Shift-p');
    expect(keysOf(c)).toBe('Mod-Shift-p');
    setKeys(c.id, '');
    expect(keysOf(c)).toBeUndefined();
    setKeys(c.id, null);
    expect(keysOf(c)).toBe('Mod-k');
  });
});

describe('Guard findings in plain words', () => {
  it('explains every Guard and Word file rule, in English and Czech', () => {
    for (const rule of [...Object.keys(GUARD_CRITERIA), ...Object.keys(DOCX_CRITERIA)]) {
      for (const lang of ['en', 'cs'] as const) {
        const e = explain(rule, lang);
        expect(e?.why && e.fix, `${rule} ${lang}`).toBeTruthy();
      }
    }
    for (const [rule, by] of Object.entries(EXPLAIN)) expect(by.cs.why, rule).not.toBe(by.en.why);
    expect(explain('some-other-axe-rule', 'en')).toBeNull();
  });
});

describe('Split: the change between two texts', () => {
  it('keeps the common start and end', () => {
    expect(minimalChange('Hello world', 'Hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' });
    expect(minimalChange('aXb', 'ab')).toEqual({ from: 1, to: 2, insert: '' });
    expect(minimalChange('same', 'same')).toBeNull();
    expect(minimalChange('', 'new')).toEqual({ from: 0, to: 0, insert: 'new' });
  });
});
