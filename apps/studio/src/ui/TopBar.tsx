/** The bar across the top: the Studio, the open document and its save state, the check status, view settings and File. */
import { OUTPUTS, outputsOf, type OutputName } from '@libka/model';
import type { Lang } from '../i18n.ts';
import { registry } from '../state/commands.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { displayName } from '../storage/projects.ts';
import { toggleOutput, withOutputs } from '../core/outputs.ts';
import { bridge, currentText } from '../app/project.ts';
import { Menu } from './Menu.tsx';

export function CommandButton({ id, class: cls }: { id: string; class?: string }) {
  const c = registry.command(id);
  if (!c || !registry.available(id)) return null;
  return <button type="button" class={cls} data-command={id} onClick={() => void registry.run(id)}>{t(c.title)}</button>;
}

function Outputs() {
  const want = outputsOf(s.doc.value?.meta ?? {});
  const change = (o: OutputName, on: boolean, box: HTMLInputElement) => {
    const next = toggleOutput(want, o, on);
    if (!next) { box.checked = true; return; }   // a document needs at least one output
    bridge.editor?.replaceAll(withOutputs(currentText(), next));
  };
  return (
    <fieldset class="st-outputs" id="outputs">
      <legend>{t('outputs.title')}</legend>
      {OUTPUTS.map((o) => (
        <label key={o}>
          <input type="checkbox" value={o} checked={want.includes(o)} onChange={(e) => change(o, e.currentTarget.checked, e.currentTarget)} />
          {' '}<span>{t(`outputs.${o}`)}</span>
        </label>
      ))}
      <p class="st-outputs-note">{t('outputs.note')}</p>
    </fieldset>
  );
}

function StatusChip() {
  const status = s.status.value;
  const text = status === 'fix' ? t('status.fix', { n: s.issues.value }) : status === 'ready' ? t('status.ready') : t('status.checking');
  const open = () => {
    const tab = s.problems.value.length || !s.checks.value ? 'problems' : 'guard';
    s.panelTab.value = tab;
    s.pane.value = 'checks';
    requestAnimationFrame(() => (document.querySelector(`#tp-${tab} button`) as HTMLElement | null)?.focus());
  };
  return (
    <>
      <button type="button" class="st-status" id="status-chip" aria-describedby="status-live" data-state={status} onClick={open}>
        <span class="st-status-icon" aria-hidden="true" /><span id="status-text">{text}</span>
      </button>
      <span class="st-visually-hidden" id="status-live" aria-live="polite">{status === 'checking' ? '' : text}</span>
    </>
  );
}

export function TopBar() {
  const p = s.project.value;
  const inLibrary = s.view.value === 'library';
  const saveText = s.storageError.value ? t('save.memory') : s.saveState.value === 'failed' ? t('save.failed') : s.saveState.value === 'saving' ? t('save.saving') : t('save.saved');
  return (
    <header class="st-top">
      <div class="st-brand">
        <span class="st-dot" aria-hidden="true" />
        <span class="st-brand-name">{t('app.name')}</span>
      </div>
      <button type="button" class="st-btn st-library-toggle" id="library-toggle" aria-pressed={inLibrary}
        onClick={() => void registry.run(inLibrary ? 'view.editor' : 'view.library')}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M4 5h6v14H4zM14 5h6v6h-6zM14 15h6v4h-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
        <span>{t('library.button')}</span>
      </button>
      <div class="st-doc">
        {p && !inLibrary ? <>
          <span class="st-doc-title" id="doc-title">{s.doc.value?.meta.title || displayName(p)}</span>
          <span class="st-doc-file">{p.name}{s.folderName.value ? ` · ${t('folder.in', { name: s.folderName.value })}` : ''}</span>
          <span class="st-doc-save" id="save-state" data-state={s.storageError.value ? 'failed' : s.saveState.value}>{saveText}</span>
        </> : null}
      </div>
      <div class="st-top-actions">
        {!inLibrary ? <StatusChip /> : null}
        <div class="st-seg" role="group" aria-label={t('view.language')}>
          {(['en', 'cs'] as Lang[]).map((l) => (
            <button key={l} type="button" data-lang={l} aria-pressed={s.lang.value === l} onClick={() => { s.lang.value = l; s.prefs.set('lang', l); }}>{l.toUpperCase()}</button>
          ))}
        </div>
        <button type="button" class="st-icon-btn" id="theme-toggle" aria-pressed={s.theme.value === 'dark'}
          onClick={() => { s.theme.value = s.theme.value === 'dark' ? 'light' : 'dark'; s.prefs.set('theme', s.theme.value); }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
          <span>{t('view.theme.dark')}</span>
        </button>
        <button type="button" class="st-icon-btn" id="contrast-toggle" aria-pressed={s.highContrast.value}
          onClick={() => { s.highContrast.value = !s.highContrast.value; s.prefs.set('contrast', s.highContrast.value ? 'high' : 'standard'); }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" /></svg>
          <span>{t('view.contrast')}</span>
        </button>
        <Menu id="help-menu" summary={<><span class="st-help-glyph" aria-hidden="true">?</span><span class="st-help-text">{t('help.menu')}</span></>} summaryClass="st-btn">
          {registry.menu('help').map((c) => <CommandButton key={c.id} id={c.id} />)}
        </Menu>
        <Menu id="file-menu" summary={<span>{t('file.menu')}</span>} summaryClass="st-btn st-btn--primary">
          {registry.menu('file').map((c) => <CommandButton key={c.id} id={c.id} />)}
          {!inLibrary ? <>
            <hr />
            {registry.menu('export').map((c) => <CommandButton key={c.id} id={c.id} />)}
            <hr />
            <Outputs />
          </> : null}
        </Menu>
      </div>
    </header>
  );
}
