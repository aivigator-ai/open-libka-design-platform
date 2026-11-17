/**
 * The block reference for the libka-author Agent Skill (.claude/skills/libka-author/reference.md),
 * generated from the registry so an AI writes exactly the syntax the tools accept.
 */
import { BLOCKS, FALLBACKS, GROUPS, INLINES, type AttributeSpec, type BlockGroup } from './index.ts';

const fence = (text: string) => '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
const attrs = (a: Readonly<Record<string, AttributeSpec>>, prefix = '') => Object.entries(a).map(([n, s]) =>
  `  - \`${prefix}${n}\`${s.required ? ' (required)' : ''}: ${s.description}${s.values ? ` One of: ${s.values.join(', ')}.` : ''}`);

export function skillReference(version: string): string {
  const out = [
    '# LibKa block reference',
    '',
    `Generated from the block registry (LibKa ${version}). Do not edit by hand: \`node packages/blocks/src/build-skill.ts\`.`,
    '',
    '## Front matter',
    '',
    '```yaml',
    '---',
    'title: Required. The document title (there is no # heading in the body).',
    'subtitle: Optional one-line subtitle.',
    'version: "1.0"      # optional, quoted',
    'date: "2026-10-03"  # optional, quoted',
    'date-format: long   # optional: how the outputs write dates: long, short or iso (default: long)',
    'status: Draft       # optional',
    'author:                     # optional: who wrote it; one name as text, or a list',
    '  - name: Ann Novak',
    '    role: Security lead     # optional',
    'owner: Platform team        # optional: who keeps it correct',
    'reviewed: 2026-09-01        # optional: last review, YYYY-MM-DD',
    'next-review: 2027-03-01     # optional: review due, YYYY-MM-DD',
    'references:                 # optional: sources cited as [@id]',
    '  - id: wcag22              # letters, digits and - _ : . /',
    '    title: Web Content Accessibility Guidelines (WCAG) 2.2   # required',
    '    author: W3C             # a person as "Doe, Jane"; several as a list',
    '    year: 2023',
    '    publisher: World Wide Web Consortium   # also a journal or website name',
    '    url: https://www.w3.org/TR/WCAG22/',
    '  - id: smith-lee-2024',
    '    title: Attention in Video Meetings',
    '    author: ["Smith, Anna", "Lee, Ben"]   # text: (Smith and Lee, 2024); 3 or more: (Smith et al., 2024)',
    '    year: 2024',
    'lang: en            # en or cs; sets the language of the page text',
    'outputs: [web, pdf, docx]   # optional: what the build makes: web, pdf, deck, docx (default: web and pdf)',
    'theme: modern               # optional: classic (the default) or modern, or a .theme.json file in the project',
    'brand: ../_brand.yml        # optional: a brand file, the path relative to this document, or libka for LibKa\'s own (see "Brand file")',
    'ai:                         # optional: how AI took part; leave it out when it did not',
    '  use: ai-generated         # ai-generated (AI wrote it) or ai-assisted (AI helped with a person\'s text); alone: ai: ai-generated',
    '  reviewed-by: Ann Novak    # optional: who checked it and holds editorial responsibility',
    '  label: true               # optional: show "Created with AI tools." under the title (default: not shown)',
    '---',
    '```',
    '',
    '`ai` records how AI took part, in the signed manifest; it is the author\'s declaration. Its optional fields are `reviewed-by`, `approved-by`, `tool`, `date` (YYYY-MM-DD), `checked` (a list, such as `[facts, figures]`) and `label`. The label is shown only with `label: true`: "Created with AI tools." under the title (on the title slide of a deck), with "Reviewed and approved by …" when it names someone, and an "AI-generated" badge before each block marked `ai=generated` that nobody is named as having reviewed. Any block except `toc`, `references`, `byline` and `doc-status` takes `ai=generated` or `ai=assisted` for the parts AI wrote; `:::summary{source=ai}` counts as `ai=generated`. `lint` reminds you when AI-generated content names nobody who reviewed it and shows no label: AI-generated text that informs the public on matters of public interest needs a person\'s review with editorial responsibility, or a label (EU AI Act, Article 50(4)); whether a document does is the author\'s call.',
    '',
    '`theme` and `brand` choose the design: a theme sets the type, the heading weight, the corners and the density (`classic`: Fraunces headings over Inter, headings semi-bold, medium corners; `modern`: Space Grotesk headings over Inter, headings bold, small corners); a brand sets the colours, fonts from LibKa\'s list and a logo ("Brand file" below). Without them the build takes the project\'s `_brand.yml` (next to the document or in a folder above it, up to the project\'s root) and the theme it names (`defaults.libka.theme`), else LibKa\'s brand and Classic; a document\'s `theme:` wins over the brand\'s. A brand\'s colours never fail: LibKa moves a colour that would fail a contrast check to a passing shade of the same hue, in every mode, and the build says what it did. Leave both out unless the user names a brand, a theme or a look; never write colours or fonts into the document. In a Marp deck (`marp: true`) `theme` is Marp\'s.',
    '',
    '## Brand file',
    '',
    'A brand is a `_brand.yml` file in the project (Posit\'s brand.yml format, of which LibKa reads the subset below). Put it at the project\'s root, so every document finds it without `brand:`; the logo files go next to it or in a folder below it. LibKa reports every other key: one brand.yml does not have is an error (with the nearest key), one LibKa does not use is a warning saying why, another tool\'s `defaults` a note. `libka lint` checks the brand file with the document.',
    '',
    '```yaml',
    'meta:',
    '  name:',
    '    full: Tern Bay Literacy Trust     # the logo\'s alt text when its image gives none',
    '    short: Tern Bay',
    'logo:',
    '  images:',
    '    mark: { path: brand/mark.svg, alt: Tern Bay Literacy Trust }   # SVG or PNG, next to the brand file or below it',
    '    mark-light: { path: brand/mark-on-dark.svg, alt: Tern Bay Literacy Trust }',
    '  medium:                    # LibKa uses medium, else small, else large',
    '    light: mark',
    '    dark: mark-light         # optional: the variant for the dark modes',
    'color:',
    '  palette:                   # names for hex colours, used below',
    '    harbour: "#0B6E4F"',
    '    sunrise: "#FFA62B"',
    '    teal: "#7FD1C7"',
    '  primary: harbour           # bars, borders, charts, the accent button, links and accent text',
    '  secondary: sunrise         # the AI marks and the AI button; chart series 2 without a list',
    'typography:',
    '  headings: Bitter           # a family from LibKa\'s list (below)',
    '  base: Public Sans          # the body text',
    '  link:',
    '    color: harbour           # optional: links and accent text from this colour instead of the primary',
    'defaults:',
    '  libka:',
    '    id: tern-bay             # optional: names the lock file and the brand in the signed manifest',
    '    theme: classic           # the project\'s theme; a document\'s theme: wins',
    '    charts: [harbour, sunrise, teal]   # optional: 1 to 6 chart colours in order; LibKa\'s fill the rest',
    '    neutral: tinted          # optional: the greys take a little of the primary colour\'s hue',
    '```',
    '',
    '- **Colours are seeds.** Each role gets the brand colour if it passes, else the nearest shade of its hue that does, in each mode (light, dark and both high-contrast modes), and the build says so in words: "the primary colour #F2C500: bars, borders and charts use #A88800 to reach 3:1; links and accent text use #7D6400 to reach 4.5:1". A light primary colour (a yellow, a pale coral) keeps its look on bars and the button but turns dark and dull as text; when the brand has a darker colour, name it in `typography.link.color` and tell the user. Status colours (success, warning, error, info), text colours and backgrounds stay LibKa\'s, so `color.foreground`, `background`, `tertiary`, `success`, `warning`, `danger`, `info`, `light` and `dark` are not used.',
    '- **Fonts:** LibKa ships its fonts and never fetches any. Headings: Fraunces, Inter, Literata, Bitter, Space Grotesk, Atkinson Hyperlegible Next, Public Sans. Body text: Inter, Literata, Bitter, Atkinson Hyperlegible Next, Public Sans. Code is always JetBrains Mono. A brand\'s font outside the list (Helvetica, Myriad, Calibri, a system font) cannot be used: choose the nearest from the list (a neutral sans: Inter or Public Sans; a serif: Literata or Bitter) and tell the user. The theme sets the weights and sizes; `typography.fonts` may list the families, but its `source` is not used. A Word file carries no fonts: it uses Georgia for Fraunces, Literata and Bitter, and Arial for the sans families.',
    '- **The logo** goes above the title of the web page and the PDF\'s first page, on the title slide and above the title in Word, with its alt text; the dark variant in the dark modes. It is not repeated on later pages.',
    '- **Charts:** `defaults.libka.charts`, else the primary and secondary colours, then LibKa\'s series; each is moved to 3:1 against the page if needed, and the build names the series that moved and those LibKa filled.',
    '- **The lock:** the first build writes `<id>.<theme>.design.lock.json` (`brand.<theme>…` without an `id`) next to the brand file, the solved design; commit it with the brand file. It is written again when the brand, the theme or LibKa\'s solver changes.',
    '- **Not carried:** the logo\'s clear space or a logo on every page, the secondary colour beyond the AI marks and charts, heading weights, link decoration (links stay underlined), backgrounds. Say so to the user when their brand guide asks for these.',
    '',
    'Quote `version` and `date` (YAML would read 1.10 as a number), and any value that contains a colon (`title: "Payments: onboarding"`); `reviewed` and `next-review` work quoted or not. `date` is the publication date as free text ("2026-10-03" or "October 2026"); leave it out when it would only repeat `reviewed`. Write every date in the source as YYYY-MM-DD (the front matter, a decision\'s or a release\'s `date`, the revision history, a timeline\'s days and months); the outputs write it in the document\'s language: `long` "28 October 2026" / "28. října 2026" (the default), `short` "28/10/2026" / "28. 10. 2026", `iso` "2026-10-28". Set `date-format` only when the user asks for a format; the machine-readable date stays ISO. A reference entry has only the fields shown: `id`, `title`, `author`, `year`, `publisher`, `url`.',
    '',
    '`status` is free text (Draft, Approved, Example ...); Approved, Draft and Deprecated get a colored badge, and Deprecated also a fixed banner at the top ("This document is no longer maintained …"); name the document that replaces it once, in the sentence before the first `##`. `author`, `date`, `status`, `owner`, `reviewed` and `next-review` appear under the title (the authors on the title slide of a deck, or where a `:::byline` stands), and the last four also in the footer or in a `:::doc-status` panel where you place one. `author` names people; a team or a role that keeps the document correct is the `owner`. Czech status words get the same badges: Schváleno or Platný, Koncept or Návrh, and Zastaralý (with the banner). `lint` warns when `next-review` has passed.',
    '',
    '## Syntax details',
    '',
    '- **Nesting:** each level out gets one more colon. A checklist inside a tab inside tabs: `:::::tabs` > `::::tab[Mac]` > `:::checklist`, each closed by a line with the same number of colons.',
    '- **Attribute values** go in double quotes: `caption="Plans and prices"`. To put a double quote inside, wrap the value in single quotes: `source=\'What "open" means\'`. Backslash escapes do not work.',
    '- **Block contents:** callouts, tabs, accordion items, cards, quotes and do/don\'t items hold ordinary Markdown: paragraphs, lists, links, code, even other blocks, but no headings and no `:::notes`. A quote `source` is plain text; its link goes in `cite`.',
    '- **In-page links:** a heading\'s id is its text in lower case with hyphens (`## Getting started` → `#getting-started`; repeats get `-2`). Glossary terms get `#term-…`. Lint reports links that point nowhere.',
    '- **Outputs:** tabs are keyboard tabs on the web page (added by a small script) and every tab is shown in the PDF and on slides; accordions are open in the PDF and on slides. `:::notes` text appears only in the deck: not on the web page, not in the PDF. `outputs` names what the build makes: `web` (the page), `pdf` (its A4 PDF), `deck` (16:9 slides) and `docx` (an editable Word file); leave it out for the web page and the PDF, and add `deck` when the content will be presented. The PDF and the Word file need `web`. In the Word file tabs and accordions are open, diagrams, charts and UI specimens are pictures with their text alternative (a chart\'s data follows as a table), and footnotes are Word footnotes.',
    '- **GitHub alerts:** `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]` and `> [!CAUTION]` quotes become callouts; text after the marker on the same line is the title. More than 2 callouts in one `##` section get a lint hint.',
    '- **Notes and sources:** footnote definitions (`[^name]: ...`) go at the top level, best at the end, never inside a block. Every cited `[@id]` must be in `references` and every entry cited. Notes, and the reference list when there is no `:::references`, are added at the end by the build: do not write a "Notes" or "References" section yourself. `:::references[Title]` makes its own section heading (and slide) where it stands, usually after the last `##`, with no heading of your own above it. A footnote marker goes after the punctuation and after a citation: `…better [@smith-lee-2024].[^1]`. Write authors who are people as "Doe, Jane" so the author-date style shows "Doe"; an organisation is written as is.',
    '- **Diagrams:** `accTitle:` and `accDescr:` go right after the first line in every type (`sequenceDiagram`, then `accTitle: ...`, then `participant` lines). `accDescr` is the text alternative: one lead sentence beside the diagram is enough, do not repeat the whole description as body text. On a slide the diagram takes the space left under the heading and text; slides are wide, so prefer `flowchart LR` and `direction LR` in state diagrams, and give long prose its own `###` when Guard reports the slide as too full.',
    '- **Contents:** a manual with two or more `##` sections gets contents at the top by itself. It cannot be switched off; `:::toc` only moves it and sets its depth.',
    '- **Heading ids** drop accents and punctuation, and a dot inside a word becomes a hyphen: `## Výběr datových sad` → `#vyber-datovych-sad`, `## U.S. imports` → `#u-s-imports`. When unsure, run lint: it names the id it expected.',
    '- **FAQ:** one `::::accordion` per topic is fine, also with a single item; split a long FAQ into topics with `###`.',
    '- **Release notes:** say a change once: a dropped platform goes in `:::removed`, and in a notice before the groups only when the reader must act. A `###` after a release continues it on its own slide (for example migration notes). Each `::::release` is a `##` heading. Drop the source\'s grouping heading ("What changed", "Changelog") when the versions follow it directly; in a document with other topics, open the versions with `:::section[What changed]` and put them after the other topics.',
    '- **Decisions:** each `::::decision` is a `##` heading in the contents. Drop the source\'s grouping heading ("Decisions", "Decisions behind this policy"); open the decisions with a `:::section` only when the whole document is divided into parts. A proposal names who proposes it in its opening sentence (`by=` is who decided); a rejected decision\'s title states what was proposed ("Charge for reservations"), and its opening sentence says it was not taken.',
    '- **Parts:** `:::section[Part 2: Results]` is a level-2 heading that groups the `##` sections after it, up to the next `:::section` or the end of the document; it stands at the top level, never inside another block.',
    '- **Slides:** every `##` and `###` is a slide, numbered from 1 = the title slide; a `:::section` is a slide of its own, and so is a `:::summary` placed before the first `##`. A slide holds about 120 words, less with figures, charts or UI specimens. `lint` warns when a slide is probably too full. The build measures every slide and fits it: a little overflow is shrunk (to 85% at most), more is continued on a "(continued)" slide, and long steps, lists, tables, description lists, accordions, cards and the contents agenda continue item by item (steps and the agenda keep counting; an agenda slide holds about 10 sections and parts). An accordion question that alone is taller than a slide is opened on the slides: the question becomes a subheading and the answer continues paragraph by paragraph. Only a block it cannot split that is taller than a slide fails: a do-and-don\'t pair, a long code block or code group, a chart or diagram with text around it.',
    '',
    '## Choose a block',
    '',
    '| Content looks like | Block |',
    '|---|---|',
    ...BLOCKS.map((b) => `| ${b.useWhen.replace(/\|/g, '/')} | ${b.title} (\`${b.name}\`) |`),
    '',
    '## Inside text',
    '',
    ...INLINES.flatMap((i) => i.example.includes('\n')
      ? [`- **${i.title}**: ${i.summary} Example:`, '', '  ```markdown', ...i.example.split('\n').map((l) => (l ? `  ${l}` : '')), '  ```', '']
      : [`- **${i.title}**: ${i.summary} Example: \`${i.example}\``]),
    '',
  ];
  for (const group of Object.keys(GROUPS) as BlockGroup[]) {
    const list = BLOCKS.filter((b) => b.group === group);
    if (!list.length) continue;
    out.push(`## ${GROUPS[group]}`, '');
    for (const b of list) {
      const f = fence(b.example);
      out.push(`### ${b.title} (\`${b.name}\`)`, '', b.summary, '', `Use it when: ${b.useWhen}`, '');
      if (b.frontMatter) out.push('In the front matter:', '', '```yaml', b.frontMatter, '```', '', 'In the text:', '');
      out.push(`${f}markdown`, b.example, f, '');
      const a = [...attrs(b.attributes ?? {}), ...Object.entries(b.children ?? {}).flatMap(([c, s]) => attrs(s, `${c}: `))];
      if (a.length) out.push('Attributes:', ...a, '');
      out.push(`Slides: ${b.targets.deck}`, '', 'Avoid:', ...b.antiPatterns.map((x) => `- ${x}`), '');
    }
  }
  out.push('## Content without a block', '',
    'LibKa has no block for these kinds of content. Never invent block syntax for them (the parser rejects unknown blocks); write what the second column says.', '',
    '| Content | Write |', '|---|---|',
    ...FALLBACKS.map((f) => `| ${f.content.replace(/\|/g, '/')} | ${f.write.replace(/\|/g, '/')} |`), '');
  return out.join('\n');
}
