/**
 * mdast -> markdown, for the blocks that actually changed.
 *
 * Only changed blocks reach this module. Everything else is spliced from
 * the original bytes, which is what keeps a pull request's diff to the
 * lines the user touched -- see `document.ts`.
 *
 * It doubles as the equality test the save path uses. Two mdast nodes are
 * "the same block" when they serialize to the same markdown, which is a
 * truer predicate than comparing node fields: it ignores the parser
 * bookkeeping that never reaches the file, and it cannot report a
 * difference that would not actually appear in the diff.
 */

import {toMarkdown} from 'mdast-util-to-markdown';
import {gfmToMarkdown} from 'mdast-util-gfm';

import type {Node} from './types.js';

const OPTIONS = {
    extensions: [gfmToMarkdown()],
    /* Pinned rather than left to the library's defaults, because the
       defaults are free to change between versions and every one of these
       choices shows up as a diff in somebody's repository. They are the
       conventional forms: `*` for emphasis, `-` for bullets, `#` headings,
       fenced code. */
    bullet: '-' as const,
    emphasis: '*' as const,
    strong: '*' as const,
    fence: '`' as const,
    fences: true,
    listItemIndent: 'one' as const,
    rule: '-' as const,
    setext: false
};

/** Serialize one block. The trailing newline `toMarkdown` adds is removed. */
export function serializeBlock(node: Node): string {
    return toMarkdown(node as never, OPTIONS).replace(/\n+$/, '');
}
