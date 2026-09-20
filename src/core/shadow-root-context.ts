import DocumentRootContext from './document-root-context.js';

/**
 * A RootContext backed by a shadow root, so `<content-tools-editor>` can put
 * its chrome behind an encapsulation boundary.
 *
 * It extends DocumentRootContext rather than reimplementing it because most
 * of the seam is genuinely unchanged: geometry, storage, listeners and
 * element construction are all page- or document-level concerns that a shadow
 * root does not alter. Only mounting, global state and selection READS differ,
 * and those are the five methods overridden below.
 *
 * Two content scopes, per the element's `content-scope` attribute:
 *
 *   light (default, "Mode A")  Chrome lives in the shadow root; the editable
 *                              content stays in the host's light DOM and is
 *                              slotted. Chrome CSS is encapsulated -- the
 *                              actual pain point -- while the host page still
 *                              styles the content, so preview fidelity is
 *                              free and selection reads need no shadow
 *                              handling for content.
 *
 *   shadow ("Mode B")          Content lives in the shadow root too. Total
 *                              isolation, for a controlled preview pane, at
 *                              the cost of the consumer having to inject
 *                              their own site stylesheet.
 */
export default class ShadowRootContext extends DocumentRootContext {
    declare host: any;
    declare root: any;
    declare _scope: string;

    constructor(shadowRoot, options: any = {}) {
        const doc = shadowRoot.host.ownerDocument;
        // The document and window stay the real ones: scroll offsets, viewport
        // size and computed styles are all page-relative, and a shadow root
        // has no opinion about any of them.
        super(doc, doc.defaultView);
        this.root = shadowRoot;
        this.host = shadowRoot.host;
        this._scope = options.contentScope === 'shadow' ? 'shadow' : 'light';
    }

    // --- content scope ----------------------------------------------------

    /** 'light' (Mode A, the default) or 'shadow' (Mode B). */
    contentScopeMode() {
        return this._scope;
    }

    setContentScopeMode(mode) {
        this._scope = mode === 'shadow' ? 'shadow' : 'light';
    }

    // --- mounting ---------------------------------------------------------

    /**
     * Chrome is mounted into a container of our own inside the shadow root,
     * created on first use.
     *
     * A dedicated element rather than the shadow root itself: the editor
     * appends and removes children freely, and the shadow root also holds the
     * consumer's `<slot>` and adopted-stylesheet-independent markup that must
     * survive a stop/start cycle.
     */
    mountPoint() {
        if (!this._mountPoint) {
            const host = this.document.createElement('div');
            host.className = 'ct-app-host';
            this.root.appendChild(host);
            this._mountPoint = host;
        }
        return this._mountPoint;
    }

    /**
     * Where drag helpers and crop marks go.
     *
     * In Mode A this is `document.body`, NOT the shadow mount. The drag helper
     * is positioned in page coordinates over content that lives in the light
     * DOM, and putting it in the shadow root would make its offsets depend on
     * whether the host happens to establish a containing block (any transform,
     * filter, or `position: relative` on the host or an ancestor inside the
     * shadow root would do it). Keeping it in the document makes the
     * coordinates unconditionally correct.
     *
     * In Mode B the content is inside the shadow root, so the overlay must be
     * too or it cannot be positioned over it.
     */
    overlayPoint() {
        return this._scope === 'shadow' ? this.mountPoint() : this.document.body;
    }

    /**
     * The subtree region queries run against.
     *
     * Mode A: the host element, whose light-DOM children are the regions.
     * Mode B: the shadow root.
     *
     * An explicit setContentScope() still wins, so a consumer can narrow it
     * further.
     */
    contentScope() {
        if (this._contentScope) {
            return this._contentScope;
        }
        return this._scope === 'shadow' ? this.root : this.host;
    }

    // --- global UI state ---------------------------------------------------

    /**
     * Dual write: `document.body` and the shadow mount point.
     *
     * The body write is what the existing `.ce--dragging` / `.ce--resizing`
     * rules need -- they ship in the document-level content stylesheet and set
     * `cursor` and `user-select`, both inherited properties, so they do reach
     * into the shadow tree. What they cannot do is win against a chrome rule:
     * the toolbox, dialogs and inspector set `cursor: pointer` on their own
     * elements, which beats an inherited value regardless of `!important`.
     * The mount-point write gives the chrome sheet a selector it can use to
     * override that from inside the boundary.
     *
     * `no-scroll` stays document-only -- scroll locking is genuinely a page
     * concern and there is nothing inside the shadow root to lock.
     */
    setGlobalState(name, on) {
        super.setGlobalState(name, on);
        if (name === 'no-scroll') {
            return;
        }
        this.mountPoint().classList.toggle(`ce--${name}`, !!on);
    }

    // --- selection ----------------------------------------------------------

    /**
     * The first selected range, as a live Range, or null.
     *
     * Three engines answer this three different ways, which is why the chain
     * exists and why CI runs all three. What is NOT obvious -- and what a
     * probe against Chromium established -- is that the wrong branch does not
     * fail loudly. Called with the wrong shadow root, or with the older
     * bare-array signature it does not recognise, `getComposedRanges()`
     * returns a *retargeted* range pointing at the host's parent
     * (`BODY@2..3`) rather than throwing. So "the call did not throw" is
     * useless as a discriminator.
     *
     * Containment is the discriminator instead: a shadow-aware read is
     * trusted only when it lands inside this root. Each branch is tried and
     * validated, so an unrecognised signature costs a wasted call, never a
     * wrong caret.
     */
    getRange() {
        // 1. Chromium's non-standard ShadowRoot.getSelection(). It reports
        //    rangeCount 0 when the selection is not in this tree, so it
        //    declines cleanly in Mode A and we fall through to the document.
        const rootSelection = typeof this.root.getSelection === 'function'
            ? this.root.getSelection()
            : null;
        if (rootSelection && rootSelection.rangeCount > 0) {
            const range = rootSelection.getRangeAt(0);
            if (this._inRoot(range.startContainer)) {
                return range;
            }
        }

        const selection = this.getSelection();
        if (!selection) {
            return null;
        }

        // 2. Selection.getComposedRanges() -- Safari 17.4+, Chromium 137+.
        //    The signature churned: the current spec takes an options object,
        //    older WebKit took the shadow roots as a bare list. Both forms are
        //    tried, and the containment check below is what makes trying the
        //    wrong one safe.
        if (typeof selection.getComposedRanges === 'function') {
            const range = this._composedRange(selection);
            if (range) {
                return range;
            }
        }

        // 3. Firefox has neither of the above and does not retarget: its
        //    document selection reports real shadow nodes. That also makes
        //    this the correct answer for a light-DOM selection in Mode A.
        if (selection.rangeCount === 0) {
            return null;
        }
        const range = selection.getRangeAt(0);
        if (this._inRoot(range.startContainer)) {
            return range;
        }
        // Outside the root. In Mode A that is the content, so it is ours. In
        // Mode B the content is inside the root, so this is either a
        // retargeted approximation or a selection somewhere else on the page
        // -- neither is a position in our content, and reporting it would put
        // the caret or the tooltip rect in the wrong place.
        return this._scope === 'shadow' ? null : range;
    }

    /** Try each getComposedRanges signature; return the first live Range that lands in this root. */
    _composedRange(selection) {
        const attempts = [
            () => selection.getComposedRanges({shadowRoots: [this.root]}),
            () => selection.getComposedRanges(this.root)
        ];
        for (const attempt of attempts) {
            let staticRanges;
            try {
                staticRanges = attempt();
            } catch {
                continue;
            }
            if (!staticRanges || staticRanges.length === 0) {
                continue;
            }
            const staticRange = staticRanges[0];
            if (!this._inRoot(staticRange.startContainer)) {
                continue;
            }
            // A StaticRange has no insertNode(), which ContentSelect.Range
            // .rect() needs to measure a collapsed caret. Rebuilding a live
            // Range here is the whole reason getRange() exists as a seam
            // method rather than callers reading the selection themselves.
            const range = this.createRange();
            range.setStart(staticRange.startContainer, staticRange.startOffset);
            range.setEnd(staticRange.endContainer, staticRange.endOffset);
            return range;
        }
        return null;
    }

    /**
     * Whether a node is inside this shadow root, crossing nested shadow
     * boundaries on the way up.
     *
     * `root.contains()` alone stops at a nested root, so an input inside a
     * dialog that itself uses a shadow root would read as foreign.
     */
    _inRoot(node) {
        let current = node;
        while (current) {
            if (current === this.root || this.root.contains(current)) {
                return true;
            }
            const parentRoot = current.getRootNode ? current.getRootNode() : null;
            current = parentRoot && parentRoot.host ? parentRoot.host : null;
        }
        return false;
    }
}
