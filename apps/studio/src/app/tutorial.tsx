/**
 * The tutorial, a registered extension: a learn-by-doing document (in the interface language) and its Tutorial tab,
 * whose steps tick themselves as the author does them and the checks pass. It ends when the document is ready to
 * publish and has been exported. What the text shows is read from the document each time; what the author did (used
 * Split or Source, opened the palette, exported) is kept per document in this browser.
 */
import { effect, signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Key } from '../i18n.ts';
import { registry, type Extension } from '../state/commands.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { openTutorial } from './project.ts';
import { startTour } from '../ui/Tour.tsx';

/** What the author did in each tutorial document, by project id. */
const done = signal<Readonly<Record<string, string[]>>>((() => {
  try { return JSON.parse(s.prefs.get('tutorial') ?? '{}') as Record<string, string[]>; } catch { return {}; }
})());

const isTutorial = () => s.project.value?.origin === 'tutorial';

function mark(what: string): void {
  const id = s.project.value?.id;
  if (!id || !isTutorial() || done.value[id]?.includes(what)) return;
  done.value = { ...done.value, [id]: [...(done.value[id] ?? []), what] };
  s.prefs.set('tutorial', JSON.stringify(done.value));
}
const did = (what: string) => Boolean(s.project.value && done.value[s.project.value.id]?.includes(what));

const has = (code: string) => s.problems.value.some((p) => p.code === code);
const FIRST_TITLES = ['My first LibKa document', 'Můj první dokument v LibKa'];
/** LibKa's own blocks (not headings, paragraphs, lists, figures or code) at the top level of the document. */
const libkaBlocks = () => (s.doc.value?.blocks ?? []).filter((b) => !['heading', 'paragraph', 'list', 'figure', 'code', 'blockquote'].includes(b.type)).length;

interface Step { id: string; title: Key; help: Key; done(): boolean }

export const STEPS: Step[] = [
  { id: 'title', title: 'tut.title', help: 'tut.titleHelp', done: () => { const title = s.doc.value?.meta.title?.trim(); return Boolean(title) && !FIRST_TITLES.includes(title!); } },
  { id: 'fix', title: 'tut.fix', help: 'tut.fixHelp', done: () => !has('block-unknown') && /^:{3,}callout\[/m.test(s.source.value) },
  { id: 'picture', title: 'tut.picture', help: 'tut.pictureHelp', done: () => /!\[[^\]]+\]\(images\/lighthouse\.svg "[^"]+"\)/.test(s.source.value) && !has('image-alt') && !has('image-caption') },
  { id: 'section', title: 'tut.section', help: 'tut.sectionHelp', done: () => (s.source.value.match(/^## \S/gm) ?? []).length >= 4 },
  { id: 'block', title: 'tut.block', help: 'tut.blockHelp', done: () => libkaBlocks() >= 2 },
  { id: 'mode', title: 'tut.mode', help: 'tut.modeHelp', done: () => did('mode') },
  { id: 'palette', title: 'tut.palette', help: 'tut.paletteHelp', done: () => did('palette') },
  { id: 'ready', title: 'tut.ready', help: 'tut.readyHelp', done: () => s.status.value === 'ready' },
  { id: 'export', title: 'tut.export', help: 'tut.exportHelp', done: () => did('export') },
];

function TutorialPanel() {
  const states = STEPS.map((step) => step.done());
  const count = states.filter(Boolean).length;
  // a step that has just been done is announced
  const before = useRef<boolean[] | null>(null);
  useEffect(() => {
    const prev = before.current;
    before.current = states;
    if (!prev) return;
    const now = STEPS.find((step, i) => states[i] && !prev[i]);
    if (now) { s.announcement.value = ''; requestAnimationFrame(() => { s.announcement.value = t('tut.stepDone', { name: t(now.title) }); }); }
  });
  const all = count === STEPS.length;
  return (
    <div class="st-tutorial">
      <p class="st-tutorial-progress" id="tutorial-progress">{t('tut.progress', { n: count, total: STEPS.length })}</p>
      <ol class="st-tutorial-steps" aria-describedby="tutorial-progress">
        {STEPS.map((step, i) => (
          <li key={step.id} class="st-tutorial-step" data-step={step.id} data-done={String(states[i])}>
            <span class="st-tutorial-mark" aria-hidden="true">{states[i] ? '✓' : i + 1}</span>
            <span class="st-tutorial-text">
              <span class="st-tutorial-title">{t(step.title)}<span class="st-visually-hidden">{states[i] ? ` (${t('tut.done')})` : ` (${t('tut.open')})`}</span></span>
              <span class="st-tutorial-help">{t(step.help)}</span>
            </span>
          </li>
        ))}
      </ol>
      {all ? <p class="st-tutorial-finished" role="status">{t('tut.finished').split('libka build').flatMap((part, i) => (i ? [<code key={i}>libka build</code>, part] : [part]))}</p> : null}
    </div>
  );
}

export const tutorial: Extension = {
  id: 'core.tutorial',
  commands: [
    { id: 'tutorial.open', title: 'tut.openCommand', run: async () => { await openTutorial(); s.panelTab.value = 'tutorial'; } },
    { id: 'tour.start', title: 'tour.startCommand', run: () => startTour() },
    { id: 'a11y.open', title: 'a11y.title', run: () => { s.dialog.value = { kind: 'accessibility' }; } },
    { id: 'about.open', title: 'about.title', run: () => { s.dialog.value = { kind: 'about' }; } },
  ],
  menu: [
    { menu: 'help', command: 'tour.start', order: 10 },
    { menu: 'help', command: 'tutorial.open', order: 20 },
    { menu: 'help', command: 'palette.open', order: 30 },
    { menu: 'help', command: 'keys.open', order: 40 },
    { menu: 'help', command: 'a11y.open', order: 50 },
    { menu: 'help', command: 'about.open', order: 60 },
  ],
  panels: [{ id: 'tutorial', title: 'tut.tab', order: 5, visible: isTutorial, render: () => <TutorialPanel /> }],
};

/** Hears what the author does in a tutorial document. */
export function watchTutorial(): void {
  registry.onRun((id) => {
    if (!isTutorial()) return;
    if (id === 'palette.open') mark('palette');
    // exported once it was ready to publish
    if (['export.html', 'export.print', 'export.docx', 'export.deck'].includes(id) && s.status.value === 'ready') mark('export');
  });
  effect(() => { if (isTutorial() && s.shownMode.value !== 'visual') mark('mode'); });
}
