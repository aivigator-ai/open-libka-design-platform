/**
 * LibKa Studio: write a LibKa document and see it as readers will, checked as you type. An installable local-first
 * app: projects, their images and their versions stay in this browser (IndexedDB) or in a folder on disk.
 */
import { render } from 'preact';
import { effect } from '@preact/signals';
import { registerBuiltins, shortcut } from './app/builtin.tsx';
import { bridge, flushSave, start } from './app/project.ts';
import * as s from './state/store.ts';
import { App } from './ui/App.tsx';
import { visual } from './ui/Visual.tsx';
import { TextSelection } from 'prosemirror-state';
import * as split from './app/split.ts';
import { firstVisitTour } from './ui/Tour.tsx';

registerBuiltins();
s.followSystem();
/** For tests and automation: what the Studio holds and found, read-only. */
Object.defineProperty(window, 'libkaStudio', {
  value: Object.freeze({
    get source() { return s.source.value; },
    get checks() { return s.checks.value; },
    get problems() { return s.problems.value; },
    get project() { return s.project.value && { id: s.project.value.id, name: s.project.value.name }; },
    get files() { return [...s.files.value.keys()]; },
    get selection() { return bridge.editor?.selection() ?? ''; },
    get mode() { return s.mode.value; },
    /** Split: the text on each side. */
    get sides() { return split.texts(); },
    /** Visual mode: puts the cursor at the end (or start) of the text block that contains `text`; false when not found. */
    placeCaret(text: string, where: 'end' | 'start' = 'end'): boolean {
      const v = visual.editor;
      if (!v) return false;
      let at = -1;
      v.view.state.doc.descendants((n, pos) => {
        if (at >= 0) return false;
        if (n.isTextblock && n.textContent.includes(text)) { at = where === 'end' ? pos + n.nodeSize - 1 : pos + 1; return false; }
        return true;
      });
      if (at < 0) return false;
      v.view.dispatch(v.view.state.tr.setSelection(TextSelection.create(v.view.state.doc, at)).scrollIntoView());
      v.view.focus();
      return true;
    },
  }),
});
render(<App />, document.getElementById('app')!);
// the window's title names the open document (WCAG 2.4.2)
effect(() => {
  const p = s.project.value;
  document.title = s.view.value === 'editor' && p ? `${s.doc.value?.meta.title || p.name} – LibKa Studio` : 'LibKa Studio';
});
document.addEventListener('keydown', shortcut);
// the latest text is written before the page goes away
addEventListener('pagehide', () => void flushSave());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushSave(); });

void start().then(firstVisitTour).catch((e) => {
  console.error('LibKa Studio: could not start', e);
  s.toast(String((e as Error)?.message ?? e));
});

/* offline and installable: the service worker caches the Studio; an update waits until the author reloads */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  void navigator.serviceWorker.register('sw.js').then((reg) => {
    const waiting = () => { if (reg.waiting && navigator.serviceWorker.controller) s.updateReady.value = true; };
    waiting();
    reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', waiting));
  }).catch((e) => console.warn('LibKa Studio: offline use is not available', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !s.updateReady.peek()) return;
    reloading = true;
    location.reload();
  });
}
