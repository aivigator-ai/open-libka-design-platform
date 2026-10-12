---
title: "LibKa Studio: Accessibility Conformance Report"
subtitle: EU edition, WCAG 2.2 level A and AA, EN 301 549 v4.1.1 clause 9 (web)
status: Draft
lang: en
---

:::callout[A self-audit, generated from its evidence]{variant=important}
This report describes the LibKa Studio app itself, not the documents made with it (`docs/acr/libka-outputs.md` covers those). It is generated from `apps/studio/audit/audit.ts`, where every criterion names its evidence: Studio tests (a test checks they exist; they run on every change, except the NVDA screen-reader tests, which run on request on Windows and last ran on 2026-10-05), Guard on every view, and reviews by a person. It is a self-audit, not a third-party one.
:::

:::metrics
- **45** supports
- **0** partially supports
- **0** does not support
- **10** not applicable
:::

:::callout[What the results rest on]{variant=note}
Supports means the criterion is met in the combinations tested: Chrome on Windows with the keyboard alone, NVDA in English and Czech, forced colours, zoom and reflow, and touch emulation; Firefox and WebKit by smoke tests. Not tested: JAWS, Narrator, VoiceOver on macOS and iOS, TalkBack, speech input (Dragon, Voice Access), Safari on a Mac and real phones and tablets. The known limits below say the same.
:::

## Scope

LibKa Studio as built by `node apps/studio/build.mjs` and served by `libka studio`: the library, the visual, source and split editors, the Inspector, the structure tree, Problems, Guard and History, the command palette, menus and dialogs, Preferences, the tour and the tutorial, in English and Czech, light, dark, high contrast and forced colours, at desktop, tablet and phone width. Tested in Chrome on Windows, with Firefox and WebKit smoke tests. The Studio is a web application, so EN 301 549 clause 9 applies; clause 11.8 is added because it is an authoring tool. Clause 12 (documentation and support services) is not evaluated in this report.

## WCAG 2.2 and EN 301 549

:::table{caption="Success criteria, EN 301 549 v4.1.1 clause, result, how the Studio meets it and the evidence"}

| Criterion | EN 301 549 | Result | How and evidence |
|---|---|---|---|
| 1.1.1 Non-text Content (A) | 9.1.1.1 | Supports | Icons are hidden from assistive technology and every icon-only control has a name; pictures in a document show with the document's own alternative text, which the Studio asks for when it is missing. Evidence: test: studio.test.ts › passes Guard itself: axe, contrast in both modes, structure; test: visual.test.ts › passes Guard on every view: editor; test: split.test.ts › passes Guard on the new views: Split, the palette; test: quality.test.ts › keeps every state visible in forced colours; test: screen-reader.test.ts › speaks the Studio in; test: split.test.ts › in Visual mode: problem marks on blocks, fixes in the Inspector, and fields to fill. |
| 1.2.1 Audio-only and Video-only (Prerecorded) (A) | 9.1.2.1 | Not Applicable | The Studio has no audio or video of its own (videos in a document are its content, checked for its outputs). Evidence: review: every view. |
| 1.2.2 Captions (Prerecorded) (A) | 9.1.2.2 | Not Applicable | The Studio has no audio or video of its own. Evidence: review: every view. |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) (A) | 9.1.2.3 | Not Applicable | The Studio has no audio or video of its own. Evidence: review: every view. |
| 1.2.4 Captions (Live) (AA) | 9.1.2.4 | Not Applicable | The Studio has no live audio or video. Evidence: review: every view. |
| 1.2.5 Audio Description (Prerecorded) (AA) | 9.1.2.5 | Not Applicable | The Studio has no audio or video of its own. Evidence: review: every view. |
| 1.3.1 Info and Relationships (A) | 9.1.3.1 | Supports | Landmarks, headings, lists and tables with captions; tabs, trees, menus, listboxes and comboboxes with their WAI-ARIA roles and states; the editors are named text boxes; blocks in the visual editor are named groups. Evidence: test: studio.test.ts › passes Guard itself: axe, contrast in both modes, structure; test: visual.test.ts › passes Guard on every view: editor; test: split.test.ts › passes Guard on the new views: Split, the palette; test: quality.test.ts › keeps every state visible in forced colours; test: screen-reader.test.ts › speaks the Studio in. |
| 1.3.2 Meaningful Sequence (A) | 9.1.3.2 | Supports | The reading and focus order follow the layout: top bar, editor, preview, side panel; popovers and dialogs follow the control that opened them. Evidence: test: quality.test.ts › never hides the focused control; review: the order of every view, read in the accessibility tree. |
| 1.3.3 Sensory Characteristics (A) | 9.1.3.3 | Supports | Instructions name the control ("Select Document properties", "the Problems tab"), never only its shape, colour or place. Evidence: review: the tour, the tutorial, help texts and messages in both languages. |
| 1.3.4 Orientation (AA) | 9.1.3.4 | Supports | No orientation is locked; phone and tablet layouts work upright and sideways. Evidence: test: quality.test.ts › works by touch on a; test: studio.test.ts › fits a phone screen without sideways scrolling. |
| 1.3.5 Identify Input Purpose (AA) | 9.1.3.5 | Not Applicable | The Studio asks nothing about its user (no names, addresses or accounts). Evidence: review: every field. |
| 1.4.1 Use of Color (A) | 9.1.4.1 | Supports | States are never colour alone: pressed buttons are announced and outlined in forced colours, problems carry a count and words ("! 2", "4 to fix"), checks a word and a mark. Evidence: test: quality.test.ts › keeps every state visible in forced colours; review: screenshots in light, dark, high contrast and forced colours. |
| 1.4.2 Audio Control (A) | 9.1.4.2 | Not Applicable | The Studio plays no sound of any kind. Evidence: review: every view. |
| 1.4.3 Contrast (Minimum) (AA) | 9.1.4.3 | Supports | All colours come from the tokens, whose text contrast is gated at 4.5:1 (7:1 in high contrast) by the build; Guard measures every text of the Studio's views in both modes. Evidence: test: studio.test.ts › passes Guard itself: axe, contrast in both modes, structure; test: visual.test.ts › passes Guard on every view: editor; test: split.test.ts › passes Guard on the new views: Split, the palette; test: quality.test.ts › keeps every state visible in forced colours. |
| 1.4.4 Resize Text (AA) | 9.1.4.4 | Supports | Text is sized in relative units; at 200% zoom the Studio takes its tablet or phone layout, and it reflows at 320 CSS pixels (which covers 400%). Evidence: test: quality.test.ts › reflows at 320 px wide; test: studio.test.ts › fits a phone screen without sideways scrolling. |
| 1.4.5 Images of Text (AA) | 9.1.4.5 | Supports | No images of text: labels are text, icons are drawn shapes. Evidence: review: every view. |
| 1.4.10 Reflow (AA) | 9.1.4.10 | Supports | At 320 CSS pixels everything is in one column with no sideways scrolling; a wide table in a document and the slide preview scroll inside their own frame, which WCAG allows for content that needs two dimensions. Evidence: test: quality.test.ts › reflows at 320 px wide; test: studio.test.ts › fits a phone screen without sideways scrolling. |
| 1.4.11 Non-text Contrast (AA) | 9.1.4.11 | Supports | Text fields have a boundary of at least 3:1 (the new control-border token, gated by the build), the focus ring at least 3:1 (gated), and states keep their outline in forced colours. Buttons are known by their text. Evidence: test: quality.test.ts › gives every text field a boundary of 3:1; test: quality.test.ts › keeps every state visible in forced colours. |
| 1.4.12 Text Spacing (AA) | 9.1.4.12 | Supports | With WCAG's larger line, letter, word and paragraph spacing, no label is cut and nothing overlaps. Evidence: test: quality.test.ts › keeps every label whole with more text spacing. |
| 1.4.13 Content on Hover or Focus (AA) | 9.1.4.13 | Supports | What appears on hover (block handles) stays while the pointer is over it, does not cover the text, and has a keyboard path; tooltips are the browser's own. Evidence: review: handles, menus and popovers. |
| 2.1.1 Keyboard (A) | 9.2.1.1 | Supports | Every action works from the keyboard: blocks as objects (select, move, duplicate, delete), menus, the Inspector, the structure tree, the palette, the tour and every dialog; every drag has a key and a click path. Evidence: test: visual.test.ts › works by keyboard alone: select, climb, go in, move, extend, duplicate, delete, undo; test: visual.test.ts › the structure tree follows the selection and is driven by keyboard; test: onboarding.test.ts › shows the tour on the first visit, by keyboard; test: split.test.ts › the command palette: Ctrl+K and F1; test: split.test.ts › Ctrl+K on selected text makes a link, in both editors. |
| 2.1.2 No Keyboard Trap (A) | 9.2.1.2 | Supports | Tab leaves both editors (it is not taken for indenting); dialogs close with Escape and return the focus; no component keeps the focus. Evidence: test: quality.test.ts › never hides the focused control; test: visual.test.ts › works by keyboard alone: select, climb, go in, move, extend, duplicate, delete, undo; test: visual.test.ts › the structure tree follows the selection and is driven by keyboard; test: onboarding.test.ts › shows the tour on the first visit, by keyboard; test: split.test.ts › the command palette: Ctrl+K and F1. |
| 2.1.4 Character Key Shortcuts (A) | 9.2.1.4 | Supports | Single-key shortcuts work only while the editor has the focus ("/" in an empty paragraph, "?" on a selected block); the keys of the Studio's commands can be changed or removed in Preferences. Evidence: test: split.test.ts › changes the keys of commands in Preferences; test: visual.test.ts › lists the shortcuts on. |
| 2.2.1 Timing Adjustable (A) | 9.2.2.1 | Supports | No time limits. Short notices disappear after a few seconds but say nothing that is not also shown or announced elsewhere. Evidence: review: notices and announcements. |
| 2.2.2 Pause, Stop, Hide (A) | 9.2.2.2 | Supports | Nothing moves, blinks or scrolls on its own except the text cursor; motion follows the reduced-motion preference. Evidence: review: every view. |
| 2.3.1 Three Flashes or Below Threshold (A) | 9.2.3.1 | Supports | Nothing in the Studio flashes or blinks. Evidence: review: every view. |
| 2.4.1 Bypass Blocks (A) | 9.2.4.1 | Supports | A skip link goes to the editor (or the library); landmarks and headings mark every part. Evidence: test: studio.test.ts › passes Guard itself: axe, contrast in both modes, structure; test: visual.test.ts › passes Guard on every view: editor; test: split.test.ts › passes Guard on the new views: Split, the palette; test: quality.test.ts › keeps every state visible in forced colours. |
| 2.4.2 Page Titled (A) | 9.2.4.2 | Supports | The window title names the open document ("Writing a LibKa manual – LibKa Studio"). Evidence: test: quality.test.ts › names the window after the document. |
| 2.4.3 Focus Order (A) | 9.2.4.3 | Supports | The focus moves in the order of the layout; dialogs and menus take the focus and return it to where they were opened; fixes move the focus to the field they need. Evidence: test: visual.test.ts › works by keyboard alone: select, climb, go in, move, extend, duplicate, delete, undo; test: visual.test.ts › the structure tree follows the selection and is driven by keyboard; test: onboarding.test.ts › shows the tour on the first visit, by keyboard; test: split.test.ts › the command palette: Ctrl+K and F1; test: split.test.ts › in Visual mode: problem marks on blocks, fixes in the Inspector, and fields to fill. |
| 2.4.4 Link Purpose (In Context) (A) | 9.2.4.4 | Supports | The few links (the document path in the Inspector, a block's place) are named by their text. Evidence: test: studio.test.ts › passes Guard itself: axe, contrast in both modes, structure; test: visual.test.ts › passes Guard on every view: editor; test: split.test.ts › passes Guard on the new views: Split, the palette; test: quality.test.ts › keeps every state visible in forced colours. |
| 2.4.5 Multiple Ways (AA) | 9.2.4.5 | Not Applicable | The Studio is one application view, not a set of pages (its palette and menus offer several ways to every command anyway). Evidence: review: the views. |
| 2.4.6 Headings and Labels (AA) | 9.2.4.6 | Supports | Headings name their part; labels say what a field is for, with a help line in English or Czech. Evidence: test: split.test.ts › works in Czech: names, summaries and help from the registry; review: labels and headings. |
| 2.4.7 Focus Visible (AA) | 9.2.4.7 | Supports | Every focusable control shows a focus ring (3:1 at least, gated by the build), also in forced colours. Evidence: test: quality.test.ts › keeps every state visible in forced colours; review: screenshots while tabbing in light, dark and forced colours. |
| 2.4.11 Focus Not Obscured (Minimum) (AA) | 9.2.4.11 | Supports | The focused control is never hidden behind the top bar, a popover or the side panel. Evidence: test: quality.test.ts › never hides the focused control. |
| 2.5.1 Pointer Gestures (A) | 9.2.5.1 | Supports | No path or multi-finger gestures; a long press (one finger, held) has a tap alternative (the block handle). Evidence: test: quality.test.ts › works by touch on a. |
| 2.5.2 Pointer Cancellation (A) | 9.2.5.2 | Supports | Actions run when the pointer is released; pressing a handle only selects its block (undone by moving away). Evidence: review: handles, buttons and menus. |
| 2.5.3 Label in Name (A) | 9.2.5.3 | Supports | A control's name starts with its visible text; icon buttons that show no text on a phone keep the same name. Evidence: test: quality.test.ts › names every labelled control with its visible text. |
| 2.5.4 Motion Actuation (A) | 9.2.5.4 | Not Applicable | Nothing works by moving or shaking the device. Evidence: review: every view. |
| 2.5.7 Dragging Movements (AA) | 9.2.5.7 | Supports | Every drag has a single-pointer alternative: blocks move by the handle's menu or the keyboard, blocks insert by a click on the palette, pictures by the file menu or pasting. Evidence: test: visual.test.ts › the handle; test: quality.test.ts › works by touch on a. |
| 2.5.8 Target Size (Minimum) (AA) | 9.2.5.8 | Supports | Targets are at least 24 by 24 pixels or spaced as WCAG allows; checked by axe on every view. Evidence: test: studio.test.ts › passes Guard itself: axe, contrast in both modes, structure; test: visual.test.ts › passes Guard on every view: editor; test: split.test.ts › passes Guard on the new views: Split, the palette; test: quality.test.ts › keeps every state visible in forced colours. |
| 3.1.1 Language of Page (A) | 9.3.1.1 | Supports | The page's language follows the interface language (English or Czech). Evidence: test: studio.test.ts › switches language, theme and contrast. |
| 3.1.2 Language of Parts (AA) | 9.3.1.2 | Supports | The document's text in both editors is marked with the document's own language, so a Czech document is read as Czech in the English interface; the editor's own words keep the interface's. The messages of the source checks and of Guard, English in both interfaces, are marked as English. Evidence: test: quality.test.ts › names the window after the document and reads the document text in its own language; test: split.test.ts › applies every kind of text fix from the Problems tab in Source mode. |
| 3.2.1 On Focus (A) | 9.3.2.1 | Supports | Moving the focus never opens, submits or switches anything. Evidence: test: visual.test.ts › works by keyboard alone: select, climb, go in, move, extend, duplicate, delete, undo; test: visual.test.ts › the structure tree follows the selection and is driven by keyboard; test: onboarding.test.ts › shows the tour on the first visit, by keyboard; test: split.test.ts › the command palette: Ctrl+K and F1. |
| 3.2.2 On Input (A) | 9.3.2.2 | Supports | Changing a setting changes that setting only (a block's type, a document property); nothing moves the author elsewhere. Evidence: review: the Inspector, Preferences and the outputs. |
| 3.2.3 Consistent Navigation (AA) | 9.3.2.3 | Supports | The top bar, the editor switch and the side panel stay in the same place and order on every view. Evidence: review: every view. |
| 3.2.4 Consistent Identification (AA) | 9.3.2.4 | Supports | The same command has the same name everywhere (menu, palette, keys list), in each language. Evidence: test: split.test.ts › the command palette: Ctrl+K and F1; review: menus and the palette. |
| 3.2.6 Consistent Help (A) | 9.3.2.6 | Supports | Help (the tour, the tutorial, the palette, the keys and the accessibility statement) is in the same place on every view. Evidence: test: onboarding.test.ts › shows the tour on the first visit, by keyboard. |
| 3.3.1 Error Identification (A) | 9.3.3.1 | Supports | Problems are described in text with their line; a required field says "Required" and is marked invalid until filled. Evidence: test: studio.test.ts › shows a source problem on its line, marks the line and jumps there; test: split.test.ts › in Visual mode: problem marks on blocks. |
| 3.3.2 Labels or Instructions (A) | 9.3.3.2 | Supports | Every field has a visible label and a help line; required ones say so. Evidence: test: studio.test.ts › passes Guard itself: axe, contrast in both modes, structure; test: visual.test.ts › passes Guard on every view: editor; test: split.test.ts › passes Guard on the new views: Split, the palette; test: quality.test.ts › keeps every state visible in forced colours; test: split.test.ts › works in Czech: names, summaries and help from the registry. |
| 3.3.3 Error Suggestion (AA) | 9.3.3.3 | Supports | Problems offer fixes where they are safe and say how to put them right otherwise; Guard's findings say how to fix them. Evidence: test: split.test.ts › applies every kind of text fix from the Problems tab; test: split.test.ts › explains Guard findings in plain words. |
| 3.3.4 Error Prevention (Legal, Financial, Data) (AA) | 9.3.3.4 | Supports | Nothing legal or financial; deleting a document asks first, and every change can be undone or restored from History. Evidence: test: studio.test.ts › keeps versions: names one, compares it with the text, restores it. |
| 3.3.7 Redundant Entry (A) | 9.3.3.7 | Supports | Nothing is asked twice: preferences and choices are remembered, a document's properties are its own. Evidence: test: visual.test.ts › preferences switch each ability on and off. |
| 3.3.8 Accessible Authentication (Minimum) (AA) | 9.3.3.8 | Not Applicable | There is no sign-in: no account, no password. Evidence: review: every view. |
| 4.1.2 Name, Role, Value (A) | 9.4.1.2 | Supports | Every control is a native element or has its WAI-ARIA role, name, state and value; checked by axe on every view and heard with NVDA. Evidence: test: studio.test.ts › passes Guard itself: axe, contrast in both modes, structure; test: visual.test.ts › passes Guard on every view: editor; test: split.test.ts › passes Guard on the new views: Split, the palette; test: quality.test.ts › keeps every state visible in forced colours; test: screen-reader.test.ts › speaks the Studio in. |
| 4.1.3 Status Messages (AA) | 9.4.1.3 | Supports | Moves, deletions, inserts, fixes, the check status, saving and the palette's result count are announced through live regions without moving the focus. Evidence: test: screen-reader.test.ts › speaks the Studio in; test: visual.test.ts › works by keyboard alone: select, climb, go in, move, extend, duplicate, delete, undo. |

:::

## Authoring tools (EN 301 549 clause 11.8)

The Studio is an authoring tool, so clause 11.8 applies to it as well as clause 9.

:::table{caption="EN 301 549 clause 11.8, result, how the Studio meets it and the evidence"}

| Clause | Result | How and evidence |
|---|---|---|
| 11.8.1 Content technology | Supports | LibKa Markdown and every output the Studio makes (web page, slides, Word file) carry the information accessibility needs: structure, alternative text, language, table headers. |
| 11.8.2 Accessible content creation | Supports | Every block comes from the registry with its accessibility rules; pictures, charts and diagrams cannot be added without their text alternative; the same checks as the build (Guard) run while the author types. Evidence: test: split.test.ts › in Visual mode: problem marks on blocks, fixes in the Inspector, and fields to fill (never made-up text). |
| 11.8.3 Preservation of accessibility information in transformations | Supports | Switching between the visual and the source editor keeps every untouched block byte for byte, and the Word file keeps headings, lists, table headers, alternative text and language. Evidence: test: visual.test.ts › opens a new document in Visual, as blocks, and keeps the Markdown byte for byte while untouched. |
| 11.8.4 Repair assistance | Supports | Every problem has a code, and where it is safe a one-click fix that can be undone; a fix that needs the author's words (alternative text, a caption) opens the field instead of inventing them; Guard findings are explained in plain words. Evidence: test: split.test.ts › applies every kind of text fix from the Problems tab in Source mode, each one undoable step; test: split.test.ts › explains Guard findings in plain words, with a way to the text. |
| 11.8.5 Templates | Not Applicable | The Studio offers no templates; its example document passes every check. |

:::

## Known limits

- Screen readers: NVDA with Chrome on Windows is tested; VoiceOver on macOS and iOS, JAWS and Narrator are not.
- Firefox and Safari (WebKit) are covered by smoke tests (editing in both modes), not by the full suite.
- Touch is tested with touch emulation in Chrome, not on real phones and tablets.
- Problem messages from the document checks are in English in the Czech interface, marked as English for screen readers (their fixes and explanations are in both languages).

## How it was evaluated

Automated, on every change: axe-core 4 with the WCAG 2.0, 2.1 and 2.2 A/AA rules and Guard's contrast and structure rules on every view of the Studio (standard and high contrast, light and dark, forced colours); keyboard-only flows; reflow, text spacing, focus visibility and field contrast checks; the performance budget. With a screen reader: NVDA driven by tests in English and Czech (run on request on Windows: `LIBKA_SCREEN_READER=1`). By a person: each review named in the evidence, last done on 2026-10-05.
