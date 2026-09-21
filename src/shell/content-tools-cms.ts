/* `<content-tools-cms>` -- the shell, and the thing a site's authors open.
 *
 * The editor element is the editing surface and `../cms` is the repository;
 * neither knows the other exists. This is what joins them: it loads the
 * config for the one repository this deployment serves, signs the user in,
 * lists what they can edit, and turns a save into a pull request.
 *
 * MODE A, ONE LEVEL UP. The shell's own chrome lives in its shadow root,
 * and the `<content-tools-editor>` is appended as a LIGHT-DOM child of this
 * host, rendered through `<slot name="editor">`. That is not a style
 * preference, it is the only arrangement that works:
 *
 *   `ShadowRootContext.getRange()` is a three-branch chain, and in Mode A
 *   the editable content is in the light DOM -- so Chromium's
 *   `ShadowRoot.getSelection()` and `getComposedRanges({shadowRoots:[...]})`
 *   both decline on containment and it falls through to
 *   `document.getSelection()`, whose range it returns EVEN THOUGH the nodes
 *   are outside the editor's own root, because in Mode A that is the
 *   content. Nest the editor inside a second shadow root and
 *   `document.getSelection()` retargets in Chromium and WebKit: the range
 *   comes back pointing at this host, the caret is in the wrong place, and
 *   nothing throws. The document-level `content.css` would not reach the
 *   content either.
 *
 * Slotting does not move nodes -- the region stays in the document tree --
 * so both problems simply do not arise. `test/browser/shell/selection.spec.js`
 * asserts on the resolved range rather than on where the element sits, so a
 * later refactor that nests it under some OTHER shadow root fails too.
 *
 * STATE IS A FIELD, NOT A STORE. One owner and one subscriber, so a
 * subscribe/unsubscribe Set would be machinery whose unsubscribe path no
 * test could kill except one written to kill it. `setState` assigns and
 * renders; `_nav` guards the ordering; `_guard` catches.
 */

import {fieldsFor, findCollection, loadConfig, ConfigError} from '../cms/config.js';
import type {CmsConfig, Collection} from '../cms/config.js';
import {CmsRepo} from '../cms/repo.js';
import type {Entry, MediaFile} from '../cms/repo.js';
import {MediaStore, mediaUploader} from '../cms/media.js';
import {PatAuthAdapter} from '../auth/pat.js';
import type {AuthAdapter} from '../auth/types.js';
/* The CLASS module, never `../element/index.js`, and never
   `../markdown/index.js`. Both of those are build ENTRIES of the same Vite
   invocation as this one, and Rollup turns an entry another entry imports
   into a facade whose body it hoists into a shared chunk -- taking
   `customElements.define` out of the file `package.json` names in
   `sideEffects`. test/browser/shell/imports.spec.js fails on either.

   Static, not `await import()`. The tag has to be registered before the
   shell creates one, and a lazy chunk that 404s from a static host fails
   nowhere until somebody opens an entry -- by which time the person who
   deployed it has gone. The budget rise is the price. */
import {ContentToolsEditor, TAG_NAME as EDITOR_TAG}
    from '../element/content-tools-editor.js';
import {MarkdownDocument} from '../markdown/document.js';

import {mergeEntries} from './merge.js';
import type {ListedEntry} from './merge.js';
import {cannotPush, describeError, NOTHING_TO_SAVE} from './errors.js';
import type {Described} from './errors.js';
import {formatRoute, HOME, parseRoute} from './routes.js';
import type {Route} from './routes.js';
import {shellStyleSheet} from './styles.js';
import {buildFrame, EDITOR_SLOT} from './views/frame.js';
import type {Frame} from './views/frame.js';
import {buildGate} from './views/gate.js';
import type {Gate} from './views/gate.js';
import {buildStatus} from './views/status.js';
import type {Status} from './views/status.js';
import type {EntryState} from './views/entry.js';
import type {FieldsState} from './views/fields.js';
import {frontmatterChanged, isMergeable, mergeFrontmatter} from './frontmatter.js';
import {DEFAULT_WIDGETS} from './widgets/index.js';
import type {WidgetFactory} from './widgets/index.js';

export {EDITOR_SLOT, EDITOR_TAG, ContentToolsEditor};

/**
 * What a frontmatter block has to be before a form may write over it.
 *
 * A block whose YAML did not parse is preserved verbatim and the form is
 * refused, because merging into content nobody has read replaces a
 * person's broken-but-recoverable frontmatter with whatever the form
 * happened to hold. A block that parsed to something that is not a
 * mapping -- a bare list, a scalar -- is the same answer for the same
 * reason.
 */
const NOT_A_MAPPING =
    'This entry\u2019s frontmatter is not a set of keys, so it cannot be edited here. '
    + 'It will be saved exactly as it is.';
const UNREADABLE =
    'This entry\u2019s frontmatter could not be read as YAML, so it cannot be edited '
    + 'here. It will be saved exactly as it is, for you to fix in the repository.';

/** The registered tag name. Declared here, re-exported by ./index.ts. */
export const TAG_NAME = 'content-tools-cms';

/** Attribute naming the config file this deployment is given. */
const CONFIG_ATTRIBUTE = 'config';

/**
 * The one region an entry has, and the key its HTML arrives under.
 *
 * One region because a markdown file is one body. The frontmatter is a
 * form beside the editor from M5-4, not a second editable region: a YAML
 * block edited as prose is a YAML block somebody will break.
 */
const REGION = 'body';

/** The markup the editor is handed, around the body it is editing. */
const EDITOR_REGIONS = '[data-editable]';

export class ContentToolsCms extends HTMLElement {

    /* Plain assignments in the constructor, not class fields:
       `useDefineForClassFields: false` plus an accessor of the same name
       would otherwise assign undefined THROUGH the setter. Same reason the
       editor element does it. */
    declare private _shadow: ShadowRoot;
    declare private _frame: Frame;
    declare private _gate: Gate | null;
    declare private _status: Status | null;

    declare private _config: CmsConfig | null;
    declare private _route: Route;
    declare private _error: Described | null;
    declare private _repo: CmsRepo | null;

    declare private _entries: ListedEntry[] | null;
    declare private _truncated: boolean;

    /** The open entry, and the three things that belong to it. */
    declare private _entry: Entry | null;
    declare private _doc: MarkdownDocument | null;
    declare private _store: MediaStore | null;
    /**
     * The editor element, which is this host's only LIGHT-DOM child.
     *
     * Written by `_setEditor` and nowhere else. Two failures live here and
     * neither says anything: an editor left connected holds the
     * one-per-page `EditorApp` lease, so every later entry refuses to
     * open; and an editor removed by re-rendering the shadow root instead
     * would be unslotted rather than disconnected, which is the same
     * thing with the element still on the page.
     */
    declare private _editor: ContentToolsEditor | null;
    /**
     * The last body HTML the editor reported, cached.
     *
     * `EditorApp.save()` is ONE-SHOT: it reports the regions whose
     * `lastModified()` moved since the last save and then resets that
     * baseline, so an immediate second `save(true)` answers `{}`. The
     * dirty check and the submit both want the current HTML, and without
     * this cache whichever asked second would be told the entry was
     * empty.
     */
    declare private _edited: string | null;
    /** The fields the open entry's collection declares, and their block. */
    /**
     * The frontmatter form's whole state, or null when no entry is open.
     *
     * ONE field rather than the four it started as -- the fields, the
     * parsed data, the refusal and the key. Reset separately, three of
     * the four were unkillable by any test: nothing can read them once
     * the key says there is no form, and `_openForm` is the only writer
     * and always sets all four together. A single value has one way to
     * be wrong instead of four that can disagree.
     */
    declare private _form: FieldsState | null;
    declare private _saving: boolean;
    declare private _saved: string | null;
    declare private _conflict: string | null;
    /** A navigation held back until the person answers the leave panel. */
    declare private _pendingLeave: Route | null;
    /** Set while restoring the hash, so the resulting event is ignored. */
    declare private _restoring: boolean;
    declare private _onBeforeUnload: (ev: BeforeUnloadEvent) => void;
    /** Monotonic; see `_navigate`. Guards every route-scoped await. */
    declare private _nav: number;

    declare private _booted: boolean;
    declare private _onHashChange: () => void;

    /** The token the gate collected, read once by the default adapter. */
    declare private _offered: string | null;

    declare private _auth: AuthAdapter | null;
    declare private _widgets: Readonly<Record<string, WidgetFactory>> | null;
    declare private _fetch: typeof globalThis.fetch | null;

    constructor() {
        super();
        /* Open, like the editor's: a closed root buys no real
           encapsulation and costs every test and every debugging session
           the ability to look inside. */
        this._shadow = this.attachShadow({mode: 'open'});

        /* Built in the CONSTRUCTOR, and never rebuilt. The frame owns
           `<slot name="editor">`, and an editor slotted into a slot a
           re-render replaced is invisible but still connected -- so it
           holds the one-per-page EditorApp lease forever and every entry
           opened afterwards refuses to open, silently. */
        this._frame = buildFrame(this.ownerDocument, {
            signOut: () => this._signOut(),
            submit: () => this._submit(),
            reload: () => this._reopen(),
            stay: () => this._stay(),
            discard: () => this._discard()
        /* A GETTER, not a snapshot. The frame is built here, in the
           constructor, and a host page sets `el.widgets` afterwards --
           it has no element to set it on until this has returned. A
           registry read once would ignore it silently, for the life of
           the page. */
        }, () => this.widgets);
        this._gate = null;
        this._status = null;

        this._config = null;
        this._route = HOME;
        this._error = null;
        this._repo = null;
        this._entries = null;
        this._truncated = false;
        this._entry = null;
        this._doc = null;
        this._store = null;
        this._editor = null;
        this._edited = null;
        this._form = null;
        this._saving = false;
        this._saved = null;
        this._conflict = null;
        this._pendingLeave = null;
        this._restoring = false;
        this._nav = 0;
        this._booted = false;
        this._offered = null;
        this._auth = null;
        this._widgets = null;
        this._fetch = null;

        this._onHashChange = () => this._readRoute();
        this._onBeforeUnload = ev => this._guardUnload(ev);
        this._shadow.appendChild(this._frame.node);
    }

    // --- properties -------------------------------------------------------

    /**
     * How a token is obtained. Defaults to a `PatAuthAdapter` reading the
     * gate's field.
     *
     * Settable so M4's GitHub App adapter drops in without forking the
     * shell. The shell OWNS the adapter, which is why nothing here
     * subscribes to it: every transition it can cause goes through a
     * handler on this element, and signed-in-ness is derived at render
     * time from `currentToken()` rather than cached into a boolean that
     * can go stale.
     */
    get auth(): AuthAdapter {
        if (!this._auth) {
            this._auth = new PatAuthAdapter({prompt: () => this._offered});
        }
        return this._auth;
    }

    set auth(adapter: AuthAdapter) {
        this._auth = adapter;
        this._render();
    }

    /**
     * The `fetch` the config load and every API call go through.
     *
     * A property rather than a test-only attribute: a host page that has
     * to add a header, or route through its own proxy, wants exactly this,
     * and a seam that exists only for tests is one nobody maintains.
     */
    get fetch(): typeof globalThis.fetch {
        return this._fetch ?? globalThis.fetch;
    }

    set fetch(value: typeof globalThis.fetch) {
        this._fetch = value;
    }

    /**
     * The frontmatter widgets, so a site can add one without forking.
     *
     * MERGED over the defaults rather than replacing them: a deployment
     * with one `relation` field of its own would otherwise lose `string`
     * and the other eight, and every declared field would fall through
     * to the read-only `unknown` control -- a form that silently stops
     * editing anything. Overriding a default name is still possible, and
     * is then a deliberate act rather than a side effect of registering
     * something else.
     */
    get widgets(): Readonly<Record<string, WidgetFactory>> {
        return this._widgets ?? DEFAULT_WIDGETS;
    }

    set widgets(value: Readonly<Record<string, WidgetFactory>>) {
        this._widgets = Object.freeze({...DEFAULT_WIDGETS, ...value});
    }

    /** The repository client, once the config has loaded. */
    get repo(): CmsRepo | null {
        return this._repo;
    }

    // --- lifecycle --------------------------------------------------------

    connectedCallback(): void {
        const sheet = shellStyleSheet(this.ownerDocument);
        /* Null where constructable sheets are unsupported. Unlike the
           editor's chrome, an unstyled shell is ugly and entirely usable,
           so there is no <style> fallback to maintain. */
        if (sheet && !this._shadow.adoptedStyleSheets.includes(sheet)) {
            this._shadow.adoptedStyleSheets = [...this._shadow.adoptedStyleSheets, sheet];
        }

        const view = this.ownerDocument.defaultView;
        view?.addEventListener('hashchange', this._onHashChange);
        /* The browser's own version of the leave panel, for the one exit
           the shell cannot render over: closing the tab. Same predicate,
           so the two cannot disagree about whether there is work to
           lose. */
        view?.addEventListener('beforeunload', this._onBeforeUnload);
        this._route = parseRoute(this._hash());

        if (!this._booted) {
            this._booted = true;
            void this._guard(() => this._loadConfig());
        } else {
            this._render();
        }
    }

    disconnectedCallback(): void {
        const view = this.ownerDocument.defaultView;
        view?.removeEventListener('hashchange', this._onHashChange);
        view?.removeEventListener('beforeunload', this._onBeforeUnload);
        /* The editor is deliberately NOT touched here, and removing it
           would be a bug rather than tidiness. It is a child of this
           host, so a real removal disconnects it with us and it releases
           the lease on its own -- and a MOVE fires this callback too,
           synchronously, before the reconnect. Detaching the editor here
           would therefore destroy the open entry every time a framework
           reparented the shell, while the editor's own teardown is
           already written to survive exactly that (deferred a microtask,
           re-checking `isConnected`). */
    }

    // --- state ------------------------------------------------------------

    private _render(): void {
        const config = this._config;
        /* Derived, never stored. The one transition this element cannot
           see is a token revoked somewhere else, and that arrives as a
           401 -- so a cached boolean would say "signed in" while every
           request failed. */
        const token = config ? this.auth.currentToken() : null;

        /* No config means there is nothing to sign in TO: the repository
           a gate would name is exactly what failed to load, so the gate
           is not the screen to show. */
        const screen = config
            ? (token ? 'ready' : 'signed-out')
            : (this._error ? 'unconfigured' : 'loading');

        /* The error goes to the screen that is SHOWING, and no other
           screen is left holding a copy. A rejected token's alert
           surviving on the gate until the next sign-out would read as a
           fresh rejection of a token nobody has offered yet. */
        const shownOn = (which: string) => (screen === which ? this._error : null);

        if (config) {
            this._frame.update({
                config,
                route: this._route,
                error: shownOn('ready'),
                entries: this._entries,
                truncated: this._truncated,
                entry: this._entryState()
            });
            this._gateView().update({
                repo: config.backend.repo,
                error: shownOn('signed-out')
            });
        } else {
            this._statusView().update({error: this._error});
        }
        this._show(screen);
    }

    /** Assign and re-render. The only way state changes. */
    private _setState(patch: {
        config?: CmsConfig | null;
        route?: Route;
        error?: Described | null;
        entries?: ListedEntry[] | null;
        truncated?: boolean;
        entry?: Entry | null;
        saving?: boolean;
        saved?: string | null;
        conflict?: string | null;
    }): void {
        if ('config' in patch) {
            this._config = patch.config ?? null;
        }
        if ('route' in patch && patch.route) {
            this._route = patch.route;
        }
        if ('error' in patch) {
            this._error = patch.error ?? null;
        }
        if ('entries' in patch) {
            this._entries = patch.entries ?? null;
        }
        if ('truncated' in patch) {
            this._truncated = patch.truncated ?? false;
        }
        if ('entry' in patch) {
            this._entry = patch.entry ?? null;
        }
        if ('saving' in patch) {
            this._saving = patch.saving ?? false;
        }
        if ('saved' in patch) {
            this._saved = patch.saved ?? null;
        }
        if ('conflict' in patch) {
            this._conflict = patch.conflict ?? null;
        }
        this._render();
    }

    /**
     * Run something that can fail, and put the failure on the SCREEN.
     *
     * Every async entry point goes through here. An error that reaches
     * only the console leaves a shell that looks idle when it has failed,
     * and `shell-dist.spec.mjs` asserts the console stays clean for
     * exactly that reason.
     */
    private async _guard(work: () => Promise<void>): Promise<void> {
        try {
            await work();
        } catch (error) {
            const described = describeError(error);
            /* A 401 means the token this shell is holding is no longer a
               token -- revoked on GitHub, or expired while the tab sat
               open. Dropping it is what brings the gate back, and the
               gate is where the only fix is offered. Keep it and the
               person is inside a shell where every request fails and
               nothing on screen suggests signing in again.

               `_signIn` handles its own refusal rather than relying on
               this, because there the token must go whether the answer
               was a 401, a 404 or a 200 whose body says read-only. */
            if (described.kind === 'unauthorized') {
                await this._dropToken();
            }
            this._setState({error: described});
        }
    }

    // --- the work ---------------------------------------------------------

    private _hash(): string {
        return this.ownerDocument.defaultView?.location.hash ?? '';
    }

    private _readRoute(): void {
        /* The hashchange our OWN restoration caused. Acting on it would
           undo the restoration and let the navigation through: the leave
           panel would appear and the entry would close behind it anyway,
           which is the worst of both. */
        if (this._restoring) {
            this._restoring = false;
            return;
        }

        const route = parseRoute(this._hash());
        /* `_dirty()` is the WHOLE predicate, and the two tests that are
           not here were both written and both removed.

           Not `this._route.kind === 'entry'`: nothing but an open entry
           can be dirty in the first place (`_navigate` closes the entry
           before it sets the route, so the three fields `_dirty` needs
           are null everywhere else), and from M5-5 the create route is
           an open editor on a route that is not `entry` -- so the test
           would start throwing away a new post's first draft.

           Not `formatRoute(route) !== formatRoute(this._route)` either.
           A hashchange naming the route we are already on is reachable,
           because `#/c/blog/e/hello/` and `#/c/blog/e/hello` are the
           same page to `parseRoute`; and there that test does not stop a
           pointless question, it turns it into a silent `_navigate` that
           reloads the entry and drops the edits without asking. */
        if (this._dirty()) {
            /* Held, not refused. A hashchange cannot be cancelled -- by
               the time it fires the address bar has already moved -- so
               the hash is put back and the question asked in the page.
               Never `window.confirm`: it is modal on the whole tab, it
               cannot be styled or tested as part of the shell, and a
               person who dismisses it by reflex has nothing to read
               afterwards. */
            this._pendingLeave = route;
            this._restoreHash();
            this._render();
            return;
        }
        this._navigate(route);
    }

    /**
     * Put the address bar back where the shell actually is.
     *
     * The equality guard is load-bearing: assigning a hash that is
     * already set fires NO event, so `_restoring` would stay true and
     * swallow the next real navigation instead -- a shell that stops
     * responding to its own links, once.
     */
    private _restoreHash(): void {
        const view = this.ownerDocument.defaultView;
        const want = formatRoute(this._route);
        if (!view || view.location.hash === want) {
            return;
        }
        this._restoring = true;
        view.location.hash = want;
    }

    /**
     * The tab is closing. Same predicate as the leave panel, deliberately.
     *
     * Two guards that disagree about whether there is work to lose is
     * worse than one: the panel would hold a navigation the browser then
     * let through without a word.
     */
    private _guardUnload(ev: BeforeUnloadEvent): void {
        if (!this._dirty()) {
            return;
        }
        /* Both, because engines disagree about which one arms the
           prompt. There is no message to write -- browsers replaced the
           author's text with their own wording years ago. */
        ev.preventDefault();
        ev.returnValue = '';
    }

    /**
     * Go somewhere, and fetch whatever that somewhere needs.
     *
     * `_nav` is a monotonic token, taken here and re-checked after every
     * await in `_loadRoute`. Without it a slow listing for a collection
     * the user has already left renders over the one they are looking at
     * now: entry B's chrome with collection A's rows under it, and a
     * click that opens the wrong entry. Nothing throws, and the list
     * looks entirely plausible.
     *
     * It deliberately guards ROUTE-SCOPED work only. It was written into
     * the boot in M5-1 and taken out again: a hashchange during the
     * config load made the load's own post-await check fail, so the shell
     * sat on "Loading" for ever. The config belongs to the deployment,
     * not to a route, and nothing a person clicks makes it stale.
     *
     * Clearing the error is part of the same idea -- an alert about the
     * page you just left, still on screen over the page you just opened,
     * reads as a fresh failure of the new one -- and so is clearing the
     * entries: they belong to the route being left, and leaving them up
     * shows one collection's rows under another's heading until the new
     * listing lands.
     */
    private _navigate(route: Route): void {
        this._nav += 1;
        const at = this._nav;
        this._pendingLeave = null;
        /* Leaving an entry CLOSES it, here rather than when the next one
           is ready. Two reasons, and the second is the one that matters:
           the previous entry's text under the new entry's heading is the
           same failure the cleared `entries` above prevents for a list;
           and the `EditorApp` lease is genuinely free across the await
           that follows rather than handed over in one tick. The plan
           called for the one-tick swap; releasing first is strictly more
           conservative, and the gate it was protecting -- "the lease is
           free after navigating away" -- is satisfied directly. */
        this._closeEntry();
        this._setState({route, error: null, entries: null, truncated: false});
        void this._guard(() => this._loadRoute(at));
    }

    /**
     * Fetch what the current route displays.
     *
     * Both halves in ONE `Promise.all`, not one after the other: the
     * merged list needs both, and a sequential pair doubles the time an
     * author waits for a screen that cannot be drawn until the second
     * arrives.
     *
     * A file collection reaches `listEntries` too, and that is not a
     * wasted call: it answers from the config without touching the
     * network. `listInFlight` does fetch, for every collection alike --
     * a pull request against a file collection's entry is as real as any
     * other, and a file collection that silently never showed one would
     * hide a review in progress.
     */
    private async _loadRoute(at: number): Promise<void> {
        const repo = this._repo;
        const route = this._route;
        if (!repo || !this.auth.currentToken()) {
            return;
        }
        if (route.kind !== 'collection' && route.kind !== 'entry') {
            return;
        }
        /* A collection the config does not have. The view already says
           so by name; asking the repository would throw a ConfigError
           over the top of that with a worse version of the same
           sentence, and put an alert on a page that is already
           explaining itself. */
        if (!this._config?.collections.some(c => c.name === route.collection)) {
            return;
        }

        if (route.kind === 'entry') {
            await this._openEntry(at, route.collection, route.slug);
            return;
        }

        const [listing, inFlight] = await Promise.all([
            repo.listEntries(route.collection),
            repo.listInFlight()
        ]);
        if (at !== this._nav) {
            return;
        }
        this._setState({
            entries: mergeEntries(route.collection, listing.entries, inFlight),
            truncated: listing.truncated
        });
    }

    // --- the open entry ---------------------------------------------------

    /**
     * Read an entry and put an editor on the page for it.
     *
     * The media folder is listed in the SAME round trip, because the
     * names it already holds decide what an upload is staged as -- and a
     * collision has to be resolved at the moment the image is inserted,
     * not at commit time, since the URL the editor shows has to be the
     * URL that ends up in the file.
     */
    private async _openEntry(at: number, collection: string, slug: string): Promise<void> {
        const repo = this._repo as CmsRepo;
        const config = this._config as CmsConfig;

        const [entry, folder] = await Promise.all([
            repo.readEntry(collection, slug),
            repo.github.listDirectory(config.media.folder, repo.base)
        ]);
        if (at !== this._nav) {
            return;
        }

        const doc = MarkdownDocument.parse(entry.content ?? '');
        this._doc = doc;
        this._store = new MediaStore({config, taken: folder.map(file => file.name)});
        this._openForm(doc, collection, slug);

        const editor = this._buildEditor(doc, this._store);
        this._setEditor(editor);
        /* Started by the shell, not by an ignition button. Opening an
           entry in a CMS IS the decision to edit it, and an editor
           sitting inert behind a second press is a screen that looks
           broken. It also has to be started for `save(true)` to have any
           regions to report: `_regions` is populated by `start()`. */
        editor.start();
        this._setState({entry});
    }

    /**
     * Decide what the frontmatter form shows, and whether it may be used.
     *
     * The fields come from the config and the values from the file, and
     * either can be absent without the other mattering: a collection
     * that declares none gets no form, and a file whose block cannot be
     * read gets a refusal instead of one.
     */
    private _openForm(doc: MarkdownDocument, collection: string, slug: string): void {
        const config = this._config as CmsConfig;
        /* Non-null, and a fallback here was written and removed as
           unreachable: `readEntry` resolves the same name one line
           earlier in `_openEntry` and throws a `ConfigError` when the
           config has no such collection, so this never runs for one. */
        const found = findCollection(config, collection) as Collection;
        const front = doc.frontmatter();
        const data = front ? front.data : null;

        /* `valid` and not `data === null`, because those are opposite
           instructions that look identical: an empty block parses to
           null and is a file with no keys yet, which a form may add to.
           See `Frontmatter.valid`. */
        let refusal: string | null = null;
        if (front && !front.valid) {
            refusal = UNREADABLE;
        } else if (!isMergeable(data)) {
            refusal = NOT_A_MAPPING;
        }

        this._form = {
            /* What tells the form one entry from the next -- and NOT
               the `Entry` object, because a save replaces that with a
               copy re-pinned to the new commit, and keying on it would
               rebuild every control under whoever was typing on every
               press of Submit.

               Its CONTENT survives mutation: any non-empty string
               passes the whole suite today, because every entry-to-
               entry move goes through `_closeEntry` and a closed form
               rebuilds whatever it is handed next. Recorded rather than
               simplified to a constant -- it becomes load-bearing the
               first time the shell opens a different entry without
               closing the one before it, and there a constant key shows
               the previous file's answers over the new file's body. */
            key: `${collection}/${slug}`,
            fields: fieldsFor(found, slug),
            data,
            refusal
        };
    }

    /**
     * The editor element for `doc`, fully built and not yet connected.
     *
     * Everything is in place before it enters the DOM, because
     * `connectedCallback` boots immediately: an element connected first
     * and configured afterwards boots against the defaults and then has
     * to be rebooted, which tears down and re-claims the lease for
     * nothing.
     */
    private _buildEditor(doc: MarkdownDocument, store: MediaStore): ContentToolsEditor {
        const doc_ = this.ownerDocument;
        const editor = doc_.createElement(EDITOR_TAG) as ContentToolsEditor;
        /* Without this the element is an unassigned light child. The
           frame's only slot is a NAMED one, so an editor with no `slot`
           attribute renders nowhere at all -- while being perfectly
           connected, perfectly functional, and holding the lease. */
        editor.setAttribute('slot', EDITOR_SLOT);
        editor.setAttribute('regions', EDITOR_REGIONS);
        /* The whole reason markdown mode exists: the editor must not be
           able to produce something the serializer cannot express. */
        editor.setAttribute('mode', 'markdown');
        /* Staged in memory and committed by `saveEntry`, so an entry and
           its images land in one commit. An uploader that commits on its
           own leaves an orphan blob behind every abandoned edit. */
        editor.imageUploader = mediaUploader({store});

        const region = doc_.createElement('div');
        region.setAttribute('data-editable', '');
        region.setAttribute('data-name', REGION);
        region.innerHTML = doc.toHTML();
        editor.appendChild(region);

        editor.addEventListener('ct-saved', ev => this._remember(ev as CustomEvent));
        return editor;
    }

    /**
     * This host's only light-DOM child, and the only place it is written.
     *
     * Not `replaceChildren`: a host page's own children are none of the
     * shell's business, and the M5-1 invariant that the shell writes
     * nothing into its light DOM holds for everything except this one
     * element.
     *
     * There is no editor-to-editor case, and there is deliberately no
     * code for one. `_navigate` closes the open entry BEFORE it awaits
     * the next, so the lease is genuinely free across the read rather
     * than handed over in a single tick -- the one-tick `replaceWith`
     * swap the plan called for was written, found to be unreachable, and
     * removed. Adding it back means removing the `_closeEntry` above.
     */
    private _setEditor(next: ContentToolsEditor | null): void {
        const current = this._editor;
        this._editor = next;
        if (next) {
            this.appendChild(next);
        } else if (current) {
            current.remove();
        }
    }

    /**
     * Forget the open entry. Does NOT render; every caller sets state
     * immediately afterwards and a second render would only flicker.
     */
    private _closeEntry(): void {
        this._setEditor(null);
        this._entry = null;
        this._doc = null;
        this._store = null;
        this._edited = null;
        this._form = null;
        this._saving = false;
        this._saved = null;
        this._conflict = null;
    }

    private _entryState(): EntryState {
        return {
            entry: this._entry,
            saving: this._saving,
            saved: this._saved,
            conflict: this._conflict,
            leaving: this._pendingLeave !== null,
            fields: this._form
        };
    }

    /**
     * Remember what the editor last reported for the body.
     *
     * Only when the region is actually in the map. `save()` reports the
     * regions whose content moved since the last save and then RESETS
     * that baseline, so an unchanged save reports none -- and reading
     * the absent key as "the body is empty now" would make the next
     * submit write an empty file over somebody's post.
     */
    private _remember(ev: CustomEvent): void {
        const regions = (ev.detail as {regions?: Record<string, string>} | null)?.regions;
        const html = regions ? regions[REGION] : undefined;
        if (typeof html === 'string') {
            this._edited = html;
        }
    }

    /**
     * The body HTML as it stands right now.
     *
     * `save(true)` is passive: it reports without unmounting the
     * regions, so the caret stays where the person left it. It fills
     * `_edited` synchronously through the handler above, and the cache
     * is why this may be called twice -- the dirty check and the submit
     * both want the answer, and the second caller would otherwise be
     * told nothing had changed.
     */
    private _currentHtml(): string {
        /* No `state === 'editing'` test beside this one. `_editor` is
           written by `_setEditor` alone, which is called from
           `_openEntry` -- one line before `start()` -- and from
           `_closeEntry`, which passes null. So an editor that is here
           and not editing does not exist, and a test for it could only
           ever be dead. If that stops being true, `save()` throws on a
           disconnected editor, which is the loud failure rather than the
           quiet one. */
        this._editor?.save(true);
        return this._edited ?? this._doc?.toHTML() ?? '';
    }

    /**
     * Exactly what a save would write, or null if there is nothing open.
     *
     * ONE method, because the dirty check and the submit both need this
     * answer and two spellings of it can disagree -- which they would do
     * by holding a navigation over work that a save then reports as
     * unchanged, or worse by letting one go that a save would have
     * written. The media rewrite belongs here for the same reason: it
     * happens on the way to the commit, so it has to happen on the way
     * to the comparison.
     */
    private _pending(): {content: string; media: MediaFile[]} | null {
        const doc = this._doc;
        const store = this._store;
        if (!doc || !store) {
            return null;
        }
        /* One pass giving both answers. Rewriting the HTML and asking
           separately what to commit can disagree, and the way they
           disagree is an entry referencing an image nobody uploaded. */
        const {html, media} = store.rewrite(this._currentHtml());
        return {content: doc.update(html, this._frontmatterOption()), media};
    }

    /**
     * The `frontmatter` option for `update`, or nothing at all.
     *
     * Returning `undefined` is not the same as returning `{frontmatter:
     * <unchanged>}`: `update` preserves the original block BYTE FOR BYTE
     * only when it is given no data, and a YAML round trip loses key
     * order, comments and quoting style. So a save that only touched the
     * body has to reach `update` with no options object, and this is the
     * line that decides it.
     */
    private _frontmatterOption(): {frontmatter: unknown} | undefined {
        const values = this._frame.entry.values();
        if (values === null) {
            return undefined;
        }
        const data = this._form?.data ?? null;
        const merged = mergeFrontmatter(data, values);
        return frontmatterChanged(data, merged) ? {frontmatter: merged} : undefined;
    }

    /**
     * Whether there is work that a save would write.
     *
     * The MARKDOWN decides, not the HTML. The editor normalises what it
     * is handed -- attribute order, whitespace, the placeholder
     * paragraph an empty region needs to hold a caret -- so an HTML
     * comparison reports edits nobody made, and a leave panel that
     * appears every time is a leave panel people click through.
     */
    private _dirty(): boolean {
        const entry = this._entry;
        const pending = entry ? this._pending() : null;
        return pending !== null && pending.content !== (entry?.content ?? '');
    }

    /**
     * Commit what is in the editor, and open or update the pull request.
     *
     * The open `MarkdownDocument` is NEVER re-parsed afterwards, and that
     * is the subtlest rule in the shell. Re-parsing the string just
     * written would renumber the blocks while the live DOM still carries
     * the old `data-ct-md` indices, so the next save would splice against
     * the wrong originals -- content corruption inside a diff that looks
     * perfectly reviewable. It stays correct because `parent` pins the
     * commit this edit was read at: the branch is what we read plus our
     * own change, or it is a `ConflictError`.
     */
    private _submit(): void {
        void this._guard(async () => {
            const repo = this._repo;
            const entry = this._entry;
            /* Asked BEFORE anything is computed, because `validate()`
               is also what puts each message under its own control --
               so refusing after the rewrite would mark the fields and
               then commit anyway. A required field left empty is a save
               that produces a file the site cannot render, and the
               person who would find out is a reader. */
            const errors = this._frame.entry.errors();
            if (errors.length > 0) {
                this._setState({error: {
                    title: errors.length === 1
                        ? 'One field needs filling in.'
                        : `${errors.length} fields need filling in.`,
                    detail: errors.join(' '),
                    kind: 'notice',
                    path: ''
                }});
                return;
            }

            const pending = this._pending();
            if (!repo || !entry || !pending) {
                return;
            }
            const {content, media} = pending;
            this._setState({saving: true, saved: null, conflict: null, error: null});

            let result;
            try {
                result = await repo.saveEntry(entry.collection, entry.slug, {
                    content,
                    media,
                    parent: entry.commit,
                    message: `Update ${entry.path}`
                });
            } catch (error) {
                /* Whatever happens next, the save is over. Leaving
                   `saving` set disables the button for good, so the one
                   person who most needs to try again cannot. Written
                   directly because two of the three paths below render
                   anyway and the third is `_guard`'s. */
                this._saving = false;
                const described = describeError(error);
                if (described.kind === 'conflict') {
                    /* The unwritten markdown is kept and shown. A
                       conflict is the one failure where the person's
                       work is still in hand and the only way forward
                       throws it away; offering the reload without
                       showing them what they wrote is data loss with a
                       button on it. */
                    this._setState({error: described, conflict: content});
                    return;
                }
                /* Everything else is re-thrown rather than rendered
                   here, `NothingToSaveError` included: `_guard` renders
                   whatever it catches through the same `describeError`,
                   so a branch for the notice would say the same words
                   twice -- and `_guard` also drops the token on a 401,
                   which a save is as able to provoke as any other
                   request. Catching it here would leave a revoked token
                   in place and every later save failing the same way. */
                throw error;
            }

            /* `content` is now what the repository holds, so it becomes
               the baseline the dirty check compares against -- otherwise
               a saved entry still reads as unsaved and the leave panel
               appears over work that is safely committed. */
            this._setState({
                entry: {
                    ...entry,
                    content,
                    commit: result.commit ?? entry.commit,
                    pull: result.pull
                },
                saving: false,
                saved: result.commit ? `Saved as ${result.commit.slice(0, 7)}.` : null,
                /* `changed: false` and a thrown `NothingToSaveError` are
                   the same thing to the person who pressed the button:
                   the repository already holds this. Which one the
                   repository reports depends on whether a pull request
                   happens to be open. */
                error: result.changed ? null : NOTHING_TO_SAVE
            });
        });
    }

    /** Throw away local edits and read the entry again. */
    private _reopen(): void {
        this._navigate(this._route);
    }

    /** Abandon the held-back navigation. */
    private _stay(): void {
        this._pendingLeave = null;
        this._render();
    }

    /**
     * Leave anyway, losing the unsaved work.
     *
     * Navigated directly rather than by setting the hash and waiting for
     * the event: the restoration's own hashchange may still be in
     * flight, and a second assignment racing it is how a discard turns
     * into two loads or none. The address bar is corrected afterwards,
     * with the resulting event suppressed because the work is done.
     */
    private _discard(): void {
        const route = this._pendingLeave ?? this._route;
        this._pendingLeave = null;
        this._navigate(route);
        this._restoreHash();
    }

    private async _loadConfig(): Promise<void> {
        const url = this.getAttribute(CONFIG_ATTRIBUTE);
        if (!url) {
            /* Named as a config error rather than defaulted to a guessed
               filename. One build serves many sites; a deployment with no
               config is not a deployment with a default one, and guessing
               produces a 404 that reads as "GitHub is down". */
            throw new ConfigError(CONFIG_ATTRIBUTE,
                `<${TAG_NAME}> needs a "${CONFIG_ATTRIBUTE}" attribute naming its config file`);
        }

        const config = await loadConfig(url, {fetch: this.fetch});

        /* The token is read per request, not captured. A sign-out or a
           dropped token takes effect on the next call rather than leaving
           the client holding the string it was built with. */
        this._repo = new CmsRepo({
            config,
            token: () => this.auth.currentToken(),
            /* Late-bound, and called UNBOUND. Late-bound because `fetch`
               is a property a host page may set at any point, and a
               client holding the function that was there at boot is a
               property that silently stops working. Unbound because
               `this.fetch(...)` would hand the browser this element as
               fetch's receiver -- "Illegal invocation", which is the
               exact bug the built-artifact suite found in the client in
               M3 and which no injected-transport test can see. */
            fetch: (input, init) => {
                const http = this.fetch;
                return http(input, init);
            }
        });
        this._setState({config, error: null});
        /* The route was parsed at connect, before there was a config to
           resolve it against. This is the first navigation to it, and
           `_loadRoute` declines while there is no token -- so a signed-out
           boot stops at the gate and `_signIn` navigates again. */
        this._navigate(this._route);
    }

    private _signIn(offered: string): void {
        void this._guard(async () => {
            this._offered = offered;
            try {
                await this.auth.authenticate();
            } finally {
                /* Held only for the length of the call. The adapter owns
                   storage; this field is the seam between the gate's
                   field and `prompt()`, and a token left in an element
                   property is one more place it can be read from. */
                this._offered = null;
            }
            /* Nothing gets past the gate on an unverified token. A
               refusal is caught rather than allowed to propagate,
               because the token has to be DROPPED either way: leaving it
               stored would put the person inside a shell where every
               request fails, with the only fix -- a different token --
               one screen behind them.

               `_verify` reports the two shapes differently on purpose. A
               rejected request throws; a token that can read but not
               push is a 200 whose body says no, and inventing an
               exception class to carry a condition one caller checks is
               more machinery than the condition. */
            let refused: Described | null = null;
            try {
                refused = await this._verify();
            } catch (error) {
                refused = describeError(error);
            }
            if (refused) {
                await this._dropToken();
                this._setState({error: refused});
                return;
            }
            /* Not `_setState({error: null})`: getting past the gate is
               the first moment the shell may fetch, so the current route
               has never been loaded. */
            this._navigate(this._route);
        });
    }

    /**
     * Ask GitHub whether this token is any good, before letting go of the
     * gate.
     *
     * Without this the first thing a mis-scoped token does is fail a
     * listing, several screens away from the field that produced it and
     * the permissions written next to that field. The worst version is a
     * token that can READ but not write: everything works until the first
     * save, which fails an hour into somebody's afternoon with their work
     * in the editor.
     *
     * A 401 or a 404 here throws, and `_guard` drops the token on a 401,
     * so the gate comes back with the reason on it. `permissions` is
     * absent for some token types, so an absent one is not read as "no":
     * a check that refuses tokens it cannot assess is worse than the
     * failure it prevents.
     */
    private async _verify(): Promise<Described | null> {
        const repo = this._repo;
        if (!repo) {
            return null;
        }
        const meta = await repo.github.repo();
        return meta.permissions && meta.permissions.push === false
            ? cannotPush(repo.config.backend.repo)
            : null;
    }

    private _signOut(): void {
        void this._guard(async () => {
            await this._dropToken();
            this._setState({error: null});
        });
    }

    /**
     * Give up the token, and everything that needed one.
     *
     * The editor goes with it. It is a child of THIS host, and the frame
     * that slots it is merely hidden when the gate comes back -- so an
     * editor left behind is invisible, still connected, and still holding
     * the one-per-page `EditorApp` lease. Signing back in and opening an
     * entry would then refuse, with nothing in any stack trace.
     */
    private async _dropToken(): Promise<void> {
        await this.auth.logout();
        this._closeEntry();
    }

    // --- which screen -----------------------------------------------------

    private _gateView(): Gate {
        if (!this._gate) {
            this._gate = buildGate(this.ownerDocument, {
                signIn: offered => this._signIn(offered)
            });
            this._shadow.appendChild(this._gate.node);
        }
        return this._gate;
    }

    private _statusView(): Status {
        if (!this._status) {
            this._status = buildStatus(this.ownerDocument);
            this._shadow.appendChild(this._status.node);
        }
        return this._status;
    }

    /**
     * Exactly one of the three screens, and the reflected `state`.
     *
     * The frame is HIDDEN rather than removed. It holds the editor slot,
     * and a slot detached from the shadow root unslots whatever was in it
     * -- leaving an editor that is invisible, still connected, and still
     * holding the one-per-page lease. One attribute is a far cheaper
     * invariant than remembering never to detach it.
     *
     * `state` is reflected OUT and never read back in: it is how a host
     * page and a test wait for the shell without polling a property.
     */
    private _show(state: 'ready' | 'signed-out' | 'loading' | 'unconfigured'): void {
        this._frame.node.hidden = state !== 'ready';
        if (this._gate) {
            this._gate.node.hidden = state !== 'signed-out';
        }
        if (this._status) {
            this._status.node.hidden = state === 'ready' || state === 'signed-out';
        }
        this.setAttribute('state', state);
    }
}
