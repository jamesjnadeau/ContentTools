/* End-to-end coverage for every tool on the shelf.
 *
 * `tools.spec.js` is upstream's suite, ported as-is: it exercises about a
 * third of the tools, mostly through canApply()/isApplied(), and three of
 * its `it` bodies are empty stubs. This file is the other half of the
 * story -- each tool driven the way the toolbox drives it, against a real
 * started editor, asserting the HTML the region would hand a consumer in
 * `saved`.
 *
 * That end-to-end framing is deliberate. The table bug that prompted this
 * suite (a double `super()` from the CoffeeScript conversion) was
 * invisible to every unit-level assertion about the tool class, because
 * the tool class was fine; what threw was the dialog it constructs. Only
 * apply-and-look-at-the-result catches that shape of bug.
 *
 * `coverage.spec` at the end fails if a tool is stowed on the shelf with
 * no case here, so this cannot silently fall behind.
 */

// Every tool exercised below, by its ToolShelf name. The guard at the
// bottom compares this against the shelf itself.
const COVERED = new Set();

function covers(...names) {
    for (const name of names) {
        COVERED.add(name);
    }
}

// --- harness -------------------------------------------------------------

let div = null;
let editor = null;
let region = null;

function boot(html) {
    /* Tear down first: several tests re-boot with different markup, and a
       leftover `.editable` div would be picked up as a SECOND region by
       the next init(), shifting regions()['0'] onto stale content. That
       is not hypothetical -- it is what the first draft of this file did,
       and the failures it produced pointed at the tools rather than at
       the harness. */
    teardown();

    div = document.createElement('div');
    div.setAttribute('class', 'editable');
    div.innerHTML = html;
    document.body.appendChild(div);

    editor = ContentTools.EditorApp.get();
    editor.init('.editable');
    editor.start();
    region = editor.regions()['0'];
    return region;
}

function teardown() {
    if (editor) {
        // stop(true) saves; stop(false) reverts, which runs a confirm.
        editor.stop(true);
        editor.destroy();
        editor = null;
    }
    if (div && div.parentNode) {
        document.body.removeChild(div);
    }
    div = null;
    region = null;
}

/**
 * The region's HTML as a consumer would see it in `saved`, with the
 * pretty printer's line breaks and indentation collapsed.
 *
 * Only the newline-plus-indent the printer inserts is removed -- spaces
 * WITHIN a line are content and are left alone, so a lost or gained space
 * inside text still fails the assertion.
 */
function html() {
    return region.html().replace(/\n\s*/g, '').trim();
}

/** Focus `el` and select `[from, to)` of its content. */
function select(el, from, to) {
    el.focus();
    const selection = new ContentSelect.Range(
        from === undefined ? 0 : from,
        to === undefined ? el.content.length() : to);
    el.selection(selection);
    return selection;
}

/**
 * Apply a tool the way ToolboxUI does -- fetched from the shelf by name,
 * so registration is exercised too -- and return what it passed its
 * callback.
 */
function apply(name, el, selection) {
    const tool = ContentTools.ToolShelf.fetch(name);
    let applied = null;
    tool.apply(el, selection === undefined ? null : selection,
        ok => { applied = ok; });
    return applied;
}

/** The dialog the tool under test just attached to the app. */
function openDialog(cls) {
    return editor.children().filter(child => child instanceof cls)[0];
}

// --- inline text tools ---------------------------------------------------

describe('tools (end to end): inline text', function() {

    beforeEach(() => boot('<p>One two three</p>'));
    afterEach(teardown);

    it('bold wraps the selection in <b>', function() {
        covers('bold');
        const p = region.children[0];
        expect(apply('bold', p, select(p, 4, 7))).toBe(true);
        return expect(html()).toBe('<p>One <b>two</b> three</p>');
    });

    it('bold toggles back off over the same selection', function() {
        const p = region.children[0];
        apply('bold', p, select(p, 4, 7));
        apply('bold', p, select(p, 4, 7));
        return expect(html()).toBe('<p>One two three</p>');
    });

    it('italic wraps the selection in <i>', function() {
        covers('italic');
        const p = region.children[0];
        expect(apply('italic', p, select(p, 4, 7))).toBe(true);
        return expect(html()).toBe('<p>One <i>two</i> three</p>');
    });

    it('line-break inserts a <br> at the caret', function() {
        covers('line-break');
        const p = region.children[0];
        expect(apply('line-break', p, select(p, 3, 3))).toBe(true);
        return expect(html()).toBe('<p>One<br> two three</p>');
    });
});

// --- block-level conversions ---------------------------------------------

describe('tools (end to end): block conversions', function() {

    beforeEach(() => boot('<p>Heading text</p>'));
    afterEach(teardown);

    it('heading converts the block to <h1>', function() {
        covers('heading');
        const p = region.children[0];
        expect(apply('heading', p, select(p))).toBe(true);
        return expect(html()).toBe('<h1>Heading text</h1>');
    });

    it('subheading converts the block to <h2>', function() {
        covers('subheading');
        const p = region.children[0];
        expect(apply('subheading', p, select(p))).toBe(true);
        return expect(html()).toBe('<h2>Heading text</h2>');
    });

    it('preformatted converts the block to <pre>', function() {
        covers('preformatted');
        const p = region.children[0];
        expect(apply('preformatted', p, select(p))).toBe(true);
        return expect(html()).toContain('<pre');
    });

    it('paragraph converts a heading back to <p>', function() {
        covers('paragraph');
        let el = region.children[0];
        apply('heading', el, select(el));

        el = region.children[0];
        expect(apply('paragraph', el, select(el))).toBe(true);
        return expect(html()).toBe('<p>Heading text</p>');
    });
});

// --- alignment -----------------------------------------------------------

describe('tools (end to end): alignment', function() {

    beforeEach(() => boot('<p>Aligned</p>'));
    afterEach(teardown);

    it('align-left applies its class', function() {
        covers('align-left');
        const p = region.children[0];
        expect(apply('align-left', p, select(p))).toBe(true);
        return expect(html()).toBe('<p class="text-left">Aligned</p>');
    });

    it('align-center applies its class', function() {
        covers('align-center');
        const p = region.children[0];
        expect(apply('align-center', p, select(p))).toBe(true);
        return expect(html()).toBe('<p class="text-center">Aligned</p>');
    });

    it('align-right applies its class', function() {
        covers('align-right');
        const p = region.children[0];
        expect(apply('align-right', p, select(p))).toBe(true);
        return expect(html()).toBe('<p class="text-right">Aligned</p>');
    });

    /* The three are mutually exclusive: apply() strips the other two
       before adding its own, which is the only reason the toolbox can
       show them as a radio group. */
    it('a second alignment replaces the first rather than stacking', function() {
        const p = region.children[0];
        apply('align-left', p, select(p));
        apply('align-right', p, select(p));
        return expect(html()).toBe('<p class="text-right">Aligned</p>');
    });

    it('re-applying the same alignment toggles it off', function() {
        const p = region.children[0];
        apply('align-center', p, select(p));
        apply('align-center', p, select(p));
        return expect(html()).toBe('<p>Aligned</p>');
    });
});

// --- lists ---------------------------------------------------------------

describe('tools (end to end): lists', function() {

    beforeEach(() => boot('<p>Item</p>'));
    afterEach(teardown);

    /* The trailing empty <p> is upstream behaviour, preserved, and worth
       spelling out because it looks like a bug in this suite otherwise.
       The tool detaches the paragraph before attaching the list, and
       `detach` fires EditorApp's `_handleDetach` SYNCHRONOUSLY, which
       sees a region with no children and inserts a placeholder so the
       user is never left with nowhere to type. The list is then attached
       in front of it. Identical code path in the frozen v1.6.16 bundle
       (editor.ts:359 / legacy-bundle.js:8554). */
    it('unordered-list converts a paragraph to <ul>', function() {
        covers('unordered-list');
        const p = region.children[0];
        expect(apply('unordered-list', p, select(p))).toBe(true);
        return expect(html()).toBe('<ul><li>Item</li></ul><p></p>');
    });

    it('ordered-list converts a paragraph to <ol>', function() {
        covers('ordered-list');
        const p = region.children[0];
        expect(apply('ordered-list', p, select(p))).toBe(true);
        return expect(html()).toBe('<ol><li>Item</li></ol><p></p>');
    });

    /* Switching type retags the existing list rather than rebuilding it,
       so no detach happens and no placeholder appears. */
    it('applying the other list type switches the tag in place', function() {
        let el = region.children[0];
        apply('unordered-list', el, select(el));

        el = region.children[0].children[0].children[0];
        apply('ordered-list', el, select(el));
        return expect(html()).toBe('<ol><li>Item</li></ol><p></p>');
    });

    /* indent/unindent act on a list ITEM, and indent refuses the first
       item of a list -- there is nothing above it to nest under. */
    it('indent nests the second list item under the first', function() {
        covers('indent');
        boot('<ul><li>First</li><li>Second</li></ul>');

        const second = region.children[0].children[1].children[0];
        expect(ContentTools.ToolShelf.fetch('indent').canApply(second))
            .toBe(true);
        expect(apply('indent', second, select(second))).toBe(true);
        return expect(html()).toBe(
            '<ul><li>First<ul><li>Second</li></ul></li></ul>');
    });

    it('indent refuses the first list item', function() {
        boot('<ul><li>First</li><li>Second</li></ul>');

        const first = region.children[0].children[0].children[0];
        return expect(ContentTools.ToolShelf.fetch('indent').canApply(first))
            .toBe(false);
    });

    it('unindent lifts a nested item back out', function() {
        covers('unindent');
        boot('<ul><li>First</li><li>Second</li></ul>');

        let second = region.children[0].children[1].children[0];
        apply('indent', second, select(second));

        second = region.children[0].children[0].children[1].children[0].children[0];
        expect(apply('unindent', second, select(second))).toBe(true);
        return expect(html()).toBe('<ul><li>First</li><li>Second</li></ul>');
    });
});

// --- remove --------------------------------------------------------------

describe('tools (end to end): remove', function() {

    afterEach(teardown);

    it('removes the focused block', function() {
        covers('remove');
        boot('<p>Keep</p><p>Drop</p>');

        const second = region.children[1];
        expect(apply('remove', second, select(second))).toBe(true);
        return expect(html()).toBe('<p>Keep</p>');
    });

    it('removes a list item rather than the whole list', function() {
        boot('<ul><li>Keep</li><li>Drop</li></ul>');

        const second = region.children[0].children[1].children[0];
        expect(apply('remove', second, select(second))).toBe(true);
        return expect(html()).toBe('<ul><li>Keep</li></ul>');
    });
});

// --- history -------------------------------------------------------------

describe('tools (end to end): history', function() {

    beforeEach(() => boot('<p>Original</p>'));
    afterEach(teardown);

    /* undo/redo are the two tools with `requiresElement = false`: they
       act on the app's history rather than on whatever is focused. */
    it('undo and redo are declared not to require an element', function() {
        covers('undo', 'redo');
        expect(ContentTools.ToolShelf.fetch('undo').requiresElement).toBe(false);
        return expect(ContentTools.ToolShelf.fetch('redo').requiresElement)
            .toBe(false);
    });

    it('undo restores the previous snapshot and redo reapplies it', function() {
        const undo = ContentTools.ToolShelf.fetch('undo');
        const redo = ContentTools.ToolShelf.fetch('redo');

        // Nothing has changed yet, so there is nothing to undo.
        expect(undo.canApply(null, null)).toBe(false);

        const p = region.children[0];
        apply('heading', p, select(p));
        expect(html()).toBe('<h1>Original</h1>');

        /* Snapshot the change. The watcher polls every 50 ms and then
           waits 500 ms of inactivity before storing; _store() is the
           same code path it eventually calls, without the timers. */
        editor.history._store();

        expect(undo.canApply(null, null)).toBe(true);
        undo.apply(null, null, () => {});
        region = editor.regions()['0'];
        expect(html()).toBe('<p>Original</p>');

        expect(redo.canApply(null, null)).toBe(true);
        redo.apply(null, null, () => {});
        region = editor.regions()['0'];
        return expect(html()).toBe('<h1>Original</h1>');
    });
});

// --- dialog-driven tools -------------------------------------------------

describe('tools (end to end): link', function() {

    beforeEach(() => boot('<p>Go somewhere</p>'));
    afterEach(teardown);

    it('wraps the selection in an anchor with the given href', function() {
        covers('link');
        const p = region.children[0];
        const selection = select(p, 3, 12);

        expect(apply('link', p, selection)).toBe(null);   // dialog still open

        const dialog = openDialog(ContentTools.LinkDialog);
        expect(dialog).toBeDefined();

        dialog._domInput.value = 'https://example.com';
        dialog.save();

        return expect(html()).toBe(
            '<p>Go <a href="https://example.com">somewhere</a></p>');
    });

    it('saving an empty href removes the link', function() {
        const p = region.children[0];
        apply('link', p, select(p, 3, 12));

        let dialog = openDialog(ContentTools.LinkDialog);
        dialog._domInput.value = 'https://example.com';
        dialog.save();

        // Re-open over the same span and clear it.
        const linked = region.children[0];
        apply('link', linked, select(linked, 3, 12));
        dialog = openDialog(ContentTools.LinkDialog);
        dialog._domInput.value = '';
        dialog.save();

        return expect(html()).toBe('<p>Go somewhere</p>');
    });
});

describe('tools (end to end): image', function() {

    beforeEach(() => boot('<p>Before</p>'));
    afterEach(teardown);

    it('inserts an <img> after the focused element', function() {
        covers('image');
        const p = region.children[0];
        expect(apply('image', p, select(p))).toBe(null);  // dialog still open

        const dialog = openDialog(ContentTools.ImageDialog);
        expect(dialog).toBeDefined();

        dialog.save('/photo.png', [640, 480], {'alt': 'A photo'});

        const result = html();
        expect(result).toContain('<img');
        expect(result).toContain('src="/photo.png"');
        expect(result).toContain('width="640"');
        expect(result).toContain('height="480"');
        return expect(result).toContain('alt="A photo"');
    });
});

describe('tools (end to end): video', function() {

    beforeEach(() => boot('<p>Before</p>'));
    afterEach(teardown);

    it('inserts an <iframe> after the focused element', function() {
        covers('video');
        const p = region.children[0];
        expect(apply('video', p, select(p))).toBe(null);  // dialog still open

        const dialog = openDialog(ContentTools.VideoDialog);
        expect(dialog).toBeDefined();

        dialog._domInput.value = 'https://www.youtube.com/embed/t2rest';
        dialog.save();

        const result = html();
        expect(result).toContain('<iframe');
        return expect(result).toContain('youtube.com/embed/t2rest');
    });

    it('an empty URL inserts nothing and reports not-applied', function() {
        const p = region.children[0];
        apply('video', p, select(p));

        const dialog = openDialog(ContentTools.VideoDialog);
        dialog._domInput.value = '';
        dialog.save();

        return expect(html()).toBe('<p>Before</p>');
    });
});

describe('tools (end to end): table', function() {

    beforeEach(() => boot('<p>Before</p>'));
    afterEach(teardown);

    /* The regression this whole file grew out of: the insert path threw
       from TableDialog's constructor, so a table could be edited but
       never added. See ui/dialogs/table.spec.js for the constructor. */
    it('inserts a new table after the focused element', function() {
        covers('table');
        const p = region.children[0];
        expect(apply('table', p, select(p))).toBe(null);  // dialog still open

        const dialog = openDialog(ContentTools.TableDialog);
        expect(dialog).toBeDefined();
        expect(dialog.table).toBe(null);

        dialog._domBodyInput.value = '2';
        dialog.save();

        const result = html();
        expect(result).toContain('<table>');
        expect(result).toContain('<thead>');
        return expect(result).toContain('<tbody>');
    });
});

// --- the guard -----------------------------------------------------------

describe('tools (end to end): coverage', () => it('exercises every tool stowed on the shelf', function() {

    /* Adding a tool without a case above fails here rather than quietly
       shipping untested. If a new tool genuinely cannot be driven end to
       end, say so by calling covers() in a test that explains why. */
    const stowed = Object.keys(ContentTools.ToolShelf._tools).sort();
    const missing = stowed.filter(name => !COVERED.has(name));

    expect(missing).toEqual([]);
    return expect(stowed.length).toBe(21);
}));
