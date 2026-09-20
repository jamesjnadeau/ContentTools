/**
 * Markdown -> mdast, with source positions retained.
 *
 * The positions are the whole point. `mdast-util-from-markdown` records the
 * byte offsets every node was parsed from, which is what lets the save path
 * splice a changed block back into the original text and leave every other
 * byte exactly as the author wrote it. Without them the only way to write
 * the file back is to re-serialize all of it, and a pull request whose diff
 * is the entire document is not reviewable -- which is the point of the
 * whole workflow.
 */

import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {frontmatter} from 'micromark-extension-frontmatter';
import {frontmatterFromMarkdown} from 'mdast-util-frontmatter';
import {parse as parseYAML} from 'yaml';

import {isRepresentable} from './blocks.js';
import type {Node, Parent, SourceBlock} from './types.js';

export interface Frontmatter {
    /** The raw block including its `---` fences, exactly as written. */
    raw: string;
    /** Byte range of `raw` in the source. */
    start: number;
    end: number;
    /** The parsed YAML, or null if it did not parse. */
    data: unknown;
}

export interface ParsedMarkdown {
    source: string;
    frontmatter: Frontmatter | null;
    /** Top-level blocks, frontmatter excluded, in document order. */
    blocks: SourceBlock[];
}

/** Parse `source`, keeping everything needed to write it back byte-for-byte. */
export function parseMarkdown(source: string): ParsedMarkdown {
    const tree = fromMarkdown(source, {
        extensions: [gfm(), frontmatter(['yaml'])],
        mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(['yaml'])]
    }) as unknown as Parent;

    let front: Frontmatter | null = null;
    const blocks: SourceBlock[] = [];

    for (const node of tree.children as Node[]) {
        const position = node.position;
        if (!position) {
            // Every node from this parser has one; a node without is a
            // node we cannot splice, so skipping it is the only safe move.
            continue;
        }
        const start = position.start.offset as number;
        const end = position.end.offset as number;

        if (node.type === 'yaml') {
            const raw = source.slice(start, end);
            let data: unknown = null;
            try {
                data = parseYAML(String(node.value ?? ''));
            } catch {
                /* Invalid YAML is left unparsed rather than thrown on. The
                   editor's job here is to preserve the block, and it can do
                   that without understanding it -- refusing to open the
                   file would be a worse answer for the one person who most
                   needs to fix it. */
                data = null;
            }
            front = {raw, start, end, data};
            continue;
        }

        blocks.push({
            index: blocks.length,
            node,
            start,
            end,
            editable: isRepresentable(node)
        });
    }

    return {source, frontmatter: front, blocks};
}
