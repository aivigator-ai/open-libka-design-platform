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
    'status: Draft       # optional',
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
    '---',
    '```',
    '',
    'Quote `version` and `date` (YAML would read 1.10 as a number), and any value that contains a colon (`title: "Payments: onboarding"`); `reviewed` and `next-review` work quoted or not. `date` is the publication date as free text ("2026-10-03" or "October 2026"); leave it out when it would only repeat `reviewed`. A reference entry has only the fields shown: `id`, `title`, `author`, `year`, `publisher`, `url`.',
    '',
    '`status` is free text (Draft, Approved, Example ...); Approved, Draft and Deprecated get a colored badge, and Deprecated also a fixed banner at the top ("This document is no longer maintained …"); name the document that replaces it once, in the sentence before the first `##`. `date`, `status`, `owner`, `reviewed` and `next-review` appear under the title, and the last four also in the footer or in a `:::doc-status` panel where you place one. Czech status words get the same badges: Schváleno or Platný, Koncept or Návrh, and Zastaralý (with the banner). `lint` warns when `next-review` has passed.',
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
    '- **Release notes:** say a change once: a dropped platform goes in `:::removed`, and in a notice before the groups only when the reader must act. A `###` after a release continues it on its own slide (for example migration notes). Each `::::release` is a `##` heading. Drop the source\'s grouping heading ("What changed", "Changelog") when the versions follow it directly; in a document with other topics, open the versions with `:::section[What changed]`.',
    '- **Parts:** `:::section[Part 2: Results]` is a level-2 heading that groups the `##` sections after it; it stands at the top level, never inside another block.',
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
