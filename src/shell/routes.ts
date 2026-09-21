/* Where the shell is, as a hash.
 *
 * Hash-based rather than pushState for one reason: the shell is deployed by
 * copying `app/` and `dist/` onto a static host. A pushState route needs the
 * server to rewrite every unknown path back to index.html, and a host that
 * does not is a 404 on refresh -- the user loses their place and blames the
 * editor. A hash reaches the page whatever the server does.
 *
 * The WHOLE grammar is parsed here, in M5-1, although only `home` and
 * `collection` are rendered yet. Later sub-phases then add a view rather
 * than a route, and the round-trip property below is stated once over all of
 * it instead of growing a case at a time.
 */

export type Route =
    | {kind: 'home'}
    /* Carries the hash it could not read, so the view can say what it did
       not recognise. Falling back to `home` instead would render the
       dashboard for a stale bookmark or a mistyped link -- indistinguishable
       from the root, so the user concludes the entry was deleted. */
    | {kind: 'unknown'; hash: string}
    | {kind: 'collection'; collection: string}
    | {kind: 'entry'; collection: string; slug: string}
    | {kind: 'new'; collection: string}
    | {kind: 'media'}
    | {kind: 'review'};

/** A page opened with no hash at all. */
export const HOME: Route = {kind: 'home'};

/**
 * The hash for a route, including the leading `#`.
 *
 * Both segments are percent-encoded. A collection name is constrained by
 * `parseConfig`, but a slug comes from a filename and may hold a space or a
 * `#` -- and an unencoded `#` truncates the hash at exactly the point where
 * the slug starts, so the entry silently opens as its collection instead.
 */
export function formatRoute(route: Route): string {
    switch (route.kind) {
    case 'collection':
        return `#/c/${encodeURIComponent(route.collection)}`;
    case 'entry':
        return `#/c/${encodeURIComponent(route.collection)}/e/${encodeURIComponent(route.slug)}`;
    case 'new':
        return `#/c/${encodeURIComponent(route.collection)}/new`;
    case 'media':
        return '#/media';
    case 'review':
        return '#/review';
    case 'unknown':
        // Round trips, so that re-parsing what the address bar holds is
        // stable rather than silently redirecting on the second read.
        return route.hash;
    default:
        return '#/';
    }
}

/**
 * The route a hash names, or `HOME` if it names none.
 *
 * Takes the hash itself (`location.hash`) rather than reading it: `window` is
 * not reachable from here -- see eslint.config.mjs -- and a pure function is
 * what lets the round trip be asserted without a browser.
 */
export function parseRoute(hash: string): Route {
    const path = hash.replace(/^#/, '').replace(/^\//, '');
    // '', '#' and '#/' are all a page opened with no hash.
    if (path === '') {
        return HOME;
    }
    const unknown: Route = {kind: 'unknown', hash};

    /* Decoding can throw on a malformed escape (`%zz`), from a hand-edited
       or truncated URL. Letting it propagate would take down the render
       that is trying to recover from it.

       Decode AFTER the split, never before. `%2F` decodes to `/`, so
       decoding the whole path first and then splitting turns an entry named
       `docs/faq` into two segments -- and a file collection's entry name is
       whatever an operator wrote in the config, so that is reachable. The
       entry becomes silently unopenable from its own nav link. */
    let parts: string[];
    try {
        parts = path.split('/').map(decodeURIComponent);
    } catch {
        return unknown;
    }
    // One trailing empty segment, so `#/c/blog/` is the same page as
    // `#/c/blog`. A hand-typed trailing slash is not another location.
    if (parts.length > 1 && parts[parts.length - 1] === '') {
        parts.pop();
    }

    if (parts.length === 1 && parts[0] === 'media') {
        return {kind: 'media'};
    }
    if (parts.length === 1 && parts[0] === 'review') {
        return {kind: 'review'};
    }
    /* Every remaining shape is `c/<collection>/...`, and an empty collection
       name is not one -- `#/c/` would otherwise render a nav item for "".
       Note `#/c/nope` DOES parse: whether that collection exists is a
       question for the config at render time, and "there is no collection
       called nope" is a better message than "unrecognised address". */
    if (parts[0] !== 'c' || !parts[1]) {
        return unknown;
    }
    const collection = parts[1];

    if (parts.length === 2) {
        return {kind: 'collection', collection};
    }
    if (parts.length === 3 && parts[2] === 'new') {
        return {kind: 'new', collection};
    }
    if (parts.length === 4 && parts[2] === 'e' && parts[3]) {
        return {kind: 'entry', collection, slug: parts[3]};
    }
    return unknown;
}
