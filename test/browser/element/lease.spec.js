import {
    claimLease, releaseLease, leaseOwner, resetEditorApp,
    setPendingTeardown, clearPendingTeardown, flushPendingTeardown
} from '../../../src/element/editor-app-lease.js';
import {
    snapshotGlobals, applyGlobals, restoreGlobals, setStylePalette
} from '../../../src/element/globals.js';

/* The singleton plumbing, tested without the element.
 *
 * Everything here is process-global by nature, so these tests are the only
 * ones that can prove it in isolation: once the custom element exists, a
 * failure in the lease and a failure in the element's lifecycle look
 * identical from the outside. */

describe('the editor-app lease', () => {

    const A = {name: 'a'};
    const B = {name: 'b'};

    afterEach(() => {
        clearPendingTeardown();
        releaseLease(A);
        releaseLease(B);
    });

    it('grants to the first claimant and refuses the second', () => {
        expect(claimLease(A)).toBe(true);
        expect(claimLease(B)).toBe(false);
        expect(leaseOwner()).toBe(A);
    });

    it('is re-entrant for the holder', () => {
        // _boot() guards itself with its own flag; a lease that disagreed
        // would be a second source of truth for the same question.
        expect(claimLease(A)).toBe(true);
        expect(claimLease(A)).toBe(true);
    });

    it('is released only by its holder', () => {
        claimLease(A);
        releaseLease(B);
        expect(leaseOwner()).toBe(A);
        releaseLease(A);
        expect(leaseOwner()).toBe(null);
    });

    it('lets a claimant reclaim from an incumbent that is already leaving', () => {
        /* The case a waiting list would otherwise be needed for. Teardown is
           deferred a microtask so a DOM MOVE is not mistaken for a removal;
           a framework that mounts the replacement in the same tick would
           then find the lease still held. The claimant flushes it instead,
           synchronously. */
        claimLease(A);
        let ran = 0;
        setPendingTeardown(() => { ran += 1; releaseLease(A); });

        expect(claimLease(B)).toBe(true);
        expect(ran).toBe(1);
        expect(leaseOwner()).toBe(B);
    });

    it('does not hand over when the incumbent teardown declines', () => {
        // A move: the teardown runs, sees the element is still connected,
        // and keeps the lease. The claim must then fail.
        claimLease(A);
        setPendingTeardown(() => { /* still connected; keep it */ });
        expect(claimLease(B)).toBe(false);
        expect(leaseOwner()).toBe(A);
    });

    it('runs a deferred teardown at most once', () => {
        let ran = 0;
        setPendingTeardown(() => { ran += 1; });
        flushPendingTeardown();
        flushPendingTeardown();
        expect(ran).toBe(1);
    });

    it('withdraws a deferred teardown on reconnect', () => {
        let ran = 0;
        setPendingTeardown(() => { ran += 1; });
        clearPendingTeardown();
        flushPendingTeardown();
        expect(ran).toBe(0);
    });
});

describe('resetEditorApp', () => {

    const FIXTURE = '<div data-editable data-name="body"><p>body</p></div>';

    /** Everything a freshly constructed _EditorApp owns, and nothing else. */
    function freshApp() {
        return new (ContentTools.EditorApp.getCls())();
    }

    let host;

    beforeEach(() => {
        host = document.getElementById('test');
        host.innerHTML = FIXTURE;
    });

    afterEach(() => {
        const app = ContentTools.EditorApp.get();
        try {
            if (app.isEditing()) app.stop(true);
        } catch { /* nothing to stop */ }
        try { app.destroy(); } catch { /* not initialised */ }
        resetEditorApp();
        host.innerHTML = '';
    });

    /**
     * Assert the singleton is field-for-field what a fresh one would be.
     *
     * `Object.keys` of a fresh instance IS the constructor's field list --
     * the class uses `declare` rather than class fields, so nothing appears
     * that the constructor did not assign. Comparing against it means a
     * field added to the constructor later fails HERE rather than surfacing
     * as an element that boots into a stale state.
     */
    function expectConstructorState(app) {
        const fresh = freshApp();
        const keys = Object.keys(fresh);
        // Guard the guard: if the constructor is ever emptied, the loop
        // below would pass vacuously.
        expect(keys.length).toBeGreaterThan(10);

        for (const key of keys) {
            if (typeof fresh[key] === 'function') {
                continue;  // compared behaviourally in its own test
            }
            // Wrapped so a failure names the field rather than the value.
            expect({[key]: app[key]}).toEqual({[key]: fresh[key]});
        }
    }

    it('leaves the singleton exactly as constructed after a clean teardown', () => {
        // The element's own order: stop, then destroy, then repair.
        const app = ContentTools.EditorApp.get();
        app.init('[data-editable]', 'data-name', null, false);
        app.start();
        app.stop(true);
        app.destroy();

        resetEditorApp();

        expectConstructorState(app);
    });

    it('leaves the singleton exactly as constructed after a teardown MID-EDIT', () => {
        /* The adversarial path, and the one that actually exercises most of
           the field list: `stop()` clears `_regions` and the history stack
           on its way out, so a reset tested only against the clean order
           would pass with half of it deleted. Destroying while editing
           leaves regions mounted, a history interval running and
           `_state === 'editing'`. */
        const app = ContentTools.EditorApp.get();
        app.init('[data-editable]', 'data-name', null, false);
        app.start();

        expect(app.getState()).toBe('editing');
        expect(Object.keys(app._regions).length).toBeGreaterThan(0);
        expect(app.history).not.toBe(null);

        app.destroy();
        resetEditorApp();

        expectConstructorState(app);
    });

    it('restores the DEFAULT fixture test', () => {
        /* init() assigns fixtureTest only when truthy, so a custom one set
           by a previous consumer sticks to the singleton forever -- a
           documented wart. Restoring the constructor's default is what stops
           the element inheriting the last integration's idea of a fixture. */
        const app = ContentTools.EditorApp.get();
        app.init('[data-editable]', 'data-name', () => true, false);
        app.destroy();
        resetEditorApp();

        const plain = document.createElement('div');
        const fixture = document.createElement('div');
        fixture.setAttribute('data-fixture', '');
        expect(app._fixtureTest(plain)).toBe(false);
        expect(app._fixtureTest(fixture)).toBe(true);
    });

    it('stops the history interval that destroy() leaves running', () => {
        /* `stop()` disposes the history itself, so the spy has to go on
           AFTER destroy or it would be satisfied by a call the reset had
           nothing to do with. The interval is a real one -- `watch()` runs
           every 50ms and holds the region tree alive -- so leaving it is a
           leak, not an untidiness. */
        const app = ContentTools.EditorApp.get();
        app.init('[data-editable]', 'data-name', null, false);
        app.start();
        app.destroy();

        const history = app.history;
        expect(history).not.toBe(null);
        expect(history._watchInterval).toBeTruthy();
        const stop = vi.spyOn(history, 'stopWatching');

        resetEditorApp();

        expect(stop).toHaveBeenCalled();
        expect(app.history).toBe(null);
    });

    it('cancels the shift-to-highlight timer', () => {
        /* Not a constructor field, and the sharpest thing teardown leaves
           behind: the timer calls highlightRegions(), which iterates
           _domRegions -- null after a reset -- and would throw from a
           timeout with no stack pointing anywhere useful. */
        const app = ContentTools.EditorApp.get();
        app.init('[data-editable]', 'data-name', null, false);
        let fired = 0;
        app._highlightTimeout = setTimeout(() => { fired += 1; }, 5);

        app.destroy();
        resetEditorApp();
        expect(app._highlightTimeout).toBe(null);

        // Observing the callback, not just the field: nulling the handle
        // without clearing the timer leaves it to fire regardless.
        return new Promise(resolve => setTimeout(resolve, 30))
            .then(() => { expect(fired).toBe(0); });
    });

    it('is safe to call on an app that was never initialised', () => {
        expect(() => resetEditorApp()).not.toThrow();
        expect(ContentTools.EditorApp.get().getState()).toBe('dormant');
    });
});

describe('global configuration', () => {

    let saved;

    beforeEach(() => { saved = snapshotGlobals(); });
    afterEach(() => { restoreGlobals(saved); });

    it('round-trips all three globals', () => {
        const uploader = () => {};
        const styles = [new ContentTools.Style('Big', 'big')];

        applyGlobals({imageUploader: uploader, stylePalette: styles, uiLang: 'fr'});
        expect(ContentTools.IMAGE_UPLOADER).toBe(uploader);
        expect(ContentTools.StylePalette.styles()).toHaveLength(1);
        expect(ContentEdit.LANGUAGE).toBe('fr');

        restoreGlobals(saved);
        expect(ContentTools.IMAGE_UPLOADER).toBe(saved.imageUploader);
        expect(ContentTools.StylePalette.styles()).toEqual(saved.stylePalette);
        expect(ContentEdit.LANGUAGE).toBe(saved.language);
    });

    it('writes only the keys it is given', () => {
        // Setting one element property must not silently clear the others.
        const uploader = () => {};
        applyGlobals({imageUploader: uploader});
        applyGlobals({uiLang: 'de'});
        expect(ContentTools.IMAGE_UPLOADER).toBe(uploader);
        expect(ContentEdit.LANGUAGE).toBe('de');
    });

    it('treats null as an explicit clear, not as absent', () => {
        applyGlobals({imageUploader: () => {}});
        applyGlobals({imageUploader: null});
        expect(ContentTools.IMAGE_UPLOADER).toBe(null);
    });

    it('REPLACES the style palette rather than appending to it', () => {
        /* StylePalette.add() is global and append-only -- no remove, no
           clear -- so applying a palette on every connect would list every
           style two, three, four times in the properties dialog. */
        const styles = [new ContentTools.Style('Big', 'big')];
        setStylePalette(styles);
        setStylePalette(styles);
        setStylePalette(styles);
        expect(ContentTools.StylePalette.styles()).toHaveLength(1);
    });

    it('does not alias the caller array', () => {
        // A snapshot or a palette that aliases live state is a bug waiting
        // for the day StylePalette mutates in place instead of concatenating.
        const styles = [new ContentTools.Style('Big', 'big')];
        setStylePalette(styles);
        styles.push(new ContentTools.Style('Small', 'small'));
        expect(ContentTools.StylePalette.styles()).toHaveLength(1);
    });

    it('snapshots the palette by value, not by reference', () => {
        /* Mutating `_styles` IN PLACE rather than through add(), which
           concatenates onto a new array: a snapshot that aliased the live
           list would already have the extra style in it and restore to the
           wrong thing. That is the failure the slice exists for, and add()
           cannot express it. */
        setStylePalette([new ContentTools.Style('Big', 'big')]);
        const before = snapshotGlobals();
        ContentTools.StylePalette._styles.push(new ContentTools.Style('Small', 'small'));
        expect(ContentTools.StylePalette.styles()).toHaveLength(2);
        restoreGlobals(before);
        expect(ContentTools.StylePalette.styles()).toHaveLength(1);
    });
});
