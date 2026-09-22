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
async function until(check, describe, attempts = 200) {
    for (let i = 0; i < attempts; i += 1) {
        if (check()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
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
             page: '/blog/{{slug}}/', body: 'article.post'}
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

    it('replaces the template\'s HTML with our render of the branch',
       async function() {
        /* The two are different documents even when they look the same:
           the template's is built from the base branch by a static site
           generator, ours carries the `data-ct-md` indices the splice
           reads back. Editing the template's markup would serialize to
           bytes that splice against the wrong blocks. */
        const it = sitePage();
        await mount(it);

        const body = it.body();
        expect(body.textContent).not.toContain('What the site built');
        expect(body.textContent).toContain('First paragraph.');
        expect(body.querySelector('[data-ct-md]')).not.toBe(null);
    });

    it('starts the editor over that element', async function() {
        const it = sitePage();
        const {session} = await mount(it);

        expect(session).not.toBe(null);
        const app = ContentTools.EditorApp.current();
        expect(app).not.toBe(null);
        expect(app.isMounted()).toBe(true);
        /* Named rather than matched: `data-name` is the one attribute we
           write on an element we did not make, and `data-editable` is
           deliberately NOT beside it -- there is no query to satisfy. */
        expect(Object.keys(app.regions())).toEqual(['body']);
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

    it('names the element it is editing', async function() {
        const it = sitePage();
        const {bar} = await mount(it);

        expect(said(bar).className).toContain('ct-edit--editing');
        expect(said(bar).title).toBe('blog/hello');
        expect(said(bar).hint)
            .toBe('Editing article#post-1.post, matched by article.post.');
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
});
