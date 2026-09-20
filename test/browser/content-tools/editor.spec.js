/* editor.ts coverage.
 *
 * `src/spec/editor.coffee` was 0 bytes upstream, so the 1,357 lines that own
 * the save/region contract have never had a test. That contract -- which
 * regions come back, when, and in what shape -- is exactly what the git/PR
 * milestones are built on, so it is pinned here before anything is built on
 * top of it.
 */

const FIXTURE = `
  <h1 data-fixture data-name="title">Title</h1>
  <a data-ce-tag="p" data-fixture data-name="link" href="/x">Link</a>
  <div data-editable data-name="body"><p>body one</p><p>body two</p></div>
  <div data-editable data-name="aside"><p>aside</p></div>
  <div data-editable data-name="blank"></div>
`;

let editor;
let host;

/* The editor's default fixture test, passed explicitly on every boot.
 *
 * init() only assigns fixtureTest when the argument is truthy, so passing
 * null does NOT restore the default -- and because EditorApp is a singleton,
 * a custom test set by one caller silently persists for every later one.
 * That is a real wart in the public API; these tests work around it rather
 * than depend on it. */
const DEFAULT_FIXTURE_TEST = domElement => domElement.hasAttribute('data-fixture');

/** Build the page and initialise the editor, mirroring a host integration. */
function boot({regions = '[data-editable], [data-fixture]', namingProp = 'data-name',
               fixtureTest = DEFAULT_FIXTURE_TEST, withIgnition = true, html = FIXTURE} = {}) {
    editor = ContentTools.EditorApp.get();
    host = document.getElementById('test');
    host.innerHTML = html;
    editor.init(regions, namingProp, fixtureTest, withIgnition);
    return editor;
}

/** Record every lifecycle event, in order. */
function recordEvents(app, names = ['start', 'started', 'stop', 'stopped', 'save', 'saved', 'revert']) {
    const log = [];
    const payloads = [];
    for (const name of names) {
        app.addEventListener(name, ev => {
            log.push(name);
            if (name === 'saved') payloads.push(ev.detail());
        });
    }
    return {log, payloads};
}

function setText(name, index, text) {
    const el = editor.regions()[name].children[index];
    el.content = new HTMLString.String(text);
    el.updateInnerHTML();
    el.taint();
}

afterEach(() => {
    // `destroy()` is terminal -- it vacates the singleton slot -- so the
    // next boot() gets an app the constructor just built rather than
    // whatever the last test left behind. That covers the listener
    // accumulation this hook used to clear by hand (the cancellation tests
    // attach a permanent `save -> preventDefault`, which silently
    // suppressed saves in every later test).
    //
    // stop() first, and stop(TRUE): stop-after-destroy throws, because
    // destroy()'s unmount() has already nulled the toolbox; and stop(false)
    // reverts, which asks for confirmation, and the auto-dismissed dialog
    // aborts the revert and leaves the editor editing.
    try {
        if (editor && editor.isEditing()) editor.stop(true);
    } catch { /* nothing to stop */ }
    try { editor && editor.destroy(); } catch { /* never initialised */ }
    editor = null;
});

describe('EditorApp.init()', () => {

    it('accepts a CSS selector string', () => {
        boot();
        editor.start();
        expect(Object.keys(editor.regions()).sort())
            .toEqual(['aside', 'blank', 'body', 'link', 'title']);
    });

    it('accepts a list of DOM elements', () => {
        host = document.getElementById('test');
        host.innerHTML = FIXTURE;
        const nodes = host.querySelectorAll('[data-editable]');
        editor = ContentTools.EditorApp.get();
        editor.init(nodes, 'data-name');
        editor.start();
        expect(Object.keys(editor.regions()).sort()).toEqual(['aside', 'blank', 'body']);
    });

    it('names regions by the given property', () => {
        boot({namingProp: 'data-name'});
        editor.start();
        expect(Object.keys(editor.regions())).toContain('body');
    });

    it("falls back to the region's index when the naming attribute is absent", () => {
        // Regions are keyed by their position when the naming property is
        // missing, so an unnamed region is still addressable.
        boot({namingProp: 'id'});
        editor.start();
        expect(Object.keys(editor.regions()).sort()).toEqual(['0', '1', '2', '3', '4']);
    });

    it('detects fixtures via data-fixture by default', () => {
        boot();
        editor.start();
        const title = editor.regions()['title'];
        expect(title.children.length).toBe(1);
        expect(title.children[0].isFixed()).toBe(true);
        expect(editor.regions()['body'].children[0].isFixed()).toBe(false);
    });

    it('honours a custom fixtureTest', () => {
        // Treat everything as a fixture, including what data-fixture would not.
        boot({fixtureTest: () => true});
        editor.start();
        expect(editor.regions()['aside'].children[0].isFixed()).toBe(true);
    });
});

describe('EditorApp.save()', () => {

    it('returns only the regions that changed', () => {
        // The contract every consumer of this library depends on.
        boot();
        const {payloads} = recordEvents(editor);
        editor.start();
        setText('body', 0, 'edited');
        editor.save(false);

        expect(Object.keys(payloads[0].regions)).toEqual(['body']);
        expect(payloads[0].regions.body).toContain('edited');
    });

    it('returns nothing when nothing changed', () => {
        boot();
        const {payloads} = recordEvents(editor);
        editor.start();
        editor.save(false);
        expect(payloads[0].regions).toEqual({});
    });

    it('short-circuits a passive save when the document is unmodified', () => {
        // Passive + unmodified takes an early return that fires `saved`
        // before touching any region at all.
        boot();
        const {payloads} = recordEvents(editor);
        editor.start();
        editor.save(true);
        expect(payloads[0]).toEqual({regions: {}, passive: true});
    });

    it('a passive save leaves the DOM editable and the children mounted', () => {
        boot();
        editor.start();
        setText('body', 0, 'still editing');
        const region = editor.regions()['body'];

        editor.save(true);

        // Still mounted and still carrying its editing markup -- a passive
        // save must not tear the editor down. (ContentEdit does not use the
        // contenteditable attribute; editability is driven by the ce-element
        // classes and the Root's focus handling.)
        expect(region.children[0].isMounted()).toBe(true);
        expect(region.children[0].domElement().classList.contains('ce-element'))
            .toBe(true);
    });

    it('a non-passive save writes back and unmounts', () => {
        boot();
        editor.start();
        setText('body', 0, 'committed');
        const region = editor.regions()['body'];
        const domElement = region.domElement();

        editor.save(false);

        expect(region.children[0].isMounted()).toBe(false);
        expect(domElement.innerHTML).toContain('committed');
    });

    it('a non-passive save REPLACES a fixture element rather than filling it', () => {
        // The subtlest branch in the file and the one with no prior coverage:
        // a fixture's DOM node is swapped for the newly built element, so any
        // reference the host held to the original is now stale -- and
        // _domRegions has to be resynced or the next save targets a detached
        // node.
        boot();
        editor.start();
        const before = editor.regions()['title'].domElement();
        setText('title', 0, 'Replaced title');

        editor.save(false);

        const after = host.querySelector('[data-name="title"]');
        expect(after).not.toBe(before);
        expect(before.isConnected).toBe(false);
        expect(after.textContent).toContain('Replaced title');
        expect(Array.from(editor.domRegions())).toContain(after);
    });

    it('a standard region keeps its DOM element across a save', () => {
        // The other half of the fixture branch: regions are filled in place.
        boot();
        editor.start();
        const before = editor.regions()['body'].domElement();
        setText('body', 0, 'kept');
        editor.save(false);

        expect(host.querySelector('[data-name="body"]')).toBe(before);
        expect(before.isConnected).toBe(true);
    });

    it('is cancellable via preventDefault on the save event', () => {
        boot();
        const {payloads} = recordEvents(editor);
        editor.addEventListener('save', ev => ev.preventDefault());
        editor.start();
        setText('body', 0, 'should not be saved');
        editor.save(false);
        expect(payloads).toHaveLength(0);
    });

    it('reports the passive flag it was called with', () => {
        boot();
        const {payloads} = recordEvents(editor);
        editor.start();
        setText('body', 0, 'x');
        editor.save(false);
        expect(payloads[0].passive).toBe(false);
    });
});

describe('EditorApp change detection', () => {

    function busyWait(ms) { const t = Date.now(); while (Date.now() - t < ms) { /* spin */ } }

    it('reports an edit made in the same millisecond as init', () => {
        // REGRESSION. Change detection compares modification stamps for
        // equality, and those stamps used to come from a raw Date.now(). An
        // edit landing in the same millisecond as the baseline was therefore
        // indistinguishable from no edit at all, and was silently dropped
        // from the save payload -- 11 times out of 12 on a modern browser.
        // Stamps are now strictly monotonic.
        for (let i = 0; i < 20; i++) {
            boot({html: '<div data-editable data-name="body"><p>b</p></div>'});
            const {payloads} = recordEvents(editor);
            editor.start();
            setText('body', 0, `edit ${i}`);   // deliberately no delay
            editor.save(false);
            expect(Object.keys(payloads[0].regions), `iteration ${i}`).toEqual(['body']);
        }
    });

    it('reports an edit made in the same millisecond as a previous save', () => {
        // The same collision in the autosave shape: save, edit, save again,
        // all inside one millisecond.
        boot({html: '<div data-editable data-name="body"><p>b</p></div>'});
        const {payloads} = recordEvents(editor);
        editor.start();
        setText('body', 0, 'first');
        editor.save(true);
        setText('body', 0, 'second');
        editor.save(true);

        expect(Object.keys(payloads[0].regions)).toEqual(['body']);
        expect(Object.keys(payloads[1].regions)).toEqual(['body']);
        expect(payloads[1].regions.body).toContain('second');
    });

    it('still reads as recency for consumers', () => {
        // lastModified() is public and consumers compare it as a timestamp,
        // so the monotonic stamp must stay time-like, not become a counter.
        boot({html: '<div data-editable data-name="body"><p>b</p></div>'});
        editor.start();
        const before = Date.now();
        busyWait(2);
        setText('body', 0, 'x');
        const stamp = editor.regions()['body'].lastModified();
        expect(stamp).toBeGreaterThanOrEqual(before);
        expect(stamp).toBeLessThanOrEqual(Date.now() + 1000);
    });
});

describe('EditorApp empty regions', () => {

    it('injects a placeholder so an empty region stays clickable', () => {
        boot();
        editor.start();
        const blank = editor.regions()['blank'];
        expect(blank.children.length).toBe(1);
        expect(blank.children[0].content.html()).toBe('');
    });

    it('does not report an untouched empty region as changed', () => {
        boot();
        const {payloads} = recordEvents(editor);
        editor.start();
        setText('aside', 0, 'only this');
        editor.save(false);
        expect(Object.keys(payloads[0].regions)).toEqual(['aside']);
    });
});

describe('EditorApp lifecycle', () => {

    it('emits start then started', () => {
        boot();
        const {log} = recordEvents(editor);
        editor.start();
        expect(log).toEqual(['start', 'started']);
    });

    it('emits stop, save, saved, stopped when stopping with save', () => {
        boot();
        const {log} = recordEvents(editor);
        editor.start();
        setText('body', 0, 'x');
        editor.stop(true);
        expect(log).toEqual(['start', 'started', 'stop', 'save', 'saved', 'stopped']);
    });

    it('emits stop, revert, stopped when stopping without save', () => {
        boot();
        const {log} = recordEvents(editor);
        editor.start();
        editor.stop(false);
        expect(log).toEqual(['start', 'started', 'stop', 'revert', 'stopped']);
    });

    it('start is cancellable', () => {
        boot();
        const {log} = recordEvents(editor);
        editor.addEventListener('start', ev => ev.preventDefault());
        editor.start();
        expect(log).toEqual(['start']);
        expect(editor.getState()).not.toBe('editing');
    });

    it('stop is cancellable', () => {
        boot();
        editor.start();
        const {log} = recordEvents(editor);
        editor.addEventListener('stop', ev => ev.preventDefault());
        editor.stop(true);
        expect(log).toEqual(['stop']);
        expect(editor.isEditing()).toBe(true);
    });

    it('reports its state', () => {
        boot();
        expect(editor.isReady()).toBe(true);
        editor.start();
        expect(editor.isEditing()).toBe(true);
        editor.stop(false);
        expect(editor.isEditing()).toBe(false);
    });
});

describe('EditorApp region ordering', () => {

    it('orders regions by document position by default', () => {
        boot();
        editor.start();
        expect(editor.orderedRegions().map(r => r.domElement().getAttribute('data-name')))
            .toEqual(['title', 'link', 'body', 'aside', 'blank']);
    });

    it('honours an explicit order', () => {
        boot();
        editor.start();
        editor.setRegionOrder(['aside', 'body', 'title', 'link', 'blank']);
        expect(editor.orderedRegions().map(r => r.domElement().getAttribute('data-name')))
            .toEqual(['aside', 'body', 'title', 'link', 'blank']);
    });
});

describe('EditorApp.syncRegions()', () => {

    it('picks up regions added to the page', () => {
        boot();
        editor.start();
        expect(Object.keys(editor.regions())).toHaveLength(5);

        const added = document.createElement('div');
        added.setAttribute('data-editable', '');
        added.setAttribute('data-name', 'late');
        added.innerHTML = '<p>late arrival</p>';
        host.appendChild(added);

        editor.syncRegions();
        expect(Object.keys(editor.regions())).toContain('late');
    });

    it('drops regions removed from the page', () => {
        boot();
        editor.start();
        host.querySelector('[data-name="aside"]').remove();
        editor.syncRegions();
        expect(Object.keys(editor.regions())).not.toContain('aside');
    });
});

describe('EditorApp.destroy()', () => {

    it('stops the history watch', () => {
        /* `start()` builds the history stack and a 50ms interval; only
           `stop()` used to clear it, so destroying a live editor left an
           interval running whose closure holds the app and every region it
           was editing. A leak, not an untidiness. */
        boot();
        editor.start();

        const history = editor.history;
        expect(history._watchInterval).toBeTruthy();
        const stop = vi.spyOn(history, 'stopWatching');

        editor.destroy();

        expect(stop).toHaveBeenCalled();
        expect(editor.history).toBe(null);
    });

    it('cancels the shift-to-highlight timer', async () => {
        /* The sharper of the two: the timer calls highlightRegions(), which
           iterates _domRegions, from a timeout with no stack pointing
           anywhere useful. */
        boot();
        let fired = 0;
        editor._highlightTimeout = setTimeout(() => { fired += 1; }, 5);

        editor.destroy();
        expect(editor._highlightTimeout).toBe(null);

        // Observing the callback, not just the field: nulling the handle
        // without clearing the timer leaves it to fire regardless.
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(fired).toBe(0);
    });

    it('removes every global listener it added', () => {
        // The editor leaked a visibilitychange listener for years because
        // removal was hand-written and did not match what was added.
        //
        // Counting on `document` rather than through the RootContext is
        // deliberate: this spec loads the BUNDLED library for its globals, so
        // importing src/core/root-context.js here would be a second copy of
        // that module with no context installed.
        const added = [];
        const removed = [];
        const realAdd = document.addEventListener.bind(document);
        const realRemove = document.removeEventListener.bind(document);
        document.addEventListener = (type, fn, opts) => { added.push(type); realAdd(type, fn, opts); };
        document.removeEventListener = (type, fn, opts) => { removed.push(type); realRemove(type, fn, opts); };

        try {
            boot();
            editor.destroy();
            editor = null;
            expect(added.length).toBeGreaterThan(0);
            expect(removed.slice().sort()).toEqual(added.slice().sort());
        } finally {
            document.addEventListener = realAdd;
            document.removeEventListener = realRemove;
        }
    });
});

describe('the EditorApp singleton slot', () => {

    /* `destroy()` used to leave the instance in place, so `get()` handed
       back a torn-down app and every later `init()` ran against it. The
       element papered over that with a `resetEditorApp()` that restored
       eighteen fields by hand and had to be kept in step with the
       constructor by eye. Replacing the instance makes the constructor the
       only description of initial state. */

    it('hands out a fresh app after destroy()', () => {
        boot();
        const first = editor;
        first.destroy();

        const second = ContentTools.EditorApp.get();
        expect(second).not.toBe(first);
        expect(second.getState()).toBe('dormant');
        editor = second;
    });

    it('builds the fresh app field-for-field like the constructor', () => {
        boot();
        editor.start();
        editor.stop(true);
        editor.destroy();

        const fresh = ContentTools.EditorApp.get();
        const reference = new (ContentTools.EditorApp.getCls())();
        const keys = Object.keys(reference);
        // Guard the guard: an emptied constructor would pass vacuously.
        expect(keys.length).toBeGreaterThan(10);
        for (const key of keys) {
            if (typeof reference[key] === 'function') {
                continue;  // compared behaviourally below
            }
            // Wrapped so a failure names the field rather than the value.
            expect({[key]: fresh[key]}).toEqual({[key]: reference[key]});
        }
        expect(fresh._fixtureTest(host.querySelector('[data-fixture]'))).toBe(true);
        expect(fresh._fixtureTest(host.querySelector('[data-editable]'))).toBe(false);
        editor = fresh;
    });

    it('does not let a stale app evict its successor', () => {
        boot();
        const first = editor;
        first.destroy();
        const second = ContentTools.EditorApp.get();

        // A double destroy, or an unload handler firing late.
        first.destroy();

        expect(ContentTools.EditorApp.get()).toBe(second);
        editor = second;
    });

    it('lets a held reference reclaim the slot by re-initialising', () => {
        /* The one 1.6.x shape that would break silently: a consumer keeps
           its own reference, destroys, and inits it again. Without the
           claim in init() the tools would resolve to a different app and
           the toolbox would drive an editor nobody can see. */
        boot();
        const held = editor;
        held.destroy();
        expect(ContentTools.EditorApp.get()).not.toBe(held);

        held.init('[data-editable]', 'data-name', DEFAULT_FIXTURE_TEST, false);

        expect(ContentTools.EditorApp.get()).toBe(held);
        expect(ContentTools.Tool.editor()).toBe(held);
    });

    it('current() reports the slot without filling it', () => {
        boot();
        expect(ContentTools.EditorApp.current()).toBe(editor);
        editor.destroy();
        expect(ContentTools.EditorApp.current()).toBe(null);
        // Still null: asking twice must not be what creates one.
        expect(ContentTools.EditorApp.current()).toBe(null);
        expect(ContentTools.EditorApp.get()).not.toBe(null);
        editor = ContentTools.EditorApp.get();
    });
});

describe('EditorApp paste handling', () => {

    /** Focus a region's element and place a collapsed caret, as a paste needs. */
    function focus(name, index = 0, at = 0) {
        const el = editor.regions()[name].children[index];
        el.focus();
        new ContentSelect.Range(at, at).select(el.domElement());
        el.selection(new ContentSelect.Range(at, at));
        return el;
    }

    it('pastes plain text into the focused element', () => {
        boot();
        editor.start();
        const el = focus('body', 0, 0);
        editor.pasteText(el, 'pasted');
        expect(editor.regions()['body'].html()).toContain('pasted');
    });

    it('spawns an element per line for multi-line text', () => {
        boot();
        editor.start();
        const before = editor.regions()['body'].children.length;
        const el = focus('body', 0, 0);
        editor.pasteText(el, 'line one\nline two\nline three');
        expect(editor.regions()['body'].children.length).toBeGreaterThan(before);
    });

    it('ignores blank lines when pasting text', () => {
        boot();
        editor.start();
        const before = editor.regions()['body'].children.length;
        const el = focus('body', 0, 0);
        editor.pasteText(el, '\n   \n\n');
        expect(editor.regions()['body'].children.length).toBe(before);
    });

    it('keeps preformatted text as a single block', () => {
        // A <pre> must not be split into one element per line.
        boot({html: '<div data-editable data-name="code"><pre>one\ntwo</pre></div>'});
        editor.start();
        const el = focus('code', 0, 0);
        editor.pasteText(el, 'alpha\nbeta');
        expect(editor.regions()['code'].children.length).toBe(1);
    });

    it('pastes HTML and keeps whitelisted markup', () => {
        boot();
        editor.start();
        const el = focus('body', 0, 0);
        editor.pasteHTML(el, '<p>kept <b>bold</b></p>');
        const html = editor.regions()['body'].html();
        expect(html).toContain('bold');
        expect(html).toContain('<b>');
    });

    it('strips markup the cleaner does not whitelist', () => {
        // The paste path is a sanitisation boundary: pasted content comes
        // from outside the page and must not carry script or style through.
        boot();
        editor.start();
        const el = focus('body', 0, 0);
        editor.pasteHTML(el, '<p>safe<script>bad()</script></p>');
        const html = editor.regions()['body'].html();
        expect(html).toContain('safe');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('bad()');
    });

    it('ignores a paste with no usable content', () => {
        boot();
        editor.start();
        const before = editor.regions()['body'].html();
        const el = focus('body', 0, 0);
        editor.pasteHTML(el, '   \n  ');
        expect(editor.regions()['body'].html()).toBe(before);
    });
});

describe('EditorApp.busy()', () => {

    it('gets and sets the busy flag', () => {
        boot();
        expect(editor.busy()).toBe(false);
        editor.busy(true);
        expect(editor.busy()).toBe(true);
        editor.busy(false);
        expect(editor.busy()).toBe(false);
    });

    it('propagates to the ignition', () => {
        boot();
        editor.busy(true);
        expect(editor.ignition().state()).toBe('busy');
        editor.busy(false);
    });
});

describe('EditorApp.revert()', () => {

    it('proceeds when the user confirms', () => {
        // Scope note: this pins the decision, not the restore. revert()
        // returns true and fires its event, but with a single history
        // snapshot the content is NOT rolled back in place -- reverting
        // while still editing does not restore the regions, and that
        // behaviour is unverified rather than asserted here. The path hosts
        // actually use is stop(false), covered under lifecycle.
        boot();
        editor.start();
        let reverted = 0;
        editor.addEventListener('revert', () => reverted++);
        setText('body', 0, 'about to be discarded');

        const realConfirm = window.confirm;
        window.confirm = () => true;
        try {
            expect(editor.revert()).toBe(true);
        } finally {
            window.confirm = realConfirm;
        }
        expect(reverted).toBe(1);
    });

    it('keeps editing when the user cancels', () => {
        boot();
        editor.start();
        setText('body', 0, 'still wanted');

        const realConfirm = window.confirm;
        window.confirm = () => false;
        try {
            editor.revert();
        } finally {
            window.confirm = realConfirm;
        }

        // Cancelling must be a no-op: still editing, edit intact.
        expect(editor.isEditing()).toBe(true);
        expect(editor.regions()['body'].html()).toContain('still wanted');
    });
});

describe('EditorApp.highlightRegions()', () => {

    it('marks and unmarks every region', () => {
        boot();
        editor.start();
        editor.highlightRegions(true);
        const marked = () => Array.from(editor.domRegions())
            .filter(el => el.classList.contains('ct--highlight')).length;
        expect(marked()).toBeGreaterThan(0);
        editor.highlightRegions(false);
        expect(marked()).toBe(0);
    });
});

describe('EditorApp keyboard and document handlers', () => {

    /* `keyCode` is legacy and read-only: the KeyboardEvent constructor
       ignores it, so an event built the obvious way arrives with keyCode 0
       and none of these handlers fire. */
    function key(type, keyCode) {
        const ev = new KeyboardEvent(type, {bubbles: true});
        Object.defineProperty(ev, 'keyCode', {value: keyCode});
        return ev;
    }

    it('tracks the ctrl/cmd modifier state', () => {
        boot();
        editor.start();
        document.dispatchEvent(key('keydown', 17));
        expect(editor.ctrlDown()).toBe(true);
        document.dispatchEvent(key('keyup', 17));
        expect(editor.ctrlDown()).toBe(false);
    });

    it('tracks the shift modifier state', () => {
        boot();
        editor.start();
        document.dispatchEvent(key('keydown', 16));
        expect(editor.shiftDown()).toBe(true);
        document.dispatchEvent(key('keyup', 16));
        expect(editor.shiftDown()).toBe(false);
    });

    // NOT covered: the visibilitychange handler. It clears the modifier
    // state only when the page is genuinely hidden, and a test page driven
    // by Playwright is visible -- dispatching the event alone does not
    // reproduce the condition the handler checks.

    // NOT covered: the delayed shift-to-highlight path. It depends on
    // HIGHLIGHT_HOLD_DURATION being read at the time the timeout is armed,
    // and reproducing that reliably needs more control over the handler's
    // internals than is worth wiring up here. highlightRegions() itself is
    // covered directly above.
});

describe('EditorApp empty-region protection', () => {

    it('builds a placeholder element for a region', () => {
        boot();
        editor.start();
        const placeholder = editor.createPlaceholderElement(editor.regions()['blank']);
        expect(placeholder).toBeTruthy();
        expect(placeholder.type()).toBe('Text');
    });

    it('keeps an empty region clickable', () => {
        // A region with no children cannot be clicked back into, so the
        // editor keeps a placeholder in it.
        boot();
        editor.start();
        expect(editor.regions()['blank'].children.length).toBe(1);
    });
});

describe('EditorApp widgets', () => {

    it('exposes the ignition, toolbox and inspector while editing', () => {
        boot();
        expect(editor.ignition()).toBeTruthy();
        editor.start();
        expect(editor.toolbox()).toBeTruthy();
        expect(editor.inspector()).toBeTruthy();
    });

    // NOTE: withIgnition=false is not covered. init() only CREATES an
    // ignition when asked and never tears an existing one down, and
    // EditorApp is a singleton -- so once any test has booted with the
    // default, ignition() keeps returning that instance. Pinning it would
    // mean asserting the singleton wart rather than the intended behaviour.
});
