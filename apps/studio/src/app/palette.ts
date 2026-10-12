/**
 * What the command palette finds, as the built-in palette sources: commands (with their keys, plus the side panel's
 * tabs, the preview's devices and the editor modes), blocks to insert, places in the document (headings and titled
 * blocks), settings (each preference, the language, the theme and contrast) and the documents of the library.
 */
import { blockTitle, insertables } from '@libka/editor';
import { registry, type PaletteItem, type PaletteSource } from '../state/commands.ts';
import { keysOf } from '../state/keys.ts';
import { editorPrefs, setPref, type EditorPrefs } from '../state/prefs.ts';
import * as s from '../state/store.ts';
import { t } from '../state/text.ts';
import type { Key } from '../i18n.ts';
import { displayName } from '../storage/projects.ts';
import { insertBlock, openProject, setMode } from './project.ts';
import { goToLine } from '../ui/Panels.tsx';
import { SNIPPETS } from '../ui/Workspace.tsx';
import { places } from '../core/places.ts';

const inEditor = () => s.view.value === 'editor' && Boolean(s.project.value);
const short = (text: string, n = 96) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

const commands: PaletteSource = {
  id: 'commands',
  title: 'cmdk.commands',
  order: 10,
  items() {
    const out: PaletteItem[] = registry.all().filter((c) => c.id !== 'palette.open' && (c.available?.() ?? true))
      .map((c) => ({ id: `cmd:${c.id}`, label: t(c.title), ...(keysOf(c) ? { keys: keysOf(c)! } : {}), words: c.id, run: () => registry.run(c.id) }));
    if (!inEditor()) return out;
    const modes: s.Mode[] = s.wide.value ? ['visual', 'split', 'source'] : ['visual', 'source'];
    for (const m of modes) if (m !== s.shownMode.value) out.push({ id: `mode:${m}`, label: t('cmdk.mode', { name: t(`mode.${m}`) }), words: m, run: () => setMode(m) });
    for (const p of registry.panels()) {
      out.push({
        id: `panel:${p.id}`, label: t('cmdk.panel', { name: t(p.title) }), words: p.id,
        run: () => { s.panelTab.value = p.id as s.PanelTab; s.pane.value = 'checks'; requestAnimationFrame(() => document.getElementById(`tab-${p.id}`)?.focus()); },
      });
    }
    for (const d of ['web', 'phone', 'a4', 'slides'] as const) {
      out.push({ id: `device:${d}`, label: t('cmdk.preview', { name: t(`preview.${d}`) }), words: d, run: () => { s.device.value = d; s.pane.value = 'preview'; } });
    }
    return out;
  },
};

const blocks: PaletteSource = {
  id: 'blocks',
  title: 'cmdk.blocks',
  order: 20,
  items: () => (inEditor() ? insertables(s.lang.value).map((b) => ({
    id: `block:${b.name}`, label: b.title, detail: short(b.summary), words: b.words, run: () => insertBlock(b.name, SNIPPETS),
  })) : []),
};

const placesSource: PaletteSource = {
  id: 'places',
  title: 'cmdk.places',
  order: 30,
  items: () => (inEditor() ? places(s.source.value).map((p) => ({
    id: `place:${p.line}`, label: p.label, run: () => goToLine(p.line),
    detail: p.kind === 'heading' ? t('cmdk.heading', { n: p.level, line: p.line }) : t('cmdk.block', { name: blockTitle(p.name, s.lang.value), line: p.line }),
  })) : []),
};

type Toggle = 'palette' | 'shortcuts' | 'labels' | 'focus' | 'typewriter';
const TOGGLES: [Toggle, Key][] = [['palette', 'prefs.palette'], ['shortcuts', 'prefs.shortcuts'], ['labels', 'prefs.labels'], ['focus', 'prefs.focus'], ['typewriter', 'prefs.typewriter']];
type Choice = 'handles' | 'density' | 'defaultMode' | 'announce';
const CHOICES: { [K in Choice]: [Key, [EditorPrefs[K], Key][]] } = {
  handles: ['prefs.handles', [['hover', 'prefs.handlesHover'], ['always', 'prefs.handlesAlways']]],
  density: ['prefs.density', [['comfortable', 'prefs.comfortable'], ['compact', 'prefs.compact']]],
  defaultMode: ['prefs.defaultMode', [['visual', 'mode.visual'], ['split', 'mode.split'], ['source', 'mode.source']]],
  announce: ['prefs.announce', [['full', 'prefs.announceFull'], ['brief', 'prefs.announceBrief']]],
};

const settings: PaletteSource = {
  id: 'settings',
  title: 'cmdk.settings',
  order: 40,
  items() {
    const p = editorPrefs.value;
    const out: PaletteItem[] = [];
    const other = s.lang.value === 'en' ? 'cs' : 'en';
    out.push({ id: 'set:lang', label: t('cmdk.language', { name: other === 'cs' ? 'Čeština' : 'English' }), words: 'language jazyk english čeština', run: () => { s.lang.value = other; s.prefs.set('lang', other); } });
    const theme = s.theme.value === 'dark' ? 'light' : 'dark';
    out.push({ id: 'set:theme', label: t('cmdk.theme', { name: t(theme === 'dark' ? 'cmdk.dark' : 'cmdk.light') }), words: 'theme motiv dark light tmavý světlý', run: () => { s.theme.value = theme; s.prefs.set('theme', theme); } });
    out.push({
      id: 'set:contrast', label: t(s.highContrast.value ? 'cmdk.contrastOff' : 'cmdk.contrastOn'), words: 'contrast kontrast',
      run: () => { s.highContrast.value = !s.highContrast.value; s.prefs.set('contrast', s.highContrast.value ? 'high' : 'standard'); },
    });
    for (const [k, label] of TOGGLES) {
      out.push({ id: `set:${k}`, label: `${t(label)}: ${t(p[k] ? 'cmdk.turnOff' : 'cmdk.turnOn')}`, detail: t('cmdk.preference'), words: k, run: () => setPref(k, !p[k]) });
    }
    for (const k of Object.keys(CHOICES) as Choice[]) {
      const [label, options] = CHOICES[k];
      for (const [value, text] of options) {
        if (p[k] === value) continue;
        out.push({ id: `set:${k}:${value}`, label: `${t(label)}: ${t(text)}`, detail: t('cmdk.preference'), words: `${k} ${value}`, run: () => setPref(k, value as never) });
      }
    }
    return out;
  },
};

const documents: PaletteSource = {
  id: 'documents',
  title: 'cmdk.documents',
  order: 50,
  items: () => s.projects.value.filter((p) => p.id !== s.project.value?.id).map((p) => ({
    id: `doc:${p.id}`, label: displayName(p), detail: p.name, run: () => openProject(p.id),
  })),
};

export const PALETTE_SOURCES: PaletteSource[] = [commands, blocks, placesSource, settings, documents];
