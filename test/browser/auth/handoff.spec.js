/* What crosses from `/admin` to the site's own page.
 *
 * A pure string module with no DOM and no storage, so it is driven
 * directly -- which matters more here than it usually would, because the
 * two ends of this are in different builds running on different origins
 * and there is no test anywhere that can put a real one of each on
 * screen at once. What can be pinned is that they agree, and the way to
 * pin it is that both call these two functions.
 */
import {
    EDIT_FLAG, KEY_PARAM, TOKEN_PARAM, handoffFragment, readHandoff, withEditFlag
} from '../../../src/auth/handoff.js';
import {APP_TOKEN_KEY, TOKEN_KEY} from '../../../src/auth/storage.js';

const PAT = {key: TOKEN_KEY, value: 'github_pat_11ABCDE_secret'};
const APP = {
    key: APP_TOKEN_KEY,
    value: JSON.stringify({token: 'ghu_x', expiresAt: 1800000000000})
};

describe('the handoff', function() {

    describe('a round trip', function() {

        it('carries a personal access token back out unchanged', function() {
            const claimed = readHandoff(`#${handoffFragment(PAT)}`);
            expect(claimed.handoff).toEqual(PAT);
            return expect(claimed.rest).toBe('');
        });

        it('carries an App token WITH its expiry, byte for byte', function() {
            /* The reason the value is opaque rather than `{token,
               expiresAt}`: an App token lasts about eight hours and the
               page it lands on cannot renew one, so an expiry that does
               not cross is a page that keeps sending a dead token and
               collecting 401s instead of saying the session is over.
               JSON in a fragment means braces and quotes, which is the
               case that would break an unencoded spelling. */
            const claimed = readHandoff(`#${handoffFragment(APP)}`);
            return expect(claimed.handoff).toEqual(APP);
        });

        it('survives a value that needs encoding at every turn', function() {
            /* `&` and `=` are the two characters that decide where one
               segment stops, so a value carrying them is the input that
               tells a hand-rolled split from a correct one. `#` would
               end the fragment entirely. */
            const nasty = {key: TOKEN_KEY, value: 'a&b=c#d %e+f/g'};
            return expect(readHandoff(`#${handoffFragment(nasty)}`).handoff)
                .toEqual(nasty);
        });

        it('works without the leading hash, which is how some callers spell it',
           function() {
            return expect(readHandoff(handoffFragment(PAT)).handoff).toEqual(PAT);
        });
    });

    describe('what it leaves behind', function() {

        it('gives back a page’s own anchor exactly as the site wrote it',
           function() {
            /* The reason this is a split and a rejoin rather than
               `URLSearchParams`, which is the obvious reach: a fragment
               is not a query string, and `#section-2` round-trips
               through `URLSearchParams` as `#section-2=`. An anchor that
               grows an `=` is a link to nothing, on the site's own
               page, caused by a CMS taking a token out of the URL. */
            const claimed = readHandoff(`#section-2&${handoffFragment(PAT)}`);
            expect(claimed.handoff).toEqual(PAT);
            return expect(claimed.rest).toBe('#section-2');
        });

        it('keeps several, in the order they were written', function() {
            const claimed = readHandoff(
                `#${handoffFragment(PAT)}&a=1&section-2&b=2`);
            return expect(claimed.rest).toBe('#a=1&section-2&b=2');
        });

        it('says there is nothing left rather than an empty hash', function() {
            /* `''`, not `'#'`. A bare `#` is a URL the browser scrolls
               to the top for and the address bar shows with a trailing
               hash nobody wrote -- a visible trace of a handoff whose
               whole point is to leave none. */
            return expect(readHandoff(`#${handoffFragment(PAT)}`).rest).toBe('');
        });
    });

    describe('what it refuses', function() {

        it('finds nothing in an ordinary page fragment', function() {
            expect(readHandoff('#section-2')).toBe(null);
            expect(readHandoff('')).toBe(null);
            return expect(readHandoff('#')).toBe(null);
        });

        it('refuses a key it does not recognise', function() {
            /* The security-relevant line in this module, and it is one
               comparison. Without it a crafted link writes any key it
               likes into somebody's `sessionStorage` -- not a token
               anything reads, but a page's own storage overwritten by a
               URL, which is a primitive nobody should be handing out
               for free. */
            const crafted = `${TOKEN_PARAM}=x&${KEY_PARAM}=`
                + encodeURIComponent('some-other-app:session');
            return expect(readHandoff(`#${crafted}`)).toBe(null);
        });

        it('refuses half a handoff', function() {
            /* A link truncated in transit -- a chat client that stopped
               at the `&`, a copy that missed the end. Storing what
               arrived would be a token under a name nothing reads, or a
               name with nothing under it, and the author would be told
               they are signed out on a page they just pressed Edit
               for. */
            expect(readHandoff(`#${TOKEN_PARAM}=x`)).toBe(null);
            return expect(readHandoff(`#${KEY_PARAM}=${TOKEN_KEY}`)).toBe(null);
        });

        it('refuses a link cut off at the `=`', function() {
            /* Two spellings of the same truncation, and the one failure
               here that is worse than nothing happening: an empty string
               stored under the token's key reads as a token to
               everything that asks -- `wanted` says this tab is signed
               in, the adapter hands `Bearer ` to GitHub, and the author
               is told their credentials are bad on a page they just
               pressed Edit for. Refusing sends them to the same "sign in
               through the admin screens" the link would have got with no
               fragment at all. */
            const key = `${KEY_PARAM}=${TOKEN_KEY}`;
            expect(readHandoff(`#${TOKEN_PARAM}=&${key}`)).toBe(null);
            return expect(readHandoff(`#${TOKEN_PARAM}&${key}`)).toBe(null);
        });

        it('does not mistake an anchor that merely starts the same way',
           function() {
            /* `#cms-tokens` is a perfectly ordinary anchor for a site to
               have, and a parser that looked for a name by chopping the
               last character off would read it as the parameter with
               `cms-tokens` for a value -- so a page's own anchor would
               be stored as somebody's credentials and taken off the URL
               on the way. It stays where the site put it. */
            const claimed = readHandoff(
                `#${TOKEN_PARAM}s&${handoffFragment(PAT)}`);
            expect(claimed.handoff).toEqual(PAT);
            return expect(claimed.rest).toBe(`#${TOKEN_PARAM}s`);
        });

        it('refuses a fragment that was mangled rather than throwing', function() {
            /* A lone `%` makes `decodeURIComponent` throw, and this runs
               on the site's own pages from a script every reader
               downloads: an uncaught error here is a site that looks
               broken to somebody who is not even editing. */
            return expect(readHandoff(`#${TOKEN_PARAM}=%&${KEY_PARAM}=${TOKEN_KEY}`))
                .toBe(null);
        });
    });

    describe('the edit flag', function() {

        it('is what the page asks for, and carries no secret', function() {
            expect(withEditFlag('/blog/hello/')).toBe(`/blog/hello/?${EDIT_FLAG}`);
        });

        it('joins a page template that already has a query', function() {
            /* A site with a locale or a preview parameter in its URLs.
               A second `?` is not a query, it is part of the value of
               the first one -- so the flag would arrive as text inside
               another parameter and the page would never see it. */
            expect(withEditFlag('/blog/hello/?lang=fr'))
                .toBe(`/blog/hello/?lang=fr&${EDIT_FLAG}`);
        });
    });
});
