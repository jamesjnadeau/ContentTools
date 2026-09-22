/* What a page does once it has decided it wants the editing surface.
 *
 * Everything heavy is behind here rather than in `./index.ts`, which is
 * the module every reader of the site downloads. See that file's header.
 *
 * Three questions, in this order, and each is a state a person can be
 * left in:
 *
 *   1. Is there a config, and does it parse? A deployment problem, and
 *      the operator's likeliest failure -- so it gets the best message
 *      there is, which is `ConfigError.path` said verbatim.
 *   2. Is this page an entry? Most pages of most sites are not, and the
 *      honest answer there is a small bar that says so rather than
 *      silence, because somebody who arrived with `?cms-edit` on the URL
 *      asked a question and deserves an answer.
 *   3. Is the body where the config says it is? This is the one nobody
 *      expects and the one that costs most: the editor REPLACES that
 *      element's children, so a `body:` selector pointing at the page
 *      wrapper replaces the site's whole layout with a post. Finding out
 *      at deploy time, from a bar that names the element it found, is
 *      worth the whole of this sub-phase.
 */

import {loadConfig, findCollection, ConfigError} from '../cms/config.js';
import type {CmsConfig} from '../cms/config.js';
import {bodySelector, declaredEntry, entryForUrl} from '../cms/preview.js';
import type {PageEntry} from '../cms/preview.js';
import {buildBar} from './chrome.js';
import type {Bar, BarState} from './chrome.js';

/**
 * Where the config lives, when the page does not say.
 *
 * Rooted, so it is the same answer from `/blog/hello/` as from `/`. A
 * site served under a prefix says so with the meta tag below; it cannot
 * be read off `site.base`, because that is in the file we are trying to
 * find.
 */
export const DEFAULT_CONFIG_URL = '/cms-config.yml';

/** `<meta name="cms:config" content="...">`, the page's own answer. */
export const CONFIG_META = 'cms:config';

export interface OpenOptions {
    /** Defaults to the real one. A test hands over its own. */
    readonly fetch?: typeof globalThis.fetch;
}

/**
 * Put the editing surface on this page.
 *
 * Never throws. A page that a script broke is a page whose site looks
 * broken, and this script runs on every page of the site -- so every
 * failure lands in the bar, where the person who can fix it will see it,
 * and nowhere else.
 */
export async function open(where: Window, options: OpenOptions = {}): Promise<Bar> {
    const doc = where.document;
    const bar = buildBar(doc);
    doc.body.appendChild(bar.node);

    try {
        bar.update(await resolve(where, options));
    } catch (error) {
        bar.update(failure(error));
    }
    return bar;
}

/** What the bar should say, once everything it needs has been read. */
export async function resolve(
        where: Window, options: OpenOptions = {}): Promise<BarState> {
    const doc = where.document;
    const config = await loadConfig(configUrl(doc), {fetch: options.fetch});

    /* The markup wins over the URL, which is the rule `declaredEntry`
       exists for: a site whose page URLs the config cannot describe can
       always say what a page is in its own template. */
    const entry = declaredEntry(config, doc)
        ?? entryForUrl(config, where.location.href);
    if (!entry) {
        return {kind: 'not-an-entry', hint: unmapped(config)};
    }

    return located(config, entry, doc);
}

/** The state for a page that IS an entry: found its body, or did not. */
function located(config: CmsConfig, entry: PageEntry, doc: Document): BarState {
    /* Non-null: both `declaredEntry` and `entryForUrl` resolve the name
       against this same config and answer null for one it does not
       hold, so an entry in hand names a collection in hand. */
    const collection = findCollection(config, entry.collection)!;
    const selector = bodySelector(collection, doc);
    /* Reachable by exactly one arrangement, and it is worth saying which:
       `parseConfig` refuses a `page` template with no `body` beside it,
       so a collection a URL can map to always has a selector. What is
       left is a collection with no `page` at all, declaring itself in
       the page's markup -- which is the case `declaredEntry` exists for,
       and so is not a corner. */
    if (selector === null) {
        return {
            kind: 'no-body', entry,
            hint: `\`${entry.collection}\` has no \`body\` selector, so nothing `
                + 'on this page can be edited in place.'
        };
    }

    const body = doc.querySelector(selector);
    if (!(body instanceof HTMLElement)) {
        return {
            kind: 'no-body', entry,
            hint: `Nothing on this page matches \`${selector}\`.`
        };
    }
    return {kind: 'ready', entry, selector, body};
}

/** Why this page maps to nothing, in terms the operator can act on. */
function unmapped(config: CmsConfig): string {
    /* Both collection shapes, because a site can be entirely file
       collections -- and there the `page` lives on each file rather than
       on the collection, so reading only `collection.page` would tell a
       site that names every one of its pages that it has named none. */
    const mapped = config.collections.some(collection => collection.kind === 'file'
        ? collection.files.some(file => file.page !== null)
        : collection.page !== null);
    return mapped
        ? 'This page is not one of the entries this site can edit.'
        : 'No collection says where its entries are published, so no page '
            + 'maps to an entry.';
}

/**
 * A failure, said in the operator's own terms where we have them.
 *
 * `ConfigError.path` verbatim, because a typo in a hand-edited YAML file
 * is the single most likely thing to go wrong here and
 * `collections[0].body` is an answer where "undefined is not a
 * function" is not.
 */
function failure(error: unknown): BarState {
    return {
        kind: 'broken',
        hint: error instanceof ConfigError && error.path !== ''
            ? `${error.path}: ${error.message}`
            : error instanceof Error ? error.message : String(error)
    };
}

/** The config URL this page names, or the default. */
function configUrl(doc: Document): string {
    const said = doc.querySelector(`meta[name="${CONFIG_META}"]`)
        ?.getAttribute('content')?.trim();
    return said ? said : DEFAULT_CONFIG_URL;
}
