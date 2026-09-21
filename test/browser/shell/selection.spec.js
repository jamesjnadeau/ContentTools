import {editorOf, forgetToken, openAt, until, createFakeGitHub} from './helpers.js';

/* Where the caret actually is, with an entry open in the shell.
 *
 * The single highest-consequence decision in M5 is that the
 * `<content-tools-editor>` is a LIGHT-DOM child of the shell host rather
 * than a node inside the shell's shadow root, and nothing about the page
 * looks different either way. What differs is `getRange()`:
 *
 *   In Mode A the editable content is in the light DOM, so
 *   `ShadowRootContext.getRange()`'s first two branches -- Chromium's
 *   `ShadowRoot.getSelection()` and `getComposedRanges({shadowRoots})` --
 *   both decline on containment, and it falls through to
 *   `document.getSelection()`, whose range it returns even though the
 *   nodes are outside the editor's own root, because in Mode A those
 *   nodes ARE the content. Nest the editor inside a second shadow root
 *   and `document.getSelection()` retargets in Chromium and WebKit: the
 *   range comes back pointing at the shell host, so the caret is in the
 *   wrong place, formatting lands somewhere else, and nothing throws.
 *
 * So these assert the RESOLVED RANGE rather than where the element sits.
 * A DOM-position assertion would miss a refactor that keeps the editor in
 * the light DOM and nests it under some other shadow root.
 */

const SEED = '# Title\n\nOne two three\n';

describe('the caret, with an entry open in the shell', function() {

    let el = null;

    beforeEach(function() {
        forgetToken();
    });

    afterEach(function() {
        if (el) {
            el.remove();
            el = null;
        }
        forgetToken();
        history.replaceState(null, '', location.pathname + location.search);
    });

    /** Open the entry and return its second block (the paragraph). */
    async function paragraph() {
        const fake = createFakeGitHub({files: {'content/blog/hello.md': SEED}});
        const mounted = await openAt('#/c/blog/e/hello', {fake});
        el = mounted.el;
        await until(() => editorOf(el)?.state === 'editing', 'the editor to start');
        return {fake, block: editorOf(el).editorApp.regions().body.children[1]};
    }

    it('resolves to a range in the DOCUMENT, not in any shadow root',
       async function() {
        const {block} = await paragraph();
        block.focus();
        block.selection(new ContentSelect.Range(4, 7));

        const range = editorOf(el).rootContext.getRange();
        expect(range).not.toBe(null);
        /* The document, and inside the editor's own light-DOM subtree.
           A retargeted range satisfies neither: its container is the
           shell host, whose root IS the document but which is not
           inside the editor. Both halves, because either alone passes
           for one of the two ways this can go wrong. */
        expect(range.startContainer.getRootNode()).toBe(document);
        return expect(editorOf(el).contains(range.startContainer)).toBe(true);
    });

    it('reads back the selection it was given', async function() {
        /* Write through the seam, then read through it. A retargeted
           read does not throw -- it answers about the wrong nodes -- so
           the only assertion that can see it is one that compares the
           answer with what was written. */
        const {block} = await paragraph();
        block.focus();
        block.selection(new ContentSelect.Range(4, 7));
        return expect(block.selection().get()).toEqual([4, 7]);
    });

    it('formats the word the caret is on, all the way into the commit',
       async function() {
        /* The consequence, end to end and in the file a reviewer would
           read. The tool is given the selection READ BACK through the
           seam rather than the object written in, so a retargeted range
           puts the emphasis on the wrong offsets -- and `**two**` is
           what says it did not. */
        const {fake, block} = await paragraph();
        block.focus();
        block.selection(new ContentSelect.Range(4, 7));

        ContentTools.ToolShelf.fetch('bold').apply(block, block.selection(), () => {});
        expect(block.content.html()).toBe('One <b>two</b> three');

        const submit = el.shadowRoot.querySelector('.ct-cms__entry-submit');
        submit.click();
        await until(() => !submit.disabled, 'the save to finish');

        return expect(fake.read('content/blog/hello.md', 'cms/blog/hello'))
            .toBe('# Title\n\nOne **two** three\n');
    });
});
