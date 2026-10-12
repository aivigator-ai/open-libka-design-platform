/** The history tab and the comparison of a version with the current text. */
import { Fragment } from 'preact';
import type { VersionRecord } from '../storage/db.ts';
import { KEEP_UNNAMED, unpack } from '../storage/versions.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { compare } from '../core/compare.ts';
import { restoreVersion, saveNamedVersion } from '../app/project.ts';

export const when = (time: number): string =>
  new Intl.DateTimeFormat(s.lang.value, { dateStyle: 'medium', timeStyle: 'short' }).format(time);

/** What a version is called in the list. */
export function versionName(v: VersionRecord): string {
  if (v.kind === 'named') return v.label;
  if (v.kind === 'auto') return t('history.auto');
  if (v.label.startsWith('restored:')) return t('history.restoredFrom', { when: when(Number(v.label.slice(9))) });
  const reason = ({ open: 'history.open', restore: 'history.beforeRestore', folder: 'history.beforeFolder' } as const)[v.label as 'open'];
  return reason ? t(reason) : t('history.safety');
}

export function HistoryPanel() {
  const list = s.versions.value;
  return (
    <div class="st-history">
      <button type="button" class="st-btn" id="save-version" onClick={() => void saveNamedVersion()}>{t('history.saveButton')}</button>
      <p class="st-note">{t('history.note', { n: KEEP_UNNAMED })}</p>
      {list.length ? (
        <ol class="st-versions" aria-label={t('history.listLabel')}>
          {list.map((v) => {
            const name = versionName(v);
            const hidden = <span class="st-visually-hidden">{`: ${name}, ${when(v.created)}`}</span>;
            return (
              <li key={v.id} class="st-version" data-kind={v.kind}>
                <p class="st-version-name">{name}{v.kind === 'named' ? <span class="st-version-tag">{t('history.named')}</span> : null}</p>
                <p class="st-version-meta"><time dateTime={new Date(v.created).toISOString()}>{when(v.created)}</time> · {t('history.chars', { n: v.size.toLocaleString(s.lang.value) })}</p>
                <div class="st-version-actions">
                  <button type="button" onClick={() => { s.dialog.value = { kind: 'compare', version: v }; }}>{t('history.compare')}{hidden}</button>
                  <button type="button" onClick={() => void restoreVersion(v)}>{t('history.restore')}{hidden}</button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : <p class="st-empty">{t('history.none')}</p>}
    </div>
  );
}

/** The version (left) beside the current text (right), changed lines marked in words as well as colour. */
export function Comparison({ version }: { version: VersionRecord }) {
  const { rows, added, removed } = compare(unpack(version), s.source.value);
  const cell = (side: { n: number; text: string } | null, mark: 'del' | 'add' | null) => side ? (
    <>
      <td class="st-diff-n">{side.n}</td>
      <td class={`st-diff-text${mark ? ` st-diff-${mark}` : ''}`}>
        {mark ? <><span class="st-diff-mark" aria-hidden="true">{mark === 'del' ? '−' : '+'}</span><span class="st-visually-hidden">{t(mark === 'del' ? 'compare.removed' : 'compare.added')}: </span></> : null}
        {side.text || ' '}
      </td>
    </>
  ) : <><td class="st-diff-n" /><td class="st-diff-text st-diff-none" /></>;
  return (
    <>
      <p class="st-compare-sum">{added || removed ? t('compare.summary', { added, removed }) : t('compare.same')}</p>
      <div class="st-compare-scroll" tabIndex={0} role="region" aria-label={t('compare.tableLabel')}>
        <table class="st-diff">
          <caption class="st-visually-hidden">{t('compare.caption', { name: versionName(version), when: when(version.created) })}</caption>
          <colgroup><col class="st-diff-ncol" /><col /><col class="st-diff-ncol" /><col /></colgroup>
          <thead><tr><th scope="col" colSpan={2}>{t('compare.version')}</th><th scope="col" colSpan={2}>{t('compare.current')}</th></tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={i}>
                {row.kind === 'fold' ? <tr class="st-diff-fold"><td colSpan={4}>{t('compare.folded', { n: row.count })}</td></tr>
                  : <tr>{cell(row.left, row.kind === 'change' ? 'del' : null)}{cell(row.right, row.kind === 'change' ? 'add' : null)}</tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
