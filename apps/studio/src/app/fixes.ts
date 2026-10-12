/**
 * Quick fixes: a source problem's safe fixes (from @libka/model), applied in whichever editor is in use as one step
 * the author can undo. Fixes that need words only the author knows (alt text, a caption, a title) never invent them:
 * they take the author to the field to fill in (the Inspector in visual mode, the line in source mode).
 */
import { applyFix, blockTitle } from '@libka/editor';
import type { Fix, Problem } from '@libka/model';
import type { Key } from '../i18n.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { withField } from '../core/frontmatter.ts';
import { bridge, currentText } from './project.ts';
import { flushSync } from './split.ts';
import { announce, visual } from '../ui/Visual.tsx';
import { showDocument } from '../ui/Inspector.tsx';

/** What a fix does, in the interface language. */
export function fixLabel(fix: Fix): string {
  switch (fix.kind) {
    case 'field': {
      const [kind, name = ''] = fix.target.split(':');
      return kind === 'attribute' ? t('fix.attribute', { name }) : kind === 'document' ? t('fix.document', { name }) : t(`fix.${kind}` as Key);
    }
    case 'remove-attribute': return t('fix.remove', { name: fix.name });
    case 'rename-attribute': return t('fix.renameAttribute', { from: fix.from, to: fix.to });
    case 'set-attribute': return t('fix.set', { name: fix.name, value: fix.value });
    case 'rename-block': return t('fix.renameBlock', { to: fix.to, title: blockTitle(fix.to, s.lang.value) });
    case 'wrap': return t('fix.wrap', { title: blockTitle(fix.block, s.lang.value) });
    case 'heading-level': return t('fix.level', { n: fix.level });
    case 'list-type': return t(fix.ordered ? 'fix.numbered' : 'fix.bulleted');
    case 'set-front-matter': return t('fix.frontMatter', { key: fix.key, value: Array.isArray(fix.value) ? `[${fix.value.join(', ')}]` : fix.value });
  }
}

/** Opens the Inspector and puts the focus in one of its fields (once it has rendered). */
function focusInspector(id: string): void {
  s.panelTab.value = 'inspector';
  s.pane.value = 'checks';
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.focus()));
}

/** Takes the author to where the missing words go. */
function toField(p: Problem, target: string): void {
  const [kind, name = ''] = target.split(':');
  const v = visual.editor;
  if (kind === 'document') { showDocument(); focusInspector(`docprop-${name}`); return; }
  if (!v || s.shownMode.value === 'source') { s.pane.value = 'write'; bridge.editor?.goToLine(p.line); return; }
  s.pane.value = 'write';
  if (kind === 'label' || kind === 'text') { v.selectLine(p.line, 'text'); return; }
  v.selectLine(p.line, 'block');
  focusInspector(kind === 'attribute' ? `attr-${name}` : kind === 'alt' ? 'img-alt' : 'img-caption');
}

/** Applies a fix to the problem it belongs to (one undoable step), or takes the author to the field it needs. */
export function applyQuickFix(p: Problem, fix: Fix): void {
  const editor = bridge.editor;
  if (!editor) return;
  // the latest text everywhere first: what the visual editor has not written yet, what Split has not passed on
  const text = currentText();
  flushSync();
  if (fix.kind === 'field') { toField(p, fix.target); return; }
  const next = fix.kind === 'set-front-matter' ? withField(text, fix.key, fix.value) : applyFix(text, p.line, fix);
  if (next === null || next === text) { s.toast(t('fix.stale')); return; }
  editor.replaceAll(next);
  const what = fixLabel(fix);
  announce(t('fix.doneBrief'), t('fix.done', { what }));
  s.toast(t('fix.done', { what }));
}
