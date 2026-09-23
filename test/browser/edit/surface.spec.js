/* Which of four answers a page gets, and why.
 *
 * Driven through `resolve`, which is the whole decision as a value: a
 * config it fetches, a page it reads, and one `BarState` out. `open` is
 * tested separately and only for the promise it makes -- that it never
 * throws on somebody's site.
 */

import {
    CONFIG_META, CONTENT_STYLES_MARK, DEFAULT_CONFIG_URL, open, resolve
} from '../../../src/edit/surface.js';
import {BAR_TAG} from '../../../src/edit/chrome.js';
import {TOKEN_KEY} from '../../../src/auth/pat.js';
import {createFakeGitHub} from '../cms/fake-github.js';

const CONFIG = {
    backend: {repo: 'owner/site'},
    media: {folder: 'static/images', publicPath: '/images'},
    collections: [
        {name: 'blog', folder: 'content/blog',
         page: '/blog/{{slug}}/', body: 'article'},
        {name: 'notes', folder: 'content/notes'}
    ]
};

/** A page of the site, with its own document. */
function page(markup, config = CONFIG, url = 'https://site.test/blog/hello/') {
    const doc = document.implementation.createHTMLDocument('page');
    doc.body.innerHTML = markup;
    const asked = [];
    return {
        asked,
        where: {document: doc, location: {href: url}},
        options: {
            fetch: async requested => {
                asked.push(requested);
                return config === null
                    ? new Response('nope', {status: 404})
                    : new Response(typeof config === 'string'
                        ? config : JSON.stringify(config));
            }
        }
    };
}

const resolveOn = it => resolve(it.where, it.options);

/** Wait until `check()` is true, or fail saying what it was waiting for. */
async function until(check, describe) {
    /* A DEADLINE rather than a count of event-loop turns: some of what
       is waited on here is a real request to the test server, and a
       couple of hundred `setTimeout(0)` turns is not a duration -- on a
       loaded runner it elapses in milliseconds while the round trip has
       not landed. Only paid in full by a test that was going to fail. */
    const deadline = Date.now() + 5000;
    do {
        if (check()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    } while (Date.now() < deadline);
    throw new Error(`${describe} never happened`);
}

/* Everything a mounting test put in the real page, so `afterEach` can take
   it back out. `open` appends the bar and the editor to `document.body`
   itself, and the editor holds a process-wide lease, so a test that leaves
   one behind does not fail -- the NEXT one does. */
const planted = [];
const opened = [];

afterEach(async function() {
    for (const surface of opened) {
        surface.session?.close();
    }
    opened.length = 0;
    /* Teardown is deferred a microtask so a DOM move is not mistaken for a
       removal, so nothing about the removal is observable until the queue
       drains. Two, because the lease releases on the second. */
    await Promise.resolve();
    await Promise.resolve();

    for (const node of [...document.querySelectorAll(BAR_TAG)]) {
        node.remove();
    }
    for (const node of planted.splice(0)) {
        node.remove();
    }
    for (const link of [...document.head.querySelectorAll(
            `link[data-content-tools="${CONTENT_STYLES_MARK}"]`)]) {
        link.remove();
    }
    try {
        sessionStorage.removeItem(TOKEN_KEY);
    } catch {
        /* Storage refused, so nothing was ever written to it. */
    }
});

/**
 * Press the ignition switch, as a person does.
 *
 * Through the pencil in the editor's own shadow root rather than
 * `editor.start()`, because the switch IS what this surface now turns
 * on: nothing replaces the reader's page until it is pressed, and a
 * test that reached past it would go on passing over a switch that had
 * come unwired.
 */
function pressEdit(session, button = 'edit') {
    session.editor.shadowRoot
        .querySelector(`.ct-ignition__button--${button}`).click();
}

describe('resolve', function() {

    it('maps a page to its entry and finds the body', async function() {
        const state = await resolveOn(page('<article>Words.</article>'));

        expect(state.kind).toBe('ready');
        expect(state.entry).toEqual({collection: 'blog', slug: 'hello'});
        expect(state.selector).toBe('article');
        expect(state.body.tagName).toBe('ARTICLE');
    });

    it('takes the page at its own word over the URL', async function() {
        /* `<meta name="cms:entry">` exists for a site whose URLs no
           template can describe. If the URL ALSO matched, a template
           that happened to fit would quietly win and the markup would
           be decoration. */
        const state = await resolveOn(page(
            '<meta name="cms:entry" content="blog/other"><article>x</article>'));

        expect(state.entry.slug).toBe('other');
    });

    it('prefers the markup body selector to the config', async function() {
        const state = await resolveOn(page(
            '<article>no</article><div data-cms-body>yes</div>'));

        expect(state.selector).toBe('[data-cms-body]');
        expect(state.body.textContent).toBe('yes');
    });

    it('is an ordinary "not an entry" for an ordinary page', async function() {
        /* Most pages of most sites, and the commonest answer there is.
           An error here would put a fault on every page of the site. */
        const state = await resolveOn(
            page('<article>x</article>', CONFIG, 'https://site.test/about/'));

        expect(state.kind).toBe('not-an-entry');
        expect(state.hint).toContain('not one of the entries');
    });

    it('says so when NO collection is published anywhere', async function() {
        /* A different sentence, because it is a different problem: the
           first is a page nobody meant to edit, this is a config that
           can never edit anything, and telling an operator who forgot
           `page:` that their page is "not an entry" sends them to look
           at the page. */
        const state = await resolveOn(page('<article>x</article>', {
            ...CONFIG,
            collections: [{name: 'blog', folder: 'content/blog', body: 'article'}]
        }));

        expect(state.hint).toContain('No collection says where');
    });

    it('counts a file collection\'s own pages as published', async function() {
        /* The `page` of a file collection is on each FILE, so reading
           only `collection.page` tells a site that names every one of
           its pages that it has named none. */
        const state = await resolveOn(page('<article>x</article>', {
            ...CONFIG,
            collections: [{name: 'pages', body: 'article',
                           files: [{name: 'about', file: 'src/about.md',
                                    page: '/about/'}]}]
        }));

        expect(state.hint).toContain('not one of the entries');
    });

    it('names the collection when it has no body selector', async function() {
        /* One arrangement reaches this, and it took finding: the config
           REFUSES a `page` template with no `body` beside it, so a
           collection the URL can map to always has one. What is left is
           a collection with no `page` at all -- unreachable by URL, and
           reachable by a page that declares itself in its markup. */
        const state = await resolveOn(page(
            '<meta name="cms:entry" content="notes/x"><article>y</article>'));

        expect(state.kind).toBe('no-body');
        expect(state.entry).toEqual({collection: 'notes', slug: 'x'});
        expect(state.hint).toContain('notes');
    });

    it('names the selector when nothing on the page matches it', async function() {
        /* The one an operator hits at deploy time and nowhere else: the
           config is right, the page is right, and the theme calls it
           something else. */
        const state = await resolveOn(page('<main>x</main>'));

        expect(state.kind).toBe('no-body');
        expect(state.hint).toContain('article');
    });

    it('fetches the config from the root unless the page says otherwise',
       async function() {
        const it = page('<article>x</article>');
        await resolveOn(it);

        expect(it.asked).toEqual([DEFAULT_CONFIG_URL]);
    });

    it('lets the page name its own config', async function() {
        /* A site served under a prefix cannot be told where its config
           is by `site.base` -- that is inside the file being looked
           for. */
        const it = page(
            `<meta name="${CONFIG_META}" content="/prefix/cms-config.yml">`
            + '<article>x</article>');
        await resolveOn(it);

        expect(it.asked).toEqual(['/prefix/cms-config.yml']);
    });

    it('ignores a config meta that is only whitespace', async function() {
        /* Trimmed, and then treated as absent. An empty `content` is a
           template that rendered nothing -- a variable that was not set
           -- and fetching `""` fetches the page itself, which comes
           back as HTML and fails as a config. The default at least
           fails saying which file it wanted. */
        const it = page(
            `<meta name="${CONFIG_META}" content="   "><article>x</article>`);
        await resolveOn(it);

        expect(it.asked).toEqual([DEFAULT_CONFIG_URL]);
    });

    it('trims the config URL the page names', async function() {
        const it = page(
            `<meta name="${CONFIG_META}" content=" /a.yml "><article>x</article>`);
        await resolveOn(it);

        expect(it.asked).toEqual(['/a.yml']);
    });

    it('is a no-body for a match that is not an HTML element', async function() {
        /* `querySelector` answers for SVG as readily as for HTML, and an
           SVG node has no `innerHTML` contract the editor can use. It is
           also what narrows the type: `BarState.body` is an HTMLElement
           because this check says so. */
        const it = page('<svg class="post"></svg>', {
            ...CONFIG,
            collections: [{name: 'blog', folder: 'content/blog',
                           page: '/blog/{{slug}}/', body: '.post'}]
        });

        expect((await resolveOn(it)).kind).toBe('no-body');
    });

    it('parses YAML, which is what a site actually ships', async function() {
        const state = await resolveOn(page('<article>x</article>',
            'backend:\n  repo: owner/site\n'
            + 'media:\n  folder: static/images\n  publicPath: /images\n'
            + 'collections:\n  - name: blog\n    folder: content/blog\n'
            + '    page: /blog/{{slug}}/\n    body: article\n'));

        expect(state.kind).toBe('ready');
    });

    it('throws the config\'s own failure, for `open` to render', async function() {
        await expect(resolveOn(page('<article>x</article>', null)))
            .rejects.toThrow('404');
    });
});

describe('open', function() {

    it('puts the bar on the page and fills it in', async function() {
        const it = page('<article>x</article>');
        const {bar} = await open(it.where, it.options);

        expect(it.where.document.body.querySelector(BAR_TAG)).toBe(bar.node);
        /* `signed-out`, not `ready`: this page reached `ready` and went
           straight past it, because nothing in this tab holds a token.
           Which is the point -- the bar never stops at the decision, it
           reports where the decision LED. */
        expect(bar.node.shadowRoot.querySelector('.ct-edit').className)
            .toContain('ct-edit--signed-out');
    });

    it('never throws, and puts the reason where somebody can read it',
       async function() {
        /* This script is on every page of the site. A failure that
           becomes an uncaught error is a site that looks broken to
           everybody, over a feature only an author uses. */
        const it = page('<article>x</article>', null);
        const {bar} = await open(it.where, it.options);

        expect(bar.node.shadowRoot.querySelector('.ct-edit').className)
            .toContain('ct-edit--broken');
        const hint = bar.node.shadowRoot.querySelector('.ct-edit__hint');
        expect(hint.textContent).toContain('404');
        /* A ConfigError with no path has nothing to prefix, and a hint
           reading `: could not load ...` is a message about a path that
           is not there. */
        expect(hint.textContent.startsWith(':')).toBe(false);
    });

    it('says something readable for a failure that is not an Error',
       async function() {
        /* A `fetch` can reject with anything -- a DOMException, a string
           from a service worker, a rejected promise somebody wrote. This
           runs on a published page, so the floor is a sentence rather
           than `[object Object]` or nothing at all. */
        const it = page('<article>x</article>');
        it.options.fetch = () => Promise.reject('the network said no');
        const {bar} = await open(it.where, it.options);

        expect(bar.node.shadowRoot.querySelector('.ct-edit__hint').textContent)
            .toBe('the network said no');
    });

    it('says the offending path verbatim when the config is wrong',
       async function() {
        /* A typo in a hand-edited YAML file is the likeliest failure
           anyone hits with this tool, and `collections[0].folder` is an
           answer where a stack trace is not. */
        const it = page('<article>x</article>',
                        {...CONFIG, collections: [{name: 'blog'}]});
        const {bar} = await open(it.where, it.options);

        expect(bar.node.shadowRoot.querySelector('.ct-edit__hint').textContent)
            .toContain('collections[0]');
    });
});

describe('open, mounting', function() {

    /* A collection whose `body` names a CLASS as well as a tag. The point
       of every assertion below is that the site's own element is left
       exactly as the template rendered it, and `article` alone cannot tell
       "the element is untouched" from "the element was rebuilt". */
    const MOUNT_CONFIG = {
        ...CONFIG,
        collections: [
            {name: 'blog', folder: 'content/blog',
             page: '/blog/{{slug}}/', body: 'article.post',
             /* Declared, so the bar builds a real form over the seed's
                frontmatter. Without it every test below would exercise
                the no-fields branch and the byte-preservation rule --
                the one this whole surface rests on -- would never be
                asked of a save that has a form to merge. */
             fields: [{name: 'title', label: 'Title', widget: 'string',
                       required: true}]}
        ]
    };

    /* What the template rendered from the BASE branch, which is a
       different document from our render of the branch under review even
       when the two look identical. */
    const TEMPLATE = '<main class="layout">'
        + '<article class="post" id="post-1"><p>What the site built.</p></article>'
        + '</main>';

    const SOURCE = '---\ntitle: Hello\n---\n\n'
        + 'First paragraph.\n\nSecond paragraph.\n';

    /**
     * A page of the site, in the REAL document.
     *
     * Not `createHTMLDocument`, which is what `page()` above uses: custom
     * elements upgrade per BROWSING CONTEXT, and a document built by
     * `DOMImplementation` has none -- so `<content-tools-editor>` would
     * stay an inert unknown element and `start()` would not be a method.
     * A test that mounts has to mount where the registry is.
     */
    function sitePage(options = {}) {
        const {
            markup = TEMPLATE,
            config = MOUNT_CONFIG,
            files = {'content/blog/hello.md': SOURCE},
            token = 'github_pat_test',
            url = 'https://site.test/blog/hello/'
        } = options;

        const host = document.createElement('div');
        host.innerHTML = markup;
        document.body.appendChild(host);
        planted.push(host);

        const fake = createFakeGitHub({files});
        if (token !== null) {
            sessionStorage.setItem(TOKEN_KEY, token);
        }

        return {
            host, fake,
            body: () => document.querySelector('article.post'),
            where: {document, location: {href: url}},
            options: {
                fetch: async (input, init) => {
                    const at = typeof input === 'string'
                        ? input : String(input.url ?? input);
                    return at === DEFAULT_CONFIG_URL
                        ? new Response(JSON.stringify(config))
                        : fake.fetch(input, init);
                }
            }
        };
    }

    /** Open one, and remember it so `afterEach` can close it. */
    async function mount(it, extra = {}) {
        const surface = await open(it.where, {...it.options, ...extra});
        opened.push(surface);
        return surface;
    }

    const said = bar => ({
        className: bar.node.shadowRoot.querySelector('.ct-edit').className,
        title: bar.node.shadowRoot.querySelector('.ct-edit__title').textContent,
        hint: bar.node.shadowRoot.querySelector('.ct-edit__hint').textContent
    });

    it('edits the site\'s own element where it stands', async function() {
        /* The whole reason `regionElements` exists. Moving this element
           under the editor to make a selector reach it would change its
           ancestry, and `.layout > article.post` -- an ordinary rule for
           a theme to have written -- stops matching the moment it moves.
           The page would reflow the instant somebody pressed Edit, which
           defeats the only thing this surface is for. */
        const it = sitePage();
        const before = it.body();
        await mount(it);

        const after = it.body();
        expect(after).toBe(before);
        expect(after.parentElement.className).toBe('layout');
        expect(after.className).toBe('post');
        expect(after.id).toBe('post-1');
        /* And it IS the region, rather than an element left alone
           because nothing happened to it: `data-name` is the one
           attribute written on markup we did not make. */
        expect(after.getAttribute('data-name')).toBe('body');
    });

    it('leaves the reader\'s own page exactly as the site built it',
       async function() {
        /* The whole of what the switch is for. The editor element is on
           the page and its switch is up, and NOTHING else has happened:
           no toolbox, no `.ce-element`, and above all the site's own
           markup still in the site's own element. An author who opens a
           post and does not press anything is looking at the page a
           reader looks at. */
        const it = sitePage();
        await mount(it);

        const body = it.body();
        expect(body.textContent).toBe('What the site built.');
        expect(body.querySelector('[data-ct-md]')).toBe(null);
        expect(body.querySelector('.ce-element')).toBe(null);
    });

    it('puts the switch up, and only the switch', async function() {
        const it = sitePage();
        const {session} = await mount(it);

        expect(session).not.toBe(null);
        const app = ContentTools.EditorApp.current();
        expect(app).not.toBe(null);
        expect(app.isMounted()).toBe(true);
        /* Ready, not editing: the editor is initialised and inert. */
        expect(app.getState()).toBe('ready');
        expect(app.regions()).toEqual({});
        /* And the pencil is genuinely there to be pressed. */
        const chrome = session.editor.shadowRoot;
        expect(chrome.querySelector('.ct-ignition--ready')).not.toBe(null);
        expect(chrome.querySelector('.ct-toolbox')).toBe(null);
        expect(it.body().hasAttribute('data-editable')).toBe(false);
    });

    it('leaves the editor element itself empty, at the end of the page',
       async function() {
        /* Its regions are named, so it needs no children, and an empty
           block is the smallest footprint a custom element can have on a
           page it does not own. */
        const it = sitePage();
        const {session} = await mount(it);

        expect(session.editor.parentElement).toBe(document.body);
        expect(session.editor.children).toHaveLength(0);
    });

    it('names the entry, and says how to start', async function() {
        /* The entry, not the element. Which element the `body` selector
           matched is a deployment question, and answering it here
           charged every author on every page for it; `no-body` is where
           the selector is still reported, because that is the
           arrangement where somebody needs to act on it. */
        const it = sitePage();
        const {bar} = await mount(it);

        expect(said(bar).className).toContain('ct-edit--editing');
        expect(said(bar).title).toBe('blog/hello');
        expect(said(bar).hint).toBe(
            'Press the pencil, top left of the page, to edit it.');
    });

    it('round-trips the file byte for byte when nothing is edited',
       async function() {
        /* The strongest single statement that the mount is real: the
           bytes went through the markdown parser, our HTML walker, a live
           `ContentEdit.Region` and back, and came out the same file. A
           save here would produce no diff at all, which is what makes the
           first real diff worth reading. */
        const it = sitePage();
        const {session} = await mount(it);

        expect(session.pending().content).toBe(SOURCE);
        expect(session.dirty()).toBe(false);
    });

    it('stops at the answer for an ordinary page of the site', async function() {
        /* The commonest case there is, and the one where going further
           costs most: this script is on every page, so an `/about/`
           that reached the editing path would put a fault -- or an
           editor -- on a page nobody meant to edit. */
        const it = sitePage({url: 'https://site.test/about/'});
        const {bar, session} = await mount(it);

        expect(session).toBe(null);
        expect(said(bar).className).toContain('ct-edit--not-an-entry');
        expect(it.body().textContent).toBe('What the site built.');
        expect(document.querySelector('content-tools-editor')).toBe(null);
    });

    it('puts nothing in the console when the bar is pressed with no editor up',
       async function() {
        /* The bar is on every page of the site, and its controls are
           built with it: `hidden` does not stop a click reaching a
           button, and nothing has filled the holder those handlers
           reach through. A TypeError here would be an error in the
           console of somebody else's published page, over a feature
           only an author uses. */
        const it = sitePage({url: 'https://site.test/about/'});
        const {bar} = await mount(it);
        const root = bar.node.shadowRoot;

        const errors = [];
        const caught = event => errors.push(event.message);
        addEventListener('error', caught);
        try {
            root.querySelector('.ct-edit__details').click();
            root.querySelector('.ct-edit__submit').click();
        } finally {
            removeEventListener('error', caught);
        }

        expect(errors).toEqual([]);
        expect(root.querySelector('.ct-edit').className)
            .toContain('ct-edit--not-an-entry');
    });

    it('reads the media folder in the same round trip', async function() {
        /* The names it already holds are what an upload is staged
           against, and a collision has to be settled when the image is
           inserted rather than at commit time -- the URL the editor
           shows has to be the URL that ends up in the file. */
        const it = sitePage();
        await mount(it);

        const paths = it.fake.requests.map(([, at]) => at);
        expect(paths.some(at => at.includes('contents/static%2Fimages')
                             || at.includes('contents/static/images'))).toBe(true);
    });

    it('says it is reading the branch while it reads', async function() {
        /* The one state nothing else can see, because every other test
           waits for the answer. It matters on a real page for the
           reason it is hard to test: the words about to replace what is
           on screen are the ones under review rather than the ones this
           page was built from, and a bar that said nothing between the
           press and the swap would look like a page rewriting itself. */
        const it = sitePage();
        const asked = it.options.fetch;
        let release;
        const held = new Promise(resolve => { release = resolve; });
        it.options.fetch = async (input, init) => {
            const at = typeof input === 'string' ? input : String(input.url ?? input);
            if (at.includes('api.github.com')) {
                await held;
            }
            return asked(input, init);
        };

        const opening = open(it.where, it.options);
        const panel = () => document.querySelector(BAR_TAG)
            .shadowRoot.querySelector('.ct-edit');
        await until(() => panel().className.includes('ct-edit--loading'),
                    'the bar to say it is reading');
        /* And the page still shows what the site built, because nothing
           has been replaced yet. */
        expect(it.body().textContent).toBe('What the site built.');

        release();
        opened.push(await opening);
        await until(() => panel().className.includes('ct-edit--editing'),
                    'the editor to come up');
    });

    it('stops at the bar, and changes nothing, when nobody is signed in',
       async function() {
        /* The in-page script must never offer to sign anybody in: a
           credential field appearing on a published blog post is
           indistinguishable from the thing every phishing guide warns
           about. So it reads the token and stops. */
        const it = sitePage({token: null});
        const {bar, session} = await mount(it);

        expect(session).toBe(null);
        expect(said(bar).className).toContain('ct-edit--signed-out');
        expect(said(bar).hint).toContain('Sign in through the admin');
        /* And the page is exactly as the site built it. An author who is
           signed out should not be able to tell this script is there. */
        expect(it.body().textContent).toBe('What the site built.');
        expect(ContentTools.EditorApp.current()).toBe(null);
    });

    it('still names the element when the read fails', async function() {
        /* A read that failed did not un-find the body, and somebody
           looking at a 404 still wants to know the selector was right. */
        const it = sitePage();
        const asked = it.options.fetch;
        it.options.fetch = async (input, init) => {
            const at = typeof input === 'string' ? input : String(input.url ?? input);
            if (at.includes('api.github.com')) {
                throw new Error('the network said no');
            }
            return asked(input, init);
        };
        const {bar, session} = await mount(it);

        expect(session).toBe(null);
        expect(said(bar).className).toContain('ct-edit--failed');
        expect(said(bar).title).toBe('blog/hello');
        expect(said(bar).hint).toBe('the network said no');
        expect(it.body().textContent).toBe('What the site built.');
    });

    it('adds no stylesheet link when it was told of none', async function() {
        /* A host page that calls `open()` itself passes no href, and
           assigning `undefined` to `link.href` is not a no-op: it
           resolves to `/undefined` and every mount fetches a 404 that
           styles nothing. */
        await mount(sitePage());

        expect(document.head.querySelector(
            `link[data-content-tools="${CONTENT_STYLES_MARK}"]`)).toBe(null);
    });

    it('links the content stylesheet once, however many entries are opened',
       async function() {
        /* Idempotent by MARKER rather than by a module-level flag,
           because the thing that must not happen twice is a link in this
           document -- and a flag would also suppress it in a second
           document the same module is running against. */
        const href = 'data:text/css,.ct-probe%7Bcolor%3Ared%7D';
        const it = sitePage();
        const first = await mount(it, {contentStyles: href});
        first.session.close();
        opened.length = 0;
        await Promise.resolve();
        await Promise.resolve();

        await mount(sitePage(), {contentStyles: href});

        const links = document.head.querySelectorAll(
            `link[data-content-tools="${CONTENT_STYLES_MARK}"]`);
        expect(links).toHaveLength(1);
        expect(links[0].href).toBe(href);
    });

    describe('a site\'s own tools', function() {

        /* `window.contentToolsEdit`, handed to `open` by `./index.ts`.
           Each test makes its own object, because `setup` runs once per
           object and that is one of the things asserted. */
        function extension(extra = {}) {
            const calls = [];
            return {
                calls,
                value: {
                    setup(library) {
                        calls.push(library);
                        class Pin extends library.ContentTools.Tool {
                            static initClass() {
                                library.ContentTools.ToolShelf.stow(this, 'test-pin');
                                this.label = 'Pin';
                                this.icon = 'pin';
                            }
                        }
                        Pin.initClass();
                    },
                    allowTools: ['test-pin'],
                    ...extra
                }
            };
        }

        it('stows the tool with the library the editor uses, and shows it',
           async function() {
            const ext = extension();
            const {session} = await mount(sitePage(), {extension: ext.value});

            expect(session).not.toBe(null);
            expect(ext.calls).toHaveLength(1);
            expect(ext.calls[0].ContentTools).toBe(ContentTools);
            expect(ext.calls[0].ContentEdit).toBe(ContentEdit);
            /* The in-page editor is ALWAYS markdown, so without the
               widened profile the name would be filtered out here. */
            expect(session.editor.profile.tools.has('test-pin')).toBe(true);
            const groups = session.editor.editorApp.toolbox().tools();
            expect(groups[groups.length - 1]).toEqual(['test-pin']);
            /* And the rest of the constraint still stands. */
            expect(groups.flat()).not.toContain('video');
        });

        it('takes the site\'s own layout when it gives one', async function() {
            const ext = extension({tools: [['bold', 'test-pin', 'align-left']]});
            const {session} = await mount(sitePage(), {extension: ext.value});

            expect(session.editor.editorApp.toolbox().tools())
                .toEqual([['bold', 'test-pin']]);
        });

        it('waits for a setup that returns a promise', async function() {
            const ext = extension();
            const sync = ext.value.setup;
            ext.value.setup = async library => {
                await new Promise(resolve => setTimeout(resolve, 0));
                sync(library);
            };
            const {session} = await mount(sitePage(), {extension: ext.value});

            expect(session.editor.editorApp.toolbox().tools().flat())
                .toContain('test-pin');
        });

        it('runs setup once, however many entries are opened', async function() {
            const ext = extension();
            const first = await mount(sitePage(), {extension: ext.value});
            first.session.close();
            opened.length = 0;
            await Promise.resolve();
            await Promise.resolve();

            await mount(sitePage(), {extension: ext.value});
            expect(ext.calls).toHaveLength(1);
        });

        it('adopts its styles into the editor\'s shadow root', async function() {
            const ext = extension({styles: '.ct-tool--pin:before{content:"P"}'});
            const {session} = await mount(sitePage(), {extension: ext.value});

            const adopted = session.editor.shadowRoot
                .querySelectorAll('[data-content-tools="adopted"]');
            expect(adopted).toHaveLength(1);
            expect(adopted[0].textContent).toContain('.ct-tool--pin');
        });

        it('says so on the bar when a tool was never stowed', async function() {
            /* Rather than letting `ToolShelf.fetch` throw from inside the
               click that builds the toolbox, which is an editor that
               silently fails to open. */
            const it = sitePage();
            const {bar, session} = await mount(it, {
                extension: {allowTools: ['test-nowhere']}
            });

            expect(session).toBe(null);
            expect(said(bar).className).toContain('ct-edit--failed');
            expect(said(bar).hint).toContain('`test-nowhere`');
            expect(document.querySelector('content-tools-editor')).toBe(null);
            expect(it.body().textContent).toBe('What the site built.');
        });

        it('says so on the bar when a key has the wrong shape', async function() {
            const {bar} = await mount(sitePage(), {
                extension: {tools: ['bold']}
            });

            expect(said(bar).hint)
                .toBe('contentToolsEdit.tools[0] must be an array of tool names.');
        });
    });

    describe('the switch', function() {

        /* v1.6.16's ignition, back on the surface that needed it most.
           The editor element goes up when the entry is read, and the
           reader's page is untouched until somebody presses the pencil
           -- so an author who arrives with `?cms-edit` on the URL, or
           who followed Edit from /admin, still gets a page that looks
           exactly like the published one until they say otherwise.

           The three buttons and the three things they mean: the pencil
           puts our render of the branch in the page and starts the
           editor; the green tick keeps what was typed and takes the
           tools away; the red cross discards it and hands the reader's
           own markup back. */

        /** Whatever `window.confirm` answers while `fn` runs. */
        async function confirming(answer, fn) {
            const real = window.confirm;
            window.confirm = () => answer;
            try {
                await fn();
            } finally {
                window.confirm = real;
            }
        }

        /** Rewrite one block, as typing into it would. */
        function retype(session, text, index = 0) {
            const block = session.editor.editorApp
                .regions().body.children[index];
            block.content = new HTMLString.String(text);
            block.updateInnerHTML();
            block.taint();
        }

        it('replaces the template\'s HTML with our render of the branch',
           async function() {
            /* The two are different documents even when they look the
               same: the template's is built from the base branch by a
               static site generator, ours carries the `data-ct-md`
               indices the splice reads back. Editing the template's
               markup would serialize to bytes that splice against the
               wrong blocks -- so the swap has to happen, and it has to
               happen BEFORE ContentEdit parses anything. */
            const it = sitePage();
            const {session} = await mount(it);
            pressEdit(session);

            const body = it.body();
            expect(body.textContent).not.toContain('What the site built');
            expect(body.textContent).toContain('First paragraph.');
            expect(body.querySelector('[data-ct-md]')).not.toBe(null);
            /* And ContentEdit read OUR markup, not the template's: the
               region it parsed has one child per markdown block. */
            const app = ContentTools.EditorApp.current();
            expect(app.getState()).toBe('editing');
            expect(Object.keys(app.regions())).toEqual(['body']);
            expect(app.regions().body.children).toHaveLength(2);
        });

        it('says it is editing only once it is', async function() {
            const it = sitePage();
            const {bar, session} = await mount(it);
            expect(said(bar).hint).toContain('Press the pencil');

            pressEdit(session);

            expect(said(bar).hint).toBe('Editing this page.');
        });

        it('keeps what was typed when the tick is pressed', async function() {
            /* The green tick means "I am done", not "throw that away".
               The tools go, the page keeps the edit, and Submit still
               has something to commit -- which is the whole reason the
               bar's button stays live with the switch off. */
            const it = sitePage();
            const {bar, session} = await mount(it);
            pressEdit(session);
            retype(session, 'Rewritten.');

            pressEdit(session, 'confirm');

            expect(session.started()).toBe(false);
            expect(ContentTools.EditorApp.current().getState()).toBe('ready');
            expect(it.body().textContent).toContain('Rewritten.');
            expect(session.pending().content).toContain('Rewritten.');
            expect(session.dirty()).toBe(true);
            expect(said(bar).hint).toContain('Press the pencil');
        });

        it('hands the reader\'s own page back when the cross is pressed',
           async function() {
            /* The editor's own revert restores the snapshot it took at
               `start()`, and that snapshot is OUR render -- so without
               the session putting the original back, cancelling would
               leave the page showing the thing the person just asked to
               be rid of. */
            const it = sitePage();
            const {session} = await mount(it);
            pressEdit(session);
            retype(session, 'Rewritten.');

            await confirming(true, () => pressEdit(session, 'cancel'));

            expect(session.started()).toBe(false);
            const body = it.body();
            expect(body.innerHTML).toBe('<p>What the site built.</p>');
            /* And the edit is gone from the bytes too. Leaving it would
               mean Submit committing what the cross discarded. */
            expect(session.pending().content).toBe(SOURCE);
            expect(session.dirty()).toBe(false);
        });

        it('stays on when the cross is refused', async function() {
            /* `CANCEL_MESSAGE` puts a confirm dialog up and a person who
               says no aborts the stop, so `ct-stopped` never arrives.
               This is the case a flag set on `ct-revert` gets wrong: it
               would still be standing at the next stop, and the next
               stop is usually the tick -- so saying no to "discard your
               changes?" would discard them one press later. */
            const it = sitePage();
            const {session} = await mount(it);
            pressEdit(session);
            retype(session, 'Rewritten.');

            await confirming(false, () => pressEdit(session, 'cancel'));

            expect(session.started()).toBe(true);
            expect(it.body().textContent).toContain('Rewritten.');

            /* And the tick, now, keeps it. */
            pressEdit(session, 'confirm');
            expect(session.pending().content).toContain('Rewritten.');
        });

        it('picks the edits back up on a second press', async function() {
            /* A person who presses the tick to read the page, then
               presses the pencil again to carry on, must not find the
               file they started from. */
            const it = sitePage();
            const {session} = await mount(it);
            pressEdit(session);
            retype(session, 'Rewritten.');
            pressEdit(session, 'confirm');

            pressEdit(session);

            expect(it.body().textContent).toContain('Rewritten.');
            retype(session, 'Rewritten twice.');
            pressEdit(session, 'confirm');
            expect(session.pending().content).toContain('Rewritten twice.');
        });

        it('cancels the session, not every session before it',
           async function() {
            /* The cross means "back to where the pencil found it",
               which is what the editor's own revert means -- and after
               a tick that is NOT the file. Somebody who edits, presses
               the tick to read the page, presses the pencil again and
               then changes their mind is cancelling the second
               session. Throwing the first one away as well is silent
               data loss: the confirm dialog only appears when THIS
               session has changed something, so a cross pressed
               straight after a pencil would not even ask. */
            const it = sitePage();
            const {session} = await mount(it);
            pressEdit(session);
            retype(session, 'Kept.');
            pressEdit(session, 'confirm');

            pressEdit(session);
            retype(session, 'Discarded.');
            await confirming(true, () => pressEdit(session, 'cancel'));

            expect(it.body().textContent).toContain('Kept.');
            expect(it.body().textContent).not.toContain('Discarded.');
            expect(session.pending().content).toContain('Kept.');
            expect(session.pending().content).not.toContain('Discarded.');
        });

        it('asking what a save would write does not make a cancel keep it',
           async function() {
            /* `pending()` is the first thing Submit does, and it asks
               the editor for the body -- which moves the cached
               answer. So a person who presses Submit, has it refused
               for a field they left empty, and then presses the cross
               has a cached body that is NOT where the pencil found it.
               Without the restore, the next Submit commits exactly
               what the cross discarded. */
            const it = sitePage();
            const {session} = await mount(it);
            pressEdit(session);
            retype(session, 'Kept.');
            pressEdit(session, 'confirm');

            pressEdit(session);
            retype(session, 'Discarded.');
            expect(session.pending().content).toContain('Discarded.');
            await confirming(true, () => pressEdit(session, 'cancel'));

            expect(session.pending().content).toContain('Kept.');
            expect(session.pending().content).not.toContain('Discarded.');
        });

        it('renders the branch afresh after a cancel', async function() {
            const it = sitePage();
            const {session} = await mount(it);
            pressEdit(session);
            retype(session, 'Rewritten.');
            await confirming(true, () => pressEdit(session, 'cancel'));

            pressEdit(session);

            expect(it.body().textContent).toContain('First paragraph.');
            expect(it.body().textContent).not.toContain('Rewritten.');
        });
    });
});

describe('open, submitting', function() {

    /* The same site as above, and the same seed. Kept separate from
       `open, mounting` because everything here happens AFTER the mount:
       what the two controls do, and what the page is told about it. */
    const MOUNT_CONFIG = {
        ...CONFIG,
        collections: [
            {name: 'blog', folder: 'content/blog',
             page: '/blog/{{slug}}/', body: 'article.post',
             fields: [{name: 'title', label: 'Title', widget: 'string',
                       required: true}]}
        ]
    };

    const ENTRY = 'content/blog/hello.md';
    const BRANCH = 'cms/blog/hello';
    /* A comment and a second key, both of which a YAML round trip
       loses. They are what a byte-for-byte assertion is FOR: `title:
       Hello` alone survives being re-emitted. */
    const SOURCE = '---\n# the post\ntitle: Hello\nlayout: post\n---\n\n'
        + 'First paragraph.\n\nSecond paragraph.\n';

    const TEMPLATE = '<main class="layout">'
        + '<article class="post"><p>What the site built.</p></article>'
        + '</main>';

    /** A page of the site, in the REAL document. See `sitePage` above. */
    function sitePage(options = {}) {
        const {config = MOUNT_CONFIG, files = {[ENTRY]: SOURCE}} = options;

        const host = document.createElement('div');
        host.innerHTML = TEMPLATE;
        document.body.appendChild(host);
        planted.push(host);

        const fake = createFakeGitHub({files});
        sessionStorage.setItem(TOKEN_KEY, 'github_pat_test');

        /* Swappable AFTER the mount, which the page's own `options`
           are not: `CmsRepo` is handed the function at construction,
           so a test that reassigns `options.fetch` to break a save is
           reassigning something nobody reads again. */
        const it = {
            fake,
            /** Answer every write with this, until a test says otherwise. */
            refuse: null,
            /** A promise every write waits on, so one can be caught mid-air. */
            hold: null,
            where: {document, location: {href: 'https://site.test/blog/hello/'}}
        };
        it.options = {
            fetch: async (input, init) => {
                const at = typeof input === 'string'
                    ? input : String(input.url ?? input);
                if (at === DEFAULT_CONFIG_URL) {
                    return new Response(JSON.stringify(config));
                }
                const writing = init && init.method && init.method !== 'GET';
                if (writing && it.hold) {
                    await it.hold;
                }
                if (writing && it.refuse) {
                    return it.refuse();
                }
                return fake.fetch(input, init);
            }
        };
        return it;
    }

    /** Open one, press the switch, and remember it for `afterEach`. */
    async function mount(it) {
        const surface = await open(it.where, it.options);
        opened.push(surface);
        /* Every test in this block is about what a submit does, and a
           submit only has something to write once somebody has turned
           the editor on. What happens BEFORE the switch is pressed is
           `open, the switch` above, which is where that is asserted. */
        pressEdit(surface.session);
        return surface;
    }

    const inBar = (bar, selector) => bar.node.shadowRoot.querySelector(selector);
    const note = bar => inBar(bar, '.ct-edit__note').textContent;

    /**
     * Rewrite one block, as typing into it would.
     *
     * Through the ContentEdit element rather than by assigning
     * `textContent`: the editor keeps its own tree, and a DOM poke
     * behind its back leaves `lastModified()` untouched -- so `save()`
     * reports nothing changed and every assertion afterwards is about
     * an edit that never happened.
     */
    function retype(session, text, index = 1) {
        const block = session.editor.editorApp.regions().body.children[index];
        block.content = new HTMLString.String(text);
        block.updateInnerHTML();
        block.taint();
    }

    /** Press Submit and wait for the bar to say what happened. */
    async function submit(bar) {
        inBar(bar, '.ct-edit__submit').click();
        await until(() => note(bar) !== '', 'the bar to report the submit');
    }

    it('commits to a branch and opens a pull request', async function() {
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');

        await submit(bar);

        expect(note(bar)).toMatch(/^Submitted as [0-9a-f]{7}\.$/);
        expect(it.fake.read(ENTRY, BRANCH)).toContain('Goodbye.');
        /* And nothing on the base branch, which is the premise of the
           whole tool: a published page edits itself into a pull
           request, not into the site. */
        expect(it.fake.read(ENTRY, 'main')).toBe(SOURCE);
    });

    /** Whether closing the tab now would ask first. */
    function asksToLeave() {
        /* A plain Event, because a BeforeUnloadEvent cannot be built by
           hand -- and a plain Event's own `returnValue` is a boolean that
           ignores the string the library writes. So the property is
           shadowed with one that remembers what it was given. */
        const ev = new Event('beforeunload', {cancelable: true});
        let said = '';
        Object.defineProperty(ev, 'returnValue', {
            get: () => said,
            set: value => { said = value; }
        });
        window.dispatchEvent(ev);
        return ev.defaultPrevented || said !== '';
    }

    it('stops asking before the tab closes once the edit is submitted',
       async function() {
        /* The editor's own guard reads its undo history, which a submit
           does not touch -- so it went on asking over work that was
           safely committed, and an author told "you have unsaved
           changes" about a submitted edit learns to click through the
           one that is true. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        /* Waited for, because the history snapshots on a timer after the
           typing stops -- and a history with nothing in it is the one
           state in which the old guard happened to give the right
           answer. */
        await until(() => session.editor.editorApp.history.index() > 0,
                    'the undo history to record the edit');
        expect(asksToLeave()).toBe(true);

        await submit(bar);

        expect(note(bar)).toMatch(/^Submitted as/);
        expect(asksToLeave()).toBe(false);

        // And it starts again with the next edit.
        retype(session, 'Farewell.');
        expect(asksToLeave()).toBe(true);
    });

    it('asks before the tab closes over edits the tick kept', async function() {
        /* The tick keeps the edit and turns the tools off. The work is
           still unsubmitted, so the tab must still ask -- the editor's
           own guard only asks while it is editing. */
        const it = sitePage();
        const {session} = await mount(it);
        retype(session, 'Goodbye.');
        pressEdit(session, 'confirm');

        expect(asksToLeave()).toBe(true);
    });

    it('links the pull request it opened', async function() {
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');

        await submit(bar);

        const pull = inBar(bar, '.ct-edit__pull');
        expect(pull.textContent).toMatch(/^Pull request #\d+$/);
        expect(pull.getAttribute('href')).toContain('/pull/');
    });

    it('adds to the same pull request on a second submit', async function() {
        /* One branch and one pull request per entry. A second one for
           the same file is two reviews of one change. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        await submit(bar);
        const first = inBar(bar, '.ct-edit__pull').textContent;

        retype(session, 'Farewell.');
        await submit(bar);

        expect(inBar(bar, '.ct-edit__pull').textContent).toBe(first);
        expect(it.fake.read(ENTRY, BRANCH)).toContain('Farewell.');
        expect(it.fake.pulls()).toHaveLength(1);
    });

    it('leaves the diff to the one block that was edited', async function() {
        /* The assertion the whole milestone is for. A pull request whose
           diff is the whole file is unreviewable, which defeats the
           point of submitting one. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');

        await submit(bar);

        expect(it.fake.read(ENTRY, BRANCH)).toBe(
            SOURCE.replace('Second paragraph.', 'Goodbye.'));
    });

    it('says so, without alarm, when nothing was changed', async function() {
        /* Pressing Submit on an entry you opened and did not change is
           an ordinary thing to do. Answering it in the colour of a
           refusal is how people learn to read past the colour. */
        const it = sitePage();
        const {bar} = await mount(it);

        await submit(bar);

        expect(note(bar)).toContain('Nothing to save.');
        expect(inBar(bar, '.ct-edit__note').classList
            .contains('ct-edit__note--refused')).toBe(false);
        expect(it.fake.pulls()).toHaveLength(0);
    });

    it('keeps the unwritten markdown when somebody else got there first',
       async function() {
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        await submit(bar);

        // A reviewer pushes to the entry's branch while the page is open.
        it.fake.pushOther(BRANCH, {[ENTRY]: SOURCE.replace('First', 'Theirs')});
        retype(session, 'Mine.');
        await submit(bar);

        expect(note(bar)).toContain('Somebody else changed this entry');
        const conflict = inBar(bar, '.ct-edit__conflict');
        expect(conflict.value).toContain('Mine.');
        /* And nothing of theirs was lost. The only way forward throws
           our work away, so the box above is the copy of it. */
        expect(it.fake.read(ENTRY, BRANCH)).toContain('Theirs');
    });

    it('refuses a submit that would write a file the site cannot render',
       async function() {
        /* `validate()` is also what puts each message under its own
           control, so a refusal computed AFTER the save would mark the
           fields and commit anyway -- and the person who found out
           would be a reader. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        inBar(bar, '.ct-field__input').value = '';

        await submit(bar);

        expect(note(bar)).toContain('One field needs filling in.');
        expect(it.fake.pulls()).toHaveLength(0);
        // And the field says which, under itself.
        expect(inBar(bar, '.ct-field__error').textContent).not.toBe('');
    });

    it('writes what the form holds into the frontmatter', async function() {
        const it = sitePage();
        const {bar} = await mount(it);
        inBar(bar, '.ct-field__input').value = 'Hello again';

        await submit(bar);

        const written = it.fake.read(ENTRY, BRANCH);
        expect(written).toContain('title: Hello again');
        /* The key the config never declared is still there. A `layout:`
           that vanishes because somebody saved a post is a page that
           stops rendering, days later. */
        expect(written).toContain('layout: post');
    });

    it('leaves the frontmatter byte for byte when only the body changed',
       async function() {
        /* The rule the whole surface rests on: `update` is given no
           options object at all unless a value actually changed, and
           that is the only thing preserving the comment and the key
           order above. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');

        await submit(bar);

        expect(it.fake.read(ENTRY, BRANCH))
            .toContain('---\n# the post\ntitle: Hello\nlayout: post\n---');
    });

    it('puts a failure in the bar rather than the console', async function() {
        /* The rule both other dist suites already assert: errors land
           on the page. A surface that swallows one shows an editor
           that silently never saves. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        it.refuse = () => new Response('{"message":"nope"}', {status: 500});

        await submit(bar);

        expect(note(bar)).toContain('GitHub returned 500');
        expect(inBar(bar, '.ct-edit__note').classList
            .contains('ct-edit__note--refused')).toBe(true);
    });

    it('lets go of the button whatever the submit did', async function() {
        /* Leaving it disabled after a failure locks out the one person
           who most needs to try again. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        it.refuse = () => Promise.reject(new TypeError('offline'));

        await submit(bar);

        expect(inBar(bar, '.ct-edit__submit').disabled).toBe(false);
    });

    it('opens and closes the frontmatter form from the bar', async function() {
        const it = sitePage();
        const {bar} = await mount(it);
        const fields = inBar(bar, '.ct-fields');
        expect(getComputedStyle(fields).display).toBe('none');

        inBar(bar, '.ct-edit__details').click();
        expect(getComputedStyle(fields).display).not.toBe('none');
        expect(inBar(bar, '.ct-field__input').value).toBe('Hello');

        inBar(bar, '.ct-edit__details').click();
        expect(getComputedStyle(fields).display).toBe('none');
    });

    it('keeps what was typed into the form across a submit', async function() {
        /* The form IS the answers -- there is no copy of them anywhere
           else -- so a rebuild between a keystroke and the next submit
           is a field the author filled in and the file never got. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        inBar(bar, '.ct-edit__details').click();
        const input = inBar(bar, '.ct-field__input');
        input.value = 'Hello again';

        retype(session, 'Goodbye.');
        await submit(bar);

        expect(inBar(bar, '.ct-field__input')).toBe(input);
        expect(input.value).toBe('Hello again');
        // And the form is still open, because nobody closed it.
        expect(getComputedStyle(inBar(bar, '.ct-fields')).display).not.toBe('none');
    });

    it('says so on the button, and clears the last answer, while it writes',
       async function() {
        /* The one state every other test here waits past. Three things
           have to be true at once: the button refuses a second press --
           a second commit on the same parent IS the conflict -- and
           neither the last refusal nor the markdown it kept is still on
           screen, because both are answers to a question that is being
           asked again. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        await submit(bar);
        /* A conflict rather than any other refusal, because it is the
           one that leaves something on screen as well as saying
           something: the markdown it kept. */
        it.fake.pushOther(BRANCH, {[ENTRY]: SOURCE.replace('First', 'Theirs')});
        retype(session, 'Mine.');
        await submit(bar);
        expect(inBar(bar, '.ct-edit__conflict').value).toContain('Mine.');

        let release;
        it.hold = new Promise(resolve => { release = resolve; });
        inBar(bar, '.ct-edit__submit').click();
        await until(() => inBar(bar, '.ct-edit__submit').disabled,
                    'the button to refuse a second press');

        expect(inBar(bar, '.ct-edit__submit').textContent).toBe('Submitting\u2026');
        expect(note(bar)).toBe('');
        expect(inBar(bar, '.ct-edit__note').classList
            .contains('ct-edit__note--refused')).toBe(false);

        expect(inBar(bar, '.ct-edit__conflict').value).toBe('');

        release();
        await until(() => note(bar) !== '', 'the submit to report');
        expect(inBar(bar, '.ct-edit__submit').disabled).toBe(false);
    });

    it('says nothing to save for an entry already under review', async function() {
        /* The OTHER door to the same answer, and the reason the words
           are a shared constant. With no pull request open `saveEntry`
           throws `NothingToSaveError`; with one open it returns
           `changed: false` instead -- branch bookkeeping that means
           nothing to the person who pressed the button twice. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        await submit(bar);
        expect(it.fake.pulls()).toHaveLength(1);
        const before = it.fake.history(BRANCH).length;

        await submit(bar);

        expect(note(bar)).toContain('Nothing to save.');
        expect(inBar(bar, '.ct-edit__note').classList
            .contains('ct-edit__note--refused')).toBe(false);
        expect(it.fake.history(BRANCH)).toHaveLength(before);
    });

    it('keeps the markdown only for the failure that loses it', async function() {
        /* A conflict is the one where the work is still in hand and the
           only way forward throws it away. Showing the same box after a
           500 -- where nothing was lost and pressing Submit again is
           the answer -- teaches an author that the box means nothing. */
        const it = sitePage();
        const {bar, session} = await mount(it);
        retype(session, 'Goodbye.');
        it.refuse = () => new Response('{"message":"nope"}', {status: 500});

        await submit(bar);

        const conflict = inBar(bar, '.ct-edit__conflict');
        expect(conflict.value).toBe('');
        expect(getComputedStyle(conflict).display).toBe('none');
    });
});
