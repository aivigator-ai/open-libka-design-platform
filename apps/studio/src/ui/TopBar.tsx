/**
 * The bar across the top: the Studio, the open document (its title is Document ▾) and its save state, the mode switch,
 * the check status, View ▾, Help ▾ and Export ▾.
 */
import type { Key, Lang } from '../i18n.ts';
import { registry, type MenuId } from '../state/commands.ts';
import { ariaKeys, keysOf, keyText } from '../state/keys.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { displayName } from '../storage/projects.ts';
import { setMode } from '../app/project.ts';
import { layout, showChecks, shownLayout, widthChoice } from '../state/layout.ts';
import { editorPrefs } from '../state/prefs.ts';
import { Menu } from './Menu.tsx';

export function CommandButton({ id, class: cls }: { id: string; class?: string }) {
  const c = registry.command(id);
  if (!c || !registry.available(id)) return null;
  const keys = keysOf(c);
  return (
    <button type="button" class={cls} data-command={id} aria-keyshortcuts={keys ? ariaKeys(keys) : undefined} onClick={() => void registry.run(id)}>
      <span>{t(c.title)}</span>{keys ? <span class="st-menu-keys" aria-hidden="true">{keyText(keys)}</span> : null}
    </button>
  );
}

/** A menu's commands, a separator between their groups. */
export function MenuCommands({ menu }: { menu: MenuId }) {
  return <>{registry.menuGroups(menu).map((group, i) => [i ? <hr key={`hr${i}`} /> : null, ...group.map((c) => <CommandButton key={c.id} id={c.id} />)])}</>;
}

function StatusChip() {
  const status = s.status.value;
  const text = status === 'fix' ? t('status.fix', { n: s.issues.value }) : status === 'ready' ? t('status.ready') : t('status.checking');
  const open = () => showChecks();
  return (
    <>
      <button type="button" class="st-status" id="status-chip" aria-describedby="status-live" data-state={status} onClick={open}>
        <span class="st-status-icon" aria-hidden="true" />
        {/* below 1440 px a long readiness ("Připraveno k publikaci") shows its first words, which start the button's name
            (2.5.3); the whole text stays the name, visually hidden there */}
        {status === 'ready' && t('status.readyShort') !== text ? <span class="st-status-short" aria-hidden="true">{t('status.readyShort')}</span> : null}
        <span id="status-text" class={status === 'ready' && t('status.readyShort') !== text ? 'st-status-long' : undefined}>{text}</span>
      </button>
      <span class="st-visually-hidden" id="status-live" aria-live="polite">{status === 'checking' ? '' : text}</span>
    </>
  );
}

const LANG_NAMES: Record<Lang, string> = { en: 'English', cs: 'Čeština' };

/** The mode switch: Psaní (the editor and Preview), Bloky (the Catalog and Properties), Fokus (the editor alone). */
function LayoutSwitch() {
  const shown = shownLayout.value;
  return (
    <div class="st-layout" role="group" aria-label={t('layout.label')}>
      {(['write', 'blocks', 'focus'] as const).map((m, i) => (
        <button key={m} type="button" data-layout={m} aria-pressed={shown === m} aria-keyshortcuts={`Alt+${i + 1}`} title={t(`layout.${m}Help`)}
          onClick={() => void registry.run(`layout.${m}`)}>{t(`layout.${m}`)}</button>
      ))}
    </div>
  );
}

/** Document ▾: the open document's title, as a menu of what concerns this document (Rename…, Duplicate, Save now, versions, properties). */
function DocumentMenu({ title }: { title: string }) {
  return (
    <Menu id="doc-menu" className="st-doc-menu" summary={<span class="st-doc-title" id="doc-title">{title}</span>} summaryClass="st-doc-summary" listClass="st-doc-list" label={t('docMenu.label')}>
      <MenuCommands menu="document" />
    </Menu>
  );
}

/** The layout's choices in View ▾: the right pane's width (a resize without dragging, WCAG 2.5.7) and Reset. */
function LayoutItems() {
  const choice = widthChoice(layout.value.width);
  return <>
    <hr />
    {/* (no widths in Fokus or on a phone: no right pane beside the text there) */}
    {!editorPrefs.value.focus && !s.phone.value ? <>
      <p class="st-menu-label" id="view-width">{t('panes.resize')}</p>
      <div class="st-seg st-view-lang st-view-width" role="group" aria-labelledby="view-width">
        {(['narrow', 'medium', 'wide'] as const).map((w) => (
          <button key={w} type="button" data-width={w} aria-pressed={choice === w} onClick={() => void registry.run(`panes.${w}`)}>{t(`width.${w}`)}</button>
        ))}
      </div>
    </> : null}
    <button type="button" id="layout-reset" onClick={() => void registry.run('layout.reset')}>{t('layout.reset')}</button>
  </>;
}

/** View ▾'s choices (also in the phone's ⋯): how the Studio looks, Split, the layout, Preferences. */
function ViewItems({ inLibrary }: { inLibrary: boolean }) {
  const split = s.shownMode.value === 'split';
  return (
    <>
      <button type="button" class="st-toggle" id="theme-toggle" aria-pressed={s.theme.value === 'dark'}
        onClick={() => { s.theme.value = s.theme.value === 'dark' ? 'light' : 'dark'; s.prefs.set('theme', s.theme.value); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
        <span>{t('viewMenu.dark')}</span>
      </button>
      <button type="button" class="st-toggle" id="contrast-toggle" aria-pressed={s.highContrast.value}
        onClick={() => { s.highContrast.value = !s.highContrast.value; s.prefs.set('contrast', s.highContrast.value ? 'high' : 'standard'); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" /></svg>
        <span>{t('view.contrast')}</span>
      </button>
      <p class="st-menu-label" id="view-lang">{t('viewMenu.language')}</p>
      <div class="st-seg st-view-lang" role="group" aria-labelledby="view-lang">
        {(['en', 'cs'] as Lang[]).map((l) => (
          <button key={l} type="button" data-lang={l} lang={l} aria-pressed={s.lang.value === l} onClick={() => { s.lang.value = l; s.prefs.set('lang', l); }}>{LANG_NAMES[l]}</button>
        ))}
      </div>
      {/* Split needs a wide window (Fokus is in the mode switch) */}
      {!inLibrary && s.wide.value ? <>
        <hr />
        <button type="button" class="st-toggle" id="split-toggle" aria-pressed={split} onClick={() => void setMode(split ? 'visual' : 'split')}>
          <span>{t('viewMenu.split')}</span>
        </button>
      </> : null}
      {!inLibrary && s.project.value ? <LayoutItems /> : null}
      <hr />
      <MenuCommands menu="view" />
    </>
  );
}

/** View ▾: how the Studio looks (dark mode, high contrast, the interface language), Split and the layout. */
function ViewMenu({ inLibrary }: { inLibrary: boolean }) {
  return (
    <Menu id="view-menu" summary={<span>{t('viewMenu.title')}</span>} summaryClass="st-btn" listClass="st-view-list" label={t('viewMenu.title')}>
      <ViewItems inLibrary={inLibrary} />
    </Menu>
  );
}

/** The words of a document's text, without its front matter (the status bar, the phone's ⋯). */
export function wordCount(text: string): number {
  return (text.replace(/^---[\s\S]*?\n---\n/, '').match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/**
 * The phone's ⋯: what the wide app bar shows (the modes, Document ▾, View ▾, Export ▾, Help ▾), one section under
 * another, with the status bar's line and word count at the top.
 */
function MoreMenu({ inLibrary, saveText }: { inLibrary: boolean; saveText: string }) {
  const editor = !inLibrary && Boolean(s.project.value);
  const shown = shownLayout.value;
  const section = (id: string, key: Key) => <p class="st-menu-label" id={id}>{t(key)}</p>;
  return (
    <Menu id="more-menu" className="st-more" summary={<><span class="st-more-glyph" aria-hidden="true" /><span class="st-visually-hidden">{t('more.menu')}</span></>}
      summaryClass="st-btn st-more-summary" listClass="st-more-list" label={t('more.menu')}>
      {editor ? <p class="st-more-status" id="more-status">
        {t('status.position', { line: s.cursor.value.line, col: s.cursor.value.col })} · {t('status.words', { n: wordCount(s.source.value) })}
        {' · '}<span id="save-state" data-state={s.storageError.value ? 'failed' : s.saveState.value}>{saveText}</span>
      </p> : null}
      {editor ? <>
        {section('more-modes', 'layout.label')}
        <div class="st-more-modes" role="group" aria-labelledby="more-modes">
          {(['write', 'blocks', 'focus'] as const).map((m, i) => (
            <button key={m} type="button" class="st-toggle" data-layout={m} aria-pressed={shown === m} aria-keyshortcuts={`Alt+${i + 1}`}
              onClick={() => void registry.run(`layout.${m}`)}>{t(`layout.${m}`)}</button>
          ))}
        </div>
        <hr />
        {section('more-doc', 'docMenu.label')}
        <MenuCommands menu="document" />
        <hr />
      </> : null}
      {section('more-view', 'viewMenu.title')}
      <ViewItems inLibrary={inLibrary} />
      <hr />
      {editor ? <>
        {section('more-export', 'export.menu')}
        <MenuCommands menu="export" />
        <hr />
      </> : null}
      {section('more-help', 'help.menu')}
      {registry.menu('help').map((c) => <CommandButton key={c.id} id={c.id} />)}
    </Menu>
  );
}

function LibraryToggle({ inLibrary }: { inLibrary: boolean }) {
  return (
    <button type="button" class="st-btn st-library-toggle" id="library-toggle" aria-pressed={inLibrary}
      onClick={() => void registry.run(inLibrary ? 'view.editor' : 'view.library')}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M4 5h6v14H4zM14 5h6v6h-6zM14 15h6v4h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
      <span>{t('library.button')}</span>
    </button>
  );
}

export function TopBar() {
  const p = s.project.value;
  const inLibrary = s.view.value === 'library';
  const saveText = s.storageError.value ? t('save.memory') : s.saveState.value === 'failed' ? t('save.failed') : s.saveState.value === 'saving' ? t('save.saving') : t('save.saved');
  // a phone: one row (the Studio's dot, the readiness chip, Documents and ⋯)
  if (s.phone.value) return (
    <header class="st-top st-top--phone">
      <div class="st-brand">
        <span class="st-dot" aria-hidden="true" />
        <span class="st-brand-name">{t('app.name')}</span>
      </div>
      {/* a failed save never waits in the ⋯ menu */}
      {!inLibrary && p && (s.storageError.value || s.saveState.value === 'failed') ? <span class="st-doc-save" id="save-alert" data-state="failed">{saveText}</span> : null}
      {!inLibrary && p ? <StatusChip /> : null}
      <LibraryToggle inLibrary={inLibrary} />
      <MoreMenu inLibrary={inLibrary} saveText={saveText} />
    </header>
  );
  return (
    <header class="st-top">
      <div class="st-brand">
        <span class="st-dot" aria-hidden="true" />
        <span class="st-brand-name">{t('app.name')}</span>
      </div>
      <LibraryToggle inLibrary={inLibrary} />
      <div class="st-doc">
        {p && !inLibrary ? <>
          <DocumentMenu title={s.doc.value?.meta.title || displayName(p)} />
          <span class="st-doc-file">{p.name}{s.folderName.value ? ` · ${t('folder.in', { name: s.folderName.value })}` : ''}</span>
          {/* where the bar is tight (a container query on .st-doc), "Saved in this browser" shows as "✓ Saved", so the
              title keeps the room; the whole sentence stays in the tooltip and is what a screen reader reads */}
          {!s.storageError.value && s.saveState.value === 'saved'
            ? <span class="st-doc-save st-doc-save--fits" id="save-state" data-state="saved" title={saveText}>
                <span class="st-save-short" aria-hidden="true">✓<span class="st-save-word"> {t('save.savedShort')}</span></span><span class="st-save-long">{saveText}</span>
              </span>
            : <span class="st-doc-save" id="save-state" data-state={s.storageError.value ? 'failed' : s.saveState.value}>{saveText}</span>}
        </> : null}
      </div>
      {p && !inLibrary ? <LayoutSwitch /> : null}
      <div class="st-top-actions">
        {!inLibrary ? <StatusChip /> : null}
        <ViewMenu inLibrary={inLibrary} />
        <Menu id="help-menu" summary={<><span class="st-help-glyph" aria-hidden="true">?</span><span class="st-help-text">{t('help.menu')}</span></>} summaryClass="st-btn">
          {registry.menu('help').map((c) => <CommandButton key={c.id} id={c.id} />)}
        </Menu>
        {!inLibrary && p ? (
          <Menu id="export-menu" summary={<span>{t('export.menu')}</span>} summaryClass="st-btn st-btn--primary" label={t('export.menu')}>
            <MenuCommands menu="export" />
          </Menu>
        ) : null}
      </div>
    </header>
  );
}
