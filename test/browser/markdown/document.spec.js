/* The byte-preservation contract.
 *
 * One assertion carries most of the weight: load a real markdown file,
 * save it with no edits, and the output must be byte-identical to the
 * input. Not equivalent -- identical. Every save here becomes a pull
 * request somebody reads, and a serializer that normalises emphasis
 * markers or rewraps a paragraph produces a diff covering the whole file,
 * which cannot be reviewed.
 *
 * It is also a broad test cheaply: any construct either walker mishandles
 * shows up as a difference somewhere in the file, so adding a corpus file
 * is the whole cost of covering a new construct.
 *
 * The second assertion is the one a reviewer actually experiences: edit
 * exactly one block, and only that block's lines may differ.
 */

import {MarkdownDocument} from '../../../src/markdown/document.js';
import {SOURCE_ATTRIBUTE} from '../../../src/markdown/to-html.js';

const CORPUS = import.meta.glob('../../markdown/corpus/*.md', {
    query: '?raw', import: 'default', eager: true
});

const FILES = Object.fromEntries(
    Object.entries(CORPUS).map(([path, source]) => [path.split('/').pop(), source]));

/** Which 1-based lines differ between two texts. */
function changedLines(before, after) {
    const a = before.split('\n');
    const b = after.split('\n');
    const changed = [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        if (a[i] !== b[i]) {
            changed.push(i + 1);
        }
    }
    return changed;
}

describe('a save with no edits is byte-identical', function() {

    for (const [name, source] of Object.entries(FILES)) {
        it(name, function() {
            const doc = MarkdownDocument.parse(source);
            return expect(doc.update(doc.toHTML())).toBe(source);
        });
    }

    it('holds for whitespace the walkers would normalise away', function() {
        // Three blank lines, trailing spaces, an underscore emphasis
        // marker and a `+` bullet -- every one of which the serializer
        // would rewrite if it were asked to, and none of which it is.
        const source = [
            '# Title',
            '',
            '',
            '',
            'Some _emphasis_ here.  ',
            '',
            '+ one',
            '+ two',
            ''
        ].join('\n');
        const doc = MarkdownDocument.parse(source);
        return expect(doc.update(doc.toHTML())).toBe(source);
    });

    it('holds for a file with no trailing newline', function() {
        const source = '# Title\n\nText.';
        const doc = MarkdownDocument.parse(source);
        return expect(doc.update(doc.toHTML())).toBe(source);
    });

    it('holds for a file that is only frontmatter', function() {
        const source = '---\ntitle: x\n---\n';
        const doc = MarkdownDocument.parse(source);
        return expect(doc.update(doc.toHTML())).toBe(source);
    });
});

describe('an edit touches only the block that changed', function() {

    /* Replace the whole content of the block with source index `index`.
     *
     * Through the DOM rather than a regex: a regex that stops at the
     * first `<` replaces only the leading text node, so a paragraph with
     * any inline markup in it is left half-edited and the test passes or
     * fails for the wrong reason. */
    function editBlock(html, index, text) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        wrapper.querySelector(`[${SOURCE_ATTRIBUTE}="${index}"]`).textContent = text;
        return wrapper.innerHTML;
    }

    it('rewrites one paragraph and nothing else', function() {
        const source = FILES['basic.md'];
        const doc = MarkdownDocument.parse(source);
        // Block 1 is the first paragraph after the heading.
        const next = doc.update(editBlock(doc.toHTML(), 1, 'Replaced.'));

        const lines = changedLines(source, next);
        expect(lines.length).toBe(1);
        return expect(next.split('\n')[lines[0] - 1]).toBe('Replaced.');
    });

    it('leaves the frontmatter untouched', function() {
        const source = FILES['basic.md'];
        const doc = MarkdownDocument.parse(source);
        const next = doc.update(editBlock(doc.toHTML(), 1, 'Replaced.'));
        // Preserved verbatim, not re-emitted: a YAML round trip would
        // lose key order, comments and quoting style.
        return expect(next.startsWith(doc.frontmatter().raw)).toBe(true);
    });

    it('rewrites the frontmatter only when asked', function() {
        const source = FILES['basic.md'];
        const doc = MarkdownDocument.parse(source);
        const next = doc.update(doc.toHTML(), {frontmatter: {title: 'New'}});
        expect(next.startsWith('---\ntitle: New\n---')).toBe(true);
        // ...and the body is still byte-identical.
        const bodyBefore = source.slice(doc.frontmatter().end);
        return expect(next.endsWith(bodyBefore)).toBe(true);
    });

    it('does not reformat a block the user touched and reverted', function() {
        /* The case `lastModified()` gets wrong. Re-rendering a block and
           handing back exactly what was rendered is indistinguishable
           from the user bolding a word and unbolding it: the editor says
           touched, the file says nothing changed. Comparing serialized
           markdown gives the second answer, which is the one that
           decides what the reviewer sees. */
        const source = '# T\n\nA _quiet_ line.\n';
        const doc = MarkdownDocument.parse(source);
        return expect(doc.update(doc.toHTML())).toBe(source);
    });
});

describe('structural edits', function() {

    it('appends a new block', function() {
        const source = '# T\n\nOne.\n';
        const doc = MarkdownDocument.parse(source);
        const next = doc.update(doc.toHTML() + '<p>Two.</p>');
        return expect(next).toBe('# T\n\nOne.\n\nTwo.\n');
    });

    it('inserts a block between two existing ones', function() {
        const source = '# T\n\nOne.\n\nThree.\n';
        const doc = MarkdownDocument.parse(source);
        const html = doc.toHTML();
        // Between block 1 (One.) and block 2 (Three.).
        const at = html.indexOf(`<p ${SOURCE_ATTRIBUTE}="2"`);
        const next = doc.update(
            html.slice(0, at) + '<p>Two.</p>' + html.slice(at));
        return expect(next).toBe('# T\n\nOne.\n\nTwo.\n\nThree.\n');
    });

    it('removes a block, and its separator with it', function() {
        const source = '# T\n\nOne.\n\nTwo.\n';
        const doc = MarkdownDocument.parse(source);
        const html = doc.toHTML()
            .replace(new RegExp(`<p ${SOURCE_ATTRIBUTE}="1"[^>]*>[^<]*</p>`), '');
        return expect(doc.update(html)).toBe('# T\n\nTwo.\n');
    });

    it('reorders blocks without reformatting either', function() {
        const source = '# T\n\n*One.*\n\n*Two.*\n';
        const doc = MarkdownDocument.parse(source);
        const html = doc.toHTML();
        const one = html.match(new RegExp(`<p ${SOURCE_ATTRIBUTE}="1".*?</p>`))[0];
        const two = html.match(new RegExp(`<p ${SOURCE_ATTRIBUTE}="2".*?</p>`))[0];
        const next = doc.update(html.replace(one, '').replace(two, two + one));
        // The emphasis markers survive: both blocks were spliced, not
        // re-serialized, even though neither is where it was.
        return expect(next).toBe('# T\n\n*Two.*\n\n*One.*\n');
    });

    it('keeps a static block byte-identical when the page around it changes', function() {
        const source = [
            '# T',
            '',
            '{{< figure src="/a.png"   caption="Odd  spacing" >}}',
            '',
            'Text.',
            ''
        ].join('\n');
        const doc = MarkdownDocument.parse(source);
        const next = doc.update(
            doc.toHTML().replace(/(<p[^>]*data-ct-md="2"[^>]*>)[^<]*/, '$1Changed.'));
        expect(next).toContain('{{< figure src="/a.png"   caption="Odd  spacing" >}}');
        return expect(next).toBe(source.replace('Text.', 'Changed.'));
    });

    it('an emptied region leaves only the frontmatter', function() {
        // The gap that separated the frontmatter from the body has
        // nothing left to separate, so it collapses to the newline a
        // file ends on rather than being emitted as a trailing blank.
        const source = '---\na: 1\n---\n\nText.\n';
        const doc = MarkdownDocument.parse(source);
        return expect(doc.update('')).toBe('---\na: 1\n---\n');
    });

    it('preserves an unusual gap between the frontmatter and the body', function() {
        /* The gap is taken from the source rather than assumed, so a
           file written with two blank lines after its frontmatter keeps
           them. Normalising it would put a line in the diff of every
           such file the first time anybody edited a paragraph. */
        const source = '---\na: 1\n---\n\n\nText.\n';
        const doc = MarkdownDocument.parse(source);
        expect(doc.update(doc.toHTML())).toBe(source);
        return expect(doc.update(doc.toHTML().replace('Text.', 'New.')))
            .toBe('---\na: 1\n---\n\n\nNew.\n');
    });

    it('gives a body typed into a frontmatter-only file a blank line', function() {
        // The mirror case: there was no gap in the source to preserve,
        // so the conventional one is used.
        const source = '---\na: 1\n---\n';
        const doc = MarkdownDocument.parse(source);
        return expect(doc.update('<p>New.</p>')).toBe('---\na: 1\n---\n\nNew.\n');
    });
});

describe('adding frontmatter to a file that never had any', function() {

    /* The case a shell reaches the first time somebody fills in a field
       on a legacy `.md`. It used to throw a TypeError from inside a save
       -- `frontmatterText` returns the new block, so the gap calculation
       ran and read `.end` off a null frontmatter through a cast. A save
       that throws after the editor has been used is the worst place for
       it: the work is in the DOM and the only thing on screen is a
       message about an undefined property. */

    it('writes the block and a blank line before the body', function() {
        const source = 'Just text.\n';
        const doc = MarkdownDocument.parse(source);
        return expect(doc.update(doc.toHTML(), {frontmatter: {title: 'Added'}}))
            .toBe('---\ntitle: Added\n---\n\nJust text.\n');
    });

    it('writes it above a file whose first block is not a paragraph', function() {
        const source = '# Heading\n\nText.\n';
        const doc = MarkdownDocument.parse(source);
        const next = doc.update(doc.toHTML(), {frontmatter: {title: 'Added'}});
        return expect(next).toBe('---\ntitle: Added\n---\n\n# Heading\n\nText.\n');
    });

    it('writes it into an empty file', function() {
        /* No frontmatter AND no body: both halves of the gap rule are
           absent at once, which is the shape that would have thrown
           twice over. */
        const doc = MarkdownDocument.parse('');
        return expect(doc.update('', {frontmatter: {title: 'Added'}}))
            .toBe('---\ntitle: Added\n---\n');
    });

    it('leaves a file with no frontmatter alone when asked for none', function() {
        // The only thing that must stay true: a body-only save on a
        // legacy file does not gain an empty `---\n---` block.
        const source = 'Just text.\n';
        const doc = MarkdownDocument.parse(source);
        expect(doc.update(doc.toHTML())).toBe(source);
        return expect(doc.update(doc.toHTML(), {frontmatter: null})).toBe(source);
    });
});

describe('frontmatter that is not valid YAML', function() {

    /* `data: null` alone cannot say which of two OPPOSITE instructions
       applies: an empty block, which a shell may write over freely, and
       a block the parser could not read, where writing a merge replaces
       content nobody has seen. `valid` is what tells them apart. */

    const BROKEN = '---\ntitle: "unterminated\n  - nope\n---\n\nText.\n';

    it('is reported as unparsed rather than as empty', function() {
        const front = MarkdownDocument.parse(BROKEN).frontmatter();
        expect(front.valid).toBe(false);
        return expect(front.data).toBe(null);
    });

    it('keeps the block exactly as written', function() {
        /* The editor's job is to preserve what it cannot understand.
           Refusing to open the file would be the worse answer for the
           one person who most needs to fix it. */
        const doc = MarkdownDocument.parse(BROKEN);
        expect(doc.frontmatter().raw).toBe('---\ntitle: "unterminated\n  - nope\n---');
        return expect(doc.update(doc.toHTML())).toBe(BROKEN);
    });

    it('calls a block that parsed to nothing valid', function() {
        // `---\n---` is empty, not broken, and a shell may fill it in.
        const front = MarkdownDocument.parse('---\n---\n\nText.\n').frontmatter();
        expect(front.valid).toBe(true);
        return expect(front.data).toBe(null);
    });

    it('calls an ordinary block valid', function() {
        return expect(MarkdownDocument.parse('---\na: 1\n---\n').frontmatter().valid)
            .toBe(true);
    });
});

describe('the HTML the editor is given', function() {

    it('is one element per top-level block', function() {
        const doc = MarkdownDocument.parse(FILES['basic.md']);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = doc.toHTML();
        return expect(wrapper.children.length).toBe(doc.blocks().length);
    });

    it('marks every block with its index, in order', function() {
        const doc = MarkdownDocument.parse(FILES['basic.md']);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = doc.toHTML();
        const markers = [...wrapper.children].map(
            el => Number(el.getAttribute(SOURCE_ATTRIBUTE)));
        return expect(markers).toEqual(doc.blocks().map(block => block.index));
    });
});
