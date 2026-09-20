import {
    claimLease, releaseLease, leaseOwner,
    setPendingTeardown, flushPendingTeardown
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
        flushPendingTeardown();
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
