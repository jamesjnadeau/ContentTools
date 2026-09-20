import '../../../src/element/index.js';
import {rootContext} from '../../../src/core/root-context.js';
import DocumentRootContext from '../../../src/core/document-root-context.js';
import ShadowRootContext from '../../../src/core/shadow-root-context.js';
import {leaseOwner} from '../../../src/element/editor-app-lease.js';

/* Shared scaffolding for the element suites.
 *
 * The element drives process-global singletons, so the thing that makes more
 * than one test per file possible is not tidy setup -- it is
 * `assertNoResidue()` proving that the previous one really let go. */

export const FIXTURE = `
  <h1 data-fixture data-name="title">Title</h1>
  <div data-editable data-name="body"><p>body one</p><p>body two</p></div>
  <div data-editable data-name="aside"><p>aside</p></div>
`;

/** Create (but do not connect) an element with the given attributes. */
export function create(attributes = {}, html = FIXTURE) {
    const el = document.createElement('content-tools-editor');
    for (const [name, value] of Object.entries(attributes)) {
        if (value === true) {
            el.setAttribute(name, '');
        } else if (value !== false && value !== null) {
            el.setAttribute(name, value);
        }
    }
    el.innerHTML = html;
    return el;
}

/** Create and connect one. */
export function mount(attributes, html) {
    const el = create(attributes, html);
    document.body.appendChild(el);
    return el;
}

/**
 * Remove an element and let its deferred teardown run.
 *
 * Teardown waits a microtask so a DOM move is not mistaken for a removal, so
 * nothing about the removal is observable until the queue drains.
 */
export async function unmount(el) {
    /* Captured BEFORE the removal. `destroy()` vacates the singleton slot,
       so reading `EditorApp.get()` after a teardown CONSTRUCTS a pristine
       app -- and every residue assertion below would then pass while
       describing an object the element never touched. */
    lastApp = el.editorApp || lastApp;
    el.remove();
    await Promise.resolve();
    await Promise.resolve();
}

/** The app the most recently unmounted element was driving. */
let lastApp = null;

/** Every `.ct-app` in the page, including inside element shadow roots. */
export function chromeRoots() {
    const found = [...document.querySelectorAll('.ct-app')];
    for (const el of document.querySelectorAll('content-tools-editor')) {
        if (el.shadowRoot) {
            found.push(...el.shadowRoot.querySelectorAll('.ct-app'));
        }
    }
    return found;
}

/**
 * Assert the page is back to how the element found it.
 *
 * Run from `afterEach`, this fails in the NEXT test's setup if teardown ever
 * stops being complete -- which, for something built on an unresettable
 * singleton, is the only way a leak surfaces at all rather than as an
 * unrelated test failing three files later.
 */
export function assertNoResidue() {
    expect(chromeRoots()).toHaveLength(0);
    expect(leaseOwner()).toBe(null);

    const context = rootContext();
    expect(context instanceof ShadowRootContext).toBe(false);
    expect(context instanceof DocumentRootContext).toBe(true);

    /* Nothing holds the slot. This is the strongest single statement of
       "the page is back to how the element found it": a stray `get()` on
       any teardown path would leave an app here, and `current()` -- unlike
       `get()` -- creates nothing to hide it. */
    expect(ContentTools.EditorApp.current()).toBe(null);

    /* ContentEdit.Root is shared with the host page and survives the app, so
       per-editor state left on it is what the NEXT editor inherits. The
       pointer gestures matter most: `startDragging`/`startResizing` both
       short-circuit when one is already in flight, so a leak here does not
       litter, it disables. */
    const root = ContentEdit.Root.get();
    expect(root.focused()).toBe(null);
    expect(root.dragging()).toBe(null);
    expect(root.resizing()).toBe(null);
    expect(Object.values(root._bindings).flat().filter(Boolean)).toHaveLength(0);

    /* The app the element was driving is finished, not repaired: its
       `_state` and `_regions` are the garbage of a destroyed object and
       nobody will read them again. What still matters about it is that it
       let go of the page and of the host. */
    const app = lastApp;
    if (app) {
        expect(app.isMounted()).toBe(false);
        /* The event bridge patches `busy` as an OWN property on the app,
           because the method dispatches nothing of its own. destroy()
           clears the app's listener map but knows nothing about that patch,
           so a bridge that was not disposed leaves a dead app emitting
           ct-busy at a host that is no longer in the page. */
        expect(Object.prototype.hasOwnProperty.call(app, 'busy')).toBe(false);
    }
}
