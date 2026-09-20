import * as lib from '../../src/index.js';
import * as element from '../../src/element/index.js';
import DocumentRootContext from '../../src/core/document-root-context.js';
import ShadowRootContext from '../../src/core/shadow-root-context.js';

/* What the package promises by NAME.
 *
 * The surface spec next door checks that the library still behaves; this
 * checks that the entries still export what the docs tell people to import.
 * Both matter and neither implies the other: a rename here breaks every
 * consumer at build time with a clean error, which is exactly the kind of
 * break that is easy to ship because nothing in the library itself notices.
 */
describe('public ESM exports', () => {

    it('the root entry exports the five namespaces', () => {
        for (const name of ['FSM', 'HTMLString', 'ContentSelect', 'ContentEdit', 'ContentTools']) {
            expect(lib[name], name).toBeTruthy();
        }
        expect(lib.default).toBe(lib.ContentTools);
    });

    it('the root entry exports the host seam', () => {
        expect(typeof lib.rootContext).toBe('function');
        expect(typeof lib.setRootContext).toBe('function');
        expect(typeof lib.deepActiveElement).toBe('function');
        expect(lib.DocumentRootContext).toBe(DocumentRootContext);
    });

    it('a document-backed context is already installed', () => {
        // Importing the entry installs it, so an integration that never
        // mentions a context gets v1.6.x behaviour without knowing one exists.
        expect(lib.rootContext()).toBeInstanceOf(DocumentRootContext);
    });

    it('setRootContext swaps the context and hands back the previous one', () => {
        const replacement = new DocumentRootContext(document, window);
        const previous = lib.setRootContext(replacement);
        try {
            expect(lib.rootContext()).toBe(replacement);
        } finally {
            // Restoring matters more than usual: the context is process-wide,
            // and every later spec in this run would otherwise be driving a
            // different one.
            expect(lib.setRootContext(previous)).toBe(replacement);
        }
        expect(lib.rootContext()).toBe(previous);
    });

    it('the element entry exports the tag, the class and the shadow context', () => {
        expect(element.TAG_NAME).toBe('content-tools-editor');
        expect(customElements.get(element.TAG_NAME)).toBe(element.ContentToolsEditor);
        /* ShadowRootContext is exported from HERE and not from the root
           entry, so the IIFE build does not carry it for script-tag
           consumers who will never construct one. */
        expect(element.ShadowRootContext).toBe(ShadowRootContext);
        expect(lib.ShadowRootContext).toBeUndefined();
    });
});
