/**
 * The frame agent: the functions the Studio runs inside its hidden frames (Guard's scans, settling, slide measuring),
 * loaded into a frame as a file of the Studio's own (assets/frame-agent.js). Under the Studio's Content Security Policy
 * no code is made from text (no eval, no new Function), so the Studio calls these by name: `win.libkaAgent.scanContrast(…)`.
 * They are the same self-contained functions the CLI passes to Chrome, so both apply exactly the same rules.
 */
import { expandPage, scanContrast, scanReflow, scanStructure, settle } from '@libka/guard/scan';
import { measureSlides } from '@libka/render/fit';

const agent = {
  settle,
  expandPage,
  scanContrast,
  scanStructure,
  scanReflow,
  measureSlides: () => measureSlides(document),
};

export type FrameAgent = typeof agent;
(window as unknown as { libkaAgent: FrameAgent }).libkaAgent = agent;
