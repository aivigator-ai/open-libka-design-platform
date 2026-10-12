/**
 * Content LibKa has no block for, and how to write it with the blocks that exist. The skill and the MCP server give
 * these to AI tools, so they never invent syntax; a test checks that every block and inline named here exists.
 */

export interface Fallback {
  /** The kind of content, as an author would describe it. */
  content: string;
  /** What to write instead, with existing blocks or plain Markdown. */
  write: string;
}

export const FALLBACKS: readonly Fallback[] = [
  { content: 'Byline: author, role and date of a page.', write: 'Front matter date and status.' },
  { content: 'Revision history: versions, approvals and sign-off for policies and proposals.', write: ':::table{caption="Revision history"}.' },
  { content: 'Decision record: context, options, decision and consequences with a status.', write: '## sections for the context, options, decision and consequences; status and date in the front matter; options weighed on the same criteria as a :::comparison with highlight= on the chosen one.' },
  { content: 'Pros and cons: weighing one option (unlike do and don\'t, which is guidance).', write: '::::tabs or two lists under bold "Pros" / "Cons" labels.' },
  { content: 'Progress indicator: where the reader is in a multi-part journey (status, not instructions).', write: ':::steps, naming the current step in its title.' },
  { content: 'Math: inline and display formulas.', write: 'Write the formula in code or as an image with alt text.' },
  { content: 'Process / cycle / funnel: a linear, cyclic or funnel process without a full diagram.', write: ':::steps.' },
  { content: 'Roadmap / Gantt: phases on lanes across time, with milestones.', write: ':::table of lanes, items and dates.' },
  { content: 'Term with definition: an inline term linked to its glossary definition.', write: 'Link the term to its glossary entry, written like `[SLA](#term-sla)`.' },
  { content: 'Embed: third-party interactive content such as prototypes, forms, notebooks.', write: 'A figure with a link to the original.' },
  { content: 'Download: a file with its type, size and page count.', write: 'A link whose text names the format and size, written like `[Annual report (PDF, 2.1 MB)](report.pdf)`.' },
  { content: 'Testimonial: a customer quote with name, role, organisation and a result.', write: ':::quote{source="Name, role, organisation"}.' },
  { content: 'Team / people: people with photo, name and role.', write: ':::gallery of portraits, captions with name and role.' },
  { content: 'Margin note: a tangential note beside the text.', write: ':::callout[Title]{variant=note}, or :::notes in a deck.' },
  { content: 'Terminal session: shell commands with prompt and output told apart.', write: 'A code block with title="Terminal", commands only.' },
  { content: 'API endpoint: method, path, parameters and responses.', write: '### POST /v1/users with a :::table of parameters and code examples.' },
  { content: 'File tree: a project or folder structure.', write: 'A nested list, or a code block of the tree.' },
  { content: 'Agenda slide: the talk outline, highlighting the current section.', write: ':::toc[Agenda] before the first ## gives an agenda slide (without highlighting the current section).' },
  { content: 'Closing / contact slide: thank you, recap and contact at the end of a deck.', write: 'A final ## section with a statement and links.' },
  { content: 'KPI with trend: a number with its change and a word-sized trend line.', write: ':::metrics with the change written out ("up 12% on Q2").' },
  { content: 'Matrix / SWOT: items in four quadrants, such as SWOT, or effort and impact.', write: '::::cards with four cards.' },
  { content: 'Org chart: reporting lines or a decision tree.', write: 'A nested list.' },
  { content: 'Map: a location or regional data.', write: 'A figure of the map plus the address as text.' },
  { content: 'Pull quote: a line from the text repeated large, magazine style.', write: ':::statement.' },
  { content: 'Annotations: numbered notes on code or text.', write: 'Comments in the code, or a numbered list after it.' },
  { content: 'Before / after: two states of an image.', write: ':::gallery with two captioned images.' },
  { content: 'AI provenance: marking AI-generated or AI-assisted content and who reviewed it.', write: ':badge[AI draft]{variant=ai} next to the content, in the document\'s language (Czech: :badge[Koncept od AI]{variant=ai}).' },
  { content: 'Prompt: a copyable AI prompt.', write: 'A code block with title="Prompt".' },
  { content: 'Line items: quantities, prices, tax and totals in quotes and invoices.', write: ':::table with the totals as the last rows.' },
  { content: 'Q&A slide: "Questions?" at the end of a deck.', write: 'A final ## Questions section with a statement.' },
];
