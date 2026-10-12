/**
 * The LibKa block registry: one definition per block, the single place that says what a block is.
 *
 * The model reads it to know the block syntax and its attributes, the Studio builds its block
 * buttons from it, the catalog page (docs/blocks.md) is generated from it, and the JSON schemas
 * describe each block in the document model for AI tools (the MCP server). Rendering stays
 * in @libka/render; a test there makes sure every block here has a renderer and an example that
 * parses, renders and passes Guard.
 *
 * Pure data, no dependencies.
 */

export type BlockGroup = 'text' | 'document' | 'how-to' | 'explain' | 'highlight' | 'media' | 'data' | 'ui';

export interface AttributeSpec {
  description: string;
  required?: boolean;
  values?: readonly string[];
  /**
   * What kind of value it takes, for editors (the Studio's Inspector chooses its control by it): free text when
   * absent, a choice when `values` is given. `date` is YYYY-MM-DD, `link` an address, a file or #a-heading, `file` a
   * file next to the document, `flag` an attribute written bare (`{required}`), on or off.
   */
  kind?: 'date' | 'link' | 'file' | 'flag';
}

export interface BlockDefinition {
  /** Directive name or Markdown element; also the "type" in the document model. */
  name: string;
  title: string;
  group: BlockGroup;
  summary: string;
  /** Content signals that call for this block (for authors and AI tools). */
  useWhen: string;
  /** How it is written: a complete example that parses without problems. */
  example: string;
  /** Front matter lines (YAML) the example needs, such as a references list. */
  frontMatter?: string;
  /** Attributes of the outer directive ({name=value}). */
  attributes?: Readonly<Record<string, AttributeSpec>>;
  /** Directives allowed inside, with their attributes (tabs → tab, cards → card ...). */
  children?: Readonly<Record<string, Readonly<Record<string, AttributeSpec>>>>;
  /** What each output does with it. */
  targets: { web: string; pdf: string; deck: string; docx: string };
  a11y: readonly string[];
  antiPatterns: readonly string[];
  /** JSON Schema (2020-12) of the block in the document model. */
  schema: Record<string, unknown>;
}

export interface InlineDefinition {
  name: string;
  title: string;
  example: string;
  summary: string;
}

const inline = { $ref: '#/$defs/inline' };
const blocks = { type: 'array', items: { $ref: '#/$defs/block' } };
const str = { type: 'string', minLength: 1 };
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });
const typed = (type: string, properties: Record<string, unknown>, required: string[]) =>
  obj({ type: { const: type }, ...properties }, ['type', ...required]);

const codeSchema = typed('code', { lang: { type: ['string', 'null'] }, value: { type: 'string' }, title: str, marked: { type: 'array', items: { type: 'integer', minimum: 1 } } }, ['lang', 'value']);

/** Status variants first, then the guidance tones (GitHub alerts map to note, tip, important, warning, caution). */
export const CALLOUT_VARIANTS = ['info', 'success', 'warning', 'error', 'note', 'tip', 'important', 'caution'] as const;
/** ISO 8601 calendar date, as front matter and attributes write dates. */
const isoDate = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };

export const GROUPS: Readonly<Record<BlockGroup, string>> = {
  text: 'Text',
  document: 'Document',
  'how-to': 'How-to',
  explain: 'Explain',
  highlight: 'Highlight',
  media: 'Media',
  data: 'Data',
  ui: 'UI specimens',
};

export const BLOCKS: readonly BlockDefinition[] = [
  /* ---------------- text ---------------- */
  {
    name: 'heading', title: 'Heading', group: 'text',
    useWhen: 'The content has parts a reader scans for or a presenter moves between: one ## per topic, ### per sub-topic (each becomes a slide).',
    summary: 'Sections (##), subsections (###) and minor headings (####). The title comes from the front matter.',
    example: '## Install the tools\n\n### On Windows',
    targets: { web: 'Section heading with an anchor; ## headings make the table of contents.', pdf: 'Heading and a PDF bookmark.', deck: '## starts a section slide, ### a slide; #### stays inside its slide.', docx: 'Heading 1 to 3 (## to ####) with a bookmark; Word builds its Navigation pane from them.' },
    a11y: ['One level at a time: no jump from ## to ####.', 'Headings name the content that follows, not decorate it.'],
    antiPatterns: ['A heading used for emphasis instead of a callout or statement.', 'Headings inside tabs, accordions or cards (they break the outline and the slides).'],
    schema: typed('heading', { level: { enum: [2, 3, 4] }, id: str, text: inline }, ['level', 'id', 'text']),
  },
  {
    name: 'paragraph', title: 'Paragraph', group: 'text',
    useWhen: 'Explanation, context or argument in sentences. The default; most content is paragraphs.',
    summary: 'Running text with **bold**, *italic*, `code`, links and :kbd[Ctrl+S] keys.',
    example: 'Press :kbd[Ctrl+S] to save. See the [release notes](https://example.org/notes) for details.',
    targets: { web: 'Paragraph, at most 72 characters per line.', pdf: 'Paragraph.', deck: 'Paragraph on the slide.', docx: 'Paragraph in the Normal style.' },
    a11y: ['Link text says where it goes ("release notes", not "click here").'],
    antiPatterns: ['Walls of text on a slide: move them into :::notes.'],
    schema: typed('paragraph', { text: inline }, ['text']),
  },
  {
    name: 'list', title: 'List', group: 'text',
    useWhen: 'Three or more parallel items without an order (bulleted) or with one (numbered, when not instructions).',
    summary: 'Bulleted (-) or numbered (1.) lists. For instructions use :::steps, for tasks :::checklist.',
    example: '- Tokens\n- Blocks\n- Guard',
    targets: { web: 'List.', pdf: 'List.', deck: 'List on the slide.', docx: 'Word bulleted or numbered list; each list restarts its numbering.' },
    a11y: ['Real list markup, so screen readers announce the number of items.'],
    antiPatterns: ['Numbered lists for things without an order.'],
    schema: typed('list', { ordered: { type: 'boolean' }, start: { type: 'integer', minimum: 2 }, items: { type: 'array', items: blocks } }, ['ordered', 'items']),
  },
  {
    name: 'dl', title: 'Description list', group: 'text',
    useWhen: 'Key-value facts read as pairs: document or invoice details, specifications, contact data, CV facts.',
    summary: 'Terms and their values in two columns, such as "Owner: Docs team". Values may hold links, e-mail addresses and code. For terms the reader learns, use :::glossary.',
    example: ':::dl[Project details]\n- **Owner** Platform team\n- **Budget** EUR 40,000\n- **Deadline** 31 March 2027\n:::',
    targets: { web: 'Two columns of terms and values, stacked on phones.', pdf: 'Same, kept on one page.', deck: 'Same, on the slide.', docx: 'Bold terms, each value indented under its term.' },
    a11y: ['dl/dt/dd markup, so each term is announced with its value.', 'The label in brackets captions the list.'],
    antiPatterns: ['Long paragraphs as values: use headings and text.', 'Data with more than one value per term: use a :::table.'],
    schema: typed('dl', { caption: str, items: { type: 'array', minItems: 1, items: obj({ term: str, body: blocks }, ['term', 'body']) } }, ['items']),
  },
  /* ---------------- document ---------------- */
  {
    name: 'doc-status', title: 'Document status', group: 'document',
    useWhen: 'Policies, procedures, specifications and any page readers must trust: who owns it, when it was last reviewed, when the next review is due, and whether it is still valid.',
    summary: 'Status, owner and review dates. Front matter keys status, owner, reviewed and next-review show them under the title and in the footer by themselves; :::doc-status places them as a panel where you want it (and may set them itself).',
    example: ':::doc-status{owner="Platform team" reviewed=2026-09-01 next-review=2027-03-01}\n:::',
    attributes: {
      status: { description: 'Draft, Approved, Deprecated ... (or set it in front matter). Deprecated shows a banner at the top.' },
      owner: { description: 'Who keeps the document correct: a team or a role.' },
      reviewed: { description: 'Date of the last review, YYYY-MM-DD.', kind: 'date' },
      'next-review': { description: 'When the next review is due, YYYY-MM-DD; lint warns once it has passed.', kind: 'date' },
    },
    targets: { web: 'A panel with the status as a badge, the owner and the dates; the same values also appear in the footer.', pdf: 'Same; the footer line closes the document.', deck: 'Title slide footer line.', docx: 'A shaded panel with the status fields.' },
    a11y: ['A labelled list of terms and values; dates are time elements.', 'The status is written out, its badge color only repeats it.'],
    antiPatterns: ['The same key in front matter and in the block with different values (reported).', 'A next-review date nobody acts on: lint warns when it has passed.'],
    schema: typed('doc-status', { status: str, owner: str, reviewed: isoDate, nextReview: isoDate }, []),
  },
  {
    name: 'toc', title: 'Table of contents', group: 'document',
    useWhen: 'Long documents where readers jump to a section, or a deck that opens with an agenda. Manuals already get contents by themselves; place :::toc to choose where they go and how deep.',
    summary: 'The contents, placed where it stands: ## sections and parts (depth=2, the default) or also ### subsections (depth=3). It replaces the automatic contents; in a deck it is an agenda.',
    example: ':::toc[Contents]{depth=3}\n:::',
    attributes: { depth: { description: '2 lists ## sections and parts, 3 adds ### subsections.', values: ['2', '3'] } },
    targets: { web: 'A navigation list of links to the headings, nested by level; replaces the automatic contents.', pdf: 'Printed contents, without page numbers.', deck: 'An agenda of the ## sections and parts; its own slide when it comes before the first ##.', docx: 'Links to the headings, placed here (no Word field, so Word never asks to update it).' },
    a11y: ['A nav landmark named by its title, with a nested list of real links.'],
    antiPatterns: ['Contents in a short document with two or three sections.', 'Depth 3 on slides: the agenda shows sections only.'],
    schema: typed('toc', { title: str, depth: { enum: [2, 3] } }, ['depth']),
  },
  {
    name: 'references', title: 'References', group: 'document',
    useWhen: 'A report, proposal or study that cites sources with `[@id]`; place the list where it belongs and choose its style. Without the block the list is added at the end.',
    summary: 'The list of cited sources, from the front matter references, in numeric ([1]) or author-date ((W3C, 2023)) style. Without the block, a numeric list is added at the end.',
    example: 'Images need a text alternative [@wcag22].\n\n:::references[Sources]{style=author-date}\n:::',
    frontMatter: 'references:\n  - id: wcag22\n    title: Web Content Accessibility Guidelines (WCAG) 2.2\n    author: W3C\n    year: 2023\n    url: https://www.w3.org/TR/WCAG22/',
    attributes: { style: { description: 'numeric: [1] in the text and a numbered list (default); author-date: (Author, 2023) and a list sorted by author.', values: ['numeric', 'author-date'] } },
    targets: { web: 'A section with the sources; every citation links to its entry.', pdf: 'Same.', deck: 'Where it stands; without the block, a References slide at the end.', docx: 'Heading 1 and the numbered or alphabetical list; citations link to their entry.' },
    a11y: ['Citations are links with readable text, not bare numbers in color.', 'Titles are cite elements; addresses are real links.'],
    antiPatterns: ['Sources listed but never cited (reported).', 'Citing a source that is not in the list (reported).'],
    schema: typed('references', { title: str, style: { enum: ['numeric', 'author-date'] } }, ['style']),
  },
  {
    name: 'release', title: 'Release notes', group: 'document',
    useWhen: 'Release notes or a changelog: what changed in each version, grouped as added, changed, deprecated, removed, fixed and security (Keep a Changelog).',
    summary: 'One version with its date and its changes in typed groups. Each release is a level-2 heading with an anchor (#v1-4-0), listed in the contents and its own slide. Groups follow the Keep a Changelog order. A notice about the whole release (a paragraph or a callout, such as a dropped platform) may come before the groups; anything that stops working goes in :::removed, anything still working but going away in :::deprecated. The version is written as the source writes it (3.2.0 or v3.2.0).',
    example: '::::release[v1.4.0]{date=2026-10-01}\n:::added\n- Comparison tables with a recommended column.\n:::\n:::fixed\n- Long code lines no longer overflow in the PDF.\n:::\n::::',
    attributes: {
      date: { description: 'Release date, YYYY-MM-DD (required unless the version is Unreleased).', kind: 'date' },
    },
    children: {
      added: {}, changed: {}, deprecated: {}, removed: {}, fixed: {}, security: {},
    },
    targets: { web: 'A version heading with its date, then each group with an icon and its name.', pdf: 'Same; a group is kept whole when it fits.', deck: 'One release per slide.', docx: 'Heading 1 with the version, the release date, and each group under a bold label.' },
    a11y: ['A real heading per version, so long changelogs can be navigated by headings and the contents.', 'Group names are words; icons and colors only repeat them.'],
    antiPatterns: ['Commit messages pasted as release notes: write what changed for the reader.', 'A release with no groups, or the same group twice (reported).'],
    schema: typed('release', {
      version: str, id: str, date: isoDate, intro: blocks,
      groups: { type: 'array', minItems: 1, items: obj({ kind: { enum: ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'] }, body: blocks }, ['kind', 'body']) },
    }, ['version', 'id', 'groups']),
  },
  {
    name: 'section', title: 'Section divider', group: 'document',
    useWhen: 'A long document or deck with parts or chapters, each grouping several ## sections ("Part 2: Results").',
    summary: 'A part divider: a rule and a large heading, with an optional sentence; break=page starts a new page in print. On slides it is a full section slide.',
    example: ':::section[Part 2: Results]{break=page}\nWhat we measured and what changed.\n:::',
    attributes: {
      break: { description: 'page starts the part on a new page in the PDF.', values: ['page', 'none'] },
    },
    targets: { web: 'A rule and a large heading; listed in the contents.', pdf: 'Optional page break before it.', deck: 'Full-bleed section slide.', docx: 'Heading 1 in the accent color, on a new page with break=page.' },
    a11y: ['A real level-2 heading, so it appears in heading navigation and the contents.'],
    antiPatterns: ['A divider before every ## section: use it only for parts that group sections.', 'Long text inside: one sentence at most.'],
    schema: typed('section', { title: str, id: str, break: { enum: ['page', 'none'] }, body: blocks }, ['title', 'id', 'break', 'body']),
  },
  {
    name: 'code', title: 'Code', group: 'how-to',
    useWhen: 'Commands, file contents, configuration or source code that a reader types or copies.',
    summary: 'A fenced code block with an optional file name and highlighted lines; readers get a copy button.',
    example: '```bash title="build.sh" {2}\nnpm install --save-dev @libka/cli\nnpx @libka/cli build guide.md\n```',
    attributes: {
      title: { description: 'File name or label shown above the code: title="install.sh".' },
      '{n,m-k}': { description: 'Lines to highlight, e.g. {2} or {1,3-5}.' },
    },
    targets: { web: 'Code with its file name, highlighted lines and a copy button.', pdf: 'Code without the button; long lines wrap.', deck: 'Code on the slide; keep it short.', docx: 'Monospace lines in a shaded panel, marked lines in bold, the file name as a caption.' },
    a11y: ['Highlighted lines are marked as such, not only colored.', 'The copy button has a text label and announces "Copied".'],
    antiPatterns: ['Screenshots of code: they cannot be copied, searched or read aloud.', 'More than about 15 lines on a slide.'],
    schema: codeSchema,
  },
  {
    name: 'code-group', title: 'Code group', group: 'how-to',
    useWhen: 'The same command or snippet in several variants a reader chooses between: npm, pnpm and yarn; Python and JavaScript; Windows and macOS shells.',
    summary: 'Titled code blocks shown as tabs: each block\'s title is its tab, and the reader\'s choice switches every group with the same titles on the page and is remembered for as long as the browser tab is open.',
    example: ':::code-group\n```bash title="npm"\nnpm install @libka/cli\n```\n```bash title="pnpm"\npnpm add @libka/cli\n```\n:::',
    targets: { web: 'Keyboard-accessible tabs with one code block each, with copy buttons; groups with the same titles switch together.', pdf: 'Every variant, one after another, with its title.', deck: 'Every variant on the slide, side by side when they are short.', docx: 'Every variant, each under its bold label.' },
    a11y: ['The WAI-ARIA tabs pattern, as for :::tabs; without script every variant is shown with its title.'],
    antiPatterns: ['Variants that differ in more than the tool: write separate steps.', 'A group of one block.'],
    schema: typed('code-group', { items: { type: 'array', minItems: 2, items: codeSchema } }, ['items']),
  },
  {
    name: 'callout', title: 'Callout', group: 'explain',
    useWhen: 'One message the reader must not miss: a prerequisite (info), a risk (warning), a success criterion or a failure; or guidance: a side note, a tip, something important, a caution before an action.',
    summary: 'A highlighted message. Status: info, success, warning, error. Guidance: note, tip, important, caution. GitHub alerts (> [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]) become callouts too.',
    example: ':::callout[Back up first]{variant=warning}\nExport your data before you upgrade.\n:::\n\n> [!TIP]\n> The export also works from the command line.',
    attributes: { variant: { description: 'Meaning of the message.', values: CALLOUT_VARIANTS } },
    targets: { web: 'Tinted box with an icon and a title; without a title the tone word ("Tip") is the title.', pdf: 'Kept on one page.', deck: 'Box on the slide.', docx: 'Shaded panel with a left border in the tone color; the tone word starts the title.' },
    a11y: ['role="note"; every tone has its own icon shape and its word is read out first ("Warning: Back up first"), so color is never the only cue.'],
    antiPatterns: ['More than 2 callouts in one section: they stop standing out (lint hints).', 'Choosing the variant for its color.'],
    schema: typed('callout', { variant: { enum: CALLOUT_VARIANTS }, title: str, body: blocks }, ['variant', 'body']),
  },
  /* ---------------- how-to ---------------- */
  {
    name: 'steps', title: 'Steps', group: 'how-to',
    useWhen: 'A task the reader performs in order: \"Install\", \"Configure\", \"Run\". Each step starts with a verb.',
    summary: 'Numbered instructions, each with a bold title and a description. The text after the bold title is a separate description: write it as a full sentence, or leave it out. To continue a procedure in a second :::steps (on the next slide), start its list at the next number: 4.',
    example: ':::steps\n1. **Open settings** Choose *Data*, then *Export*.\n2. **Run the installer** Keep the default folder.\n:::',
    targets: { web: 'Numbered flow.', pdf: 'A step is never split across pages.', deck: 'Numbered flow on the slide.', docx: 'Numbered list with the bold step titles and the descriptions under them; the start number is kept.' },
    a11y: ['An ordered list, so the step count is announced.'],
    antiPatterns: ['More than about 7 steps: split the task.', 'Steps without a verb in the title.'],
    schema: typed('steps', { start: { type: 'integer', minimum: 2 }, steps: { type: 'array', minItems: 1, items: obj({ title: inline, body: blocks }, ['title', 'body']) } }, ['steps']),
  },
  {
    name: 'checklist', title: 'Checklist', group: 'how-to',
    useWhen: 'Things to verify or tasks to tick off, such as \"before you publish\" or acceptance criteria.',
    summary: 'Tasks that are done or open.',
    example: ':::checklist\n- [x] Backup exported\n- [ ] Installer downloaded\n:::',
    targets: { web: 'List with check marks.', pdf: 'Kept on one page.', deck: 'List on the slide.', docx: 'One line per task, starting with a checked or an empty box and the word Done or Open.' },
    a11y: ['"Done" and "Open" are spoken, not only shown as icons.'],
    antiPatterns: ['A checklist for things that are not tasks.'],
    schema: typed('checklist', { items: { type: 'array', minItems: 1, items: obj({ done: { type: 'boolean' }, text: inline }, ['done', 'text']) } }, ['items']),
  },
  {
    name: 'tabs', title: 'Tabs', group: 'how-to',
    useWhen: 'The same task or content differs by platform, language, role or plan, and each reader needs only one variant.',
    summary: 'Alternatives side by side, such as instructions per operating system. Readers pick one; tabs with the same label switch together.',
    example: '::::tabs\n:::tab[Windows]\nRun `setup.exe`.\n:::\n:::tab[macOS]\nOpen `Setup.dmg`.\n:::\n::::',
    children: { tab: { label: { description: 'Tab name in brackets: :::tab[Windows].', required: true } } },
    targets: { web: 'Keyboard-accessible tabs (arrow keys); the reader\'s choice is remembered for as long as the browser tab is open. Without script: one section per tab.', pdf: 'Every tab, one after another, with its label.', deck: 'All tabs side by side.', docx: 'Every panel, each under its bold label.' },
    a11y: ['The WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs.', 'Without script the content is still there, in order.'],
    antiPatterns: ['Tabs for content everyone needs: use sections.', 'One tab only.', 'Tabs inside tabs.'],
    schema: typed('tabs', { tabs: { type: 'array', minItems: 2, items: obj({ label: str, body: blocks }, ['label', 'body']) } }, ['tabs']),
  },
  {
    name: 'accordion', title: 'Accordion / FAQ', group: 'how-to',
    useWhen: 'Questions and answers (FAQ), or optional detail most readers can skip.',
    summary: 'Questions or topics that open on demand.',
    example: '::::accordion\n:::item[Can I print the page?]\nYes: printing shows every answer.\n:::\n:::item[Does it work offline?]\nYes, every output is one local file.\n:::\n::::',
    children: { item: { label: { description: 'The question or topic: :::item[Question?].', required: true } } },
    targets: { web: 'Native details and summary: works with keyboard and without script.', pdf: 'Every item open.', deck: 'Every item open.', docx: 'Every answer, open, under its bold question.' },
    a11y: ['Native details/summary: announced as expandable, opened with Enter or Space.'],
    antiPatterns: ['Hiding steps a reader must follow.', 'One-word questions: write them as the reader would ask.'],
    schema: typed('accordion', { items: { type: 'array', minItems: 1, items: obj({ title: str, body: blocks }, ['title', 'body']) } }, ['items']),
  },
  {
    name: 'shortcuts', title: 'Keyboard shortcuts', group: 'how-to',
    useWhen: 'Keyboard shortcuts or key combinations and what they do.',
    summary: 'A table of keys and what they do.',
    example: ':::shortcuts{caption="Editor"}\n- :kbd[Ctrl+S] Save the draft\n- :kbd[Ctrl+Shift+P] Open the command palette\n:::',
    attributes: { caption: { description: 'What the shortcuts are for.', required: true } },
    targets: { web: 'Keys as key caps next to their action.', pdf: 'Same, kept on one page.', deck: 'Same.', docx: 'Word table with a repeating header row; keys in monospace.' },
    a11y: ['Keys are kbd elements with readable names ("Ctrl", not "^").'],
    antiPatterns: ['Shortcuts without the action written out.'],
    schema: typed('shortcuts', { caption: str, items: { type: 'array', minItems: 1, items: obj({ keys: { type: 'array', items: str }, text: inline }, ['keys', 'text']) } }, ['caption', 'items']),
  },
  /* ---------------- explain ---------------- */
  {
    name: 'glossary', title: 'Glossary', group: 'explain',
    useWhen: 'Terms the audience may not know, defined once and linkable.',
    summary: 'Terms and their definitions; each term can be linked to (#term).',
    example: ':::glossary\n- **Token** A named design decision, such as a color or a spacing step.\n- **Guard** The checks every output passes before it is signed.\n:::',
    targets: { web: 'Definition list; every term has an anchor.', pdf: 'Definition list.', deck: 'Definition list on the slide.', docx: 'Bold terms with bookmarks (links reach them), definitions indented.' },
    a11y: ['dl/dt/dd markup, so the term and its definition are announced together.'],
    antiPatterns: ['Defining words every reader knows.', 'Definitions that use the term itself.'],
    schema: typed('glossary', { items: { type: 'array', minItems: 1, items: obj({ term: str, id: str, body: blocks }, ['term', 'id', 'body']) } }, ['items']),
  },
  {
    name: 'diagram', title: 'Diagram', group: 'explain',
    useWhen: 'A process, a sequence of messages, states and transitions, a class model or a data model that a picture explains better than a list: flowcharts, sequence, state, class and entity-relationship diagrams.',
    summary: 'A Mermaid diagram written as text in a ```mermaid fence, drawn as SVG when the document is built. accTitle (the caption) and accDescr (the description for readers who cannot see it) are required. LibKa sets the colours and fonts, so they follow the light, dark and high-contrast themes.',
    example: '```mermaid\nflowchart LR\n  accTitle: How a LibKa document is built\n  accDescr: The Markdown is parsed into blocks, Guard checks the rendered page, and outputs that pass are signed.\n  A[Markdown] --> B[Blocks] --> C{Guard}\n  C -->|passes| D[Signed outputs]\n  C -.->|fails| A\n```',
    targets: { web: 'An inline SVG with its caption; "Show the source" reveals the Mermaid text. No script at runtime.', pdf: 'The same SVG.', deck: 'The SVG in the space left under the heading and text (up to 420px high); wide slides suit flowchart LR. Below 200px Guard reports the slide as too full.', docx: 'Picture drawn in Chrome with the description as alternative text; the source in a Diagram sources appendix.' },
    a11y: ['The SVG is an image named by accTitle and described by accDescr; write the description as the steps a reader would otherwise see.', 'Shapes and dotted or solid lines carry meaning, not colour.'],
    antiPatterns: ['A diagram for a simple linear process: use :::steps.', 'Colour statements (style, classDef, linkStyle) and init blocks (reported).', 'Diagrams too detailed to read on a slide: split them.'],
    schema: typed('diagram', { kind: { enum: ['flowchart', 'sequence', 'state', 'class', 'er'] }, source: str, title: str, desc: str, svg: str }, ['kind', 'source', 'title', 'desc']),
  },
  {
    name: 'compare', title: 'Do and don\'t', group: 'explain',
    useWhen: 'Guidance with a right and a wrong way: writing style, UI labels, design rules.',
    summary: 'Good and bad examples next to each other.',
    example: '::::compare\n:::do[Name the action]\n"Save draft"\n:::\n:::dont[Use vague labels]\n"OK" or "Click here"\n:::\n::::',
    children: { do: { label: { description: 'What to do.', required: true } }, dont: { label: { description: 'What to avoid.', required: true } } },
    targets: { web: 'Side by side, each marked "Do" or "Don\'t" in words and with an icon.', pdf: 'Side by side, kept on one page.', deck: 'Side by side.', docx: 'A shaded panel for Do and one for Do not, each with its mark and color.' },
    a11y: ['"Do" and "Don\'t" are written, never shown by color alone.'],
    antiPatterns: ['A don\'t without a do: always show the better way.'],
    schema: typed('compare', { items: { type: 'array', minItems: 2, items: obj({ kind: { enum: ['do', 'dont'] }, title: str, body: blocks }, ['kind', 'title', 'body']) } }, ['items']),
  },
  {
    name: 'quote', title: 'Quote', group: 'explain',
    useWhen: 'Words from a person or a source, quoted with attribution: a customer, a standard, a law.',
    summary: 'A quotation, with its source when it has one. A plain Markdown > quote works too.',
    example: ':::quote{source="Web Content Accessibility Guidelines 2.2" cite="https://www.w3.org/TR/WCAG22/"}\nContent can be presented in different ways without losing information or structure.\n:::',
    attributes: {
      source: { description: 'Who or what is quoted.' },
      cite: { description: 'Link to the source.', kind: 'link' },
    },
    targets: { web: 'Quotation with its source underneath.', pdf: 'Same.', deck: 'Large quotation.', docx: 'Quote style with a left border; the source after a dash, linked when it has an address.' },
    a11y: ['blockquote with cite; the source is text, not only a link.'],
    antiPatterns: ['Quotes used as decoration or for emphasis.', 'Quotes without a source when they have one.'],
    schema: typed('quote', { body: blocks, source: str, cite: str }, ['body']),
  },
  /* ---------------- highlight ---------------- */
  {
    name: 'cards', title: 'Cards', group: 'highlight',
    useWhen: 'Pointers to related pages, products, options or next steps, each with a title and one sentence.',
    summary: 'A grid of related topics or links, each with a title and a short text.',
    example: '::::cards\n:::card[Code]{href="#code"}\nFile names, highlighted lines and a copy button.\n:::\n:::card[Charts]{href="#chart" badge="New"}\nBar, line and donut charts drawn from a table.\n:::\n::::',
    children: { card: { label: { description: 'Card title.', required: true }, href: { description: 'Where the card leads.', kind: 'link' }, badge: { description: 'A short label, such as "New".' } } },
    targets: { web: 'Grid of cards; a linked card is clickable as a whole, the title is the link.', pdf: 'Grid; links stay links.', deck: 'Grid on the slide.', docx: 'One bordered panel per card: badge, title (a link when the card has one) and text.' },
    a11y: ['A list of cards; one link per card (its title), not a link around everything.'],
    antiPatterns: ['More than about 6 cards in one grid.', 'Cards with only a title.'],
    schema: typed('cards', { cards: { type: 'array', minItems: 1, items: obj({ title: str, href: str, badge: str, body: blocks }, ['title', 'body']) } }, ['cards']),
  },
  {
    name: 'statement', title: 'Statement', group: 'highlight',
    useWhen: 'The single most important message of a section or slide, in one sentence.',
    summary: 'One key message in large type. Made for slides; at most 30 words.',
    example: ':::statement\nEvery page is checked before it is published.\n:::',
    targets: { web: 'Large text with an accent line.', pdf: 'Same.', deck: 'Fills the slide when it is the slide\'s only content.', docx: 'A larger paragraph in the brand font.' },
    a11y: ['Plain paragraph text: it is read as written.'],
    antiPatterns: ['More than one statement per section.', 'Long sentences: a statement over 30 words is reported.'],
    schema: typed('statement', { text: inline }, ['text']),
  },
  {
    name: 'metrics', title: 'Key figures', group: 'highlight',
    useWhen: 'Two to four headline numbers with what they mean: results, targets, KPIs.',
    summary: 'Two to four numbers with what they mean.',
    example: ':::metrics\n- **4** outputs from one file\n- **7:1** text contrast in high contrast\n- **0** third-party requests\n:::',
    targets: { web: 'Numbers in large type with their labels.', pdf: 'Same.', deck: 'Same, in a row.', docx: 'Each figure large and bold, its label under it.' },
    a11y: ['Number and label are read together, in that order.'],
    antiPatterns: ['Numbers without context ("98 %" of what?).', 'More than 4 figures.'],
    schema: typed('metrics', { items: { type: 'array', minItems: 2, maxItems: 4, items: obj({ value: str, label: inline }, ['value', 'label']) } }, ['items']),
  },
  {
    name: 'summary', title: 'Summary', group: 'highlight',
    useWhen: 'Three to five key points a busy reader needs first: the top of a report, a proposal or a long page. Mark it source=ai when an AI wrote it, with the person who checked it.',
    summary: 'Key takeaways in a box, 3 to 5 points. source=ai with reviewed-by shows an "AI-assisted, reviewed by …" label.',
    example: ':::summary[Key takeaways]{source=ai reviewed-by="Docs lead"}\n- Every page passes the accessibility checks before it is signed.\n- One Markdown file gives the web page, the PDF and the slides.\n- The block catalog is generated, so it never drifts from the tools.\n:::',
    attributes: {
      source: { description: 'Who wrote the summary: human (default) or ai.', values: ['human', 'ai'] },
      'reviewed-by': { description: 'Name of the person who checked an AI summary, optionally with the role (required with source=ai).' },
    },
    targets: { web: 'A labelled box with the points and, for AI summaries, the AI label.', pdf: 'Kept on one page.', deck: 'Its own slide when it comes before the first ## section; otherwise a box on its slide.', docx: 'Shaded panel with the title and a bulleted list; AI-assisted with the reviewer when source=ai.' },
    a11y: ['A region named by its title, with a real list.', 'The AI label is text ("AI-assisted, reviewed by …"), not only a badge color.'],
    antiPatterns: ['More than 5 points: it stops being a summary.', 'Points that repeat the headings instead of the findings.', 'An AI summary nobody reviewed (reported).'],
    schema: typed('summary', { title: str, items: { type: 'array', minItems: 3, maxItems: 5, items: inline }, source: { enum: ['human', 'ai'] }, reviewedBy: str }, ['items', 'source']),
  },
  {
    name: 'cta', title: 'Call to action', group: 'highlight',
    useWhen: 'The one next step at the end of a section, page or deck: start the tutorial, book a demo, download the template.',
    summary: 'A link styled as a button, with an optional sentence before it. In print and on slides the address is written out.',
    example: ':::cta[Start the tutorial]{href="https://example.org/tutorial"}\nIt takes about ten minutes.\n:::',
    attributes: {
      href: { description: 'Where the action leads: an address, a file or #a-heading.', required: true, kind: 'link' },
      variant: { description: 'primary for the main action (default), secondary for an alternative.', values: ['primary', 'secondary'] },
    },
    targets: { web: 'A link that looks like a button (it navigates, so it is not a button element).', pdf: 'The label with its address written out.', deck: 'The button with its address written out.', docx: 'The label as a link, the address written out after it.' },
    a11y: ['A real link whose label says what happens ("Start the tutorial", not "Click here").', 'At least 44 px high.'],
    antiPatterns: ['More than one primary action per section.', 'Vague labels: "Click here", "More", "Learn more" are reported.'],
    schema: typed('cta', { label: str, href: str, variant: { enum: ['primary', 'secondary'] }, text: inline }, ['label', 'href', 'variant']),
  },
  /* ---------------- media ---------------- */
  {
    name: 'figure', title: 'Figure', group: 'media',
    useWhen: 'A diagram, screenshot, photo or illustration that carries information.',
    summary: 'An image with alt text and a caption, on its own line.',
    example: '![Diagram: Markdown is parsed, checked and rendered](images/pipeline.svg "How a manual is built")',
    targets: { web: 'Image with its caption.', pdf: 'Kept on one page.', deck: 'Image on the slide.', docx: 'Picture with the alt text, the caption under it; an SVG is drawn as PNG; an image from the web shows its alt text instead.' },
    a11y: ['Alt text says what the image shows; the caption says why it is there.'],
    antiPatterns: ['Images of text.', 'Alt text that repeats the caption.'],
    schema: typed('figure', { src: str, alt: str, caption: str }, ['src', 'alt', 'caption']),
  },
  {
    name: 'gallery', title: 'Gallery', group: 'media',
    useWhen: 'Several related images to compare or browse, each with its own caption.',
    summary: 'Several images with captions in a grid.',
    example: ':::gallery\n![Diagram: Markdown is parsed, checked and rendered](images/pipeline.svg "How a manual is built")\n\n![LibKa Studio with the source and the visual editor side by side](images/studio-split.png "LibKa Studio")\n:::',
    targets: { web: 'Responsive grid of figures.', pdf: 'Grid, kept on one page when it fits.', deck: 'Grid on the slide.', docx: 'Every image as a figure.' },
    a11y: ['Every image has its own alt text and caption.'],
    antiPatterns: ['Decorative galleries: use images that carry information.'],
    schema: typed('gallery', { images: { type: 'array', minItems: 2, items: obj({ src: str, alt: str, caption: str }, ['src', 'alt', 'caption']) } }, ['images']),
  },
  {
    name: 'video', title: 'Video', group: 'media',
    useWhen: 'A recording that shows something better than text: a walkthrough, a demo, a talk.',
    summary: 'A video with captions and a transcript. YouTube and Vimeo load only after the reader asks for them.',
    example: ':::video[Big Buck Bunny, an open film by the Blender Foundation]{src="https://www.youtube.com/watch?v=aqz-KE-bpKQ"}\nA short animated film without dialogue: a large rabbit enjoys a quiet day in the forest until three rodents start to tease him.\n:::',
    attributes: {
      src: { description: 'A video file (mp4, webm) or a YouTube or Vimeo address.', required: true, kind: 'link' },
      captions: { description: 'WebVTT captions for a video file (required for files).', kind: 'file' },
      poster: { description: 'Image shown before the video plays.', kind: 'file' },
    },
    targets: { web: 'Video player without autoplay; YouTube and Vimeo appear behind a "Play" button and load (privacy-enhanced) only on click. Transcript underneath.', pdf: 'Title, link and transcript.', deck: 'Player on the slide.', docx: 'A link to the video, then the transcript under a bold label.' },
    a11y: ['Captions for video files; a transcript for every video.', 'No autoplay; the play button names the video and the provider.'],
    antiPatterns: ['Autoplaying or looping video.', 'Video as the only way to get the information.'],
    schema: typed('video', { title: str, src: str, captions: str, poster: str, transcript: blocks }, ['title', 'src', 'transcript']),
  },
  /* ---------------- data ---------------- */
  {
    name: 'table', title: 'Table', group: 'data',
    useWhen: 'Data with rows and columns that readers look up or compare: versions, prices, specifications.',
    summary: 'A Markdown table with a caption.',
    example: ':::table{caption="Supported versions"}\n| Version | Supported until |\n|---|---|\n| 2.1 | 2027 |\n:::',
    attributes: { caption: { description: 'What the data shows.', required: true } },
    targets: { web: 'Table with column headers; scrolls sideways on small screens.', pdf: 'Header row repeats on every page.', deck: 'Table on the slide.', docx: 'Word table with a header row that repeats on every page; the caption above it and as its alternative text.' },
    a11y: ['caption and th scope="col".'],
    antiPatterns: ['Tables for layout.', 'A table where a chart shows the point better (or the other way round).'],
    schema: typed('table', { caption: str, head: { type: 'array', items: inline }, rows: { type: 'array', items: { type: 'array', items: inline } } }, ['caption', 'head', 'rows']),
  },
  {
    name: 'timeline', title: 'Timeline', group: 'data',
    useWhen: 'Dated events or phases in order: a roadmap, a project plan, a history, CV experience. Mark where things stand now with current=.',
    summary: 'Dates or periods with what happens, in order; each item starts with the date in bold. current= marks one item with the word "Now"; items before it read as past, items after it as planned, so drop labels such as "(done)".',
    example: ':::timeline[Office move]{current="2026-Q2"}\n- **2026-Q1** Lease signed for the new office\n- **2026-Q2** Fit-out and furniture\n- **2026-Q3** Teams move in\n:::',
    attributes: {
      current: { description: 'The date of the current item, exactly as written in bold: current="2026-Q2".' },
    },
    targets: { web: 'A vertical line of dates and text; the current item is marked "Now".', pdf: 'Vertical, items kept whole.', deck: 'Horizontal, up to about 6 items (lint hints above that).', docx: 'Bold dates (the current one marked Now), each item indented under its date.' },
    a11y: ['An ordered list; dates are time elements when they are calendar dates (2026, 2026-03, 2026-03-15).', '"Now" is written; past and planned items are named for screen readers, not shown by color alone.'],
    antiPatterns: ['A timeline for steps a reader performs: use :::steps.', 'More than about 6 items on a slide: split it or use a table.'],
    schema: typed('timeline', { caption: str, current: str, items: { type: 'array', minItems: 2, items: obj({ when: str, body: blocks }, ['when', 'body']) } }, ['items']),
  },
  {
    name: 'comparison', title: 'Comparison table', group: 'data',
    useWhen: 'Options, plans or products compared feature by feature, often with one recommended: pricing plans, tool choices, vendor offers.',
    summary: 'A table of options against features with one column highlighted. Cells written yes, no or partial (or ✓ ✗ ~) show an icon and the words "Included", "Not included" or "Partly"; a qualifier may follow after a bracket, comma or colon (partial (50 per month), yes, up to 5). Any other text, such as a price, is shown as written.',
    example: ':::comparison[Laptops for the team]{highlight=Standard}\n| Feature | Basic | Standard | Pro |\n|---|---|---|---|\n| 16 GB memory | yes | yes | yes |\n| Second screen | no | yes | yes |\n| On-site repair | no | partial | yes |\n| Price | EUR 700 | EUR 1,100 | EUR 1,600 |\n:::',
    attributes: {
      highlight: { description: 'The heading of the recommended column, exactly as written: highlight=Team. That column gets a border and a visible "Recommended" badge, so do not write "recommended" yourself.' },
      badge: { description: 'The badge text when the source says something else than "Recommended": badge="Most popular" (needs highlight).' },
    },
    targets: { web: 'A table with row and column headers; the highlighted column has a border and the word "Recommended".', pdf: 'Same; the header row repeats on every page.', deck: 'Same, on the slide (at most 4 options).', docx: 'Word table with a repeating header row; the recommended column named in its header; marks as words.' },
    a11y: ['A real table with column and row headers.', 'Yes, no and partial are icons with visible words, never icons or color alone; the highlight is named in words.'],
    antiPatterns: ['More than 4 options (reported): they do not fit a slide or a phone.', 'Marketing words in the cells instead of facts.'],
    schema: typed('comparison', {
      caption: str, highlight: { type: 'integer', minimum: 1 }, badge: str,
      head: { type: 'array', items: inline },
      rows: { type: 'array', minItems: 1, items: { type: 'array', items: obj({ text: inline, mark: { enum: ['yes', 'no', 'partial'] } }, ['text']) } },
    }, ['caption', 'head', 'rows']),
  },
  {
    name: 'chart', title: 'Chart', group: 'data',
    useWhen: 'Numbers whose pattern matters: comparisons between categories (bar), change over time (line), parts of a whole (donut).',
    summary: 'A bar, line or donut chart drawn from a Markdown table; the table stays available as the accessible version.',
    example: ':::chart{type=bar caption="Staff who find the handbook easy to use" unit="%"}\n| Quarter | 2025 | 2026 |\n|---|---|---|\n| Q1 | 62 | 71 |\n| Q2 | 64 | 75 |\n| Q3 | 66 | 78 |\n:::',
    attributes: {
      type: { description: 'Bar for comparison, line for trends, donut for parts of a whole (one series, at most 5 parts).', required: true, values: ['bar', 'line', 'donut'] },
      caption: { description: 'What the chart shows.', required: true },
      unit: { description: 'Unit of the values, such as % or €.' },
    },
    targets: { web: 'SVG chart in the series colors with pattern fills, value labels and a legend; "Show data" opens the table.', pdf: 'Chart and the data table.', deck: 'Chart on the slide.', docx: 'Picture drawn in Chrome with the summary as alternative text, then the data as a Word table.' },
    a11y: ['Hue is never the only encoding: patterns for bars and slices, marker shapes for lines.', 'The chart has a title and a text summary; the full data is a real table.', 'Axes start at zero.'],
    antiPatterns: ['3D, decorative gradients and animation on load.', 'Donuts with more than 5 parts.', 'More than 6 series.'],
    schema: typed('chart', {
      kind: { enum: ['bar', 'line', 'donut'] }, caption: str, unit: str, category: str,
      labels: { type: 'array', minItems: 1, items: str },
      series: { type: 'array', minItems: 1, maxItems: 6, items: obj({ name: str, values: { type: 'array', items: { type: 'number' } } }, ['name', 'values']) },
    }, ['kind', 'caption', 'category', 'labels', 'series']),
  },
  /* ---------------- UI specimens ---------------- */
  {
    name: 'ui', title: 'UI specimen', group: 'ui',
    useWhen: 'Documenting or specifying an interface: which button, field, message or dialog the reader will see.',
    summary: 'Real LibKa components shown as they look (light, dark or both), for manuals, product docs and specs. Inert: they illustrate, they do not act.',
    example: ':::ui{caption="Saving a draft: one primary action" theme=both}\n::button[Save draft]{variant=primary}\n::button[Preview]{variant=secondary}\n::button[Delete]{variant=destructive state=disabled}\n:::',
    attributes: {
      caption: { description: 'What the specimen shows.', required: true },
      theme: { description: 'Show it in the light theme, the dark theme or both side by side.', values: ['light', 'dark', 'both'] },
      layout: { description: 'Components in a row (default) or stacked.', values: ['row', 'stack'] },
    },
    children: {
      button: {
        label: { description: 'Button text, a verb: ::button[Save draft].', required: true },
        variant: { description: 'Manual 10.1.', values: ['primary', 'accent', 'iris', 'secondary', 'destructive', 'ghost'] },
        state: { description: 'Manual 10.1 states.', values: ['default', 'hover', 'focus', 'disabled', 'loading'] },
      },
      field: {
        label: { description: 'Visible label: ::field[Email].', required: true },
        type: { description: 'Kind of input.', values: ['text', 'email', 'password', 'number', 'textarea', 'select', 'checkbox', 'radio', 'switch'] },
        value: { description: 'Filled-in value (or the selected option).' },
        placeholder: { description: 'Example text; never instead of the label.' },
        hint: { description: 'Helper text under the field.' },
        error: { description: 'Error message: specific and recoverable.' },
        options: { description: 'Choices for select and radio, separated by |.' },
        state: { description: 'Manual 10.2 states.', values: ['default', 'hover', 'focus', 'disabled', 'readonly'] },
        required: { description: 'Marks the field as required.', kind: 'flag' },
      },
      badge: {
        label: { description: 'Short status: ::badge[Beta].', required: true },
        variant: { description: 'Meaning.', values: ['neutral', 'info', 'success', 'warning', 'error', 'ai'] },
      },
      toast: {
        label: { description: 'The message title: ::toast[Draft saved].', required: true },
        variant: { description: 'Meaning.', values: ['info', 'success', 'warning', 'error'] },
        text: { description: 'One sentence of detail.' },
        action: { description: 'One action, such as Undo.' },
      },
      modal: {
        label: { description: 'Dialog title: ::modal[Delete the draft?].', required: true },
        text: { description: 'What happens, in one or two sentences.', required: true },
        primary: { description: 'Label of the main action.', required: true },
        secondary: { description: 'Label of the way out, such as Cancel.' },
        destructive: { description: 'The main action removes something (red).', kind: 'flag' },
      },
      empty: {
        label: { description: 'Empty state title: ::empty[No projects yet].', required: true },
        text: { description: 'Why it is empty and what to do.', required: true },
        action: { description: 'The one action that fills it.' },
      },
    },
    targets: { web: 'Components in a framed stage, light and/or dark, with the caption and a text description for screen readers.', pdf: 'Same, in color.', deck: 'Same, on the slide.', docx: 'Picture of the specimen (both themes when asked) with its description as alternative text.' },
    a11y: ['The stage is inert and hidden from screen readers; a generated text describes every component instead.', 'Components keep their real contrast in both themes and in high contrast (Guard checks the specimen like any text).', 'Disabled specimens are marked as such, so their lower contrast is allowed.'],
    antiPatterns: ['Screenshots of UI: they go stale and cannot be checked.', 'More than one primary button for one decision.', 'Placeholder text instead of a label.'],
    schema: typed('ui', {
      caption: str, theme: { enum: ['light', 'dark', 'both'] }, layout: { enum: ['row', 'stack'] },
      items: { type: 'array', minItems: 1, items: {
        type: 'object', required: ['kind', 'label'],
        properties: {
          kind: { enum: ['button', 'field', 'badge', 'toast', 'modal', 'empty'] }, label: str, variant: str, state: str,
          input: str, value: str, placeholder: str, hint: str, error: str, options: { type: 'array', items: str }, required: { type: 'boolean' },
          text: str, action: str, primary: str, secondary: str, destructive: { type: 'boolean' },
        },
        additionalProperties: false,
      } },
    }, ['caption', 'theme', 'layout', 'items']),
  },
  /* ---------------- deck ---------------- */
  {
    name: 'notes', title: 'Speaker notes', group: 'text',
    useWhen: 'What a presenter should say that does not belong on the slide.',
    summary: 'What the presenter says. Shown only in the deck (notes panel and presenter view).',
    example: ':::notes\nMention that the checks run on every build.\n:::',
    targets: { web: 'Not shown.', pdf: 'Not shown.', deck: 'Notes panel (N) and presenter view (P).', docx: 'Left out: speaker notes belong to the deck.' },
    a11y: ['Never the only place for information the audience needs.'],
    antiPatterns: ['Slide text copied into the notes.'],
    schema: typed('notes', { body: blocks }, ['body']),
  },
];

export const INLINES: readonly InlineDefinition[] = [
  { name: 'kbd', title: 'Key', example: 'Press :kbd[Ctrl+Shift+P].', summary: 'Keys and key combinations as key caps; + separates the keys.' },
  { name: 'badge', title: 'Badge', example: 'Export to PowerPoint :badge[Beta]{variant=info}', summary: 'A short status label inside text: neutral, info, success, warning, error or ai.' },
  { name: 'footnote', title: 'Footnote', example: 'Contrast is measured on the rendered page.[^contrast]\n\n[^contrast]: Guard also measures with high contrast requested.', summary: 'An aside or a source without breaking the sentence: `[^name]` in the text and `[^name]: the note` on its own line at the top level (the end of the document is best). Notes are numbered by first use and collected under Notes at the end; decks get a Notes slide. Every note must be used and every reference defined.' },
  { name: 'citation', title: 'Citation', example: 'Text alternatives are required for images [@wcag22, sec. 1.1.1].', summary: 'A source from the front matter references list: `[@id]`, with a page or section after a comma (`[@id, p. 33]`), several separated by ; (`[@a; @b]`). Shown as [1] or (Author, 2023) by the `:::references` style, linked to the list. Recognised only when the front matter has references.' },
];

/** Block names the Markdown parser accepts as :::directives (the rest are plain Markdown). */
export const DIRECTIVES: readonly string[] = BLOCKS.map((b) => b.name)
  .filter((n) => !['heading', 'paragraph', 'list', 'code', 'figure', 'diagram'].includes(n));

export { FALLBACKS, type Fallback } from './fallbacks.ts';
export { BLOCKS_CS, CHILD_TITLES, EXAMPLES_CS, GROUPS_CS, INLINES_CS, type CzechAttribute, type CzechBlock } from './i18n.ts';

export const block = (name: string): BlockDefinition | undefined => BLOCKS.find((b) => b.name === name);

/** The whole document model as one JSON Schema (2020-12), for AI tools that write LibKa documents. */
export function documentSchema(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:libka:schema:document',
    title: 'LibKa document',
    type: 'object',
    properties: {
      meta: obj({ title: str, subtitle: { type: 'string' }, version: { type: 'string' }, date: { type: 'string' }, status: { type: 'string' },
        owner: str, reviewed: isoDate, nextReview: isoDate, lang: str,
        references: { type: 'array', items: obj({ id: str, title: str, author: { type: 'array', items: str }, year: str, publisher: str, url: str }, ['id', 'title']) } }, ['title', 'lang']),
      blocks,
      footnotes: { type: 'array', items: obj({ id: str, body: blocks }, ['id', 'body']) },
    },
    required: ['meta', 'blocks'],
    additionalProperties: false,
    $defs: {
      block: { oneOf: BLOCKS.map((b) => b.schema) },
      inline: { type: 'array', description: 'mdast phrasing content (text, strong, emphasis, inlineCode, link, break, delete, footnoteReference, the :kbd[] and :badge[] directives, and LibKa citation nodes {type: citation, items: [{id, locator?}]}).', items: { type: 'object', required: ['type'] } },
    },
  };
}
