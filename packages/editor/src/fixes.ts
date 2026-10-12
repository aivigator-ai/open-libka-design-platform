/**
 * Applying a problem's fix (from @libka/model) to LibKa Markdown: the text is loaded, the block on the problem's line
 * is changed with the editor's own operations, and the text saved, so every other block stays byte for byte. The
 * Studio uses it in both modes. A `field` fix changes nothing here (the author writes what only they know), and a
 * front matter fix is the Studio's (it edits YAML).
 */
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { Fix } from '@libka/model';
import { load, save } from './markdown.ts';
import { schema } from './schema.ts';

/** Fixes that change the text here (the others are the caller's: fields, the front matter). */
export const appliesToText = (fix: Fix): boolean => fix.kind !== 'field' && fix.kind !== 'set-front-matter';

const directive = (n: PMNode) => n.type === schema.nodes.directive || n.type === schema.nodes.leaf_directive;

/** The text with the fix applied to the block on `line`; null when the fix does not apply there. */
export function applyFix(source: string, line: number, fix: Fix): string | null {
  if (!appliesToText(fix)) return null;
  const loaded = load(source);
  const wanted = (n: PMNode): boolean => {
    switch (fix.kind) {
      case 'remove-attribute': return directive(n) && fix.name in n.attrs.attributes;
      case 'rename-attribute': return directive(n) && fix.from in n.attrs.attributes;
      case 'set-attribute': return directive(n);
      case 'rename-block': return directive(n);
      case 'list-type': return n.type === schema.nodes.directive;
      case 'heading-level': return n.type === schema.nodes.heading;
      case 'wrap': return n.isBlock && n.type !== schema.nodes.doc;
      default: return false;
    }
  };
  // the block that starts on the line and fits the fix: the outermost for a wrap (a list and its first paragraph
  // start on the same line), the innermost otherwise (a tab inside tabs)
  let target: { node: PMNode; pos: number } | null = null;
  loaded.doc.descendants((n, pos) => {
    if (loaded.lines.get(n) === line && wanted(n) && !(fix.kind === 'wrap' && target)) target = { node: n, pos };
    return true;
  });
  if (!target) return null;
  const { node, pos } = target as { node: PMNode; pos: number };
  const tr = EditorState.create({ doc: loaded.doc }).tr;
  const attrs = node.attrs.attributes as Record<string, string>;
  switch (fix.kind) {
    case 'remove-attribute': {
      const { [fix.name]: _gone, ...rest } = attrs;
      tr.setNodeMarkup(pos, null, { ...node.attrs, attributes: rest });
      break;
    }
    case 'rename-attribute': {
      const renamed = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k === fix.from ? fix.to : k, v]));
      tr.setNodeMarkup(pos, null, { ...node.attrs, attributes: renamed });
      break;
    }
    case 'set-attribute': tr.setNodeMarkup(pos, null, { ...node.attrs, attributes: { ...attrs, [fix.name]: fix.value } }); break;
    case 'rename-block': tr.setNodeMarkup(pos, null, { ...node.attrs, name: fix.to }); break;
    case 'heading-level': tr.setNodeMarkup(pos, null, { ...node.attrs, level: fix.level }); break;
    case 'list-type': {
      let done = false;
      node.forEach((child, offset) => {
        if (done || (child.type !== schema.nodes.bullet_list && child.type !== schema.nodes.ordered_list)) return;
        const type = fix.ordered ? schema.nodes.ordered_list! : schema.nodes.bullet_list!;
        tr.setNodeMarkup(pos + 1 + offset, type, fix.ordered ? { start: 1, spread: child.attrs.spread } : { spread: child.attrs.spread });
        done = true;
      });
      if (!done) return null;
      break;
    }
    case 'wrap': {
      const wrapper = schema.nodes.directive!.create({ name: fix.block, attributes: fix.attributes ?? {} }, node);
      tr.replaceWith(pos, pos + node.nodeSize, wrapper);
      break;
    }
    default: return null;
  }
  const out = save(tr.doc, loaded);
  return out === source ? null : out;
}
