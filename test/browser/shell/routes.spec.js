import {HOME, formatRoute, parseRoute} from '../../../src/shell/routes.js';

/* The shell's location, and the one property that matters about it.
 *
 * A route is written into the address bar and read back on reload, so
 * `parseRoute(formatRoute(r))` must be `r` for every shape. The failure a
 * one-directional test misses is the asymmetric one: a formatter that
 * encodes and a parser that does not decode agree on every slug made of
 * letters, and disagree on the first one with a space in it -- which is the
 * first entry whose filename came from a title.
 */

const ROUTES = [
    HOME,
    {kind: 'unknown', hash: '#/nonsense'},
    {kind: 'collection', collection: 'blog'},
    {kind: 'entry', collection: 'blog', slug: 'hello'},
    {kind: 'new', collection: 'blog'},
    {kind: 'media'},
    {kind: 'review'}
];

describe('routes', function() {
    it('round trips every shape', function() {
        for (const route of ROUTES) {
            expect(parseRoute(formatRoute(route))).toEqual(route);
        }
    });

    it('round trips a slug that needs encoding', function() {
        /* Every one of these reaches a hash from a real filename.  `#` is
           the dangerous one: unencoded it TRUNCATES the hash where the slug
           begins, so the entry silently opens as its own collection rather
           than failing. */
        for (const slug of ['a space', 'a/slash', 'a#hash', 'a%percent', 'café', 'a?query']) {
            const route = {kind: 'entry', collection: 'blog', slug};
            expect(parseRoute(formatRoute(route))).toEqual(route);
        }
    });

    it('encodes rather than passing the slug through', function() {
        // Pins the mechanism the test above rests on: if formatRoute ever
        // stopped encoding, a parser that stopped decoding would keep the
        // round trip green while both were wrong.
        expect(formatRoute({kind: 'entry', collection: 'blog', slug: 'a space'}))
            .toBe('#/c/blog/e/a%20space');
    });

    it('reports what it could not read instead of quietly going home', function() {
        /* A stale bookmark or a mistyped link that silently rendered the
           dashboard would be indistinguishable from the root, so the user
           concludes the entry was deleted. The hash is carried so the view
           can say what it did not recognise. */
        expect(parseRoute('#/c/blog/e/hello/typo'))
            .toEqual({kind: 'unknown', hash: '#/c/blog/e/hello/typo'});
        expect(parseRoute('#/C/blog')).toEqual({kind: 'unknown', hash: '#/C/blog'});
    });

    it('decodes after splitting, not before', function() {
        /* `%2F` decodes to `/`. Decoding the whole path first and then
           splitting turns a file-collection entry named `docs/faq` into two
           segments -- and that name is whatever an operator wrote in the
           config, so the entry becomes unopenable from its own nav link
           with nothing in the console. */
        expect(parseRoute('#/c/pages/e/docs%2Ffaq'))
            .toEqual({kind: 'entry', collection: 'pages', slug: 'docs/faq'});
    });

    it('treats a trailing slash as the same page', function() {
        // A hand-typed trailing slash is not another location.
        expect(parseRoute('#/c/blog/')).toEqual({kind: 'collection', collection: 'blog'});
    });

    it('reads a hash with or without its leading #', function() {
        // location.hash carries the '#'; a hand-written link in a test or a
        // config may not.
        expect(parseRoute('#/c/blog')).toEqual({kind: 'collection', collection: 'blog'});
        expect(parseRoute('/c/blog')).toEqual({kind: 'collection', collection: 'blog'});
    });

    it('treats an absent hash as home', function() {
        // A page opened with no hash at all, which is every first visit.
        for (const hash of ['', '#', '#/']) {
            expect(parseRoute(hash)).toEqual(HOME);
        }
    });

    it('never throws on a hash a person could type', function() {
        /* The address bar is user-editable and a stale bookmark outlives a
           renamed collection, so a bad hash is a navigation rather than an
           error -- including `%zz`, a malformed escape that makes
           decodeURIComponent throw. Propagating that would take down the
           render that is trying to recover from it. */
        for (const hash of ['#/nonsense', '#/c', '#/c/', '#/c/blog/x', '#/c/blog/e',
                            '#/c/blog/e/', '#/c/blog/e/a/b', '#/media/x', '#/%zz']) {
            expect(parseRoute(hash)).toEqual({kind: 'unknown', hash});
        }
    });
});
