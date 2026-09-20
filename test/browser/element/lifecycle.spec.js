import {create, mount, unmount, chromeRoots, assertNoResidue, FIXTURE}
    from './helpers.js';
import ShadowRootContext from '../../../src/core/shadow-root-context.js';
import DocumentRootContext from '../../../src/core/document-root-context.js';
import {rootContext, setRootContext} from '../../../src/core/root-context.js';

/* The element's lifecycle: connect, move, disconnect, and the second
   instance. Everything here goes through the tag rather than the modules
   under it, because the ordering IS the behaviour -- stop before destroy
   before repair, and a microtask between a move and a removal. */

describe('connecting', () => {

    let el;

    afterEach(async () => {
        if (el) await unmount(el);
        el = null;
        assertNoResidue();
    });

    it('boots into the shadow root', () => {
        el = mount();
        expect(el.getAttribute('state')).toBe('ready');
        expect(el.shadowRoot.querySelectorAll('.ct-app')).toHaveLength(1);
        // And nowhere else: encapsulating the chrome is the point.
        expect(document.querySelectorAll('.ct-app')).toHaveLength(0);
    });

    it('installs a ShadowRootContext scoped to the host', () => {
        el = mount();
        expect(el.rootContext).toBeInstanceOf(ShadowRootContext);
        // Mode A: regions are the element's LIGHT children.
        expect(el.rootContext.contentScope()).toBe(el);
        expect(el.rootContext.mountPoint().parentNode).toBe(el.shadowRoot);
    });

    it('slots the content rather than swallowing it', () => {
        // Without a <slot> a shadow root replaces the light children
        // wholesale and Mode A renders an empty box.
        el = mount();
        expect(el.shadowRoot.querySelector('slot')).not.toBe(null);
        expect(el.querySelectorAll('[data-editable]')).toHaveLength(2);
    });

    it('finds the regions its attribute names', () => {
        el = mount();
        expect(el.editorApp.domRegions()).toHaveLength(3);
    });

    it('leaves the ignition off unless asked', () => {
        // Inverts the imperative default: an element is driven by the shell
        // around it, not by its own on-page switch.
        el = mount();
        expect(el.editorApp.ignition()).toBe(null);
    });

    it('shows the ignition when the attribute is present', () => {
        el = mount({ignition: true});
        expect(el.editorApp.ignition()).not.toBe(null);
    });

    it('is idempotent', () => {
        el = mount();
        const app = el.editorApp;
        el.connectedCallback();
        expect(el.editorApp).toBe(app);
        expect(el.shadowRoot.querySelectorAll('.ct-app')).toHaveLength(1);
    });
});

describe('disconnecting', () => {

    it('tears down completely', async () => {
        const el = mount();
        await unmount(el);
        expect(el.getAttribute('state')).toBe('dormant');
        expect(el.editorApp).toBe(null);
        assertNoResidue();
    });

    it('does not tear down on a synchronous MOVE', async () => {
        /* The case the microtask exists for: a framework re-parenting the
           element fires disconnected then connected SYNCHRONOUSLY, and
           tearing down on the first would destroy a live edit. */
        const el = mount();
        const app = el.editorApp;
        const context = el.rootContext;

        const target = document.createElement('div');
        document.body.appendChild(target);
        target.appendChild(el);            // disconnected + connected, sync
        await Promise.resolve();
        await Promise.resolve();

        expect(el.editorApp).toBe(app);
        expect(el.rootContext).toBe(context);
        expect(el.getAttribute('state')).toBe('ready');
        // The context memoises its mount point; a rebuilt one would leave a
        // second host div behind.
        expect(el.shadowRoot.querySelectorAll('.ct-app-host')).toHaveLength(1);
        expect(el.shadowRoot.querySelectorAll('.ct-app')).toHaveLength(1);

        await unmount(el);
        target.remove();
        assertNoResidue();
    });

    it('saves rather than reverting when removed mid-edit', async () => {
        /* Reverting would run a confirm dialog from a DOM removal, and if
           the user cancelled it would abort the stop and leave the editor
           half torn down. */
        const el = mount();
        const saved = [];
        el.addEventListener('ct-saved', ev => saved.push(ev.detail));
        el.start();
        expect(el.getAttribute('state')).toBe('editing');

        await unmount(el);

        expect(saved).toHaveLength(1);
        assertNoResidue();
    });

    it('restores the previous RootContext', async () => {
        const before = rootContext();
        const el = mount();
        expect(rootContext()).toBe(el.rootContext);
        await unmount(el);
        expect(rootContext()).toBe(before);
        assertNoResidue();
    });

    it('leaves a context installed by something else alone', async () => {
        /* Restoring blindly would clobber whatever replaced ours in the
           meantime, which is a worse outcome than leaking one: the page
           would silently start resolving `document.body` through a context
           its owner had already swapped out. */
        const el = mount();
        const other = new DocumentRootContext();
        setRootContext(other);

        await unmount(el);

        expect(rootContext()).toBe(other);
        setRootContext(new DocumentRootContext());
        assertNoResidue();
    });

    it('can be connected again after a teardown', async () => {
        const el = mount();
        await unmount(el);
        assertNoResidue();

        document.body.appendChild(el);
        expect(el.getAttribute('state')).toBe('ready');
        expect(el.shadowRoot.querySelectorAll('.ct-app')).toHaveLength(1);
        expect(el.shadowRoot.querySelectorAll('.ct-app-host')).toHaveLength(1);

        await unmount(el);
        assertNoResidue();
    });

    it('hands the lease straight to an element mounted in the same tick', async () => {
        /* Mount-before-unmount, which is what a framework does when it
           swaps a component. The incoming element flushes the outgoing
           one's deferred teardown itself rather than going inert. */
        const first = mount();
        first.remove();
        const second = mount();           // same tick, no microtask yet

        expect(second.getAttribute('state')).toBe('ready');
        expect(second.editorApp).not.toBe(null);

        await Promise.resolve();
        await Promise.resolve();
        // The flushed teardown must not then run a second time and take the
        // new element's editor with it.
        expect(second.getAttribute('state')).toBe('ready');
        expect(second.editorApp).not.toBe(null);

        await unmount(second);
        assertNoResidue();
    });
});

describe('a second instance', () => {

    let first;
    let second;

    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
        if (second) await unmount(second);
        if (first) await unmount(first);
        first = second = null;
        assertNoResidue();
    });

    it('degrades loudly instead of throwing', () => {
        first = mount();
        second = create();
        const errors = [];
        second.addEventListener('ct-error', ev => errors.push(ev.detail));

        // A throw here would be a custom-element REACTION: reported as an
        // uncaught error with a stack pointing into the parser, and the
        // element left broken in the DOM regardless.
        expect(() => document.body.appendChild(second)).not.toThrow();

        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('singleton-conflict');
        expect(console.error).toHaveBeenCalled();
    });

    it('emits ct-error as a composed, bubbling event', () => {
        first = mount();
        second = create();
        const seen = [];
        document.addEventListener('ct-error', ev => seen.push(ev), {once: true});
        document.body.appendChild(second);
        expect(seen).toHaveLength(1);
        expect(seen[0].composed).toBe(true);
        expect(seen[0].bubbles).toBe(true);
    });

    it('goes inert with its content still rendered', () => {
        first = mount();
        second = mount();
        expect(second.hasAttribute('state')).toBe(false);
        expect(second.editorApp).toBe(null);
        expect(second.shadowRoot.querySelectorAll('.ct-app')).toHaveLength(0);
        // The consumer's markup is untouched and still visible.
        expect(second.shadowRoot.querySelector('slot')).not.toBe(null);
        expect(second.querySelectorAll('[data-editable]')).toHaveLength(2);
    });

    it('throws from its methods, where the consumer owns the stack', () => {
        first = mount();
        second = mount();
        expect(() => second.start()).toThrow(/inert/);
        expect(() => second.save()).toThrow(/inert/);
        expect(() => second.refresh()).toThrow(/inert/);
    });

    it('leaves the first one working', () => {
        first = mount();
        second = mount();
        first.start();
        expect(first.getAttribute('state')).toBe('editing');
        first.stop(true);
        expect(first.getAttribute('state')).toBe('ready');
    });

    it('boots once the conflict is gone', async () => {
        first = mount();
        second = mount();
        expect(second.editorApp).toBe(null);

        await unmount(first);
        first = null;

        second.remove();
        document.body.appendChild(second);
        expect(second.getAttribute('state')).toBe('ready');
    });
});

describe('the methods', () => {

    let el;

    afterEach(async () => {
        if (el) await unmount(el);
        el = null;
        assertNoResidue();
    });

    it('throw before the element is connected', () => {
        el = create();
        expect(() => el.start()).toThrow(/not connected/);
        el = null;
    });

    it('drive start and stop, reflecting state', () => {
        el = mount();
        el.start();
        expect(el.getAttribute('state')).toBe('editing');
        expect(el.state).toBe('editing');
        el.stop(true);
        expect(el.getAttribute('state')).toBe('ready');
    });

    it('stop() SAVES by default', () => {
        // The imperative stop() reverts, which confirms and can abort. A
        // method the shell calls must not lose work by default.
        el = mount();
        const saved = [];
        el.addEventListener('ct-saved', ev => saved.push(ev.detail));
        el.start();
        el.stop();
        expect(saved).toHaveLength(1);
    });

    it('save(passive) leaves the page editable', () => {
        el = mount();
        const saved = [];
        el.addEventListener('ct-saved', ev => saved.push(ev.detail));
        el.start();
        el.save(true);
        expect(saved[0].passive).toBe(true);
        expect(el.editorApp.isEditing()).toBe(true);
    });

    it('refresh() picks up regions added after boot', () => {
        el = mount();
        expect(el.editorApp.domRegions()).toHaveLength(3);
        const extra = document.createElement('div');
        extra.setAttribute('data-editable', '');
        extra.setAttribute('data-name', 'extra');
        extra.innerHTML = '<p>extra</p>';
        el.appendChild(extra);

        el.refresh();
        expect(el.editorApp.domRegions()).toHaveLength(4);
    });

    it('reflects busy', () => {
        el = mount();
        el.editorApp.busy(true);
        expect(el.hasAttribute('busy')).toBe(true);
        expect(el.busy).toBe(true);
        el.editorApp.busy(false);
        expect(el.busy).toBe(false);
    });

    it('flash() mounts a flash while the editor is up', () => {
        el = mount();
        el.flash('ok');
        expect(el.shadowRoot.querySelectorAll('.ct-flash')).toHaveLength(1);
    });

    it('flash() warns instead of throwing when the app is unmounted', () => {
        // FlashUI anchors to EditorApp.domElement() and throws on null.
        el = mount();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        el.editorApp.unmount();
        expect(() => el.flash('ok')).not.toThrow();
        expect(warn).toHaveBeenCalled();
    });
});

describe('booting repeatedly', () => {

    /* The point of the whole milestone. A CMS shell opens an entry, closes
       it, and opens the next one -- so the third lifetime has to be
       indistinguishable from the first, and every assertion here would have
       passed vacuously before `destroy()` became terminal, because the
       "second" editor was the first one patched back up by hand. */

    it('the Nth boot is the 1st boot', async () => {
        const apps = [];

        for (let i = 0; i < 5; i += 1) {
            const el = mount();
            apps.push(el.editorApp);

            expect(el.getAttribute('state')).toBe('ready');
            expect(el.shadowRoot.querySelectorAll('.ct-app')).toHaveLength(1);
            expect(el.shadowRoot.querySelectorAll('.ct-app-host')).toHaveLength(1);
            expect(el.editorApp.domRegions()).toHaveLength(3);

            el.start();
            expect(el.getAttribute('state')).toBe('editing');

            const body = el.editorApp.regions()['body'];
            body.children[0].content = body.children[0].content.concat(` ${ i }`);
            body.children[0].updateInnerHTML();
            body.children[0].taint();

            el.stop(true);
            expect(el.getAttribute('state')).toBe('ready');

            await unmount(el);
            assertNoResidue();
        }

        // A different app every time -- which is the mechanism the rest of
        // this test is a consequence of.
        expect(new Set(apps).size).toBe(5);
    });

    it('does not carry a fixtureTest from one lifetime to the next', async () => {
        /* `init()` assigns `_fixtureTest` only when the argument is truthy,
           so under a reused singleton a custom test outlived its owner.
           Nothing restores it now; the constructor never had it. */
        const first = mount();
        const everythingIsAFixture = () => true;
        first.fixtureTest = everythingIsAFixture;
        expect(first.editorApp._fixtureTest).toBe(everythingIsAFixture);
        await unmount(first);

        const second = mount();
        expect(second.editorApp._fixtureTest).not.toBe(everythingIsAFixture);
        expect(second.editorApp._fixtureTest(second.querySelector('[data-editable]')))
            .toBe(false);
        await unmount(second);
        assertNoResidue();
    });

    it('tears down cleanly even when the stop is vetoed', async () => {
        /* A shell can cancel `ct-stop`. The element still has to let go of
           the page when it is removed -- and the editor is still editing at
           that point, so this is the path on which focus used to survive. */
        const el = mount();
        el.start();
        el.editorApp.regions()['body'].children[0].focus();
        el.addEventListener('ct-stop', ev => ev.preventDefault());

        await unmount(el);
        assertNoResidue();
    });

    it('can still drag after a reboot', async () => {
        /* `startDragging` short-circuits when a drag is already in flight,
           so an element removed mid-drag used to disable dragging for the
           rest of the page's life. */
        const first = mount();
        first.start();
        first.editorApp.regions()['body'].children[0].drag(10, 10);
        await unmount(first);
        assertNoResidue();

        const second = mount();
        second.start();
        const element = second.editorApp.regions()['body'].children[0];
        element.drag(10, 10);
        expect(ContentEdit.Root.get().dragging()).toBe(element);
        ContentEdit.Root.get().cancelDragging();

        await unmount(second);
        assertNoResidue();
    });
});
