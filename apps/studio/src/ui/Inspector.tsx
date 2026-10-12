/**
 * The Inspector: the selected block as an object with properties, in sections (Required for accessibility, Content,
 * Settings, Appearance, Problems, Actions), its controls chosen by the kind of each value; and, with "Document"
 * chosen in the path, the document's own properties (its front matter). Text inside a block is edited in place.
 */
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import { blockInfo, BlockSelection, changeType, conversionsFor, inlineText, isFigure, objectRange, schema, selectedObject, type BlockInfo, type LocalAttribute } from '@libka/editor';
import { OUTPUTS, outputsOf, type Problem } from '@libka/model';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import { bridge, currentText } from '../app/project.ts';
import { frontMatter, withField } from '../core/frontmatter.ts';
import { blockItems, visual } from './Visual.tsx';
import { applyQuickFix, fixLabel } from '../app/fixes.ts';

const APPEARANCE = new Set(['variant', 'theme', 'layout', 'break', 'style']);

function Section({ id, title, children }: { id: string; title: string; children: ComponentChildren }) {
  return (
    <section class="st-insp-section" aria-labelledby={`insp-${id}`}>
      <h3 class="st-insp-heading" id={`insp-${id}`}>{title}</h3>
      {children}
    </section>
  );
}

/** One property: a label, the control its kind calls for, the registry's help, and "Required" in words. */
function Field({ id, label, spec, value, files, onCommit }: {
  id: string; label: string; spec: LocalAttribute | undefined; value: string | undefined; files: string[]; onCommit(v: string | null): void;
}) {
  // a value's label in the interface language (the value itself is what the Markdown says)
  const named = (v: string) => spec?.labels?.[v] ?? v;
  const required = Boolean(spec?.required);
  const missing = required && !value;
  const help = spec?.description;
  const describedBy = [help ? `${id}-help` : '', missing ? `${id}-req` : ''].filter(Boolean).join(' ') || undefined;
  const common = { id, 'aria-describedby': describedBy, 'aria-invalid': missing ? 'true' as const : undefined };
  let control: ComponentChildren;
  if (spec?.kind === 'flag') {
    control = <input {...common} type="checkbox" role="switch" checked={value !== undefined} onChange={(e) => onCommit(e.currentTarget.checked ? '' : null)} />;
  } else if (spec?.values && spec.values.length <= 4) {
    control = (
      <div class="st-segmented" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
        {spec.values.map((v) => (
          <label key={v} class="st-seg-option">
            <input type="radio" name={id} value={v} checked={value === v} onChange={() => onCommit(v)} />
            <span>{named(v)}</span>
          </label>
        ))}
        {!required && value ? <button type="button" class="st-seg-clear" onClick={() => onCommit(null)}>{t('insp.clear')}</button> : null}
      </div>
    );
  } else if (spec?.values) {
    control = (
      <select {...common} value={value ?? ''} onChange={(e) => onCommit(e.currentTarget.value || null)}>
        {required ? null : <option value="">{t('insp.none')}</option>}
        {spec.values.map((v) => <option key={v} value={v}>{named(v) === v ? v : `${named(v)} (${v})`}</option>)}
      </select>
    );
  } else if (spec?.kind === 'date') {
    control = <input {...common} type="date" value={value ?? ''} onChange={(e) => onCommit(e.currentTarget.value || null)} />;
  } else {
    control = (
      <>
        <input {...common} type="text" value={value ?? ''} list={spec?.kind === 'file' || spec?.kind === 'link' ? `${id}-files` : undefined}
          spellcheck={spec?.kind ? false : undefined} onChange={(e) => onCommit(e.currentTarget.value.trim() === '' ? null : e.currentTarget.value)} />
        {spec?.kind === 'file' || spec?.kind === 'link' ? <datalist id={`${id}-files`}>{files.map((f) => <option key={f} value={f} />)}</datalist> : null}
      </>
    );
  }
  const isGroup = Boolean(spec?.values && spec.values.length <= 4 && spec.kind !== 'flag');
  return (
    <div class="st-field-row" data-kind={spec?.kind ?? (spec?.values ? 'choice' : 'text')}>
      {isGroup ? <span class="st-field-label" id={`${id}-label`}>{label}</span> : <label class="st-field-label" for={id} id={`${id}-label`}>{label}</label>}
      {control}
      {missing ? <span class="st-field-required" id={`${id}-req`}>{t('insp.required')}</span> : null}
      {help ? <span class="st-field-help" id={`${id}-help`}>{help}</span> : null}
    </div>
  );
}

/** Changes a node at `pos` (attributes, or a directive's settings) as one step. */
function setAttrs(pos: number, attrs: Record<string, unknown>): void {
  const v = visual.editor;
  if (!v) return;
  const node = v.view.state.doc.nodeAt(pos);
  if (!node) return;
  const sel = v.view.state.selection;
  const tr = v.view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, ...attrs });
  // the object stays selected while its properties change (replacing an inline node would move the selection off it)
  if (sel instanceof NodeSelection && sel.from === pos) tr.setSelection(NodeSelection.create(tr.doc, pos));
  v.view.dispatch(tr);
}

/** The path from the document to the selected block, each step selectable. */
function Path({ pos }: { pos: number }) {
  const v = visual.editor!;
  const $pos = v.view.state.doc.resolve(pos);
  const steps: { title: string; at: number | null }[] = [{ title: t('insp.document'), at: null }];
  for (let d = 1; d <= $pos.depth; d++) {
    const n = $pos.node(d);
    if (['directive', 'blockquote', 'bullet_list', 'ordered_list', 'list_item', 'footnote_definition'].includes(n.type.name)) steps.push({ title: blockInfo(n, $pos.node(d - 1), s.lang.value).title, at: $pos.before(d) });
  }
  return (
    <nav class="st-insp-path" aria-label={t('insp.path')}>
      <ol>
        {steps.map((st, i) => (
          <li key={i}>
            <button type="button" onClick={() => {
              if (st.at === null) { documentAt.value = s.selectionTick.value; return; }
              v.view.dispatch(v.view.state.tr.setSelection(NodeSelection.create(v.view.state.doc, st.at)).scrollIntoView());
            }}>{st.title}</button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** "Document" chosen in the path: its properties show until the selection changes (the tick it was chosen at). */
const documentAt = signal<number | null>(null);
/** Shows the document's properties (a fix that needs one of them filled in). */
export function showDocument(): void { documentAt.value = s.selectionTick.value; }

function DocumentProperties() {
  const source = s.source.value;
  const fm = frontMatter(source);
  const meta = s.doc.value?.meta;
  if (fm === null) return <p class="st-empty">{t('insp.yamlError')}</p>;
  const set = (key: string, value: string | string[] | null) => {
    const text = currentText();
    const next = withField(text, key, value);
    if (next !== null && next !== text) bridge.editor?.replaceAll(next);
  };
  const str = (k: string) => (fm[k] === undefined || fm[k] === null ? undefined : String(fm[k]));
  const fields: [string, LocalAttribute][] = [
    ['title', { description: t('doc.titleHelp'), required: true }],
    ['subtitle', { description: t('doc.subtitleHelp') }],
    ['lang', { description: t('doc.langHelp'), required: true, values: ['en', 'cs'] }],
    ['version', { description: t('doc.versionHelp') }],
    ['date', { description: t('doc.dateHelp'), kind: 'date' }],
    ['status', { description: t('doc.statusHelp') }],
    ['owner', { description: t('doc.ownerHelp') }],
    ['reviewed', { description: t('doc.reviewedHelp'), kind: 'date' }],
    ['next-review', { description: t('doc.nextReviewHelp'), kind: 'date' }],
  ];
  const want = outputsOf(meta ?? {});
  return (
    <div class="st-inspector" data-target="document">
      <header class="st-insp-head"><h3 class="st-insp-title">{t('insp.documentTitle')}</h3><p class="st-insp-sub">{t('insp.documentNote')}</p></header>
      <Section id="doc-main" title={t('insp.content')}>
        {fields.map(([k, spec]) => <Field key={k} id={`docprop-${k}`} label={k} spec={spec} value={str(k)} files={[]} onCommit={(v) => set(k, v)} />)}
      </Section>
      <Section id="doc-outputs" title={t('outputs.title')}>
        <fieldset class="st-checks">
          <legend class="st-visually-hidden">{t('outputs.title')}</legend>
          {OUTPUTS.map((o) => (
            <label key={o}><input type="checkbox" checked={want.includes(o)} onChange={(e) => {
              const on = new Set(want);
              if (e.currentTarget.checked) on.add(o); else on.delete(o);
              if (!e.currentTarget.checked && o === 'web') { on.delete('pdf'); on.delete('docx'); }
              if (e.currentTarget.checked && (o === 'pdf' || o === 'docx')) on.add('web');
              if (!on.size) { e.currentTarget.checked = true; return; }
              set('outputs', OUTPUTS.filter((x) => on.has(x)));
            }} /> {t(`outputs.${o}`)}</label>
          ))}
        </fieldset>
      </Section>
    </div>
  );
}

/** Problems of the top-level block a position is in. */
function problemsAt(pos: number): Problem[] {
  const v = visual.editor!;
  const index = v.view.state.doc.resolve(pos).index(0);
  const { text, ranges } = v.current();
  const r = ranges[index];
  if (!r) return [];
  const lineOf = (o: number) => text.slice(0, o).split('\n').length;
  const [a, b] = [lineOf(r.from), lineOf(Math.max(r.from, r.to - 1))];
  return s.problems.value.filter((p) => p.line >= a && p.line <= b);
}

function BlockProperties({ node, parent, pos, info }: { node: PMNode; parent: PMNode; pos: number; info: BlockInfo }) {
  const v = visual.editor!;
  const files = [...s.files.value.keys()];
  const conversions = conversionsFor(node, s.lang.value);
  const [, rerender] = useState(0);
  const directive = node.type === schema.nodes.directive || node.type === schema.nodes.leaf_directive;
  const attrs = (directive ? node.attrs.attributes : {}) as Record<string, string>;
  const setAttr = (k: string, value: string | null) => {
    const next = { ...attrs };
    if (value === null) delete next[k]; else next[k] = value;
    setAttrs(pos, { attributes: next });
  };
  const specs = Object.entries(info.attributes);
  const unknown = Object.keys(attrs).filter((k) => !(k in info.attributes));
  const required = specs.filter(([, sp]) => sp.required);
  const appearance = specs.filter(([k, sp]) => !sp.required && APPEARANCE.has(k));
  const settings = specs.filter(([k, sp]) => !sp.required && !APPEARANCE.has(k));
  const figure = isFigure(node) ? node.firstChild! : null;
  const label = node.type === schema.nodes.directive && node.firstChild?.type === schema.nodes.directive_label ? node.firstChild : null;
  const problems = problemsAt(pos);
  const field = (k: string, sp: LocalAttribute | undefined) => <Field key={k} id={`attr-${k}`} label={k} spec={sp} value={attrs[k]} files={files} onCommit={(val) => setAttr(k, val)} />;
  return (
    <div class="st-inspector" data-target={info.key}>
      <header class="st-insp-head">
        <h3 class="st-insp-title">{info.title}</h3>
        {info.summary ? <p class="st-insp-sub">{info.summary}</p> : null}
        <Path pos={pos} />
        {conversions.length ? (
          <div class="st-field-row">
            <label class="st-field-label" for="insp-type">{t('block.changeType')}</label>
            <select id="insp-type" value="" onChange={(e) => { const key = e.currentTarget.value; if (key) v.run(changeType(key)); rerender((x) => x + 1); }}>
              <option value="">{info.title}</option>
              {conversions.map((c) => <option key={c.key} value={c.key}>{c.lost.length ? `${c.title} (${t('block.loses', { what: c.lost.join(', ') })})` : c.title}</option>)}
            </select>
          </div>
        ) : null}
      </header>
      {figure || required.length || info.labelRequired ? (
        <Section id="required" title={t('insp.requiredSection')}>
          {figure ? <>
            <Field id="img-alt" label={t('insp.alt')} spec={{ description: t('insp.altHelp'), required: true }} value={figure.attrs.alt || undefined} files={files} onCommit={(val) => setAttrs(pos + 1, { alt: val ?? '' })} />
            <Field id="img-caption" label={t('insp.caption')} spec={{ description: t('insp.captionHelp'), required: true }} value={figure.attrs.title || undefined} files={files} onCommit={(val) => setAttrs(pos + 1, { title: val })} />
            <Field id="img-src" label={t('insp.file')} spec={{ description: t('insp.fileHelp'), required: true, kind: 'file' }} value={figure.attrs.src} files={files} onCommit={(val) => setAttrs(pos + 1, { src: val ?? '' })} />
          </> : null}
          {required.map(([k, sp]) => field(k, sp))}
          {info.labelRequired && !label?.textContent && node.type === schema.nodes.directive ? <p class="st-field-required">{t('insp.titleRequired')}</p> : null}
        </Section>
      ) : null}
      {(() => {
        const content: ComponentChildren[] = [];
        if (node.type === schema.nodes.heading) content.push(
          <div class="st-field-row" key="level"><label class="st-field-label" for="insp-level">{t('insp.level')}</label>
            <select id="insp-level" value={String(node.attrs.level)} onChange={(e) => setAttrs(pos, { level: Number(e.currentTarget.value) })}>{[1, 2, 3, 4].map((l) => <option key={l} value={l}>{l}</option>)}</select></div>);
        if (node.type === schema.nodes.code_block) content.push(<Field key="lang" id="insp-lang" label={t('insp.language')} spec={{ description: t('insp.languageHelp') }} value={node.attrs.lang ?? undefined} files={[]} onCommit={(val) => setAttrs(pos, { lang: val })} />);
        if (node.type === schema.nodes.ordered_list) content.push(<Field key="start" id="insp-start" label={t('insp.start')} spec={{ description: t('insp.startHelp') }} value={String(node.attrs.start)} files={[]} onCommit={(val) => setAttrs(pos, { start: Math.max(0, Number(val) || 1) })} />);
        if (node.type === schema.nodes.list_item && node.attrs.checked !== null) content.push(
          <div class="st-field-row" key="done"><label class="st-field-label" for="insp-done">{t('insp.done')}</label>
            <input id="insp-done" type="checkbox" role="switch" checked={node.attrs.checked} onChange={(e) => setAttrs(pos, { checked: e.currentTarget.checked })} /></div>);
        return content.length ? <Section id="content" title={t('insp.content')}>{content}</Section> : null;
      })()}
      {settings.length || unknown.length ? <Section id="settings" title={t('insp.settings')}>{settings.map(([k, sp]) => field(k, sp))}{unknown.map((k) => field(k, undefined))}</Section> : null}
      {appearance.length ? <Section id="appearance" title={t('insp.appearance')}>{appearance.map(([k, sp]) => field(k, sp))}</Section> : null}
      <Section id="problems" title={t('insp.problems')}>
        {problems.length ? <ul class="st-insp-problems">{problems.map((p, i) => <li key={i}>{p.message}<FixButtons problem={p} /></li>)}</ul> : <p class="st-empty st-empty--ok">{t('insp.noProblems')}</p>}
      </Section>
      <Actions />
    </div>
  );
}

/** A problem's fixes as buttons (none when it has no safe fix). */
export function FixButtons({ problem }: { problem: Problem }) {
  if (!problem.fixes?.length) return null;
  return (
    <span class="st-fixes" role="group" aria-label={t('fix.forProblem', { n: problem.line })}>
      {problem.fixes.map((f, i) => (
        <button key={i} type="button" class="st-btn st-btn--small st-fix" data-fix={f.kind} onClick={() => applyQuickFix(problem, f)}>{fixLabel(f)}</button>
      ))}
    </span>
  );
}

/** Variants of an inline badge (registry: neutral, info, success, warning, error, ai). */
const BADGE_VARIANTS = ['neutral', 'info', 'success', 'warning', 'error', 'ai'];

/** A selected key or badge inside text: its label and, for a badge, its meaning. */
function InlineProperties({ node, pos }: { node: PMNode; pos: number }) {
  const def = inlineText(node.attrs.name, s.lang.value);
  const attrs = node.attrs.attributes as Record<string, string>;
  return (
    <div class="st-inspector" data-target={node.attrs.name}>
      <header class="st-insp-head">
        <h3 class="st-insp-title">{def?.title ?? node.attrs.name}</h3>
        {def ? <p class="st-insp-sub">{def.summary}</p> : null}
      </header>
      <Section id="content" title={t('insp.content')}>
        <Field id="inline-label" label="label" spec={{ description: def?.summary ?? '', required: true }} value={node.attrs.label ?? undefined} files={[]}
          onCommit={(v) => setAttrs(pos, { label: v ?? '' })} />
        {node.attrs.name === 'badge' ? <Field id="inline-variant" label="variant" spec={{ description: t('insp.badgeHelp'), values: BADGE_VARIANTS }} value={attrs.variant}
          files={[]} onCommit={(v) => { const next = { ...attrs }; if (v === null) delete next.variant; else next.variant = v; setAttrs(pos, { attributes: next }); }} /> : null}
      </Section>
    </div>
  );
}

function Actions() {
  const items = blockItems().filter((i) => !i.sub && i.id !== 'properties');
  return (
    <Section id="actions" title={t('insp.actions')}>
      <div class="st-insp-actions">
        {items.map((i) => <button key={i.id} type="button" class={`st-btn st-btn--small${i.id === 'delete' ? ' st-btn--danger-outline' : ''}`} aria-disabled={i.disabled ? 'true' : undefined} onClick={() => { if (!i.disabled) i.run?.(); }}>{i.label}</button>)}
      </div>
    </Section>
  );
}

export function InspectorPanel() {
  void s.selectionTick.value;
  const v = visual.editor;
  if (s.shownMode.value === 'source' || !v) return <><DocumentProperties /><p class="st-note">{t('insp.sourceNote')}</p></>;
  const state = v.view.state;
  const sel = state.selection;
  if (sel instanceof BlockSelection) {
    const r = objectRange(state)!;
    return (
      <div class="st-inspector" data-target="many">
        <header class="st-insp-head"><h3 class="st-insp-title">{t('insp.many', { n: r.end - r.start })}</h3></header>
        <Actions />
      </div>
    );
  }
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.inline_directive && documentAt.value !== s.selectionTick.value) {
    return <InlineProperties node={sel.node} pos={sel.from} />;
  }
  const o = selectedObject(state);
  if (documentAt.value === s.selectionTick.value || !o || o.node.type === schema.nodes.front_matter) return <DocumentProperties />;
  return <BlockProperties node={o.node} parent={o.parent} pos={o.pos} info={blockInfo(o.node, o.parent, s.lang.value)} />;
}
