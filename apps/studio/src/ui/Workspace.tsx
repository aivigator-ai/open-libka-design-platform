/** The workspace: the editor (visual, source, or both in Split), the preview and the side panel (on a phone, one at a time). */
import { useEffect, useRef } from 'preact/hooks';
import { GROUPS, type BlockGroup } from '@libka/blocks';
import { groupTitle, insertables } from '@libka/editor';
import type { Key } from '../i18n.ts';
import { registry } from '../state/commands.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { forceHighContrast } from '../core/frames.ts';
import { withoutCsp } from '@libka/render/csp';
import { addImages, bridge, edited, insertBlock, setMode } from '../app/project.ts';
import { blockLead, createEditor } from '../editor/source.ts';
import * as split from '../app/split.ts';
import { applyQuickFix, fixLabel } from '../app/fixes.ts';
import { editorPrefs } from '../state/prefs.ts';
import { Menu } from './Menu.tsx';
import { VisualEditorHost, VisualToolbar } from './Visual.tsx';

export const SNIPPETS: Record<string, string> = {
  heading: '## Section title\n\nText of the section.\n',
  callout: ':::callout[Short title]{variant=info}\nWhat the reader needs to know.\n:::\n',
  steps: ':::steps\n1. **First step** What to do.\n2. **Second step** What to do next.\n:::\n',
  table: ':::table{caption="What this table shows"}\n| Column | Column |\n|---|---|\n| Value | Value |\n:::\n',
  checklist: ':::checklist\n- [ ] First item\n- [ ] Second item\n:::\n',
  figure: '![](images/picture.png "")\n',
};
const QUICK: [string, string, Key][] = [['heading', '§', 'block.heading'], ['callout', '!', 'block.callout'], ['steps', '1.', 'block.steps'],
  ['table', '▦', 'block.table'], ['checklist', '✓', 'block.checklist'], ['figure', '▣', 'block.figure']];

function SourceEditorHost({ id = 'editor' }: { id?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = createEditor({
      parent: host.current!,
      text: s.source.value,
      label: t('editor.label'),
      onChange: (text) => { edited(text); split.changed('source', text); },
      onCursor: (line, col) => { s.cursor.value = { line, col }; },
      onPlace: () => split.placed('source'),
      onFocus: () => split.focused('source'),
      onFiles: (list) => void addImages(list),
      typewriter: () => editorPrefs.value.typewriter,
      actions: (p) => (p.fixes ?? []).map((f) => ({ name: fixLabel(f), apply: () => applyQuickFix(p, f) })),
    });
    const v = editor.view;
    // start where the author was (switching from visual mode)
    const at = Math.min(s.place.value, v.state.doc.length);
    if (at) v.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    const active: typeof bridge.editor = {
      mode: 'source',
      replaceAll: editor.replaceAll,
      sync: editor.sync,
      link: editor.link,
      insertMarkdown(markdown) { editor.insert(`${blockLead(v.state.sliceDoc(0, v.state.selection.main.from))}${markdown}\n`); },
      goToLine: editor.goToLine,
      showProblems: editor.showProblems,
      setLabel: editor.setLabel,
      focus: editor.focus,
      offset: () => v.state.selection.main.head,
      selection: () => v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to),
      text: () => v.state.doc.toString(),
      textSelected: () => !v.state.selection.main.empty,
      linkHref: editor.linkHref,
      setLink: editor.setLink,
      destroy: editor.destroy,
    };
    // in Split the visual editor is active until the author uses this one
    if (!bridge.editor) bridge.editor = active;
    const detach = split.attach(active!);
    return () => { detach(); if (bridge.editor === active) bridge.editor = null; editor.destroy(); };
  }, []);
  // the problems on their lines, and the label in the interface language
  const problems = s.problems.value;
  const label = t('editor.label');
  useEffect(() => { bridge.editor?.showProblems(problems); }, [problems]);
  useEffect(() => { bridge.editor?.setLabel(label); }, [label]);
  // the text is in the document's language (a Czech document is read as Czech, whatever the interface's language)
  return <div class="st-editor st-source-editor" id={id} ref={host} lang={s.doc.value?.meta.lang ?? s.lang.value} />;
}

function ModeSwitch() {
  // Split needs a wide window; on a narrower one its button is left out and the document shows in Visual
  const modes = s.wide.value ? (['visual', 'split', 'source'] as const) : (['visual', 'source'] as const);
  return (
    <div class="st-seg st-mode" role="group" aria-label={t('mode.label')}>
      {modes.map((m) => (
        <button key={m} type="button" data-mode={m} aria-pressed={s.shownMode.value === m} title={t(`mode.${m}Help`)} onClick={() => void setMode(m)}>{t(`mode.${m}`)}</button>
      ))}
    </div>
  );
}

function EditorPane() {
  const shown = s.shownMode.value;
  const visualMode = shown !== 'source';
  const key = `${s.project.value?.id ?? ''}:${shown}`;
  return (
    <section class="st-pane st-editor-pane" aria-labelledby="editor-title" data-labels={String(editorPrefs.value.labels)}>
      <div class="st-pane-head">
        <h2 class="st-pane-title" id="editor-title">{t('editor.title')}</h2>
        <ModeSwitch />
        {visualMode ? <VisualToolbar /> : null}
        <div class="st-blocks" role="group" aria-label={t('editor.insert')}>
          {QUICK.map(([kind, mark, key]) => (
            <button key={kind} type="button" data-insert={kind} onClick={() => insertBlock(kind, SNIPPETS)}>
              <span aria-hidden="true">{mark}</span> <span>{t(key)}</span>
            </button>
          ))}
          <Menu id="more-blocks" className="st-more" listClass="st-more-list" label={t('editor.more')}
            summary={<><span aria-hidden="true">+</span> <span>{t('editor.more')}</span></>} summaryClass="st-more-toggle">
            {(Object.keys(GROUPS) as BlockGroup[]).flatMap((group) => {
              const defs = insertables(s.lang.value).filter((b) => b.group === group && b.name !== 'heading');
              if (!defs.length) return [];
              return [<p key={group} class="st-more-group">{groupTitle(group, s.lang.value)}</p>, ...defs.map((d) => (
                <button key={d.name} type="button" class="st-more-item" data-insert={d.name} onClick={() => insertBlock(d.name, SNIPPETS)}>
                  <span class="st-more-title">{d.title}</span>
                  <span class="st-more-summary">{d.summary}</span>
                </button>
              ))];
            })}
          </Menu>
        </div>
      </div>
      {shown === 'split'
        ? <div class="st-split" key={key}><VisualEditorHost /><SourceEditorHost id="editor-source" /></div>
        : visualMode ? <VisualEditorHost key={key} /> : <SourceEditorHost key={key} />}
    </section>
  );
}

type DeckWindow = Window & { libkaDeck?: { go(n: number): void; current: number } };

function PreviewPane() {
  const frame = useRef<HTMLIFrameElement>(null);
  const slides = s.device.value === 'slides';
  const source = slides ? s.deckHtml.value : s.html.value;
  const high = s.highContrast.value;
  useEffect(() => {
    const f = frame.current!;
    const win = f.contentWindow as DeckWindow | null;
    const y = win?.scrollY ?? 0;
    const slide = win?.libkaDeck?.current ?? 0;
    f.addEventListener('load', () => {
      const w = f.contentWindow as DeckWindow | null;
      if (w?.libkaDeck) w.libkaDeck.go(slide); else w?.scrollTo(0, y);
    }, { once: true });
    f.srcdoc = withoutCsp(high ? forceHighContrast(source) : source);   // the preview runs the Studio's checks; exports keep the policy
  }, [source, high]);
  return (
    <section class="st-pane st-preview-pane" aria-labelledby="preview-title">
      <div class="st-pane-head">
        <h2 class="st-pane-title" id="preview-title">{t('preview.title')}</h2>
        <div class="st-seg" role="group" aria-label={t('preview.device')}>
          {(['web', 'phone', 'a4', 'slides'] as const).map((d) => (
            <button key={d} type="button" data-device={d} aria-pressed={s.device.value === d} onClick={() => { s.device.value = d; }}>{t(`preview.${d}`)}</button>
          ))}
        </div>
      </div>
      {high ? <p class="st-hc-note" id="hc-note">{t('preview.hcNote')}</p> : null}
      <div class="st-stage" id="stage" data-device={s.device.value} tabIndex={0} role="region" aria-labelledby="preview-title">
        <iframe id="preview" ref={frame} title={t('preview.frame')} />
      </div>
    </section>
  );
}

function SidePanel() {
  const panels = registry.panels();
  const current = panels.find((p) => p.id === s.panelTab.value) ?? panels[0]!;
  const select = (id: string, focus = false) => {
    s.panelTab.value = id as s.PanelTab;
    if (focus) requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
  };
  const key = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? panels.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    select(panels[(next + panels.length) % panels.length]!.id, true);
  };
  return (
    <section class="st-pane st-panel" aria-label={t('panel.label')}>
      <div class="st-tabs" role="tablist" aria-label={t('panel.label')}>
        {panels.map((p, i) => {
          const on = p === current;
          const n = p.count?.();
          return (
            <button key={p.id} type="button" role="tab" id={`tab-${p.id}`} aria-controls={`tp-${p.id}`} aria-selected={on} tabIndex={on ? 0 : -1}
              onClick={() => select(p.id)} onKeyDown={(e) => key(e, i)}>
              <span>{t(p.title)}</span>
              {p.count ? <span class="st-count" id={`count-${p.id}`} data-tone={n === null || n === undefined ? '' : n ? 'error' : 'ok'}>{n === null || n === undefined ? '–' : n}</span> : null}
            </button>
          );
        })}
      </div>
      {panels.map((p) => (
        <div key={p.id} class="st-tabpanel" role="tabpanel" id={`tp-${p.id}`} aria-labelledby={`tab-${p.id}`} tabIndex={0} hidden={p !== current}>
          {p === current ? p.render() : null}
        </div>
      ))}
    </section>
  );
}

export function Workspace() {
  return (
    <>
      <nav class="st-mobile-tabs" aria-label={t('app.name')}>
        {(['write', 'preview', 'checks'] as const).map((p) => (
          <button key={p} type="button" data-pane={p} aria-pressed={s.pane.value === p} onClick={() => { s.pane.value = p; }}>{t(`mobile.${p}`)}</button>
        ))}
      </nav>
      <main class="st-work" id="main" data-pane={s.pane.value} data-mode={s.shownMode.value} data-focus={String(editorPrefs.value.focus)} tabIndex={-1}>
        <EditorPane />
        <PreviewPane />
        <SidePanel />
      </main>
    </>
  );
}
