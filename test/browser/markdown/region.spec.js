/* The markdown round trip through a REAL editor.
 *
 * `document.spec.js` drives `MarkdownDocument` as the pure string
 * function it is: HTML in, markdown out. That is the right shape for
 * those tests and it is how a consumer uses the class -- but it means
 * the HTML they feed back in is the HTML `toHTML()` produced, and that
 * is not the HTML a consumer ever has.
 *
 * What a consumer has is `region.html()`, which ContentEdit pretty-prints:
 * every block's content on its own line, indented four spaces per level.
 * The first version of the walkers took that indentation as content --
 * every paragraph came back as an indented code block, every list item
 * four levels deep -- and every pure-string test passed throughout,
 * because none of them had been near a region.
 *
 * So this file closes the loop: parse, mount into a live editor, save,
 * and assert the bytes. Nothing here mocks ContentEdit.
 */

import {MarkdownDocument} from '../../../src/markdown/document.js';
import {SOURCE_ATTRIBUTE} from '../../../src/markdown/to-html.js';
import {MARKDOWN_PROFILE, HTML_PROFILE} from '../../../src/core/profile.js';

const CORPUS = import.meta.glob('../../markdown/corpus/*.md', {
    query: '?raw', import: 'default', eager: true
});
const FILES = Object.fromEntries(
    Object.entries(CORPUS).map(([path, source]) => [path.split('/').pop(), source]));

// --- harness -------------------------------------------------------------

let div = null;
let editor = null;

/** Boot a started editor in `mode` over one region holding `html`. */
function boot(html, mode) {
    teardown();

    div = document.createElement('div');
    div.setAttribute('class', 'md-editable');
    div.innerHTML = html;
    document.body.appendChild(div);

    editor = ContentTools.EditorApp.get();
    // Before init(), which is when the element applies it too: the
    // 'attach' binding then covers every element the region parses.
    editor.profile(mode === 'markdown' ? MARKDOWN_PROFILE : HTML_PROFILE);
    editor.init('.md-editable');
    editor.start();
    return editor.regions()['0'];
}

function teardown() {
    if (editor) {
        editor.stop(true);
        editor.destroy();
        editor.profile(HTML_PROFILE);
        editor = null;
    }
    if (div && div.parentNode) {
        div.parentNode.removeChild(div);
    }
    div = null;
}

afterEach(teardown);

/**
 * Retype a block's content, the way a keystroke reaches the model.
 *
 * Assigning `element.content` alone is not enough: `Text.html()` is
 * cached, and the cache is invalidated by `taint()`, so the assignment
 * leaves `region.html()` serving the old text. That is how this helper
 * was written first, and it made three real assertions pass against a
 * document that had not changed at all. Writing to the DOM and calling
 * `_syncContent()` is the path a keystroke actually takes.
 */
function retype(element, html) {
    element.domElement().innerHTML = html;
    element._syncContent();
}

/** The block carrying source index `index`. */
function blockAt(region, index) {
    return region.children.find(
        child => child.attr && child.attr(SOURCE_ATTRIBUTE) === String(index));
}

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

// --- the contract --------------------------------------------------------

describe('a save with no edits is byte-identical, through a live region', function() {

    for (const [name, source] of Object.entries(FILES)) {
        it(name, function() {
            const doc = MarkdownDocument.parse(source);
            const region = boot(doc.toHTML(), 'markdown');
            return expect(doc.update(region.html())).toBe(source);
        });
    }
});

describe('an edit through the editor touches only that block', function() {

    it('rewrites one paragraph and nothing else', function() {
        const source = FILES['basic.md'];
        const doc = MarkdownDocument.parse(source);
        const region = boot(doc.toHTML(), 'markdown');

        // Block 1 is the first paragraph.
        retype(blockAt(region, 1), 'Replaced.');

        const next = doc.update(region.html());
        const lines = changedLines(source, next);
        expect(lines.length).toBe(1);
        return expect(next.split('\n')[lines[0] - 1]).toBe('Replaced.');
    });

    it('leaves a wrapped paragraph wrapped when it is not the one edited', function() {
        /* The paragraph at block 2 of basic.md is wrapped across two
           source lines. HTML has no way to carry that wrapping, so the
           editor hands it back on one line -- and re-serializing it
           would unwrap it in the diff for an edit made somewhere else
           entirely. The splice is what keeps the author's wrapping. */
        const source = FILES['basic.md'];
        const doc = MarkdownDocument.parse(source);
        const region = boot(doc.toHTML(), 'markdown');

        retype(blockAt(region, 0), 'Renamed');

        const next = doc.update(region.html());
        expect(next).toContain('a [link](/somewhere "A title") and an\n![image]');
        return expect(changedLines(source, next).length).toBe(1);
    });
});

// --- unrepresentable constructs -----------------------------------------

describe('constructs markdown can express and the editor cannot', function() {

    /** The static children of a region booted on `name`. */
    function statics(region) {
        return region.children.filter(child => child.type() === 'Static');
    }

    it('become Static elements', function() {
        const doc = MarkdownDocument.parse(FILES['shortcodes.md']);
        const region = boot(doc.toHTML(), 'markdown');
        return expect(statics(region).length).toBe(4);
    });

    it('get a placeholder to type into when they are the whole file', function() {
        /* `start()` gives a region with no editable children a
           placeholder paragraph -- v1.6.16 behaviour, and the right one
           here: an all-shortcode file would otherwise open with nowhere
           to put the cursor. It must not reach the file, though, which
           is why an empty block is never written. */
        const source = FILES['shortcodes.md'];
        const doc = MarkdownDocument.parse(source);
        const region = boot(doc.toHTML(), 'markdown');

        expect(region.children.length).toBe(5);
        expect(region.children[4].type()).toBe('Text');
        return expect(doc.update(region.html())).toBe(source);
    });

    it('cannot be focused', function() {
        // `ContentEdit.Static` has no `focus` at all, which is what makes
        // it read-only without anything here having to enforce it.
        const doc = MarkdownDocument.parse(FILES['shortcodes.md']);
        const region = boot(doc.toHTML(), 'markdown');
        return expect(statics(region)[0].focus).toBe(undefined);
    });

    it('cannot be dragged', function() {
        const doc = MarkdownDocument.parse(FILES['shortcodes.md']);
        const region = boot(doc.toHTML(), 'markdown');
        const block = statics(region)[0];

        expect(block.can('drag')).toBe(false);
        // The gate is what `drag()` itself consults, so calling it is
        // the behavioural form of the same assertion.
        block.drag(0, 0);
        return expect(ContentEdit.Root.get().dragging()).toBe(null);
    });

    it('CAN be dragged in HTML mode, which is v1.6.16 behaviour', function() {
        // The constraint is markdown mode's, not the editor's. Without
        // this the test above would pass against a Static that was never
        // draggable in the first place.
        const doc = MarkdownDocument.parse(FILES['shortcodes.md']);
        const region = boot(doc.toHTML(), 'html');
        const block = statics(region)[0];

        expect(block.can('drag')).toBe(true);
        block.drag(0, 0);
        expect(ContentEdit.Root.get().dragging()).toBe(block);
        return ContentEdit.Root.get().cancelDragging();
    });

    it('can still be dropped past', function() {
        /* `drop` stays allowed deliberately: forbidding it would make a
           static block at the top or bottom of a region a wall that no
           other block could be moved around. */
        const doc = MarkdownDocument.parse(FILES['static-blocks.md']);
        const region = boot(doc.toHTML(), 'markdown');
        return expect(statics(region)[0].can('drop')).toBe(true);
    });

    it('keep their bytes when the block above them is rewritten', function() {
        const source = FILES['static-blocks.md'];
        const doc = MarkdownDocument.parse(source);
        const region = boot(doc.toHTML(), 'markdown');

        retype(blockAt(region, 0), 'Renamed');

        const next = doc.update(region.html());
        expect(next).toContain('{{< figure src="/a.png" caption="Hi" >}}');
        expect(next).toContain('<div class="callout">\n  <p>Raw HTML block.</p>\n</div>');
        return expect(changedLines(source, next).length).toBe(1);
    });
});
