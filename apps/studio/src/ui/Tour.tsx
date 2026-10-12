/**
 * The guided tour: a few steps over the real Studio, each pointing at the part it explains (outlined). It starts on
 * the first visit and again from Help; it can be skipped at any step (Escape, or "Skip the tour") and ends by offering
 * the tutorial. It is a non-modal dialog: the Studio stays usable, the focus moves to each step's heading, and the
 * buttons are in reading order. On a narrow screen, a part that is not shown is explained from the middle.
 */
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { Key } from '../i18n.ts';
import { registry } from '../state/commands.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { bridge } from '../app/project.ts';

interface TourStep { target: string | null; title: Key; text: Key }

const STEPS: TourStep[] = [
  { target: null, title: 'tour.welcome', text: 'tour.welcomeText' },
  { target: '.st-mode', title: 'tour.modes', text: 'tour.modesText' },
  { target: '#editor', title: 'tour.editor', text: 'tour.editorText' },
  { target: '.st-blocks', title: 'tour.blocks', text: 'tour.blocksText' },
  { target: '.st-preview-pane', title: 'tour.preview', text: 'tour.previewText' },
  { target: '.st-panel .st-tabs', title: 'tour.panel', text: 'tour.panelText' },
  { target: '#status-chip', title: 'tour.status', text: 'tour.statusText' },
  { target: '#file-menu', title: 'tour.file', text: 'tour.fileText' },
  { target: null, title: 'tour.palette', text: 'tour.paletteText' },
];

/** The step shown (null: no tour). */
export const tourStep = signal<number | null>(null);

export function startTour(): void {
  s.view.value = s.project.value ? 'editor' : s.view.value;
  tourStep.value = 0;
}

/** The tour starts by itself once, on the first visit to the Studio. */
export function firstVisitTour(): void {
  if (s.prefs.get('toured')) return;
  startTour();
}

function end(): void {
  tourStep.value = null;
  s.prefs.set('toured', '1');
  document.querySelectorAll('.st-tour-target').forEach((el) => el.classList.remove('st-tour-target'));
  bridge.editor?.focus();
}

/* placed by a generated stylesheet rule (the Studio writes no style attributes) */
const placement = typeof document !== 'undefined' ? document.head.appendChild(document.createElement('style')) : null;

export function Tour() {
  const i = tourStep.value;
  const heading = useRef<HTMLHeadingElement>(null);
  const step = i === null ? null : STEPS[i]!;
  useEffect(() => {
    if (!step) return;
    document.querySelectorAll('.st-tour-target').forEach((el) => el.classList.remove('st-tour-target'));
    const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    const shown = el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    if (placement) {
      if (shown) {
        el.classList.add('st-tour-target');
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        const width = Math.min(360, innerWidth - 32);
        // a large part (the editor, the preview) gets the card inside its top corner; a small one, below or above it
        const large = r.height > innerHeight / 2;
        const below = r.bottom + 12 + 220 < innerHeight;
        const top = large ? r.top + 16 : below ? r.bottom + 12 : Math.max(16, r.top - 12 - 220);
        const left = Math.max(16, Math.min(large ? r.right - width - 16 : r.left, innerWidth - width - 16));
        placement.textContent = `#st-tour{left:${Math.round(left)}px;top:${Math.round(Math.min(top, innerHeight - 240))}px}`;
      } else placement.textContent = '#st-tour{left:50%;top:30%;transform:translateX(-50%)}';
    }
    heading.current?.focus();
  }, [i]);
  if (!step || i === null) return null;
  const last = i === STEPS.length - 1;
  return (
    <div class="st-tour" id="st-tour" role="dialog" aria-modal="false" aria-labelledby="st-tour-title" aria-describedby="st-tour-text"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); end(); } }}>
      <p class="st-tour-count">{t('tour.count', { n: i + 1, total: STEPS.length })}</p>
      <h2 class="st-tour-title" id="st-tour-title" tabIndex={-1} ref={heading}>{t(step.title)}</h2>
      <p class="st-tour-text" id="st-tour-text">{t(step.text)}</p>
      <div class="st-tour-actions">
        {i > 0 ? <button type="button" class="st-btn st-btn--small" onClick={() => { tourStep.value = i - 1; }}>{t('tour.back')}</button> : null}
        {last ? <>
          <button type="button" class="st-btn st-btn--small st-btn--primary" onClick={() => { end(); void registry.run('tutorial.open'); }}>{t('tour.tutorial')}</button>
          <button type="button" class="st-btn st-btn--small" onClick={end}>{t('tour.finish')}</button>
        </> : <>
          <button type="button" class="st-btn st-btn--small st-btn--primary" onClick={() => { tourStep.value = i + 1; }}>{t(i === 0 ? 'tour.start' : 'tour.next')}</button>
          <button type="button" class="st-btn st-btn--small st-tour-skip" onClick={end}>{t('tour.skip')}</button>
        </>}
      </div>
    </div>
  );
}
