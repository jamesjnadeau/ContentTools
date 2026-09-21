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

import {loadConfig, ConfigError} from '../cms/config.js';
import type {CmsConfig} from '../cms/config.js';
import {CmsRepo} from '../cms/repo.js';
import {PatAuthAdapter} from '../auth/pat.js';
import type {AuthAdapter} from '../auth/types.js';

import {mergeEntries} from './merge.js';
import type {ListedEntry} from './merge.js';
import {cannotPush, describeError} from './errors.js';
import type {Described} from './errors.js';
import {HOME, parseRoute} from './routes.js';
import type {Route} from './routes.js';
import {shellStyleSheet} from './styles.js';
import {buildFrame, EDITOR_SLOT} from './views/frame.js';
import type {Frame} from './views/frame.js';
import {buildGate} from './views/gate.js';
import type {Gate} from './views/gate.js';
import {buildStatus} from './views/status.js';
import type {Status} from './views/status.js';

export {EDITOR_SLOT};

/** The registered tag name. Declared here, re-exported by ./index.ts. */
export const TAG_NAME = 'content-tools-cms';

/** Attribute naming the config file this deployment is given. */
const CONFIG_ATTRIBUTE = 'config';

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
    /** Monotonic; see `_navigate`. Guards every route-scoped await. */
    declare private _nav: number;

    declare private _booted: boolean;
    declare private _onHashChange: () => void;

    /** The token the gate collected, read once by the default adapter. */
    declare private _offered: string | null;

    declare private _auth: AuthAdapter | null;
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
        this._frame = buildFrame(this.ownerDocument, {signOut: () => this._signOut()});
        this._gate = null;
        this._status = null;

        this._config = null;
        this._route = HOME;
        this._error = null;
        this._repo = null;
        this._entries = null;
        this._truncated = false;
        this._nav = 0;
        this._booted = false;
        this._offered = null;
        this._auth = null;
        this._fetch = null;

        this._onHashChange = () => this._readRoute();
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

        this.ownerDocument.defaultView?.addEventListener('hashchange', this._onHashChange);
        this._route = parseRoute(this._hash());

        if (!this._booted) {
            this._booted = true;
            void this._guard(() => this._loadConfig());
        } else {
            this._render();
        }
    }

    disconnectedCallback(): void {
        this.ownerDocument.defaultView?.removeEventListener('hashchange', this._onHashChange);
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
                truncated: this._truncated
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
                await this.auth.logout();
            }
            this._setState({error: described});
        }
    }

    // --- the work ---------------------------------------------------------

    private _hash(): string {
        return this.ownerDocument.defaultView?.location.hash ?? '';
    }

    private _readRoute(): void {
        this._navigate(parseRoute(this._hash()));
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
        if (!repo || !this.auth.currentToken() || route.kind !== 'collection') {
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
                await this.auth.logout();
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
            await this.auth.logout();
            this._setState({error: null});
        });
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
