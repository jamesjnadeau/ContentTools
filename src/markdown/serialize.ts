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

/**
 * Do two blocks mean the same thing in the file?
 *
 * Not simply `serializeBlock(a) === serializeBlock(b)`, because of the
 * one construct HTML cannot carry: a soft line break. A paragraph the
 * author wrapped across three source lines reaches the editor as one
 * line -- the browser collapses the newlines, exactly as it should --
 * and comes back as one line whether or not anybody touched it.
 * Comparing the serialized text directly would call that a change and
 * rewrite the paragraph, unwrapping it in the diff for nothing.
 *
 * So the comparison collapses runs of whitespace inside `text` nodes,
 * and only there. That is precisely the set of values HTML collapses:
 * `code` and `inlineCode` carry their text in `value` on their own node
 * types, so a change to the indentation inside a fenced code block is
 * still a difference -- which it has to be, since there it is content.
 *
 * When this says the same, `document.ts` splices the ORIGINAL bytes, so
 * the author's line wrapping survives untouched. The looser comparison
 * preserves more, not less.
 */
export function sameBlock(a: Node, b: Node): boolean {
    return serializeBlock(collapseText(a)) === serializeBlock(collapseText(b));
}

const WHITESPACE = /[\t\n\r ]+/g;

/** A copy of `node` with whitespace runs inside `text` values collapsed. */
function collapseText(node: Node): Node {
    if (node.type === 'text') {
        return {...node, value: String(node.value).replace(WHITESPACE, ' ')};
    }
    const children = (node as {children?: unknown}).children;
    if (!Array.isArray(children)) {
        return node;
    }
    return {...node, children: (children as Node[]).map(collapseText)} as Node;
}
