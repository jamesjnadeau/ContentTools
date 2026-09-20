/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// FlashUI

describe('ContentTools.FlashUI', function() {

    let div = null;
    let editor = null;

    beforeEach(function() {
        // Create an editable region
        div = document.createElement('div');
        div.setAttribute('class', 'editable');
        document.body.appendChild(div);

        // Initialize the editor
        editor = ContentTools.EditorApp.get();
        return editor.init('.editable');
    });

    afterEach(function() {
        // Shutdown the editor
        editor.destroy();

        // Remove the editable region
        return document.body.removeChild(div);
    });


    describe('ContentTools.FlashUI()', function() {

        it('should return an instance of a FlashUI', function() {

            const flash = new ContentTools.FlashUI('ok');
            return expect(flash instanceof ContentTools.FlashUI).toBe(true);
        });

        it('should mount the component', function() {

            const flash = new ContentTools.FlashUI('ok');
            return expect(flash.isMounted()).toBe(true);
        });

        return it('should unmount the component once it has faded', async function() {

            /* Was written against Jasmine's `done` callback, which Vitest
               does not implement: the test returned the timeout id, finished
               in 0ms asserting nothing, and its assertion ran a half second
               later with no test around it to fail -- and once awaited
               properly it failed, because it was asserting something untrue
               in this harness. The fade is a CSS animation and the browser
               suite loads no stylesheet, so a flash here never becomes
               transparent by itself. Set the opacity the poll reads. */
            const flash = new ContentTools.FlashUI('ok');
            flash.domElement().style.opacity = '0';

            await new Promise(resolve => setTimeout(resolve, 600));

            return expect(flash.isMounted()).toBe(false);
        });
    });


    describe('ContentTools.FlashUI.mount()', () => it('should mount the component and apply the specified modifier', function() {

        // `mount` is called with the specified modifier in the constructor
        const flash = new ContentTools.FlashUI('ok');
        expect(flash.isMounted()).toBe(true);

        // Get a list of classes against the class and check the specified
        // modifier is one of them.
        const classes = flash.domElement().getAttribute('class').split(' ');
        return expect(classes.indexOf('ct-flash--ok') > -1).toBe(true);
    }));

    return describe('the visibility poll', function() {

        /* The poll asks for the element's computed opacity every 250ms and
           unmounts once it has faded. A DETACHED node has no computed style,
           so `opacity` reads as '' -- and since every comparison against the
           resulting NaN is false, the poll used to reschedule itself for the
           life of the document, holding the detached subtree with it.

           Nothing else would ever collect it: a flash is an
           `AnchoredComponentUI`, so it is not among the app's children and
           the editor's own teardown never sees it. */

        it('stops when the flash is taken off the page', async function() {
            const flash = new ContentTools.FlashUI('ok');
            const chrome = editor.domElement();
            const parent = chrome.parentNode;
            parent.removeChild(chrome);
            expect(flash.domElement().isConnected).toBe(false);

            // Three times the poll interval: long enough that a poll which
            // was going to give up has, and one that was not has ticked
            // twice more.
            await new Promise(resolve => setTimeout(resolve, 800));

            expect(flash.isMounted()).toBe(false);

            // Put the chrome back so `destroy()` can unmount it.
            return parent.appendChild(chrome);
        });

        return it('does not run again after an explicit unmount', async function() {
            /* `unmount()` is public and nulls `_domElement`, so a tick left
               scheduled calls `getComputedStyle(null)` a quarter of a second
               later -- which throws from a timer, with a stack pointing at
               nothing the caller did. Asserting on the symptom rather than
               on `clearTimeout`: a poll that guarded itself instead would be
               just as correct. */
            const errors = [];
            const onError = ev => errors.push(ev.message);
            window.addEventListener('error', onError);

            const flash = new ContentTools.FlashUI('ok');
            flash.unmount();
            await new Promise(resolve => setTimeout(resolve, 600));
            window.removeEventListener('error', onError);

            return expect(errors).toEqual([]);
        });
    });
});