/**
 * The Studio's built-in features, registered as extensions through the same interface as any other extension:
 * the library, files and folders, exports, the panes' tabs, the modes and regions, and the versions.
 */
import { registry, type Extension } from '../state/commands.ts';
import { keysOf, matchesKeys } from '../state/keys.ts';
import { PALETTE_SOURCES } from './palette.ts';
import { tutorial, watchTutorial } from './tutorial.tsx';
import { announce, linkPrompt, selectedLine } from '../ui/Visual.tsx';
import { present, slideOfLine } from './present.tsx';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { ChecksPanel } from '../ui/Panels.tsx';
import { InspectorPanel, showDocument } from '../ui/Inspector.tsx';
import { OutlineTab } from '../ui/Structure.tsx';
import { Catalog } from '../ui/Visual.tsx';
import { PreviewPanel } from '../ui/Workspace.tsx';
import { editorPrefs, setPref } from '../state/prefs.ts';
import { chooseWidth, layout, LEFT_TABS, openComp, openLeft, openVersions, panes as panes_, resetLayout, setStudioMode, showPanel, versionsOpen } from '../state/layout.ts';
import { cycleRegion } from './regions.ts';
import { HistoryPanel } from '../ui/History.tsx';
import { withoutLines } from '@libka/render';
import { dataUrl } from '../core/pipeline.ts';
import { makeDocx } from '../core/docx.ts';
import {
  baseName, bridge, canUseFolders, download, duplicateOpen, exportProjectZip, flushSave, importFile, newProject, openExample, openFolder, renameOpen, save, saveNamedVersion,
  saveToFolder,
} from './project.ts';

const inEditor = () => s.view.value === 'editor' && Boolean(s.project.value);

/** Asks for a file with the browser's own picker. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/**
 * A page that leaves the Studio carries its files inside it (data URLs instead of the Studio's object URLs), and none
 * of the source-line marks the Studio's own render adds: it is the page `libka build` would write.
 */
export function exportable(html: string): string {
  let out = withoutLines(html);
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
  // (New, the example, Import and Open folder are the Documents view's buttons and palette commands; the open
  // document's own actions are in Document ▾, its files in Export ▾)
  menu: [
    { menu: 'export', command: 'folder.save', order: 110 },
    { menu: 'export', command: 'project.zip', order: 120 },
    { menu: 'document', command: 'save', order: 110 },
    { menu: 'document', command: 'version.save', order: 120 },
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
    // the outputs are chosen in one place, Properties › Document › Outputs
    { id: 'outputs.choose', title: 'outputs.choose', available: inEditor, run: () => {
      showDocument();
      showPanel('properties', 'tp-properties');
      requestAnimationFrame(() => requestAnimationFrame(() => (document.querySelector<HTMLInputElement>('#doc-outputs-list input') ?? document.getElementById('tp-properties'))?.focus()));
    } },
  ],
  menu: [
    { menu: 'export', command: 'export.html', order: 10 },
    { menu: 'export', command: 'export.deck', order: 20 },
    { menu: 'export', command: 'export.docx', order: 30 },
    { menu: 'export', command: 'export.print', order: 40 },
    { menu: 'export', command: 'export.md', order: 50 },
    { menu: 'export', command: 'outputs.choose', order: 210 },
  ],
};

/** The panes' tabs: the companion's Preview, Checks and Properties; the left pane's Catalog and Outline. */
const panes: Extension = {
  id: 'core.panes',
  panels: [
    { id: 'preview', title: 'panel.preview', order: 10, keepMounted: true, render: () => <PreviewPanel /> },
    {
      id: 'checks', title: 'panel.checks', order: 20, render: () => <ChecksPanel />,
      // the items to fix (as the readiness chip): known once Guard has run, or at once when the source has problems
      count: () => (s.checks.value || s.issues.value ? s.issues.value : null),
    },
    { id: 'properties', title: 'panel.properties', order: 30, render: () => <InspectorPanel /> },
    { id: 'catalog', title: 'panel.catalog', order: 10, region: 'left', render: () => <Catalog /> },
    { id: 'outline', title: 'panel.outline', order: 20, region: 'left', render: () => <OutlineTab /> },
  ],
};

/** The modes and the regions: Psaní, Bloky and Fokus on Alt+1 to Alt+3, F6 through the regions, the panes shown or not. */
const layoutExt: Extension = {
  id: 'core.layout',
  commands: [
    { id: 'layout.write', title: 'layout.write', keys: 'Alt-1', available: inEditor, run: () => setStudioMode('write') },
    { id: 'layout.blocks', title: 'layout.blocks', keys: 'Alt-2', available: inEditor, run: () => setStudioMode('blocks') },
    { id: 'layout.focus', title: 'layout.focus', keys: 'Alt-3', available: inEditor, run: () => setStudioMode('focus') },
    { id: 'region.next', title: 'region.next', keys: 'F6', run: () => cycleRegion(1) },
    { id: 'region.prev', title: 'region.prev', keys: 'Shift-F6', run: () => cycleRegion(-1) },
    { id: 'panes.left', title: 'panes.left', available: inEditor, run: () => { if (panes_.value.left) openLeft(null); else showPanel(LEFT_TABS[0]!, `tab-${LEFT_TABS[0]}`); } },
    { id: 'panes.companion', title: 'panes.companion', available: inEditor, run: () => { if (panes_.value.comp) openComp(null); else showPanel('preview', 'tab-preview'); } },
    // View ▾ draws these beside its other choices; the palette lists them (no default keys)
    ...(['narrow', 'medium', 'wide'] as const).map((w) => ({ id: `panes.${w}`, title: `panes.${w}` as const, available: () => inEditor() && !s.phone.value, run: () => chooseWidth(w) })),
    { id: 'layout.reset', title: 'layout.reset', available: inEditor, run: () => {
      resetLayout();
      const mode = t(`layout.${layout.value.mode}`);
      announce(t('layout.reset'), t('layout.resetDone', { mode }));
    } },
    { id: 'versions.open', title: 'docMenu.versions', available: inEditor, run: () => { if (editorPrefs.value.focus) setPref('focus', false); openVersions(); s.pane.value = 'companion'; requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('tab-versions')?.focus())); } },
    { id: 'document.properties', title: 'docMenu.properties', available: inEditor, run: () => { showDocument(); showPanel('properties', 'tp-properties'); } },
    { id: 'document.rename', title: 'docMenu.rename', available: inEditor, run: () => renameOpen() },
    { id: 'document.duplicate', title: 'docMenu.duplicate', available: inEditor, run: () => duplicateOpen() },
  ],
  menu: [
    { menu: 'document', command: 'document.rename', order: 10 },
    { menu: 'document', command: 'document.duplicate', order: 20 },
    { menu: 'document', command: 'versions.open', order: 130 },
    { menu: 'document', command: 'document.properties', order: 210 },
  ],
};

const editing: Extension = {
  id: 'core.editing',
  commands: [
    { id: 'prefs.open', title: 'prefs.title', run: () => { s.dialog.value = { kind: 'prefs' }; } },
    { id: 'keys.open', title: 'keys.title', keys: 'Shift-Alt-h', run: () => { s.dialog.value = { kind: 'shortcuts' }; } },
    { id: 'focus.toggle', title: 'prefs.focus', keys: 'Mod-Shift-f', run: () => setPref('focus', !editorPrefs.value.focus) },
  ],
  // (the keyboard shortcuts are under Help; the view's toggles are drawn by View ▾ itself)
  menu: [
    { menu: 'view', command: 'prefs.open', order: 110 },
  ],
};

// Present: the deck full screen, from the first slide or the one the cursor is in (F5 and Shift+F5, as in PowerPoint)
const presentation: Extension = {
  id: 'core.present',
  commands: [
    { id: 'present.start', title: 'present.start', keys: 'F5', available: inEditor, run: () => present({ from: 0 }) },
    { id: 'present.here', title: 'present.here', keys: 'Shift-F5', available: inEditor,
      run: () => present({ from: slideOfLine(s.deckHtml.value, selectedLine()) }) },
  ],
  menu: [
    { menu: 'view', command: 'present.start', order: 10 },
    { menu: 'view', command: 'present.here', order: 20 },
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
  // Versions open from Document ▾ as a companion tab of their own, until closed
  panels: [{ id: 'versions', title: 'panel.versions', order: 40, visible: () => versionsOpen.value, render: () => <HistoryPanel /> }],
};

export function registerBuiltins(): void {
  for (const ext of [library, exports, panes, layoutExt, editing, presentation, history, palette, tutorial]) registry.register(ext);
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
