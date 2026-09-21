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
import {
    ContentToolsCms, ContentToolsEditor, EDITOR_TAG, TAG_NAME
} from './content-tools-cms.js';

export {ContentToolsCms, TAG_NAME};
export {EDITOR_SLOT} from './content-tools-cms.js';

// Guarded for the same two reasons the element's is: a harness with no
// custom-element registry stays inert rather than fatal, and a double
// import does not throw NotSupportedError.
if (typeof customElements !== 'undefined') {
    if (!customElements.get(TAG_NAME)) {
        customElements.define(TAG_NAME, ContentToolsCms);
    }
    /* The EDITOR's tag too, because the shell creates one and nothing
       else here would have registered it -- `./element`'s own entry is
       the module the shell may not import. An unregistered tag is not an
       error: `createElement` returns an inert unknown element, so the
       entry would open to an empty pane with a clean console. Guarded on
       `get` so a page that also loaded `./element` is unaffected, and so
       whichever registered it first wins rather than throwing. */
    if (!customElements.get(EDITOR_TAG)) {
        customElements.define(EDITOR_TAG, ContentToolsEditor);
    }
}
