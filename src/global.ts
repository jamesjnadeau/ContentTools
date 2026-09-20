/* Browser-global entry, for the IIFE build.
 *
 * v1.6.16 shipped one script that attached five globals, and both the ported
 * spec suites and the golden-master fixture still load the library that way.
 * The namespace modules no longer touch `window` themselves -- it happens
 * here, in one place.
 *
 * This module deliberately exports NOTHING, and that is load-bearing. Vite
 * builds it as an IIFE named `ContentTools`, which compiles to
 * `var ContentTools = (function(exports){ ... return exports; })({})`. When
 * the entry has exports, that outer assignment runs AFTER the body and
 * overwrites the `window.ContentTools` set below with the module namespace
 * object -- so `ContentTools.EditorApp` reads undefined and every
 * script-tag integration breaks, with no build error and no failing unit
 * test. With no exports there is nothing to assign and the globals stand.
 *
 * Consumers who want bindings rather than globals import the ESM build
 * (`dist/index.js`) instead.
 */
// Installs the document-backed RootContext. Must precede the library
// imports: their module bodies construct elements through the context.
import './core/install-default.js';

import {FSM, HTMLString, ContentSelect, ContentEdit, ContentTools} from './index.js';

Object.assign(window, {FSM, HTMLString, ContentSelect, ContentEdit, ContentTools});
