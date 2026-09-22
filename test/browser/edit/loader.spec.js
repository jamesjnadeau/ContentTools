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
import {handoffFragment} from '../../../src/auth/handoff.js';

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

/**
 * A window-shaped thing: what `wanted` and `claim` read, and a doc.
 *
 * `history.replaceState` RECORDS rather than acts, because what it is
 * asked to write is the whole of the claim's security story -- a URL
 * with no token left in it -- and there is no other way to see it: a
 * real `location` is not assignable and a real `history` would rewrite
 * the URL the test runner itself is on.
 */
function visitor(search = '', storage = sessionStorage, hash = '') {
    const replaced = [];
    return {
        location: {search, hash, pathname: '/blog/hello/'},
        history: {
            replaceState(_state, _title, url) {
                replaced.push(url);
            }
        },
        replaced,
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

describe('claim', function() {

    /* What `/admin` puts on the end of the link, spelled through the
       module both ends share rather than by hand: a literal here that
       drifted from `handoffFragment` would be a test that passes while
       the two surfaces disagree, which is the one failure this whole
       module exists to prevent. */
    const handed = handoff => `#${handoffFragment(handoff)}`;

    it('finds nothing on an ordinary page', function() {
        const where = visitor('', sessionStorage, '#section-2');

        expect(edit.claim(where)).toBe(false);
        /* Untouched. A script that rewrote every URL it ran on would be
           a script that broke every in-page anchor on the site. */
        return expect(where.replaced).toEqual([]);
    });

    it('puts the token away under the key its adapter reads', function() {
        const where = visitor('', sessionStorage,
                              handed({key: TOKEN_KEY, value: 'ghp_handed'}));

        expect(edit.claim(where)).toBe(true);
        expect(sessionStorage.getItem(TOKEN_KEY)).toBe('ghp_handed');
        /* And the surface will now come up unasked, which is what makes
           the editor follow an author as they move around the site. */
        return expect(edit.wanted(visitor())).toBe(true);
    });

    it('takes an App token\u2019s whole stored shape, expiry and all', function() {
        const value = JSON.stringify({token: 'ghu_x', expiresAt: 1800000000000});
        const where = visitor('', sessionStorage,
                              handed({key: APP_TOKEN_KEY, value}));

        expect(edit.claim(where)).toBe(true);
        return expect(sessionStorage.getItem(APP_TOKEN_KEY)).toBe(value);
    });

    it('takes it out of the URL, and out of the history with it', function() {
        /* The whole security story of the fragment is this line. The
           token is in the address bar for one tick and then it is not
           -- and `replaceState` rather than assigning the hash, because
           assigning ADDS an entry, so Back would take the author to the
           URL with the token still in it. */
        const where = visitor('?cms-edit', sessionStorage,
                              handed({key: TOKEN_KEY, value: 'ghp_secret'}));

        edit.claim(where);
        expect(where.replaced).toEqual(['/blog/hello/?cms-edit']);
        return expect(where.replaced[0]).not.toContain('ghp_secret');
    });

    it('leaves the page\u2019s own anchor on the URL it writes back', function() {
        const where = visitor('', sessionStorage,
                              `#section-2&${handoffFragment(
                                  {key: TOKEN_KEY, value: 'ghp_x'})}`);

        edit.claim(where);
        return expect(where.replaced).toEqual(['/blog/hello/#section-2']);
    });

    it('rewrites the URL BEFORE it tries to store, not after', function() {
        /* The order is the point, and a storage that refuses is the one
           arrangement that can see it. A store that fails leaves an
           author looking at a page that says to sign in, which is a
           clean answer; a strip that never happened leaves a bearer
           token in the address bar for as long as the tab lives. */
        const where = visitor('', 'hostile',
                              handed({key: TOKEN_KEY, value: 'ghp_secret'}));

        expect(() => edit.claim(where)).not.toThrow();
        return expect(where.replaced).toEqual(['/blog/hello/']);
    });

    it('still says it was handed something when the store was refused',
       function() {
        /* So the surface comes up and says nobody is signed in, rather
           than the page doing nothing at all. A link that opens a page
           where nothing happens is indistinguishable from a script that
           failed to load, and the person who pressed Edit has no way to
           tell which. */
        const where = visitor('', 'hostile',
                              handed({key: TOKEN_KEY, value: 'ghp_x'}));

        return expect(edit.claim(where)).toBe(true);
    });

    it('survives a document that will not let it rewrite the URL', function() {
        /* A sandboxed iframe, a `file:` URL. Giving up here would gain
           nothing: the token is already in a URL somebody can read, and
           refusing to use it does not take it back out. */
        const where = visitor('', sessionStorage,
                              handed({key: TOKEN_KEY, value: 'ghp_x'}));
        where.history.replaceState = () => {
            throw new DOMException('denied', 'SecurityError');
        };

        expect(edit.claim(where)).toBe(true);
        return expect(sessionStorage.getItem(TOKEN_KEY)).toBe('ghp_x');
    });

    it('writes nothing for a key it was not meant to write', function() {
        const where = visitor('', sessionStorage,
                              '#cms-token=x&cms-key=' + encodeURIComponent('evil'));

        expect(edit.claim(where)).toBe(false);
        return expect(sessionStorage.getItem('evil')).toBe(null);
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

    it('brings it up for a token that arrived on the URL, with no flag',
       async function() {
        /* The claim runs BEFORE the question, and this is the
           arrangement that can see it: no `?cms-edit`, and nothing in
           this tab until the fragment is put away. Asked first, `wanted`
           would answer no and the page would do nothing at all -- a link
           from `/admin` that opens a page where nothing happens, which
           is indistinguishable from a script that failed to load. */
        const where = visitor('', sessionStorage,
                              `#${handoffFragment(
                                  {key: TOKEN_KEY, value: 'ghp_handed'})}`);
        await edit.boot(where);

        expect(where.document.querySelector(BAR_TAG)).not.toBe(null);
        return expect(sessionStorage.getItem(TOKEN_KEY)).toBe('ghp_handed');
    });

    it('brings it up when the handoff could not be stored', async function() {
        /* Having been handed something is itself a reason to put the bar
           up. The store was refused, so `wanted` finds nothing and would
           send this reader away -- and the author who pressed Edit would
           be looking at a page that never says why. */
        const where = visitor('', 'hostile',
                              `#${handoffFragment(
                                  {key: TOKEN_KEY, value: 'ghp_handed'})}`);
        await edit.boot(where);

        return expect(where.document.querySelector(BAR_TAG)).not.toBe(null);
    });
});
