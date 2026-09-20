/* Browser-global entry, for the IIFE build.
 *
 * v1.6.16 shipped one script that attached five globals, and both the ported
 * spec suites and the golden-master fixture still load the library that way.
 * The namespace modules no longer touch `window` themselves -- it happens
 * here, in one place.
 */
// Installs the document-backed RootContext. Must precede the library
// imports: their module bodies construct elements through the context.
import './core/install-default.js';

import {FSM, HTMLString, ContentSelect, ContentEdit, ContentTools} from './index.js';

Object.assign(window, {FSM, HTMLString, ContentSelect, ContentEdit, ContentTools});

export {FSM, HTMLString, ContentSelect, ContentEdit, ContentTools};
export default ContentTools;
