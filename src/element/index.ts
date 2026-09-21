/* The `./element` entry point: importing it registers the tag.
 *
 * Registration is a SIDE EFFECT, which is the fragile part. `package.json`
 * lists `./dist/element.js` in its `sideEffects` allowlist, and the build
 * asserts that the built file really does contain the `customElements.define`
 * call -- if Rollup ever hoists it into the shared chunk, the allowlist entry
 * would silently stop covering it and `import '@.../element'` would compile
 * to nothing, with the tag never registering and no error anywhere.
 *
 * That is also why `TAG_NAME` is DECLARED in ./content-tools-editor.ts and
 * only re-exported here: this module is a build entry, and Rollup turns an
 * entry that another entry imports into a facade, hoisting its body -- the
 * `define` call included -- into a shared chunk. The shell imports the class
 * and the name from that module instead, and test/browser/shell/imports.spec.js
 * fails if it ever reaches for this one.
 */
import {ContentToolsEditor, TAG_NAME} from './content-tools-editor.js';

export {ContentToolsEditor, TAG_NAME};

/* Re-exported here rather than from the root entry: it is only useful to
   someone who already has a shadow root, and this entry is the one such a
   consumer has imported. See docs/root-context.md. */
export {default as ShadowRootContext} from '../core/shadow-root-context.js';

// Guarded so importing this module during SSR or in a test harness without a
// custom-element registry is inert rather than fatal, and so a double import
// (ESM + the IIFE build on one page) does not throw NotSupportedError.
if (typeof customElements !== 'undefined' && !customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, ContentToolsEditor);
}
