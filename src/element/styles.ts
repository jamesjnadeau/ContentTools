/* The stylesheets the custom element puts into its shadow root.
 *
 * Three sheets come out of one Sass source, and which one goes where is the
 * whole point of the split:
 *
 *   dist/content-tools.css          everything, for consumers not using the
 *                                   element. Unchanged from v1.6.16.
 *   dist/content-tools-content.css  the rules that must reach the DOCUMENT --
 *                                   content styles, the <body> flags and the
 *                                   icon @font-face. The consumer links this.
 *   chrome.scss?inline (here)       the editor's own furniture, adopted into
 *                                   the shadow root.
 *
 * The chrome sheet carries no @font-face on purpose: one declared inside a
 * shadow root is ignored by Chromium and WebKit, so the icon font has to be
 * registered on the document instead (see ./icon-font.ts). It also
 * references no assets at all, which is what makes inlining it as a string
 * safe -- there is no url() whose base would change.
 */
import chromeCSS from '../styles/chrome.scss?inline';

/* Consumer styles must beat the editor's at equal specificity, and sheet
 * ORDER cannot deliver that reliably: adoptedStyleSheets and in-tree <link>
 * elements are consulted in an order that is easy to get wrong and varies
 * with how the consumer supplied the sheet. A cascade layer is the primitive
 * built for exactly this -- unlayered rules always win over layered ones,
 * whatever the order or the mechanism -- so the chrome goes in one and
 * everything the consumer adds stays outside it.
 *
 * The :host rules deliberately stay OUT of the layer: they are structural
 * defaults (an unstyled custom element is display:inline, which collapses
 * the editor), and a consumer overriding them is expected to work the same
 * way as any other consumer rule.
 */
const LAYER = 'ct-chrome';

/* @charset is invalid inside a layer block and would invalidate everything
 * in it. Sass emits one only when the output contains a non-ASCII character,
 * which today it does not -- so this strip is currently a no-op and is here
 * to stop a future glyph in a chrome rule silently blanking the whole sheet.
 * styles.spec.js asserts the layered text still parses to real rules. */
const chromeBody = chromeCSS.replace(/^\s*@charset\s+[^;]+;\s*/i, '');

/** The chrome stylesheet as text, wrapped in its cascade layer. */
export const chromeStyles: string = `@layer ${LAYER} {\n${chromeBody}\n}`;

/* The element's own structural CSS. It cannot live in chrome.scss:
 * test/golden/styles.spec.mjs asserts the two halves of the split are an
 * exact partition of dist/content-tools.css, so any selector that is not in
 * the full sheet fails the "neither half invents a rule" check. These
 * selectors describe the custom element, which the full sheet knows nothing
 * about, so they belong here. */
export const hostStyles: string = [
    /* An unstyled custom element is display:inline, which gives the host a
       zero content box and collapses everything inside it. */
    ':host { display: block; position: relative; }',
    ':host([hidden]) { display: none; }',
    /* Mode B only: the wrapper the light-DOM content is parked in. */
    '.ct-content { display: block; }'
].join('\n');

/* Constructed sheets are bound to the document that created them, so they
   are cached per document rather than in a single module-scope constant --
   an element inside an <iframe> has a different one. */
const chromeSheets = new WeakMap<Document, CSSStyleSheet>();
const hostSheets = new WeakMap<Document, CSSStyleSheet>();

function construct(
        doc: Document,
        cache: WeakMap<Document, CSSStyleSheet>,
        css: string
        ): CSSStyleSheet | null {
    // Take the constructor from the document's own window. A sheet built
    // with this realm's CSSStyleSheet cannot be adopted into a shadow root
    // in another document, which is the case this WeakMap exists to serve.
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
}

/**
 * The chrome stylesheet as a constructable sheet ready for
 * `shadowRoot.adoptedStyleSheets`, or null where that is unsupported (the
 * caller then falls back to a <style> element inside the root).
 */
export function chromeStyleSheet(doc: Document): CSSStyleSheet | null {
    return construct(doc, chromeSheets, chromeStyles);
}

/** The host/structural sheet, same contract as chromeStyleSheet(). */
export function hostStyleSheet(doc: Document): CSSStyleSheet | null {
    return construct(doc, hostSheets, hostStyles);
}
