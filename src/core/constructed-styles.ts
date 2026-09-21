/* Turning a CSS string into a sheet a shadow root can adopt.
 *
 * Extracted from src/element/styles.ts when the shell became a second
 * caller. Two hand-rolled copies of the `@charset` guard below is how one
 * of them comes to be forgotten, and the whole reason it exists is that
 * nobody will notice when it starts mattering.
 */

/**
 * A memoised, per-document constructable sheet for one CSS string.
 *
 * The cache is per DOCUMENT rather than a single module-scope constant
 * because a constructed sheet is bound to the document that built it: an
 * element inside an `<iframe>` has a different one, and a sheet from the
 * wrong realm cannot be adopted at all.
 *
 * Returns null where constructable sheets are unsupported, which is the
 * caller's signal to fall back to a `<style>` element -- or, for a caller
 * that decides an unstyled-but-working UI is an acceptable floor, to skip.
 */
export function sheetFactory(css: string): (doc: Document) => CSSStyleSheet | null {
    const cache = new WeakMap<Document, CSSStyleSheet>();

    return function sheetFor(doc: Document): CSSStyleSheet | null {
        /* Take the constructor from the document's OWN window. A sheet
           built with this realm's CSSStyleSheet cannot be adopted into a
           shadow root in another document, which is the case the per
           document cache exists to serve. */
        const view = doc.defaultView as (Window & typeof globalThis) | null;
        const Ctor = view && view.CSSStyleSheet;
        if (!Ctor || !('replaceSync' in Ctor.prototype)) {
            return null;
        }
        let sheet = cache.get(doc);
        if (!sheet) {
            sheet = new Ctor();
            sheet.replaceSync(css);
            cache.set(doc, sheet);
        }
        return sheet;
    };
}

/**
 * Wrap CSS in a cascade layer.
 *
 * Consumer styles must beat ours at equal specificity, and sheet ORDER
 * cannot deliver that reliably: `adoptedStyleSheets` and in-tree `<link>`
 * elements are consulted in an order that is easy to get wrong and varies
 * with how the consumer supplied the sheet. A cascade layer is the
 * primitive built for exactly this -- an unlayered rule always beats a
 * layered one, whatever the order or the mechanism.
 *
 * The `@charset` strip is the part worth having in one place. `@charset` is
 * invalid inside a layer block and invalidates EVERYTHING in it, and Sass
 * emits one the moment its output contains a non-ASCII character. So today,
 * with both sheets pure ASCII, this is a no-op; the day somebody puts a
 * curly quote in a rule it is the difference between a styled UI and a
 * blank one, with no error anywhere.
 */
export function layered(css: string, layer: string): string {
    const body = css.replace(/^\s*@charset\s+[^;]+;\s*/i, '');
    return `@layer ${layer} {\n${body}\n}`;
}
