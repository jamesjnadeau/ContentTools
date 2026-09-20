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
