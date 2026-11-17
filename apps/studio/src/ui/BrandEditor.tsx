/**
 * The brand editor (a dialog from the Design tab): the brand's name, colours (a hex field with the native picker
 * beside it), chart colours, fonts from LibKa's list, the neutral tint and the logo, on the left; the four modes as
 * the outputs will show them and the solver's words, live, on the right. Each valid change is written to the brand file
 * at once (the preview behind the dialog follows). Reset puts back the brand as it was when the dialog opened; Remove
 * deletes the brand file, after a second press.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CHART_SERIES, DEFAULT, FONTS, LIBKA_SERIES, MODES, builtinTheme, fontByFamily, isHex, normalizeHex, type Mode } from '@libka/design';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import type { Key } from '../i18n.ts';
import { addLogo, brandDir, brandFile, currentBrandText, putDesignFile, readForm, removeDesignFiles, saveForm, type BrandForm } from '../app/brand-edit.ts';

const MODE_NAME: Record<Mode, Key> = { 'light': 'brand.light', 'dark': 'brand.dark', 'light-high-contrast': 'brand.lightHigh', 'dark-high-contrast': 'brand.darkHigh' };

/** A colour: the hex field (the main control, checked) and the browser's colour picker beside it. */
function ColourField({ id, label, help, value, onChange, onRemove }: { id: string; label: string; help?: string; value: string; onChange(v: string): void; onRemove?: () => void }) {
  const bad = value !== '' && !isHex(value);
  return (
    <div class="st-colour-field">
      <label class="st-field-label" for={id}>{label}</label>
      <div class="st-colour-row">
        <input id={id} type="text" class="st-colour-hex" value={value} placeholder="#0F8FA1" spellcheck={false} autocomplete="off" maxLength={7}
          aria-invalid={bad} aria-describedby={[bad ? `${id}-error` : '', help ? `${id}-help` : ''].filter(Boolean).join(' ') || undefined}
          onInput={(e) => onChange(e.currentTarget.value.trim())} />
        <input type="color" class="st-colour-pick" value={isHex(value) ? normalizeHex(value).toLowerCase() : '#000000'} aria-label={t('brand.pick', { name: label })}
          onInput={(e) => onChange(e.currentTarget.value.toUpperCase())} />
        {onRemove ? <button type="button" class="st-btn st-btn--small" onClick={onRemove}>{t('brand.removeColour')}</button> : null}
      </div>
      {help ? <span class="st-field-help" id={`${id}-help`}>{help}</span> : null}
      {bad ? <span class="st-field-error" id={`${id}-error`}>{t('brand.badHex')}</span> : null}
    </div>
  );
}

/** One mode as the outputs show it: the page, a heading, text, a link, the accent button, an AI mark, the chart colours. */
function ModeSample({ mode }: { mode: Mode }) {
  const d = s.design.value?.design?.design;
  const v = (d?.palette ?? DEFAULT.values)[mode] as Record<string, string>;
  const series = d?.charts.series[mode] ?? LIBKA_SERIES[mode];
  const fonts = d?.fonts ?? { heading: fontByFamily('Fraunces')!, body: fontByFamily('Inter')! };
  const theme = s.design.value?.theme ?? builtinTheme('classic')!;
  // the words are in the mode's text colour, which passes 7:1 in every mode, so the samples read in the Studio's own
  // high contrast too; each role's colour is a chip beside its name (the solver's words say what passes where)
  const chip = (colour: string | undefined, label: Key) => (
    <li class="st-mode-chip"><span class="st-mode-swatch" style={`background:${colour}`} aria-hidden="true" />{t(label)}</li>
  );
  return (
    <section class="st-mode-sample" aria-labelledby={`mode-${mode}`} style={`background:${v['semantic.bg.canvas']};color:${v['semantic.text.primary']};border-color:${v['semantic.border.strong']}`}>
      <h4 id={`mode-${mode}`} class="st-mode-name">{t(MODE_NAME[mode])}</h4>
      <p class="st-mode-heading" style={`font-family:${fonts.heading.css};font-weight:${theme.headings === 'bold' ? 700 : 650}`}>{s.design.value?.design?.design.brand.name?.full ?? t('brand.sampleHeading')}</p>
      <p class="st-mode-text" style={`font-family:${fonts.body.css}`}>{t('brand.sampleText')}</p>
      <ul class="st-mode-chips">
        {chip(v['semantic.text.accent'], 'brand.chipLinks')}
        {chip(v['semantic.action.accent'], 'brand.chipBars')}
        {chip(v['component.button.accent.background'], 'brand.chipButton')}
        {chip(v['semantic.status.ai'], 'brand.chipAi')}
      </ul>
      <p class="st-mode-series" role="img" aria-label={t('brand.sampleSeries')}>{series.map((c, i) => <span key={i} class="st-mode-bar" style={`background:${c};height:${12 + ((i * 7) % 18)}px`} />)}</p>
    </section>
  );
}

export function BrandEditor() {
  const [form, setForm] = useState<BrandForm>(() => readForm(currentBrandText()));
  /** The brand file as it was when the dialog opened (null: there was none), for Reset. */
  const opened = useRef<{ path: string; text: string | null; files: string[] }>({ path: brandFile(), text: currentBrandText(), files: [...s.files.value.keys()] });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const lang = s.lang.value;

  // each valid change is written a moment after the last keystroke
  const change = (next: BrandForm) => {
    setForm(next);
    dirty.current = true;
    clearTimeout(timer.current);
    const valid = [next.primary, next.secondary, next.link, ...next.charts].every((c) => c === '' || isHex(c));
    if (valid) timer.current = setTimeout(() => { void saveForm(next); }, 250);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const reset = async () => {
    clearTimeout(timer.current);
    const o = opened.current;
    if (o.text === null) await removeDesignFiles([o.path, ...[...s.files.value.keys()].filter((p) => !o.files.includes(p))].filter((p) => s.files.value.has(p)));
    else await putDesignFile(o.path, new TextEncoder().encode(o.text), 'application/yaml');
    setForm(readForm(o.text));
    dirty.current = false;
    s.toast(t('brand.resetDone'));
  };
  const remove = async () => {
    clearTimeout(timer.current);
    const path = brandFile();
    const logos = [form.logo.light, form.logo.dark].filter(Boolean).map((p) => `${brandDir(path)}${p}`);
    await removeDesignFiles([path, ...logos].filter((p) => s.files.value.has(p)));
    setForm(readForm(null));
    setConfirmRemove(false);
    s.toast(t('brand.removed'));
  };
  const chooseLogo = async (which: 'light' | 'dark', file: File | undefined) => {
    if (!file) return;
    if (!/\.(svg|png)$/i.test(file.name)) { s.toast(t('brand.logoFormat')); return; }
    const path = await addLogo(file);
    change({ ...form, logo: { ...form.logo, [which]: path } });
  };

  const headingFonts = FONTS.filter((f) => f.roles.includes('heading'));
  const bodyFonts = FONTS.filter((f) => f.roles.includes('body'));
  const theme = s.design.value?.theme ?? builtinTheme('classic')!;
  const exists = currentBrandText() !== null;
  return (
    <div class="st-brand-editor">
      <div class="st-brand-form">
        <p class="st-field-help">{t(exists ? 'brand.file' : 'brand.newFile', { file: brandFile() })}</p>
        <label class="st-field"><span>{t('brand.name')}</span>
          <input id="brand-name" type="text" value={form.name} onInput={(e) => change({ ...form, name: e.currentTarget.value })} />
        </label>
        <fieldset class="st-brand-group">
          <legend>{t('brand.colours')}</legend>
          <ColourField id="brand-primary" label={t('brand.primary')} help={t('brand.primaryHelp')} value={form.primary} onChange={(v) => change({ ...form, primary: v })} />
          <ColourField id="brand-secondary" label={t('brand.secondary')} help={t('brand.secondaryHelp')} value={form.secondary} onChange={(v) => change({ ...form, secondary: v })} />
          <ColourField id="brand-link" label={t('brand.link')} help={t('brand.linkHelp')} value={form.link} onChange={(v) => change({ ...form, link: v })} />
        </fieldset>
        <fieldset class="st-brand-group">
          <legend>{t('brand.charts')}</legend>
          <p class="st-field-help">{t('brand.chartsHelp')}</p>
          {form.charts.map((c, i) => (
            <ColourField key={i} id={`brand-chart-${i + 1}`} label={t('brand.series', { n: i + 1 })} value={c}
              onChange={(v) => change({ ...form, charts: form.charts.map((x, j) => (j === i ? v : x)) })}
              onRemove={() => change({ ...form, charts: form.charts.filter((_, j) => j !== i) })} />
          ))}
          {form.charts.length < CHART_SERIES ? <button type="button" class="st-btn st-btn--small" onClick={() => change({ ...form, charts: [...form.charts, ''] })}>{t('brand.addSeries')}</button> : null}
        </fieldset>
        <fieldset class="st-brand-group">
          <legend>{t('brand.fonts')}</legend>
          <label class="st-field"><span>{t('brand.heading')}</span>
            <select id="brand-heading" value={form.heading} onChange={(e) => change({ ...form, heading: e.currentTarget.value })}>
              <option value="">{t('brand.themeFont', { font: FONTS.find((f) => f.id === theme.fonts.heading)?.family ?? '' })}</option>
              {headingFonts.map((f) => <option key={f.id} value={f.family}>{f.family}</option>)}
            </select>
          </label>
          <label class="st-field"><span>{t('brand.body')}</span>
            <select id="brand-body" value={form.body} onChange={(e) => change({ ...form, body: e.currentTarget.value })}>
              <option value="">{t('brand.themeFont', { font: FONTS.find((f) => f.id === theme.fonts.body)?.family ?? '' })}</option>
              {bodyFonts.map((f) => <option key={f.id} value={f.family}>{f.family}</option>)}
            </select>
          </label>
          <p class="st-field-help">{t('brand.fontsHelp')}</p>
        </fieldset>
        <label class="st-brand-tint"><input type="checkbox" checked={form.tinted} disabled={!isHex(form.primary)} onChange={(e) => change({ ...form, tinted: e.currentTarget.checked })} /> {t('brand.tinted')}</label>
        <fieldset class="st-brand-group">
          <legend>{t('brand.logo')}</legend>
          <label class="st-field"><span>{t('brand.logoLight')}{form.logo.light ? ` (${form.logo.light})` : ''}</span>
            <input id="brand-logo" type="file" accept=".svg,.png,image/svg+xml,image/png" onChange={(e) => void chooseLogo('light', e.currentTarget.files?.[0])} />
          </label>
          <label class="st-field"><span>{t('brand.logoDark')}{form.logo.dark ? ` (${form.logo.dark})` : ''}</span>
            <input id="brand-logo-dark" type="file" accept=".svg,.png,image/svg+xml,image/png" disabled={!form.logo.light} onChange={(e) => void chooseLogo('dark', e.currentTarget.files?.[0])} />
          </label>
          <label class="st-field"><span>{t('brand.logoAlt')}</span>
            <input id="brand-logo-alt" type="text" value={form.logo.alt} disabled={!form.logo.light} placeholder={form.name} onInput={(e) => change({ ...form, logo: { ...form.logo, alt: e.currentTarget.value } })} />
          </label>
          {form.logo.light ? <button type="button" class="st-btn st-btn--small" onClick={() => change({ ...form, logo: { light: '', dark: '', alt: '' } })}>{t('brand.logoRemove')}</button> : null}
        </fieldset>
      </div>
      <div class="st-brand-preview">
        <h3 class="st-insp-heading">{t('brand.preview')}</h3>
        <div class="st-mode-samples">{MODES.map((m) => <ModeSample key={m} mode={m} />)}</div>
        <h3 class="st-insp-heading">{t('design.result')}</h3>
        <div aria-live="polite">
          {s.design.value?.problems.length ? <ul class="st-design-words st-field-error">{s.design.value.problems.map((p) => <li key={p.message}>{p.message}</li>)}</ul> : null}
          <ul class="st-design-words">{(s.design.value?.notes ?? []).map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
        <div class="st-brand-actions">
          <button type="button" class="st-btn" onClick={() => void reset()}>{t('brand.reset')}</button>
          {exists ? (confirmRemove
            ? <button type="button" class="st-btn st-btn--danger" onClick={() => void remove()}>{t('brand.removeConfirm')}</button>
            : <button type="button" class="st-btn" onClick={() => setConfirmRemove(true)}>{t('brand.remove')}</button>) : null}
        </div>
        <p class="st-field-help" lang={lang}>{t('brand.saved')}</p>
      </div>
    </div>
  );
}
