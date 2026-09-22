import {expect, test} from '@playwright/test';

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

    await expect(panel(page)).toHaveClass(/ct-edit--ready/);
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
        .toHaveText('Editing article.post, matched by article.post.');
});

test('it reads the config the PAGE names, not the one at the root',
     async ({page}) => {
    /* `<meta name="cms:config">`. A site served under a prefix cannot be
       told where its config is by `site.base`, because that is inside
       the file being looked for. */
    const asked = [];
    page.on('request', request => asked.push(new URL(request.url()).pathname));

    await page.goto(`${PAGE}?cms-edit`);
    await expect(panel(page)).toHaveClass(/ct-edit--ready/);

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
    await expect(panel(page)).toHaveClass(/ct-edit--ready/);

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
