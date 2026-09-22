/* Which of four answers a page gets, and why.
 *
 * Driven through `resolve`, which is the whole decision as a value: a
 * config it fetches, a page it reads, and one `BarState` out. `open` is
 * tested separately and only for the promise it makes -- that it never
 * throws on somebody's site.
 */

import {
    CONFIG_META, DEFAULT_CONFIG_URL, open, resolve
} from '../../../src/edit/surface.js';
import {BAR_TAG} from '../../../src/edit/chrome.js';

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

afterEach(function() {
    for (const node of [...document.querySelectorAll(BAR_TAG)]) {
        node.remove();
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
        const bar = await open(it.where, it.options);

        expect(it.where.document.body.querySelector(BAR_TAG)).toBe(bar.node);
        expect(bar.node.shadowRoot.querySelector('.ct-edit').className)
            .toContain('ct-edit--ready');
    });

    it('never throws, and puts the reason where somebody can read it',
       async function() {
        /* This script is on every page of the site. A failure that
           becomes an uncaught error is a site that looks broken to
           everybody, over a feature only an author uses. */
        const it = page('<article>x</article>', null);
        const bar = await open(it.where, it.options);

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
        const bar = await open(it.where, it.options);

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
        const bar = await open(it.where, it.options);

        expect(bar.node.shadowRoot.querySelector('.ct-edit__hint').textContent)
            .toContain('collections[0]');
    });
});
