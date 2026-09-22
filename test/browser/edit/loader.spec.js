/* The file every reader of the site downloads, and the one question it
   asks before downloading anything else.

   It is imported dynamically below, and that is not a style choice: the
   module BOOTS against the real window as a side effect of being
   imported, exactly as `src/element/index.ts` registers a tag. So the
   tab is cleared first, and whatever it decides to do is cleaned up
   after -- a spec that leaves a bar on the page would leave it on every
   spec that runs after this one. */

import {BAR_TAG} from '../../../src/edit/chrome.js';
import {APP_TOKEN_KEY, TOKEN_KEY} from '../../../src/auth/storage.js';

let edit;

beforeAll(async function() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(APP_TOKEN_KEY);
    edit = await import('../../../src/edit/index.js');
});

afterEach(function() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(APP_TOKEN_KEY);
    for (const node of [...document.querySelectorAll(BAR_TAG)]) {
        node.remove();
    }
});

/** A window-shaped thing: the two properties `wanted` reads, and a doc. */
function visitor(search = '', storage = sessionStorage) {
    return {
        location: {search},
        get sessionStorage() {
            /* A getter, because it is reaching for the PROPERTY that
               throws in a sandboxed iframe -- not the call after it. */
            if (storage === 'hostile') {
                throw new DOMException('denied', 'SecurityError');
            }
            return storage;
        },
        document: document.implementation.createHTMLDocument('page')
    };
}

describe('wanted', function() {

    it('is false for a reader, which is nearly everybody', function() {
        expect(edit.wanted(visitor())).toBe(false);
    });

    it('is true for the flag /admin links out with', function() {
        expect(edit.wanted(visitor(`?${edit.EDIT_FLAG}`))).toBe(true);
    });

    it('is true for a personal access token already in this tab', function() {
        /* What makes this feel like part of the site: an author who
           signed in keeps the editor as they move from page to page. */
        sessionStorage.setItem(TOKEN_KEY, 'ghp_x');

        expect(edit.wanted(visitor())).toBe(true);
    });

    it('is true for a GitHub App token, which is a different key', function() {
        sessionStorage.setItem(APP_TOKEN_KEY, 'ghu_x');

        expect(edit.wanted(visitor())).toBe(true);
    });

    it('is false, not an exception, where storage is refused', function() {
        /* A sandboxed iframe and some private modes throw on the
           property itself. A browser that refuses storage is a browser
           where nobody is signed in, and this file runs on every page of
           the site -- an uncaught error here is a site that looks
           broken to a reader. */
        expect(edit.wanted(visitor('', 'hostile'))).toBe(false);
    });

    it('still answers the flag where storage is refused', function() {
        expect(edit.wanted(visitor(`?${edit.EDIT_FLAG}`, 'hostile'))).toBe(true);
    });
});

describe('boot', function() {

    it('downloads nothing and shows nothing to a reader', async function() {
        const where = visitor();
        await edit.boot(where);

        expect(where.document.querySelector(BAR_TAG)).toBe(null);
    });

    it('brings up the surface when the page wants one', async function() {
        /* The lazy import is the whole shape of this entry, so this is
           the assertion that it is wired to anything at all. The config
           fetch below is a real request to the test server and a real
           404, which is why the bar it puts up says so. */
        const where = visitor(`?${edit.EDIT_FLAG}`);
        await edit.boot(where);

        const bar = where.document.querySelector(BAR_TAG);
        expect(bar).not.toBe(null);
        expect(bar.shadowRoot.querySelector('.ct-edit').className)
            .toContain('ct-edit--broken');
    });
});
