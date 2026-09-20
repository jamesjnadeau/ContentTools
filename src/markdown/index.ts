/* Public entry for `@jamesjnadeau/content-tools/markdown`.
 *
 * Behind its own subpath, and NOT re-exported from the root entry: it pulls
 * in mdast and micromark, which would otherwise land in the script-tag
 * bundle for every consumer who never edits markdown. The constraint
 * profile that markdown mode actually needs is dependency-free and lives in
 * the root entry instead.
 */

export {MarkdownDocument} from './document.js';

export {parseMarkdown} from './parse.js';
export type {ParsedMarkdown, Frontmatter} from './parse.js';

export {toHTML, blockToHTML, SOURCE_ATTRIBUTE, LANGUAGE_ATTRIBUTE} from './to-html.js';
export {fromHTML} from './from-dom.js';
export type {EditedBlock} from './from-dom.js';

export {serializeBlock} from './serialize.js';
export {isRepresentable} from './blocks.js';
export type {Node, Parent, Position, Point, SourceBlock} from './types.js';
