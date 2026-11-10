/**
 * The Studio's WCAG 2.2 A/AA self-audit: for every success criterion, the result, how the Studio meets
 * it, and the evidence: tests by file and title (a test checks that each one exists), Guard on every view, or a review
 * by a person. `build-acr.ts` writes docs/acr/studio.md from it; the Studio's Help menu shows a short statement.
 */
import { enClause, WCAG22 } from '@libka/guard/wcag';

export type Result = 'Supports' | 'Partially Supports' | 'Does Not Support' | 'Not Applicable';

/** Evidence: a test (file and the start of its title), or a review by a person (what was looked at). */
export type Evidence = { test: string; title: string } | { review: string };

export interface Entry { result: Result; how: string; evidence: Evidence[] }

const t = (test: string, title: string): Evidence => ({ test, title });
const review = (what: string): Evidence => ({ review: what });

/** Guard (axe-core WCAG 2.2 A/AA, text contrast in both modes, structure rules) on the Studio's views. */
const GUARD: Evidence[] = [
  t('studio.test.ts', 'passes Guard itself: axe, contrast in both modes, structure'),
  t('visual.test.ts', 'passes Guard on every view: editor'),
  t('split.test.ts', 'passes Guard on the new views: Split, the palette'),
  t('quality.test.ts', 'keeps every state visible in forced colours'),
];
const NVDA: Evidence = t('screen-reader.test.ts', 'speaks the Studio in');
const KEYBOARD: Evidence[] = [
  t('visual.test.ts', 'works by keyboard alone: select, climb, go in, move, extend, duplicate, delete, undo'),
  t('visual.test.ts', 'the Outline lists the headings; every block as a tree'),
  t('quality.test.ts', 'has its regions as landmarks, F6 through them, a keyboard splitter'),
  t('onboarding.test.ts', 'shows the tour on the first visit, by keyboard'),
  t('split.test.ts', 'the command palette: Ctrl+K and F1'),
];

export const AUDIT: Readonly<Record<string, Entry>> = {
  '1.1.1': { result: 'Supports', how: 'Icons are hidden from assistive technology and every icon-only control has a name; pictures in a document show with the document\'s own alternative text, which the Studio asks for when it is missing.', evidence: [...GUARD, NVDA, t('split.test.ts', 'in Visual mode: problem marks on blocks open Checks on the block, its fixes, and fields to fill')] },
  '1.2.1': { result: 'Not Applicable', how: 'The Studio has no audio or video of its own (videos in a document are its content, checked for its outputs).', evidence: [review('every view')] },
  '1.2.2': { result: 'Not Applicable', how: 'The Studio has no audio or video of its own.', evidence: [review('every view')] },
  '1.2.3': { result: 'Not Applicable', how: 'The Studio has no audio or video of its own.', evidence: [review('every view')] },
  '1.2.4': { result: 'Not Applicable', how: 'The Studio has no live audio or video.', evidence: [review('every view')] },
  '1.2.5': { result: 'Not Applicable', how: 'The Studio has no audio or video of its own.', evidence: [review('every view')] },
  '1.3.1': { result: 'Supports', how: 'Landmarks, headings, lists and tables with captions; tabs, trees, menus, listboxes and comboboxes with their WAI-ARIA roles and states; the editors are named text boxes; blocks in the visual editor are named groups.', evidence: [...GUARD, NVDA] },
  '1.3.2': { result: 'Supports', how: 'The reading and focus order follow the layout: top bar, left pane, editor, companion pane, status bar; popovers and dialogs follow the control that opened them.', evidence: [t('quality.test.ts', 'never hides the focused control'), review('the order of every view, read in the accessibility tree')] },
  '1.3.3': { result: 'Supports', how: 'Instructions name the control ("Select Document properties", "the Checks tab"), never only its shape, colour or place. The texts new or changed in 2.0.3, among them the tour, the tutorial, help texts and messages, were written to name their controls; the person\'s review predates them and no test checks their wording, so this rests on how they were written.', evidence: [review('the tour, the tutorial, help texts and messages in both languages')] },
  '1.3.4': { result: 'Supports', how: 'No orientation is locked; phone and tablet layouts work upright and sideways.', evidence: [t('quality.test.ts', 'works by touch on a'), t('studio.test.ts', 'fits a phone screen without sideways scrolling')] },
  '1.3.5': { result: 'Not Applicable', how: 'The Studio asks nothing about its user (no names, addresses or accounts).', evidence: [review('every field')] },
  '1.4.1': { result: 'Supports', how: 'States are never colour alone: pressed buttons are announced and outlined in forced colours, problems carry a count and words ("! 2", "4 to fix"), checks a word and a mark.', evidence: [t('quality.test.ts', 'keeps every state visible in forced colours'), review('screenshots in light, dark, high contrast and forced colours')] },
  '1.4.2': { result: 'Not Applicable', how: 'The Studio plays no sound of any kind.', evidence: [review('every view')] },
  '1.4.3': { result: 'Supports', how: 'All colours come from the tokens, whose text contrast is gated at 4.5:1 (7:1 in high contrast) by the build; Guard measures every text of the Studio\'s views in both modes.', evidence: [...GUARD] },
  '1.4.4': { result: 'Supports', how: 'Text is sized in relative units; at 200% zoom the Studio takes its tablet or phone layout, and it reflows at 320 CSS pixels (which covers 400%).', evidence: [t('quality.test.ts', 'reflows at 320 px wide'), t('studio.test.ts', 'fits a phone screen without sideways scrolling')] },
  '1.4.5': { result: 'Supports', how: 'No images of text: labels are text, icons are drawn shapes.', evidence: [review('every view')] },
  '1.4.10': { result: 'Supports', how: 'At 320 CSS pixels everything is in one column with no sideways scrolling: one app-bar row whose ⋯ menu stays inside the screen, one region at a time, and the regions in a bar at the bottom; a wide table in a document and the slide preview scroll inside their own frame, which WCAG allows for content that needs two dimensions.', evidence: [t('quality.test.ts', 'reflows at 320 px wide'), t('quality.test.ts', 'on a phone: one app-bar row'), t('studio.test.ts', 'fits a phone screen without sideways scrolling')] },
  '1.4.11': { result: 'Supports', how: 'Text fields have a boundary of at least 3:1 (the new control-border token, gated by the build), the focus ring at least 3:1 (gated), and states keep their outline in forced colours. Buttons are known by their text.', evidence: [t('quality.test.ts', 'gives every text field a boundary of 3:1'), t('quality.test.ts', 'keeps every state visible in forced colours')] },
  '1.4.12': { result: 'Supports', how: 'With WCAG\'s larger line, letter, word and paragraph spacing, no label is cut and nothing overlaps.', evidence: [t('quality.test.ts', 'keeps every label whole with more text spacing')] },
  '1.4.13': { result: 'Supports', how: 'What appears on hover (block handles) stays while the pointer is over it, does not cover the text, and has a keyboard path; tooltips are the browser\'s own.', evidence: [review('handles, menus and popovers')] },
  '2.1.1': { result: 'Supports', how: 'Every action works from the keyboard: blocks as objects (select, move, duplicate, delete), menus, the modes, Properties, the Outline and its tree of blocks, the Catalog, the command palette, the panes and their splitter, the tour and every dialog; every drag has a key and a click path.', evidence: [...KEYBOARD, t('split.test.ts', 'Ctrl+K on selected text makes a link, in both editors')] },
  '2.1.2': { result: 'Supports', how: 'Tab leaves both editors (it is not taken for indenting); dialogs close with Escape and return the focus; no component keeps the focus.', evidence: [t('quality.test.ts', 'never hides the focused control'), ...KEYBOARD] },
  '2.1.4': { result: 'Supports', how: 'Single-key shortcuts work only while the editor has the focus ("/" in an empty paragraph, "?" on a selected block); the keys of the Studio\'s commands can be changed or removed in Preferences.', evidence: [t('split.test.ts', 'changes the keys of commands in Preferences'), t('visual.test.ts', 'lists the shortcuts on')] },
  '2.2.1': { result: 'Supports', how: 'No time limits. Short notices disappear after a few seconds but say nothing that is not also shown or announced elsewhere.', evidence: [review('notices and announcements')] },
  '2.2.2': { result: 'Supports', how: 'Nothing moves, blinks or scrolls on its own except the text cursor; motion follows the reduced-motion preference. The one thing that updates on its own is the timer in Present\'s presenter view, which opens only when the presenter asks for it (P or the presenter-view button) and is essential to it. Present is new in 2.0.3, after the person\'s review: that the timer is hidden until then comes from the deck\'s code, and a test checks it shows in the presenter view.', evidence: [review('every view'), t('../../../packages/cli/test/deck.test.ts', 'keeps a presenter view in sync both ways')] },
  '2.3.1': { result: 'Supports', how: 'Nothing in the Studio flashes or blinks.', evidence: [review('every view')] },
  '2.4.1': { result: 'Supports', how: 'A skip link goes to the editor (or the library); landmarks and headings mark every part: the top bar, the left pane, the editor (the one main region), the companion pane named after its tab, the status bar. F6 and Shift+F6 move between the regions shown.', evidence: [...GUARD, t('quality.test.ts', 'has its regions as landmarks, F6 through them, a keyboard splitter')] },
  '2.4.2': { result: 'Supports', how: 'The window title names the open document ("Writing a LibKa manual – LibKa Studio").', evidence: [t('quality.test.ts', 'names the window after the document')] },
  '2.4.3': { result: 'Supports', how: 'The focus moves in the order of the layout; dialogs and menus take the focus and return it to where they were opened; fixes move the focus to the field they need.', evidence: [...KEYBOARD, t('split.test.ts', 'in Visual mode: problem marks on blocks open Checks on the block, its fixes, and fields to fill')] },
  '2.4.4': { result: 'Supports', how: 'The few links (the document path in Properties, a block\'s place) are named by their text.', evidence: [...GUARD] },
  '2.4.5': { result: 'Not Applicable', how: 'The Studio is one application view, not a set of pages (its palette and menus offer several ways to every command anyway).', evidence: [review('the views')] },
  '2.4.6': { result: 'Supports', how: 'Headings name their part; labels say what a field is for, with a help line in English or Czech.', evidence: [t('split.test.ts', 'works in Czech: names, summaries and help from the registry'), review('labels and headings')] },
  '2.4.7': { result: 'Supports', how: 'Every focusable control shows a focus ring (3:1 at least, gated by the build), also in forced colours.', evidence: [t('quality.test.ts', 'keeps every state visible in forced colours'), review('screenshots while tabbing in light, dark and forced colours')] },
  '2.4.11': { result: 'Supports', how: 'The focused control is never hidden behind the top bar, a popover or a pane: the panes push the editor aside, never cover it; Focus\'s dock and the phone\'s bottom bar are rows of the layout under the text, never layers over it.', evidence: [t('quality.test.ts', 'never hides the focused control'), t('quality.test.ts', 'Focus is the page alone with a dock'), t('quality.test.ts', 'on a phone: one app-bar row')] },
  '2.5.1': { result: 'Supports', how: 'No path or multi-finger gestures; a long press (one finger, held) has a tap alternative (the block handle).', evidence: [t('quality.test.ts', 'works by touch on a')] },
  '2.5.2': { result: 'Supports', how: 'Actions run when the pointer is released; pressing a handle only selects its block (undone by moving away).', evidence: [review('handles, buttons and menus')] },
  '2.5.3': { result: 'Supports', how: 'A control\'s name starts with its visible text; icon buttons that show no text on a phone keep the same name.', evidence: [t('quality.test.ts', 'names every labelled control with its visible text')] },
  '2.5.4': { result: 'Not Applicable', how: 'Nothing works by moving or shaking the device.', evidence: [review('every view')] },
  '2.5.7': { result: 'Supports', how: 'Every drag has a single-pointer alternative: blocks move by the handle\'s menu or the keyboard, blocks insert by a click in the block picker (+ Block) or in the Catalog (dragging from it is optional), pictures by pasting them (Ctrl+V or the browser\'s Paste) as well as by dropping a file; the companion pane is resized by the splitter\'s arrow keys as well as by dragging, and by one click in View (Narrow, Medium, Wide).', evidence: [t('visual.test.ts', 'the handle'), t('quality.test.ts', 'works by touch on a'), t('quality.test.ts', 'has its regions as landmarks, F6 through them, a keyboard splitter'), t('quality.test.ts', 'Focus is the page alone with a dock')] },
  '2.5.8': { result: 'Supports', how: 'Targets are at least 24 by 24 pixels or spaced as WCAG allows; checked by axe on every view. An open menu never leaves a control under it a sliver: its list moves aside until each control is covered or keeps 24 pixels.', evidence: [...GUARD, t('visual.test.ts', 'opens the menus of the top bar without leaving a control under them a sliver')] },
  '3.1.1': { result: 'Supports', how: 'The page\'s language follows the interface language (English or Czech).', evidence: [t('studio.test.ts', 'switches language, theme and contrast')] },
  '3.1.2': { result: 'Supports', how: 'The document\'s text in both editors is marked with the document\'s own language, so a Czech document is read as Czech in the English interface; the editor\'s own words keep the interface\'s. The messages of the source checks and of Guard, English in both interfaces, are marked as English.', evidence: [t('quality.test.ts', 'names the window after the document and reads the document text in its own language'), t('split.test.ts', 'applies every kind of text fix from Checks in Source mode')] },
  '3.2.1': { result: 'Supports', how: 'Moving the focus never opens, submits or switches anything.', evidence: [...KEYBOARD] },
  '3.2.2': { result: 'Supports', how: 'Changing a setting changes that setting only (a block\'s type, a document property, the outputs, which are in Properties since 2.0.3); nothing moves the author elsewhere.', evidence: [review('Properties, Preferences and the outputs')] },
  '3.2.3': { result: 'Supports', how: 'The top bar (with the mode switch), the editor\'s toolbar and the panes stay in the same place and order in every mode and view. The modes and panes are new in 2.0.3: the person\'s review predates them and no test checks their order, so this rests on their design (one top bar and one toolbar shared by every mode).', evidence: [review('every view')] },
  '3.2.4': { result: 'Supports', how: 'The same command has the same name everywhere (menu, palette, keys list), in each language.', evidence: [t('split.test.ts', 'the command palette: Ctrl+K and F1'), review('menus and the palette')] },
  '3.2.6': { result: 'Supports', how: 'Help (the tour, the tutorial, the palette, the keys and the accessibility statement) is in the same place on every view.', evidence: [t('onboarding.test.ts', 'shows the tour on the first visit, by keyboard')] },
  '3.3.1': { result: 'Supports', how: 'Problems are described in text with their line; a required field says "Required" and is marked invalid until filled.', evidence: [t('studio.test.ts', 'shows a source problem on its line, marks the line and jumps there'), t('split.test.ts', 'in Visual mode: problem marks on blocks')] },
  '3.3.2': { result: 'Supports', how: 'Every field has a visible label and a help line; required ones say so.', evidence: [...GUARD, t('split.test.ts', 'works in Czech: names, summaries and help from the registry')] },
  '3.3.3': { result: 'Supports', how: 'Problems offer fixes where they are safe and say how to put them right otherwise; Guard\'s findings say how to fix them.', evidence: [t('split.test.ts', 'applies every kind of text fix from Checks'), t('split.test.ts', 'explains Guard findings in plain words')] },
  '3.3.4': { result: 'Supports', how: 'Nothing legal or financial; deleting a document asks first, and every change can be undone or restored from Versions.', evidence: [t('studio.test.ts', 'keeps versions: names one, compares it with the text, restores it')] },
  '3.3.7': { result: 'Supports', how: 'Nothing is asked twice: preferences and choices are remembered, a document\'s properties are its own.', evidence: [t('visual.test.ts', 'preferences switch each ability on and off')] },
  '3.3.8': { result: 'Not Applicable', how: 'There is no sign-in: no account, no password.', evidence: [review('every view')] },
  '4.1.2': { result: 'Supports', how: 'Every control is a native element or has its WAI-ARIA role, name, state and value; checked by axe on every view and heard with NVDA.', evidence: [...GUARD, NVDA] },
  '4.1.3': { result: 'Supports', how: 'Moves, deletions, inserts, fixes, the check status, saving and the palette\'s result count are announced through live regions without moving the focus.', evidence: [NVDA, t('visual.test.ts', 'works by keyboard alone: select, climb, go in, move, extend, duplicate, delete, undo')] },
};

/** What the Studio's audit does not cover (shown in the report and in the accessibility statement). */
export const LIMITS: readonly { en: string; cs: string }[] = [
  { en: 'Screen readers: NVDA with Chrome on Windows is tested; VoiceOver on macOS and iOS, JAWS and Narrator are not.',
    cs: 'Čtečky obrazovky: testuje se NVDA s Chromem ve Windows; VoiceOver v macOS a iOS, JAWS a Předčítání ne.' },
  { en: 'Firefox and Safari (WebKit) are covered by smoke tests (editing in both modes), not by the full suite.',
    cs: 'Firefox a Safari (WebKit) ověřují jen základní testy (úpravy v obou režimech), ne celá sada.' },
  { en: 'Touch is tested with touch emulation in Chrome, not on real phones and tablets.',
    cs: 'Dotykové ovládání se testuje emulací v Chromu, ne na skutečných telefonech a tabletech.' },
  { en: 'Problem messages from the document checks are in English in the Czech interface, marked as English for screen readers (their fixes and explanations are in both languages).',
    cs: 'Zprávy o problémech z kontroly dokumentu jsou i v českém rozhraní anglicky a pro čtečky obrazovky označené jako angličtina (jejich opravy a vysvětlení jsou v obou jazycích).' },
];

export function count(result: Result): number { return WCAG22.filter(({ sc }) => AUDIT[sc]?.result === result).length; }

/** When a person last reviewed the Studio: before the 2.0.3 layout, so a review's evidence says so (see "How it was evaluated"). */
export const REVIEWED = '2026-10-05';
/** When the NVDA flows last ran (on request, on Windows). */
export const NVDA_RUN = '2026-11-08';

// a test outside the Studio's own folder is named from the repository's root (packages/cli/test/…), not by ../ steps
const testName = (path: string) => path.replace(/^(\.\.\/){3}/, '');
const evidenceText = (e: Evidence) => ('test' in e ? `test: ${testName(e.test)} › ${e.title}` : `review (${REVIEWED}, before the 2.0.3 layout): ${e.review}`);

export function studioAcrMarkdown(): string {
  const rows = WCAG22.map(({ sc, title, level }) => {
    const e = AUDIT[sc]!;
    return `| ${sc} ${title} (${level}) | ${enClause(sc, 'web')} | ${e.result} | ${e.how} Evidence: ${e.evidence.map(evidenceText).join('; ')}. |`;
  });
  return [
    '---', 'title: "LibKa Studio: Accessibility Conformance Report"',
    'subtitle: EU edition, WCAG 2.2 level A and AA, EN 301 549 v4.1.1 clause 9 (web)', 'status: Draft', 'lang: en', '---', '',
    ':::callout[A self-audit, generated from its evidence]{variant=important}',
    `This report describes the LibKa Studio app itself, not the documents made with it (\`docs/acr/libka-outputs.md\` covers those). It is generated from \`apps/studio/audit/audit.ts\`, where every criterion names its evidence: tests (a name alone is a file in \`apps/studio/test/\`, a path is from the repository's root; a test checks they exist; they run on every change, except the NVDA screen-reader tests, which run on request on Windows and last ran on ${NVDA_RUN}), Guard on every view, and reviews by a person. It is a self-audit, not a third-party one.`,
    ':::', '',
    ':::metrics',
    `- **${count('Supports')}** supports`,
    `- **${count('Partially Supports')}** partially supports`,
    `- **${count('Does Not Support')}** does not support`,
    `- **${count('Not Applicable')}** not applicable`,
    ':::', '',
    ':::callout[What the results rest on]{variant=note}',
    'Supports means the criterion is met in the combinations tested: Chrome on Windows with the keyboard alone, NVDA in English and Czech, forced colours, zoom and reflow, and touch emulation; Firefox and WebKit by smoke tests. Not tested: JAWS, Narrator, VoiceOver on macOS and iOS, TalkBack, speech input (Dragon, Voice Access), Safari on a Mac and real phones and tablets. The known limits below say the same.',
    '',
    `A person last reviewed the Studio on ${REVIEWED}, before the 2.0.3 layout (the modes, the panes, Present, the phone's bottom bar and the block bar). The views new in 2.0.3 are covered by the automated checks on every change (axe-core and Guard on every view, keyboard flows, reflow, forced colours, touch) and by the NVDA flows of ${NVDA_RUN}; no person has reviewed those views. Evidence marked "review" is that review of ${REVIEWED}.`,
    ':::', '',
    '## Scope',
    '',
    'LibKa Studio as built by `node apps/studio/build.mjs` and served by `libka studio`: the library, the visual, source and split editors, the modes (Write, Blocks, Focus), the left pane (Catalog, Outline), the companion pane (Preview, Checks with the source\'s problems and Guard\'s findings in one list, Properties, Versions), Present, the command palette, menus and dialogs, Preferences, the tour and the tutorial, in English and Czech, light, dark, high contrast and forced colours, at desktop, tablet and phone width. Tested in Chrome on Windows, with Firefox and WebKit smoke tests. The Studio is a web application, so EN 301 549 clause 9 applies; clause 11.8 is added because it is an authoring tool. Clause 12 (documentation and support services) is not evaluated in this report.', '',
    '## WCAG 2.2 and EN 301 549',
    '',
    ':::table{caption="Success criteria, EN 301 549 v4.1.1 clause, result, how the Studio meets it and the evidence"}', '',
    '| Criterion | EN 301 549 | Result | How and evidence |', '|---|---|---|---|', ...rows, '', ':::', '',
    '## Authoring tools (EN 301 549 clause 11.8)',
    '',
    'The Studio is an authoring tool, so clause 11.8 applies to it as well as clause 9.',
    '',
    ':::table{caption="EN 301 549 clause 11.8, result, how the Studio meets it and the evidence"}', '',
    '| Clause | Result | How and evidence |', '|---|---|---|',
    '| 11.8.1 Content technology | Supports | LibKa Markdown and every output the Studio makes (web page, slides, Word file) carry the information accessibility needs: structure, alternative text, language, table headers. |',
    '| 11.8.2 Accessible content creation | Supports | Every block comes from the registry with its accessibility rules; pictures, charts and diagrams cannot pass the checks without their text alternative, and the Studio asks for it as soon as one is added; the page and Word checks of the build (Guard) run while the author types. Evidence: test: split.test.ts › in Visual mode: problem marks on blocks open Checks on the block, its fixes, and fields to fill (never made-up text). |',
    '| 11.8.3 Preservation of accessibility information in transformations | Supports | Switching between the visual and the source editor keeps every untouched block byte for byte, and the Word file keeps headings, lists, table headers, alternative text and language. Evidence: test: visual.test.ts › opens a new document in Visual, as blocks, and keeps the Markdown byte for byte while untouched. |',
    '| 11.8.4 Repair assistance | Supports | Every problem has a code, and where it is safe a one-click fix that can be undone; a fix that needs the author\'s words (alternative text, a caption) opens the field instead of inventing them; Guard findings are explained in plain words. Evidence: test: split.test.ts › applies every kind of text fix from Checks in Source mode, each one undoable step; test: split.test.ts › explains Guard findings in plain words, with a way to the text. |',
    '| 11.8.5 Templates | Not Applicable | The Studio offers no templates; its example document passes every check. |',
    '', ':::', '',
    '## Known limits',
    '',
    ...LIMITS.map((l) => `- ${l.en}`), '',
    '## How it was evaluated',
    '',
    `Automated, on every change: axe-core 4 with the WCAG 2.0, 2.1 and 2.2 A/AA rules and Guard's contrast and structure rules on every view of the Studio (standard and high contrast, light and dark, forced colours); keyboard-only flows; reflow, text spacing, focus visibility and field contrast checks; the performance budget. With a screen reader: NVDA driven by tests in English and Czech (run on request on Windows: \`LIBKA_SCREEN_READER=1\`; last run on ${NVDA_RUN}, both flows passed). By a person: each review named in the evidence, last done on ${REVIEWED}, before the 2.0.3 layout. The views new in 2.0.3 (the modes Write, Blocks and Focus, the panes, Present, the phone's bottom bar and the block bar) are covered by the automated checks above and the NVDA flows of ${NVDA_RUN}; no person has reviewed those views.`, '',
  ].join('\n');
}
