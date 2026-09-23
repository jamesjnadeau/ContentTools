import {create, mount, unmount, assertNoResidue} from './helpers.js';
import {HTML_PROFILE, MARKDOWN_PROFILE, allowTools} from '../../../src/core/profile.js';

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

    it('lets the host decide whether leaving loses work', () => {
        /* The editor's own answer reads its undo history, which knows
           nothing of a host's saves. Set before AND after connection,
           because a host builds the element before it is connected. */
        const asks = () => {
            const ev = new Event('beforeunload', {cancelable: true});
            let said = '';
            Object.defineProperty(ev, 'returnValue', {
                get: () => said,
                set: value => { said = value; }
            });
            window.dispatchEvent(ev);
            return said !== '';
        };
        let unsaved = true;
        el = create();
        el.unsavedTest = () => unsaved;
        document.body.appendChild(el);

        // Not editing, nothing in the history: only the host knows.
        expect(asks()).toBe(true);
        unsaved = false;
        expect(asks()).toBe(false);

        el.unsavedTest = () => true;
        expect(asks()).toBe(true);
        el.unsavedTest = null;
        expect(asks()).toBe(false);
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

/* `mode`, the markdown constraint.
 *
 * The profile itself is tested in `content-tools/markdown-mode.spec.js`
 * against a bare EditorApp. What is element-specific -- and what is
 * asserted here -- is that the attribute reaches the app BEFORE init(),
 * that an unrecognised value degrades instead of breaking, and that a
 * consumer-supplied tool list does not route around it.
 */
describe('mode', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    it('defaults to html', () => {
        el = mount();
        expect(el.mode).toBe('html');
        expect(el.editorApp.profile().name).toBe('html');
    });

    it('applies the markdown profile', () => {
        el = mount({mode: 'markdown'});
        expect(el.editorApp.profile().name).toBe('markdown');
    });

    it('reaches the toolbox, which means it arrived before init()', () => {
        // The toolbox is built inside init(), so a filtered toolbox is
        // proof the profile was set first rather than applied after.
        el = mount({mode: 'markdown'});
        const names = el.editorApp.toolbox().tools()
            .reduce((all, group) => all.concat(group), []);
        expect(names.length).toBe(17);
        expect(names.indexOf('video')).toBe(-1);
    });

    it('falls back to html for an unrecognised value', () => {
        // An attribute typo should not leave the element dead on the page.
        el = mount({mode: 'mrkdown'});
        expect(el.mode).toBe('html');
        expect(el.editorApp.profile().name).toBe('html');
    });

    it('filters a consumer-supplied tool list too', () => {
        el = mount({mode: 'markdown'});
        el.tools = [['bold', 'align-left'], ['video']];
        expect(el.editorApp.toolbox().tools()).toEqual([['bold']]);
    });

    it('filters one supplied before connection', () => {
        el = create({mode: 'markdown'});
        el.tools = [['bold', 'align-center']];
        document.body.appendChild(el);
        expect(el.editorApp.toolbox().tools()).toEqual([['bold']]);
    });

    it('rebuilds the editor when the mode changes', () => {
        el = mount();
        expect(el.editorApp.toolbox().tools().flat().length).toBe(21);
        el.setAttribute('mode', 'markdown');
        expect(el.editorApp.profile().name).toBe('markdown');
        expect(el.editorApp.toolbox().tools().flat().length).toBe(17);
    });

    it('refuses to change mode while editing', () => {
        // Rebuilding under a live editing session would strand the
        // regions, so the change is ignored with a warning, exactly as
        // content-scope already is.
        el = mount();
        el.start();
        el.setAttribute('mode', 'markdown');
        expect(el.editorApp.profile().name).toBe('html');
        el.stop();
    });
});

/* `profile`, for a consumer's own tool.
 *
 * Markdown mode allows the 17 built-in tools by name, so a tool stowed
 * under any other name is dropped from `tools` without a word. `profile`
 * is how a consumer widens that, and `allowTools` is the helper that
 * builds one.
 */
describe('profile', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    class Stamp extends ContentTools.Tool {
        static initClass() {
            ContentTools.ToolShelf.stow(this, 'test-stamp');
            this.label = 'Stamp';
            this.icon = 'stamp';
        }
    }
    Stamp.initClass();

    const WIDENED = allowTools(MARKDOWN_PROFILE, ['test-stamp']);

    it('is null, and mode decides, until one is set', () => {
        el = mount({mode: 'markdown'});
        expect(el.profile).toBe(null);
        expect(el.editorApp.profile()).toBe(MARKDOWN_PROFILE);
    });

    it('lets a custom tool through markdown mode', () => {
        el = create({mode: 'markdown'});
        el.profile = WIDENED;
        el.tools = [['bold', 'test-stamp', 'video']];
        document.body.appendChild(el);
        expect(el.editorApp.profile()).toBe(WIDENED);
        expect(el.editorApp.toolbox().tools()).toEqual([['bold', 'test-stamp']]);
    });

    it('filters tools set after boot against it too', () => {
        el = create({mode: 'markdown'});
        el.profile = WIDENED;
        document.body.appendChild(el);
        el.tools = [['test-stamp', 'align-left']];
        expect(el.editorApp.toolbox().tools()).toEqual([['test-stamp']]);
    });

    it('drops the custom tool without one', () => {
        el = mount({mode: 'markdown'});
        el.tools = [['bold', 'test-stamp']];
        expect(el.editorApp.toolbox().tools()).toEqual([['bold']]);
    });

    it('rebuilds a booted editor when it changes', () => {
        el = mount({mode: 'markdown'});
        el.tools = [['bold', 'test-stamp']];
        el.profile = WIDENED;
        expect(el.editorApp.profile()).toBe(WIDENED);
        expect(el.editorApp.toolbox().tools()).toEqual([['bold', 'test-stamp']]);

        el.profile = null;
        expect(el.editorApp.profile()).toBe(MARKDOWN_PROFILE);
        expect(el.editorApp.toolbox().tools()).toEqual([['bold']]);
    });

    it('refuses to change while editing', () => {
        el = mount({mode: 'markdown'});
        el.start();
        el.profile = WIDENED;
        expect(el.editorApp.profile()).toBe(MARKDOWN_PROFILE);
        el.stop();
    });

    it('is taken back when assigned before the element upgraded', () => {
        el = create({mode: 'markdown'});
        Object.defineProperty(el, 'profile', {
            value: WIDENED, writable: true, configurable: true, enumerable: true
        });
        document.body.appendChild(el);
        expect(Object.prototype.hasOwnProperty.call(el, 'profile')).toBe(false);
        expect(el.editorApp.profile()).toBe(WIDENED);
    });
});

describe('allowTools', () => {

    it('widens the tool list and nothing else', () => {
        const widened = allowTools(MARKDOWN_PROFILE, ['test-stamp']);
        expect(widened.tools.has('test-stamp')).toBe(true);
        expect(widened.tools.size).toBe(MARKDOWN_PROFILE.tools.size + 1);
        expect(widened.tags).toBe(MARKDOWN_PROFILE.tags);
        expect(widened.attributes).toBe(MARKDOWN_PROFILE.attributes);
        expect(widened.name).toBe('markdown+test-stamp');
        expect(Object.isFrozen(widened)).toBe(true);
        // The built-in profile is not touched.
        expect(MARKDOWN_PROFILE.tools.has('test-stamp')).toBe(false);
    });

    it('hands back a profile that already allows everything', () => {
        expect(allowTools(HTML_PROFILE, ['test-stamp'])).toBe(HTML_PROFILE);
    });

    it('hands back the same profile when there is nothing new', () => {
        expect(allowTools(MARKDOWN_PROFILE, ['bold'])).toBe(MARKDOWN_PROFILE);
    });
});

/* Regions given as ELEMENTS rather than as a selector.
 *
 * `EditorApp.init` has taken a list of DOM elements since 1.6 -- the
 * documented `queryOrDOMElements` half of its contract -- and this is that
 * capability reaching the element. It exists for the in-page surface,
 * which edits the site's own `<article>` where it stands: moving it under
 * the editor to make a selector reach it would change its ancestry, and
 * the site's CSS is written against the ancestry it has.
 */
describe('regionElements', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    /** An element OUTSIDE the editor, exactly as a site's page has. */
    function outside(name = 'body') {
        const node = document.createElement('article');
        node.className = 'post';
        node.setAttribute('data-name', name);
        node.innerHTML = '<p>on the page</p>';
        document.body.appendChild(node);
        return node;
    }

    let page = [];
    afterEach(() => { for (const node of page.splice(0)) node.remove(); });

    it('edits an element the editor does not contain', () => {
        const node = outside();
        page.push(node);
        el = create({}, '');
        el.regionElements = [node];
        document.body.appendChild(el);
        el.start();

        expect(Object.keys(el.editorApp.regions())).toEqual(['body']);
        /* Still where the page put it, and still not a child of ours. */
        expect(node.parentElement).toBe(document.body);
        expect(el.children).toHaveLength(0);
    });

    it('ignores the regions selector while a list is set', () => {
        /* Both would match if the selector were consulted: the fixture
           has two `[data-editable]` divs of its own. The list is the
           whole answer, not an addition to one. */
        const node = outside('outside');
        page.push(node);
        el = create();
        el.regionElements = [node];
        document.body.appendChild(el);
        el.start();

        expect(Object.keys(el.editorApp.regions())).toEqual(['outside']);
    });

    it('applies a list assigned AFTER connection', () => {
        const node = outside('later');
        page.push(node);
        el = mount();
        el.start();
        el.regionElements = [node];

        expect(Object.keys(el.editorApp.regions())).toEqual(['later']);
    });

    it('goes back to the selector when the list is withdrawn', () => {
        /* Not `syncRegions(null)`: that leaves the existing query in
           place for a falsy argument, so the editor would carry on
           editing the elements the caller just took away -- including,
           for the in-page surface, an element removed from the page. */
        const node = outside('outside');
        page.push(node);
        el = mount();
        el.start();
        el.regionElements = [node];
        el.regionElements = null;

        expect(Object.keys(el.editorApp.regions()).sort())
            .toEqual(['aside', 'body', 'title']);
    });

    it('copies the list, so a caller cannot edit the region set later', () => {
        /* `init` keeps the list and reads it again on every
           `syncRegions`, so a caller mutating the array they passed
           would be changing the editor's regions from outside at a
           moment nothing re-mounts. */
        const node = outside();
        page.push(node);
        const given = [node];
        el = create({}, '');
        el.regionElements = given;
        document.body.appendChild(el);
        el.start();
        given.length = 0;
        el.refresh();

        expect(Object.keys(el.editorApp.regions())).toEqual(['body']);
    });

    it('applies a list assigned before the element upgraded', () => {
        /* The upgrade-property pattern, as for the other four: a value
           set before the definition loads becomes an own property that
           shadows the accessor for ever. */
        const node = outside();
        page.push(node);
        el = create({}, '');
        Object.defineProperty(el, 'regionElements', {
            value: [node], writable: true, configurable: true, enumerable: true
        });
        document.body.appendChild(el);
        el.start();

        expect(Object.keys(el.editorApp.regions())).toEqual(['body']);
    });

    it('keeps the list when the regions ATTRIBUTE changes', () => {
        /* The attribute handler re-syncs, and re-syncing from the
           selector here would silently drop the element the caller
           supplied -- which for the in-page surface is the site's own
           article, left on the page and no longer editable. */
        const node = outside('outside');
        page.push(node);
        el = mount();
        el.start();
        el.regionElements = [node];
        el.setAttribute('regions', '[data-editable]');

        expect(Object.keys(el.editorApp.regions())).toEqual(['outside']);
    });

    it('reads back as null until one is set', () => {
        el = mount();
        expect(el.regionElements).toBe(null);
    });
});
