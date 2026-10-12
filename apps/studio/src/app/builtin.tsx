/**
 * The Studio's built-in features, registered as extensions through the same interface as any other extension:
 * the library, files and folders, exports, history and the side panel's checks.
 */
import { registry, type Extension } from '../state/commands.ts';
import { keysOf, matchesKeys } from '../state/keys.ts';
import { PALETTE_SOURCES } from './palette.ts';
import { tutorial, watchTutorial } from './tutorial.tsx';
import { linkPrompt } from '../ui/Visual.tsx';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { GuardPanel, ProblemsPanel } from '../ui/Panels.tsx';
import { InspectorPanel } from '../ui/Inspector.tsx';
import { StructurePanel } from '../ui/Structure.tsx';
import { editorPrefs, setPref } from '../state/prefs.ts';
import { HistoryPanel } from '../ui/History.tsx';
import { dataUrl } from '../core/pipeline.ts';
import { makeDocx } from '../core/docx.ts';
import {
  baseName, bridge, canUseFolders, download, exportProjectZip, flushSave, importFile, newProject, openExample, openFolder, save, saveNamedVersion, saveToFolder,
} from './project.ts';

/** Asks for a file with the browser's own picker. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** A page that leaves the Studio carries its files inside it (data URLs instead of the Studio's object URLs). */
function exportable(html: string): string {
  let out = html;
  for (const [path, f] of s.files.value) if (out.includes(f.url)) out = out.replaceAll(f.url, dataUrl(path)!);
  return out;
}

const library: Extension = {
  id: 'core.library',
  commands: [
    { id: 'view.library', title: 'library.button', run: async () => { await flushSave(); s.view.value = 'library'; requestAnimationFrame(() => document.getElementById('library-title')?.focus()); } },
    { id: 'view.editor', title: 'library.back', available: () => Boolean(s.project.value), run: () => { s.view.value = 'editor'; } },
    { id: 'project.new', title: 'file.new', run: () => newProject() },
    { id: 'project.example', title: 'file.example', run: () => openExample() },
    { id: 'project.import', title: 'file.import', run: async () => { const f = await pickFile('.zip,.md,.markdown,application/zip,text/markdown'); if (f) await importFile(f); } },
    { id: 'folder.open', title: 'folder.open', available: canUseFolders, run: () => openFolder() },
    { id: 'folder.save', title: 'folder.save', available: canUseFolders, run: () => saveToFolder() },
    { id: 'project.zip', title: 'file.exportZip', run: () => exportProjectZip() },
    { id: 'save', title: 'file.saveNow', keys: 'Mod-s', run: () => save() },
  ],
  menu: [
    { menu: 'file', command: 'project.new', order: 10 },
    { menu: 'file', command: 'project.example', order: 20 },
    { menu: 'file', command: 'project.import', order: 30 },
    { menu: 'file', command: 'folder.open', order: 40 },
    { menu: 'file', command: 'folder.save', order: 50 },
    { menu: 'file', command: 'project.zip', order: 60 },
    { menu: 'library', command: 'project.new', order: 10 },
    { menu: 'library', command: 'project.example', order: 20 },
    { menu: 'library', command: 'project.import', order: 30 },
    { menu: 'library', command: 'folder.open', order: 40 },
  ],
};

const exports: Extension = {
  id: 'core.export',
  commands: [
    { id: 'export.md', title: 'file.save', run: async () => { await flushSave(); download(`${baseName()}.md`, 'text/markdown', s.source.value); } },
    { id: 'export.html', title: 'file.exportHtml', run: () => download(`${baseName()}.html`, 'text/html', exportable(s.html.value)) },
    { id: 'export.deck', title: 'file.exportDeck', run: () => download(`${baseName()}.deck.html`, 'text/html', exportable(s.deckHtml.value)) },
    {
      id: 'export.docx', title: 'file.exportDocx', run: async () => {
        s.toast(t('docx.making'));
        try {
          const docx = await makeDocx();
          if (!docx) return;
          download(`${baseName()}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', docx);
          s.toast(t('docx.done', { name: `${baseName()}.docx` }));
        } catch (e) {
          console.error('LibKa Studio: Word file failed', e);
          s.toast(t('docx.failed', { error: String((e as Error)?.message ?? e) }));
        }
      },
    },
    { id: 'export.print', title: 'file.print', run: () => { (document.getElementById('preview') as HTMLIFrameElement).contentWindow?.print(); } },
  ],
  menu: [
    { menu: 'export', command: 'export.md', order: 10 },
    { menu: 'export', command: 'export.html', order: 20 },
    { menu: 'export', command: 'export.deck', order: 30 },
    { menu: 'export', command: 'export.docx', order: 40 },
    { menu: 'export', command: 'export.print', order: 50 },
  ],
};

const checks: Extension = {
  id: 'core.checks',
  panels: [
    { id: 'problems', title: 'panel.problems', order: 10, count: () => s.problems.value.length, render: () => <ProblemsPanel /> },
    { id: 'guard', title: 'panel.guard', order: 20, count: () => (s.checks.value ? s.checks.value.reduce((n, c) => n + c.violations.length, 0) : null), render: () => <GuardPanel /> },
    { id: 'inspector', title: 'panel.inspector', order: 25, render: () => <InspectorPanel /> },
    { id: 'structure', title: 'panel.structure', order: 30, render: () => <StructurePanel /> },
  ],
};

const editing: Extension = {
  id: 'core.editing',
  commands: [
    { id: 'prefs.open', title: 'prefs.title', run: () => { s.dialog.value = { kind: 'prefs' }; } },
    { id: 'keys.open', title: 'keys.title', keys: 'Shift-Alt-h', run: () => { s.dialog.value = { kind: 'shortcuts' }; } },
    { id: 'focus.toggle', title: 'prefs.focus', keys: 'Mod-Shift-f', run: () => setPref('focus', !editorPrefs.value.focus) },
  ],
  menu: [
    { menu: 'file', command: 'prefs.open', order: 70 },
    { menu: 'file', command: 'keys.open', order: 80 },
  ],
};

const palette: Extension = {
  id: 'core.palette',
  commands: [{ id: 'palette.open', title: 'cmdk.title', keys: 'Mod-k', run: () => { if (!s.dialog.value) s.dialog.value = { kind: 'palette' }; } }],
  palette: PALETTE_SOURCES,
};

const history: Extension = {
  id: 'core.history',
  commands: [{ id: 'version.save', title: 'history.saveButton', keys: 'Mod-Shift-s', run: () => saveNamedVersion() }],
  panels: [{ id: 'history', title: 'panel.history', order: 40, render: () => <HistoryPanel /> }],
};

export function registerBuiltins(): void {
  for (const ext of [library, exports, checks, editing, history, palette, tutorial]) registry.register(ext);
  watchTutorial();
}

/**
 * Runs command shortcuts anywhere in the Studio (`Mod` is Ctrl, or Cmd on a Mac), with the author's keys. Ctrl/Cmd+K
 * on text selected in an editor makes a link; otherwise it opens the command palette (as F1 always does).
 */
export function shortcut(e: KeyboardEvent): void {
  // an editor already acted on the key (the visual editor's own keys)
  if (e.defaultPrevented) return;
  const target = e.target as HTMLElement | null;
  if (e.key === 'F1' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    void registry.run('palette.open');
    return;
  }
  const editor = bridge.editor;
  if (matchesKeys('Mod-k', e) && editor && target?.closest('.st-editor') && editor.textSelected()) {
    e.preventDefault();
    void linkPrompt(editor);
    return;
  }
  // (no single-key shortcuts here: "?" lists the keys only on a block selected in the editor, where it has the focus;
  // anywhere else the key list is a command with a changeable key, WCAG 2.1.4)
  // no command keys while a dialog is open (the palette, a prompt): its own keys apply
  if (s.dialog.value) return;
  for (const c of registry.shortcuts()) {
    if (matchesKeys(keysOf(c)!, e)) {
      e.preventDefault();
      void registry.run(c.id);
      return;
    }
  }
}
