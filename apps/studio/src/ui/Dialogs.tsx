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

export function DialogHost() {
  const d = s.dialog.value;
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('');
  const result = useRef<unknown>(null);
  /** Runs once the dialog has closed and the focus is back (a palette choice may open another dialog). */
  const after = useRef<(() => void) | null>(null);
  // opened before the browser handles another key (keys typed right after Ctrl+K or F1 go to the palette, not the editor)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!d || !el) return;
    result.current = null;
    if (d.kind === 'prompt') setValue(d.value);
    const back = document.activeElement as HTMLElement | null;
    el.showModal();
    const closed = () => {
      s.dialog.value = null;
      if (d.kind === 'confirm') d.resolve(result.current === true);
      else if (d.kind === 'prompt' || d.kind === 'choose') d.resolve(result.current as string | null);
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
    : d.kind === 'shortcuts' ? t('keys.title') : d.kind === 'prefs' ? t('prefs.title') : d.kind === 'palette' ? t('cmdk.title') : d.kind === 'accessibility' ? t('a11y.title') : d.kind === 'about' ? t('about.title') : t(d.title);
  const wide = d.kind === 'compare' || d.kind === 'shortcuts';
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
    <dialog key={d.kind} ref={ref} class={`st-dialog st-dialog--${d.kind}${wide ? ' st-dialog--wide' : ''}`} aria-labelledby="dialog-title">
      <form method="dialog" class="st-dialog-body" onSubmit={(e) => {
        e.preventDefault();
        if (d.kind === 'confirm') close(true);
        else if (d.kind === 'prompt') close(value);
      }}>
        <h2 class="st-dialog-title" id="dialog-title">{title}</h2>
        {d.kind === 'confirm' ? <p>{d.message}</p> : null}
        {d.kind === 'prompt' ? (
          <label class="st-field">
            <span>{t(d.label)}</span>
            <input type="text" value={value} onInput={(e) => setValue(e.currentTarget.value)} autoFocus spellcheck={false} />
          </label>
        ) : null}
        {d.kind === 'choose' ? (
          <>
            <p>{d.message}</p>
            <ul class="st-choices">
              {d.options.map((o) => <li key={o}><button type="button" class="st-btn" onClick={() => close(o)}>{o}</button></li>)}
            </ul>
          </>
        ) : null}
        {d.kind === 'compare' ? <Comparison version={d.version} /> : null}
        {d.kind === 'shortcuts' ? <ShortcutList /> : null}
        {d.kind === 'prefs' ? <PreferencesForm /> : null}
        {d.kind === 'accessibility' ? <AccessibilityStatement /> : null}
        {d.kind === 'about' ? <AboutStudio /> : null}
        <div class="st-dialog-actions">
          {d.kind === 'compare' ? <button type="button" class="st-btn" onClick={() => { const v = d.version; close(null); void restoreVersion(v); }}>{t('history.restoreThis')}</button> : null}
          <button type="button" class="st-btn" onClick={() => close(null)} autoFocus={d.kind !== 'prompt' && d.kind !== 'shortcuts'}>{t(d.kind === 'confirm' || d.kind === 'prompt' || d.kind === 'choose' ? 'dialog.cancel' : 'dialog.close')}</button>
          {d.kind === 'confirm' || d.kind === 'prompt' ? (
            <button type="submit" class={`st-btn ${d.kind === 'confirm' && d.danger ? 'st-btn--danger' : 'st-btn--primary'}`}>{t(d.confirm)}</button>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}

export function Toast() {
  const text = s.toastText.value;
  return <div class="st-toast" id="toast" role="status" aria-live="polite" hidden={!text}>{text}</div>;
}
