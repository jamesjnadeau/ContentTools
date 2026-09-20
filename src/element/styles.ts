/* The stylesheet the custom element adopts into its shadow root.
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
 * registered on the document instead. It also references no assets at all,
 * which is what makes inlining it as a string safe -- there is no url() whose
 * base would change.
 */
import chromeCSS from '../styles/chrome.scss?inline';

/* Constructed once per document and shared by every shadow root that adopts
   it. A CSSStyleSheet is bound to the document that created it, so this is
   keyed rather than a single module-scope constant -- an element inside an
   <iframe> has a different document. */
const sheets = new WeakMap<Document, CSSStyleSheet>();

/** The compiled chrome stylesheet, as text. */
export const chromeStyles: string = chromeCSS;

/**
 * The chrome stylesheet as a constructable sheet ready for
 * `shadowRoot.adoptedStyleSheets`, or null where that is unsupported (the
 * caller then falls back to a <style> element inside the root).
 */
export function chromeStyleSheet(doc: Document): CSSStyleSheet | null {
    if (typeof CSSStyleSheet === 'undefined' ||
            !('replaceSync' in CSSStyleSheet.prototype)) {
        return null;
    }
    let sheet = sheets.get(doc);
    if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(chromeCSS);
        sheets.set(doc, sheet);
    }
    return sheet;
}
