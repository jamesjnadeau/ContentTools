import {createEventBridge} from '../../../src/element/event-bridge.js';

/* The editor-event -> DOM-event bridge, driven against a bare EditorApp and
   a plain <div>.
 
   The bridge needs no custom element, and testing it without one is what
   keeps the two failures distinguishable: once <content-tools-editor>
   exists, a broken bridge and a broken lifecycle both present as "my
   listener never fired". */

const FIXTURE = '<div data-editable data-name="body"><p>body</p></div>';

/** Every bridged event, with the DOM flags it is contractually required to carry. */
const CONTRACT = [
    ['start', true],
    ['stop', true],
    ['save', true],
    ['revert', true],
    ['started', false],
    ['stopped', false],
    ['saved', false]
];

let app;
let host;
let bridge;
let content;

beforeEach(() => {
    content = document.getElementById('test');
    content.innerHTML = FIXTURE;
    host = document.createElement('div');
    document.body.appendChild(host);
    app = ContentTools.EditorApp.get();
    bridge = createEventBridge(app, host);
});

afterEach(() => {
    try {
        if (app.isEditing()) app.stop(true);
    } catch { /* nothing to stop */ }
    if (bridge) bridge.dispose();
    try { app.destroy(); } catch { /* not initialised */ }
    host.remove();
    content.innerHTML = '';
});

/** Collect DOM events of the given type dispatched anywhere under document. */
function listen(type, target = host) {
    const seen = [];
    target.addEventListener(type, ev => seen.push(ev));
    return seen;
}

describe('the event bridge', () => {

    it.each(CONTRACT)('translates %s with the right DOM flags', (name, cancelable) => {
        const seen = listen(`ct-${name}`);
        app.dispatchEvent(app.createEvent(name, {marker: name}));

        expect(seen).toHaveLength(1);
        const ev = seen[0];
        /* `composed` is the whole contract: without it the event stops dead
           at the shadow boundary and every consumer listener on a parent
           node silently never fires. Asserted per event, not once. */
        expect(ev.composed).toBe(true);
        expect(ev.bubbles).toBe(true);
        expect(ev.cancelable).toBe(cancelable);
        expect(ev.detail).toEqual({marker: name});
    });

    it('really does escape a shadow boundary', () => {
        /* The flag above is necessary but is still only a flag. This is the
           behaviour it stands for, which is what actually breaks. */
        // Only one bridge, or the default light-DOM one would answer too
        // and the count below would say nothing about the boundary.
        bridge.dispose();
        bridge = null;

        const outer = document.createElement('div');
        document.body.appendChild(outer);
        const shadow = outer.attachShadow({mode: 'open'});
        const inner = document.createElement('div');
        shadow.appendChild(inner);

        const innerBridge = createEventBridge(app, inner);
        const seen = listen('ct-started', document);
        try {
            app.dispatchEvent(app.createEvent('started', null));
            expect(seen).toHaveLength(1);
            // Retargeted to the host on the way out, as any composed event is.
            expect(seen[0].target).toBe(outer);
        } finally {
            innerBridge.dispose();
            outer.remove();
        }
    });

    it('maps detail() the method onto detail the property', () => {
        // The one line the two event streams cost.
        const seen = listen('ct-saved');
        app.dispatchEvent(app.createEvent('saved', {regions: {body: '<p>x</p>'}, passive: true}));
        expect(seen[0].detail).toEqual({regions: {body: '<p>x</p>'}, passive: true});
    });

    it('reads back as null when the editor event had no detail', () => {
        /* Pinning the platform, not our code: `detail: undefined` in a
           CustomEventInit surfaces as null, so consumers never see
           undefined and an explicit `?? null` in the bridge would be dead
           weight. Asserted because it is the shape consumers code against. */
        const seen = listen('ct-started');
        app.dispatchEvent(app.createEvent('started', undefined));
        expect(seen[0].detail).toBe(null);
    });

    it('propagates a DOM preventDefault() back into the editor', () => {
        // `ComponentUI.dispatchEvent` returns `!defaultPrevented()`, which is
        // the fact the whole two-way cancellation rests on.
        host.addEventListener('ct-save', ev => ev.preventDefault());
        const legacy = app.createEvent('save', {passive: false});
        expect(app.dispatchEvent(legacy)).toBe(false);
        expect(legacy.defaultPrevented()).toBe(true);
    });

    it('does not cancel a non-cancelable event when the consumer tries', () => {
        /* Also the fact that lets the bridge skip a `cancelable` check
           before propagating a veto: dispatchEvent returns false only for
           an event that is both cancelable and cancelled. */
        host.addEventListener('ct-saved', ev => ev.preventDefault());
        const legacy = app.createEvent('saved', {regions: {}, passive: false});
        expect(app.dispatchEvent(legacy)).toBe(true);
        expect(legacy.defaultPrevented()).toBe(false);
    });

    it('vetoing ct-start leaves the real editor ready', () => {
        /* End to end through the actual lifecycle rather than a synthetic
           dispatch: this is the assertion that would catch the bridge being
           wired to the wrong event name. */
        app.init('[data-editable]', 'data-name', null, false);
        const started = listen('ct-started');
        host.addEventListener('ct-start', ev => ev.preventDefault());

        app.start();

        expect(app.getState()).toBe('ready');
        expect(app.isEditing()).toBe(false);
        expect(started).toHaveLength(0);
    });

    it('reports a real start as ct-start then ct-started', () => {
        app.init('[data-editable]', 'data-name', null, false);
        const order = [];
        for (const [name] of CONTRACT) {
            host.addEventListener(`ct-${name}`, () => order.push(name));
        }

        app.start();

        expect(order).toEqual(['start', 'started']);
        expect(app.isEditing()).toBe(true);
    });
});

describe('ct-busy', () => {

    it('fires on both edges of busy()', () => {
        // `busy` is a method that dispatches nothing, so the bridge patches
        // it -- the only hook that also catches the internal busy(true/false)
        // pair inside start().
        const seen = listen('ct-busy');
        app.busy(true);
        app.busy(false);
        expect(seen.map(ev => ev.detail.busy)).toEqual([true, false]);
        expect(seen[0].composed).toBe(true);
        expect(seen[0].bubbles).toBe(true);
        expect(seen[0].cancelable).toBe(false);
    });

    it('does not fire when busy() is READ', () => {
        app.busy(true);
        const seen = listen('ct-busy');
        expect(app.busy()).toBe(true);
        expect(seen).toHaveLength(0);
    });

    it('still sets the flag and forwards to the ignition', () => {
        // The patch must not swallow the original behaviour.
        app.init('[data-editable]', 'data-name', null, true);
        const ignitionBusy = vi.spyOn(app._ignition, 'busy');
        app.busy(true);
        expect(app._busy).toBe(true);
        expect(ignitionBusy).toHaveBeenCalledWith(true);
    });

    it('reports the transitions inside start()', () => {
        app.init('[data-editable]', 'data-name', null, false);
        const seen = listen('ct-busy');
        app.start();
        expect(seen.map(ev => ev.detail.busy)).toEqual([true, false]);
    });
});

describe('bridge disposal', () => {

    it('stops translating', () => {
        const seen = listen('ct-started');
        bridge.dispose();
        bridge = null;
        app.dispatchEvent(app.createEvent('started', null));
        expect(seen).toHaveLength(0);
    });

    it('leaves the consumer own bindings alone', () => {
        /* The reason disposal is targeted. `removeEventListener()` with no
           arguments clears `_bindings` wholesale, so the no-arg form would
           quietly take out anything the consumer bound directly to
           `el.editorApp` -- a bug with no error and no failing assertion
           anywhere near it. */
        let direct = 0;
        app.addEventListener('started', () => { direct += 1; });

        bridge.dispose();
        bridge = null;

        app.dispatchEvent(app.createEvent('started', null));
        expect(direct).toBe(1);
    });

    it('restores busy() to the prototype method', () => {
        const proto = Object.getPrototypeOf(app);
        expect(Object.prototype.hasOwnProperty.call(app, 'busy')).toBe(true);

        bridge.dispose();
        bridge = null;

        expect(Object.prototype.hasOwnProperty.call(app, 'busy')).toBe(false);
        expect(app.busy).toBe(proto.busy);

        const seen = listen('ct-busy');
        app.busy(true);
        expect(seen).toHaveLength(0);
    });

    it('does not uninstall a patch applied over ours', () => {
        // Restoring blindly would silently remove someone else's wrapper.
        const theirs = function (busy) { return busy; };
        app.busy = theirs;

        bridge.dispose();
        bridge = null;

        expect(app.busy).toBe(theirs);
        delete app.busy;
    });

    it('is idempotent', () => {
        bridge.dispose();
        expect(() => bridge.dispose()).not.toThrow();
        bridge = null;
    });
});
