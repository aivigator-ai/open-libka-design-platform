/** The library: every project kept in this browser, with what can be done to each. */
import { registry } from '../state/commands.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import type { ProjectRecord } from '../storage/db.ts';
import { displayName } from '../storage/projects.ts';
import { duplicate, exportProjectZip, openProject, remove, rename } from '../app/project.ts';
import { CommandButton } from './TopBar.tsx';

/** "5 minutes ago", "yesterday", in the interface language. */
export function ago(time: number, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(s.lang.value, { numeric: 'auto' });
  const sec = Math.round((time - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 30], ['month', 12], ['year', Infinity]];
  let v = sec;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size || unit === 'year') return unit === 'second' && Math.abs(v) < 45 ? t('time.now') : rtf.format(v, unit);
    v = Math.round(v / size);
  }
  return '';
}

function Card({ p }: { p: ProjectRecord }) {
  const name = displayName(p);
  const current = s.project.value?.id === p.id;
  const hidden = <span class="st-visually-hidden">{`: ${name}`}</span>;
  return (
    <li class="st-card" data-current={current}>
      <h2 class="st-card-title">
        <button type="button" class="st-card-open" onClick={() => void openProject(p.id)} aria-describedby={`meta-${p.id}`}>{name}</button>
      </h2>
      <p class="st-card-meta" id={`meta-${p.id}`}>
        <span class="st-card-file">{p.name}</span>
        <span>{t('library.changed', { when: ago(p.updated) })}</span>
        {current ? <span class="st-card-badge">{t('library.open')}</span> : null}
      </p>
      <div class="st-card-actions" role="group" aria-label={t('library.actions', { name })}>
        <button type="button" onClick={() => void rename(p)}>{t('library.rename')}{hidden}</button>
        <button type="button" onClick={() => void duplicate(p)}>{t('library.duplicate')}{hidden}</button>
        <button type="button" onClick={() => void exportProjectZip(p)}>{t('library.zip')}{hidden}</button>
        <button type="button" class="st-danger" onClick={() => void remove(p)}>{t('library.delete')}{hidden}</button>
      </div>
    </li>
  );
}

export function Library() {
  const list = s.projects.value;
  return (
    <main class="st-library" id="library" aria-labelledby="library-title">
      <div class="st-library-head">
        <div>
          <h1 class="st-library-title" id="library-title" tabIndex={-1}>{t('library.title')}</h1>
          <p class="st-library-note">{t('library.note')}</p>
        </div>
        <div class="st-library-actions">
          {registry.menu('library').map((c, i) => <CommandButton key={c.id} id={c.id} class={i === 0 ? 'st-btn st-btn--primary' : 'st-btn'} />)}
        </div>
      </div>
      {s.storageError.value ? <p class="st-banner" role="alert">{t('library.noStorage')}</p> : null}
      {list.length ? <ul class="st-cards">{list.map((p) => <Card key={p.id} p={p} />)}</ul>
        : <p class="st-empty">{t('library.empty')}</p>}
    </main>
  );
}
