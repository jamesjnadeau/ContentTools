import {expect, test} from '@playwright/test';
import {createFakeGitHub} from '../browser/cms/fake-github.js';

/* The CMS half, against the BUILT `dist/cms.js`, through the playground.
 *
 * The vitest suite constructs the client with the in-memory GitHub as its
 * `fetch`, which is what makes every layer above it testable -- and which
 * also means the request never touches the browser's own stack. Here the
 * page is unmodified and the real `fetch` runs, with Playwright routing
 * `api.github.com` to the same in-memory GitHub. So the URLs, the methods
 * and the headers are themselves under test, and so is the thing no
 * source-level test can see: whether the built entry resolves its own
 * dependencies. `dist/markdown.js` shipped once with a working suite and
 * an entry that threw on `start()`, which is the whole argument for this
 * file.
 *
 * Driving it through `playground/cms.html` rather than a fixture of its
 * own is the same choice `markdown-dist.spec.mjs` made: a playground page
 * nobody runs is a page that has quietly stopped working.
 */

const PAGE = '/playground/cms.html';
const TOKEN = 'github_pat_playwright';

const SEED = {
    'content/blog/hello.md': '# Hello\n\nA first paragraph.\n\nA second one.\n',
    'content/blog/second.md': '# Second\n',
    'content/about.md': '# About\n',
    'static/images/cat.png': 'CAT'
};

/** Serve `api.github.com` from an in-memory GitHub, over the real fetch. */
async function serveGitHub(page, options = {}) {
    const fake = createFakeGitHub({files: SEED, ...options});

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
            body: await response.text()
        });
    });
    return fake;
}

/** Sign in and wait for the entry list the page fetches next. */
async function signIn(page) {
    await page.locator('#token').fill(TOKEN);
    await page.locator('#signin').click();
    await expect(page.locator('#entry option')).toHaveCount(2);
}

test.beforeEach(async ({page}) => {
    await page.goto(PAGE);
    // The collections come from the YAML config, so this waits for the
    // built entry to have resolved its lazily-imported parser.
    await expect(page.locator('#collection option')).toHaveCount(2);
});

test('the built entry reads its config, YAML parser and all', async ({page}) => {
    /* `loadConfig` tries JSON and falls back to `await import('yaml')`,
       which is a separate chunk of the cms build. A chunk that does not
       resolve from the published file fails nowhere else. */
    await expect(page.locator('#collection')).toHaveText(/Blog/);
    return expect(await page.locator('#collection option').allTextContents())
        .toEqual(['Blog', 'Pages']);
});

test('signing in lists a collection over the real fetch', async ({page}) => {
    const fake = await serveGitHub(page);
    await signIn(page);

    expect(await page.locator('#entry option').allTextContents())
        .toEqual(['hello', 'second']);
    // The request the browser actually sent, not one we handed the client.
    return expect(fake.requests.some(([method, path]) =>
        method === 'GET' && path.startsWith('/repos/owner/site/contents/content/blog'))).toBe(true);
});

test('the token reaches GitHub as a bearer credential', async ({page}) => {
    /* Asserted here and nowhere else: a client constructed with an
       injected transport cannot tell whether the browser would have sent
       the header, and a missing one is a 401 the user reads as "my token
       is wrong". */
    const fake = await serveGitHub(page);
    await signIn(page);

    const headers = fake.requests.at(-1)[2];
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    return expect(headers['x-github-api-version']).toBe('2022-11-28');
});

test('editing one paragraph submits a one-line diff as a pull request', async ({page}) => {
    const fake = await serveGitHub(page);
    await signIn(page);
    await page.locator('#open').click();
    await expect(page.locator('content-tools-editor')).toHaveAttribute('state', 'ready');

    await page.locator('#start').click();
    const paragraph = page.locator('[data-ct-md="1"]');
    await paragraph.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Replaced.');
    await page.locator('#submit').click();
    await expect(page.locator('#log')).toContainText('committed');

    // One branch, one pull request, one commit on top of the seed.
    expect(fake.branches()).toEqual(['cms/blog/hello', 'main']);
    expect(fake.pulls().length).toBe(1);
    expect(fake.history('cms/blog/hello').length).toBe(2);

    /* The diff a reviewer opens: one line. Everything else is spliced
       back from the original bytes rather than re-serialized, which is
       the property the markdown half exists for and the only one that
       makes this workflow reviewable. */
    const before = SEED['content/blog/hello.md'].split('\n');
    const after = fake.read('content/blog/hello.md', 'cms/blog/hello').split('\n');
    const changed = after.map((line, i) => (line === before[i] ? null : i)).filter(i => i !== null);
    expect(changed.length).toBe(1);
    expect(after[changed[0]]).toBe('Replaced.');

    // ...and it arrived labelled, so a board has something to show.
    return expect(fake.pulls()[0].labels.map(label => label.name)).toEqual(['cms/draft']);
});

test('a second submit adds to the same pull request', async ({page}) => {
    const fake = await serveGitHub(page);
    await signIn(page);
    await page.locator('#open').click();
    await expect(page.locator('content-tools-editor')).toHaveAttribute('state', 'ready');

    for (const [n, text] of [[1, 'One.'], [2, 'Two.']]) {
        await page.locator('#start').click();
        await page.locator('[data-ct-md="1"]').click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(text);
        await page.locator('#submit').click();
        /* Counted, not merely present: the first submit's line is still
           in the log, so waiting for the word again returns at once and
           the assertions below then read the repository mid-save. */
        await expect.poll(async () =>
            ((await page.locator('#log').innerText()).match(/committed/g) ?? []).length
        ).toBe(n);
    }

    expect(fake.pulls().length).toBe(1);
    // Seed, then one commit per submit -- not a replaced branch.
    expect(fake.history('cms/blog/hello').length).toBe(3);
    return expect(fake.read('content/blog/hello.md', 'cms/blog/hello')).toContain('Two.');
});

test('a status change moves exactly one label', async ({page}) => {
    const fake = await serveGitHub(page);
    await signIn(page);
    await page.locator('#open').click();
    await expect(page.locator('content-tools-editor')).toHaveAttribute('state', 'ready');
    await page.locator('#start').click();
    await page.locator('[data-ct-md="1"]').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Something to review.');
    await page.locator('#submit').click();
    await expect(page.locator('#log')).toContainText('committed');

    await page.locator('#status').selectOption('ready');
    await page.locator('#move').click();
    await expect(page.locator('#log')).toContainText('status is now ready');

    expect(fake.pulls()[0].labels.map(label => label.name)).toEqual(['cms/ready']);
    return expect(page.locator('#state')).toContainText('ready');
});

test('a failure lands on the page instead of the console', async ({page}) => {
    /* No route, so every request fails at the network. A shell that
       swallows this shows an editor that silently never saves. */
    await page.route('https://api.github.com/**', route => route.abort());
    await page.locator('#token').fill(TOKEN);
    await page.locator('#signin').click();

    return expect(page.locator('#log')).toContainText('! TypeError');
});
