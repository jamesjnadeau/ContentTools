/* The `./shell` entry point: importing it registers `<content-tools-cms>`.
 *
 * Registration is a SIDE EFFECT and `package.json` lists `./dist/shell.js`
 * in its `sideEffects` allowlist, exactly as it does for the element; the
 * build asserts the `customElements.define` call really is in that file,
 * because the allowlist names a FILE and Rollup hoisting the call into a
 * shared chunk would silently stop the tag ever registering.
 *
 * This is a build ENTRY, so nothing else in `src/` may import it.
 * `test/browser/shell/imports.spec.js` enforces that, and since M6-3 one
 * rule more: nothing under `src/shell/` imports `src/element/` at all.
 * These screens mount no editor, and the editor's tag is registered by
 * the surface that does -- `./edit`, on the site's own pages.
 */
import {ContentToolsCms, TAG_NAME} from './content-tools-cms.js';

export {ContentToolsCms, TAG_NAME};

// Guarded for the same two reasons the element's is: a harness with no
// custom-element registry stays inert rather than fatal, and a double
// import does not throw NotSupportedError.
if (typeof customElements !== 'undefined' && !customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, ContentToolsCms);
}
