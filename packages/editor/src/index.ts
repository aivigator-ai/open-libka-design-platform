/**
 * @libka/editor: visual editing of LibKa documents. The ProseMirror schema and the lossless round-trip with LibKa
 * Markdown; the Studio builds its visual editor on these.
 */
export { schema, type Attributes } from './schema.ts';
export { blockAt, load, loadedRanges, mdast, save, saveMapped, writeBlock, type BlockRanges, type Loaded } from './markdown.ts';
export { blockInfo, blocksFrom, INSERTABLE, insertables, isFigure, type BlockInfo, type Insertable } from './blocks.ts';
export {
  blockSummary, blockTitle, fold, groupTitle, inlineText, localAttributes, matches, partTitle, plainText, searchWords, type Lang, type LocalAttribute, type Part,
} from './names.ts';
export {
  BlockSelection, changeType, conversionsFor, deleteBlocks, duplicateBlocks, enterBlock, extendSelection, insertBlock, insertBlocks, markActive, markdownOf,
  markdownShortcuts, moveBlocks, objectRange, objectsOf, posBefore, selectedObject, selectParent, selectSibling, sliceFromMarkdown, toggleFormat, unwrap, wrapIn,
  type Conversion, type ObjectRange,
} from './commands.ts';
export { applyFix, appliesToText } from './fixes.ts';
export { barPartHolder, barTarget, quickSetting, selectBlockAt, setBlockAttribute, type BarTarget } from './bar.ts';
export { addPart, canAddPart, GRIDS, LAID_OUT, partCount, partHolder, partName, PARTS as LAID_PARTS, type PartSpec } from './parts.ts';
