import {deepActiveElement} from './root-context.js';

/**
 * The document-backed RootContext: exactly the behaviour the library had when
 * it reached for `document` and `window` directly. Phase 4 introduces the
 * seam without changing what happens behind it, so every method here is a
 * faithful restatement of the call it replaced.
 */
export default class DocumentRootContext {
    declare _contentScope: any;
    declare _mountPoint: any;
    declare document: any;
    declare root: any;
    declare window: any;

    constructor(doc = document, win = window) {
        this.document = doc;
        this.window = win;
        /** Where the editor's chrome is mounted. */
        this.root = doc;
        this._mountPoint = null;
        this._contentScope = null;
    }

    // --- mounting -------------------------------------------------------

    /** Where editor chrome (toolbox, dialogs, inspector) is attached. */
    mountPoint() {
        return this._mountPoint || this.document.body;
    }

    setMountPoint(el) {
        this._mountPoint = el;
    }

    /** Where drag helpers and crop marks go. Same node in light DOM. */
    overlayPoint() {
        return this.mountPoint();
    }

    /** The subtree region queries run against. */
    contentScope() {
        return this._contentScope || this.document;
    }

    setContentScope(node) {
        this._contentScope = node;
    }

    // --- element construction -------------------------------------------

    createElement(tagName) {
        return this.document.createElement(tagName);
    }

    createTextNode(text) {
        return this.document.createTextNode(text);
    }

    createRange() {
        return this.document.createRange();
    }

    /**
     * A detached document used to sanitise untrusted HTML without running
     * scripts or loading resources in the live page.
     */
    createSandboxDocument() {
        return this.document.implementation.createHTMLDocument();
    }

    // --- selection ------------------------------------------------------

    getSelection() {
        return this.window.getSelection();
    }

    clearSelection() {
        const selection = this.getSelection();
        if (selection) selection.removeAllRanges();
    }

    // --- focus ----------------------------------------------------------

    /** Descends through open shadow roots; in light DOM this is activeElement. */
    getActiveElement() {
        return deepActiveElement(this.document);
    }

    hasFocus() {
        return this.document.hasFocus();
    }

    // --- global UI state -------------------------------------------------

    /**
     * Page-level flags the library toggles while dragging, resizing or
     * showing a modal. A shadow-backed context has to write these in two
     * places; in light DOM one is enough.
     */
    setGlobalState(name, on) {
        const className = name === 'no-scroll' ? 'ct--no-scroll' : `ce--${name}`;
        this.document.body.classList.toggle(className, !!on);
    }

    // --- geometry and environment ----------------------------------------

    scrollPosition() {
        const win = this.window;
        if (win.pageXOffset !== undefined) {
            return [win.pageXOffset, win.pageYOffset];
        }
        // Quirks mode reports scroll on <body>, standards mode on <html>.
        const isCSS1Compat = (this.document.compatMode || 4) === 4;
        return isCSS1Compat
            ? [this.document.documentElement.scrollLeft,
               this.document.documentElement.scrollTop]
            : [this.document.body.scrollLeft, this.document.body.scrollTop];
    }

    viewportSize() {
        return [this.window.innerWidth, this.window.innerHeight];
    }

    pageWidth() {
        return this.document.documentElement.clientWidth ||
               this.document.body.clientWidth;
    }

    getComputedStyle(el) {
        return this.window.getComputedStyle(el);
    }

    /**
     * Whether the host supports getComputedStyle at all.
     *
     * Read live rather than assumed: the widget code falls back to unmounting
     * immediately when it is unavailable, and a spec exercises that path by
     * nulling window.getComputedStyle to stop transition monitoring.
     */
    supportsComputedStyle() {
        return Boolean(this.window.getComputedStyle);
    }

    confirm(message) {
        return this.window.confirm(message);
    }

    /**
     * The event currently being dispatched.
     *
     * Only the drag-clone check uses this, to read altKey. It reaches for a
     * global because ContentEdit's dropper functions take
     * (element, target, placement) and never received the event -- changing
     * that signature would break every consumer-defined dropper, so the read
     * is routed here rather than fixed. Worth revisiting when droppers are
     * next revised.
     */
    currentEvent() {
        return this.window.event;
    }

    /** Legacy IE clipboard access; null everywhere else. */
    clipboardData() {
        return this.window.clipboardData || null;
    }

    /** True on the legacy IE rendering path ContentEdit still branches on. */
    isLegacyIE() {
        return Boolean(this.document.documentMode);
    }

    // --- storage ----------------------------------------------------------

    /**
     * Persisted UI preferences (toolbox position, last-used dialog tab).
     *
     * Wrapped because localStorage throws in a sandboxed iframe and in
     * Safari's private mode, where the library previously would have taken
     * the whole editor down with it.
     */
    storage() {
        const win = this.window;
        return {
            getItem(key) {
                try { return win.localStorage.getItem(key); } catch { return null; }
            },
            setItem(key, value) {
                try { win.localStorage.setItem(key, value); } catch { /* ignore */ }
            }
        };
    }

    // --- listeners --------------------------------------------------------

    /**
     * Add a document- or window-level listener and get back a disposer.
     *
     * The library used to remove these by re-deriving the same bound
     * function, which is easy to get subtly wrong and was untested. Returning
     * the disposer makes teardown structurally correct.
     */
    /**
     * Add a document- or window-level listener, paired with off().
     *
     * These exist alongside addGlobalListener because the library's existing
     * teardown removes listeners by function identity; converting all of it
     * to disposers at the same time as introducing this seam would have made
     * a behaviour-preserving phase unverifiable.
     */
    on(target, type, fn, opts) {
        (target === 'window' ? this.window : this.document)
            .addEventListener(type, fn, opts);
    }

    off(target, type, fn, opts) {
        (target === 'window' ? this.window : this.document)
            .removeEventListener(type, fn, opts);
    }

    addGlobalListener(target, type, fn, opts) {
        const node = target === 'window' ? this.window : this.document;
        node.addEventListener(type, fn, opts);
        return () => node.removeEventListener(type, fn, opts);
    }
}
