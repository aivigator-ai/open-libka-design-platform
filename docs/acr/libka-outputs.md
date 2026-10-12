---
title: "LibKa outputs: Accessibility Conformance Report (draft)"
subtitle: EU edition, WCAG 2.2 level A and AA, EN 301 549 v4.1.1 clauses 9 and 10
status: Draft
lang: en
---

:::callout[A draft, generated from the checks]{variant=important}
This report describes what LibKa enforces and checks for the web pages, PDFs, slides and Word files it builds. It is generated from the same rule mapping the build uses (`packages/guard/src/wcag.ts`) and is a draft until a person has reviewed it. The conformance of a particular document also depends on its content: every build writes its own report next to its outputs (`<name>.conformance.md`).
:::

:::metrics
- **12** supports
- **14** partially supports
- **20** not evaluated or not supported
- **9** not applicable
:::

## Scope

The outputs of `libka build`: a single-file web page, a tagged A4 PDF validated against PDF/UA-1 (ISO 14289-1), a 16:9 slide deck with its slide PDF, and an editable Word file (DOCX). The LibKa Studio and the command-line tools are not covered by this report.

## WCAG 2.2 and EN 301 549

:::table{caption="Success criteria, EN 301 549 v4.1.1 clauses (9 web, 10 documents), result and remarks"}

| Criterion | EN 301 549 | Result | Remarks |
|---|---|---|---|
| 1.1.1 Non-text Content (A) | 9.1.1.1, 10.1.1.1 | Partially Supports | The build refuses an image without alternative text and a caption; charts get a generated text alternative and their data table; diagrams need an accessible title and description; decorative icons are hidden. Checked by axe and, in the PDF, by PDF/UA-1; every picture in the Word file carries its alternative text (checked by Guard). Whether a text alternative describes its image well is the author's part. Automated checks: axe-core, Guard, veraPDF PDF/UA-1, Guard (Word file). |
| 1.2.1 Audio-only and Video-only (Prerecorded) (A) | 9.1.2.1, 10.1.2.1 | Supports | A video needs a transcript (the build refuses it otherwise). Automated checks: axe-core. |
| 1.2.2 Captions (Prerecorded) (A) | 9.1.2.2, 10.1.2.2 | Partially Supports | Video files need captions (WebVTT); embedded players rely on the captions of their platform. Automated checks: axe-core. |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) (A) | 9.1.2.3, 10.1.2.3 | Partially Supports | The required transcript is a media alternative; audio description is not enforced. Automated checks: none. |
| 1.2.4 Captions (Live) (AA) | 9.1.2.4, 10.1.2.4 | Not Applicable | LibKa outputs hold no live media. Automated checks: none. |
| 1.2.5 Audio Description (Prerecorded) (AA) | 9.1.2.5, 10.1.2.5 | Does Not Support | Audio description is not enforced; authors add it to the video themselves. Automated checks: none. |
| 1.3.1 Info and Relationships (A) | 9.1.3.1, 10.1.3.1 | Supports | Semantic HTML from typed blocks: headings, lists, tables with captions and header scope, figures, description lists; a PDF tagged and validated against PDF/UA-1; a Word file with real headings, lists, footnotes and tables whose header row repeats (checked by Guard). Automated checks: axe-core, Guard, veraPDF PDF/UA-1, Guard (Word file). |
| 1.3.2 Meaningful Sequence (A) | 9.1.3.2, 10.1.3.2 | Partially Supports | By design, every output reads in the source order, and the PDF's tags follow it. No tool can verify a meaningful reading order (veraPDF checks the tag structure, not the order): a person reviews it. Automated checks: veraPDF PDF/UA-1. |
| 1.3.3 Sensory Characteristics (A) | 9.1.3.3, 10.1.3.3 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 1.3.4 Orientation (AA) | 9.1.3.4, 10.1.3.4 | Supports | No output locks the orientation; slides scale to the screen. Automated checks: axe-core. |
| 1.3.5 Identify Input Purpose (AA) | 9.1.3.5, 10.1.3.5 | Not Applicable | LibKa outputs hold no form fields that collect user data (UI specimens are inert pictures of a UI). Automated checks: axe-core. |
| 1.4.1 Use of Color (A) | 9.1.4.1, 10.1.4.1 | Partially Supports | Charts use pattern fills and marker shapes, comparison cells show words as well as icons, status badges carry their word; authors can still write colour-only instructions. Automated checks: axe-core. |
| 1.4.2 Audio Control (A) | 9.1.4.2, 10.1.4.2 | Not Evaluated | Not evaluated as a whole: the automated checks below cover part of it; review each document. Automated checks: axe-core. |
| 1.4.3 Contrast (Minimum) (AA) | 9.1.4.3, 10.1.4.3 | Supports | Every colour comes from tokens whose text contrast is gated at 4.5:1 in the build; Guard measures every text on the rendered page in light, dark and high contrast (7:1), and every run of text in the Word file against its shading. Automated checks: axe-core, Guard, Guard (Word file). |
| 1.4.4 Resize Text (AA) | 9.1.4.4, 10.1.4.4 | Partially Supports | Web page text is sized in relative units; slides that would clip content are continued on new slides, and Guard fails a slide that still does not fit. Slides are a scaled 16:9 canvas, and zooming to 200% has not been audited. Automated checks: axe-core. |
| 1.4.5 Images of Text (AA) | 9.1.4.5, 10.1.4.5 | Partially Supports | Text is real text in the web page, the PDF and the slides, where diagrams are drawn as SVG text. In the Word file, diagrams, charts and UI specimens are pictures with their text alternative; the chart data follows as a table and the diagram source in an appendix. Automated checks: none. |
| 1.4.10 Reflow (AA) | 9.1.4.10, 10.1.4.10 | Partially Supports | The web page is a single responsive column: Guard loads every page 320 CSS pixels wide and fails one that scrolls sideways (code blocks and wide tables scroll in their own box); content that a box of its own clips instead of scrolling is not reported. Slides are a fixed 16:9 canvas by nature, scaled down to fit a narrow screen. Automated checks: Guard. |
| 1.4.11 Non-text Contrast (AA) | 9.1.4.11, 10.1.4.11 | Partially Supports | The token build holds button and badge colours, the boundary of text fields and the focus ring to at least 3:1 against every background in every theme; other borders and graphics are not measured automatically. Automated checks: none. |
| 1.4.12 Text Spacing (AA) | 9.1.4.12, 10.1.4.12 | Not Evaluated | Not evaluated as a whole: the automated checks below cover part of it; review each document. Automated checks: axe-core. |
| 1.4.13 Content on Hover or Focus (AA) | 9.1.4.13, 10.1.4.13 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 2.1.1 Keyboard (A) | 9.2.1.1, 10.2.1.1 | Partially Supports | Tabs, accordions, copy buttons and the deck are keyboard operable; a full keyboard audit per document is a manual step. Automated checks: axe-core. |
| 2.1.2 No Keyboard Trap (A) | 9.2.1.2, 10.2.1.2 | Partially Supports | No component is known to trap focus; this has not been audited for every component. Automated checks: none. |
| 2.1.4 Character Key Shortcuts (A) | 9.2.1.4, 10.2.1.4 | Supports | The web page has no single-character shortcuts. The slides' letter keys (N, O, P, F, D, C) can be turned off with the Letter shortcuts button, and the choice is remembered in the browser; arrows, Home, End and Space keep working. Automated checks: none. |
| 2.2.1 Timing Adjustable (A) | 9.2.2.1, 10.2.2.1 | Not Applicable | LibKa outputs have no time limits; slides never advance on their own. Automated checks: axe-core. |
| 2.2.2 Pause, Stop, Hide (A) | 9.2.2.2, 10.2.2.2 | Supports | Nothing moves on its own; motion follows the reduced-motion preference. Automated checks: axe-core. |
| 2.3.1 Three Flashes or Below Threshold (A) | 9.2.3.1, 10.2.3.1 | Partially Supports | LibKa itself adds nothing that flashes; videos and animated images an author adds are not checked for flashes. Automated checks: none. |
| 2.4.1 Bypass Blocks (A) | 9.2.4.1, 10.2.4.1 | Supports | The web page starts with a skip link to its content and has landmarks; the slides have main, navigation and complementary landmarks and a heading on every slide; the PDF and the Word file have tagged headings. Automated checks: axe-core. |
| 2.4.2 Page Titled (A) | 9.2.4.2, 10.2.4.2 | Supports | A title is required; the PDF shows its title instead of the file name, and the Word file has it in its properties. Automated checks: axe-core, veraPDF PDF/UA-1, Guard (Word file). |
| 2.4.3 Focus Order (A) | 9.2.4.3, 10.2.4.3 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 2.4.4 Link Purpose (In Context) (A) | 9.2.4.4, 10.2.4.4 | Partially Supports | Links get their text as accessible name and the PDF a description per link; vague link texts are an authoring choice the skill warns about. Automated checks: axe-core, veraPDF PDF/UA-1, Guard (Word file). |
| 2.4.5 Multiple Ways (AA) | 9.2.4.5, 10.2.4.5 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 2.4.6 Headings and Labels (AA) | 9.2.4.6, 10.2.4.6 | Partially Supports | Headings are required to be in order (in the Word file too, checked by Guard); whether a heading describes its topic is an authoring choice. Automated checks: Guard (Word file). |
| 2.4.7 Focus Visible (AA) | 9.2.4.7, 10.2.4.7 | Supports | Every link, button and focusable element shows an outline in the focus-ring colour when focused from the keyboard; the token build holds that colour to at least 3:1 against every background in every theme. Automated checks: none. |
| 2.4.11 Focus Not Obscured (Minimum) (AA) | 9.2.4.11, 10.2.4.11 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 2.5.1 Pointer Gestures (A) | 9.2.5.1, 10.2.5.1 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 2.5.2 Pointer Cancellation (A) | 9.2.5.2, 10.2.5.2 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 2.5.3 Label in Name (A) | 9.2.5.3, 10.2.5.3 | Not Evaluated | Not evaluated as a whole: the automated checks below cover part of it; review each document. Automated checks: axe-core. |
| 2.5.4 Motion Actuation (A) | 9.2.5.4, 10.2.5.4 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 2.5.7 Dragging Movements (AA) | 9.2.5.7, 10.2.5.7 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 2.5.8 Target Size (Minimum) (AA) | 9.2.5.8, 10.2.5.8 | Supports | Interactive targets are at least 24 by 24 pixels (footnote markers included); checked by axe. Automated checks: axe-core. |
| 3.1.1 Language of Page (A) | 9.3.1.1, 10.3.1.1 | Supports | The document language is set from the source and written to every output, the PDF and the Word file included. Automated checks: axe-core, veraPDF PDF/UA-1, Guard (Word file). |
| 3.1.2 Language of Parts (AA) | 9.3.1.2, 10.3.1.2 | Not Evaluated | Not evaluated as a whole: the automated checks below cover part of it; review each document. Automated checks: axe-core. |
| 3.2.1 On Focus (A) | 9.3.2.1, 10.3.2.1 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 3.2.2 On Input (A) | 9.3.2.2, 10.3.2.2 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 3.2.3 Consistent Navigation (AA) | 9.3.2.3, 10.3.2.3 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 3.2.4 Consistent Identification (AA) | 9.3.2.4, 10.3.2.4 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 3.2.6 Consistent Help (A) | 9.3.2.6, 10.3.2.6 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |
| 3.3.1 Error Identification (A) | 9.3.3.1, 10.3.3.1 | Not Applicable | No forms. Automated checks: none. |
| 3.3.2 Labels or Instructions (A) | 9.3.3.2, 10.3.3.2 | Not Applicable | No forms. Automated checks: axe-core. |
| 3.3.3 Error Suggestion (AA) | 9.3.3.3, 10.3.3.3 | Not Applicable | No forms. Automated checks: none. |
| 3.3.4 Error Prevention (Legal, Financial, Data) (AA) | 9.3.3.4, 10.3.3.4 | Not Applicable | No forms. Automated checks: none. |
| 3.3.7 Redundant Entry (A) | 9.3.3.7, 10.3.3.7 | Not Applicable | No forms. Automated checks: none. |
| 3.3.8 Accessible Authentication (Minimum) (AA) | 9.3.3.8, 10.3.3.8 | Not Applicable | No forms. Automated checks: none. |
| 4.1.2 Name, Role, Value (A) | 9.4.1.2, 10.4.1.2 | Supports | Controls are native elements or carry roles and names; checked by axe on every page and deck. Automated checks: axe-core. |
| 4.1.3 Status Messages (AA) | 9.4.1.3, 10.4.1.3 | Not Evaluated | Not evaluated: no automated check and no audit covers it; review each document. Automated checks: none. |

:::

## How it was evaluated

Automated: axe-core with the WCAG 2.0, 2.1 and 2.2 A/AA rules; Guard's live contrast measurement in standard and more-contrast mode and its structure rules, reflow at 320 CSS pixels among them; veraPDF against PDF/UA-1; the structure and contrast checks of the Word file. Microsoft Word's own accessibility checker is run by a person on sample documents. Design: the block registry and the build refuse content that would break a criterion (missing alternative text, captions or transcripts). Criteria marked Not Evaluated need a person with each document.
