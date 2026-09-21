/* Both entries on one page.
 *
 * `./shell` registers `<content-tools-editor>` itself, because it creates
 * one and `./element` -- the module that would otherwise have done it --
 * is a build ENTRY the shell may not import (see imports.spec.js). So a
 * host page that loads both, which is an ordinary thing to do when the
 * page has an editor of its own beside the CMS, has two modules trying to
 * define the same tag.
 *
 * The second `customElements.define` for a name throws
 * `NotSupportedError`, and it throws during MODULE EVALUATION -- so the
 * failure is not a broken shell, it is a page that stops dead at its
 * import, with whichever half loaded second never running at all.
 *
 * The import order here is the point and is load-bearing: `./element`
 * first, so that it is the SHELL's guard being exercised. Every other
 * shell spec reaches the shell first, which is why none of them can see
 * this.
 */
import '../../../src/element/index.js';
import {TAG_NAME} from '../../../src/shell/index.js';
import {EDITOR_TAG} from '../../../src/shell/content-tools-cms.js';
import {mountShell, forgetToken} from './helpers.js';

describe('the element and the shell on one page', () => {
    afterEach(() => forgetToken());

    it('registers both tags, with neither entry throwing on load', () => {
        /* Reaching this line at all is most of the assertion: a throw
           from either module body fails the whole file before any test
           runs. */
        expect(customElements.get(EDITOR_TAG)).toBeTruthy();
        return expect(customElements.get(TAG_NAME)).toBeTruthy();
    });

    it('leaves the editor class the one `./element` registered', async () => {
        /* Whichever registered first wins, and the shell must then use
           THAT class rather than a second copy -- two classes for one tag
           is two `EditorApp` leases and an entry that never opens. */
        const {el} = await mountShell();
        const made = el.ownerDocument.createElement(EDITOR_TAG);
        return expect(made).toBeInstanceOf(customElements.get(EDITOR_TAG));
    });
});
