/**
 * Renders a LibKa document as a deck: one self-contained HTML file with 16:9 slides.
 *
 * Slides come from the headings, so the same Markdown gives the manual and the deck:
 *   title slide    front matter (title, subtitle, version, date) plus anything before the first ##
 *   section slide  every ##, with the content that follows it (a ## with no content is a divider)
 *   content slide  every ###, tagged with its section
 *   ####           stays inside its slide as a subheading
 *   :::notes       speaker notes of the slide it is in; never shown on the slide
 */
import { plainText, type Block, type Inline, type LibkaDocument } from '@libka/model';
import type { DeckLabels } from './deck-runtime.ts';
import { DECK_RUNTIME } from './runtimes.ts';
import { block, context, docInfo, escapeHtml, inline, notesList, NOTES_ID, referencesList, REFERENCES_ID, releaseBlock, runtimeScript, statusItems, tocBlock, summary, uiStageCss, usesUi, type ManualStyles, type RenderContext } from './index.ts';
import { fill, LABELS as LABELS_, langOf } from './labels.ts';
import { typeset } from './typography.ts';
import { withCsp } from './csp.ts';

export interface Slide {
  kind: 'title' | 'section' | 'content';
  /** Small label above the heading: the section number or the section name. */
  tag: string;
  heading: Inline | string;
  /** Heading id from the document, so in-page links (#id) find their slide. */
  id?: string;
  body: Block[];
  notes: Block[];
  /** A :::section part divider (full-bleed section slide). */
  part?: boolean;
  /** A slide of its own for a :::summary or :::toc; the slide heading names the block. */
  lead?: boolean;
  /** The Notes or References slide at the end (or where :::references stands). */
  end?: 'notes' | 'references';
  /** Position in slides() before continuation slides were added, and which part of it this is (0 = the slide itself). */
  base?: number;
  continued?: number;
  /** Shrink level when the content overflows a little: 95, 90 or 85 (percent). */
  fit?: number;
}

export interface DeckStyles extends Omit<ManualStyles, 'manual'> {
  /** deck.css from this package. */
  deck: string;
}

/**
 * How overfull slides are laid out, measured by the build in Chrome: `breaks` lists, per slide of slides(), the
 * body blocks that start a continuation slide; `fit` shrinks a slide a little ("3.1" = slide 3, second part).
 */
export interface DeckLayout {
  breaks?: Readonly<Record<number, readonly number[]>>;
  fit?: Readonly<Record<string, number>>;
  /** Items where a long block continues ("3:0" = slide 3, its first block): breaks then count the pieces. */
  items?: Readonly<Record<string, readonly number[]>>;
  /**
   * Accordion items opened on slides because one alone is taller than a slide ("3:1" = slide 3, its second block):
   * the question becomes a subheading and the answer's blocks continue like any others. Items then count the
   * blocks of the opened body.
   */
  open?: Readonly<Record<string, readonly number[]>>;
}

/** Shrink levels a slide may use before it is continued on a new slide (text stays at least 85%). */
export const FIT_LEVELS = [95, 90, 85] as const;

export interface DeckOptions {
  styles: DeckStyles;
  fontsHref?: string;
  layout?: DeckLayout;
}

/** Block types whose items can continue on the next slide (a long list, table, procedure or agenda). */
export const SPLITTABLE = ['steps', 'list', 'checklist', 'table', 'shortcuts', 'dl', 'glossary', 'accordion', 'cards', 'toc'] as const;
export const isSplittable = (b: Block) => (SPLITTABLE as readonly string[]).includes(b.type);

/** The items of a splittable block (steps, rows, terms, agenda entries ...), or none. */
export function itemCount(b: Block): number {
  switch (b.type) {
    case 'steps': return b.steps.length;
    case 'table': return b.rows.length;
    case 'cards': return b.cards.length;
    case 'toc': return b.entries ? b.entries[1] - b.entries[0] : 0;
    case 'list': case 'checklist': case 'shortcuts': case 'dl': case 'glossary': case 'accordion': return b.items.length;
    default: return 0;
  }
}

/** A splittable block cut before the given items; numbered pieces keep counting (steps 4, 5 ... on the next slide). */
export function splitBlock(b: Block, cuts: readonly number[]): Block[] {
  const n = itemCount(b);
  const sorted = [...new Set(cuts)].filter((c) => c > 0 && c < n).sort((x, y) => x - y);
  if (!sorted.length) return [b];
  const bounds = [0, ...sorted, n];
  return bounds.slice(0, -1).map((from, k): Block => {
    const to = bounds[k + 1]!;
    switch (b.type) {
      case 'steps': {
        const { start: _s, ...rest } = b;
        const start = (b.start ?? 1) + from;
        return { ...rest, ...(start > 1 ? { start } : {}), steps: b.steps.slice(from, to) };
      }
      case 'list': {
        const { start: _s, ...rest } = b;
        const start = (b.start ?? 1) + from;
        return { ...rest, ...(b.ordered && start > 1 ? { start } : {}), items: b.items.slice(from, to) };
      }
      case 'table': return { ...b, rows: b.rows.slice(from, to) };
      case 'cards': return { ...b, cards: b.cards.slice(from, to) };
      case 'checklist': return { ...b, items: b.items.slice(from, to) };
      case 'shortcuts': return { ...b, items: b.items.slice(from, to) };
      case 'dl': return { ...b, items: b.items.slice(from, to) };
      case 'glossary': return { ...b, items: b.items.slice(from, to) };
      case 'accordion': return { ...b, items: b.items.slice(from, to) };
      case 'toc': return { ...b, entries: [b.entries![0] + from, b.entries![0] + to] };
      default: return b;
    }
  });
}

/**
 * A slide's blocks with the opened accordion items laid out flat: the accordion before the item, the question as a
 * subheading, its answer's blocks, then the accordion after it. `index` is the block in the slide's own body and
 * `offset` the first accordion item a piece holds.
 */
export function openBody(body: Block[], base: number, open?: DeckLayout['open']): { block: Block; index: number; offset: number }[] {
  return body.flatMap((b, index) => {
    if (b.type !== 'accordion') return [{ block: b, index, offset: 0 }];
    const opened = [...new Set(open?.[`${base}:${index}`] ?? [])].filter((i) => i >= 0 && i < b.items.length).sort((x, y) => x - y);
    const out: { block: Block; index: number; offset: number }[] = [];
    let from = 0;
    for (const i of opened) {
      if (i > from) out.push({ block: { ...b, items: b.items.slice(from, i) }, index, offset: from });
      const item = b.items[i]!;
      out.push({ block: { type: 'heading', level: 4, id: '', text: [{ type: 'text', value: item.title }] }, index, offset: i });
      out.push(...item.body.map((x) => ({ block: x, index, offset: i })));
      from = i + 1;
    }
    if (from < b.items.length) out.push({ block: from ? { ...b, items: b.items.slice(from) } : b, index, offset: from });
    return out;
  });
}

/**
 * A slide's blocks after opened accordion items and item splits. `index` is the block in the opened body (item cuts
 * are keyed by it), `orig` the block in the slide's own body, `offset` its first accordion item, and `from` the
 * first item of the piece within its block.
 */
export function expandBody(body: Block[], base: number, items?: DeckLayout['items'], open?: DeckLayout['open']): { block: Block; index: number; orig: number; offset: number; from: number }[] {
  return openBody(body, base, open).flatMap(({ block: b, index: orig, offset }, index) => {
    const cuts = [...new Set(items?.[`${base}:${index}`] ?? [])].filter((c) => c > 0 && c < itemCount(b)).sort((x, y) => x - y);
    return splitBlock(b, cuts).map((block, k) => ({ block, index, orig, offset, from: k === 0 ? 0 : cuts[k - 1]! }));
  });
}

/** The slides with the layout applied: overfull slides continued on new slides, a little overflow shrunk. */
export function layoutSlides(base: Slide[], layout: DeckLayout = {}, continuedLabel = 'continued'): Slide[] {
  return base.map((s, i) => ({ ...s, body: expandBody(s.body, i, layout.items, layout.open).map((x) => x.block) })).flatMap((s, i) => {
    const cuts = [...new Set(layout.breaks?.[i] ?? [])].filter((n) => n > 0 && n < s.body.length).sort((a, b) => a - b);
    const bounds = [0, ...cuts, s.body.length];
    return bounds.slice(0, -1).map((from, part): Slide => {
      const fit = layout.fit?.[`${i}.${part}`];
      const body = s.body.slice(from, bounds[part + 1]);
      if (part === 0) return { ...s, body, base: i, continued: 0, ...(fit ? { fit } : {}) };
      const heading: Inline | string = typeof s.heading === 'string' ? `${s.heading} (${continuedLabel})`
        : [...s.heading, { type: 'text', value: ` (${continuedLabel})` }];
      // the heading id stays with the first part; a lead slide's continuation still names its block by its heading
      const { id: _id, ...rest } = s;
      return { ...rest, kind: s.kind === 'title' ? 'content' : s.kind, heading, body, notes: [], base: i, continued: part, ...(fit ? { fit } : {}) };
    });
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

export function slides(doc: LibkaDocument): Slide[] {
  const { meta } = doc;
  const title: Slide = {
    kind: 'title',
    tag: [meta.version ? `v${meta.version}` : '', meta.date ?? ''].filter(Boolean).join(' · '),
    heading: meta.title, body: [], notes: [],
  };
  const L = LABELS_[langOf(meta.lang)];
  const info = docInfo(doc, L);
  const out: Slide[] = [title];
  let current = title;
  let section = '';
  let sections = 0;
  // an agenda on slides lists the sections and parts; giving it their count lets a long one continue on the next slide
  const agenda = info.toc.filter((e) => e.level <= 2).length;
  for (const raw of doc.blocks) {
    const b: Block = raw.type === 'toc' ? { ...raw, entries: [0, agenda] } : raw;
    if (b.type === 'section') {
      // a part divider: a full section slide of its own; the next ## starts the part's first section
      current = { kind: 'section', tag: '', heading: b.title, id: b.id, body: b.body, notes: [], part: true };
      out.push(current);
    } else if ((b.type === 'summary' || b.type === 'toc') && current === title) {
      // key takeaways or an agenda before the first section get their own slide after the title
      current = { kind: 'content', tag: '', heading: b.title ?? (b.type === 'toc' ? L.contents : L.keyTakeaways), body: [b], notes: [], lead: true };
      out.push(current);
    } else if (b.type === 'release') {
      // one release per slide, headed by its version; ### after it are its slides
      section = b.version;
      current = { kind: 'section', tag: b.date ?? '', heading: b.version, id: b.id, body: [b], notes: [], lead: true };
      out.push(current);
    } else if (b.type === 'references') {
      current = { kind: 'content', tag: '', heading: b.title ?? L.references, id: REFERENCES_ID, body: [], notes: [], end: 'references' };
      out.push(current);
    } else if (b.type === 'heading' && b.level <= 3) {
      if (b.level === 2) {
        sections++;
        section = plainText(b.text);
        current = { kind: 'section', tag: pad(sections), heading: b.text, id: b.id, body: [], notes: [] };
      } else {
        current = { kind: 'content', tag: section, heading: b.text, id: b.id, body: [], notes: [] };
      }
      out.push(current);
    } else if (b.type === 'notes') {
      current.notes.push(...b.body);
    } else {
      current.body.push(b);
    }
  }
  if (info.footnotes.length) out.push({ kind: 'content', tag: '', heading: L.notes, id: NOTES_ID, body: [], notes: [], end: 'notes' });
  if (info.listRefs && !info.placedRefs) out.push({ kind: 'content', tag: '', heading: L.references, id: REFERENCES_ID, body: [], notes: [], end: 'references' });
  return out;
}

const LABELS: Record<'en' | 'cs', DeckLabels & {
  slide: string; slides: string; controls: string; prev: string; next: string; notes: string; nextSlide: string;
  overview: string; presenter: string; fullscreen: string; theme: string; contrast: string; timer: string; letters: string;
}> = {
  en: {
    of: '{n} / {total}', announce: 'Slide {n} of {total}: {title}', goTo: 'Go to slide {n}: {title}',
    noNotes: 'No speaker notes for this slide.', end: 'End of the deck.', popupBlocked: 'Allow pop-ups for this file to open the presenter view.',
    slide: 'slide', slides: 'Slides', controls: 'Slide controls', prev: 'Previous slide', next: 'Next slide',
    notes: 'Speaker notes', nextSlide: 'Next slide', overview: 'Overview', presenter: 'Presenter view', fullscreen: 'Full screen',
    theme: 'Dark theme', contrast: 'High contrast', timer: 'Elapsed time', letters: 'Letter shortcuts',
  },
  cs: {
    of: '{n} / {total}', announce: 'Snímek {n} z {total}: {title}', goTo: 'Přejít na snímek {n}: {title}',
    noNotes: 'K tomuto snímku nejsou poznámky řečníka.', end: 'Konec prezentace.', popupBlocked: 'Povolte pro tento soubor vyskakovací okna, aby se otevřel pohled přednášejícího.',
    slide: 'snímek', slides: 'Snímky', controls: 'Ovládání snímků', prev: 'Předchozí snímek', next: 'Další snímek',
    notes: 'Poznámky řečníka', nextSlide: 'Další snímek', overview: 'Přehled', presenter: 'Pohled přednášejícího', fullscreen: 'Celá obrazovka',
    theme: 'Tmavý motiv', contrast: 'Vysoký kontrast', timer: 'Uplynulý čas', letters: 'Písmenové zkratky',
  },
};

/** Slide content: the manual's blocks, with #### as a subheading under the slide's h2. */
function slideBlock(b: Block, ctx: RenderContext, headingId?: string): string {
  if (b.type === 'heading') return `<h3 class="lk-deck-h3">${inline(b.text, ctx)}</h3>`;
  if (b.type === 'summary' && headingId) return summary(b, ctx, headingId);
  if (b.type === 'toc' && headingId) return tocBlock(b, ctx, headingId);
  if (b.type === 'release' && headingId) return releaseBlock(b, ctx, headingId);
  return block(b, ctx);
}

function slideHtml(s: Slide, n: number, total: number, L: (typeof LABELS)['en'], ctx: RenderContext, subtitle?: string, status?: string, noteSlides?: Map<string, number>): string {
  const text = typeof s.heading === 'string' ? escapeHtml(s.heading) : inline(s.heading, ctx);
  const plain = typeof s.heading === 'string' ? s.heading : plainText(s.heading);
  const divider = s.kind === 'section' && (!s.body.length || s.part);
  const statement = s.body.length === 1 && s.body[0]!.type === 'statement';
  const cls = (s.kind === 'title' ? ' lk-slide--title' : divider ? ` lk-slide--section${s.part ? ' lk-slide--part' : ''}` : statement ? ' lk-slide--statement' : '')
    + (s.fit ? ` lk-slide--fit-${s.fit}` : '');
  const h = s.kind === 'title' ? 'h1' : 'h2';
  const id = s.id ?? (s.lead ? ctx.next('lead') : undefined);
  // notes link back to the slide that first refers to them
  const back = (noteId: string) => { const at = noteSlides?.get(noteId); return at ? `<a class="lk-fn-back" href="#slide-${at}">${escapeHtml(fill(ctx.labels.slideN, { n: at }))}</a>` : ''; };
  const content = s.end === 'notes' ? notesList(ctx, back) : s.end === 'references' ? referencesList(ctx) : s.body.map((b) => slideBlock(b, ctx, s.lead ? id : undefined)).join('\n');
  const notes = s.notes.length ? `\n  <template>${s.notes.map((b) => block(b, ctx)).join('\n')}</template>` : '';
  return `<section class="lk-deck-frame" id="slide-${n}" data-title="${escapeHtml(plain)}"${s.base !== undefined ? ` data-base="${s.base}" data-part="${s.continued ?? 0}" data-blocks="${s.body.length}"` : ''} data-role="${L.slide}" aria-roledescription="${L.slide}" aria-label="${n} / ${total}">
  <div class="lk-slide${cls}">
${s.tag ? `    <span class="lk-slide-tag">${escapeHtml(s.tag)}</span>\n` : ''}    <${h} class="lk-slide-heading"${id ? ` id="${escapeHtml(id)}"` : ''}>${text}</${h}>
${subtitle ? `    <p class="lk-doc-subtitle">${escapeHtml(subtitle)}</p>\n` : ''}${content ? `    <div class="lk-slide-body">\n${content}\n    </div>\n` : ''}${status ? `    ${status}\n` : ''}  </div>${notes}
</section>`;
}

const ICON = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function renderDeck(doc: LibkaDocument, options: DeckOptions): string {
  const { meta } = doc;
  const L = LABELS[meta.lang.toLowerCase().startsWith('cs') ? 'cs' : 'en'];
  const ctx = context(meta.lang, 'deck', doc);
  const list = layoutSlides(slides(doc), options.layout, ctx.labels.continued);
  const { styles } = options;
  const button = (name: string, label: string, key: string, extra = '') =>
    `<button type="button" class="lk-deck-btn" data-deck="${name}"${extra}>${label} <span class="lk-deck-key" aria-hidden="true">${key}</span></button>`;
  // each footnote's first slide, for the "slide 4" links on the Notes slide
  const noteSlides = new Map<string, number>();
  list.forEach((s, i) => JSON.stringify([s.heading, s.body], (_, v: { type?: string; identifier?: string }) => {
    if (v?.type === 'footnoteReference' && v.identifier && !noteSlides.has(v.identifier)) noteSlides.set(v.identifier, i + 1);
    return v;
  }));
  // the title slide's footer: status, owner and review dates; a deprecated deck says so in words
  const items = statusItems(meta, ctx.labels);
  const titleStatus = items.length ? `<p class="lk-slide-status">${items.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>` : '';
  const runtimeLabels: DeckLabels = { of: L.of, announce: L.announce, goTo: L.goTo, noNotes: L.noNotes, end: L.end, popupBlocked: L.popupBlocked };

  return withCsp(typeset(`<!doctype html>
<html lang="${escapeHtml(meta.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="LibKa">
<meta name="libka-target" content="deck">
<title>${escapeHtml(meta.title)}</title>
${options.fontsHref ? `<link rel="stylesheet" href="${escapeHtml(options.fontsHref)}">\n` : ''}<style>
${styles.tokens}
${styles.bridge}
${styles.components}
${usesUi(doc.blocks) ? uiStageCss(styles.tokens, styles.bridge) : ''}
${styles.deck}
</style>
</head>
<body>
<div class="lk-deck" data-mode="slides" data-notes="closed">
<main class="lk-deck-viewport" aria-label="${L.slides}">
${list.map((s, i) => slideHtml(s, i + 1, list.length, L, ctx, s.kind === 'title' ? meta.subtitle : undefined, s.kind === 'title' ? titleStatus : undefined, noteSlides)).join('\n')}
</main>
<aside class="lk-deck-next" aria-labelledby="lk-deck-next-title" hidden>
  <h2 class="lk-deck-panel-title" id="lk-deck-next-title">${L.nextSlide}</h2>
  <div class="lk-deck-next-body"></div>
</aside>
<aside class="lk-deck-notes" aria-labelledby="lk-deck-notes-title" hidden>
  <h2 class="lk-deck-panel-title" id="lk-deck-notes-title">${L.notes}</h2>
  <div class="lk-deck-notes-body"></div>
</aside>
<nav class="lk-deck-bar" aria-label="${L.controls}">
  <span class="lk-deck-progress" aria-hidden="true"></span>
  <button type="button" class="lk-deck-btn" data-deck="prev" aria-label="${L.prev}" title="${L.prev} (←)">${ICON.prev}</button>
  <span class="lk-deck-count">1 / ${list.length}</span>
  <button type="button" class="lk-deck-btn" data-deck="next" aria-label="${L.next}" title="${L.next} (→)">${ICON.next}</button>
  <span class="lk-deck-name">${escapeHtml(meta.title)}</span>
  <span class="lk-deck-timer" role="timer" aria-label="${L.timer}" hidden>00:00</span>
  ${button('notes', L.notes, 'N', ' aria-pressed="false"')}
  ${button('overview', L.overview, 'O', ' aria-pressed="false"')}
  ${button('presenter', L.presenter, 'P')}
  ${button('fullscreen', L.fullscreen, 'F')}
  ${button('theme', L.theme, 'D', ' aria-pressed="false"')}
  ${button('contrast', L.contrast, 'C', ' aria-pressed="false"')}
  <button type="button" class="lk-deck-btn" data-deck="letters" aria-pressed="true">${L.letters}</button>
  <p class="lk-visually-hidden lk-deck-live" aria-live="polite"></p>
</nav>
</div>
<script>
(${DECK_RUNTIME})(${JSON.stringify(runtimeLabels).replace(/</g, '\\u003c')});
${runtimeScript(ctx)}
</script>
</body>
</html>
`, meta.lang));
}
