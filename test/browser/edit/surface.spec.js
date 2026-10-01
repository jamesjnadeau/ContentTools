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
/* The class module, as the surface itself reaches it: the element's
   `index.js` is a build entry and registers the tag on import, which
   would hide a surface that forgot to. */
import {TAG_NAME as EDITOR_TAG}
    from '../../../src/element/content-tools-editor.js';
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

const inBar = (bar, selector) => bar.node.shadowRoot.querySelector(selector);
const note = bar => inBar(bar, '.ct-edit__note').textContent;

/** The three things the bar says in every state. */
const said = bar => ({
    className: inBar(bar, '.ct-edit').className,
    title: inBar(bar, '.ct-edit__title').textContent,
    hint: inBar(bar, '.ct-edit__hint').textContent
});

/**
 * Rewrite one block, as typing into it would.
 *
 * Through the ContentEdit element rather than by assigning
 * `textContent`: the editor keeps its own tree, and a DOM poke
 * behind its back leaves `lastModified()` untouched -- so `save()`
 * reports nothing changed and every assertion afterwards is about
 * an edit that never happened.
 *
 * The SECOND block unless told otherwise, which is the one the seeded
 * entry's tests rewrite so the first is there to be found unchanged.
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

    describe('pages that start an entry', function() {

        /* `/blog/` offers the link and `/blog/new/` is where it leads.
           Neither is an entry, and the second one LOOKS like one to the
           `page` template -- `new` is a perfectly good slug -- which is
           the confusion most of what follows is about. */
        const STARTER_CONFIG = {
            ...CONFIG,
            collections: [
                {...CONFIG.collections[0], label: 'Blog', create: true,
                 starter: '/blog/', newPage: '/blog/new/'},
                CONFIG.collections[1]
            ]
        };

        it('says a starter page starts something', async function() {
            const state = await resolveOn(page(
                '<article></article>', STARTER_CONFIG, 'https://site.test/blog/'));

            expect(state).toEqual({
                kind: 'starter', links: [{label: 'Blog', href: '/blog/new/?cms-edit'}]
            });
        });

        it('says the new page is new, not an entry called new', async function() {
            const state = await resolveOn(page(
                '<article></article>', STARTER_CONFIG, 'https://site.test/blog/new/'));

            expect([state.kind, state.collection.name, state.selector])
                .toEqual(['new-page', 'blog', 'article']);
            expect(state.body.tagName).toBe('ARTICLE');
        });

        it('blocks a new page with nothing to write in, and names the selector',
           async function() {
            /* The same finding as `no-body`, at the same moment: the
               editor replaces that element's children, so a template
               without it is found out here rather than by an author. */
            const state = await resolveOn(page(
                '<div></div>', STARTER_CONFIG, 'https://site.test/blog/new/'));

            expect(state.kind).toBe('new-blocked');
            expect(state.hint).toBe('Nothing on this page matches `article`.');
        });

        it('edits a page that declares an entry, even at a starter\'s address',
           async function() {
            /* A page that says what it is has been asked nothing about
               its URL. A site whose index page is itself an entry keeps
               editing it. */
            const state = await resolveOn(page(
                '<meta name="cms:entry" content="blog/hello"><article></article>',
                STARTER_CONFIG, 'https://site.test/blog/'));

            expect(state.kind).toBe('ready');
            expect(state.entry).toEqual({collection: 'blog', slug: 'hello'});
        });

        it('reads a starter and a new page as ordinary pages when the config '
           + 'no longer holds the collection', async function() {
            // What a role-filtered config looks like: the collection is simply gone.
            const without = {
                ...STARTER_CONFIG,
                collections: STARTER_CONFIG.collections.filter(c => c.name !== 'blog')
            };

            for (const url of ['https://site.test/blog/', 'https://site.test/blog/new/']) {
                const state = await resolveOn(page('<article></article>', without, url));
                expect(state.kind).toBe('not-an-entry');
            }
        });

        it('takes the markup\'s word for both', async function() {
            /* On addresses the config names for neither, so the only
               thing that can have answered is the tag. */
            const starter = await resolveOn(page(
                '<meta name="cms:starter" content="blog"><article></article>',
                STARTER_CONFIG, 'https://site.test/'));

            expect(starter).toEqual({
                kind: 'starter', links: [{label: 'Blog', href: '/blog/new/?cms-edit'}]
            });

            const fresh = await resolveOn(page(
                '<meta name="cms:new-page" content="blog"><article></article>',
                STARTER_CONFIG, 'https://site.test/write/'));

            expect([fresh.kind, fresh.collection.name, fresh.selector])
                .toEqual(['new-page', 'blog', 'article']);
            expect(fresh.body.tagName).toBe('ARTICLE');
        });

        it('takes the markup\'s word over an address that reads as an entry\'s',
           async function() {
            /* A site that puts its new page, or a second index, under the
               collection's own prefix without naming it in the config.
               `/blog/{{slug}}/` fits both addresses, and without the tag
               each would be an entry that could not be read -- so the tag
               has to be asked before the template is. */
            const fresh = await resolveOn(page(
                '<meta name="cms:new-page" content="blog"><article></article>',
                STARTER_CONFIG, 'https://site.test/blog/write/'));

            expect([fresh.kind, fresh.collection.name])
                .toEqual(['new-page', 'blog']);

            const starter = await resolveOn(page(
                '<meta name="cms:starter" content="blog"><article></article>',
                STARTER_CONFIG, 'https://site.test/blog/archive/'));

            expect(starter).toEqual({
                kind: 'starter', links: [{label: 'Blog', href: '/blog/new/?cms-edit'}]
            });
        });
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

    it('shows the starter link on a starter page and mounts nothing',
       async function() {
        /* A real link to the new page and nothing else: no editor, and
           not one request to GitHub, because nothing on a starter page
           is read or written. Whether anybody is signed in is the new
           page's question. */
        const it = page('<article>x</article>', {
            ...CONFIG,
            collections: [{...CONFIG.collections[0], label: 'Blog', create: true,
                           starter: '/blog/', newPage: '/blog/new/'}]
        }, 'https://site.test/blog/');
        const surface = await open(it.where, it.options);

        expect(said(surface.bar).className).toBe('ct-edit ct-edit--starter');
        const links = surface.bar.node.shadowRoot.querySelectorAll('.ct-edit__new');
        expect(links.length).toBe(1);
        /* The flag rides in the href: a copied link or a middle click
           reaches the new page with no token, and without the flag that
           page would load nothing at all. */
        expect(links[0].getAttribute('href')).toBe('/blog/new/?cms-edit');
        expect(links[0].textContent).toBe('New Blog entry');
        expect(surface.session).toBeNull();
        expect(surface.editing).toBeNull();
        expect(it.asked).toEqual([DEFAULT_CONFIG_URL]);
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
            retype(session, 'Rewritten.', 0);

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
            retype(session, 'Rewritten.', 0);

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
            retype(session, 'Rewritten.', 0);

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
            retype(session, 'Rewritten.', 0);
            pressEdit(session, 'confirm');

            pressEdit(session);

            expect(it.body().textContent).toContain('Rewritten.');
            retype(session, 'Rewritten twice.', 0);
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
            retype(session, 'Kept.', 0);
            pressEdit(session, 'confirm');

            pressEdit(session);
            retype(session, 'Discarded.', 0);
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
            retype(session, 'Kept.', 0);
            pressEdit(session, 'confirm');

            pressEdit(session);
            retype(session, 'Discarded.', 0);
            expect(session.pending().content).toContain('Discarded.');
            await confirming(true, () => pressEdit(session, 'cancel'));

            expect(session.pending().content).toContain('Kept.');
            expect(session.pending().content).not.toContain('Discarded.');
        });

        it('renders the branch afresh after a cancel', async function() {
            const it = sitePage();
            const {session} = await mount(it);
            pressEdit(session);
            retype(session, 'Rewritten.', 0);
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

describe('open, on the new page', function() {

    /* The mounting site again, with its blog able to start an entry: a
       page that offers the link and a page the link leads to. The
       `title` field is what makes a name worth carrying into the file
       -- it is required, and the author has just typed it. */
    const NEW_CONFIG = {
        ...CONFIG,
        collections: [
            {name: 'blog', label: 'Blog', folder: 'content/blog',
             page: '/blog/{{slug}}/', body: 'article.post',
             create: true, starter: '/blog/', newPage: '/blog/new/',
             fields: [{name: 'title', label: 'Title', widget: 'string',
                       required: true}]}
        ]
    };

    /* What the site's template renders for a page with no entry behind
       it: the element the config names, holding whatever the site wants
       a reader who wandered in to see. */
    const BLANK = '<main class="layout">'
        + '<article class="post"><p id="placeholder">Nothing here yet.</p></article>'
        + '</main>';

    const SOURCE = '---\ntitle: Hello\n---\n\nFirst paragraph.\n';
    const POST = 'content/blog/my-first-post.md';
    const BRANCH = 'cms/blog/my-first-post';

    /**
     * The site's new page, in the REAL document. See `sitePage` above.
     *
     * `refuse` and `hold` reach EVERY request to GitHub here, reads
     * included, where the submitting describe's reach only writes: what
     * is under test on this page is the read that settles whether a
     * name is free.
     */
    function blankPage(options = {}) {
        const {
            markup = BLANK,
            config = NEW_CONFIG,
            files = {},
            token = 'github_pat_test',
            url = 'https://site.test/blog/new/'
        } = options;

        const host = document.createElement('div');
        host.innerHTML = markup;
        document.body.appendChild(host);
        planted.push(host);

        const fake = createFakeGitHub({files});
        if (token !== null) {
            sessionStorage.setItem(TOKEN_KEY, token);
        }

        const it = {
            fake,
            /** Every URL but the config's that the surface fetched, in order. */
            asked: [],
            /** Answer every request with this, until a test says otherwise. */
            refuse: null,
            /** A promise every request waits on, so one can be caught mid-air. */
            hold: null,
            where: {document, location: {href: url}}
        };
        it.options = {
            fetch: async (input, init) => {
                const at = typeof input === 'string'
                    ? input : String(input.url ?? input);
                if (at === DEFAULT_CONFIG_URL) {
                    return new Response(JSON.stringify(config));
                }
                it.asked.push(at);
                if (it.hold) {
                    await it.hold;
                }
                if (it.refuse) {
                    return it.refuse();
                }
                return fake.fetch(input, init);
            }
        };
        return it;
    }

    /**
     * Open one, and remember it so `afterEach` can close it.
     *
     * The `Surface` itself and not a copy of its fields: `session` is
     * null when this returns and is the mounted one after a name is
     * given, so a test that destructured it here would be holding the
     * answer from before the thing it is about.
     */
    async function openOn(it) {
        const surface = await open(it.where, it.options);
        opened.push(surface);
        return surface;
    }

    /** Type a name, as a person does: the preview and the button follow. */
    function name(bar, text) {
        const field = inBar(bar, '.ct-edit__name');
        field.value = text;
        field.dispatchEvent(new Event('input'));
    }

    const begin = bar => inBar(bar, '.ct-edit__begin').click();
    const refusal = bar => inBar(bar, '.ct-edit__refusal').textContent;
    const region = () => document.querySelector('article.post');
    const lastMessage = (it, branch) => it.fake.history(branch)[0].message;

    /** Name it, press Start writing, and wait for the editor. */
    async function write(surface, title = 'My first post') {
        name(surface.bar, title);
        begin(surface.bar);
        await until(() => surface.session?.started(), 'the editor to start');
    }

    it('asks for a name, and puts no editor up yet', async function() {
        const it = blankPage();
        const surface = await openOn(it);

        expect(said(surface.bar)).toEqual({
            className: 'ct-edit ct-edit--naming',
            title: 'New Blog entry',
            hint: 'Name it, then write it on this page.'
        });
        expect(inBar(surface.bar, '.ct-edit__naming').hidden).toBe(false);
        expect(surface.session).toBeNull();
        expect(surface.editing).toBeNull();
        expect(document.querySelector(EDITOR_TAG)).toBeNull();
        /* And nothing was asked of the repository: until there is a
           name there is no path, and no path is nothing to read. */
        expect(it.asked).toEqual([]);
    });

    it('says to sign in, signed out, and offers no name field', async function() {
        /* A name typed by somebody who cannot save it is work thrown
           away at Submit. And there is no sign-in here to offer, for
           the reason there is none on an entry's page. */
        const surface = await openOn(blankPage({token: null}));

        expect(said(surface.bar)).toEqual({
            className: 'ct-edit ct-edit--new-blocked',
            title: 'New Blog entry',
            hint: 'Sign in through the admin screens in this tab, '
                + 'then come back to write it.'
        });
        expect(inBar(surface.bar, '.ct-edit__naming').hidden).toBe(true);
        expect(surface.session).toBeNull();
        expect(document.querySelector(EDITOR_TAG)).toBeNull();
    });

    it('starts the editor over the blank body once it is named', async function() {
        const surface = await openOn(blankPage());
        name(surface.bar, 'My first post');
        begin(surface.bar);
        await until(() => surface.session?.started(), 'the editor to start');

        expect(said(surface.bar).className).toBe('ct-edit ct-edit--editing');
        expect(said(surface.bar).title).toBe('blog/my-first-post');
        /* Started, with no pencil to press first: "Start writing" was
           the consent the pencil asks for on a page that has a reader's
           version to protect, and this one has none. */
        expect(surface.session.editor.state).toBe('editing');
        expect(surface.editing.session).toBe(surface.session);
        expect(document.querySelectorAll(EDITOR_TAG).length).toBe(1);
        expect(document.querySelector('#placeholder')).toBeNull();
        expect(region().querySelectorAll('p').length).toBe(1);   // a paragraph to type in
        /* The form opens itself here and nowhere else: the page under
           the bar is blank, and the fields it asks for are empty. */
        expect(inBar(surface.bar, '.ct-edit__details').hidden).toBe(false);
        expect(getComputedStyle(inBar(surface.bar, '.ct-fields')).display)
            .not.toBe('none');
        expect(inBar(surface.bar, '.ct-edit__naming').hidden).toBe(true);
    });

    it('shows the tick and the cross, not the pencil, once writing has started',
       async function() {
        /* The editor's own `start()` starts the editor and leaves its
           switch where it was -- only a press moves the switch. Started
           that way the author is editing under a pencil, with no tick to
           read the page by and no cross to back out with, and the cross
           does nothing if they find it: its handler asks the SWITCH
           whether anything is being edited. */
        const surface = await openOn(blankPage());
        await write(surface);

        const ignition = surface.session.editor.shadowRoot
            .querySelector('.ct-ignition');
        expect(ignition.className).toContain('ct-ignition--editing');
        expect(ignition.className).not.toContain('ct-ignition--ready');
    });

    it('seeds the title field with the name', async function() {
        /* Typed once. The form's `title` is required, and asking for it
           again a second after it was given is how a tool tells an
           author it was not listening. */
        const surface = await openOn(blankPage());
        await write(surface);

        expect(surface.bar.values().title).toBe('My first post');
    });

    it('creates the file on its own branch and opens a pull request',
       async function() {
        const it = blankPage();
        const surface = await openOn(it);
        await write(surface);
        retype(surface.session, 'First words.', 0);

        await submit(surface.bar);

        expect(note(surface.bar)).toMatch(/^Submitted as [0-9a-f]{7}\.$/);
        const saved = it.fake.read(POST, BRANCH);
        expect(saved).toContain('title: My first post');
        expect(saved).toContain('First words.');
        /* Not on the site until somebody merges it, which is the
           premise of the whole tool. */
        expect(it.fake.read(POST, 'main')).toBeNull();
        expect(it.fake.pulls().length).toBe(1);
        expect(lastMessage(it, BRANCH)).toBe(`Create ${POST}`);
    });

    it('updates the same pull request on a second Submit', async function() {
        /* Nothing remembers that the first one was a create: the session
           re-pins the entry it just wrote, and an entry with content is
           an update. A second create would be refused as a duplicate of
           the author's own post. */
        const it = blankPage();
        const surface = await openOn(it);
        await write(surface);
        retype(surface.session, 'First words.', 0);
        await submit(surface.bar);

        retype(surface.session, 'Second words.', 0);
        await submit(surface.bar);

        expect(note(surface.bar)).toMatch(/^Submitted as [0-9a-f]{7}\.$/);
        expect(it.fake.pulls().length).toBe(1);
        expect(lastMessage(it, BRANCH)).toBe(`Update ${POST}`);
        expect(it.fake.read(POST, BRANCH)).toContain('Second words.');
        expect(it.fake.read(POST, 'main')).toBeNull();
    });

    it('refuses a name that is already published, and keeps the field',
       async function() {
        const it = blankPage({files: {'content/blog/hello.md': SOURCE}});
        const surface = await openOn(it);
        const {bar} = surface;
        name(bar, 'Hello');
        begin(bar);

        await until(() => refusal(bar) !== '', 'a refusal');
        expect(refusal(bar))
            .toBe('content/blog/hello.md is already published. Choose another name.');
        expect(inBar(bar, '.ct-edit__refusal').hidden).toBe(false);
        expect(surface.session).toBeNull();
        expect(document.querySelector(EDITOR_TAG)).toBeNull();
        /* The name is still there to be changed by a word, the button
           is live again, and the page is as the site built it. */
        expect(inBar(bar, '.ct-edit__name').value).toBe('Hello');
        expect(inBar(bar, '.ct-edit__name').disabled).toBe(false);
        expect(inBar(bar, '.ct-edit__begin').disabled).toBe(false);
        expect(document.querySelector('#placeholder')).not.toBeNull();
    });

    it('refuses a name that is already in review', async function() {
        const it = blankPage();
        const surface = await openOn(it);
        const {bar} = surface;
        const {number} = it.fake.openPull('blog', 'draft-post');
        name(bar, 'Draft post');
        begin(bar);

        await until(() => refusal(bar) !== '', 'a refusal');
        expect(refusal(bar)).toBe('content/blog/draft-post.md is already waiting '
            + `in pull request #${number}. Choose another name.`);
        expect(surface.session).toBeNull();
        expect(inBar(bar, '.ct-edit__begin').disabled).toBe(false);
    });

    it('says in review, not published, for an entry whose file is on its '
       + 'pull request\'s branch', async function() {
        /* What "in review" actually looks like: somebody named this an
           hour ago and submitted it, so the file EXISTS -- on the pull
           request's branch, which is where an open entry is read from.
           Telling the second author it is published would send them to
           the site to look for a page that is not there. */
        const it = blankPage();
        const surface = await openOn(it);
        const {bar} = surface;
        const {number} = it.fake.openPull('blog', 'draft-post');
        it.fake.pushOther('cms/blog/draft-post',
                          {'content/blog/draft-post.md': SOURCE});
        name(bar, 'Draft post');
        begin(bar);

        await until(() => refusal(bar) !== '', 'a refusal');
        expect(refusal(bar)).toBe('content/blog/draft-post.md is already waiting '
            + `in pull request #${number}. Choose another name.`);
        expect(surface.session).toBeNull();
    });

    it('refuses the name that would be published at this page\'s own address, '
       + 'without reading anything', async function() {
        /* `/blog/new/` is where an entry called "New" would be
           published, and it is this page: once merged, the address
           would answer with the entry and the site would have nowhere
           left to start one. Known from the config alone, so it is said
           before the repository is asked anything. */
        const it = blankPage();
        const surface = await openOn(it);
        const {bar} = surface;
        const before = it.asked.length;
        name(bar, 'New');
        begin(bar);

        expect(refusal(bar))
            .toBe("That name would be published at this page's own address. Choose another.");
        expect(it.asked.length).toBe(before);
        expect(surface.session).toBeNull();
        expect(inBar(bar, '.ct-edit__begin').disabled).toBe(false);
    });

    it('refuses the new page\'s own address however the config spells the two',
       async function() {
        /* `page` without a trailing slash and `newPage` with one name
           the same page, and the mapping treats them as one. Compared as
           strings they differ, and the entry called "New" would be
           published where the author is standing. */
        const it = blankPage({
            config: {...NEW_CONFIG, collections: [
                {...NEW_CONFIG.collections[0], page: '/blog/{{slug}}'}
            ]}
        });
        const surface = await openOn(it);
        const {bar} = surface;
        const before = it.asked.length;
        name(bar, 'New');
        begin(bar);

        expect(refusal(bar))
            .toBe("That name would be published at this page's own address. Choose another.");
        expect(it.asked.length).toBe(before);
        expect(surface.session).toBeNull();
    });

    it('takes any name on a new page that has no address in the config',
       async function() {
        /* A site whose URLs the config cannot describe: no `page`, no
           `newPage`, and the template says both things itself. Neither
           address exists, and two addresses that do not exist are not
           the same address -- compared bare, every name on this page
           would be refused as the page's own. */
        const it = blankPage({
            config: {...NEW_CONFIG, collections: [
                {name: 'blog', label: 'Blog', folder: 'content/blog',
                 create: true, fields: NEW_CONFIG.collections[0].fields}
            ]},
            markup: '<meta name="cms:new-page" content="blog">'
                + '<article class="post" data-cms-body>'
                + '<p id="placeholder">Nothing here yet.</p></article>',
            url: 'https://site.test/write/'
        });
        const surface = await openOn(it);
        expect(said(surface.bar).className).toBe('ct-edit ct-edit--naming');

        await write(surface);

        expect(said(surface.bar).title).toBe('blog/my-first-post');
        expect(region().querySelector('#placeholder')).toBeNull();
    });

    it('says why when the read fails, and lets the author try again',
       async function() {
        const it = blankPage();
        const surface = await openOn(it);
        const {bar} = surface;
        it.refuse = () => new Response('{"message":"nope"}', {status: 500});
        name(bar, 'My first post');
        begin(bar);

        await until(() => refusal(bar) !== '', 'a refusal');
        expect(refusal(bar)).toContain('500');
        expect(said(bar).className).toBe('ct-edit ct-edit--naming');
        expect(inBar(bar, '.ct-edit__begin').disabled).toBe(false);
        expect(surface.session).toBeNull();
        expect(document.querySelector(EDITOR_TAG)).toBeNull();

        /* Nothing about the failure is kept: the same name, pressed
           again once the repository answers, is an ordinary start. */
        it.refuse = null;
        begin(bar);
        /* Gone at once rather than when the read lands, so a failure
           that has stopped being true is not read as this one's. */
        expect(refusal(bar)).toBe('');
        await until(() => surface.session?.started(), 'the editor to start');

        expect(said(bar).title).toBe('blog/my-first-post');
        expect(document.querySelectorAll(EDITOR_TAG).length).toBe(1);
    });

    it('says why under the name when the editor cannot be set up',
       async function() {
        /* A failure after the name was found free is still a failure of
           this page, and the name field is where this page says things.
           The site's own body is untouched: nothing was moved before the
           thing that failed. */
        const it = blankPage();
        const surface = await open(it.where, {
            ...it.options, extension: {allowTools: ['test-nowhere']}
        });
        opened.push(surface);
        name(surface.bar, 'My first post');
        begin(surface.bar);
        await until(() => refusal(surface.bar) !== '', 'a refusal');

        expect(refusal(surface.bar)).toContain('`test-nowhere`');
        expect(said(surface.bar).className).toBe('ct-edit ct-edit--naming');
        expect(surface.session).toBeNull();
        expect(document.querySelector(EDITOR_TAG)).toBeNull();
        expect(document.querySelector('#placeholder')).not.toBeNull();
        expect(inBar(surface.bar, '.ct-edit__begin').disabled).toBe(false);
    });

    it('takes the editor back off the page when it will not start',
       async function() {
        /* One editor per document holds the lease, and a second one is
           connected inert: it mounts and then refuses to start. Mounted
           and not started is an editor nobody can press and a bar that
           says nothing, so it comes back off and the reason goes under
           the name -- and the entry that IS being written is not
           disturbed by the one that could not be. */
        const it = blankPage();
        const first = await openOn(it);
        await write(first, 'One');
        const second = await openOn(it);
        name(second.bar, 'Two');
        begin(second.bar);
        await until(() => refusal(second.bar) !== '', 'a refusal');

        expect(refusal(second.bar)).toContain('another instance already holds the editor');
        expect(said(second.bar).className).toBe('ct-edit ct-edit--naming');
        expect(second.session).toBeNull();
        expect(second.editing).toBeNull();
        expect(document.querySelectorAll(EDITOR_TAG).length).toBe(1);
        expect(inBar(second.bar, '.ct-edit__begin').disabled).toBe(false);
        expect(first.session.started()).toBe(true);
        expect(said(first.bar).title).toBe('blog/one');
    });

    it('mounts once however many times Start writing is pressed', async function() {
        const it = blankPage();
        const surface = await openOn(it);
        const {bar} = surface;
        let release;
        it.hold = new Promise(resolve => { release = resolve; });
        name(bar, 'My first post');
        begin(bar);

        /* The bar disables the button while the read is in the air, so
           a second press cannot arrive through it. Enabled by hand
           here, because that is what a `disabled` line lost in a
           refactor looks like -- and what would follow is two editors
           over one element, the second holding nothing. */
        inBar(bar, '.ct-edit__begin').disabled = false;
        begin(bar);

        it.hold = null;
        release();
        await until(() => surface.session?.started(), 'the editor to start');

        const reads = () => it.asked.filter(at => at.includes('my-first-post.md'));
        expect(reads().length).toBe(1);
        expect(document.querySelectorAll(EDITOR_TAG).length).toBe(1);

        /* And once it is up, where the form is hidden rather than gone
           and `hidden` does not stop a click reaching a button. */
        const mounted = surface.session;
        inBar(bar, '.ct-edit__begin').disabled = false;
        begin(bar);

        expect(said(bar).className).toBe('ct-edit ct-edit--editing');
        expect(reads().length).toBe(1);
        expect(surface.session).toBe(mounted);
        expect(document.querySelectorAll(EDITOR_TAG).length).toBe(1);
    });

    it('refuses at Submit when somebody else created the file first, and '
       + 'keeps the words', async function() {
        /* The race the naming check cannot settle: two authors, one
           name, and both were told it was free. The second Submit is
           the only place left to find out, and what it must not do is
           commit onto the first author's entry or lose the second's
           work. */
        const it = blankPage();
        const surface = await openOn(it);
        const {bar} = surface;
        await write(surface);
        retype(surface.session, 'First words.', 0);
        it.fake.pushOther('main', {[POST]: 'theirs'});

        await submit(bar);

        expect(note(bar)).not.toContain('Submitted as');
        /* In the words the admin screens use for the same refusal, and
           naming the file, since the name is what has to change. */
        expect(note(bar)).toContain('There is already an entry with that name.');
        expect(note(bar)).toContain(POST);
        /* Nothing of the second author's went anywhere near the first's
           entry: no branch to review, and their file as they wrote it. */
        expect(it.fake.pulls().length).toBe(0);
        expect(it.fake.read(POST, 'main')).toBe('theirs');
        expect(region().textContent).toContain('First words.');
        expect(surface.session.started()).toBe(true);
    });

    it('asks before the tab closes, from the moment the entry is named',
       async function() {
        /* Nothing typed, and it is still work: the name is the one
           thing about an entry nobody can change afterwards, and
           leaving now throws it away. */
        const surface = await openOn(blankPage());
        expect(asksToLeave()).toBe(false);

        await write(surface);

        expect(asksToLeave()).toBe(true);
    });

    it('gives the page\'s own placeholder back when the red cross is pressed',
       async function() {
        const surface = await openOn(blankPage());
        await write(surface);
        expect(document.querySelector('#placeholder')).toBeNull();

        await confirming(true, () => pressEdit(surface.session, 'cancel'));

        expect(document.querySelector('#placeholder')).not.toBeNull();
        expect(region().textContent).toBe('Nothing here yet.');
    });
});
