import {apply, h, list} from '../../../src/core/render.js';

/* The sixty lines that stand in for a view library.
 *
 * Every assertion below is about IDENTITY rather than equality -- `toBe`,
 * not `toEqual`. That is deliberate and it is the whole contract: a
 * reconciler that rebuilt every node on every render would produce DOM that
 * LOOKS right in any structural assertion, while destroying the caret in a
 * form field on every keystroke and detaching the editor's slot. `toEqual`
 * cannot tell those apart; `toBe` can.
 */

const doc = document;

function ul(items) {
    const parent = h(doc, 'ul');
    render(parent, items);
    return parent;
}

function render(parent, items) {
    list(parent, items, item => item.id,
        item => h(doc, 'li', {}, [item.label]),
        (el, item) => { el.textContent = item.label; });
}

const labels = parent => [...parent.children].map(el => el.textContent);

describe('h', function() {
    it('builds an element with attributes and children', function() {
        const el = h(doc, 'a', {href: '#/c/blog', class: 'nav'}, ['Blog']);
        expect(el.tagName).toBe('A');
        expect(el.getAttribute('href')).toBe('#/c/blog');
        expect(el.textContent).toBe('Blog');
    });

    it('skips a child that is absent', function() {
        // So a view can write `cond && h(...)` inline rather than building
        // an array conditionally, which is where the real noise comes from.
        const el = h(doc, 'p', {}, ['a', null, undefined, false, 'b']);
        expect(el.textContent).toBe('ab');
    });

    it('takes a number as a child', function() {
        expect(h(doc, 'span', {}, [0]).textContent).toBe('0');
    });

    it('nests elements', function() {
        const el = h(doc, 'div', {}, [h(doc, 'span', {}, ['in'])]);
        expect(el.firstElementChild.tagName).toBe('SPAN');
    });

    it('renders a label as text, never as markup', function() {
        /* There is no `html` key on Props and no innerHTML anywhere in
           src/shell/, and this is the assertion that keeps it that way.
        
           A collection's `label` comes out of a YAML file an operator hand
           edits -- and in a fork-based workflow, potentially out of a
           contributor's pull request. Rendering it as markup would run it
           inside the shell's shadow root, on a page holding a GitHub token
           in sessionStorage. */
        const el = h(doc, 'span', {}, ['<img src=x onerror="alert(1)">']);
        expect(el.querySelector('img')).toBe(null);
        expect(el.textContent).toBe('<img src=x onerror="alert(1)">');

        // The same for a value that arrives through props.
        const viaText = h(doc, 'span', {text: '<b>bold</b>'});
        expect(viaText.querySelector('b')).toBe(null);
    });

    it('builds in the document it is given, not the ambient one', function() {
        /* The reason `doc` is a parameter. An element inside an <iframe>
           whose chrome was built by the outer document's createElement is
           adopted on append -- silently, and with its constructed
           stylesheet no longer matching. */
        const frame = doc.createElement('iframe');
        doc.body.appendChild(frame);
        try {
            const inner = frame.contentDocument;
            expect(h(inner, 'div').ownerDocument).toBe(inner);
        } finally {
            frame.remove();
        }
    });
});

describe('apply', function() {
    it('sets text, attributes and listeners', function() {
        const el = h(doc, 'button');
        let clicks = 0;
        apply(el, {text: 'Save', class: 'primary', onclick: () => { clicks += 1; }});
        expect(el.textContent).toBe('Save');
        expect(el.getAttribute('class')).toBe('primary');
        el.click();
        expect(clicks).toBe(1);
    });

    it('removes an attribute set to false or null', function() {
        const el = h(doc, 'button', {disabled: true});
        apply(el, {disabled: false});
        expect(el.hasAttribute('disabled')).toBe(false);
        apply(el, {disabled: true});
        apply(el, {disabled: null});
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('replaces a listener rather than stacking a second one', function() {
        /* The classic keyed-list bug: a reused row's handler is bound again
           on every render, so it fires once, then twice, then three times.
           Nothing about the DOM looks wrong while it happens.
        
           A FRESH closure each time, which is what a render actually
           produces -- `update: el => apply(el, {onclick: () => open(item)})`.
           Re-using one function identity would not test this at all, since
           addEventListener silently de-duplicates an identical triple and
           the stacking bug would hide behind that. */
        const el = h(doc, 'button');
        let clicks = 0;
        for (let i = 0; i < 3; i += 1) {
            apply(el, {onclick: () => { clicks += 1; }});
        }
        el.click();
        expect(clicks).toBe(1);
    });
});

describe('list', function() {
    it('builds a node per item', function() {
        expect(labels(ul([{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]))).toEqual(['A', 'B']);
    });

    it('KEEPS the node for an unchanged key', function() {
        // The assertion the whole file exists for.
        const parent = ul([{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]);
        const [a, b] = [...parent.children];
        render(parent, [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]);
        expect(parent.children[0]).toBe(a);
        expect(parent.children[1]).toBe(b);
    });

    it('keeps the node while updating its content', function() {
        const parent = ul([{id: 'a', label: 'A'}]);
        const a = parent.children[0];
        render(parent, [{id: 'a', label: 'renamed'}]);
        expect(parent.children[0]).toBe(a);
        expect(a.textContent).toBe('renamed');
    });

    it('preserves focus across a re-render', function() {
        /* The user-visible consequence of identity, asserted directly
           rather than inferred: an innerHTML re-render takes the focused
           element with it and the field the user is typing into goes dead
           mid-word. */
        const parent = h(doc, 'div');
        doc.body.appendChild(parent);
        try {
            const draw = () => list(parent, [{id: 'a'}], item => item.id,
                () => h(doc, 'input'));
            draw();
            const input = parent.children[0];
            input.focus();
            input.value = 'half-typed';
            draw();
            expect(parent.children[0]).toBe(input);
            expect(doc.activeElement).toBe(input);
            expect(input.value).toBe('half-typed');
        } finally {
            parent.remove();
        }
    });

    it('updates a node it has just BUILT, not only ones it kept', function() {
        // Otherwise the first render of a list differs from every render
        // after it, and a caller has to say what a row looks like twice --
        // once in `make` and once in `update` -- with nothing to notice
        // when the two drift. It surfaces as a selected row that is not
        // highlighted until something unrelated re-renders it.
        const parent = h(doc, 'ul');
        list(parent, ['a'], k => k,
             () => h(doc, 'li'),
             (el, k) => { el.className = `row-${k}`; });
        expect(parent.children[0].className).toBe('row-a');
    });

    it('builds a node for a new key and removes a vanished one', function() {
        const parent = ul([{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]);
        const a = parent.children[0];
        render(parent, [{id: 'a', label: 'A'}, {id: 'c', label: 'C'}]);
        expect(labels(parent)).toEqual(['A', 'C']);
        expect(parent.children[0]).toBe(a);
    });

    it('reorders without rebuilding', function() {
        const parent = ul([{id: 'a', label: 'A'}, {id: 'b', label: 'B'}, {id: 'c', label: 'C'}]);
        const [a, b, c] = [...parent.children];
        render(parent, [{id: 'c', label: 'C'}, {id: 'a', label: 'A'}, {id: 'b', label: 'B'}]);
        expect(labels(parent)).toEqual(['C', 'A', 'B']);
        expect([...parent.children]).toEqual([c, a, b]);
    });

    it('empties the parent for an empty list', function() {
        const parent = ul([{id: 'a', label: 'A'}]);
        render(parent, []);
        expect(parent.children.length).toBe(0);
    });

    it('leaves a child it did not key alone', function() {
        /* What makes it safe to reconcile a list INSIDE a container that
           also holds something else -- a heading, or the editor's slot.
           Without this, rendering the list would delete the slot and leave
           a connected-but-invisible editor holding the lease forever. */
        const parent = h(doc, 'div');
        const slot = h(doc, 'slot', {name: 'editor'});
        parent.appendChild(slot);
        render(parent, [{id: 'a', label: 'A'}]);
        render(parent, [{id: 'b', label: 'B'}]);
        expect(parent.contains(slot)).toBe(true);
        expect(labels(parent)).toContain('B');
    });
});
