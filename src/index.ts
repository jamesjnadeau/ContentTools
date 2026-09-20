/* Public ESM entry.
 *
 * The four libraries are imported in dependency order: HTMLString and
 * ContentSelect are leaves, ContentEdit builds on both, and ContentTools
 * builds on ContentEdit. Each barrel fixes the evaluation order inside its
 * own unit.
 */
// Installs the document-backed RootContext. Must precede the library
// imports: their module bodies construct elements through the context.
import './core/install-default.js';

import HTMLString from '../vendor-src/html-string/index.js';
import ContentSelect from '../vendor-src/content-select/index.js';
import ContentEdit from '../vendor-src/content-edit/scripts/index.js';
import ContentTools from './scripts/index.js';
import FSM from '../vendor-src/html-string/fsm.js';

export {FSM, HTMLString, ContentSelect, ContentEdit, ContentTools};
export default ContentTools;

/* The host seam, exported because it is an extension point rather than an
 * implementation detail -- see docs/root-context.md. Nothing in the v1.6.x
 * contract needs it, and an integration that never mentions it gets the
 * document-backed context installed above.
 *
 * `ShadowRootContext` is deliberately NOT here: it is only useful with a
 * shadow root, the element already depends on it, and re-exporting it from
 * this entry would drag ~9 KB into the IIFE build for every script-tag
 * consumer who will never construct one. It is exported from `./element`.
 */
export {rootContext, setRootContext, deepActiveElement} from './core/root-context.js';
export {default as DocumentRootContext} from './core/document-root-context.js';
