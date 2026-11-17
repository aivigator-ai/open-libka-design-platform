#!/usr/bin/env node
/**
 * The LibKa MCP server: gives AI agents LibKa as tools, so they can turn any content into a LibKa
 * document, check it and build it, and repair it until it passes.
 *
 *   tools      libka_list_blocks   which block fits which content (and what to write where none does)
 *              libka_get_block     one block: syntax, attributes, JSON schema, accessibility, anti-patterns
 *              libka_check         parse LibKa Markdown: problems with line numbers, outline, slide count
 *              libka_build         build the web page (+ PDF, slides, Word file), run Guard, sign; returns files and findings
 *   resources  libka://guide        the authoring guide (the libka-author skill)
 *              libka://reference    the block reference, generated from the registry
 *              libka://schema/document  the document model as JSON Schema
 *              libka://templates    the templates (a report, a talk, a manual, a policy, decision records): names, descriptions, theme, outputs
 *              libka://template/{id}/{lang}  a template's LibKa Markdown, in English or Czech
 *   prompts    convert-to-libka     turn the given content into a LibKa document
 *
 * Run over stdio: node packages/mcp/src/server.ts (the repository's .mcp.json does this for Claude Code), or
 * npx -y @libka/mcp from the npm package.
 * libka_build writes files: by default into LIBKA_OUT, or ./libka-out under the server's working directory.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BLOCKS, FALLBACKS, INLINES, block, documentSchema } from '@libka/blocks';
import { skillReference } from '@libka/blocks/skill-reference';
import { build, lint, VERSION } from '@libka/cli';
import { OUTPUTS } from '@libka/model';

// the authoring guide: the skill in the repository, or its copy in the npm package (dist/ beside assets/)
const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = existsSync(join(HERE, '..', 'assets', 'SKILL.md')) ? join(HERE, '..', 'assets', 'SKILL.md')
  : resolve(HERE, '..', '..', '..', '.claude', 'skills', 'libka-author', 'SKILL.md');
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const guide = () => readFileSync(SKILL, 'utf8').replace(/^---[\s\S]*?---\n/, '').trimStart();
// the templates: create-libka's gallery in the repository, or its copy in the npm package
const GALLERY = existsSync(join(HERE, '..', 'assets', 'templates')) ? join(HERE, '..', 'assets', 'templates')
  : resolve(HERE, '..', '..', 'create-libka', 'gallery');
interface Template { id: string; name: Record<string, string>; description: Record<string, string>; file: string; theme: string; outputs: string[] }
const templates = (): Template[] => readdirSync(GALLERY, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  .map((id) => JSON.parse(readFileSync(join(GALLERY, id, 'template.json'), 'utf8')) as Template);
const LANGS = ['en', 'cs'];

export function createServer(): McpServer {
  const server = new McpServer({ name: 'libka', version: VERSION }, {
    instructions: 'LibKa turns one LibKa Markdown file (Markdown with LibKa blocks) into a web page, an A4 PDF, 16:9 slides and a Word file, each checked for accessibility. To write a LibKa document: read libka://guide, '
      + 'pick blocks with libka_list_blocks and libka_get_block, write the LibKa Markdown, then call libka_check (with the path the document is or will be saved at) until it has no problems and libka_build until Guard passes. '
      + 'For a report, a talk, a manual, a policy or decision records, start from a template: libka://templates lists them, libka://template/{id}/{lang} gives one. '
      + 'A brand (colours, fonts, a logo) is a _brand.yml file next to the document or above it; its format is in libka://reference, "Brand file".',
  });

  server.registerTool('libka_list_blocks', {
    title: 'List LibKa blocks',
    description: 'Every LibKa block with the content it fits ("use when"), grouped; plus content that has no block, and what to write for it instead.',
    inputSchema: { group: z.string().optional().describe('Only this group: text, how-to, explain, highlight, media, data, ui') },
  }, async ({ group }) => json({
    blocks: BLOCKS.filter((b) => !group || b.group === group).map((b) => ({ name: b.name, title: b.title, group: b.group, useWhen: b.useWhen, summary: b.summary })),
    inline: INLINES.map((i) => ({ name: i.name, example: i.example, summary: i.summary })),
    withoutBlock: group ? [] : FALLBACKS,
  }));

  server.registerTool('libka_get_block', {
    title: 'Get one LibKa block',
    description: 'Full definition of a block: example syntax, attributes, what the web page, PDF, slides and Word file do with it, accessibility rules, anti-patterns and its JSON schema.',
    inputSchema: { name: z.string().describe('Block name, such as steps, tabs, chart or ui') },
  }, async ({ name }) => {
    const def = block(name);
    if (def) return json(def);
    const inline = INLINES.find((i) => i.name === name);
    if (inline) return json(inline);
    return { isError: true, content: [{ type: 'text', text: `No block "${name}". Known: ${BLOCKS.map((b) => b.name).join(', ')}. `
      + 'For content no block fits, libka_list_blocks lists what to write instead ("withoutBlock"); never invent block syntax.' }] };
  });

  server.registerTool('libka_check', {
    title: 'Check LibKa Markdown',
    description: 'Parse LibKa Markdown without building: problems with line numbers (fix all of them), the outline, block counts, how many slides the deck will have and the design it is built with. Fast; call it after every change.',
    inputSchema: {
      markdown: z.string().describe('The complete LibKa Markdown document, including front matter'),
      path: z.string().optional().describe('Where the document is or will be saved (.md), so its brand and theme files (brand:, theme:, the project\'s _brand.yml) are found and checked too'),
    },
  }, async ({ markdown, path }) => json(lint(markdown, undefined, path ? resolve(path) : undefined)));

  server.registerTool('libka_build', {
    title: 'Build a LibKa document',
    description: 'Write the LibKa Markdown to a folder and build it: the outputs the document asks for in its front matter (outputs: web, pdf, deck, docx; default web and pdf), '
      + 'or the outputs given here. Guard checks every output (the pages in Chrome, the PDF with veraPDF when Java and veraPDF are installed, the Word file\'s structure); '
      + 'passing outputs are signed. Returns the files and every Guard finding to fix. Writes files on this machine, and removes this document\'s own earlier outputs that this build did not make again.',
    inputSchema: {
      markdown: z.string().optional().describe('The document; or give path instead, not both'),
      path: z.string().optional().describe('An existing .md file to build, only read (images are found next to it)'),
      name: z.string().optional().describe('File name without extension when markdown is given (default: document)'),
      outDir: z.string().optional().describe('Output folder (default: LIBKA_OUT, or ./libka-out)'),
      outputs: z.array(z.enum(OUTPUTS)).optional().describe('Build these instead of the document\'s own outputs, e.g. ["web", "deck"] to check slide fit quickly'),
    },
  }, async ({ markdown, path, name, outDir, outputs }) => {
    if (!markdown && !path) return { isError: true, content: [{ type: 'text', text: 'Give markdown or path.' }] };
    // the text goes into the output folder; an existing file is only read, never written over
    if (markdown && path) return { isError: true, content: [{ type: 'text', text: 'Give markdown or path, not both.' }] };
    const out = resolve(outDir ?? (process.env.LIBKA_OUT || 'libka-out'));
    let source = path ? resolve(path) : join(out, `${(name ?? 'document').replace(/[^\w.-]+/g, '-')}.md`);
    if (markdown) {
      mkdirSync(dirname(source), { recursive: true });
      writeFileSync(source, markdown);
    } else if (!existsSync(source)) {
      return { isError: true, content: [{ type: 'text', text: `${path}: file not found` }] };
    }
    source = resolve(source);
    const r = await build(source, { out, ...(outputs ? { outputs } : {}) });
    type Report = { checks: { id: string; mode: string; checked: number; violations: unknown[] }[] };
    // each output's own checks: the PDF's (veraPDF) and the Word file's apart from the page's
    const of = (report: Report | undefined, keep: (id: string) => boolean) => {
      const checks = report?.checks.filter((c) => keep(c.id)) ?? [];
      return checks.length ? checks.map((c) => ({ check: `${c.id}/${c.mode}`, checked: c.checked, violations: c.violations.length })) : undefined;
    };
    const page = (id: string) => id !== 'pdfua' && id !== 'docx';
    return json({
      ok: r.ok, problems: r.problems,
      files: [r.html, r.pdf, r.docx, r.manifest, r.conformance, r.deck?.html, r.deck?.pdf, r.deck?.manifest, r.deck?.conformance].filter(Boolean),
      ...(r.removed ? { removed: r.removed } : {}),
      guard: {
        web: of(r.report, page), pdf: of(r.report, (id) => id === 'pdfua'), docx: of(r.report, (id) => id === 'docx'),
        slides: of(r.deck?.report, page), slidesPdf: of(r.deck?.report, (id) => id === 'pdfua'),
      },
      // the design in words (what the brand's colours became, the theme, the logo), a signing key made, a PDF not validated
      ...(r.notes?.length ? { notes: r.notes } : {}),
      source: basename(source),
    });
  });

  server.registerResource('guide', 'libka://guide', { title: 'How to write LibKa documents', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: guide() }] }));
  server.registerResource('reference', 'libka://reference', { title: 'LibKa block reference', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: skillReference(VERSION) }] }));
  server.registerResource('document-schema', 'libka://schema/document', { title: 'LibKa document model (JSON Schema)', mimeType: 'application/schema+json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/schema+json', text: JSON.stringify(documentSchema(), null, 2) }] }));

  server.registerResource('templates', 'libka://templates', { title: 'LibKa templates', description: 'The templates a document can start from, with their names and descriptions in English and Czech, theme and outputs.', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(templates().map((t) => ({ ...t, text: Object.fromEntries(LANGS.map((l) => [l, `libka://template/${t.id}/${l}`])) })), null, 2) }] }));
  server.registerResource('template', new ResourceTemplate('libka://template/{id}/{lang}', {
    list: async () => ({ resources: templates().flatMap((t) => LANGS.map((l) => ({ uri: `libka://template/${t.id}/${l}`, name: `${t.name.en} (${l})`, mimeType: 'text/markdown' }))) }),
  }), { title: 'A LibKa template', description: 'A template\'s LibKa Markdown: replace its content with yours, keep its order.', mimeType: 'text/markdown' },
    async (uri, { id, lang }) => {
      const t = templates().find((x) => x.id === id);
      if (!t || !LANGS.includes(String(lang))) throw new Error(`No template ${id} in ${lang}. libka://templates lists them (languages: ${LANGS.join(', ')}).`);
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readFileSync(join(GALLERY, t.id, `${lang}.md`), 'utf8') }] };
    });

  server.registerPrompt('convert-to-libka', {
    title: 'Convert content to LibKa',
    description: 'Turn any content (document, notes, data, outline) into a LibKa document that builds to a web page, PDF, slides and a Word file.',
    argsSchema: {
      content: z.string().describe('The content to convert'),
      kind: z.string().optional().describe('What it should become: manual, guide, report, proposal, release notes, deck ...'),
    },
  }, ({ content, kind }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `${guide()}\n\n---\n\nConvert the following content into a LibKa document${kind ? ` (${kind})` : ''}. Use libka_list_blocks and libka_get_block for syntax, `
          + `check with libka_check until there are no problems, then build with libka_build and fix every Guard finding.\n\n<content>\n${content}\n</content>`,
      },
    }],
  }));
  return server;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  // stdout carries only the protocol: the build's notes (a new signing key, veraPDF missing) go to stderr
  console.log = (...args: unknown[]) => console.error(...args);
  await createServer().connect(new StdioServerTransport());
}
