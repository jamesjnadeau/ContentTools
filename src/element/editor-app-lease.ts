/* The process-wide lease on the editor singletons.
 *
 * `ContentTools.EditorApp` and `ContentEdit.Root` are both singletons, so a
 * page can only ever have one live editor. That is a deliberate rule rather
 * than a bug to fix: the CMS shell opens one entry at a time. This module
 * says who holds the singletons, so a second element degrades loudly instead
 * of fighting the first for them.
 *
 * It used to hold a `resetEditorApp()` as well, hand-restoring eighteen
 * fields of the live app because `EditorApp.get()` kept handing back the
 * instance `destroy()` had just torn down. `destroy()` is terminal now
 * (`editor.ts`, `EditorApp._discard`), so the next `get()` builds a fresh
 * app and the constructor is the only description of initial state.
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
