import {setRootContext} from '../../../src/core/root-context.js';
import DocumentRootContext from '../../../src/core/document-root-context.js';
import ShadowRootContext from '../../../src/core/shadow-root-context.js';

/* ShadowRootContext against a real shadow root.
 *
 * These cannot be faked. The whole point of the class is that Chromium,
 * WebKit and Firefox each answer "what is selected?" through a different API,
 * and a mock would only ever assert the branch its author already believed
 * in. Chromium is what runs here; the other two arrive with the three-engine
 * Playwright matrix. */

/** Build a host + shadow root, with editable content in one place or the other. */
function mount(mode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({mode: 'open'});
    const content = document.createElement('div');
    content.contentEditable = 'true';
    content.textContent = 'hello world';
    if (mode === 'shadow') {
        shadow.appendChild(content);
    } else {
        shadow.appendChild(document.createElement('slot'));
        host.appendChild(content);
    }
    return {host, shadow, content};
}

describe('ShadowRootContext', () => {
    let fixtures = [];

    function make(mode) {
        const parts = mount(mode);
        fixtures.push(parts.host);
        return {
            ...parts,
            ctx: new ShadowRootContext(parts.shadow, {contentScope: mode})
        };
    }

    afterEach(() => {
        for (const host of fixtures) host.remove();
        fixtures = [];
        window.getSelection().removeAllRanges();
        document.body.classList.remove('ce--dragging', 'ce--resizing', 'ct--no-scroll');
    });

    describe('environment', () => {

        it('keeps the real document and window', () => {
            // Geometry is page-relative -- scroll offsets, viewport size and
            // computed styles mean nothing scoped to a shadow root.
            const {ctx, shadow} = make('light');
            expect(ctx.root).toBe(shadow);
            expect(ctx.document).toBe(document);
            expect(ctx.window).toBe(window);
            expect(ctx.createElement('span').ownerDocument).toBe(document);
        });

        it('defaults to Mode A when no content scope is given', () => {
            const {shadow} = make('light');
            expect(new ShadowRootContext(shadow).contentScopeMode()).toBe('light');
            expect(new ShadowRootContext(shadow, {contentScope: 'nonsense'})
                .contentScopeMode()).toBe('light');
        });
    });

    describe('mounting', () => {

        it('creates one .ct-app-host inside the shadow root', () => {
            const {ctx, shadow} = make('light');
            const mountPoint = ctx.mountPoint();
            expect(mountPoint.className).toBe('ct-app-host');
            expect(mountPoint.parentNode).toBe(shadow);
            // Memoised: start/stop cycles must not accumulate containers.
            expect(ctx.mountPoint()).toBe(mountPoint);
            expect(shadow.querySelectorAll('.ct-app-host')).toHaveLength(1);
        });

        it('puts the drag overlay in the document in Mode A', () => {
            // Page coordinates: inside the shadow root the helper's offsets
            // would depend on whether an ancestor establishes a containing
            // block, which is not something we can control from here.
            const {ctx} = make('light');
            expect(ctx.overlayPoint()).toBe(document.body);
        });

        it('puts the drag overlay in the shadow root in Mode B', () => {
            // The content is in there too, so the overlay has to be.
            const {ctx} = make('shadow');
            expect(ctx.overlayPoint()).toBe(ctx.mountPoint());
        });

        it('scopes region queries to the host in Mode A and the root in Mode B', () => {
            const a = make('light');
            expect(a.ctx.contentScope()).toBe(a.host);
            const b = make('shadow');
            expect(b.ctx.contentScope()).toBe(b.shadow);
        });

        it('lets an explicit content scope win', () => {
            const {ctx, host} = make('light');
            const narrower = document.createElement('div');
            host.appendChild(narrower);
            ctx.setContentScope(narrower);
            expect(ctx.contentScope()).toBe(narrower);
        });

        it('switches scope mode after construction', () => {
            const {ctx, shadow, host} = make('light');
            expect(ctx.contentScope()).toBe(host);
            ctx.setContentScopeMode('shadow');
            expect(ctx.contentScope()).toBe(shadow);
            expect(ctx.overlayPoint()).toBe(ctx.mountPoint());
        });
    });

    describe('setGlobalState', () => {

        it('writes drag state to both the body and the mount point', () => {
            // The body write drives the document-level .ce--dragging rules;
            // the mount write is the only thing chrome CSS inside the shadow
            // root can select on, and chrome sets cursor: pointer on its own
            // elements, which beats an inherited cursor from the body.
            const {ctx} = make('light');
            ctx.setGlobalState('dragging', true);
            expect(document.body.classList.contains('ce--dragging')).toBe(true);
            expect(ctx.mountPoint().classList.contains('ce--dragging')).toBe(true);

            ctx.setGlobalState('dragging', false);
            expect(document.body.classList.contains('ce--dragging')).toBe(false);
            expect(ctx.mountPoint().classList.contains('ce--dragging')).toBe(false);
        });

        it('writes resize state to both places', () => {
            const {ctx} = make('light');
            ctx.setGlobalState('resizing', true);
            expect(document.body.classList.contains('ce--resizing')).toBe(true);
            expect(ctx.mountPoint().classList.contains('ce--resizing')).toBe(true);
            ctx.setGlobalState('resizing', false);
        });

        it('keeps scroll locking on the document only', () => {
            // There is nothing inside a shadow root to lock scrolling on.
            const {ctx} = make('light');
            ctx.setGlobalState('no-scroll', true);
            expect(document.body.classList.contains('ct--no-scroll')).toBe(true);
            expect(ctx.mountPoint().className).toBe('ct-app-host');
            ctx.setGlobalState('no-scroll', false);
        });
    });

    describe('getRange', () => {

        it('reads a selection made inside the shadow root', () => {
            const {ctx, content} = make('shadow');
            const text = content.firstChild;
            window.getSelection().setBaseAndExtent(text, 2, text, 7);

            const range = ctx.getRange();
            expect(range).not.toBe(null);
            // The real text node, not the retargeted host.
            expect(range.startContainer).toBe(text);
            expect(range.startOffset).toBe(2);
            expect(range.endOffset).toBe(7);
            expect(range.toString()).toBe('llo w');
        });

        it('returns a LIVE Range, not a StaticRange', () => {
            // ContentSelect.Range.rect() measures a collapsed caret by
            // inserting a marker span into the range. StaticRange, which
            // getComposedRanges() hands back, has no insertNode() -- so if
            // this ever regressed to returning one, every caret-positioned
            // tooltip in the editor would throw.
            const {ctx, content} = make('shadow');
            const text = content.firstChild;
            window.getSelection().setBaseAndExtent(text, 3, text, 3);

            const range = ctx.getRange();
            expect(range instanceof Range).toBe(true);
            expect(typeof range.insertNode).toBe('function');

            const marker = document.createElement('span');
            marker.textContent = '​';
            expect(() => range.insertNode(marker)).not.toThrow();
            expect(marker.getRootNode()).toBe(ctx.root);
            marker.remove();
        });

        it('reads a light-DOM selection in Mode A', () => {
            // Mode A content is slotted, so the document selection is already
            // the right answer and no shadow handling should interfere.
            const {ctx, content} = make('light');
            const text = content.firstChild;
            window.getSelection().setBaseAndExtent(text, 0, text, 5);

            const range = ctx.getRange();
            expect(range.startContainer).toBe(text);
            expect(range.toString()).toBe('hello');
        });

        it('returns null when nothing is selected', () => {
            const {ctx} = make('shadow');
            window.getSelection().removeAllRanges();
            expect(ctx.getRange()).toBe(null);
        });

        it('rejects a retargeted range in Mode B', () => {
            // A selection elsewhere on the page is not a position in our
            // content. Engines report it either as itself or, worse, as a
            // retargeted approximation pointing at the host's parent; both
            // would put the caret in the wrong place, so neither is trusted.
            const {ctx} = make('shadow');
            const outside = document.createElement('p');
            outside.textContent = 'somewhere else';
            document.body.appendChild(outside);
            window.getSelection().setBaseAndExtent(
                outside.firstChild, 0, outside.firstChild, 4);

            expect(ctx.getRange()).toBe(null);
            outside.remove();
        });

        it('accepts a range outside the root in Mode A', () => {
            // Mode A's content IS outside the root, so the same range that
            // Mode B rejects is the one Mode A must return.
            const {ctx} = make('light');
            const outside = document.createElement('p');
            outside.textContent = 'somewhere else';
            document.body.appendChild(outside);
            window.getSelection().setBaseAndExtent(
                outside.firstChild, 0, outside.firstChild, 4);

            expect(ctx.getRange().toString()).toBe('some');
            outside.remove();
        });

        it('finds a selection inside a nested shadow root', () => {
            // A dialog that uses its own shadow root would otherwise read as
            // foreign: ShadowRoot.contains() stops at the nested boundary.
            const {ctx, shadow} = make('shadow');
            const inner = document.createElement('div');
            shadow.appendChild(inner);
            const innerRoot = inner.attachShadow({mode: 'open'});
            const deep = document.createElement('div');
            deep.contentEditable = 'true';
            deep.textContent = 'nested text';
            innerRoot.appendChild(deep);

            expect(ctx._inRoot(deep.firstChild)).toBe(true);
            expect(ctx._inRoot(document.body)).toBe(false);
        });
    });

    describe('selectRange and clearSelection', () => {

        it('writes a selection into the shadow tree and reads it back', () => {
            const {ctx, content} = make('shadow');
            const text = content.firstChild;
            const range = ctx.createRange();
            range.setStart(text, 6);
            range.setEnd(text, 11);

            ctx.selectRange(range);

            const back = ctx.getRange();
            expect(back.startContainer).toBe(text);
            expect(back.toString()).toBe('world');
        });

        it('clears a shadow-internal selection', () => {
            const {ctx, content} = make('shadow');
            const text = content.firstChild;
            window.getSelection().setBaseAndExtent(text, 0, text, 5);
            expect(ctx.getRange()).not.toBe(null);

            ctx.clearSelection();
            expect(ctx.getRange()).toBe(null);
        });
    });

    describe('ContentSelect round-trip', () => {

        it('selects and queries content inside a shadow root', () => {
            // The end-to-end proof: ContentSelect is the only consumer of
            // getRange()/selectRange(), and it has no idea a shadow root is
            // involved. If this passes, every selection-driven tool does too.
            const {ctx, content} = make('shadow');
            const previous = setRootContext(ctx);
            try {
                ContentSelect.Range.prepareElement(content);
                new ContentSelect.Range(6, 11).select(content);

                const queried = ContentSelect.Range.query(content);
                expect(queried.get()).toEqual([6, 11]);

                const rect = ContentSelect.Range.rect();
                expect(rect).not.toBe(null);
                expect(rect.width).toBeGreaterThan(0);

                ContentSelect.Range.unselectAll();
                expect(ContentSelect.Range.query(content).get()).toEqual([0, 0]);
            } finally {
                setRootContext(previous);
            }
        });

        it('measures a collapsed caret inside a shadow root', () => {
            // rect() takes its marker-insertion branch here, which is the one
            // a StaticRange cannot serve.
            const {ctx, content} = make('shadow');
            const previous = setRootContext(ctx);
            try {
                ContentSelect.Range.prepareElement(content);
                new ContentSelect.Range(4, 4).select(content);

                const rect = ContentSelect.Range.rect();
                expect(rect).not.toBe(null);
                expect(rect.height).toBeGreaterThan(0);
                // The marker must not survive the measurement.
                expect(content.querySelector('span')).toBe(null);
            } finally {
                setRootContext(previous);
            }
        });
    });

    describe('engine branches', () => {
        /* Chromium answers every read through branch 1, so the WebKit and
           Firefox branches would ship completely unexercised -- verified by
           instrumenting the chain and watching branch 2 never fire. The
           three-engine matrix arrives with the element work; until then the
           honest thing is to suppress the APIs Chromium has and the others do
           not, so the fallback code is really run rather than assumed.

           These are not mocks of the selection: the range still comes from a
           genuine selection over genuine shadow nodes. Only the API surface
           is narrowed to the engine being stood in for. */

        /** Hide ShadowRoot.getSelection (absent in WebKit and Firefox). */
        function withoutShadowGetSelection(shadow, fn) {
            Object.defineProperty(shadow, 'getSelection',
                {value: undefined, configurable: true});
            try { return fn(); } finally { delete shadow.getSelection; }
        }

        /** Hide Selection.getComposedRanges (absent in Firefox). */
        function withoutComposedRanges(fn) {
            const owner = Selection.prototype;
            const saved = Object.getOwnPropertyDescriptor(owner, 'getComposedRanges');
            delete owner.getComposedRanges;
            try { return fn(); } finally {
                if (saved) Object.defineProperty(owner, 'getComposedRanges', saved);
            }
        }

        it('branch 2: reads through getComposedRanges when WebKit-shaped', () => {
            const {ctx, shadow, content} = make('shadow');
            const text = content.firstChild;
            window.getSelection().setBaseAndExtent(text, 2, text, 7);

            withoutShadowGetSelection(shadow, () => {
                const range = ctx.getRange();
                expect(range.startContainer).toBe(text);
                expect(range.toString()).toBe('llo w');
                // Rebuilt from a StaticRange, so it must still be live.
                expect(range instanceof Range).toBe(true);
                expect(typeof range.insertNode).toBe('function');
            });
        });

        it('branch 2: survives an unrecognised signature without a bogus range', () => {
            // The trap this whole design turns on: called with a signature it
            // does not recognise, getComposedRanges() does NOT throw -- it
            // returns a retargeted range pointing at the host's PARENT. So
            // "the call succeeded" proves nothing and containment is the only
            // usable discriminator. Here the spec-form call is made to fail,
            // leaving only the legacy form, whose retargeted answer must be
            // rejected rather than handed back as the caret position.
            const {ctx, shadow, content} = make('shadow');
            const text = content.firstChild;
            window.getSelection().setBaseAndExtent(text, 2, text, 7);

            const real = Selection.prototype.getComposedRanges;
            Selection.prototype.getComposedRanges = function (arg) {
                if (arg && arg.shadowRoots) throw new TypeError('unsupported');
                return real.call(this, arg);
            };
            try {
                withoutShadowGetSelection(shadow, () => {
                    const range = ctx.getRange();
                    expect(range.startContainer).not.toBe(document.body);
                    expect(range.startContainer).toBe(text);
                });
            } finally {
                Selection.prototype.getComposedRanges = real;
            }
        });

        it('branch 3: reads the document selection when Firefox-shaped', () => {
            // Firefox has neither of the shadow-aware APIs and does not
            // retarget, so its document selection already reports real shadow
            // nodes -- which is what Chromium's does here once both are hidden.
            const {ctx, shadow, content} = make('shadow');
            const text = content.firstChild;
            window.getSelection().setBaseAndExtent(text, 0, text, 5);

            withoutShadowGetSelection(shadow, () => withoutComposedRanges(() => {
                expect(typeof shadow.getSelection).toBe('undefined');
                expect(typeof window.getSelection().getComposedRanges).toBe('undefined');
                const range = ctx.getRange();
                expect(range.startContainer).toBe(text);
                expect(range.toString()).toBe('hello');
            }));
        });

        it('branch 3: still rejects a foreign selection in Mode B', () => {
            const {ctx, shadow} = make('shadow');
            const outside = document.createElement('p');
            outside.textContent = 'somewhere else';
            document.body.appendChild(outside);
            window.getSelection().setBaseAndExtent(
                outside.firstChild, 0, outside.firstChild, 4);

            withoutShadowGetSelection(shadow, () => withoutComposedRanges(() => {
                expect(ctx.getRange()).toBe(null);
            }));
            outside.remove();
        });

        it('ContentSelect round-trips on every branch', () => {
            // The proof that matters: the same round-trip, once per engine
            // shape. A branch that returns a subtly wrong range passes the
            // unit assertions above and fails here.
            const shapes = [
                ['chromium', fn => fn()],
                ['webkit', (fn, shadow) => withoutShadowGetSelection(shadow, fn)],
                ['firefox', (fn, shadow) =>
                    withoutShadowGetSelection(shadow, () => withoutComposedRanges(fn))]
            ];
            for (const [name, shape] of shapes) {
                const {ctx, shadow, content} = make('shadow');
                const previous = setRootContext(ctx);
                try {
                    shape(() => {
                        ContentSelect.Range.prepareElement(content);
                        new ContentSelect.Range(6, 11).select(content);
                        expect(ContentSelect.Range.query(content).get(), name)
                            .toEqual([6, 11]);
                        expect(ContentSelect.Range.rect().width, name)
                            .toBeGreaterThan(0);
                    }, shadow);
                } finally {
                    setRootContext(previous);
                }
            }
        });
    });

    describe('DocumentRootContext is unchanged', () => {

        it('still mounts and scopes to the document', () => {
            // Phase 7c must be invisible to every existing integration; the
            // golden master is the real gate, this is the explicit statement.
            const ctx = new DocumentRootContext();
            expect(ctx.mountPoint()).toBe(document.body);
            expect(ctx.overlayPoint()).toBe(document.body);
            expect(ctx.contentScope()).toBe(document);
            expect(ctx.root).toBe(document);
        });

        it('writes global state to the body only', () => {
            const ctx = new DocumentRootContext();
            ctx.setGlobalState('dragging', true);
            expect(document.body.classList.contains('ce--dragging')).toBe(true);
            ctx.setGlobalState('dragging', false);
        });
    });
});
