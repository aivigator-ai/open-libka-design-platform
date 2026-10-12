/**
 * UI specimens: real LibKa components, shown as they look, in an inert stage.
 *
 * The stage is `inert` and hidden from screen readers; a generated sentence describes every
 * component instead. Each stage carries its own theme (data-theme="light" | "dark"), and
 * uiStageCss() re-declares the token variables on the stage, so component tokens such as
 * --lk-button-primary-background resolve against that stage's theme and its high-contrast palette.
 */
import type { Block, UiItem } from '@libka/model';
import { escapeHtml } from './escape.ts';
import type { Lang } from './labels.ts';

type Ui = Extract<Block, { type: 'ui' }>;

const WORDS = {
  en: {
    example: 'Example', themes: { light: 'light theme', dark: 'dark theme', both: 'light and dark theme' } as Record<string, string>,
    kind: { button: 'button', badge: 'badge', toast: 'notification', modal: 'dialog', empty: 'empty state' } as Record<string, string>,
    input: { text: 'text field', email: 'email field', password: 'password field', number: 'number field', textarea: 'text area', select: 'select list', checkbox: 'checkbox', radio: 'radio buttons', switch: 'switch' } as Record<string, string>,
    word: { primary: 'primary', accent: 'accent', iris: 'iris', secondary: 'secondary', destructive: 'destructive', ghost: 'ghost', neutral: 'neutral', info: 'info', success: 'success', warning: 'warning', error: 'error', ai: 'AI', hover: 'hovered', focus: 'focused', disabled: 'disabled', loading: 'loading', readonly: 'read-only' } as Record<string, string>,
    value: 'value', hint: 'hint', errorMsg: 'error', required: 'required', options: 'options', action: 'action', actions: 'actions', checked: 'on',
    quote: (s: string) => `“${s}”`,
  },
  cs: {
    example: 'Ukázka', themes: { light: 'světlý motiv', dark: 'tmavý motiv', both: 'světlý a tmavý motiv' } as Record<string, string>,
    kind: { button: 'tlačítko', badge: 'štítek', toast: 'oznámení', modal: 'dialog', empty: 'prázdný stav' } as Record<string, string>,
    input: { text: 'textové pole', email: 'pole pro e-mail', password: 'pole pro heslo', number: 'číselné pole', textarea: 'víceřádkové pole', select: 'výběrový seznam', checkbox: 'zaškrtávací pole', radio: 'přepínače', switch: 'vypínač' } as Record<string, string>,
    word: { primary: 'primární', accent: 'akcentové', iris: 'iris', secondary: 'sekundární', destructive: 'destruktivní', ghost: 'průhledné', neutral: 'neutrální', info: 'informace', success: 'úspěch', warning: 'varování', error: 'chyba', ai: 'AI', hover: 'pod kurzorem', focus: 'zaměřené', disabled: 'neaktivní', loading: 'načítá se', readonly: 'jen pro čtení' } as Record<string, string>,
    value: 'hodnota', hint: 'nápověda', errorMsg: 'chyba', required: 'povinné', options: 'možnosti', action: 'akce', actions: 'akce', checked: 'zapnuto',
    quote: (s: string) => `„${s}“`,
  },
};

const e = escapeHtml;
const stateClass = (s?: string) => (s && s !== 'default' ? ` is-${s}` : '');

function button(label: string, variant = 'secondary', state?: string): string {
  const disabled = state === 'disabled' || state === 'loading';
  return `<button type="button" class="lk-ui-button lk-ui-button--${variant}${stateClass(state)}"${disabled ? ' aria-disabled="true"' : ''}>` +
    `${state === 'loading' ? '<span class="lk-ui-spinner" aria-hidden="true"></span>' : ''}<span class="lk-ui-button-label">${e(label)}</span></button>`;
}

function field(i: UiItem, id: string): string {
  const type = i.input ?? 'text';
  const dis = i.state === 'disabled' ? ' disabled' : '';
  const ro = i.state === 'readonly' ? ' readonly' : '';
  const req = i.required ? ' <span class="lk-ui-required">*</span>' : '';
  const described = [i.hint ? `${id}-hint` : '', i.error ? `${id}-error` : ''].filter(Boolean).join(' ');
  const aria = `${described ? ` aria-describedby="${described}"` : ''}${i.error ? ' aria-invalid="true"' : ''}`;
  const hint = i.hint ? `<p class="lk-ui-hint" id="${id}-hint">${e(i.hint)}</p>` : '';
  const error = i.error ? `<p class="lk-ui-error" id="${id}-error"><span aria-hidden="true">!</span> ${e(i.error)}</p>` : '';
  const cls = `lk-ui-field${stateClass(i.state)}${i.error ? ' is-error' : ''}`;
  const wrapAria = i.state === 'disabled' ? ' aria-disabled="true"' : '';
  if (type === 'checkbox' || type === 'switch') {
    const on = Boolean(i.value) && !/^(off|false|no|0)$/i.test(i.value!);
    return `<div class="${cls}"${wrapAria}><label class="lk-ui-check${type === 'switch' ? ' lk-ui-check--switch' : ''}" for="${id}">` +
      `<input type="checkbox" id="${id}"${type === 'switch' ? ' role="switch"' : ''}${on ? ' checked' : ''}${dis}${aria}><span class="lk-ui-check-label">${e(i.label)}${req}</span></label>${hint}${error}</div>`;
  }
  if (type === 'radio') {
    return `<fieldset class="${cls}"${wrapAria}><legend class="lk-ui-label">${e(i.label)}${req}</legend>` +
      (i.options ?? []).map((o, n) => `<label class="lk-ui-check" for="${id}-${n}"><input type="radio" id="${id}-${n}" name="${id}"${o === i.value ? ' checked' : ''}${dis}><span class="lk-ui-check-label">${e(o)}</span></label>`).join('') +
      `${hint}${error}</fieldset>`;
  }
  const value = i.value ? ` value="${e(i.value)}"` : '';
  const ph = i.placeholder ? ` placeholder="${e(i.placeholder)}"` : '';
  const control = type === 'textarea'
    ? `<textarea class="lk-ui-input" id="${id}" rows="3"${ph}${dis}${ro}${aria}>${e(i.value ?? '')}</textarea>`
    : type === 'select'
      ? `<select class="lk-ui-input" id="${id}"${dis}${aria}>${(i.options ?? []).map((o) => `<option${o === i.value ? ' selected' : ''}>${e(o)}</option>`).join('')}</select>`
      : `<input class="lk-ui-input" type="${e(type)}" id="${id}"${value}${ph}${dis}${ro}${aria}>`;
  return `<div class="${cls}"${wrapAria}><label class="lk-ui-label" for="${id}">${e(i.label)}${req}</label>${control}${hint}${error}</div>`;
}

const ICON: Record<string, string> = { info: 'i', success: '✓', warning: '!', error: '!' };

function item(i: UiItem, id: string): string {
  switch (i.kind) {
    case 'button': return button(i.label, i.variant ?? 'secondary', i.state);
    case 'field': return field(i, id);
    case 'badge': return `<span class="lk-badge lk-badge--${i.variant ?? 'neutral'}">${e(i.label)}</span>`;
    case 'toast': {
      const v = i.variant ?? 'info';
      return `<div class="lk-ui-toast lk-ui-toast--${v}"><span class="lk-ui-toast-icon" aria-hidden="true">${ICON[v]}</span>` +
        `<div class="lk-ui-toast-body"><p class="lk-ui-toast-title">${e(i.label)}</p>${i.text ? `<p class="lk-ui-toast-text">${e(i.text)}</p>` : ''}</div>` +
        `${i.action ? `<button type="button" class="lk-ui-link">${e(i.action)}</button>` : ''}</div>`;
    }
    case 'modal':
      return `<div class="lk-ui-overlay"><div class="lk-ui-modal"><p class="lk-ui-modal-title">${e(i.label)}</p><p class="lk-ui-modal-text">${e(i.text ?? '')}</p>` +
        `<div class="lk-ui-actions">${i.secondary ? button(i.secondary, 'secondary') : ''}${button(i.primary ?? '', i.destructive ? 'destructive' : 'primary')}</div></div></div>`;
    case 'empty':
      return `<div class="lk-ui-empty"><span class="lk-ui-empty-icon" aria-hidden="true"></span><p class="lk-ui-empty-title">${e(i.label)}</p>` +
        `<p class="lk-ui-empty-text">${e(i.text ?? '')}</p>${i.action ? button(i.action, 'primary') : ''}</div>`;
  }
}

/** One sentence per specimen for screen readers, since the stage itself is hidden from them. */
export function describeUi(b: Ui, lang: Lang): string {
  const W = WORDS[lang];
  const q = W.quote;
  const parts = b.items.map((i) => {
    const kind = i.kind === 'field' ? W.input[i.input ?? 'text']! : W.kind[i.kind]!;
    const notes = [i.variant && W.word[i.variant], i.state && i.state !== 'default' && W.word[i.state],
      i.value && `${W.value} ${q(i.value)}`, i.options && `${W.options}: ${i.options.join(', ')}`, i.hint && `${W.hint} ${q(i.hint)}`,
      i.error && `${W.errorMsg} ${q(i.error)}`, i.required && W.required, i.text && q(i.text),
      i.action && `${W.action} ${q(i.action)}`, i.primary && `${W.actions} ${[i.secondary, i.primary].filter(Boolean).map((x) => q(x!)).join(', ')}`,
    ].filter(Boolean);
    return `${kind} ${q(i.label)}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  });
  return `${W.example} (${W.themes[b.theme]}): ${parts.join('; ')}.`;
}

export function renderUi(b: Ui, next: (prefix: string) => string, lang: Lang): string {
  const themes = b.theme === 'both' ? ['light', 'dark'] : [b.theme];
  const base = next('ui');
  const stages = themes.map((t, n) =>
    `<div class="lk-ui-stage lk-ui-stage--${b.layout}" data-theme="${t}" inert aria-hidden="true">${b.items.map((i, k) => item(i, `${base}-${n + 1}-${k + 1}`)).join('')}</div>`);
  return [`<figure class="lk-block lk-ui${themes.length > 1 ? ' lk-ui--both' : ''}">`,
    `<div class="lk-ui-stages">${stages.join('')}</div>`,
    `<figcaption>${e(b.caption)}</figcaption>`,
    `<p class="lk-visually-hidden">${e(describeUi(b, lang))}</p>`,
    '</figure>'].join('\n');
}

/** The first `selector { ... }` block at the start of a line, without the braces ('' when absent). */
function block(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {\n`) >= 0 ? css.indexOf(`\n${selector} {\n`) + 1 : css.startsWith(`${selector} {\n`) ? 0 : -1;
  if (at < 0) return '';
  const open = at + selector.length + 3;
  return css.slice(open, css.indexOf('\n}', open));
}

/** Token variables re-declared on each specimen stage, per theme and in high contrast. */
export function uiStageCss(tokens: string, bridge: string): string {
  const both = (sel: string) => [block(tokens, sel), block(bridge, sel)].join('\n');
  const root = both(':root');
  const hcLight = both('[data-contrast="high"]');
  const hcDark = both('[data-theme="dark"][data-contrast="high"]');
  return [
    `.lk-ui-stage[data-theme="light"] {\n${root}\n}`,
    `.lk-ui-stage[data-theme="dark"] {\n${root}\n${both('[data-theme="dark"]')}\n}`,
    `[data-contrast="high"] .lk-ui-stage[data-theme="light"] {\n${hcLight}\n}`,
    `[data-contrast="high"] .lk-ui-stage[data-theme="dark"] {\n${hcDark}\n}`,
    '@media (prefers-contrast: more) {',
    `:root:not([data-contrast="standard"]) .lk-ui-stage[data-theme="light"] {\n${hcLight}\n}`,
    `:root:not([data-contrast="standard"]) .lk-ui-stage[data-theme="dark"] {\n${hcDark}\n}`,
    '}',
  ].join('\n');
}

/** Whether a document uses specimens anywhere (also inside tabs, cards ...). */
export const usesUi = (blocks: readonly Block[]): boolean => JSON.stringify(blocks).includes('"type":"ui"');
