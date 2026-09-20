import ContentTools from '../scripts/index.js';
import {HTML_PROFILE} from '../core/profile.js';

/* The process-wide lease on the editor singletons, and the repair function
 * that makes reusing them possible.
 *
 * `ContentTools.EditorApp` and `ContentEdit.Root` are both singletons, so a
 * page can only ever have one live editor. That is a Milestone-2 problem to
 * fix properly; until then this module is where the consequences are
 * contained, deliberately in ONE deletable file rather than spread across the
 * element or pushed into `editor.ts` as a public `reset()` that would then
 * need deprecating.
 *
 * Two separate jobs live here because they are two halves of the same
 * constraint: the lease says who is allowed to hold the singletons, and
 * `resetEditorApp()` puts them back in a state the next holder can use.
 */

/** The element currently holding the singletons, or null. */
let owner: unknown = null;

/**
 * A teardown the outgoing owner has deferred to a microtask.
 *
 * A DOM MOVE fires `disconnectedCallback` and then `connectedCallback`
 * synchronously, so teardown cannot run on disconnect -- it has to wait a
 * turn and check whether the element came back. That delay opens a window in
 * which a genuinely new element, mounted in the same tick as the old one is
 * removed, would see the lease still held. `flushPendingTeardown()` closes
 * it: the claimant runs the incumbent's teardown itself, synchronously.
 *
 * This is why there is no waiting list and no promotion machinery -- the one
 * case those would serve is exactly the case this covers.
 *
 * There is no withdraw. A teardown that re-checks `isConnected` before
 * acting is a property rather than a protocol: it stays correct however the
 * flush is reached, whereas an element cancelling its own pending teardown
 * on reconnect is a second mechanism for the same thing that only works if
 * it is the one doing the flushing. Mutation testing showed them redundant,
 * so the weaker one went.
 */
let pendingTeardown: (() => void) | null = null;

/** Defer `fn` until a claimant flushes it or the owner cancels it. */
export function setPendingTeardown(fn: () => void): void {
    pendingTeardown = fn;
}

/**
 * Run any deferred teardown now, at most once.
 *
 * Cleared before the call rather than after, so a teardown that itself
 * schedules one (it should not, but the ordering must not depend on that)
 * cannot be lost or run twice.
 */
export function flushPendingTeardown(): void {
    const fn = pendingTeardown;
    pendingTeardown = null;
    if (fn) {
        fn();
    }
}

/**
 * Take the lease for `claimant`, or report that someone else holds it.
 *
 * Re-claiming is a no-op rather than an error: `_boot()` is idempotent by
 * its own `_booted` flag, and making the lease disagree would be a second
 * source of truth.
 */
export function claimLease(claimant: unknown): boolean {
    if (owner === claimant) {
        return true;
    }
    if (owner !== null) {
        // The incumbent may already be disconnected and merely waiting for
        // its microtask. Its teardown re-checks `isConnected`, so running it
        // early is safe: if the incumbent is still live this changes nothing
        // and the claim below correctly fails.
        flushPendingTeardown();
    }
    if (owner !== null) {
        return false;
    }
    owner = claimant;
    return true;
}

/** Release the lease, if `claimant` is the one holding it. */
export function releaseLease(claimant: unknown): void {
    if (owner === claimant) {
        owner = null;
    }
}

/** Who holds the lease. Exported for tests and for the conflict message. */
export function leaseOwner(): unknown {
    return owner;
}

/**
 * Return the `EditorApp` singleton to the state a freshly constructed one
 * would be in.
 *
 * That framing, rather than "undo what the element did", is what makes this
 * defensible: the field list below is the `_EditorApp` constructor's, in its
 * order, and a divergence is a bug in one place or the other rather than an
 * omission nobody can detect. `destroy()` is not enough on its own -- it
 * disposes the history and the highlight timer, unbinds the ContentEdit.Root
 * handlers, unmounts, and clears the listeners, but leaves `_state`,
 * `_regions`, `_regionQuery` and `_namingProp` exactly as they were. A second
 * boot onto that would find itself already `editing`.
 *
 * Call it AFTER `destroy()`: the widget handles this nulls are the ones
 * `unmount()` sets, and running them first would make `destroy()`'s own
 * `unmount()` a no-op and leave `.ct-app` in the page.
 *
 * Three fields below are not constructor fields, and are assigned because a
 * fresh app does not have them at all: `_highlightTimeout`, `_ctrlDown` and
 * `_shiftDown`. The timers behind the first are `destroy()`'s to dispose,
 * not this function's -- an app can be reset without ever being destroyed.
 */
export function resetEditorApp(): void {
    const app = ContentTools.EditorApp.get() as any;

    app.history = null;
    app._state = 'dormant';
    app._busy = false;
    app._namingProp = null;
    app._fixtureTest = domElement => domElement.hasAttribute('data-fixture');
    app._regionQuery = null;
    app._domRegions = null;
    app._regions = {};
    app._orderedRegions = [];
    app._rootLastModified = null;
    app._regionsLastModified = {};
    app._ignition = null;
    app._inspector = null;
    app._toolbox = null;
    app._emptyRegionsAllowed = false;
    app._profile = HTML_PROFILE;

    // Not constructor fields; see the note above.
    app._highlightTimeout = null;
    app._ctrlDown = undefined;
    app._shiftDown = undefined;
}
