/* The stylesheet the shell adopts into its own shadow root.
 *
 * One sheet, not the element's three. The shell has no document half: it
 * renders no page content, so there is nothing it needs to style outside
 * its own root, and no @font-face to register (the editor's own
 * `icon-font.ts` does that for the editor's chrome, and the shell uses no
 * icons at all -- see the header of ./styles/shell.scss).
 *
 * `layered()` and `sheetFactory()` come from src/core rather than being
 * written again here; a second copy of the `@charset` guard is how the
 * first one comes to be forgotten.
 */
import {layered, sheetFactory} from '../core/constructed-styles.js';
import shellCSS from './styles/shell.scss?inline';

/* Its own layer, beside the editor's `ct-chrome`. A host page embedding
   the shell must be able to restyle it at equal specificity, and an
   unlayered rule beats a layered one whatever order the sheets arrive in.
   The layers are named separately so a page can reach one without the
   other -- restyling the CMS frame is a different intent from restyling
   the editor's toolbox. */
export const shellStyles: string = layered(shellCSS, 'ct-shell');

/**
 * The shell stylesheet as a constructable sheet for
 * `shadowRoot.adoptedStyleSheets`, or null where that is unsupported.
 *
 * A null here is not fatal for the shell the way it would be for the
 * editor: an unstyled frame is ugly and entirely usable, so the caller
 * skips rather than falling back to a `<style>` element.
 */
export const shellStyleSheet = sheetFactory(shellStyles);
