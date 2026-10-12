/** The side panel's tabs: source problems (with their fixes), Guard's checks (explained in plain words) and the outline. */
import { Fragment, type ComponentChildren } from 'preact';
import { plainText, type Block } from '@libka/model';
import { axeVersion } from 'studio:assets';
import type { Key } from '../i18n.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { bridge } from '../app/project.ts';
import { explain } from '../core/explain.ts';
import { FixButtons } from './Inspector.tsx';

function Item({ where, message, meta, title, onClick, children }: { where: string; message: string; meta: string; title: string; onClick(): void; children?: ComponentChildren }) {
  return (
    <li class="st-item-row">
      <button type="button" class="st-item" title={title} onClick={onClick}>
        {/* the messages of the source checks and of Guard are English in both interfaces: marked so (WCAG 3.1.2) */}
        <span class="st-item-where">{where}</span><span class="st-item-msg" lang="en">{message}</span><span class="st-item-meta">{meta}</span>
      </button>
      {children}
    </li>
  );
}
const Empty = ({ text, ok = false }: { text: string; ok?: boolean }) => <p class={`st-empty${ok ? ' st-empty--ok' : ''}`}>{text}</p>;

export function goToLine(line: number): void {
  s.pane.value = 'write';
  bridge.editor?.goToLine(line);
}

export function ProblemsPanel() {
  const list = s.problems.value;
  if (!list.length) return <Empty text={t('problems.none')} ok />;
  return (
    <ul class="st-list">
      {list.map((p, i) => (
        <Item key={i} where={t('problems.line', { n: p.line })} message={p.message} meta="" title={t('problems.goto', { n: p.line })} onClick={() => goToLine(p.line)}>
          <FixButtons problem={p} />
        </Item>
      ))}
    </ul>
  );
}

const CHECK_TITLE: Record<string, Key> = { 'axe/standard': 'guard.axe', 'contrast/standard': 'guard.contrast', 'structure/standard': 'guard.structure', 'contrast/more-contrast': 'guard.contrastMore', 'docx/standard': 'guard.docx' };
const GROUP_TITLE: Record<s.Target, Key> = { manual: 'guard.manual', deck: 'guard.deck', docx: 'guard.word' };

/** Shows a finding in the preview: the right output and contrast, the slide it is on, outlined. */
function highlight(target: string, highContrast: boolean, output: s.Target): void {
  if (highContrast !== s.highContrast.value) s.highContrast.value = highContrast;
  if ((output === 'deck') !== (s.device.value === 'slides')) s.device.value = output === 'deck' ? 'slides' : 'web';
  s.pane.value = 'preview';
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

/** Goes to the source line that holds the quoted text of a finding, such as a heading's. */
function findInSource(message: string): void {
  const quoted = message.match(/"([^"]{3,}?)…?"/)?.[1]?.replace(/…$/, '');
  const line = quoted ? s.source.value.split('\n').findIndex((l) => l.includes(quoted)) : -1;
  if (line >= 0) goToLine(line + 1); else s.pane.value = 'write';
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

/** A finding's rule in plain words, once per rule in a check. */
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

export function GuardPanel() {
  const checks = s.checks.value;
  if (!checks) return <Empty text={t(s.guardRunning.value ? 'guard.running' : 'guard.idle')} />;
  return (
    <>
      {checks.map((c, i) => (
        <Fragment key={i}>
          {c.target !== checks[i - 1]?.target ? <h3 class="st-group">{t(GROUP_TITLE[c.target])}</h3> : null}
          <section class="st-check" data-ok={String(c.violations.length === 0)}>
            <div class="st-check-head">
              <span class="st-check-mark" aria-hidden="true">{c.violations.length ? '✗' : '✓'}</span>
              <h4 class="st-check-title">{t(CHECK_TITLE[`${c.id}/${c.mode}`]!, { v: axeVersion })}</h4>
              <span class="st-check-sum">{t('guard.summary', { checked: c.checked, violations: c.violations.length }) + (c.skipped ? ` · ${t('guard.skipped', { n: c.skipped })}` : '')}</span>
            </div>
            {c.violations.length ? (
              <ul class="st-list">
                {c.violations.map((v, j) => {
                  const first = c.violations.findIndex((x) => x.rule === v.rule) === j;
                  return c.target === 'docx'
                    ? <Item key={j} where={v.rule} message={v.message} meta="" title={t('guard.showSource')} onClick={() => findInSource(v.message)}>{first ? <Explained rule={v.rule} /> : null}</Item>
                    : (
                      <Item key={j} where={v.rule} message={v.message} meta={v.target} title={t('guard.show')} onClick={() => highlight(v.target, c.mode === 'more-contrast', c.target)}>
                        {first ? <Explained rule={v.rule} /> : null}
                        <button type="button" class="st-btn st-btn--small st-gotext" onClick={() => goToText(v.target)}>{t('guard.goText')}</button>
                      </Item>
                    );
                })}
              </ul>
            ) : null}
          </section>
        </Fragment>
      ))}
      <p class="st-note">{t('guard.signNote').split('libka build').flatMap((part, i) => (i ? [<code key={i}>libka build</code>, part] : [part]))}</p>
    </>
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
