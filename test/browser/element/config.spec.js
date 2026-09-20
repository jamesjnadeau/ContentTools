import {create, mount, unmount, assertNoResidue} from './helpers.js';

/* The four settable properties, and the styles a consumer supplies.
 *
 * All four back onto process-global state that predates the element, so the
 * assertions come in pairs: the setting takes effect, AND the page gets it
 * back when the element goes. */

describe('properties', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    const TOOLS = [['bold', 'italic'], ['undo', 'redo']];

    it('applies tools set BEFORE the element is connected', () => {
        el = create();
        el.tools = TOOLS;
        document.body.appendChild(el);
        expect(el.editorApp.toolbox().tools()).toEqual(TOOLS);
    });

    it('applies tools set AFTER connection', () => {
        el = mount();
        el.tools = TOOLS;
        expect(el.editorApp.toolbox().tools()).toEqual(TOOLS);
    });

    it('applies a property assigned before the element upgraded', () => {
        /* The upgrade-property pattern. A value set on an element before
           its definition loads -- which is what a framework template does
           when the bundle is deferred -- becomes an OWN property that
           shadows the prototype accessor permanently, so the setter never
           runs and the assignment silently does nothing. */
        el = create();
        // Simulate the pre-upgrade state: an own data property over the
        // accessor the class defines.
        Object.defineProperty(el, 'tools', {
            value: TOOLS, writable: true, configurable: true, enumerable: true
        });
        expect(Object.prototype.hasOwnProperty.call(el, 'tools')).toBe(true);

        document.body.appendChild(el);

        expect(Object.prototype.hasOwnProperty.call(el, 'tools')).toBe(false);
        expect(el.tools).toEqual(TOOLS);
        expect(el.editorApp.toolbox().tools()).toEqual(TOOLS);
    });

    it('always passes an explicit fixtureTest', () => {
        /* init() assigns fixtureTest only when truthy, so on a singleton a
           custom test set by an earlier consumer sticks forever. The
           element passes its own on every boot so it never inherits one. */
        ContentTools.EditorApp.get()._fixtureTest = () => true;
        el = mount();
        const plain = document.createElement('div');
        expect(el.editorApp._fixtureTest(plain)).toBe(false);
    });

    it('honours a custom fixtureTest', () => {
        /* A fixture is a different CLASS from a region -- one editable
           element rather than a container of them -- so the test's effect
           is visible in what start() builds, not merely in what it was
           passed. */
        el = create({regions: '.fix, [data-editable]'},
                    '<div class="fix" data-name="fixed"><p>x</p></div>' +
                    '<div data-editable data-name="body"><p>y</p></div>');
        el.fixtureTest = domElement => domElement.classList.contains('fix');
        document.body.appendChild(el);
        el.start();

        const regions = el.editorApp.regions();
        expect(regions.fixed).toBeInstanceOf(ContentEdit.Fixture);
        expect(regions.body).toBeInstanceOf(ContentEdit.Region);
        el.stop(true);
    });

    it('sets and restores the image uploader', async () => {
        const before = ContentTools.IMAGE_UPLOADER;
        const uploader = () => {};
        el = create();
        el.imageUploader = uploader;
        document.body.appendChild(el);
        expect(ContentTools.IMAGE_UPLOADER).toBe(uploader);

        await unmount(el);
        el = null;
        expect(ContentTools.IMAGE_UPLOADER).toBe(before);
    });

    it('sets the image uploader after connection too', () => {
        el = mount();
        const uploader = () => {};
        el.imageUploader = uploader;
        expect(ContentTools.IMAGE_UPLOADER).toBe(uploader);
    });

    it('REPLACES the style palette on every boot rather than appending', async () => {
        /* StylePalette.add() is global and append-only, so an element that
           applied its palette on each connect would list every style twice
           the second time round. */
        const styles = [new ContentTools.Style('Big', 'big')];
        el = create();
        el.stylePalette = styles;
        document.body.appendChild(el);
        expect(ContentTools.StylePalette.styles()).toHaveLength(1);

        el.remove();
        await Promise.resolve();
        document.body.appendChild(el);
        expect(ContentTools.StylePalette.styles()).toHaveLength(1);
    });

    it('restores the style palette on teardown', async () => {
        const before = ContentTools.StylePalette.styles();
        el = create();
        el.stylePalette = [new ContentTools.Style('Big', 'big')];
        document.body.appendChild(el);
        expect(ContentTools.StylePalette.styles()).toHaveLength(1);

        await unmount(el);
        el = null;
        expect(ContentTools.StylePalette.styles()).toEqual(before);
    });

    it('exposes the editor app and context read-only', () => {
        el = mount();
        expect(el.editorApp).toBe(ContentTools.EditorApp.get());
        expect(el.rootContext).not.toBe(null);
        // Accessors with no setter: assignment is a silent no-op in sloppy
        // mode and a TypeError in strict, which module code is.
        expect(() => { el.editorApp = null; }).toThrow();
    });
});

describe('the chrome stylesheet', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    it('is adopted into the shadow root', () => {
        el = mount();
        expect(el.shadowRoot.adoptedStyleSheets.length).toBeGreaterThanOrEqual(2);
    });

    it('gives the host a block box', () => {
        // An unstyled custom element is display:inline, which gives it a
        // zero content box and collapses the editor inside it.
        el = mount();
        expect(getComputedStyle(el).display).toBe('block');
    });

    it('actually styles the chrome', () => {
        // The tofu-adjacent failure: an adopted sheet that does not apply
        // looks exactly like one that does, in every DOM assertion.
        el = mount({ignition: true});
        const ignition = el.shadowRoot.querySelector('.ct-ignition');
        expect(ignition).not.toBe(null);
        expect(getComputedStyle(ignition).position).toBe('fixed');
    });
});

describe('adoptStyles', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    /** The colour the chrome layer paints `.ct-app`, for the collision tests. */
    function appColour() {
        return getComputedStyle(el.shadowRoot.querySelector('.ct-app')).color;
    }

    it('accepts a CSSStyleSheet', () => {
        el = mount();
        const sheet = new CSSStyleSheet();
        sheet.replaceSync('.ct-app { color: rgb(0, 128, 0); }');
        el.adoptStyles(sheet);
        expect(appColour()).toBe('rgb(0, 128, 0)');
    });

    it('accepts CSS text', () => {
        // Text and URL are told apart by a `{`, documented rather than
        // guessed: nothing distinguishes `a{color:red}` from a path in
        // general.
        el = mount();
        el.adoptStyles('.ct-app { color: rgb(0, 0, 255); }');
        expect(appColour()).toBe('rgb(0, 0, 255)');
    });

    it('accepts a URL as a link element', () => {
        // A <link>, not fetch + replaceSync: fetching would need CORS
        // headers and so would fail for most real stylesheets.
        el = mount();
        el.adoptStyles('/site.css');
        const link = el.shadowRoot.querySelector('link[data-content-tools="adopted"]');
        expect(link).not.toBe(null);
        expect(link.getAttribute('href')).toBe('/site.css');
    });

    it('wins over the chrome at equal specificity', () => {
        /* The cascade guarantee, end to end through the element. The chrome
           sits in `@layer ct-chrome` precisely because insertion order
           cannot deliver this across adoptedStyleSheets and in-tree links. */
        el = mount();
        const before = appColour();
        el.adoptStyles('.ct-app { color: rgb(1, 2, 3); }');
        expect(before).not.toBe('rgb(1, 2, 3)');
        expect(appColour()).toBe('rgb(1, 2, 3)');
    });

    it('removes everything it added', () => {
        el = mount();
        const sheet = new CSSStyleSheet();
        sheet.replaceSync('.ct-app { color: rgb(0, 128, 0); }');
        el.adoptStyles(sheet);
        el.adoptStyles('.ct-app { color: rgb(0, 0, 255); }');
        el.adoptStyles('/site.css');

        el.removeAdoptedStyles();

        expect(el.shadowRoot.querySelectorAll('[data-content-tools="adopted"]'))
            .toHaveLength(0);
        expect(appColour()).not.toBe('rgb(0, 128, 0)');
        expect(appColour()).not.toBe('rgb(0, 0, 255)');
    });
});
