import {expect, test} from '@playwright/test';
import {createFakeGitHub} from '../browser/cms/fake-github.js';

/* The in-page script, against the BUILT `dist/edit.js`, on a page that
 * looks like a site rather than like a test.
 *
 * Every assertion here is one the vitest suite cannot make. That suite
 * runs against source, through `test/browser/setup-globals.js`, which
 * loads the whole library into every spec -- so a source-level test
 * passes for an entry whose own lazy chunk does not resolve. That has
 * happened twice in this project: `dist/element.js` shipped with 662
 * green tests and an entry that threw on `start()`, and `dist/cms.js`
 * shipped with an unbound `fetch`. This entry has MORE of that risk than
 * either, not less, because everything it does is behind an `import()`
 * whose specifier only exists after Rollup has written it.
 *
 * The page is `playground/first-post.html`, unmodified -- the page a
 * person opens to see what this looks like. One page, so it cannot rot.
 */

const PAGE = '/playground/first-post.html';
const BAR = 'content-tools-edit-bar';

/** The bar's panel, reached through the open shadow root. */
const panel = page => page.locator(`${BAR}`).locator('.ct-edit');

/* The key `PatAuthAdapter` writes, spelled out rather than imported: the
   point of seeding it from a test is to arrive in the state a browser is
   in after somebody signed in through /admin, and a shared constant
   would make this pass for whatever the adapter happens to call it. */
const TOKEN_KEY = 'content-tools:github-token';

/* Two blocks and a frontmatter block, because the mount asserts our
   render replaced the template's -- which a file with one paragraph
   could not distinguish from a page that never changed. */
const SEED = '---\ntitle: A first post\n---\n\n'
    + 'The paragraph as the BRANCH has it.\n\n'
    + '## A heading\n\nAnd a second paragraph.\n';

/** Serve `api.github.com` from an in-memory GitHub, over the real fetch. */
async function serveGitHub(page) {
    const fake = createFakeGitHub({files: {'content/blog/first-post.md': SEED}});
    await page.route('https://api.github.com/**', async route => {
        const request = route.request();
        const response = await fake.fetch(request.url(), {
            method: request.method(),
            headers: request.headers(),
            body: request.postData() ?? undefined
        });
        await route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: Buffer.from(await response.arrayBuffer())
        });
    });
    return fake;
}

/** Arrive with a token, as somebody who signed in through /admin does. */
async function signedIn(page) {
    await page.addInitScript(key => {
        sessionStorage.setItem(key, 'github_pat_playwright');
    }, TOKEN_KEY);
    return serveGitHub(page);
}

test('a reader downloads the decision and nothing else', async ({page}) => {
    /* The whole shape of this entry. A reader has no flag and no token,
       so the loader answers no and the surface chunk is never fetched --
       and if that ever stops being true it stops silently, with the site
       merely a little slower for everybody. */
    const fetched = [];
    page.on('request', request => fetched.push(request.url()));

    await page.goto(PAGE);
    await expect(page.locator('article.post')).toBeVisible();

    expect(fetched.filter(url => url.includes('/dist/edit.js'))).toHaveLength(1);
    expect(fetched.filter(url => url.includes('/dist/chunks/surface')))
        .toHaveLength(0);
    await expect(page.locator(BAR)).toHaveCount(0);
});

test('the flag brings up the surface, lazy chunk and all', async ({page}) => {
    /* The link `/admin` sends an author out with. It exercises the two
       things only a built artifact can be wrong about: whether the
       dynamic specifier resolves from the published file, and whether
       the YAML parser behind `loadConfig` resolves from the chunk that
       imports it. */
    await page.goto(`${PAGE}?cms-edit`);

    /* `signed-out` rather than `ready`: this page reached `ready` and
       went straight past it, because nothing in this tab holds a token.
       Which is the point -- the bar never stops at a decision, it
       reports where the decision LED. */
    await expect(panel(page)).toHaveClass(/ct-edit--signed-out/);
});

test('it names the entry and the element it will edit', async ({page}) => {
    await page.goto(`${PAGE}?cms-edit`);

    /* The entry comes from the URL through the collection's `page`
       template, and the element from its `body` selector. Naming both is
       the point: `article.post` is the post, and `div.layout` would be
       the whole site's layout about to be replaced by one. */
    await expect(panel(page).locator('.ct-edit__title'))
        .toHaveText('blog/first-post');
    await expect(panel(page).locator('.ct-edit__hint'))
        .toHaveText('Found article.post, matched by article.post. Sign in '
            + 'through the admin screens in this tab, then come back to edit it.');
});

test('it reads the config the PAGE names, not the one at the root',
     async ({page}) => {
    /* `<meta name="cms:config">`. A site served under a prefix cannot be
       told where its config is by `site.base`, because that is inside
       the file being looked for. */
    const asked = [];
    page.on('request', request => asked.push(new URL(request.url()).pathname));

    await page.goto(`${PAGE}?cms-edit`);
    await expect(panel(page)).toHaveClass(/ct-edit--signed-out/);

    expect(asked).toContain('/playground/site-config.yml');
    expect(asked).not.toContain('/cms-config.yml');
});

test('it leaves the site alone, and says nothing in the console',
     async ({page}) => {
    /* Two promises this script makes to a site it does not own. It adds
       exactly one element to the body and writes nothing into it, and it
       puts its failures on the screen rather than in a console nobody on
       a published site is reading. */
    const complaints = [];
    page.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') {
            complaints.push(message.text());
        }
    });
    page.on('pageerror', error => complaints.push(String(error)));

    await page.goto(`${PAGE}?cms-edit`);
    await expect(panel(page)).toHaveClass(/ct-edit--signed-out/);

    expect(complaints).toEqual([]);
    expect(await page.locator(BAR).innerHTML()).toBe('');
    // The post is untouched: the surface has read the page, not edited it.
    await expect(page.locator('article.post p').first())
        .toHaveText('The first paragraph of the post, as the site renders it.');
});

test('a config that will not parse says which line, on the page',
     async ({page}) => {
    /* The operator's likeliest failure, and the one `ConfigError.path`
       exists for -- asserted here as well as in the unit suite because
       the path has to survive the whole way out: thrown inside a lazily
       imported chunk, caught in the entry, and rendered into a shadow
       root. A stack trace in a console is not an answer; `collections[0]`
       is. */
    await page.route('**/site-config.yml', route => route.fulfill({
        status: 200,
        contentType: 'text/yaml',
        body: 'backend:\n  repo: owner/site\n'
            + 'media:\n  folder: static/images\n  publicPath: /images\n'
            + 'collections:\n  - folder: content/blog\n'
    }));

    await page.goto(`${PAGE}?cms-edit`);

    await expect(panel(page)).toHaveClass(/ct-edit--broken/);
    await expect(panel(page).locator('.ct-edit__hint'))
        .toContainText('collections[0]');
});

test('a token in the tab brings the editor up over the site\'s own element',
     async ({page}) => {
    /* The whole milestone, through the built artifact. Everything below
       is reachable only after the lazy chunk has resolved the editor
       element, the markdown parser, the GitHub client and the config
       loader -- four graphs Rollup assembled and no source test loads
       the way a browser does. */
    await signedIn(page);
    await page.goto(`${PAGE}?cms-edit`);

    await expect(panel(page)).toHaveClass(/ct-edit--editing/);

    const post = page.locator('article.post');
    /* Still inside the site's own layout: `.layout > article.post` is an
       ordinary rule for a theme to have written, and it stops matching
       the moment the element is moved under the editor. */
    await expect(page.locator('.layout > article.post')).toHaveCount(1);
    /* And holding OUR render of the branch, not the template's HTML. */
    await expect(post).toContainText('The paragraph as the BRANCH has it.');
    await expect(post).not.toContainText('as the site renders it');
    await expect(post.locator('[data-ct-md]').first()).toBeVisible();

    /* MOUNTED, not merely rendered. `ce-element` is what ContentEdit
       writes on every block it manages, so this is the one assertion
       here that cannot pass for an element holding the right words and
       nothing else. (`contenteditable` is not the marker: ContentEdit
       adds it on focus and takes it off again on blur.) */
    await expect(post.locator('p.ce-element').first()).toBeVisible();
    await expect(post.locator('h2.ce-element')).toHaveCount(1);

    /* And the editor element itself is an empty block at the end of the
       page: its region is named rather than matched, so it needs no
       children, and that is the smallest footprint it can have on a
       page it does not own. */
    const editor = page.locator('body > content-tools-editor');
    await expect(editor).toHaveCount(1);
    expect(await editor.evaluate(node => node.children.length)).toBe(0);
});

test('the content stylesheet reaches the light DOM', async ({page}) => {
    /* In Mode A the content stays in the page, so the editing
       affordances have to be styled by a real `<link>` in the site's own
       document -- adopting them into the bar's shadow root would reach
       nothing, and the sheet carries `url()` references that only
       resolve against a stylesheet URL. Without it everything else looks
       right and no affordance ever appears. */
    await signedIn(page);
    await page.goto(`${PAGE}?cms-edit`);
    await expect(panel(page)).toHaveClass(/ct-edit--editing/);

    const cursor = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.className = 'ce-element ce-element--type-image';
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).cursor;
        probe.remove();
        return value;
    });

    expect(cursor).not.toBe('auto');
});

test('the mount says nothing in the console either', async ({page}) => {
    /* The promise from the read half, kept through the write half: this
       script runs on a published page, so a failure belongs on the
       screen and nowhere else. */
    const complaints = [];
    page.on('console', message => {
        if ((message.type() === 'error' || message.type() === 'warning')
            && !message.text().startsWith('Failed to load resource')) {
            complaints.push(message.text());
        }
    });
    page.on('pageerror', error => complaints.push(String(error)));

    await signedIn(page);
    await page.goto(`${PAGE}?cms-edit`);
    await expect(panel(page)).toHaveClass(/ct-edit--editing/);

    expect(complaints).toEqual([]);
});
