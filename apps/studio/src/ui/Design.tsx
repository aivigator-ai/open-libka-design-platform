/**
 * The Design tab (Vzhled): the document's theme as cards with a sample of their type, its brand (LibKa's, the
 * project's `_brand.yml`, or another document's, copied), and what the solver did with the brand's colours, in words.
 * Every choice is written to the front matter, so the source says what the outputs show.
 */
import { useEffect, useState } from 'preact/hooks';
import { BUILTIN_THEMES, builtinTheme, DEFAULT_THEME_ID, fontById } from '@libka/design';
import * as s from '../state/store.ts';
import type { StudioDesign } from '../core/design.ts';
import { t } from '../state/text.ts';
import { brandsInLibrary, setBrand, setTheme, useBrandOf, type BrandSource } from '../app/design.ts';
import { showPanel } from '../state/layout.ts';

/** A document with neither a theme nor a brand: LibKa's design, which the pipeline leaves unchosen (`s.design` null). */
const DEFAULT: StudioDesign = { named: false, theme: builtinTheme(DEFAULT_THEME_ID)!, themeFrom: 'default', problems: [], hints: [], notes: [] };

export function DesignPanel() {
  const lang = s.lang.value;
  const [others, setOthers] = useState<BrandSource[] | null>(null);
  const [other, setOther] = useState('');
  useEffect(() => { void brandsInLibrary().then((list) => { setOthers(list); setOther(list[0]?.id ?? ''); }); }, [s.projects.value]);
  if (!s.doc.value) return <p class="st-note">{t('design.none')}</p>;
  const d = s.design.value ?? DEFAULT;
  const brandName = d.design?.design.brand.name?.full ?? d.design?.design.brand.name?.short;
  const usingProject = !!d.brandPath && !(s.doc.value?.meta.brand === 'libka');
  return (
    <div class="st-design">
      <section aria-labelledby="design-theme">
        <h3 class="st-insp-heading" id="design-theme">{t('design.theme')}</h3>
        <fieldset class="st-templates st-themes">
          <legend class="st-visually-hidden">{t('design.theme')}</legend>
          {BUILTIN_THEMES.map((theme) => {
            const heading = fontById(theme.fonts.heading)!, body = fontById(theme.fonts.body)!;
            return (
              <label key={theme.id} class="st-template st-theme" data-theme-id={theme.id}>
                <input type="radio" name="st-theme" value={theme.id} checked={d.theme.id === theme.id} onChange={() => setTheme(theme.id)} />
                <span class="st-template-picture st-theme-sample" aria-hidden="true">
                  <span class="st-theme-heading" style={`font-family: ${heading.css}; font-weight: ${theme.headings === 'bold' ? 700 : 650}`}>Aa</span>
                  <span class="st-theme-body" style={`font-family: ${body.css}`}>{t('design.sample')}</span>
                </span>
                <span class="st-template-name">{theme.name[lang]}</span>
                <span class="st-template-text">{theme.description?.[lang] ?? ''}</span>
              </label>
            );
          })}
        </fieldset>
        {d.themeFrom === 'brand' ? <p class="st-field-help">{t('design.themeFromBrand', { file: d.brandPath ?? '_brand.yml' })}</p> : null}
      </section>

      <section aria-labelledby="design-brand">
        <h3 class="st-insp-heading" id="design-brand">{t('design.brand')}</h3>
        <fieldset class="st-checks">
          <legend class="st-visually-hidden">{t('design.brand')}</legend>
          <label><input type="radio" name="st-brand" checked={!usingProject} onChange={() => setBrand('libka')} /> {t('design.brandLibka')}</label>
          <label><input type="radio" name="st-brand" checked={usingProject} disabled={!d.brandPath} onChange={() => setBrand('project')} />
            {' '}{d.brandPath ? t('design.brandFile', { brand: brandName ? `${brandName} (${d.brandPath})` : d.brandPath }) : t('design.brandNone')}</label>
        </fieldset>
        <button type="button" class="st-btn" id="design-edit-brand" onClick={() => { if (s.dialog.value?.kind !== 'brand') s.dialog.value = { kind: 'brand' }; }}>{t(d.brandPath && usingProject ? 'design.editBrand' : 'design.createBrand')}</button>
        {others?.length ? (
          <div class="st-design-copy">
            <label class="st-field-label" for="design-other">{t('design.otherBrand')}</label>
            <select id="design-other" value={other} onChange={(e) => setOther((e.target as HTMLSelectElement).value)}>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name ? `${o.name} (${o.title})` : o.title}</option>)}
            </select>
            <button type="button" class="st-btn" disabled={!other} onClick={() => void useBrandOf(other)}>{t('design.useBrand')}</button>
            {d.brandPath && usingProject ? <p class="st-field-help">{t('design.replaces', { file: '_brand.yml' })}</p> : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="design-words">
        <h3 class="st-insp-heading" id="design-words">{t('design.result')}</h3>
        {d.problems.length ? (
          <p class="st-note">{t('design.problems', { n: d.problems.length })} <button type="button" class="st-btn st-btn--small" onClick={() => showPanel('checks')}>{t('design.showChecks')}</button></p>
        ) : null}
        {d.notes.length ? <ul class="st-design-words">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          : <p class="st-field-help">{t('design.default')}</p>}
      </section>
    </div>
  );
}
