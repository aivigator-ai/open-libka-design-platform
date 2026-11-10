/**
 * The workspace (since 2.0.3): the editor (visual, source, or both in Split) in the one `main` region, the left pane
 * (Catalog, Outline) behind its rail, and the companion pane on the right (Preview, Checks, Properties) with a
 * keyboard splitter. Each mode keeps its own panes (`state/layout.ts`). On a phone one region at a time.
 */
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Key } from '../i18n.ts';
import { registry } from '../state/commands.ts';
import * as s from '../state/store.ts';
import { closeVersions, COMP_MAX_SHARE, COMP_MIN, layout, openComp, openLeft, panes, setCompWidth, showChecks, showEditor, showPanel, type LeftTab } from '../state/layout.ts';
import { TabList } from './Tabs.tsx';
import { t } from '../state/text.ts';
import { forceHighContrast } from '../core/frames.ts';
import { withoutCsp } from '@libka/render/csp';
import { addImages, bridge, edited, setMode } from '../app/project.ts';
import { blockLead, createEditor } from '../editor/source.ts';
import * as split from '../app/split.ts';
import { applyQuickFix, fixLabel } from '../app/fixes.ts';
import { editorPrefs, setPref } from '../state/prefs.ts';
import { BlockBar, PickerHost, VisualEditorHost, VisualToolbar, pickerOpen, togglePicker } from './Visual.tsx';
import { deckControls, lastShown, present } from '../app/present.tsx';

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
    return () => { detach(); split.released(active); editor.destroy(); };
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
  // Split is chosen in View ▾ (it needs a wide window); while it is on, its button shows here too, to say so
  const modes = s.shownMode.value === 'split' ? (['visual', 'split', 'source'] as const) : (['visual', 'source'] as const);
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
  const picking = pickerOpen();
  return (
    <section class="st-editor-pane" aria-labelledby="editor-title" data-labels={String(editorPrefs.value.labels)}>
      <div class="st-pane-head">
        <h2 class="st-pane-title" id="editor-title">{t('editor.title')}</h2>
        {/* one row in a fixed order in every mode: formatting, inserting, the editor's mode */}
        <VisualToolbar off={!visualMode} />
        <button type="button" class="st-insert-btn" id="insert-block" aria-label={t('editor.insert')} title={t('insert.buttonHelp')}
          aria-haspopup="dialog" aria-expanded={picking} onClick={(e) => togglePicker(e.currentTarget)}>
          {/* the "+" is drawn by the stylesheet: the visible word stays part of the name (WCAG 2.5.3) */}
          <span>{t('insert.button')}</span>
        </button>
        {/* the block the author is in (in Focus it is in the dock, on a phone above the bottom bar) */}
        {/* (its slot is kept while the cursor is in plain text, so the toolbar never changes height and the text never jumps) */}
        {editorPrefs.value.focus || s.phone.value || !visualMode ? null : <div class="st-blockbar-slot"><BlockBar where="toolbar" /></div>}
        <ModeSwitch />
        {!visualMode ? <p class="st-format-why" id="format-why">{t('format.sourceWhy')}</p> : null}
      </div>
      {shown === 'split'
        ? <div class="st-split" key={key}><VisualEditorHost /><SourceEditorHost id="editor-source" /></div>
        : visualMode ? <VisualEditorHost key={key} /> : <SourceEditorHost key={key} />}
      <PickerHost />
    </section>
  );
}

type DeckWindow = Window & { libkaDeck?: { go(n: number): void; current: number } };

/** The preview's page size for an output drawn at a fixed width (A4 and the phone); the web and slides fill the pane. */
const FIXED_WIDTH: Partial<Record<s.Device, number>> = { a4: 794, phone: 390 };
/** The rule that scales a fixed-width page down to the pane (a generated stylesheet: the Studio writes no style attributes). */
const previewFit = typeof document !== 'undefined' ? document.head.appendChild(document.createElement('style')) : null;

/** The Preview tab: the output chosen (A4 by default), scaled to fit the pane, with its own scroll. */
export function PreviewPanel() {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const device = s.device.value;
  const slides = device === 'slides';
  const source = slides ? s.deckHtml.value : s.html.value;
  const high = s.highContrast.value;
  useEffect(() => {
    const f = frame.current!;
    const win = f.contentWindow as DeckWindow | null;
    const y = win?.scrollY ?? 0;
    // the slide shown before, or the one the last presentation ended on
    const slide = win?.libkaDeck?.current ?? lastShown.peek() ?? 0;
    f.addEventListener('load', () => {
      const w = f.contentWindow as DeckWindow | null;
      if (w?.libkaDeck) {
        w.libkaDeck.go(slide);
        deckControls(w, 'preview');   // its full-screen and presenter controls start Present
      } else w?.scrollTo(0, y);
    }, { once: true });
    f.srcdoc = withoutCsp(high ? forceHighContrast(source) : source);   // the preview runs the Studio's checks; exports keep the policy
  }, [source, high]);
  // a page of a fixed width is scaled down to the pane, never cut off (the pane may be a third of the window)
  useEffect(() => {
    const el = stage.current!;
    let frameId = 0;
    const fit = () => {
      const base = FIXED_WIDTH[device];
      const width = el.clientWidth - 32, height = el.clientHeight - 32;
      if (!previewFit) return;
      const rule = !base || width <= 0 || width >= base ? ''
        : (() => { const z = Math.max(0.2, width / base); return `#stage #preview{zoom:${z.toFixed(4)};height:${Math.max(400, Math.round(height / z))}px}`; })();
      if (previewFit.textContent !== rule) previewFit.textContent = rule;
    };
    fit();
    // (in the next frame: a change made while the observer reports would be reported again in the same frame)
    const ro = new ResizeObserver(() => { cancelAnimationFrame(frameId); frameId = requestAnimationFrame(fit); });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(frameId); };
  }, [device]);
  return (
    <div class="st-preview">
      <div class="st-preview-head">
        <div class="st-seg" role="group" aria-label={t('preview.device')}>
          {(['web', 'phone', 'a4', 'slides'] as const).map((d) => (
            <button key={d} type="button" data-device={d} aria-pressed={device === d} onClick={() => { s.device.value = d; }}>{t(`preview.${d}`)}</button>
          ))}
        </div>
        {/* the slides shown: present them, from the slide shown */}
        {slides ? <button type="button" class="st-btn" id="preview-present"
          onClick={() => present({ from: (frame.current?.contentWindow as DeckWindow | null)?.libkaDeck?.current ?? 0 })}>{t('present.start')}</button> : null}
      </div>
      {high ? <p class="st-hc-note" id="hc-note">{t('preview.hcNote')}</p> : null}
      <div class="st-stage" id="stage" ref={stage} data-device={device} tabIndex={0} role="region" aria-label={t('preview.title')}>
        <iframe id="preview" ref={frame} title={t('preview.frame')} />
      </div>
    </div>
  );
}

/* ---------- the panes ---------- */

const ICONS: Record<string, string> = {
  catalog: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM14 11v6M11 14h6',
  outline: 'M4 5h12M7 10h9M7 15h9',
  write: 'M4 16.5 5 12.5 13.2 4.3a2 2 0 0 1 2.9 2.9L7.9 15.4 4 16.5ZM11.8 5.7l2.9 2.9',
  preview: 'M2.5 10s3-5.5 7.5-5.5 7.5 5.5 7.5 5.5-3 5.5-7.5 5.5S2.5 10 2.5 10ZM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  checks: 'M4 10.5 8 14.5 16 5.5',
  properties: 'M4 6h7M15 6h1M4 14h1M9 14h7M13 4v4M7 12v4',
  versions: 'M10 5v5l3 2M3.5 10a6.5 6.5 0 1 0 2-4.7M3 3v3.5h3.5',
  tutorial: 'M3 5.5 10 3l7 2.5L10 8 3 5.5ZM6 7v4.5c2.5 2 5.5 2 8 0V7',
};
const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d={ICONS[name] ?? ICONS.properties} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
);
const CloseIcon = () => <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>;

/** The strip on the left: the left pane's tabs as toggles (open on that tab, or close). */
function LeftRail() {
  const left = panes.value.left;
  return (
    <nav class="st-rail" aria-label={t('panes.leftRail')}>
      {registry.panels('left').map((p) => (
        <button key={p.id} type="button" class="st-rail-btn" id={`rail-${p.id}`} aria-pressed={left === p.id} aria-controls={left ? 'left-pane' : undefined}
          aria-label={t(p.title)} title={t(p.title)} onClick={() => (left === p.id ? openLeft(null) : openLeft(p.id as LeftTab))}>
          <Icon name={p.id} />
        </button>
      ))}
    </nav>
  );
}

/** The strip on the right while the companion is closed: its tabs, each opening it there. */
function RightRail() {
  return (
    <nav class="st-rail st-rail--right" aria-label={t('panes.rightRail')}>
      {registry.panels('companion').map((p) => (
        <button key={p.id} type="button" class="st-rail-btn" id={`rail-${p.id}`} aria-expanded="false" aria-controls="companion"
          aria-label={t(p.title)} title={t(p.title)} onClick={() => showPanel(p.id, `tab-${p.id}`)}>
          <Icon name={p.id} />
        </button>
      ))}
    </nav>
  );
}

/** A pane's tabs, its close button and its panels (the left pane and the companion are drawn alike). */
function SidePane({ region, id, current, label, onSelect, close, hidden = false }: {
  region: 'left' | 'companion'; id: string; current: string; label: string; onSelect(id: string): void; close: { label: string; run(): void }; hidden?: boolean;
}) {
  const list = registry.panels(region);
  const shown = list.find((p) => p.id === current) ?? list[0];
  if (!shown) return null;
  return (
    <aside class={`st-side st-side--${region}`} id={id} aria-label={t(shown.title)} hidden={hidden}>
      <div class="st-side-head">
        <TabList tabs={list.map((p) => ({ id: p.id, title: p.title, ...(p.count ? { count: p.count() ?? null } : {}) }))} current={shown.id} label={label} onSelect={onSelect} />
        <button type="button" class="st-side-close" id={`${id}-close`} aria-label={close.label} title={close.label} onClick={close.run}><CloseIcon /></button>
      </div>
      {list.map((p) => (
        <div key={p.id} class="st-tabpanel" role="tabpanel" id={`tp-${p.id}`} aria-labelledby={`tab-${p.id}`} tabIndex={0} hidden={p !== shown} data-panel={p.id}>
          {p === shown || p.keepMounted ? p.render() : null}
        </div>
      ))}
    </aside>
  );
}

/** After a pane closes: the focus goes to the first of these that is shown (on a phone the rails are not). */
function focusShown(...queries: string[]): void {
  requestAnimationFrame(() => {
    for (const q of queries) {
      const el = document.querySelector<HTMLElement>(q);
      if (el && el.getClientRects().length) { el.focus(); return; }
    }
  });
}

function LeftPane() {
  const left = panes.value.left;
  if (!left) return null;
  const close = () => { openLeft(null); s.pane.value = 'write'; focusShown(`#rail-${left}`, '.st-phone-bar [data-pane="outline"]'); };
  return <SidePane region="left" id="left-pane" current={left} label={t('panes.leftLabel')} onSelect={(id) => openLeft(id as LeftTab)} close={{ label: t('panes.close'), run: close }} />;
}

/** The companion's width: the author's (from the splitter), or the default for the mode and the window. */
const viewport = signal(typeof innerWidth === 'number' ? innerWidth : 1440);
if (typeof addEventListener === 'function') addEventListener('resize', () => { viewport.value = innerWidth; });
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export function compBounds(): { min: number; max: number } {
  const vw = viewport.value;
  const left = panes.value.left ? 260 : 0;
  return { min: COMP_MIN, max: Math.max(COMP_MIN, Math.min(Math.round(vw * COMP_MAX_SHARE), vw - 48 - left - 360)) };
}
function compWidth(): number {
  const vw = viewport.value;
  const { min, max } = compBounds();
  const fallback = layout.value.mode === 'blocks' ? clamp(vw * 0.24, 300, 360) : clamp(vw * 0.31, 320, 460);
  return Math.round(clamp(layout.value.width ?? fallback, min, max));
}
/** The width rule (only where the panes are side by side; on a phone each pane is the whole screen). */
const compSize = typeof document !== 'undefined' ? document.head.appendChild(document.createElement('style')) : null;
const dragging = signal<number | null>(null);

/**
 * The divider between the editor and the companion (the WAI-ARIA window splitter): drag it, or with the focus on it
 * press Left and Right (16 px a step), Home and End (narrowest, widest), and Enter to close the companion.
 */
function Splitter() {
  const { min, max } = compBounds();
  const width = dragging.value ?? compWidth();
  const set = (w: number) => setCompWidth(clamp(w, min, max));
  const key = (e: KeyboardEvent) => {
    // the width now, not at the last drawing: keys pressed quickly in a row each move it a step
    const width = compWidth();
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowLeft') set(width + step);
    else if (e.key === 'ArrowRight') set(width - step);
    else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else if (e.key === 'Enter') { openComp(null); requestAnimationFrame(() => document.querySelector<HTMLElement>('.st-rail--right .st-rail-btn')?.focus()); }
    else return;
    e.preventDefault();
  };
  const down = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => { dragging.value = clamp(innerWidth - m.clientX - 4, min, max); };
    const up = () => {
      el.removeEventListener('pointermove', move);
      if (dragging.value !== null) setCompWidth(dragging.value);
      dragging.value = null;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
  };
  return (
    <div class="st-splitter" role="separator" aria-orientation="vertical" aria-label={t('panes.resize')} aria-controls="companion" tabIndex={0}
      aria-valuenow={width} aria-valuemin={min} aria-valuemax={max} aria-valuetext={t('panes.width', { n: width })} onKeyDown={key} onPointerDown={down} />
  );
}

/** The companion. Drawn even while closed (or in Fokus), hidden: the preview's frame stays, for printing and exports. */
function Companion() {
  const comp = panes.value.comp;
  const hidden = !comp || editorPrefs.value.focus;
  const versions = comp === 'versions';
  const close = versions
    ? { label: t('panes.closeVersions'), run: () => { closeVersions(); requestAnimationFrame(() => document.querySelector<HTMLElement>('#companion [role="tab"][aria-selected="true"]')?.focus()); } }
    : { label: t('panes.close'), run: () => { openComp(null); s.pane.value = 'write'; focusShown(`#rail-${comp}`, '.st-rail--right .st-rail-btn', '.st-phone-bar [data-pane="write"]'); } };
  return <SidePane region="companion" id="companion" current={comp ?? 'preview'} label={t('panes.compLabel')} onSelect={(id) => openComp(id)} close={close} hidden={hidden} />;
}

/** The number of items to fix, as the tabs show it (a dash while checking). */
function ChecksCount({ id }: { id: string }) {
  const checking = s.status.value === 'checking';
  const n = s.issues.value;
  return <span class="st-count" id={id} data-tone={checking ? '' : n ? 'error' : 'ok'}>{checking ? '–' : n}</span>;
}

const MOBILE: { id: 'write' | 'preview' | 'checks' | 'outline'; key: Key; icon: string }[] = [
  { id: 'write', key: 'mobile.write', icon: 'write' }, { id: 'preview', key: 'mobile.preview', icon: 'preview' },
  { id: 'checks', key: 'mobile.checks', icon: 'checks' }, { id: 'outline', key: 'mobile.outline', icon: 'outline' },
];

/**
 * The phone's bottom bar: the four regions, each the whole screen. A row of the layout, never a layer over the text
 * (WCAG 2.4.11); within thumb reach, clear of the home-gesture area, hidden while the on-screen keyboard is open.
 */
function PhoneBar() {
  const p = panes.value;
  const pressed = (id: (typeof MOBILE)[number]['id']) => id === 'write' ? s.pane.value === 'write'
    : id === 'outline' ? s.pane.value === 'left' : s.pane.value === 'companion' && p.comp === id;
  return (
    <nav class="st-phone-bar st-mobile-tabs" aria-label={t('mobile.label')} hidden={s.keyboardOpen.value}>
      {MOBILE.map(({ id, key, icon }) => (
        <button key={id} type="button" data-pane={id} aria-pressed={pressed(id)} onClick={() => (id === 'write' ? showEditor() : showPanel(id))}>
          <Icon name={icon} />
          <span class="st-phone-label">{t(key)}{id === 'checks' ? <ChecksCount id="phone-count" /> : null}</span>
        </button>
      ))}
    </nav>
  );
}

/**
 * Fokus's dock under the page: + Block, the Checks count and Exit. A row of the layout under the text, not a layer
 * over it (WCAG 2.4.11). Formatting stays on its keys; Esc stays the editor's (it selects the block).
 */
function FocusDock() {
  const exit = () => { setPref('focus', false); requestAnimationFrame(() => bridge.editor?.focus()); };
  return (
    <div class="st-dock" id="focus-dock" role="group" aria-label={t('dock.label')}>
      <button type="button" class="st-dock-btn st-insert-btn" id="dock-insert" aria-label={t('editor.insert')} title={t('insert.buttonHelp')}
        aria-haspopup="dialog" aria-expanded={pickerOpen()} onClick={(e) => togglePicker(e.currentTarget)}>
        <span>{t('insert.button')}</span>
      </button>
      <BlockBar where="dock" />
      <button type="button" class="st-dock-btn" id="dock-checks" onClick={() => showChecks()}>
        <span>{t('mobile.checks')}</span><ChecksCount id="dock-count" />
      </button>
      <button type="button" class="st-dock-btn" id="dock-exit" aria-keyshortcuts="Alt+1 Control+Shift+F" title={t('dock.exitHelp')} onClick={exit}>
        {t('dock.exit')}
      </button>
    </div>
  );
}

export function Workspace() {
  const p = panes.value;
  const focus = editorPrefs.value.focus;
  // the width rule follows the mode, the window and the splitter
  const width = dragging.value ?? compWidth();
  useEffect(() => { if (compSize) compSize.textContent = `@media (min-width: 900px){#companion{width:${width}px}}`; }, [width]);
  return (
    <>
      <div class="st-work" data-pane={s.pane.value} data-mode={s.shownMode.value} data-focus={String(focus)} data-layout={layout.value.mode}
        data-left={p.left ?? ''} data-comp={p.comp ?? ''}>
        {focus ? null : <LeftRail />}
        {focus ? null : <LeftPane />}
        <main class="st-main" id="main" tabIndex={-1}>
          <EditorPane />
          {focus ? <FocusDock /> : null}
        </main>
        {focus || !p.comp ? null : <Splitter />}
        <Companion />
        {focus || p.comp ? null : <RightRail />}
      </div>
      {s.phone.value && !focus && s.pane.value === 'write' ? <BlockBar where="phone" /> : null}
      {s.phone.value && !focus ? <PhoneBar /> : null}
    </>
  );
}
