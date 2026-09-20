import {deepActiveElement} from '../../../src/core/root-context.js';
import DocumentRootContext from '../../../src/core/document-root-context.js';

/* The RootContext is the seam a ShadowRootContext will slot into, so the
   pieces that only matter under Shadow DOM are tested now, while they are
   still cheap to get right. */

describe('deepActiveElement', () => {

    it('returns document.activeElement when there is no shadow root', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        expect(deepActiveElement(document)).toBe(input);
        input.remove();
    });

    it('descends through an open shadow root', () => {
        // document.activeElement stops at the host, which is why a dialog
        // input inside a shadow root cannot be found without descending.
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadow = host.attachShadow({mode: 'open'});
        const input = document.createElement('input');
        shadow.appendChild(input);
        input.focus();

        expect(document.activeElement).toBe(host);
        expect(deepActiveElement(document)).toBe(input);
        host.remove();
    });

    it('descends through nested shadow roots', () => {
        const outer = document.createElement('div');
        document.body.appendChild(outer);
        const inner = document.createElement('div');
        outer.attachShadow({mode: 'open'}).appendChild(inner);
        const input = document.createElement('input');
        inner.attachShadow({mode: 'open'}).appendChild(input);
        input.focus();

        expect(deepActiveElement(document)).toBe(input);
        outer.remove();
    });
});

describe('DocumentRootContext', () => {

    it('toggles the page-level state flags', () => {
        const ctx = new DocumentRootContext();
        ctx.setGlobalState('dragging', true);
        expect(document.body.classList.contains('ce--dragging')).toBe(true);
        ctx.setGlobalState('dragging', false);
        expect(document.body.classList.contains('ce--dragging')).toBe(false);

        // Scroll locking is a document concern and keeps its own class name.
        ctx.setGlobalState('no-scroll', true);
        expect(document.body.classList.contains('ct--no-scroll')).toBe(true);
        ctx.setGlobalState('no-scroll', false);
    });

    it('survives storage that throws', () => {
        // localStorage throws in a sandboxed iframe and in Safari private
        // mode; the library used to take the whole editor down with it.
        const hostileWindow = {
            get localStorage() { throw new DOMException('denied', 'SecurityError'); }
        };
        const ctx = new DocumentRootContext(document, hostileWindow);
        expect(() => ctx.storage().setItem('k', 'v')).not.toThrow();
        expect(ctx.storage().getItem('k')).toBe(null);
    });

    it('addGlobalListener returns a working disposer', () => {
        const ctx = new DocumentRootContext();
        let calls = 0;
        const dispose = ctx.addGlobalListener('document', 'ct-test', () => calls++);
        document.dispatchEvent(new CustomEvent('ct-test'));
        expect(calls).toBe(1);
        dispose();
        document.dispatchEvent(new CustomEvent('ct-test'));
        expect(calls).toBe(1);
    });

    it('reports computed-style support from the live host', () => {
        // Read live, not cached: a spec disables transition monitoring by
        // nulling window.getComputedStyle.
        const ctx = new DocumentRootContext();
        expect(ctx.supportsComputedStyle()).toBe(true);
        expect(new DocumentRootContext(document, {getComputedStyle: null})
            .supportsComputedStyle()).toBe(false);
    });

    it('mount point and content scope are overridable', () => {
        // This is what lets <content-tools-editor> put its chrome in a shadow
        // root and scope region discovery to its own subtree.
        const ctx = new DocumentRootContext();
        expect(ctx.mountPoint()).toBe(document.body);
        expect(ctx.contentScope()).toBe(document);

        const host = document.createElement('div');
        ctx.setMountPoint(host);
        ctx.setContentScope(host);
        expect(ctx.mountPoint()).toBe(host);
        expect(ctx.overlayPoint()).toBe(host);
        expect(ctx.contentScope()).toBe(host);
    });
});
