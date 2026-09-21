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
import {layered, sheetFactory} from '../core/constructed-styles.js';
import chromeCSS from '../styles/chrome.scss?inline';

/* The chrome goes in a cascade layer so that everything a consumer adds --
 * which stays outside it -- wins at equal specificity. See `layered()` for
 * why order alone cannot deliver that.
 *
 * The :host rules deliberately stay OUT of the layer: they are structural
 * defaults (an unstyled custom element is display:inline, which collapses
 * the editor), and a consumer overriding them is expected to work the same
 * way as any other consumer rule.
 */
export const chromeStyles: string = layered(chromeCSS, 'ct-chrome');

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

/**
 * The chrome stylesheet as a constructable sheet ready for
 * `shadowRoot.adoptedStyleSheets`, or null where that is unsupported (the
 * caller then falls back to a <style> element inside the root).
 */
export const chromeStyleSheet = sheetFactory(chromeStyles);

/** The host/structural sheet, same contract as chromeStyleSheet(). */
export const hostStyleSheet = sheetFactory(hostStyles);
