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
 * PLACE. Nothing on the page moves -- see `EditingSession`'s `region` and
 * the element's `regionElements` for why that is worth the plumbing it
 * costs.
 *
 * Two kinds of page are not an entry and are not nothing either, and
 * question 2 answers for them first. A STARTER page offers a link and
 * that is all it does. The NEW page is where the link leads: the site's
 * own template with no entry behind it, where the bar asks what the
 * entry is called and the editor then goes up over the same element by
 * the same lines -- `mount` -- that put it over an entry that exists.
 */

import {
    loadConfig, findCollection, fieldsFor, expandSlug, ConfigError
} from '../cms/config.js';
import type {CmsConfig, FolderCollection} from '../cms/config.js';
import {
    bodySelector, declaredEntry, declaredNewPage, declaredStarters,
    entryForUrl, newPageForUrl, newPagePath, pagePath, startersForUrl
} from '../cms/preview.js';
import type {PageEntry} from '../cms/preview.js';
import {CmsRepo} from '../cms/repo.js';
import type {Entry} from '../cms/repo.js';
import {MediaStore} from '../cms/media.js';
import {adapterFor} from '../auth/adapter.js';
import {withEditFlag} from '../auth/handoff.js';
import {MarkdownDocument} from '../markdown/document.js';
import {EditingSession} from './session.js';
/* The CLASS module, never `../element/index.js` -- that is a build ENTRY
   of the same Vite invocation, and no other module may import it. Same
   rule the shell follows, same test enforcing it. */
import {ContentToolsEditor, TAG_NAME as EDITOR_TAG}
    from '../element/content-tools-editor.js';
import {buildBar} from './chrome.js';
import type {Bar, BarState, Located, Naming, NewPage} from './chrome.js';
import {PageEdit} from './editing.js';
import {extend} from './extension.js';
import type {EditExtension} from './extension.js';
import {formState} from '../entry/fields.js';
import {blankDocument} from '../entry/create.js';

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
    /**
     * The site's own tools, from `window.contentToolsEdit`. Read by
     * `./index.ts`, which is where the ambient globals enter; see
     * `./extension.ts`.
     */
    readonly extension?: EditExtension | null;
}

/**
 * An open surface: the bar, and the open entry if one went up.
 *
 * `editing` and `session` are LIVE, not a record of how `open` left
 * things. On the new page there is no entry when `open` returns and
 * there is one a moment after somebody names it, so both read null and
 * then do not -- and a caller that copied them out at the start is
 * holding the answer from before the thing it wanted to know about.
 */
export interface Surface {
    readonly bar: Bar;
    /** What Submit and the form act on, or null while no editor is up. */
    readonly editing: PageEdit | null;
    readonly session: EditingSession | null;
}

/**
 * What the bar's three handlers reach through. See `open`.
 *
 * `begin` is the behaviour itself rather than a flag beside it, so that
 * "nothing to begin" has one spelling: the slot is empty. It is empty on
 * every page but the new one, empty while a name is being checked, and
 * empty for good once an entry is mounted.
 */
interface Live {
    editing: PageEdit | null;
    begin: ((title: string) => void) | null;
}

/** An entry as it was read, and the document its editor starts from. */
interface Opened {
    /** `content` is null for an entry that was only just named. */
    readonly entry: Entry;
    readonly doc: MarkdownDocument;
    /** The media folder's listing, read in the same round trip. */
    readonly folder: readonly {readonly name: string}[];
}

/* The three things the new page says no to a name with, and the one it
   says to somebody it cannot let write at all. Sentences an author
   reads, so they are written out whole here rather than assembled at
   the call site. */
const SIGN_IN_FIRST = 'Sign in through the admin screens in this tab, '
    + 'then come back to write it.';
const OWN_ADDRESS = 'That name would be published at this page\'s own '
    + 'address. Choose another.';
const published = (path: string): string =>
    `${path} is already published. Choose another name.`;
const inReview = (path: string, pull: number): string =>
    `${path} is already waiting in pull request #${pull}. Choose another name.`;

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
    /* The bar is built BEFORE there is anything for its three controls
       to act on, and it has to be: it is also what says why there is
       not -- a config that will not parse, a page that is not an entry.
       So the handlers reach through a holder, filled in below once
       there is something to fill it with, and until then they do
       nothing. That is not hypothetical for Details: it is built with
       the rest of the bar, and `hidden` does not stop a click reaching
       a button.

       Submit's `?.` is the same guard for a press that cannot arrive
       -- `update` disables the button in every state but `editing`,
       and a disabled button fires no click. It is the second spelling
       of one rule rather than a live branch, kept for the case that
       makes it live: a Submit that is ever enabled while this holder
       is empty, which is what a `disabled` line lost in a refactor
       looks like.

       Start writing's `?.` is that guard again, and it carries more:
       the slot is emptied for as long as a name is being checked and
       is never refilled once an entry is mounted, so a second press
       has nothing to call. The bar disables the button over the same
       stretch; what this one is for is the day it does not, when the
       cost would be two editors over one element. See `invite`. */
    const live: Live = {editing: null, begin: null};
    const bar = buildBar(doc, {
        submit: () => live.editing?.submit(),
        showFields: open => live.editing?.show(open),
        begin: title => live.begin?.(title)
    });
    doc.body.appendChild(bar.node);

    /* Read through the holder for the reason `Surface` gives, and one
       object for every way out of here, so no return below can hand
       back a different idea of what is open. */
    const surface: Surface = {
        bar,
        get editing() { return live.editing; },
        get session() { return live.editing?.session ?? null; }
    };

    let located: BarState;
    try {
        located = await resolve(where, options);
    } catch (error) {
        bar.update(failure(error));
        return surface;
    }

    bar.update(located);
    if (located.kind === 'new-page') {
        const {config, collection, selector, body} = located;
        /* Guarded like `start` below, and for its first lines: reading
           the token is reading storage, which a browser may refuse. */
        try {
            invite(where, bar, config, {collection, selector, body}, live, options);
        } catch (error) {
            bar.update({kind: 'new-blocked', collection, hint: said(error)});
        }
        return surface;
    }
    if (located.kind !== 'ready') {
        return surface;
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
    } catch (error) {
        /* The element is still named while the bar says what went wrong.
           A read that failed did not un-find the body, and somebody
           looking at a 404 still wants to know the selector was right. */
        bar.update({kind: 'failed', ...seen, hint: said(error)});
    }
    return surface;
}

/** What the bar should say about the PAGE, once everything is read. */
export async function resolve(
        where: Window, options: OpenOptions = {}): Promise<BarState> {
    const doc = where.document;
    const href = where.location.href;
    const config = await loadConfig(configUrl(doc), {fetch: options.fetch});

    /* The markup wins over the URL, which is the rule `declaredEntry`
       exists for: a site whose page URLs the config cannot describe can
       always say what a page is in its own template. And it wins over
       everything below too -- a page that says it is an entry is edited,
       whatever its address is also named as. */
    const declared = declaredEntry(config, doc);
    if (declared) {
        return located(config, declared, doc);
    }

    /* The new page and the starters BEFORE any URL is read as an
       entry's, and the order is the point. `entryForUrl` already steps
       round the addresses the CONFIG names for either; a page that only
       its own markup names is one it cannot know about, and under a
       collection's prefix it fits `/blog/{{slug}}/` perfectly well. An
       author sent there to start a post must not be told the post
       called `write` could not be read. */
    const fresh = declaredNewPage(config, doc) ?? newPageForUrl(config, href);
    if (fresh) {
        return writable(config, fresh, doc);
    }

    /* The markup's list INSTEAD of the URL's, not added to it: a page
       that says which collections it starts has said all of them. */
    const named = declaredStarters(config, doc);
    const starters = named.length > 0 ? named : startersForUrl(config, href);
    if (starters.length > 0) {
        return {
            kind: 'starter',
            links: starters.map(collection => ({
                label: collection.label,
                /* Non-null: both lists keep only collections that have
                   a new page, because a link is all a starter is. The
                   flag so that a middle click or a copied address opens
                   a page that puts its bar up and says how to sign in,
                   rather than one where nothing seems to have loaded. */
                href: withEditFlag(newPagePath(config, collection)!)
            }))
        };
    }

    const entry = entryForUrl(config, href);
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

    return mount(where, bar, repo, seen, {
        entry, folder, doc: MarkdownDocument.parse(entry.content ?? '')
    }, options);
}

/**
 * Ask what the new entry is called, and put it on the page once it has
 * a name nothing else holds.
 *
 * Everything a name can be refused for is settled HERE, before the
 * editor goes up, because afterwards the name is the one thing about
 * the entry that cannot be changed: it is the filename, and the
 * filename is the URL. `saveEntry` asks the same question again at
 * Submit, which is the only place the race between two authors who were
 * both told yes can be settled -- but an author told no at that point
 * has already written the post.
 */
function invite(
        where: Window, bar: Bar, config: CmsConfig, page: NewPage,
        live: Live, options: OpenOptions): void {
    const {collection} = page;

    /* Read, never asked for -- see `start`. And said BEFORE a name is
       typed rather than at Submit: somebody who cannot save should not
       be invited to write. */
    const token = adapterFor(config).currentToken();
    if (token === null) {
        bar.update({kind: 'new-blocked', collection, hint: SIGN_IN_FIRST});
        return;
    }
    const repo = new CmsRepo({config, token, fetch: options.fetch});

    function ask(naming: Naming): void {
        bar.update({kind: 'naming', ...page, ...naming});
    }

    /* The two lines together, so the button and what it calls come back
       in the same breath: a bar that looks ready over an empty slot is
       a press that silently does nothing. */
    function refuse(refusal: string): void {
        live.begin = begin;
        ask({busy: false, refusal});
    }

    function begin(title: string): void {
        /* Emptied first. From here until `refuse` there is a name in
           the air, and after a mount there is an entry on the page;
           neither is a moment to begin another. */
        live.begin = null;
        void write(title);
    }

    /* Never rejects, which is what the `void` above relies on: this
       starts in a submit handler on somebody's published page, and
       every way it can fail is a sentence under the name field. */
    async function write(title: string): Promise<void> {
        let editing: PageEdit | null = null;
        try {
            const slug = expandSlug(collection, title, new Date());

            /* Known from the config alone, so nothing is read to say
               it. An entry published at this page's address would
               replace this page, and the site would have nowhere left
               to start the next one. Asked of the same mapping the
               page was recognised by, not by comparing the two spellings
               the config happens to use: `/blog/{{slug}}` and
               `/blog/new/` are one page. Guarded on there BEING an
               address: a collection with no `page` has none, and
               nothing is not the new page. */
            const at = pagePath(config, collection, slug);
            if (at !== null && newPageForUrl(config, at) !== null) {
                refuse(OWN_ADDRESS);
                return;
            }

            /* The last refusal goes now, not when the read lands: it
               was about another name, or about a failure that may have
               stopped being true. */
            ask({busy: true, refusal: null});

            const [entry, folder] = await Promise.all([
                repo.readEntry(collection.name, slug),
                repo.github.listDirectory(config.media.folder, repo.base)
            ]);

            /* The pull request first. An entry in review is READ from
               its branch, so it has content too -- and telling its
               second author it is published sends them to look for a
               page the site does not have. */
            if (entry.pull) {
                refuse(inReview(entry.path, entry.pull.number));
                return;
            }
            if (entry.content !== null) {
                refuse(published(entry.path));
                return;
            }

            editing = await mount(where, bar, repo, {
                entry: {collection: collection.name, slug},
                selector: page.selector,
                body: page.body
            }, {
                entry, folder,
                /* The name goes into the file as its title where the
                   collection has an obvious place for one, so it is
                   typed once. */
                doc: blankDocument(fieldsFor(collection, slug), title)
            }, options);
            live.editing = editing;
            /* Open, here and nowhere else. On an entry's own page the
               form stays out of the way of the words; on this one there
               are no words, and the fields the collection requires are
               empty. */
            editing.show(true);
            /* And started, with no pencil to press. The pencil exists
               so a reader's page is not replaced until somebody asks,
               and Start writing was the asking. */
            switchOn(editing.session.editor);
        } catch (error) {
            /* Whatever got as far as the page comes back off it, so the
               next name does not mount beside the remains of this one. */
            editing?.session.close();
            live.editing = null;
            refuse(said(error));
        }
    }

    live.begin = begin;
    ask({busy: false, refusal: null});
}

/**
 * Start the editor the way a press of its pencil does.
 *
 * `start()` alone is half of that. The press is two lines in the
 * library -- start the editor, then turn the switch to its tick and
 * cross -- and the element's method is only the first, because the
 * shell that it was written for has no switch. Here there is one, and
 * left showing the pencil it is worse than untidy: the cross's handler
 * asks the SWITCH whether anything is being edited before it reverts,
 * so an author could not back out of the entry they had just named.
 *
 * `start()` first, and through the element, so an editor that cannot
 * start says so by throwing on this stack; the switch is only told what
 * has by then happened.
 */
function switchOn(editor: ContentToolsEditor): void {
    editor.start();
    editor.editorApp?.ignition()?.state('editing');
}

/**
 * Put an editor over the body, for an entry that has been read.
 *
 * ONE function for an entry that exists and an entry that was named a
 * moment ago, which differ only in what was read and what the editor
 * starts from. Two copies of this would be two lists of what a mount
 * consists of, and the one a new entry used would be the one nobody
 * remembered when the list grew.
 *
 * Mounts and does not render: see the call sites, which each say what
 * the bar should show once this returns.
 */
async function mount(
        where: Window, bar: Bar, repo: CmsRepo, seen: Located,
        opened: Opened, options: OpenOptions): Promise<PageEdit> {
    const {config} = repo;
    const {entry, doc, folder} = opened;

    /* After the read and before anything is moved, so a stylesheet
       that 404s from a badly-deployed `dist/` costs a request rather
       than the editor. */
    linkContentStyles(where.document, options.contentStyles);
    defineEditor();

    const session = new EditingSession({
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
       footprint a custom element can have on a page it does not own.

       And it is NOT started. Connecting it mounts the ignition switch
       and nothing else -- no toolbox, no inspector, and the site's own
       markup still in the page. Editing begins when somebody presses
       the switch, however they arrived: pressing Edit under /admin says
       which page to open, not that the reader's view of it should be
       replaced before they have looked at it. */
    /* Before the editor is connected, because connecting it boots it,
       and `init()` is where the profile and the tool list are read. */
    await extend(session.editor, options.extension);
    where.document.body.appendChild(session.editor);

    /* Built and NOT rendered -- see the call sites. */
    return new PageEdit({
        bar,
        session,
        repo,
        seen,
        /* Non-null for the reason `located` gives one line at a time:
           an entry in hand names a collection this config holds,
           because every mapping resolves the name against it. */
        fields: formState(findCollection(config, seen.entry.collection)!,
                          seen.entry.slug, doc)
    });
}

/**
 * Register `<content-tools-editor>`, if nothing else has.
 *
 * `EditingSession` creates one, and on this path nothing else would ever
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

/**
 * The state for the NEW page: somewhere to write was found, or was not.
 *
 * `located` again, for a page with no entry yet, and found out at the
 * same moment for the same reason: the editor replaces this element's
 * children, so a template that lacks it is a deployment's mistake to
 * learn of from the bar, not an author's to discover by naming a post.
 */
function writable(
        config: CmsConfig, collection: FolderCollection, doc: Document): BarState {
    const selector = bodySelector(collection, doc);
    /* Reachable the way `located`'s is: a collection with no `page` and
       so no `body`, declared the new page by the markup alone. */
    if (selector === null) {
        return {
            kind: 'new-blocked', collection,
            hint: `\`${collection.name}\` has no \`body\` selector, so there `
                + 'is nowhere on this page to write a new entry.'
        };
    }

    const body = doc.querySelector(selector);
    if (!(body instanceof HTMLElement)) {
        return {
            kind: 'new-blocked', collection,
            hint: `Nothing on this page matches \`${selector}\`.`
        };
    }
    return {kind: 'new-page', config, collection, selector, body};
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
