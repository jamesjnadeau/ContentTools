/* Which page an entry is published at, and which entry a page is showing.
 *
 * The editing surface runs on the SITE's own pages rather than inside the
 * admin screens, so something has to answer both directions of one
 * question. Going out: the admin list holds a repository path and needs a
 * URL to send an author to. Coming in: a script running on an arbitrary
 * page of the site holds a URL and needs to know whether it is looking at
 * an entry, and which.
 *
 * Both are PURE and both are here, together, for the reason `entryPath`
 * and `slugFromPath` are together: two functions that map between the same
 * two things, written apart, disagree about the edges -- a trailing slash,
 * a base prefix, an `index.html` -- and the way that presents is an author
 * being told the page they are standing on is not an entry.
 *
 * Whether the entry actually EXISTS is not a question for this module. A
 * URL of the right shape maps to a collection and a slug; reading it is
 * what discovers there is no such file, and a 404 from the repository is a
 * better answer than a guess made from a path.
 */
import type {CmsConfig, Collection} from './config.js';
import {expandTokens, findCollection} from './config.js';

/** A collection name and a slug: what identifies one entry. */
export interface PageEntry {
    readonly collection: string;
    readonly slug: string;
}

/**
 * Where an entry of this collection is published, `site.base` included,
 * or null when it is not a page.
 *
 * Null is a real answer and not a failure: a collection of data files has
 * no page, and the shell says so rather than offering an Edit link that
 * goes nowhere.
 */
export function pagePath(
    config: CmsConfig, collection: Collection, slug: string
): string | null {
    const template = collection.kind === 'file'
        ? collection.files.find(f => f.name === slug)?.page ?? null
        : collection.page;
    if (template === null) {
        return null;
    }
    return `${config.site.base}${expandTokens(template, {slug})}`;
}

/**
 * The origin a pull request's preview deployment is served from, or null
 * when this deployment has no `site.preview`.
 */
export function previewOrigin(config: CmsConfig, pull: number): string | null {
    const template = config.site.preview;
    return template === null
        ? null
        : expandTokens(template, {pr: String(pull)});
}

/**
 * Where to send an author to edit this entry.
 *
 * An entry with an open pull request is edited on that request's preview
 * deployment, and an entry without one on the live site. This is not a
 * preference: the live site is built from the base branch, so it shows
 * the published text and knows nothing about the branch the editor would
 * be committing to. An author sent there to work on a draft would edit
 * the old version, and their pull request would come back carrying the
 * reviewer's changes reverted.
 *
 * Falls back to the live page when `pull` is given but the deployment has
 * no preview template configured. That is the wrong page for the reason
 * just given, so the shell warns rather than linking silently -- but
 * refusing outright would take in-page editing away from every site that
 * builds no previews, including a site with no pull requests open yet.
 */
export function editUrl(
    config: CmsConfig, collection: Collection, slug: string, pull: number | null
): string | null {
    const path = pagePath(config, collection, slug);
    if (path === null) {
        return null;
    }
    const origin = pull === null ? null : previewOrigin(config, pull);
    return origin === null ? path : `${origin}${path}`;
}

/** Whether `editUrl` had to fall back to the live page for a draft. */
export function editUrlIsStale(config: CmsConfig, pull: number | null): boolean {
    return pull !== null && config.site.preview === null;
}

/**
 * Which entry this URL is showing, or null.
 *
 * Never throws. It runs on the site's own pages, from a script that is
 * present before anybody has asked to edit anything, so a URL it cannot
 * make sense of has to be an ordinary "not an entry" rather than an
 * uncaught error in a visitor's console.
 */
export function entryForUrl(config: CmsConfig, url: string): PageEntry | null {
    const path = pathOf(url, config.site.base);
    if (path === null) {
        return null;
    }

    for (const collection of config.collections) {
        if (collection.kind === 'file') {
            const file = collection.files.find(
                f => f.page !== null && canonical(f.page) === path);
            if (file) {
                return {collection: collection.name, slug: file.name};
            }
            continue;
        }
        const slug = collection.page === null
            ? null
            : matchPage(collection.page, path);
        if (slug !== null) {
            return {collection: collection.name, slug};
        }
    }
    return null;
}

/**
 * The entry a page DECLARES it is, from `<meta name="cms:entry">`.
 *
 * A site whose URLs a template cannot describe -- a catch-all route, a
 * locale prefix, a paginated archive -- says so in its own markup
 * instead, and this beats `entryForUrl` wherever it is present. The
 * collection is resolved against the config rather than trusted: a
 * `<meta>` naming a collection that is not configured is a typo in a
 * template, and mapping it to nothing is what makes that visible.
 *
 * Takes the `Document` as an argument. `src/cms/` is a leaf that runs
 * with no DOM at all -- a test asserts it imports nothing from the
 * library -- and reading a global here would be the one line that stops
 * being true.
 */
export function declaredEntry(config: CmsConfig, doc: Document): PageEntry | null {
    const content = doc.querySelector('meta[name="cms:entry"]')
        ?.getAttribute('content')?.trim();
    if (!content) {
        return null;
    }

    /* `collection/slug`, split at the FIRST slash only: a slug cannot
       contain one, so anything after the second is part of neither and
       the whole value is malformed. */
    const at = content.indexOf('/');
    const name = at === -1 ? '' : content.slice(0, at);
    const slug = at === -1 ? '' : content.slice(at + 1);
    if (name === '' || slug === '' || slug.includes('/')) {
        return null;
    }
    return findCollection(config, name) === null
        ? null
        : {collection: name, slug};
}

/**
 * The selector for the element holding an entry's rendered body.
 *
 * `data-cms-body` in the page's own markup wins over the config, for the
 * same reason `<meta name="cms:entry">` does: a site that cannot describe
 * itself in a config file can always describe itself in its template.
 */
export function bodySelector(collection: Collection, doc: Document): string | null {
    return doc.querySelector('[data-cms-body]')
        ? '[data-cms-body]'
        : collection.body;
}

// --- path arithmetic ------------------------------------------------------

/**
 * `url`'s path, with the site's base prefix and any `index.html` taken
 * off and the trailing slash settled, or null if it is not decodable.
 *
 * The base is stripped rather than required, because one build can be
 * served at two prefixes and this one is: the test site answers at `/`
 * and at `/ContentTools-test/` on the same host. A page reached by either
 * has to map to the same entry.
 */
function pathOf(url: string, base: string): string | null {
    let path: string;
    try {
        /* The second argument is what lets a bare path be passed as
           readily as a full URL; an absolute `url` ignores it. */
        path = new URL(url, 'http://localhost').pathname;
    } catch {
        return null;
    }

    if (base !== '' && (path === base || path.startsWith(`${base}/`))) {
        path = path.slice(base.length);
    }

    /* A static host serves `/blog/hello/` from `/blog/hello/index.html`,
       and a visitor who followed a link out of a directory listing --
       or a `file://` build somebody opened locally -- is on the second
       spelling of the same page. */
    path = path.replace(/\/index\.html$/, '/');

    /* Percent-decoding, which throws on a malformed escape like `%zz`.
       Answering null instead is what keeps the promise above: a visitor
       who pasted a mangled URL gets an ordinary "not an entry", not a
       stack trace from a script they never asked to run. */
    try {
        path = decodeURIComponent(path);
    } catch {
        return null;
    }

    return canonical(path);
}

/**
 * One spelling of a path: rooted, with no trailing slash.
 *
 * Applied to BOTH sides of every comparison, which is the point. A config
 * written `/blog/{{slug}}` and a visitor standing on `/blog/hello/` are
 * the same page, and a site that links one way while its config is
 * written the other would otherwise never match at all.
 *
 * So the root comes out as the empty string rather than `/`, and that is
 * fine for the same reason: `/`, `` and a base prefix consumed whole all
 * arrive here and all leave as ``, on whichever side of the comparison
 * they were. A special case keeping it `/` was written first and no test
 * could fail without it -- both sides go through this function, so the
 * root only has to be spelled consistently, not recognisably.
 */
function canonical(path: string): string {
    const rooted = path.startsWith('/') ? path : `/${path}`;
    return rooted.replace(/\/+$/, '');
}

/**
 * The slug `path` supplies to `template`, or null if it does not match.
 *
 * `[^/]+` because a slug is one path segment -- `slugFromPath` refuses a
 * repository path with a subfolder in it for the same reason, and the
 * two have to agree or a page would map to an entry the listing will not
 * show.
 */
function matchPage(template: string, path: string): string | null {
    const pattern = canonical(template)
        .split('{{slug}}')
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('([^/]+)');
    const found = new RegExp(`^${pattern}$`).exec(path);
    if (!found) {
        return null;
    }

    /* A template may name `{{slug}}` more than once, and if it does then
       a URL supplying two different values for it matches the shape
       while describing no entry at all. */
    const slugs = found.slice(1);
    return slugs.every(slug => slug === slugs[0]) ? slugs[0] : null;
}
