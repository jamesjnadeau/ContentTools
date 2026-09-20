/* The ELEMENT driver: the same `window.__ct` surface as driver.js, driven
   through `<content-tools-editor>` instead of `EditorApp.get().init(...)`.
   Everything observable comes from driver-core.js, so a difference the
   scenarios see is a difference in the ELEMENT, not in the driver.
 *
 * A module, because the element ships as ESM -- which is also why this page
 * cannot reuse bundle-loader.js: that loader is built on `document.write`,
 * and `document.write` only takes classic scripts.
 *
 * The namespaces come from `/dist/index.js` rather than from a global. That
 * is not a convenience: the two ESM entries are built to share one copy of
 * the library, so `ContentEdit.Root` here MUST be the same object the
 * element drives. If the shared chunk ever breaks, the scenarios below stop
 * agreeing with the imperative page -- silently, everywhere at once, which
 * is exactly the failure the shared chunk exists to prevent.
 */
import '/dist/element.js';
import {ContentTools, ContentEdit, ContentSelect, HTMLString} from '/dist/index.js';

const el = document.querySelector('content-tools-editor');

/* Importing element.js above defined the tag, which upgraded and connected
   `el` synchronously -- so it has already read its attributes and booted.
   Asserted rather than assumed: a silently inert element would make every
   scenario below fail in a way that points nowhere near the cause. */
if (el.getAttribute('state') !== 'ready') {
    throw new Error(
        'element did not boot: state=' + el.getAttribute('state'));
}

window.__ct = window.__ctCreateDriver({
    globals: {ContentTools, ContentEdit, ContentSelect, HTMLString},
    // The one observation that moves: chrome lives in the shadow root.
    chromeRoot: () => el.shadowRoot,
    editorApp: () => el.editorApp,
    boot: opts => {
        /* Already booted, from the attributes on the page. The scenarios
           never override these, but a future one that did would otherwise
           be silently ignored here and compared against an imperative page
           that honoured it. */
        const regions = opts.regions || '[data-editable], [data-fixture]';
        const namingProp = opts.namingProp || 'data-name';
        if (regions !== el.getAttribute('regions')
                || namingProp !== el.getAttribute('naming-prop')) {
            throw new Error(
                'element-page.html is fixed at regions/naming-prop from its '
                + 'attributes; this scenario asks for something else');
        }
    },
    start: () => el.start(),
    stop: save => el.stop(save),
    save: passive => el.save(passive),
    revert: () => el.revert()
});
