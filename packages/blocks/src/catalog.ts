/**
 * The block catalog as a LibKa manual, generated from the registry: every block with its syntax, the
 * rendered result, its attributes, what each output does with it, accessibility and anti-patterns.
 * `node packages/blocks/src/build-catalog.ts` writes docs/blocks.md; libka build turns it into the
 * catalog page, checked by Guard like any manual.
 */
import { BLOCKS, GROUPS, INLINES, type AttributeSpec, type BlockGroup } from './index.ts';

/** A fence one backtick longer than any run inside the text. */
const fence = (text: string) => '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
const cell = (s: string) => s.replace(/\|/g, '\\|');
/** Lines that would close a ::: container or be read as a directive inside a table cell are kept as code. */
const code = (s: string) => `\`${s.replace(/`/g, '')}\``;

function attributes(title: string, attrs: Record<string, AttributeSpec>, prefix = ''): string[] {
  return Object.entries(attrs).map(([name, a]) =>
    `| ${code(prefix + name)} | ${cell(a.description)}${a.values ? ` One of: ${a.values.map(code).join(', ')}.` : ''} | ${a.required ? 'yes' : 'no'} |`);
}

export function catalogMarkdown(version: string): string {
  const out: string[] = [
    '---',
    'title: LibKa blocks',
    'subtitle: Every block with its syntax, an example, and what it does on the web, in PDF, on slides and in Word',
    `version: "${version}"`,
    'status: Generated from the block registry',
    'lang: en',
    ...BLOCKS.flatMap((b) => (b.frontMatter ? [b.frontMatter] : [])),
    '---',
    '',
    'A LibKa document is Markdown plus a few blocks. This page is generated from the block registry (`@libka/blocks`), so it always lists what the tools actually accept, and it is built and checked like any manual.',
    '',
    ':::metrics',
    `- **${BLOCKS.length}** blocks in ${Object.keys(GROUPS).length} groups`,
    '- **4** outputs from one source: web, PDF, slides, Word',
    '- **0** blocks that need a script to be read',
    ':::',
    '',
    ':::callout[Nesting]{variant=info}',
    'Blocks that contain other blocks (tabs, accordion, cards, do and don\'t) get one more colon on the outside: `::::tabs` around `:::tab`.',
    ':::',
    '',
    ':::callout[Choose the outputs]{variant=info}',
    'The front matter line `outputs: [web, pdf, deck, docx]` says what the build makes: the web page, its A4 PDF, 16:9 slides and an editable Word file. Without it a document gets the web page and its PDF. The PDF and the Word file are made from the web page and signed with it, so they need `web`.',
    ':::',
  ];
  for (const group of Object.keys(GROUPS) as BlockGroup[]) {
    const list = BLOCKS.filter((b) => b.group === group);
    if (!list.length) continue;
    out.push('', `## ${GROUPS[group]}`);
    for (const b of list) {
      out.push('', `### ${b.title}`, '', b.summary, '', `**Use it when:** ${b.useWhen}`, '');
      const f = fence(b.example);
      if (b.frontMatter) out.push('In the front matter:', '', '```yaml', b.frontMatter, '```', '', 'In the text:', '');
      out.push(`${f}markdown`, b.example, f, '');
      if (b.name === 'heading') out.push('*The result is the headings of this page.*');
      else if (b.name === 'toc') out.push('*Not shown here, so this page keeps its contents at the top: the result looks like that list, placed where the block stands.*');
      else if (b.name === 'notes') out.push('*Speaker notes are not shown here: they appear only in the deck.*');
      else if (b.name === 'section') out.push('*Not shown here, so it does not split this page: the result is a rule and a large heading that also opens a part in the contents.*');
      else out.push(b.example);
      const rows = [...attributes(b.title, { ...b.attributes }), ...Object.entries(b.children ?? {}).flatMap(([child, attrs]) => attributes(b.title, attrs, `:::${child} `))];
      if (rows.length) {
        out.push('', `:::table{caption="${b.title}: attributes"}`, '', '| Attribute | Meaning | Required |', '|---|---|---|', ...rows, '', ':::');
      }
      out.push('', '::::accordion',
        ':::item[In each output]', `- **Web:** ${b.targets.web}`, `- **PDF:** ${b.targets.pdf}`, `- **Slides:** ${b.targets.deck}`, `- **Word:** ${b.targets.docx}`, ':::',
        ':::item[Accessibility]', ...b.a11y.map((a) => `- ${a}`), ':::',
        ':::item[Avoid]', ...b.antiPatterns.map((a) => `- ${a}`), ':::',
        '::::');
    }
  }
  out.push('', '## Inside text', '');
  for (const i of INLINES) {
    out.push(`### ${i.title}`, '', i.summary, '', '```markdown', i.example, '```', '', i.example, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
