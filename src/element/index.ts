/* The `./element` entry point: importing it registers the tag.
 *
 * Registration is a SIDE EFFECT, which is the fragile part. `package.json`
 * lists `./dist/element.js` in its `sideEffects` allowlist, and the build
 * asserts that the built file really does contain the `customElements.define`
 * call -- if Rollup ever hoists it into the shared chunk, the allowlist entry
 * would silently stop covering it and `import '@.../element'` would compile
 * to nothing, with the tag never registering and no error anywhere.
 */
import {ContentToolsEditor} from './content-tools-editor.js';

export {ContentToolsEditor};
export const TAG_NAME = 'content-tools-editor';

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
