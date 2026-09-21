/* The `./shell` entry point: importing it registers `<content-tools-cms>`.
 *
 * Registration is a SIDE EFFECT and `package.json` lists `./dist/shell.js`
 * in its `sideEffects` allowlist, exactly as it does for the element; the
 * build asserts the `customElements.define` call really is in that file,
 * because the allowlist names a FILE and Rollup hoisting the call into a
 * shared chunk would silently stop the tag ever registering.
 *
 * This is a build ENTRY, so nothing else in `src/` may import it -- and for
 * the same reason the shell imports `../element/content-tools-editor.js`
 * rather than `../element/index.js`, which is the element's entry.
 * `test/browser/shell/imports.spec.js` enforces both directions.
 */
import {ContentToolsCms, TAG_NAME} from './content-tools-cms.js';

export {ContentToolsCms, TAG_NAME};
export {EDITOR_SLOT} from './content-tools-cms.js';

// Guarded for the same two reasons the element's is: a harness with no
// custom-element registry stays inert rather than fatal, and a double
// import does not throw NotSupportedError.
if (typeof customElements !== 'undefined' && !customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, ContentToolsCms);
}
