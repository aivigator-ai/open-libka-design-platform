/** About LibKa Studio (Help → About): the version, the licence, the third-party notices, the source, what happens to your documents, and in a hosted copy who provides it. */
import { about } from 'studio:about';
import { lang } from '../state/store.ts';
import { t } from '../state/text.ts';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function AboutStudio() {
  const h = about.hosted;
  return (
    <div class="st-about">
      <p><strong>{t('about.version', { v: about.version })}</strong></p>
      <p>{t('about.licence')}</p>
      <ul class="st-about-links">
        <li><a href={about.source ? `${about.source}/blob/main/LICENSE` : 'https://www.apache.org/licenses/LICENSE-2.0'} hreflang="en" {...external}>{t('about.licenceLink')}</a></li>
        {about.source ? <li><a href={about.source} {...external}>{t('about.source')}</a></li> : null}
        <li><a href="THIRD-PARTY-NOTICES.txt" hreflang="en" {...external}>{t('about.notices')}</a></li>
      </ul>
      <p class="st-field-help">{t('about.noticesText')}</p>
      <h3 class="st-insp-heading">{t('about.privacyTitle')}</h3>
      <p>{t('about.privacy')}</p>
      {h ? <>
        <h3 class="st-insp-heading">{t('about.hostedTitle')}</h3>
        <p>{t('about.hosted', { by: h.by })}</p>
        <ul class="st-about-links">
          {h.siteUrl ? <li><a href={`${h.siteUrl}/`} {...external}>{t('about.site')}</a></li> : null}
          {h.imprintUrl ? <li><a href={h.imprintUrl[lang.value]} {...external}>{t('about.imprint')}</a></li> : null}
          {h.privacyUrl ? <li><a href={h.privacyUrl[lang.value]} {...external}>{t('about.privacyPolicy')}</a></li> : null}
        </ul>
      </> : null}
    </div>
  );
}
