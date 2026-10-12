/** Guard in the browser: the CLI's checks, in the same order, on the outputs the document asks for. */
import { outputsOf } from '@libka/model';
import { AXE_RULES_OFF, AXE_TAGS, mergeScans, type ContrastArgs, type ScanResult } from '@libka/guard/scan';
import * as s from '../state/store.ts';
import { agent, forceHighContrast, frame, load } from './frames.ts';
import { standInPictures } from './docx.ts';

let guardTimer: ReturnType<typeof setTimeout> | undefined;
let guardRun = 0;
/** Runs Guard a moment after the last change (called when the slides have been fitted). */
export function scheduleGuard(): void {
  clearTimeout(guardTimer);
  guardTimer = setTimeout(runGuard, 300);   // it follows the slide fitting, which has already waited for a pause
}

interface AxeResult { passes: unknown[]; violations: { id: string; help: string; nodes: { target: string[] }[] }[] }

export async function runGuard(): Promise<void> {
  const run = ++guardRun;
  s.guardRunning.value = true;
  delete document.documentElement.dataset.guard;
  const checks: s.Check[] = [];
  // the outputs the document asks for, as the CLI builds them: the web page, the slides, the Word file
  const want = outputsOf(s.doc.value?.meta ?? {});
  const pages = ([['manual', s.html.value], ['deck', s.deckHtml.value]] as const).filter(([target]) => want.includes(target === 'manual' ? 'web' : 'deck'));
  const guardFrame = frame('guard-frame');
  try {
    for (const [target, html] of pages) {
      // the same sequence as the CLI: as loaded, then with every tab and answer shown
      let win = await load(guardFrame, html, { axe: true });
      const axe = (win as unknown as { axe: { run: (ctx: Document, o: object) => Promise<AxeResult> } }).axe;
      const runAxe = async (): Promise<ScanResult> => {
        const r = await axe.run(win.document, { runOnly: { type: 'tag', values: [...AXE_TAGS] }, rules: { ...AXE_RULES_OFF }, resultTypes: ['violations', 'passes'], preload: false });
        return { checked: r.passes.length + r.violations.length, skipped: 0,
          violations: r.violations.flatMap((v) => v.nodes.map((n) => ({ rule: v.id, message: v.help, target: n.target.join(' ') }))) };
      };
      const contrast = (args: ContrastArgs) => agent(win).scanContrast(args);
      let a = await runAxe();
      let c = contrast({ normal: 4.5, large: 3 });
      if (agent(win).expandPage()) {
        await agent(win).settle();
        a = mergeScans(a, await runAxe());
        c = mergeScans(c, contrast({ normal: 4.5, large: 3 }));
      }
      if (run !== guardRun) return;
      checks.push({ target, id: 'axe', mode: 'standard', ...a });
      checks.push({ target, id: 'contrast', mode: 'standard', ...c });
      const structure: s.Check = { target, id: 'structure', mode: 'standard', ...agent(win).scanStructure() };
      checks.push(structure);
      // reflow, as the CLI checks it: the page loaded 320 CSS pixels wide, a deck fitted to it as a reader sees it
      guardFrame.classList.add('st-narrow');
      try {
        win = await load(guardFrame, html, { showAll: false });
        const reflow = agent(win).scanReflow();
        structure.checked += reflow.checked;
        structure.violations = [...structure.violations, ...reflow.violations];
      } finally {
        guardFrame.classList.remove('st-narrow');
      }
      if (run !== guardRun) return;
      win = await load(guardFrame, forceHighContrast(html));
      if (run !== guardRun) return;
      let m = contrast({ normal: 7, large: 4.5 });
      if (agent(win).expandPage()) {
        await agent(win).settle();
        m = mergeScans(m, contrast({ normal: 7, large: 4.5 }));
      }
      checks.push({ target, id: 'contrast', mode: 'more-contrast', ...m });
    }
    const doc = s.doc.value;
    if (want.includes('docx') && doc) {
      // the structure is what is checked, so stand-in pictures carry the real alternative text (the download draws them)
      const [{ renderDocx }, { checkDocx }] = await Promise.all([import('@libka/docx'), import('@libka/guard/docx')]);
      const docx = await renderDocx(doc, standInPictures());
      if (run !== guardRun) return;
      const { violations, checked, skipped } = checkDocx(docx);
      checks.push({ target: 'docx', id: 'docx', mode: 'standard', checked, skipped, violations });
    }
  } catch (e) {
    console.error('LibKa Studio: Guard failed', e);
  }
  if (run !== guardRun) return;
  s.checks.value = checks;
  s.guardRunning.value = false;
  document.documentElement.dataset.guard = 'done';   // for tests and automation
}
