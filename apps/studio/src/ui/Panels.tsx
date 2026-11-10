/**
 * The Checks tab, one list (since 2.0.3): what must be fixed and what is advice, by place in the document
 * (heading › block), each item tagged with where it fails (the source, the web page and PDF, the slides, the Word
 * file), with its fixes, Guard's explanation in plain words, "Show in the preview" and a way to the text. The checks'
 * own numbers, as `libka check` reports them, are under Details. Also: the Outline's headings.
 */
import { blockTitle } from '@libka/editor';
import { plainText, type Block } from '@libka/model';
import { axeVersion } from 'studio:assets';
import type { Key } from '../i18n.ts';
import * as s from '../state/store.ts';
import { checksFilter, showEditor, showPanel } from '../state/layout.ts';
import { t } from '../state/text.ts';
import { bridge } from '../app/project.ts';
import { explain } from '../core/explain.ts';
import { forPlace, outputOf, placeAt, placesOf, type Group, type Item, type Output } from '../core/checklist.ts';
import { FixButtons } from './Inspector.tsx';
import { selectedLine } from './Visual.tsx';

const Empty = ({ text, ok = false }: { text: string; ok?: boolean }) => <p class={`st-empty${ok ? ' st-empty--ok' : ''}`}>{text}</p>;

export function goToLine(line: number): void {
  showEditor();
  bridge.editor?.goToLine(line);
}

/** Shows a finding in the preview: the right output and contrast, the slide it is on, outlined. */
function highlight(target: string, highContrast: boolean, output: s.Target): void {
  if (highContrast !== s.highContrast.value) s.highContrast.value = highContrast;
  if ((output === 'deck') !== (s.device.value === 'slides')) s.device.value = output === 'deck' ? 'slides' : 'web';
  showPanel('preview');
  const preview = document.getElementById('preview') as HTMLIFrameElement;
  const show = () => {
    const doc = preview.contentDocument!;
    let el: Element | null = null;
    try { el = doc.querySelector(target); } catch { /* not a CSS selector */ }
    if (!el) return;
    const frame = el.closest('.lk-deck-frame');
    const deck = (preview.contentWindow as Window & { libkaDeck?: { go(n: number): void } }).libkaDeck;
    if (frame && deck) deck.go(Array.from(doc.querySelectorAll('.lk-deck-frame')).indexOf(frame));
    if (!doc.getElementById('st-hl')) doc.head.append(Object.assign(doc.createElement('style'), { id: 'st-hl',
      textContent: '.st-highlight{outline:4px solid #B87A22!important;outline-offset:3px;scroll-margin:80px}' }));
    doc.querySelectorAll('.st-highlight').forEach((e) => e.classList.remove('st-highlight'));
    el.classList.add('st-highlight');
    el.scrollIntoView({ block: 'center' });
  };
  // the preview may reload for the switch: show it once it has
  setTimeout(() => { if (preview.contentDocument?.readyState === 'complete') show(); else preview.addEventListener('load', show, { once: true }); }, 50);
}

/**
 * Goes to the source of an element of the rendered page: the line holding the start of its text (the rendered text
 * drops the Markdown marks, so shorter and shorter runs of its first words are tried).
 */
function goToText(target: string): void {
  let text = '';
  try { text = (document.getElementById('preview') as HTMLIFrameElement).contentDocument?.querySelector(target)?.textContent ?? ''; } catch { /* not a selector */ }
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines = s.source.value.split('\n');
  for (let n = Math.min(5, words.length); n >= 1; n--) {
    const run = words.slice(0, n).join(' ');
    if (n === 1 && run.length < 4) break;
    const at = lines.findIndex((l) => l.includes(run));
    if (at >= 0) { goToLine(at + 1); return; }
  }
  s.toast(t('guard.notFound'));
}

/** A finding's rule in plain words. */
function Explained({ rule }: { rule: string }) {
  const e = explain(rule, s.lang.value);
  if (!e) return null;
  return (
    <div class="st-explain">
      <p><strong>{t('guard.why')}:</strong> {e.why}</p>
      <p><strong>{t('guard.how')}:</strong> {e.fix}</p>
    </div>
  );
}

/** What the place is called: its section and the block's name ("Before you start › Figure"). */
function placeTitle(p: Group['place']): string {
  if (p === 'document') return t('checks.document');
  if (p === 'unplaced') return t('checks.unplaced');
  const name = blockTitle(p.type, s.lang.value);
  if (p.type === 'heading') return p.section ?? name;
  return p.section ? `${p.section} › ${name}` : name;
}

const OUTPUT_KEY: Record<Output, Key> = { source: 'checks.outSource', web: 'checks.outWeb', slides: 'checks.outSlides', word: 'checks.outWord' };

function ItemRow({ item }: { item: Item }) {
  const where = item.line ? t('problems.line', { n: item.line }) : t('checks.whole');
  const finding = item.findings[0];
  const inPreview = item.findings.find((f) => f.target !== 'docx');
  const go = () => { if (item.line) goToLine(item.line); else if (inPreview) goToText(inPreview.selector); };
  return (
    <li class="st-item-row" data-kind={item.kind} data-rule={item.rule}>
      <button type="button" class="st-item" title={item.line ? t('problems.goto', { n: item.line }) : t('guard.goText')} onClick={go}>
        <span class="st-item-where">{where}</span>
        {/* the messages of the source checks and of Guard are English in both interfaces: marked so (WCAG 3.1.2) */}
        <span class="st-item-msg" lang="en">{item.message}</span>
        <span class="st-item-meta">
          <span class="st-item-kind">{t(item.kind === 'fix' ? 'checks.fix' : 'checks.advice')}</span>
          <span class="st-item-tags">{item.outputs.map((o) => t(OUTPUT_KEY[o])).join(' · ')}</span>
        </span>
      </button>
      {item.problems.map((p, i) => <FixButtons key={i} problem={p} />)}
      {finding ? <Explained rule={finding.rule} /> : null}
      {inPreview ? (
        <button type="button" class="st-btn st-btn--small st-showpreview" onClick={() => highlight(inPreview.selector, inPreview.mode === 'more-contrast', inPreview.target)}>{t('checks.show')}</button>
      ) : null}
    </li>
  );
}

const CHECK_TITLE: Record<string, Key> = { 'axe/standard': 'guard.axe', 'contrast/standard': 'guard.contrast', 'structure/standard': 'guard.structure', 'contrast/more-contrast': 'guard.contrastMore', 'docx/standard': 'guard.docx' };
const OUTPUT_TITLE: Record<s.Target, Key> = { manual: 'guard.manual', deck: 'guard.deck', docx: 'guard.word' };

/** Details: each output's checks with their numbers, as `libka check` reports them; a passing output stays folded. */
function Details() {
  const checks = s.checks.value;
  if (!checks) return null;
  const outputs = [...new Set(checks.map((c) => c.target))];
  return (
    <section class="st-checks-details" id="checks-details" aria-labelledby="checks-details-title">
      <h3 class="st-group" id="checks-details-title">{t('checks.details')}</h3>
      {outputs.map((target) => {
        const list = checks.filter((c) => c.target === target);
        const failing = list.filter((c) => c.violations.length).length;
        return (
          <details key={target} class="st-out" data-output={outputOf(target)} open={failing > 0}>
            <summary>
              <span class="st-out-name">{t(OUTPUT_TITLE[target])}</span>
              <span class="st-out-sum" data-ok={String(!failing)}>{failing ? t('checks.outFailing', { n: list.length, failing }) : t('checks.outPassed', { n: list.length })}</span>
            </summary>
            {list.map((c, i) => (
              <div key={i} class="st-check" data-ok={String(c.violations.length === 0)}>
                <div class="st-check-head">
                  <span class="st-check-mark" aria-hidden="true">{c.violations.length ? '✗' : '✓'}</span>
                  <h4 class="st-check-title">{t(CHECK_TITLE[`${c.id}/${c.mode}`]!, { v: axeVersion })}</h4>
                  <span class="st-check-sum">{t('guard.summary', { checked: c.checked, violations: c.violations.length }) + (c.skipped ? ` · ${t('guard.skipped', { n: c.skipped })}` : '')}</span>
                </div>
              </div>
            ))}
          </details>
        );
      })}
      <p class="st-note">{t('guard.signNote').split('libka build').flatMap((part, i) => (i ? [<code key={i}>libka build</code>, part] : [part]))}</p>
    </section>
  );
}

/** Checks: one list by place, with the filters All | This block. */
export function ChecksPanel() {
  const list = s.checklist.value;
  const filter = checksFilter.value;
  const places = placesOf(s.doc.value);
  const here = filter === 'block' ? (placeAt(places, selectedLine()) ?? 'document') : null;
  void s.selectionTick.value;
  const groups = filter === 'block' ? forPlace(list, here) : list.groups;
  const running = !s.checks.value;
  const summary = list.fix || list.advice
    ? [list.fix ? t('checks.toFix', { n: list.fix }) : '', list.advice ? t('checks.adviceCount', { n: list.advice }) : ''].filter(Boolean).join(' · ')
    : running ? '' : t('checks.nothing');
  return (
    <div class="st-checks">
      <div class="st-checks-bar">
        <div class="st-seg st-checks-filter" role="group" aria-label={t('checks.filter')}>
          <button type="button" id="checks-all" aria-pressed={filter === 'all'} onClick={() => { checksFilter.value = 'all'; }}>{t('checks.all')}</button>
          <button type="button" id="checks-block" aria-pressed={filter === 'block'} onClick={() => { checksFilter.value = 'block'; }}>{t('checks.thisBlock')}</button>
        </div>
        <p class="st-checks-sum" id="checks-sum">{summary}{running ? <span class="st-checks-running">{t(s.guardRunning.value ? 'guard.running' : 'guard.idle')}</span> : null}</p>
      </div>
      {filter === 'block' && here ? <p class="st-checks-here" id="checks-here">{placeTitle(here === 'document' ? 'document' : here)}</p> : null}
      <div id="checks-list">
        {groups.length ? groups.map((g) => (
          <section key={typeof g.place === 'string' ? g.place : g.place.index} class="st-checks-group" aria-label={placeTitle(g.place)}>
            {filter === 'all' ? <h3 class="st-checks-place">{placeTitle(g.place)}</h3> : null}
            <ul class="st-list">{g.items.map((item) => <ItemRow key={item.key} item={item} />)}</ul>
          </section>
        )) : <Empty text={t(filter === 'block' ? 'checks.nothingHere' : running ? 'checks.nothingYet' : 'checks.nothing')} ok={!running || filter === 'block'} />}
      </div>
      <Details />
    </div>
  );
}

function headings(blocks: Block[]): Extract<Block, { type: 'heading' }>[] {
  return blocks.flatMap((b) => b.type === 'heading' ? [b] : b.type === 'callout' ? headings(b.body) : []);
}

export function OutlinePanel() {
  const list = headings(s.doc.value?.blocks ?? []);
  if (!list.length) return <Empty text={t('outline.none')} />;
  const go = (h: Extract<Block, { type: 'heading' }>) => {
    (document.getElementById('preview') as HTMLIFrameElement).contentDocument?.getElementById(h.id)?.scrollIntoView({ block: 'start' });
    const text = plainText(h.text).slice(0, 20);
    const line = s.source.value.split('\n').findIndex((l) => new RegExp(`^#{${h.level}}\\s+`).test(l) && l.includes(text));
    if (line >= 0) goToLine(line + 1);
  };
  return (
    <ol class="st-outline">
      {list.map((h, i) => <li key={i} class={`lvl-${h.level}`}><button type="button" onClick={() => go(h)}>{plainText(h.text)}</button></li>)}
    </ol>
  );
}
