/* `<content-tools-editor>` -- the editor as a custom element.
 *
 * This is the boundary the CMS shell embeds, so the contract matters more
 * than the implementation: attributes in, two reflected attributes out, and
 * `ct-*` DOM events that cross the shadow boundary. Everything the element
 * does to the process-global singletons underneath is confined to
 * ./editor-app-lease.ts and ./globals.ts.
 *
 * MODE A (default, `content-scope="light"`): the shadow root holds only the
 * editor's chrome; the content stays in the light DOM and is slotted. The
 * host page styles it, so preview fidelity is free, and selection reads
 * return un-retargeted nodes.
 *
 * MODE B (`content-scope="shadow"`) is an opt-in PREVIEW. It reparents the
 * consumer's children, is unusable without `content-styles`, and is the
 * branch where a selection outside the root reads as null. Ship light,
 * offer shadow.
 */
/* The WHOLE library, through the public entry, not the ContentTools barrel
 * alone. `src/index.ts` also fixes the evaluation order -- install-default
 * first, then HTMLString, ContentSelect, ContentEdit, ContentTools -- and
 * the leaves matter: `ContentEdit.Text`'s constructor does
 * `content instanceof HTMLString.String`, and nothing in the ContentTools
 * or ContentEdit barrels imports the module that attaches `String` to that
 * namespace. Importing less here builds a `dist/element.js` that throws
 * "Right-hand side of 'instanceof' is not an object" the moment anyone
 * calls start() -- which is exactly what the built-artifact smoke test
 * caught, because every source-level test loads the full library anyway. */
import {ContentTools, ContentEdit} from '../index.js';

import ShadowRootContext from '../core/shadow-root-context.js';
import {rootContext, setRootContext} from '../core/root-context.js';
import {chromeStyles, hostStyles, chromeStyleSheet, hostStyleSheet} from './styles.js';
import {ensureIconFont} from './icon-font.js';
import {createEventBridge} from './event-bridge.js';
import type {EventBridge} from './event-bridge.js';
import {
    claimLease, releaseLease, resetEditorApp,
    setPendingTeardown, flushPendingTeardown
} from './editor-app-lease.js';
import {snapshotGlobals, applyGlobals, restoreGlobals} from './globals.js';
import type {GlobalsSnapshot} from './globals.js';

/** Matches the v1.6.x documentation's suggested markup. */
const DEFAULT_REGIONS = '[data-editable], [data-fixture]';

/* `data-name`, not `id`. The imperative default is `id` for backwards
   compatibility with integrations predating the option; a new API has no
   such debt, and naming regions by id forces the document to carry ids it
   does not otherwise want. */
const DEFAULT_NAMING_PROP = 'data-name';

/* Passed on every boot, never omitted. `init()` assigns `fixtureTest` only
   when the argument is truthy, so on a singleton a custom test set by a
   previous consumer would otherwise persist forever. */
const DEFAULT_FIXTURE_TEST = (domElement: Element) =>
    domElement.hasAttribute('data-fixture');

const SETTABLE_PROPERTIES = ['tools', 'fixtureTest', 'stylePalette', 'imageUploader'];

export class ContentToolsEditor extends HTMLElement {

    declare _adopted: CSSStyleSheet[];
    declare _app: any;
    declare _booted: boolean;
    declare _bridge: EventBridge | null;
    declare _contentLink: HTMLLinkElement | null;
    declare _contentWrapper: HTMLElement | null;
    declare _ctx: any;
    declare _deferredTeardown: () => void;
    declare _fallbackStyles: HTMLStyleElement[];
    declare _fixtureTest: ((el: Element) => boolean) | null;
    declare _globals: GlobalsSnapshot | null;
    declare _imageUploader: ((dialog: any) => void) | null | undefined;
    declare _inert: boolean;
    declare _previousContext: any;
    declare _reflect: () => void;
    declare _shadow: ShadowRoot;
    declare _slot: HTMLSlotElement;
    declare _stylePalette: any[] | undefined;
    declare _tools: string[][] | null;

    static get observedAttributes(): string[] {
        // `state` and `busy` are written BY the element and deliberately not
        // observed: reflecting an attribute you also react to is how
        // custom elements end up in a loop.
        return [
            'regions', 'naming-prop', 'ignition',
            'content-scope', 'content-styles', 'ui-lang'
        ];
    }

    constructor() {
        super();

        /* Plain assignments, not class fields. With
           `useDefineForClassFields: false` a class field still compiles to a
           constructor assignment, but any field sharing a name with an
           accessor would be written THROUGH the setter -- so `tools` would
           run its setter with undefined before the element is connected. */
        this._shadow = this.attachShadow({mode: 'open'});

        /* Without a slot Mode A renders nothing at all: a shadow root
           replaces the light children wholesale unless they are slotted. */
        this._slot = this.ownerDocument.createElement('slot');
        this._shadow.appendChild(this._slot);

        this._booted = false;
        this._inert = false;
        this._app = null;
        this._ctx = null;
        this._previousContext = null;
        this._bridge = null;
        this._globals = null;
        this._contentWrapper = null;
        this._contentLink = null;
        this._adopted = [];
        this._fallbackStyles = [];
        this._tools = null;
        this._fixtureTest = null;
        // `undefined` means "never set", which is different from an explicit
        // null; globals.ts writes only the keys that are not undefined.
        this._stylePalette = undefined;
        this._imageUploader = undefined;

        // Stable identities: the lease compares the teardown by reference,
        // and a listener removed by identity has to be the same function.
        this._deferredTeardown = () => {
            /* A DOM MOVE fires disconnected then connected SYNCHRONOUSLY, so
               the only way to tell a move from a removal is to wait a turn
               and look. A microtask rather than a timeout: the lease has to
               be free before the next paint, which is the window in which a
               framework mounts the replacement. */
            if (this.isConnected) {
                return;
            }
            this._teardown();
        };
        this._reflect = () => this._reflectState();
    }

    // --- attributes -------------------------------------------------------

    /** The selector (or a comma-separated list) identifying editable regions. */
    get regions(): string {
        return this.getAttribute('regions') || DEFAULT_REGIONS;
    }

    set regions(value: string) {
        this.setAttribute('regions', value);
    }

    /** The attribute a region's name is read from. */
    get namingProp(): string {
        return this.getAttribute('naming-prop') || DEFAULT_NAMING_PROP;
    }

    set namingProp(value: string) {
        this.setAttribute('naming-prop', value);
    }

    /* Absent means OFF, which INVERTS the imperative default. A boolean
       attribute cannot express "on unless you say otherwise", and an element
       is normally driven by the shell around it rather than by its own
       on-page switch. Add `ignition` to get the v1.6.x behaviour. */
    get ignition(): boolean {
        return this.hasAttribute('ignition');
    }

    set ignition(value: boolean) {
        this.toggleAttribute('ignition', !!value);
    }

    /** `light` (default, Mode A) or `shadow` (Mode B, experimental). */
    get contentScope(): string {
        return this.getAttribute('content-scope') === 'shadow' ? 'shadow' : 'light';
    }

    set contentScope(value: string) {
        this.setAttribute('content-scope', value);
    }

    /** A stylesheet URL to load into the shadow root. Mode B needs one. */
    get contentStyles(): string | null {
        return this.getAttribute('content-styles');
    }

    set contentStyles(value: string | null) {
        if (value === null) {
            this.removeAttribute('content-styles');
        } else {
            this.setAttribute('content-styles', value);
        }
    }

    /* `ui-lang`, NOT `lang`. `lang` is a global HTML attribute with real
       platform semantics -- it is inherited by the light-DOM content and
       tells the browser that THE TEXT BEING EDITED is in that language,
       driving spellcheck, hyphenation, :lang(), font fallback and screen
       reader pronunciation. The chrome's language and the content's language
       are different things, and conflating them makes a French UI editing
       English copy impossible without lying to the accessibility tree.
       `lang` is honoured as a fallback, because an element with only `lang`
       set almost certainly means both. */
    get uiLang(): string | null {
        return this.getAttribute('ui-lang') || this.lang || null;
    }

    set uiLang(value: string | null) {
        if (value === null) {
            this.removeAttribute('ui-lang');
        } else {
            this.setAttribute('ui-lang', value);
        }
    }

    // --- reflected out ----------------------------------------------------

    /** `dormant` | `ready` | `editing`. Read-only; mirrored to `state`. */
    get state(): string {
        return this.getAttribute('state') || 'dormant';
    }

    /** Whether the editor is waiting on the consumer. Mirrored to `busy`. */
    get busy(): boolean {
        return this.hasAttribute('busy');
    }

    // --- properties attributes cannot carry -------------------------------

    get tools(): string[][] | null {
        return this._tools;
    }

    set tools(value: string[][] | null) {
        this._tools = value;
        if (this._booted && value) {
            this._app.toolbox().tools(value);
        }
    }

    get fixtureTest(): ((el: Element) => boolean) | null {
        return this._fixtureTest;
    }

    set fixtureTest(value: ((el: Element) => boolean) | null) {
        this._fixtureTest = value;
        if (this._booted) {
            this._app._fixtureTest = value || DEFAULT_FIXTURE_TEST;
        }
    }

    get stylePalette(): any[] | undefined {
        return this._stylePalette;
    }

    set stylePalette(value: any[] | undefined) {
        this._stylePalette = value;
        if (this._booted) {
            applyGlobals({stylePalette: value});
        }
    }

    get imageUploader(): ((dialog: any) => void) | null | undefined {
        return this._imageUploader;
    }

    set imageUploader(value: ((dialog: any) => void) | null | undefined) {
        this._imageUploader = value;
        if (this._booted) {
            applyGlobals({imageUploader: value});
        }
    }

    /** The RootContext this element installed, or null when not booted. */
    get rootContext(): any {
        return this._ctx;
    }

    /**
     * The underlying `EditorApp`. UNSTABLE: it is the v1.6.x singleton and
     * Milestone 2 reshapes it. Use the `ct-*` events and the methods below
     * wherever they suffice.
     */
    get editorApp(): any {
        return this._app;
    }

    // --- lifecycle --------------------------------------------------------

    connectedCallback(): void {
        // Nothing withdraws a pending teardown here: it re-checks
        // `isConnected` and declines by itself, which stays correct whoever
        // ends up flushing it.
        this._applyStyles();
        ensureIconFont(this.ownerDocument);
        this._boot();
    }

    disconnectedCallback(): void {
        // An inert element never claimed anything; clearing the flag lets it
        // try again if it is re-added once the conflict is gone.
        this._inert = false;
        if (!this._booted) {
            return;
        }
        setPendingTeardown(this._deferredTeardown);
        queueMicrotask(flushPendingTeardown);
    }

    adoptedCallback(): void {
        /* A CSSStyleSheet is bound to the document that constructed it, so
           the sheets have to be rebuilt for the new one, and the memoised
           context is dropped so the next boot builds one there too.

           A LIVE editor does not survive the move: `ShadowRootContext` holds
           the document and window it was constructed with, and re-homing it
           under a mounted region tree would leave every region pointing into
           the old document. Say so rather than half-work. */
        this._applyStyles();
        ensureIconFont(this.ownerDocument);
        if (this._booted) {
            console.warn(
                '<content-tools-editor>: moved to another document while ' +
                'booted. Styles have been rebuilt, but the editor context ' +
                'still refers to the previous document -- remove and re-add ' +
                'the element to re-home it.');
            return;
        }
        this._ctx = null;
    }

    attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
        if (previous === next || !this._booted) {
            // Boot reads every attribute, so there is nothing to do before it.
            return;
        }

        switch (name) {
        case 'regions':
            // Cheap and live: this is exactly what refresh() does.
            this._app.syncRegions(this.regions);
            break;
        case 'naming-prop':
        case 'ignition':
        case 'content-scope':
            // These are read once, during init(), and content-scope also
            // decides where the content physically lives.
            this._reboot(name);
            break;
        case 'content-styles':
            this._applyContentStyles();
            break;
        case 'ui-lang':
            this._applyLanguage();
            break;
        }
    }

    // --- methods ----------------------------------------------------------

    /** Begin editing. */
    start(): void {
        this._requireApp().start();
    }

    /**
     * Stop editing, SAVING by default.
     *
     * A deliberate divergence from the imperative `stop()`, which reverts.
     * Reverting shows a confirm dialog and, if the user cancels, aborts the
     * stop -- neither is a defensible default for a method the shell calls.
     * Pass `false` explicitly to revert.
     */
    stop(save = true): void {
        this._requireApp().stop(save);
    }

    /** Save the current changes. `passive` leaves the page editable. */
    save(passive = false): void {
        this._requireApp().save(passive);
    }

    /** Discard changes. Returns false if the user cancelled the confirm. */
    revert(): boolean {
        return this._requireApp().revert();
    }

    /** Re-scan the page for regions. Safe while editing. */
    refresh(): void {
        this._requireApp().syncRegions(this.regions);
    }

    /** Show a flash indicator: `ok` or `no`. */
    flash(type = 'ok'): void {
        const app = this._requireApp();
        // FlashUI anchors itself to `EditorApp.domElement()` and throws on
        // null, which happens between destroy() and the next boot.
        if (!app.isMounted()) {
            console.warn('<content-tools-editor>: flash() ignored, the editor is not mounted.');
            return;
        }
        new ContentTools.FlashUI(type);
    }

    /**
     * Add consumer styles to the shadow root.
     *
     * Accepts a `CSSStyleSheet`, CSS text, or a URL. Text and URL are told
     * apart by the presence of a `{` -- documented rather than guessed at,
     * because there is no reliable way to distinguish `body{color:red}` from
     * a relative path in general.
     *
     * A URL becomes a `<link>`: fetching it and calling `replaceSync` would
     * need CORS headers and so would break every cross-origin sheet, which
     * is most of them.
     */
    adoptStyles(styles: CSSStyleSheet | string): void {
        if (typeof styles !== 'string') {
            this._adopted.push(styles);
            this._applyStyles();
            return;
        }
        if (styles.includes('{')) {
            const style = this.ownerDocument.createElement('style');
            style.setAttribute('data-content-tools', 'adopted');
            style.textContent = styles;
            this._shadow.appendChild(style);
            return;
        }
        const link = this.ownerDocument.createElement('link');
        link.setAttribute('data-content-tools', 'adopted');
        link.rel = 'stylesheet';
        link.href = styles;
        this._shadow.appendChild(link);
    }

    /** Remove everything added through adoptStyles(). */
    removeAdoptedStyles(): void {
        this._adopted = [];
        for (const node of this._shadow.querySelectorAll('[data-content-tools="adopted"]')) {
            node.remove();
        }
        this._applyStyles();
    }

    // --- internals --------------------------------------------------------

    _requireApp(): any {
        /* A throw is right HERE and wrong in connectedCallback. The consumer
           called this method, so they get an exception on their own stack. A
           throw from a custom-element reaction is reported as an uncaught
           error pointing into the parser and leaves the element broken in
           the DOM regardless. */
        if (this._inert) {
            throw new Error(
                '<content-tools-editor> is inert: another instance already ' +
                'holds the editor.');
        }
        if (!this._booted) {
            throw new Error(
                '<content-tools-editor> is not connected to a document.');
        }
        return this._app;
    }

    _boot(): void {
        if (this._booted || this._inert) {
            return;
        }

        this._upgradeProperties();

        if (!claimLease(this)) {
            this._goInert();
            return;
        }

        this._reconcileEditorApp();

        /* Built ONCE and reused. `mountPoint()` memoises the `.ct-app-host`
           div it appends, so a fresh context on every connect would leave a
           second host behind on every reconnect. */
        if (this._ctx) {
            this._ctx.setContentScopeMode(this.contentScope);
        } else {
            this._ctx = new ShadowRootContext(this._shadow, {
                contentScope: this.contentScope
            });
        }
        // Non-null: this module imports install-default for its side effect.
        this._previousContext = setRootContext(this._ctx);

        this._parkContent();

        this._globals = snapshotGlobals();
        applyGlobals({
            imageUploader: this._imageUploader,
            stylePalette: this._stylePalette,
            uiLang: this.uiLang
        });

        this._app = ContentTools.EditorApp.get();
        this._app.init(
            this.regions,
            this.namingProp,
            this._fixtureTest || DEFAULT_FIXTURE_TEST,
            this.ignition
            );

        if (this._tools) {
            this._app.toolbox().tools(this._tools);
        }

        this._bridge = createEventBridge(this._app, this);
        this._booted = true;

        // Reflection rides the public event contract rather than reaching
        // into the app, so it cannot drift from what consumers observe.
        this.addEventListener('ct-started', this._reflect);
        this.addEventListener('ct-stopped', this._reflect);
        this.addEventListener('ct-busy', this._reflect);

        this._applyContentStyles();
        this._reflectState();
    }

    _teardown(): void {
        if (!this._booted) {
            releaseLease(this);
            return;
        }

        /* Order is forced: stop, then destroy, then repair. `stop()` calls
           `this._toolbox.hide()` unguarded and `destroy()` has already
           nulled it, so the other order throws. */
        const app = this._app;
        try {
            if (app.isEditing()) {
                /* stop(TRUE). stop(false) reverts, which runs a confirm
                   dialog -- indefensible from a DOM removal -- and, if the
                   user cancels, returns false and aborts the stop, leaving a
                   half-torn-down editor. Saving on disconnect is surprising
                   enough to document loudly; losing the user's work silently
                   is worse. */
                app.stop(true);
            }
        } catch (error) {
            console.error('<content-tools-editor>: error stopping the editor', error);
        }

        this.removeEventListener('ct-started', this._reflect);
        this.removeEventListener('ct-stopped', this._reflect);
        this.removeEventListener('ct-busy', this._reflect);

        if (this._bridge) {
            this._bridge.dispose();
            this._bridge = null;
        }

        try {
            app.destroy();
        } catch (error) {
            console.error('<content-tools-editor>: error destroying the editor', error);
        }
        resetEditorApp();

        // Only if it is still ours: something else may have installed a
        // context since, and clobbering it would be worse than leaking one.
        if (rootContext() === this._ctx && this._previousContext) {
            setRootContext(this._previousContext);
        }
        this._previousContext = null;

        if (this._globals) {
            restoreGlobals(this._globals);
            this._globals = null;
        }

        this._unparkContent();

        this._app = null;
        this._booted = false;
        releaseLease(this);

        this.removeAttribute('busy');
        this.setAttribute('state', 'dormant');
    }

    _reboot(attribute: string): void {
        if (this._app && this._app.isEditing()) {
            console.warn(
                `<content-tools-editor>: ignoring the change to ${attribute} ` +
                'while editing. Stop the editor first.');
            return;
        }
        this._teardown();
        this._boot();
    }

    /**
     * Take back a property assigned before the element upgraded.
     *
     * A value set on the element before its definition loads becomes an OWN
     * property, which shadows the prototype accessor permanently -- the
     * setter never runs, and `el.tools = [...]` in a framework template
     * would silently do nothing.
     */
    _upgradeProperties(): void {
        for (const name of SETTABLE_PROPERTIES) {
            if (Object.prototype.hasOwnProperty.call(this, name)) {
                const value = (this as any)[name];
                delete (this as any)[name];
                (this as any)[name] = value;
            }
        }
    }

    /**
     * Put the singleton back to a known state before booting onto it.
     *
     * An imperative integration on the same page may already have called
     * `init()`. Without this the element would boot onto someone else's
     * regions and naming property, which fails in a way that looks like the
     * element ignoring its own attributes.
     */
    _reconcileEditorApp(): void {
        const app = ContentTools.EditorApp.get();
        if (app.isDormant() && !app.isMounted() && app._regionQuery === null) {
            return;
        }
        console.warn(
            '<content-tools-editor>: ContentTools.EditorApp was already ' +
            'initialised imperatively. It is a singleton, so the element is ' +
            'resetting it and taking over.');
        try {
            if (app.isEditing()) {
                app.stop(true);
            }
            app.destroy();
        } catch (error) {
            console.error('<content-tools-editor>: error reclaiming the editor', error);
        }
        resetEditorApp();
    }

    _goInert(): void {
        this._inert = true;
        const message =
            '<content-tools-editor>: another instance already holds the ' +
            'editor. ContentTools.EditorApp and ContentEdit.Root are ' +
            'singletons, so only one can be live per page. This element is ' +
            'inert; its content is still rendered and untouched.';
        // Loudly, but NOT as a throw: an exception from connectedCallback is
        // a custom-element reaction, reported with a stack pointing into the
        // parser, and it leaves the element in the DOM broken anyway.
        console.error(message);
        this.dispatchEvent(new CustomEvent('ct-error', {
            bubbles: true,
            composed: true,
            detail: {code: 'singleton-conflict', message}
        }));
    }

    _reflectState(): void {
        this.setAttribute('state', this._app ? this._app.getState() : 'dormant');
        this.toggleAttribute('busy', Boolean(this._app && this._app.busy()));
    }

    // --- content scope ----------------------------------------------------

    _parkContent(): void {
        if (this.contentScope !== 'shadow' || this._contentWrapper) {
            return;
        }
        const wrapper = this.ownerDocument.createElement('div');
        wrapper.className = 'ct-content';
        while (this.firstChild) {
            wrapper.appendChild(this.firstChild);
        }
        this._shadow.insertBefore(wrapper, this._slot);
        this._contentWrapper = wrapper;
    }

    _unparkContent(): void {
        if (!this._contentWrapper) {
            return;
        }
        // Back where the consumer put it. Mode B borrows their DOM; it does
        // not get to keep it.
        while (this._contentWrapper.firstChild) {
            this.appendChild(this._contentWrapper.firstChild);
        }
        this._contentWrapper.remove();
        this._contentWrapper = null;
    }

    // --- styles -----------------------------------------------------------

    _applyStyles(): void {
        const doc = this.ownerDocument;
        const host = hostStyleSheet(doc);
        const chrome = chromeStyleSheet(doc);

        if (host && chrome) {
            this._shadow.adoptedStyleSheets = [host, chrome, ...this._adopted];
            return;
        }

        // No constructable stylesheets: in-tree <style> elements instead.
        // Rebuilt rather than appended to, so adoptedCallback is idempotent.
        for (const style of this._fallbackStyles) {
            style.remove();
        }
        this._fallbackStyles = [hostStyles, chromeStyles].map(css => {
            const style = doc.createElement('style');
            style.setAttribute('data-content-tools', 'chrome');
            style.textContent = css;
            this._shadow.insertBefore(style, this._shadow.firstChild);
            return style;
        });
    }

    _applyContentStyles(): void {
        const href = this.contentStyles;
        if (this._contentLink && this._contentLink.getAttribute('href') === href) {
            return;
        }
        if (this._contentLink) {
            this._contentLink.remove();
            this._contentLink = null;
        }
        if (!href) {
            return;
        }
        const link = this.ownerDocument.createElement('link');
        link.setAttribute('data-content-tools', 'content-styles');
        link.rel = 'stylesheet';
        link.href = href;
        this._shadow.appendChild(link);
        this._contentLink = link;
    }

    // --- language ---------------------------------------------------------

    _applyLanguage(): void {
        const lang = this.uiLang;
        if (!lang) {
            return;
        }
        /* Sets the global and FETCHES NOTHING. Milestone 1 keeps network out
           of the element, and an auto-fetch would race start(). Consumers
           load the shipped translation JSON through
           ContentEdit.addTranslations() themselves. */
        ContentEdit.LANGUAGE = lang;

        /* Tooltips are baked in when a tool is mounted, so a mounted toolbox
           has to be re-rendered. Dialogs already open are NOT retranslated;
           that is a documented limitation rather than a bug to chase. */
        const toolbox = this._booted && this._app.toolbox();
        if (toolbox && toolbox.isMounted()) {
            toolbox.tools(toolbox.tools());
        }
    }
}
