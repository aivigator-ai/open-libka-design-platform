/** The Studio's dialogs, on the native modal dialog (focus kept inside, Escape closes, focus returns afterwards). */
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { restoreVersion } from '../app/project.ts';
import { Comparison, versionName, when } from './History.tsx';
import { PreferencesForm, ShortcutList } from './Settings.tsx';
import { CommandPalette } from './CommandPalette.tsx';
import { AccessibilityStatement } from './Accessibility.tsx';
import { AboutStudio } from './About.tsx';
import type { PaletteItem } from '../state/commands.ts';
import { useEffect } from 'preact/hooks';

/** The brand editor, with @libka/design, loaded when its dialog first opens. */
function LazyBrandEditor() {
  const [Editor, setEditor] = useState<(() => preact.JSX.Element) | null>(null);
  useEffect(() => { void import('./BrandEditor.tsx').then((m) => setEditor(() => m.BrandEditor)); }, []);
  return Editor ? <Editor /> : <p class="st-note" role="status">{t('design.loading')}</p>;
}

export function DialogHost() {
  const d = s.dialog.value;
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const result = useRef<unknown>(null);
  /** Runs once the dialog has closed and the focus is back (a palette choice may open another dialog). */
  const after = useRef<(() => void) | null>(null);
  // opened before the browser handles another key (keys typed right after Ctrl+K or F1 go to the palette, not the editor)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!d || !el) return;
    result.current = null;
    if (d.kind === 'prompt') setValue(d.value);
    if (d.kind === 'form') setValues(Object.fromEntries(d.fields.map((f) => [f.id, f.value])));
    if (d.kind === 'new') setValue('blank');
    const back = document.activeElement as HTMLElement | null;
    if (!el.open) el.showModal();   // a dialog set again while open (a second activation) stays open, once
    const closed = () => {
      s.dialog.value = null;
      if (d.kind === 'confirm') d.resolve(result.current === true);
      else if (d.kind === 'prompt' || d.kind === 'choose' || d.kind === 'new') d.resolve(result.current as string | null);
      else if (d.kind === 'form') d.resolve(result.current as Record<string, string> | null);
      if (back?.isConnected) back.focus();
      const next = after.current;
      after.current = null;
      next?.();
    };
    el.addEventListener('close', closed, { once: true });
    return () => el.removeEventListener('close', closed);
  }, [d]);
  if (!d) return null;
  const close = (r: unknown) => { result.current = r; ref.current!.close(); };
  const title = d.kind === 'compare' ? t('compare.title', { name: versionName(d.version), when: when(d.version.created) })
    : d.kind === 'new' ? t('new.title') : d.kind === 'shortcuts' ? t('keys.title') : d.kind === 'prefs' ? t('prefs.title') : d.kind === 'palette' ? t('cmdk.title') : d.kind === 'accessibility' ? t('a11y.title') : d.kind === 'about' ? t('about.title') : d.kind === 'brand' ? t('brand.title') : t(d.title);
  const wide = d.kind === 'compare' || d.kind === 'shortcuts' || d.kind === 'new' || d.kind === 'brand';
  // a long dialog opens at its top: its heading takes the focus (Tab goes on to the close button beside it, then the
  // first control); a dialog of text to read opens on its text, which then scrolls with the keyboard
  const long = d.kind === 'prefs' || d.kind === 'accessibility' || d.kind === 'brand' || d.kind === 'about';
  const reading = d.kind === 'accessibility';
  // its × does what the button at the bottom does, and says so: Cancel where that is Cancel
  const cancels = d.kind === 'confirm' || d.kind === 'prompt' || d.kind === 'form' || d.kind === 'choose' || d.kind === 'new';
  if (d.kind === 'palette') {
    // the palette closes first (the focus goes back where it was), then the chosen thing runs there
    const run = (item: PaletteItem) => {
      after.current = () => { void Promise.resolve(item.run()).catch((e) => { console.error('LibKa Studio: a palette action failed', e); }); };
      close(null);
    };
    return (
      <dialog key="palette" ref={ref} class="st-dialog st-dialog--palette" aria-labelledby="dialog-title">
        <div class="st-dialog-body">
          <h2 class="st-dialog-title st-visually-hidden" id="dialog-title">{title}</h2>
          <CommandPalette onRun={run} />
        </div>
      </dialog>
    );
  }
  // a new element for each kind: a dialog opened from the palette replaces it in the same render, and a screen reader
  // announces a dialog only when it is a new one (NVDA said nothing of Preferences opened from the palette)
  return (
    <dialog key={d.kind} ref={ref} class={`st-dialog st-dialog--${d.kind}${wide ? ' st-dialog--wide' : ''}${long || wide ? ' st-dialog--panels' : ''}`} aria-labelledby="dialog-title"
      aria-describedby={d.kind === 'form' && d.note ? 'dialog-note' : undefined}>
      <form method="dialog" class="st-dialog-body" onSubmit={(e) => {
        e.preventDefault();
        if (d.kind === 'confirm') close(true);
        else if (d.kind === 'prompt') close(value);
        else if (d.kind === 'form') close(values);
        else if (d.kind === 'new') close(value || 'blank');
      }}>
        {/* the heading and a close button stay at the top, the buttons at the bottom; only the content between scrolls */}
        <div class="st-dialog-head">
          <h2 class="st-dialog-title" id="dialog-title" tabIndex={long && !reading ? -1 : undefined} autoFocus={long && !reading}>{title}</h2>
          <button type="button" class="st-dialog-x" aria-label={t(cancels ? 'dialog.cancel' : 'dialog.close')} title={t(cancels ? 'dialog.cancel' : 'dialog.close')} onClick={() => close(null)}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          </button>
        </div>
        {/* text to read (the accessibility statement) scrolls with the keyboard too: the region takes the focus */}
        <div class="st-dialog-content" {...(reading ? { tabIndex: 0, role: 'region', 'aria-labelledby': 'dialog-title', autoFocus: true } : {})}>
        {d.kind === 'prefs' ? <p class="st-dialog-saved">{t('prefs.saved')}</p> : null}
        {d.kind === 'confirm' ? <p>{d.message}</p> : null}
        {d.kind === 'prompt' ? (
          <label class="st-field">
            <span>{t(d.label)}</span>
            <input type="text" value={value} onInput={(e) => setValue(e.currentTarget.value)} autoFocus spellcheck={false} />
          </label>
        ) : null}
        {d.kind === 'form' ? <>
          {d.note ? <p id="dialog-note">{t(d.note)}</p> : null}
          {d.fields.map((f, i) => (
            <label key={f.id} class="st-field">
              <span>{t(f.label)}</span>
              <input type="text" id={`form-${f.id}`} value={values[f.id] ?? ''} autoFocus={i === 0} spellcheck={false}
                onInput={(e) => { const v = e.currentTarget.value; setValues((all) => ({ ...all, [f.id]: v })); }} />
            </label>
          ))}
        </> : null}
        {d.kind === 'choose' ? (
          <>
            <p>{d.message}</p>
            <ul class="st-choices">
              {d.options.map((o) => <li key={o}><button type="button" class="st-btn" onClick={() => close(o)}>{o}</button></li>)}
            </ul>
          </>
        ) : null}
        {d.kind === 'new' ? <NewDocument templates={d.templates} choice={value} choose={setValue} /> : null}
        {d.kind === 'compare' ? <Comparison version={d.version} /> : null}
        {d.kind === 'shortcuts' ? <ShortcutList /> : null}
        {d.kind === 'prefs' ? <PreferencesForm /> : null}
        {d.kind === 'accessibility' ? <AccessibilityStatement /> : null}
        {d.kind === 'about' ? <AboutStudio /> : null}
        {d.kind === 'brand' ? <LazyBrandEditor /> : null}
        </div>
        <div class="st-dialog-actions">
          {d.kind === 'compare' ? <button type="button" class="st-btn" onClick={() => { const v = d.version; close(null); void restoreVersion(v); }}>{t('history.restoreThis')}</button> : null}
          <button type="button" class="st-btn" onClick={() => close(null)} autoFocus={!long && !reading && d.kind !== 'prompt' && d.kind !== 'form' && d.kind !== 'shortcuts' && d.kind !== 'new'}>{t(cancels ? 'dialog.cancel' : 'dialog.close')}</button>
          {d.kind === 'confirm' || d.kind === 'prompt' || d.kind === 'form' ? (
            <button type="submit" class={`st-btn ${d.kind === 'confirm' && d.danger ? 'st-btn--danger' : 'st-btn--primary'}`}>{t(d.confirm)}</button>
          ) : null}
          {d.kind === 'new' ? <button type="submit" class="st-btn st-btn--primary">{t('new.create')}</button> : null}
        </div>
      </form>
    </dialog>
  );
}

/** New document's choices: Blank, then each template with its picture, name and description, as one group of radios. */
function NewDocument({ templates, choice, choose }: { templates: readonly s.StudioTemplate[]; choice: string; choose(id: string): void }) {
  const lang = s.lang.value;
  const options = [{ id: 'blank', name: t('new.blank'), description: t('new.blankText'), picture: '' },
    ...templates.map((x) => ({ id: x.id, name: x.name[lang], description: x.description[lang], picture: x.pictures[lang] }))];
  return (
    <fieldset class="st-templates">
      <legend class="st-visually-hidden">{t('new.startFrom')}</legend>
      {options.map((o) => (
        <label key={o.id} class="st-template" data-template={o.id}>
          <input type="radio" name="st-template" value={o.id} checked={choice === o.id} onChange={() => choose(o.id)} autoFocus={o.id === 'blank'} />
          {o.picture ? <img src={o.picture} alt="" width={320} height={200} class="st-template-picture" /> : <span class="st-template-picture st-template-blank" aria-hidden="true" />}
          <span class="st-template-name">{o.name}</span>
          <span class="st-template-text">{o.description}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function Toast() {
  const text = s.toastText.value;
  return <div class="st-toast" id="toast" role="status" aria-live="polite" hidden={!text}>{text}</div>;
}
