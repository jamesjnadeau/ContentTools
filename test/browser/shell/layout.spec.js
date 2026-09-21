import {createFakeGitHub, editorOf, forgetToken, openAt, until} from './helpers.js';

/* Nothing between the viewport and the editor may create a containing
 * block.
 *
 * The editor's chrome -- toolbox, inspector, modal, flashes -- is
 * `position: fixed`, which is resolved against the VIEWPORT unless some
 * ancestor has a `transform`, `filter`, `perspective`, `contain` or
 * `will-change`. Any one of those silently re-anchors the whole chrome to
 * the shell instead: the toolbox drifts as the pane scrolls and lands
 * somewhere that is not where the person dragged it.
 *
 * No DOM assertion can see this, and neither can a screenshot of a page
 * that happens not to be scrolled. So the property is asserted directly,
 * on the computed style of every ancestor, through both trees -- the
 * shell's shadow root and the document above it.
 */

/** The properties that make an element a containing block for `fixed`. */
const HAZARDS = ['transform', 'filter', 'perspective', 'contain', 'willChange'];

/** `none`, `normal` and `auto` are all "this does nothing". */
const INERT = new Set(['none', 'normal', 'auto', '']);

/** Every ancestor of `node`, crossing shadow boundaries, up to the root. */
function ancestors(node) {
    const out = [];
    let at = node.parentNode ?? node.host ?? null;
    while (at) {
        if (at.nodeType === Node.ELEMENT_NODE) {
            out.push(at);
        }
        at = at.parentNode ?? at.host ?? null;
    }
    return out;
}

describe('the editor is never inside a containing block', function() {

    let el = null;

    beforeEach(function() {
        forgetToken();
    });

    afterEach(function() {
        if (el) {
            el.remove();
            el = null;
        }
        forgetToken();
        history.replaceState(null, '', location.pathname + location.search);
    });

    async function open() {
        const fake = createFakeGitHub({files: {'content/blog/hello.md': '# Hi\n\nOne.\n'}});
        const mounted = await openAt('#/c/blog/e/hello', {fake});
        el = mounted.el;
        await until(() => editorOf(el)?.state === 'editing', 'the editor to start');
        return mounted;
    }

    function offenders(from) {
        const found = [];
        for (const node of ancestors(from)) {
            const style = getComputedStyle(node);
            for (const property of HAZARDS) {
                if (!INERT.has(style[property])) {
                    found.push(`${node.localName}.${node.className} ${property}`
                               + `=${style[property]}`);
                }
            }
        }
        return found;
    }

    it('has a clean chain above the editor element', async function() {
        await open();
        expect(offenders(editorOf(el))).toEqual([]);
    });

    it('has a clean chain above the slot it renders through', async function() {
        /* The slot's own chain, through the shell's shadow root. Slotting
           does not move nodes, so the editor's layout ancestry is the
           SLOT's -- which is the tree this file exists to check and the
           one a shell rule would land in. */
        await open();
        const slot = el.shadowRoot.querySelector('slot[name="editor"]');
        expect(slot).not.toBe(null);
        expect(offenders(slot)).toEqual([]);
    });

    it('would notice one', async function() {
        /* The guard's own guard. `ancestors()` crosses a shadow boundary
           by hand, and a version that stopped at the shadow root would
           report a clean chain for every rule this file is about. */
        await open();
        const main = el.shadowRoot.querySelector('.ct-cms__main');
        main.style.transform = 'translateZ(0)';
        try {
            expect(offenders(el.shadowRoot.querySelector('slot[name="editor"]')))
                .not.toEqual([]);
        } finally {
            main.style.transform = '';
        }
    });
});
