/**
 * The single seam between this library and its host environment.
 *
 * Every `document` and `window` access in the library goes through a
 * RootContext. Today there is one implementation, DocumentRootContext, which
 * does exactly what the bare globals did. The point is what comes next: a
 * ShadowRootContext can answer the same questions against a shadow root, so
 * `<content-tools-editor>` can isolate its chrome without the rest of the
 * library knowing anything changed.
 *
 * It also makes the DOM mockable, which is why the focus-descent and
 * global-state logic can be unit tested without a browser.
 *
 * An ESLint rule forbids `document` and `window` everywhere in src/ and
 * vendor-src/ except the implementations in this directory, so the seam
 * cannot quietly rot.
 */

/** @type {RootContext|null} */
let current = null;

/**
 * The context in force. Defaults to the document-backed one, so existing
 * integrations that never mention a context keep working unchanged.
 */
export function rootContext() {
    if (current === null) {
        // Imported lazily to keep this module free of a cycle: the
        // implementation imports nothing from here.
        throw new Error(
            'No RootContext installed. Import src/core/install-default.js, or ' +
            'call setRootContext() with your own implementation.');
    }
    return current;
}

/** Install a context. Returns the previous one, so tests can restore it. */
export function setRootContext(ctx) {
    const previous = current;
    current = ctx;
    return previous;
}

/**
 * Walk down through any open shadow roots to the element that really has
 * focus. `document.activeElement` stops at the shadow host, which is why a
 * dialog input inside a shadow root cannot be found without this.
 *
 * Exported because both implementations need it and it is worth testing on
 * its own.
 */
export function deepActiveElement(doc) {
    let el = doc.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    return el;
}
