/** The accessibility statement (Help → Accessibility): what the Studio meets, how it is checked, its limits, and how to report a barrier. */
import { counts, limits } from 'studio:audit';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';

export function AccessibilityStatement() {
  const applies = counts.supports + counts.partial + counts.not;
  return (
    <div class="st-a11y">
      <p>{t('a11y.goal')}</p>
      <p>{t('a11y.result', { supports: counts.supports, applies, na: counts.na })}</p>
      <h3 class="st-insp-heading">{t('a11y.howTitle')}</h3>
      <p>{t('a11y.how')}</p>
      <h3 class="st-insp-heading">{t('a11y.readersTitle')}</h3>
      <p>{t('a11y.readers')}</p>
      <h3 class="st-insp-heading">{t('a11y.limitsTitle')}</h3>
      <ul>{limits.map((l, i) => <li key={i}>{l[s.lang.value]}</li>)}</ul>
      <h3 class="st-insp-heading">{t('a11y.reportTitle')}</h3>
      <p>{t('a11y.report')}</p>
      <p class="st-field-help">{t('a11y.date')}</p>
    </div>
  );
}
