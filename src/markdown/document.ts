/**
 * A markdown file, open for editing.
 *
 * The contract is one sentence: **a block the user did not change comes
 * back byte for byte.** Not "semantically equivalent", not "re-serialized
 * to the same meaning" -- the same bytes.
 *
 * That is not fussiness. Every save in this system becomes a pull request
 * somebody reads. A serializer that normalises `_em_` to `*em*`, rewraps a
 * paragraph at 80 columns or renumbers an ordered list produces a diff
 * covering the whole file, and a diff covering the whole file cannot be
 * reviewed -- which is the entire point of the workflow. So the only text
 * this class ever generates is the text for blocks that actually changed;
 * everything else, including the whitespace BETWEEN blocks, is spliced
 * from the original string.
 *
 * `mdast-util-from-markdown` records the byte offsets each node was parsed
 * from, which is what makes the splice possible at all.
 */

import {parseMarkdown} from './parse.js';
import type {Frontmatter, ParsedMarkdown} from './parse.js';
import {toHTML} from './to-html.js';
import {fromHTML} from './from-dom.js';
import type {EditedBlock} from './from-dom.js';
import {serializeBlock, sameBlock} from './serialize.js';
import {stringify as stringifyYAML} from 'yaml';
import type {SourceBlock} from './types.js';

/** The separator used where the original one cannot apply. */
const DEFAULT_GAP = '\n\n';

/** One block on its way back out, with where its text came from. */
interface Emitted {
    text: string;
    /** Its source block, or null for a block the user created. */
    index: number | null;
}

export class MarkdownDocument {

    private readonly parsed: ParsedMarkdown;

    private constructor(parsed: ParsedMarkdown) {
        this.parsed = parsed;
    }

    /** Open `source` for editing. */
    static parse(source: string): MarkdownDocument {
        return new MarkdownDocument(parseMarkdown(source));
    }

    /** The original text, unchanged for the lifetime of this object. */
    source(): string {
        return this.parsed.source;
    }

    /** The frontmatter block, or null. */
    frontmatter(): Frontmatter | null {
        return this.parsed.frontmatter;
    }

    /** The top-level blocks, frontmatter excluded. */
    blocks(): SourceBlock[] {
        return this.parsed.blocks;
    }

    /** The body as HTML, for an editable region's `innerHTML`. */
    toHTML(): string {
        return toHTML(this.parsed.blocks, this.parsed.source);
    }

    /**
     * The new file contents, given the region's edited HTML.
     *
     * `html` is exactly what a consumer receives in `saved` -- this class
     * never touches the editor, which is what keeps the markdown entry
     * out of the default bundle and makes this testable as a pure string
     * function.
     *
     * Pass `frontmatter` to replace the frontmatter data; omit it and the
     * original block is preserved verbatim, down to its key order and
     * comments, which no YAML round trip would survive.
     */
    update(html: string, options?: {frontmatter?: unknown}): string {
        const emitted = this.emit(fromHTML(html));
        const body = this.join(emitted);

        const front = this.frontmatterText(options);
        if (front === null) {
            return body;
        }
        return front + this.gapAfterFrontmatter(body) + body;
    }

    /**
     * The new file contents with this frontmatter and the body exactly
     * as it is, byte for byte.
     *
     * `update` reaches the same answer for a body nobody touched -- every
     * block compares equal to its original and every one is spliced --
     * but it reaches it by taking the body apart and putting it back
     * again, and that is a round trip the management screens have no
     * reason to take: /admin edits frontmatter and nothing else, so the
     * body it writes has never been rendered, never been in an editor,
     * and has nobody's edit in it.
     *
     * The difference is not a saving, it is what the guarantee rests on.
     * Going through `update` would make "the body is untouched" a
     * property of the walker's fidelity over every construct in the file,
     * so an inline type nobody has thought about would rewrite a block on
     * a save that changed a date. Here it is a property of the code path:
     * the body is never read.
     */
    updateFrontmatter(frontmatter: object): string {
        const front = this.parsed.frontmatter;
        /* The gap included, so it is preserved with everything after it.
           `\n\n` is only the DEFAULT -- a file written with one blank
           line, or none, keeps what it has. */
        const rest = front
            ? this.parsed.source.slice(front.end)
            : this.gapAfterFrontmatter(this.parsed.source) + this.parsed.source;
        return blockFor(frontmatter) + rest;
    }

    // --- internals -------------------------------------------------------

    /**
     * The bytes between the frontmatter and the body.
     *
     * Taken from the source when there is a body on both sides of it to
     * separate -- the frontmatter is always first, so the original gap
     * still applies however the blocks after it were rearranged. The
     * other cases have no original gap to preserve: an emptied region
     * makes the frontmatter the whole file, which ends in one newline;
     * a body typed into a file that had none gets the conventional blank
     * line; and a file that had no FRONTMATTER has no gap either, which
     * is the case this used to assert its way past.
     *
     * `this.parsed.frontmatter` is null exactly when a caller adds
     * frontmatter to a file that never had any -- the first time anybody
     * fills in a field on a legacy `.md` -- and the cast that used to
     * stand here threw a TypeError on that path, from inside a save.
     */
    private gapAfterFrontmatter(body: string): string {
        if (!body) {
            return '\n';
        }
        const front = this.parsed.frontmatter;
        return front && this.parsed.blocks.length
            ? this.parsed.source.slice(front.end, this.parsed.blocks[0].start)
            : DEFAULT_GAP;
    }

    /** Decide each edited block's text: spliced, or newly serialized. */
    private emit(edited: EditedBlock[]): Emitted[] {
        const {source, blocks} = this.parsed;
        const out: Emitted[] = [];

        for (const entry of edited) {
            const original = entry.index === null ? null : blocks[entry.index];

            if (!original) {
                /* Created by the user, so there is nothing to splice
                   from -- and nothing to write either if it is empty.
                   An empty block is not hypothetical: `start()` gives a
                   region with no editable children a placeholder
                   paragraph so there is somewhere to type, which is
                   exactly what an all-shortcode file gets. Writing it
                   back would add a blank line to a file nobody edited. */
                const created = serializeBlock(entry.node);
                if (created !== '') {
                    out.push({text: created, index: null});
                }
                continue;
            }

            if (entry.verbatim) {
                /* A static block. It is read-only in the editor, so its
                   source cannot have changed -- only its position. */
                out.push({
                    text: source.slice(original.start, original.end),
                    index: original.index
                });
                continue;
            }

            /* The comparison that decides everything.
             *
             * Equality of SERIALIZED markdown, not of mdast nodes and not
             * of ContentEdit's `lastModified()`. Node equality trips over
             * parser bookkeeping that never reaches the file. And a user
             * who bolds a word and then unbolds it has TOUCHED the block
             * without changing it: `lastModified()` says touched, which
             * would re-serialize and reformat for a diff of nothing.
             * Equal markdown means equal diff, which is the question
             * actually being asked. */
            if (sameBlock(entry.node, original.node)) {
                out.push({
                    text: source.slice(original.start, original.end),
                    index: original.index
                });
                continue;
            }

            const next = serializeBlock(entry.node);
            if (next !== '') {
                out.push({text: next, index: original.index});
            }
        }

        return out;
    }

    /**
     * Join the blocks, preserving the original separator wherever the
     * original separator still applies.
     *
     * Two blocks keep the bytes that were between them only if they were
     * adjacent in the source AND are still adjacent now. Anywhere else --
     * a block inserted between them, one of them moved, one removed --
     * there is no original separator to preserve and the conventional
     * blank line is used.
     */
    private join(emitted: Emitted[]): string {
        const {source, blocks} = this.parsed;

        if (!emitted.length) {
            return '';
        }

        let text = emitted[0].text;
        for (let i = 1; i < emitted.length; i += 1) {
            const previous = emitted[i - 1];
            const current = emitted[i];
            const adjacent = previous.index !== null
                && current.index !== null
                && current.index === previous.index + 1;

            text += adjacent
                ? source.slice(blocks[previous.index].end, blocks[current.index].start)
                : DEFAULT_GAP;
            text += current.text;
        }

        /* The trailing bytes -- usually a single newline, sometimes
           several, sometimes none. Preserved only when the document still
           ends on the block it ended on before. */
        const last = emitted[emitted.length - 1];
        const endsAsBefore = last.index !== null
            && last.index === blocks.length - 1;
        return text + (endsAsBefore
            ? source.slice(blocks[last.index as number].end)
            : '\n');
    }

    /** The frontmatter block to write, or null if there is none. */
    private frontmatterText(options?: {frontmatter?: unknown}): string | null {
        const front = this.parsed.frontmatter;

        if (!options || !('frontmatter' in options)) {
            return front ? front.raw : null;
        }

        if (options.frontmatter === null || options.frontmatter === undefined) {
            return null;
        }

        /* Written only when the caller asks. Preserving `raw` is not an
           optimisation: a YAML round trip would lose key order, comments
           and quoting style, and none of that is the editor's to change. */
        return blockFor(options.frontmatter);
    }
}

/**
 * A frontmatter block holding this data.
 *
 * One function rather than the same three characters written in two
 * methods: the two ways of writing a file -- body and all, or frontmatter
 * alone -- must not be able to disagree about what a block looks like.
 */
function blockFor(data: unknown): string {
    return `---\n${stringifyYAML(data)}---`;
}
