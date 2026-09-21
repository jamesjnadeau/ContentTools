import {insertImage} from '../../../src/shell/insert.js';
import {createFakeGitHub, editorOf, forgetToken, openAt, until} from './helpers.js';

/* Putting a repository file into the open entry.
 *
 * Driven against a real open editor rather than a stub, because what this
 * has to get right is entirely about ContentEdit's tree: where a block
 * lands relative to the caret, what happens when the caret is inside a
 * list item, and what happens when there is no editor at all. A stubbed
 * `EditorApp` would let all four of those be wrong in the same way at
 * once.
 *
 * The media grid calls this; `media.spec.js` proves the wiring and that a
 * save writes the reference. This file is about the placement.
 */

const ENTRY = 'content/blog/hello.md';
const PICTURE = {url: '/images/cat.png', size: [4, 2], alt: 'cat.png'};

describe('insertImage', function() {

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

    async function open(markdown) {
        const fake = createFakeGitHub({files: {[ENTRY]: markdown}});
        const mounted = await openAt('#/c/blog/e/hello', {fake});
        el = mounted.el;
        await until(() => editorOf(el)?.state === 'editing', 'the editor to start');
        return editorOf(el).editorApp.regions().body;
    }

    /** The type of each top-level block, so a placement reads at a glance. */
    const shape = region => region.children.map(child => child.type());

    it('puts the picture after the block the caret is in', async function() {
        const region = await open('# Gallery\n\nOne.\n\nTwo.\n');
        region.children[1].focus();

        expect(insertImage('body', PICTURE)).toBe(true);
        return expect(shape(region)).toEqual(['Text', 'Text', 'Image', 'Text']);
    });

    it('puts it at the end when nothing has been focused', async function() {
        /* An author who opened the media library before typing anything
           gets the image at the bottom -- somewhere they can see it and
           move it, rather than nowhere. */
        const region = await open('# Gallery\n\nOne.\n');
        expect(insertImage('body', PICTURE)).toBe(true);
        return expect(shape(region)).toEqual(['Text', 'Text', 'Image']);
    });

    it('puts it after the list, not inside the item', async function() {
        /* The editor's own rule for where an inserted block goes, asked
           through the editor's own function rather than written again
           here. A second copy is how the media library and the image
           tool come to disagree about this exact case -- and an `Image`
           attached inside a `ListItem` is markdown nothing round-trips.
        */
        const region = await open('# Gallery\n\n- one\n- two\n');
        const list = region.children[1];
        // The item's text, which is what a caret is actually in.
        list.children[0].children[0].focus();

        expect(insertImage('body', PICTURE)).toBe(true);
        expect(shape(region)).toEqual(['Text', 'List', 'Image']);
        return expect(list.children.length).toBe(2);
    });

    it('carries the size it was given, so the aspect ratio is a number',
       async function() {
        /* `ContentEdit.Image` divides by the width to get its aspect
           ratio. A zero produces an Infinity that survives every later
           calculation and lands in the saved `height` attribute, which
           is why the grid will not offer Insert until the browser has
           actually decoded the file. */
        const region = await open('# Gallery\n\nOne.\n');
        insertImage('body', PICTURE);
        const image = region.children[region.children.length - 1];
        expect(image.size()).toEqual([4, 2]);
        return expect(image.attr('alt')).toBe('cat.png');
    });

    it('leaves the caret on the picture, so two of them keep their order',
       async function() {
        /* The insert focuses what it inserted. Without that the caret
           stays on the paragraph, and the second picture goes after the
           SAME paragraph -- which puts it in front of the first. Pick
           three in a row and they arrive backwards, which reads as the
           grid being in the wrong order rather than as a bug here. */
        const region = await open('# Gallery\n\nOne.\n\nTwo.\n');
        region.children[1].focus();

        insertImage('body', {...PICTURE, alt: 'first.png'});
        insertImage('body', {...PICTURE, alt: 'second.png'});

        expect(shape(region)).toEqual(['Text', 'Text', 'Image', 'Image', 'Text']);
        return expect(region.children.slice(2, 4).map(child => child.attr('alt')))
            .toEqual(['first.png', 'second.png']);
    });

    it('refuses a region this editor does not have', async function() {
        /* False rather than a throw. The reachable reasons are all "the
           editor is not there any more" -- a teardown that raced the
           click -- and none of them is worth an alert over somebody's
           work. */
        const region = await open('# Gallery\n\nOne.\n');
        expect(insertImage('nope', PICTURE)).toBe(false);
        return expect(shape(region)).toEqual(['Text', 'Text']);
    });

    it('refuses when there is no editor at all', async function() {
        /* `current()`, not `get()`. `get()` CONSTRUCTS a fresh dormant
           app when there is none, so a click arriving after teardown
           would build an editor nobody can see, attach the image to it,
           and report success. */
        await open('# Gallery\n\nOne.\n');
        el.remove();
        el = null;
        await until(() => ContentTools.EditorApp.current() === null,
                    'the lease to be released');
        expect(insertImage('body', PICTURE)).toBe(false);
        /* And no editor was brought into being on the way to that
           answer. Both spellings return false here; only one of them
           leaves the page without a dormant app holding the
           one-per-page lease, which the NEXT entry then cannot take. */
        return expect(ContentTools.EditorApp.current()).toBe(null);
    });

    it('ignores a caret left in an entry that has been closed',
       async function() {
        /* `Root.focused()` is process-wide and outlives an editor, so
           without the containment check an image could be attached to a
           region belonging to an entry nobody is looking at -- and then
           never saved, because the editor holding it is gone. */
        const first = await open('# Gallery\n\nOne.\n');
        first.children[1].focus();

        location.hash = '#/c/blog';
        await until(() => el.shadowRoot.querySelector('.ct-cms__entry-list'),
                    'the list to come back');
        location.hash = '#/c/blog/e/hello';
        await until(() => editorOf(el)?.state === 'editing', 'the entry to reopen');

        const region = editorOf(el).editorApp.regions().body;
        expect(region).not.toBe(first);
        /* Put the caret back in the CLOSED entry, which is the state
           the check exists for: a teardown that blurred leaves nothing
           to be confused by, so a test that relies on the blur is
           testing the blur. `focused()` is process-wide, so the old
           entry's paragraph is a perfectly good answer to it. */
        first.children[1].focus();
        expect(ContentEdit.Root.get().focused()).toBe(first.children[1]);

        expect(insertImage('body', PICTURE)).toBe(true);
        // At the end, because the stale caret is not in THIS region.
        expect(shape(region)).toEqual(['Text', 'Text', 'Image']);
        // And nothing was attached to the entry nobody is looking at.
        return expect(shape(first)).toEqual(['Text', 'Text']);
    });
});
