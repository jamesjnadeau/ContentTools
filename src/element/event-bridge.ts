/* The bridge between the editor's own event system and DOM events.
 *
 * `EditorApp` dispatches `ContentTools.Event` objects to callbacks it holds
 * in a plain map. Nothing about that reaches the DOM, so an element that did
 * not translate would have a shadow root full of editor and no way for the
 * page to know anything had happened.
 *
 * TWO EVENT STREAMS, DOCUMENTED AS TWO. `ContentTools.Event.detail()` is a
 * METHOD; a DOM CustomEvent carries a `.detail` PROPERTY. The tempting fix --
 * one object that answers to both -- was rejected: it would have to be a
 * function with properties hung off it, every `typeof detail === 'object'`
 * check in consumer code would flip, and the legacy contract is worth more
 * intact than unified. The mismatch is handled in one line below, and
 * consumers of the element see only the DOM stream.
 */

/** The editor events that become `ct-*` DOM events, and which can be vetoed. */
const BRIDGED: ReadonlyArray<{name: string; cancelable: boolean}> = [
    // The four intents. A `preventDefault()` on these aborts the action.
    {name: 'start', cancelable: true},
    {name: 'stop', cancelable: true},
    {name: 'save', cancelable: true},
    {name: 'revert', cancelable: true},
    // The three facts. Cancelling something that already happened is
    // meaningless, so they are not cancelable and the flag is asserted.
    {name: 'started', cancelable: false},
    {name: 'stopped', cancelable: false},
    {name: 'saved', cancelable: false}
];

export interface EventBridge {
    dispose(): void;
}

/**
 * Translate `app`'s events into DOM events on `host`, until disposed.
 *
 * `host` is anything with `dispatchEvent` and an `ownerDocument` -- the
 * custom element in production, a plain `<div>` in the tests, which is what
 * keeps this module testable without the element existing.
 */
export function createEventBridge(app: any, host: Element): EventBridge {
    const view: any = (host.ownerDocument as any)?.defaultView ?? null;
    // Construct events in the HOST's realm. An element inside an <iframe>
    // gets events whose `instanceof CustomEvent` holds for the page that
    // receives them, which is not true of one built here.
    const CustomEventCtor: typeof CustomEvent =
        (view && view.CustomEvent) || CustomEvent;

    function emit(type: string, detail: any, cancelable: boolean): boolean {
        return host.dispatchEvent(new CustomEventCtor(type, {
            detail,
            // `composed` is the whole contract. Without it the event stops
            // dead at the shadow boundary and every consumer listener on a
            // parent node silently never fires -- so it is asserted per
            // event rather than once.
            bubbles: true,
            composed: true,
            cancelable
        }));
    }

    const bound: Array<[string, (ev: any) => void]> = [];

    for (const {name, cancelable} of BRIDGED) {
        const handler = (ev: any) => {
            // The one line the two event streams cost: a method call on the
            // way in, a property on the way out.
            const proceed = emit(`ct-${name}`, ev.detail(), cancelable);
            if (!proceed) {
                /* Cancellation propagates INWARDS because
                   `ComponentUI.dispatchEvent` returns `!defaultPrevented()`
                   on both of its paths, so the editor's own caller sees the
                   veto and aborts.

                   No `cancelable &&` here: `dispatchEvent` returns false
                   only for an event that is cancelable AND was cancelled,
                   so the guard would be unreachable. Pinned by the
                   "does not cancel a non-cancelable event" test, which is
                   what makes leaving it out safe. */
                ev.preventDefault();
            }
        };
        app.addEventListener(name, handler);
        bound.push([name, handler]);
    }

    const restoreBusy = patchBusy(app, busy => {
        emit('ct-busy', {busy}, false);
    });

    return {
        dispose() {
            for (const [name, handler] of bound) {
                // TARGETED removal, never `removeEventListener()` with no
                // arguments: that form wipes `_bindings` wholesale and would
                // take the consumer's own direct bindings with it.
                app.removeEventListener(name, handler);
            }
            bound.length = 0;
            restoreBusy();
        }
    };
}

/**
 * Report `busy(true/false)` by wrapping the method on the instance.
 *
 * `busy` is a plain getter/setter method that dispatches NO event, so there
 * is nothing to listen to. Patching it is also the only hook that catches
 * the internal `busy(true)`/`busy(false)` pair inside `start()`, which is
 * the transition a shell most wants to render.
 *
 * Returns the undo. An own property is deleted so the prototype method comes
 * back; a pre-existing own property (someone else patched first) is put back
 * as it was, because clobbering another patch on the way out would be a
 * worse bug than the one this solves.
 */
function patchBusy(app: any, onChange: (busy: boolean) => void): () => void {
    const hadOwn = Object.prototype.hasOwnProperty.call(app, 'busy');
    const previous = app.busy;

    const patched = function patchedBusy(this: any, busy: any) {
        const result = previous.call(this, busy);
        // A read -- `busy()` with no argument -- is not a change.
        if (busy !== undefined) {
            onChange(!!busy);
        }
        return result;
    };
    app.busy = patched;

    return () => {
        // If something patched over us since, leave it be: restoring here
        // would silently uninstall someone else's wrapper.
        if (app.busy !== patched) {
            return;
        }
        if (hadOwn) {
            app.busy = previous;
        } else {
            delete app.busy;
        }
    };
}
