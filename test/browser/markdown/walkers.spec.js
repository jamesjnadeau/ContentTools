/* The two walkers, checked against each other.
 *
 * `to-html.ts` and `from-dom.ts` are a matched pair -- hand-written
 * precisely so that each is the inverse of the other -- and the only
 * useful test of a pair like that is a round trip. For each block of each
 * corpus file: render it to HTML, read it back, and assert it serializes
 * to the same markdown.
 *
 * Comparing the SERIALIZED markdown rather than the mdast nodes is
 * deliberate. Node equality would fail on parser bookkeeping that never
 * reaches the file (`spread`, `position`, a null `title` against an absent
 * one), which is noise; the markdown is the thing that ends up in the
 * user's repository and therefore the thing that has to match.
 *
 * Byte-for-byte fidelity against the ORIGINAL source is a different
 * property and is not claimed here -- the walkers normalise, the splice is
 * what preserves. That is `document.spec.js`.
 */

import {parseMarkdown} from '../../../src/markdown/parse.js';
import {blockToHTML, SOURCE_ATTRIBUTE} from '../../../src/markdown/to-html.js';
import {fromHTML} from '../../../src/markdown/from-dom.js';
import {serializeBlock} from '../../../src/markdown/serialize.js';

const CORPUS = import.meta.glob('../../markdown/corpus/*.md', {
    query: '?raw', import: 'default', eager: true
});

/** `{name: source}` for the corpus, with the directory prefix stripped. */
const FILES = Object.fromEntries(
    Object.entries(CORPUS).map(([path, source]) => [path.split('/').pop(), source]));

/** Render one block and read it straight back. */
function roundTrip(entry, source) {
    const html = blockToHTML(entry, source);
    const back = fromHTML(html);
    return {html, back};
}

describe('the corpus loads', function() {
    it('has files', function() {
        return expect(Object.keys(FILES).length).toBeGreaterThan(3);
    });
});

describe('walkers: editable blocks survive a round trip', function() {

    for (const [name, source] of Object.entries(FILES)) {
        it(name, function() {
            const {blocks} = parseMarkdown(source);
            const editable = blocks.filter(block => block.editable);
            // A corpus file with nothing editable would pass vacuously.
            expect(editable.length).toBeGreaterThan(0);

            for (const entry of editable) {
                const {back} = roundTrip(entry, source);
                expect(back.length).toBe(1);
                expect(serializeBlock(back[0].node))
                    .toBe(serializeBlock(entry.node));
            }
            return true;
        });
    }
});

describe('walkers: static blocks', function() {

    it('carry their source verbatim and are never re-serialized', function() {
        const source = FILES['static-blocks.md'];
        const {blocks} = parseMarkdown(source);
        const statics = blocks.filter(block => !block.editable);
        expect(statics.length).toBeGreaterThan(0);

        for (const entry of statics) {
            const {html, back} = roundTrip(entry, source);
            expect(back.length).toBe(1);
            expect(back[0].verbatim).toBe(true);
            // The source text is shown as-is, so the user can see what
            // is in their file and that it is not editable here.
            expect(html).toContain('data-ce-tag="static"');
        }
        return true;
    });

    it('classifies shortcodes, raw HTML, rules and definitions as static', function() {
        const {blocks} = parseMarkdown(FILES['static-blocks.md']);
        const kinds = blocks.map(
            block => `${block.node.type}:${block.editable ? 'edit' : 'static'}`);
        return expect(kinds).toEqual([
            'heading:edit',
            // `{{< figure >}}` parses as an ordinary paragraph; nothing in
            // CommonMark knows what a shortcode is, so the classifier has
            // to recognise it by shape.
            'paragraph:static',
            'paragraph:edit',
            'html:static',
            'paragraph:static',
            'thematicBreak:static',
            'definition:static',
            // Contains a `linkReference` -- `[ref]` has no HTML the
            // editor can offer, and rendering it as plain text would drop
            // the reference on the first save. A corpus round trip caught
            // exactly that, silently, before the classifier checked
            // inline content.
            'paragraph:static'
        ]);
    });

    it('rejects a paragraph containing an inline node with no HTML form', function() {
        const cases = [
            'A footnote[^1].\n\n[^1]: body\n',
            'A [reference] link.\n\n[reference]: /x\n',
            'An ![image][ref].\n\n[ref]: /x\n',
            'Text with <span class="x">inline HTML</span>.\n'
        ];
        for (const source of cases) {
            const {blocks} = parseMarkdown(source);
            expect(blocks[0].editable).toBe(false);
        }
        return true;
    });

    it('leaves a shortcode mid-sentence as editable prose', function() {
        // Anchoring the pattern at both ends is what makes this work.
        // Treating the paragraph as static would make the sentence around
        // it uneditable.
        const {blocks} = parseMarkdown('Text {{< x >}} more text.\n');
        return expect(blocks[0].editable).toBe(true);
    });

    it('rejects the constructs ContentEdit has no element for', function() {
        const {blocks} = parseMarkdown(FILES['awkward.md']);
        const byType = {};
        for (const block of blocks) {
            byType[block.node.type] = byType[block.node.type] || [];
            byType[block.node.type].push(block.editable);
        }
        // An indented code block IS representable -- it is still a `code`
        // node, and PreText renders it.
        expect(byType.code).toEqual([true]);
        // A task list carries a checkbox the editor has no control for.
        expect(byType.list).toEqual([false]);
        // A two-paragraph blockquote cannot fit in one ContentEdit.Text.
        expect(byType.blockquote).toEqual([false]);
        return expect(byType.footnoteDefinition).toEqual([false]);
    });
});

describe('walkers: block identity', function() {

    it('marks each block with its source index', function() {
        const source = FILES['basic.md'];
        const {blocks} = parseMarkdown(source);
        const entry = blocks[2];
        const html = blockToHTML(entry, source);
        expect(html).toContain(`${SOURCE_ATTRIBUTE}="${entry.index}"`);
        return expect(fromHTML(html)[0].index).toBe(entry.index);
    });

    it('reports an unmarked block as new', function() {
        return expect(fromHTML('<p>typed by the user</p>')[0].index).toBe(null);
    });

    it('reports a duplicated marker as new after the first', function() {
        // What a block split in two looks like: ContentEdit copies the
        // attributes, so both halves claim the same source block. The
        // first keeps the claim; the second cannot, or it would overwrite
        // the first one's bytes.
        const back = fromHTML(
            `<p ${SOURCE_ATTRIBUTE}="4">one</p><p ${SOURCE_ATTRIBUTE}="4">two</p>`);
        expect(back[0].index).toBe(4);
        return expect(back[1].index).toBe(null);
    });

    it('frontmatter is parsed out and is not a block', function() {
        const {frontmatter, blocks} = parseMarkdown(FILES['basic.md']);
        expect(frontmatter.data.title).toBe('A post');
        expect(frontmatter.raw.startsWith('---')).toBe(true);
        return expect(blocks.some(block => block.node.type === 'yaml')).toBe(false);
    });

    it('survives frontmatter that is not valid YAML', function() {
        // Refusing to open the file would be the worst answer for the one
        // person who most needs to fix it.
        const {frontmatter, blocks} = parseMarkdown('---\n: : :\n---\n\nText\n');
        expect(frontmatter.data).toBe(null);
        expect(frontmatter.raw).toBe('---\n: : :\n---');
        return expect(blocks.length).toBe(1);
    });
});

describe('walkers: tag choices', function() {

    it('emits <b> and <i>, which is what the tools produce', function() {
        // Emitting <strong>/<em> would make the editor rewrite every
        // emphasis in the document the first time it was touched.
        const {blocks, source} = parseMarkdown('A **bold** and *italic* line.\n');
        const html = blockToHTML(blocks[0], source);
        expect(html).toContain('<b>bold</b>');
        return expect(html).toContain('<i>italic</i>');
    });

    it('accepts <strong> and <em> on the way back', function() {
        // Which is what a paste produces.
        const back = fromHTML('<p>A <strong>bold</strong> and <em>italic</em> line.</p>');
        return expect(serializeBlock(back[0].node))
            .toBe('A **bold** and *italic* line.');
    });

    it('unwraps an inline tag it does not know rather than dropping the text', function() {
        // The same rule HTMLCleaner applies: unwrap, never delete, so no
        // text is silently lost.
        const back = fromHTML('<p>a <span class="x">kept</span> b</p>');
        return expect(serializeBlock(back[0].node)).toBe('a kept b');
    });

    it('carries a fenced block\'s language on an attribute', function() {
        const {blocks, source} = parseMarkdown('```js\nconst x = 1;\n```\n');
        const html = blockToHTML(blocks[0], source);
        expect(html).toContain('data-ct-lang="js"');
        return expect(serializeBlock(fromHTML(html)[0].node))
            .toBe('```js\nconst x = 1;\n```');
    });

    it('escapes text so content cannot become markup', function() {
        const {blocks, source} = parseMarkdown('A < b & c > d\n');
        const html = blockToHTML(blocks[0], source);
        return expect(html).toBe(
            `<p ${SOURCE_ATTRIBUTE}="0">A &lt; b &amp; c &gt; d</p>`);
    });
});
