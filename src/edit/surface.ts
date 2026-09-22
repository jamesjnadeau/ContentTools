/* What a page does once it has decided it wants the editing surface.
 *
 * Everything heavy is behind here rather than in `./index.ts`, which is
 * the module every reader of the site downloads. See that file's header.
 *
 * Three questions about the page, in this order, and each is a state a
 * person can be left in:
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
 *      worth having said twice.
 *
 * Then two about the person: is anybody signed in, and does the entry
 * read? And then the editor goes up over the element from question 3, IN
 * PLACE. Nothing on the page moves -- see `EntrySession`'s `region` and
 * the element's `regionElements` for why that is worth the plumbing it
 * costs.
 */

import {loadConfig, findCollection, ConfigError} from '../cms/config.js';
import type {CmsConfig} from '../cms/config.js';
import {bodySelector, declaredEntry, entryForUrl} from '../cms/preview.js';
import type {PageEntry} from '../cms/preview.js';
import {CmsRepo} from '../cms/repo.js';
import {MediaStore} from '../cms/media.js';
import {adapterFor} from '../auth/adapter.js';
import {MarkdownDocument} from '../markdown/document.js';
import {EntrySession} from '../entry/session.js';
/* The CLASS module, never `../element/index.js` -- that is a build ENTRY
   of the same Vite invocation, and no other module may import it. Same
   rule the shell follows, same test enforcing it. */
import {ContentToolsEditor, TAG_NAME as EDITOR_TAG}
    from '../element/content-tools-editor.js';
import {buildBar} from './chrome.js';
import type {Bar, BarState, Located} from './chrome.js';
import {PageEdit} from './editing.js';
import {formState} from '../entry/fields.js';

/**
 * Where the config lives, when the page does not say.
 *
 * Rooted, so it is the same answer from `/blog/hello/` as from `/`. A
 * site served under a prefix says so with the meta tag below; it cannot
 * be read off `site.base`, because that is in the file we are trying to
 * find.
 */
export const DEFAULT_CONFIG_URL = '/cms-config.yml';

/** `<meta name="cms:entry">`, the page's own answer. */
export const CONFIG_META = 'cms:config';

/** Marks the stylesheet link, so a second `open()` does not add another. */
export const CONTENT_STYLES_MARK = 'ct-edit-content-styles';

export interface OpenOptions {
    /** Defaults to the real one. A test hands over its own. */
    readonly fetch?: typeof globalThis.fetch;
    /**
     * Where `content-tools-content.css` is, so the editing affordances
     * reach the site's own document.
     *
     * The content rules -- `.ce-element`, the drop indicators, the drag
     * and resize cursors -- style the CONTENT, which in Mode A stays in
     * the light DOM. They cannot be adopted into the bar's shadow root
     * for two reasons: they would not reach the content, and the sheet
     * carries `url()` references to the drop-indicator SVGs that only
     * resolve relative to a real stylesheet URL.
     *
     * So it is a `<link>`, and the href comes from `./index.ts`, which is
     * the file whose own location the site knows -- the surface lives in
     * a hashed chunk and has no idea where `dist/` is.
     */
    readonly contentStyles?: string;
}

/** An open surface: the bar, and the open entry if one went up. */
export interface Surface {
    readonly bar: Bar;
    /** What Submit and the form act on, or null when no editor went up. */
    readonly editing: PageEdit | null;
    readonly session: EntrySession | null;
}

/**
 * Put the editing surface on this page.
 *
 * Never throws. A page that a script broke is a page whose site looks
 * broken, and this script runs on every page of the site -- so every
 * failure lands in the bar, where the person who can fix it will see it,
 * and nowhere else.
 */
export async function open(
        where: Window, options: OpenOptions = {}): Promise<Surface> {
    const doc = where.document;
    /* The bar is built BEFORE there is anything for its two controls to
       act on, and it has to be: it is also what says why there is not
       -- a config that will not parse, a page that is not an entry. So
       the handlers reach through a holder, filled in below once there
       is something to fill it with, and until then they do nothing.
       That is not hypothetical for Details: it is built with the rest
       of the bar, and `hidden` does not stop a click reaching a button.

       Submit's `?.` is the same guard for a press that cannot arrive
       -- `update` disables the button in every state but `editing`,
       and a disabled button fires no click. It is the second spelling
       of one rule rather than a live branch, kept for the case that
       makes it live: a Submit that is ever enabled while this holder
       is empty, which is what a `disabled` line lost in a refactor
       looks like. */
    const live: {editing: PageEdit | null} = {editing: null};
    const bar = buildBar(doc, {
        submit: () => live.editing?.submit(),
        showFields: open => live.editing?.show(open)
    });
    doc.body.appendChild(bar.node);

    let located: BarState;
    try {
        located = await resolve(where, options);
    } catch (error) {
        bar.update(failure(error));
        return {bar, editing: null, session: null};
    }

    bar.update(located);
    if (located.kind !== 'ready') {
        return {bar, editing: null, session: null};
    }

    /* The three fields every state from here on shares, lifted out of the
       `ready` state so the config does not ride along into states that
       have no use for it. */
    const seen: Located = {
        entry: located.entry, selector: located.selector, body: located.body
    };

    try {
        const editing = await start(where, bar, located.config, seen, options);
        /* Filled BEFORE the bar is told it is editing, so there is no
           moment where the controls are live and the holder is empty.
           `start` deliberately does not render for this reason: it
           mounts, and the two lines that make the mount reachable are
           here, together, where the order is visible. */
        live.editing = editing;
        editing?.render();
        return {bar, editing, session: editing ? editing.session : null};
    } catch (error) {
        /* The element is still named while the bar says what went wrong.
           A read that failed did not un-find the body, and somebody
           looking at a 404 still wants to know the selector was right. */
        bar.update({kind: 'failed', ...seen, hint: said(error)});
        return {bar, editing: null, session: null};
    }
}

/** What the bar should say about the PAGE, once everything is read. */
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

/**
 * Open the entry and put an editor over its body.
 *
 * What this proves is the part that has to be right first -- that the
 * bytes on the branch, rendered by us, land inside the site's own
 * element with the site's own template and stylesheet around them.
 */
async function start(
        where: Window, bar: Bar, config: CmsConfig, seen: Located,
        options: OpenOptions): Promise<PageEdit | null> {
    /* Only ever READ. The in-page script must not offer to sign anybody
       in: a credential field that appears on a published blog post is
       indistinguishable from the thing every phishing guide warns about,
       and the admin screens are one link away. */
    const token = adapterFor(config).currentToken();
    if (token === null) {
        bar.update({kind: 'signed-out', ...seen});
        return null;
    }

    bar.update({kind: 'loading', ...seen});

    const repo = new CmsRepo({config, token, fetch: options.fetch});
    /* The media folder in the SAME round trip, for the reason the shell
       does it: the names it already holds are what an upload is staged
       against, and a collision has to be settled when the image is
       inserted rather than at commit time -- the URL the editor shows
       has to be the URL that ends up in the file. */
    const [entry, folder] = await Promise.all([
        repo.readEntry(seen.entry.collection, seen.entry.slug),
        repo.github.listDirectory(config.media.folder, repo.base)
    ]);

    /* After the awaits and before anything is moved, so a stylesheet
       that 404s from a badly-deployed `dist/` costs a request rather
       than the editor. */
    linkContentStyles(where.document, options.contentStyles);
    defineEditor();

    const doc = MarkdownDocument.parse(entry.content ?? '');
    const session = new EntrySession({
        document: where.document,
        entry,
        doc,
        store: new MediaStore({config, taken: folder.map(file => file.name)}),
        /* The BAR's form, asked at the moment of the comparison. It
           answers null for a collection with no fields and for a block
           the form refused, and null is exactly how a session is told
           there is none -- it then reaches `update` with no options
           object at all, which is what preserves the block byte for
           byte. */
        values: () => bar.values(),
        /* THE site's own element, edited where it stands. */
        region: seen.body
    });

    /* The editor element itself holds nothing and goes at the end of
       <body>: its regions are named rather than matched, so it needs no
       children, and an empty `position: relative` block is the smallest
       footprint a custom element can have on a page it does not own. */
    where.document.body.appendChild(session.editor);
    session.start();

    /* Built and NOT rendered -- see the call site. */
    const editing = new PageEdit({
        bar,
        session,
        repo,
        seen,
        /* Non-null for the reason `located` gives one line at a time:
           an entry in hand names a collection this config holds,
           because both mappings resolve the name against it. */
        fields: formState(findCollection(config, seen.entry.collection)!,
                          seen.entry.slug, doc)
    });
    return editing;
}

/**
 * Register `<content-tools-editor>`, if nothing else has.
 *
 * `EntrySession` creates one, and on this path nothing else would ever
 * have registered it: `../element/index.js` is the element's own build
 * entry and is not importable from here, so the tag arrives through the
 * class module and a `define` of our own -- exactly as the shell does
 * it. An unregistered tag is not an error anywhere, which is what makes
 * this worth a function rather than an assumption: `createElement`
 * answers with an inert unknown element, `regionElements` becomes a
 * plain property nobody reads, `start()` is not a method, and the page
 * gets a bar that says it is editing over content that cannot be.
 *
 * Guarded on `get` so a page that also loaded `./element` or `./shell`
 * is unaffected and whichever registered it first wins, rather than
 * throwing `NotSupportedError` out of the middle of a mount.
 */
function defineEditor(): void {
    if (typeof customElements === 'undefined' || customElements.get(EDITOR_TAG)) {
        return;
    }
    customElements.define(EDITOR_TAG, ContentToolsEditor);
}

/**
 * Put the content stylesheet in the page, once.
 *
 * Idempotent by marker rather than by a module-level flag, because the
 * thing that must not happen twice is a LINK IN THIS DOCUMENT -- and a
 * flag would also suppress it in a second document the same module is
 * running against.
 */
function linkContentStyles(doc: Document, href: string | undefined): void {
    if (!href || doc.querySelector(`link[data-content-tools="${CONTENT_STYLES_MARK}"]`)) {
        return;
    }
    const link = doc.createElement('link');
    link.setAttribute('data-content-tools', CONTENT_STYLES_MARK);
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.appendChild(link);
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
    return {kind: 'ready', config, entry, selector, body};
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
 * A failure before the page was even located.
 *
 * `ConfigError.path` verbatim, because a typo in a hand-edited YAML file
 * is the single most likely thing to go wrong here and
 * `collections[0].body` is an answer where "undefined is not a
 * function" is not.
 */
function failure(error: unknown): BarState {
    return {kind: 'broken', hint: said(error)};
}

/** An error as the best sentence we have for it. */
function said(error: unknown): string {
    if (error instanceof ConfigError && error.path !== '') {
        return `${error.path}: ${error.message}`;
    }
    return error instanceof Error ? error.message : String(error);
}

/** The config URL this page names, or the default. */
function configUrl(doc: Document): string {
    const said = doc.querySelector(`meta[name="${CONFIG_META}"]`)
        ?.getAttribute('content')?.trim();
    return said ? said : DEFAULT_CONFIG_URL;
}
