/** The editor preferences (with the keys of the Studio's commands) and the searchable list of keyboard shortcuts. */
import { useState } from 'preact/hooks';
import type { Key } from '../i18n.ts';
import { registry } from '../state/commands.ts';
import { conflicts, keyOverrides, keysFromEvent, keysOf, keyText as commandKeys, setKeys } from '../state/keys.ts';
import { editorPrefs, setPref, type EditorPrefs } from '../state/prefs.ts';
import { t } from '../state/text.ts';

function Toggle({ k, label, help }: { k: 'palette' | 'shortcuts' | 'labels' | 'focus' | 'typewriter'; label: Key; help: Key }) {
  const id = `pref-${k}`;
  return (
    <div class="st-pref">
      <input id={id} type="checkbox" role="switch" checked={editorPrefs.value[k]} aria-describedby={`${id}-help`} onChange={(e) => setPref(k, e.currentTarget.checked)} />
      <label for={id}>{t(label)}</label>
      <span class="st-field-help" id={`${id}-help`}>{t(help)}</span>
    </div>
  );
}

function Choice<K extends 'handles' | 'defaultMode' | 'density' | 'announce'>({ k, label, options }: { k: K; label: Key; options: [EditorPrefs[K], Key][] }) {
  return (
    <fieldset class="st-pref-choice">
      <legend>{t(label)}</legend>
      {options.map(([value, text]) => (
        <label key={String(value)}><input type="radio" name={`pref-${k}`} checked={editorPrefs.value[k] === value} onChange={() => setPref(k, value)} /> {t(text)}</label>
      ))}
    </fieldset>
  );
}

export function PreferencesForm() {
  return (
    <div class="st-prefs">
      <section aria-labelledby="prefs-visual">
        <h3 id="prefs-visual" class="st-insp-heading">{t('prefs.visual')}</h3>
        <Toggle k="palette" label="prefs.palette" help="prefs.paletteHelp" />
        <Toggle k="shortcuts" label="prefs.shortcuts" help="prefs.shortcutsHelp" />
        <Toggle k="labels" label="prefs.labels" help="prefs.labelsHelp" />
        <Choice k="handles" label="prefs.handles" options={[['hover', 'prefs.handlesHover'], ['always', 'prefs.handlesAlways']]} />
        <Choice k="density" label="prefs.density" options={[['comfortable', 'prefs.comfortable'], ['compact', 'prefs.compact']]} />
      </section>
      <section aria-labelledby="prefs-writing">
        <h3 id="prefs-writing" class="st-insp-heading">{t('prefs.writing')}</h3>
        <Toggle k="focus" label="prefs.focus" help="prefs.focusHelp" />
        <Toggle k="typewriter" label="prefs.typewriter" help="prefs.typewriterHelp" />
        <Choice k="defaultMode" label="prefs.defaultMode" options={[['visual', 'mode.visual'], ['split', 'mode.split'], ['source', 'mode.source']]} />
        <Choice k="announce" label="prefs.announce" options={[['full', 'prefs.announceFull'], ['brief', 'prefs.announceBrief']]} />
      </section>
      <KeyBindings />
    </div>
  );
}

/**
 * The keys of the Studio's commands, each one changeable: "Change" listens for the next key press (with Ctrl/Cmd,
 * Alt or an F-key), a key another command or the editors use is named, "Default" goes back. Kept in this browser.
 */
function KeyBindings() {
  void keyOverrides.value;
  const [listening, setListening] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string } | null>(null);
  const commands = registry.all().filter((c) => c.available?.() ?? true);
  const nameOf = (id: string) => (id === 'editor' ? t('keys.editorKeys') : t(registry.command(id)!.title));
  const listen = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Tab') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { setListening(null); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { setKeys(id, ''); setListening(null); setMessage({ id, text: t('keys.removed') }); return; }
    const keys = keysFromEvent(e);
    if (!keys) { setMessage({ id, text: t('keys.needModifier') }); return; }
    const taken = conflicts(keys, commands, id);
    setListening(null);
    if (taken.length) { setMessage({ id, text: t('keys.taken', { keys: commandKeys(keys), by: taken.map(nameOf).join(', ') }) }); return; }
    setKeys(id, keys);
    setMessage({ id, text: t('keys.set', { keys: commandKeys(keys) }) });
  };
  return (
    <section aria-labelledby="prefs-keys">
      <h3 id="prefs-keys" class="st-insp-heading">{t('keys.commandKeys')}</h3>
      <p class="st-field-help">{t('keys.commandKeysHelp')}</p>
      <table class="st-keys-table st-keys-edit">
        <caption class="st-visually-hidden">{t('keys.commandKeys')}</caption>
        <thead><tr><th scope="col">{t('keys.does')}</th><th scope="col">{t('keys.keys')}</th><th scope="col"><span class="st-visually-hidden">{t('keys.change')}</span></th></tr></thead>
        <tbody>
          {commands.map((c) => {
            const keys = keysOf(c);
            const changed = keyOverrides.value[c.id] !== undefined;
            return (
              <tr key={c.id} data-command={c.id}>
                <td id={`key-name-${c.id}`}>{t(c.title)}</td>
                <td>{listening === c.id ? <span class="st-keys-listen">{t('keys.press')}</span> : keys ? <kbd>{commandKeys(keys)}</kbd> : <span class="st-keys-none">{t('keys.noKey')}</span>}
                  {message?.id === c.id ? <span class="st-field-help" role="status">{message.text}</span> : null}</td>
                <td class="st-keys-actions">
                  <button type="button" class="st-btn st-btn--small" aria-describedby={`key-name-${c.id}`} aria-pressed={listening === c.id}
                    onClick={(e) => { setMessage(null); setListening(c.id); (e.currentTarget as HTMLElement).focus(); }}
                    onKeyDown={listening === c.id ? listen(c.id) : undefined} onBlur={() => { if (listening === c.id) setListening(null); }}>
                    {t(listening === c.id ? 'keys.pressNow' : 'keys.change')}
                  </button>
                  {changed ? <button type="button" class="st-btn st-btn--small" aria-describedby={`key-name-${c.id}`} onClick={() => { setKeys(c.id, null); setMessage({ id: c.id, text: t('keys.reset') }); }}>{t('keys.default')}</button> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const keyText = (keys: string) => keys.replaceAll('Mod', mac ? '⌘' : 'Ctrl').replaceAll('Alt', mac ? '⌥' : 'Alt');

/** Every shortcut, by group: [keys, what it does]. */
const SHORTCUTS: [Key, [string, Key][]][] = [
  ['keys.select', [['Esc', 'keys.selectBlock'], ['Shift+Enter', 'keys.selectParent'], ['Enter', 'keys.enterBlock'], ['↑ ↓', 'keys.siblings'], ['Shift+↑ / Shift+↓', 'keys.extend']]],
  ['keys.move', [['Mod+Shift+↑ / Mod+Shift+↓', 'keys.moveBlock'], ['Mod+D', 'keys.duplicate'], ['Delete', 'keys.delete'], ['Shift+F10', 'keys.blockMenu'], ['Mod+/', 'keys.blockMenu']]],
  ['keys.insert', [['/', 'keys.slash'], ['Mod+Shift+Enter', 'keys.insertAfter'], ['## ', 'keys.mdHeading'], ['- ', 'keys.mdList'], ['> ', 'keys.mdQuote'], ['Mod+] / Mod+[', 'keys.indent']]],
  ['keys.format', [['Mod+B', 'format.bold'], ['Mod+I', 'format.italic'], ['Mod+E', 'format.code'], ['Mod+Shift+X', 'format.strike'], ['Mod+K', 'keys.linkSelected']]],
];

/** The Studio's own keys: the commands' (as the author set them), and the fixed ones. */
function studioKeys(): [string, Key][] {
  const fromCommands = registry.shortcuts().map((c) => [commandKeys(keysOf(c)!), c.title] as [string, Key]);
  return [['Mod+Z / Mod+Y', 'keys.undo'], ['Mod+K', 'keys.linkOrPalette'], ['F1', 'cmdk.title'], ...fromCommands, ['?', 'keys.help']];
}

export function ShortcutList() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const all: [Key, [string, Key][]][] = [...SHORTCUTS, ['keys.studio', studioKeys()]];
  const groups = all.map(([g, rows]) => [g, rows.filter(([k, what]) => !q || `${keyText(k)} ${t(what)}`.toLowerCase().includes(q))] as const).filter(([, rows]) => rows.length);
  return (
    <div class="st-keys">
      <input type="search" class="st-palette-search" aria-label={t('keys.search')} placeholder={t('keys.search')} value={query} onInput={(e) => setQuery(e.currentTarget.value)} autoFocus />
      {groups.map(([g, rows]) => (
        <table key={g} class="st-keys-table">
          <caption>{t(g)}</caption>
          <thead><tr><th scope="col">{t('keys.keys')}</th><th scope="col">{t('keys.does')}</th></tr></thead>
          <tbody>{rows.map(([k, what]) => <tr key={k + what}><td><kbd>{keyText(k)}</kbd></td><td>{t(what)}</td></tr>)}</tbody>
        </table>
      ))}
      {groups.length ? null : <p class="st-empty">{t('keys.none')}</p>}
    </div>
  );
}
