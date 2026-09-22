import {expect, test} from '@playwright/test';
import {createFakeGitHub} from '../browser/cms/fake-github.js';

/* The shell, against the BUILT `dist/shell.js`, through the page we ship.
 *
 * `app/index.html` is the deliverable -- copy `app/` and `dist/` to a
 * static host and that is the install -- and it is also the fixture here,
 * deliberately. Two files would drift; one cannot drift from itself, and
 * the playground taught this repo that a page nobody runs is a page that
 * has quietly stopped working.
 *
 * What only this file can see: whether the built entry resolves its own
 * dependencies, and whether the tag registers at all. `dist/element.js`
 * shipped once with 662 green source tests and an entry that threw on
 * `start()`, because every source test loads the whole library through
 * `global.ts` and the artifact does not. The shell's graph is much bigger
 * than that one, and it is assembled by Rollup rather than by any test.
 */

const PAGE = '/app/index.html';
const TOKEN = 'github_pat_playwright';

/** Serve `api.github.com` from an in-memory GitHub, over the real fetch. */
/* Frontmatter plus two blocks, because the entry test below asserts the
   frontmatter survives byte for byte while exactly one body line
   changes -- which a one-line file could not distinguish. */
const SEED = '---\ntitle: Hello\n---\n\n# Hello\n\nBody.\n';

/* A real 1x1 PNG. The media tile decides whether Insert is offered from
   `naturalWidth`, so a made-up byte string would leave the button
   disabled and the test asserting about a grid that never rendered. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN'
    + 'kYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function serveGitHub(page) {
    const fake = createFakeGitHub({
        files: {
            'content/blog/hello.md': SEED,
            'content/about.md': '# About\n',
            'static/images/cat.png': {base64: PNG_BASE64}
        }
    });
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
            /* The BYTES, not the text. A blob read asks for
               `application/vnd.github.raw`, so a PNG comes back as
               binary -- and decoding it as UTF-8 here replaces every
               byte the decoder cannot spell, so the thumbnail the media
               library falls back to would silently fail to decode. */
            body: Buffer.from(await response.arrayBuffer())
        });
    });
    return fake;
}

/** The shell's shadow root, as a Playwright locator root. */
const shell = page => page.locator('content-tools-cms');

/**
 * Console errors the PAGE produced, with the browser's own network
 * logging filtered out.
 *
 * Chromium logs "Failed to load resource: ... 401" itself for every
 * non-2xx response, at error level and from no script. That is the
 * browser narrating a request the shell made on purpose and handled; the
 * claim under test is that nothing the shell RUNS writes to the console
 * instead of to the page, so counting the browser's narration would make
 * the assertion impossible to satisfy for any error path.
 */
function collectConsoleErrors(page) {
    const logged = [];
    page.on('console', message => {
        if (message.type() === 'error'
            && !message.text().startsWith('Failed to load resource')) {
            logged.push(message.text());
        }
    });
    return logged;
}

test('the tag registers and the element upgrades', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));

    await page.goto(PAGE);

    /* `state` is reflected once the shell has settled, so it is only
       there if the class has been defined AND applied to the parsed
       element. A `dist/shell.js` whose `customElements.define` had been
       tree-shaken, or which threw while evaluating, leaves the tag as an
       unknown element and this never appears.

       `signed-out` rather than any other value is the stronger claim: it
       means the config file was fetched and PARSED, which for a YAML
       config runs `await import('yaml')` -- a separate chunk of the esm
       build that the shell reaches dynamically. A chunk that does not
       resolve from the published file fails nowhere else, and it would
       leave this at `unconfigured`. */
    await expect(page.locator('content-tools-cms'))
        .toHaveAttribute('state', 'signed-out');

    expect(errors).toEqual([]);
});

test('the gate names the repository and what the token needs', async ({page}) => {
    await page.goto(PAGE);

    /* A token scoped to the wrong repository, or without these two
       permissions, comes back from GitHub as a 404 -- it answers 404
       rather than 403 so as not to disclose that a repository exists --
       and a 404 reads to the person who has just made the token as "that
       repository is gone". Naming both here is the only place that
       conclusion can be headed off. */
    await expect(shell(page).locator('.ct-cms__gate-repo')).toHaveText('owner/site');
    const permissions = shell(page).locator('.ct-cms__gate-permissions');
    await expect(permissions).toContainText('Contents');
    await expect(permissions).toContainText('Pull requests');
});

test('a token gets past the gate and the collections render', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    /* Console errors, not just page errors. The rule for the shell is
       that a failure lands on the PAGE: one that only reaches the console
       leaves a shell looking idle when it has failed, and nobody reads a
       console on a static host. */
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
    await page.goto(PAGE);
    await expect(page.locator('content-tools-cms'))
        .toHaveAttribute('state', 'signed-out');

    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();

    await expect(page.locator('content-tools-cms')).toHaveAttribute('state', 'ready');
    /* The two collections `app/cms-config.yml` declares, and then the
       two places that are not collections and are fixed: the media
       folder every collection's pictures share, and the review list,
       which spans all of them and so belongs to none. */
    expect(await shell(page).locator('.ct-cms__nav-link').allTextContents())
        .toEqual(['Blog', 'Pages', 'Media', 'In review']);

    /* The credential the BROWSER sent, which no injected-transport test
       can see: a client that stores `fetch` unbound, or builds the header
       wrongly, fails only here. */
    const [, , headers] = fake.requests.find(([method, path]) =>
        method === 'GET' && path === '/repos/owner/site') ?? [];
    expect(String(headers?.authorization ?? headers?.Authorization))
        .toBe(`Bearer ${TOKEN}`);

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

test('the entry list merges what is published with what is in review',
     async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
    // An entry that exists only inside an open pull request: no file on
    // the base branch, so the directory listing does not know about it.
    fake.openPull('blog', 'unseen', ['cms/in-review']);

    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await expect(page.locator('content-tools-cms')).toHaveAttribute('state', 'ready');

    await shell(page).locator('.ct-cms__nav-link').first().click();

    /* Work in progress first, and each entry ONCE. Twice is the failure
       worth a dist test of its own: it reads as two pages with the same
       name, and somebody opens the stale one. */
    await expect(shell(page).locator('.ct-cms__entry-link'))
        .toHaveText(['unseen', 'hello']);
    await expect(shell(page).locator('.ct-cms__entry').first()
                     .locator('.ct-cms__badge').first())
        .toHaveText('In review');

    /* The row links to the entry's own route, which is what makes an
       entry bookmarkable and what M5-3 opens. */
    await expect(shell(page).locator('.ct-cms__entry-link').first())
        .toHaveAttribute('href', '#/c/blog/e/unseen');

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

test('opening an entry, editing it, and submitting one reviewable line',
     async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await expect(page.locator('content-tools-cms')).toHaveAttribute('state', 'ready');

    await shell(page).locator('.ct-cms__nav-link').first().click();
    await shell(page).locator('.ct-cms__entry-link').first().click();

    /* The editor is a LIGHT-DOM child of the shell, assigned to the
       frame's named slot. Only this file can see whether the built
       shell.js registers `<content-tools-editor>` at all: it imports
       the class module rather than `./element`, and the tag is defined
       from `src/shell/index.ts`. An unregistered tag is not an error --
       `createElement` hands back an inert unknown element -- so the
       entry would open to an empty pane with a clean console. */
    const editor = page.locator('content-tools-cms > content-tools-editor');
    await expect(editor).toHaveAttribute('state', 'editing');
    await expect(editor).toHaveAttribute('slot', 'editor');
    await expect(editor.locator('[data-editable] h1')).toHaveText('Hello');

    /* And the frontmatter form is above it, holding what the file says.
       `date` is declared by app/cms-config.yml and absent from the seed,
       so it is also the case that decides the assertion below: a widget
       reporting an untouched optional field as `''` would add a key to
       the block and rewrite the whole of it. */
    await expect(shell(page).locator('#ct-field-title')).toHaveValue('Hello');
    await expect(shell(page).locator('#ct-field-date')).toHaveValue('');

    // Type into the body, the way a person does.
    const paragraph = editor.locator('[data-editable] p').first();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Again.');

    /* Named, not positional. `.ct-cms__entry-view .ct-cms__button` used
       to mean Submit and stopped meaning it the moment Delete arrived
       beside it in the same row -- and `.first()` would then click the
       destructive one, from a line that reads as if nothing changed. */
    await shell(page).locator('.ct-cms__entry-submit').click();
    await expect(shell(page).locator('.ct-cms__entry-pull')).toContainText('Pull request');

    /* One branch, one pull request, one commit -- and the file still
       starts with the frontmatter block it started with, byte for byte.
       A serializer that renormalised the file would produce a diff
       covering all of it, and a diff covering all of it cannot be
       reviewed, which is the premise of the whole workflow. */
    expect(fake.branches()).toEqual(['cms/blog/hello', 'main']);
    expect(fake.pulls().length).toBe(1);
    expect(fake.history('cms/blog/hello').length).toBe(2);

    const saved = fake.read('content/blog/hello.md', 'cms/blog/hello');
    expect(saved.startsWith('---\ntitle: Hello\n---\n')).toBe(true);
    const added = saved.split('\n').filter(
        line => line && !SEED.split('\n').includes(line));
    expect(added).toEqual(['Body. Again.']);

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

test('naming a new entry, writing it, and opening one pull request',
     async ({page}) => {
    /* The create path through the BUILT artifact. The slug is derived
       from a title by `src/cms/config.ts`, which the shell inlines --
       so this is also the only place that checks the inlined copy and
       `dist/cms.js` agree about what a filename is. */
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await expect(page.locator('content-tools-cms')).toHaveAttribute('state', 'ready');

    await shell(page).locator('.ct-cms__nav-link').first().click();
    await shell(page).locator('.ct-cms__button--add').click();

    // The filename, shown while it is typed rather than after the fact.
    await shell(page).locator('#ct-cms-new-title').fill('Hello World!');
    await expect(shell(page).locator('.ct-cms__create-form .ct-field__hint'))
        .toHaveText('Saved as content/blog/hello-world.md');
    await shell(page).locator('.ct-cms__create-form .ct-cms__button').click();

    const editor = page.locator('content-tools-cms > content-tools-editor');
    await expect(editor).toHaveAttribute('state', 'editing');
    // Nothing is committed by naming it.
    expect(fake.branches()).toEqual(['main']);

    await editor.locator('[data-editable] p').first().click();
    await page.keyboard.type('First post.');
    await shell(page).locator('.ct-cms__entry-submit').click();
    await expect(shell(page).locator('.ct-cms__entry-pull')).toContainText('Pull request');

    expect(fake.branches()).toEqual(['cms/blog/hello-world', 'main']);
    expect(fake.pulls().length).toBe(1);
    expect(fake.read('content/blog/hello-world.md', 'cms/blog/hello-world'))
        .toBe('First post.\n');
    /* The address bar caught up with the entry, in place -- the editor
       the person is still looking at was not torn down to do it. */
    expect(new URL(page.url()).hash).toBe('#/c/blog/e/hello-world');

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

test('deleting an entry opens a pull request and says the page is still up',
     async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await expect(page.locator('content-tools-cms')).toHaveAttribute('state', 'ready');

    await shell(page).locator('.ct-cms__nav-link').first().click();
    await shell(page).locator('.ct-cms__entry-link').first().click();
    await expect(page.locator('content-tools-cms > content-tools-editor'))
        .toHaveAttribute('state', 'editing');

    await shell(page).locator('.ct-cms__entry-delete').click();
    await shell(page).locator('.ct-cms__confirm .ct-cms__button--cancel').click();

    /* One commit whose tree no longer holds the path, one pull request,
       and the file still on the base branch -- which is what the notice
       has to say out loud, because the entry is still in the list. */
    /* The frame's alert region, scoped: the gate has one of its own,
       and the two are on the page at once because the frame is hidden
       behind the gate rather than detached. */
    await expect(shell(page).locator('.ct-cms__main .ct-cms__alert-region'))
        .toContainText('stays on the site');
    expect(fake.pulls().length).toBe(1);
    expect(fake.paths('cms/blog/hello')).not.toContain('content/blog/hello.md');
    expect(fake.read('content/blog/hello.md')).toBe(SEED);

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

test('the media folder falls back to an authenticated read, and inserts',
     async ({page}) => {
    /* The one path in the media library that no source test can check
       end to end: the PUBLIC URL is tried first, and here it genuinely
       404s -- `/images/cat.png` is not on the dev server -- so the tile
       falls back to a blob read over the real `fetch`, decodes real PNG
       bytes into an object URL, and only then offers Insert. A source
       test serves both from data URLs and so proves nothing about the
       bytes surviving the wire. */
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
    /* NOTHING is seeded into `ct-toolbox-position` here, and that is the
       point. This test used to have to put the toolbox somewhere by hand,
       because the default landed at 128,128 -- the top-left of this
       shell's main pane, over the first column of the media grid and the
       first frontmatter field with it. The default is now the bottom
       right corner, which covers none of them.

       So the Insert click below is a genuine hit-tested click against the
       shipped default, and if that default ever moves back over the grid
       this test fails rather than quietly passing on a fixture. */
    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await expect(page.locator('content-tools-cms')).toHaveAttribute('state', 'ready');

    /* The library is its own place in the nav, under its own heading.
       Named rather than taken by position: `last()` meant Media until
       the review list arrived beside it, and a positional selector
       reads as if nothing changed while clicking somewhere else. */
    await shell(page).locator('.ct-cms__nav-link', {hasText: 'Media'}).click();
    await expect(shell(page).locator('.ct-cms__media-name')).toHaveText(['cat.png']);
    /* Nothing to insert into from here, and the grid says so rather
       than offering a button that would report success and do nothing. */
    await expect(shell(page).locator('.ct-cms__media-insert')).toBeHidden();

    // Now the same grid, under an open entry, where it can insert.
    await shell(page).locator('.ct-cms__nav-link').first().click();
    await shell(page).locator('.ct-cms__entry-link').first().click();
    await shell(page).locator('.ct-cms__entry-media').click();

    const insert = shell(page).locator('.ct-cms__media-insert');
    /* Enabled only once something decoded. The wait is the assertion:
       the button starts disabled, the public URL fails, the blob read
       answers, and the tile becomes insertable -- in that order. */
    await expect(insert).toBeEnabled();
    expect(fake.requests.some(([method, path]) =>
        method === 'GET' && path.includes('/git/blobs/'))).toBe(true);

    await insert.click();
    await shell(page).locator('.ct-cms__entry-submit').click();
    await expect(shell(page).locator('.ct-cms__entry-pull')).toContainText('Pull request');

    /* The URL the tile previewed is the URL the entry references, and
       one commit carries it: the picture is already in the repository,
       so nothing is staged and nothing is uploaded again. */
    const saved = fake.read('content/blog/hello.md', 'cms/blog/hello');
    expect(saved).toContain('![cat.png](/images/cat.png)');
    expect(saved.startsWith('---\ntitle: Hello\n---\n')).toBe(true);
    expect(fake.history('cms/blog/hello').length).toBe(2);

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

test('a refused token is reported on the page, not the console', async ({page}) => {
    const logged = collectConsoleErrors(page);

    await page.route('https://api.github.com/**', route => route.fulfill({
        status: 401,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({message: 'Bad credentials'})
    }));
    await page.goto(PAGE);
    await expect(page.locator('content-tools-cms'))
        .toHaveAttribute('state', 'signed-out');

    await shell(page).locator('.ct-cms__input').fill('github_pat_wrong');
    await shell(page).locator('.ct-cms__gate-form button').click();

    await expect(shell(page).locator('.ct-cms__alert-title'))
        .toHaveText('GitHub rejected that token.');
    // Still at the gate, with the field to try again in.
    await expect(page.locator('content-tools-cms'))
        .toHaveAttribute('state', 'signed-out');
    expect(logged).toEqual([]);
});

test('the shadow root is open and holds the editor slot', async ({page}) => {
    await page.goto(PAGE);

    /* Mode A, one level up: the editor element goes in the shell's LIGHT
       DOM and renders through this slot. Without it an editor that booted
       correctly would still be invisible, which is indistinguishable from
       one that failed to boot. */
    const slots = await page.evaluate(() => {
        const shell = document.querySelector('content-tools-cms');
        return [...shell.shadowRoot.querySelectorAll('slot')].map(slot => slot.name);
    });
    expect(slots).toEqual(['editor']);
});

test('the content stylesheet reaches the document', async ({page}) => {
    await page.goto(PAGE);

    /* The one thing about the deployable page that can be wrong while
       everything still LOOKS fine. In Mode A the editable content stays in
       the document, so the content sheet has to be linked there; drop the
       <link> and the page renders, the shell boots, and none of the
       editing affordances ever appear.

       `.ce-element--empty:after` is asserted rather than the <link> tag
       because the tag being present is not the claim -- the rules being in
       effect is, and a renamed or 404ing artifact passes the first and
       fails the second. The exact value is asserted rather than merely
       "not none", so that a document which happened to carry SOME sheet
       defining that pseudo-element could not stand in for ours. */
    const placeholder = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.className = 'ce-element ce-element--empty';
        document.body.appendChild(probe);
        const content = getComputedStyle(probe, '::after').content;
        probe.remove();
        return content;
    });
    expect(placeholder).toBe('"..."');
});

test('the review list moves an entry between statuses', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
    fake.openPull('blog', 'hello', ['cms/draft']);

    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await expect(page.locator('content-tools-cms')).toHaveAttribute('state', 'ready');

    await shell(page).locator('.ct-cms__nav-link', {hasText: 'In review'}).click();
    await expect(shell(page).locator('.ct-cms__review-link')).toHaveText(['hello']);
    await expect(shell(page).locator('.ct-cms__review-badge')).toHaveText('Draft');

    await shell(page).locator('.ct-cms__review-move', {hasText: 'Ready'}).click();
    await expect(shell(page).locator('.ct-cms__review-badge')).toHaveText('Ready');

    /* The DELETE that takes the old label off, which no other screen
       makes: a save only ever ADDS one. The label name carries a slash,
       so what is asserted is the escaped path the BROWSER sent -- a
       client that interpolated it raw would address
       `/labels/cms/draft`, which is a different endpoint and answers
       404, and `removeLabel` reads a 404 as "already gone" and says
       nothing. The entry would then carry both labels for ever. */
    expect(fake.requests.some(([method, path]) =>
        method === 'DELETE'
        && path === '/repos/owner/site/issues/1/labels/cms%2Fdraft')).toBe(true);

    /* And the pull request really moved, rather than only the badge:
       exactly one of ours on it, read from the fake rather than from
       the screen that just claimed it. */
    expect(fake.pulls()[0].labels.map(label => label.name)).toEqual(['cms/ready']);

    // The way out. The shell never merges; that is a human decision and
    // it happens on GitHub.
    await expect(shell(page).locator('.ct-cms__review-pull'))
        .toHaveAttribute('href', 'https://github.com/owner/site/pull/1');

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

/* --- signing in with a GitHub App ------------------------------------
 *
 * The whole redirect round trip, through the built shell, with nothing
 * stubbed inside it: the browser really leaves for `github.com`, really
 * comes back with a `code` in its query, and the page that boots on the
 * far side is the same `app/index.html` as every test above.
 *
 * This is the case the popup design could not have had. A popup leg is
 * another `Page`, so `page.route` does not reach it, and the vitest
 * browser project has no `context` at all -- the failure that decided
 * against it (COOP severing `window.opener`) is structurally invisible
 * to any test this repo can write. Every step of a redirect is a
 * navigation, and a navigation is interceptable.
 */

const PROXY = 'https://cms-auth.example.test/exchange';
const EXCHANGED = 'ghu_exchanged_for_a_code';

/**
 * Serve the app-auth config in place of the PAT one this page ships.
 *
 * A routed body rather than a second fixture page: `app/index.html` is
 * the deliverable and the thing under test, and two copies of it would
 * drift. Only the config differs between a deployment whose authors
 * paste tokens and one whose authors press a button, which is the claim
 * this makes by construction.
 */
async function serveAppAuthConfig(page) {
    await page.route('**/app/cms-config.yml', route => route.fulfill({
        status: 200,
        headers: {'content-type': 'text/yaml'},
        body: [
            'backend:',
            '  repo: owner/site',
            '  branch: main',
            '  auth:',
            '    kind: github-app',
            '    clientId: Iv1.playwright',
            `    proxy: ${PROXY}`,
            'media:',
            '  folder: static/images',
            '  publicPath: /images',
            'collections:',
            '  - name: blog',
            '    label: Blog',
            '    folder: content/blog',
            ''
        ].join('\n')
    }));
}

test('the App flow leaves for GitHub, comes back, and exchanges the code',
     async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
    await serveAppAuthConfig(page);

    /* GitHub, standing in for the authorise screen a person would see
       and approve. It answers the way GitHub does once they have: a 302
       back to the `redirect_uri` the request carried, with the code and
       the SAME `state`. Echoing the state rather than inventing one is
       what makes the check on the way home a real check. */
    let authorize = null;
    await page.route('https://github.com/login/oauth/authorize*', route => {
        authorize = new URL(route.request().url());
        const back = new URL(authorize.searchParams.get('redirect_uri'));
        back.searchParams.set('code', 'the_code');
        back.searchParams.set('state', authorize.searchParams.get('state'));
        return route.fulfill({status: 302, headers: {location: back.toString()}});
    });

    /* The proxy, which is the only party holding the client secret. It
       is a separate origin from the page on purpose: that is the shape
       a real deployment has, so this also exercises a cross-origin POST
       rather than a same-origin one that would hide a CORS mistake. */
    let exchange = null;
    await page.route(PROXY, async route => {
        exchange = new URLSearchParams(route.request().postData() ?? '');
        return route.fulfill({
            status: 200,
            headers: {
                'content-type': 'application/json',
                'access-control-allow-origin': '*'
            },
            body: JSON.stringify({token: EXCHANGED, expires_in: 28800})
        });
    });

    /* Started on a collection rather than the dashboard, for two
       reasons. It is the bookmark case -- somebody opens a link to a
       page of the site and is asked to sign in first -- and the
       redirect cannot carry a fragment: `redirect_uri` is this page
       without its query OR its hash, because GitHub matches the
       registered callback exactly. So the route only survives if the
       adapter stored it and put it back. It also gives the shell
       something to FETCH once it is in, which the dashboard does not. */
    await page.goto(`${PAGE}#/c/blog`);
    await expect(page.locator('content-tools-cms'))
        .toHaveAttribute('state', 'signed-out');

    /* The gate's other shape, driven by the adapter the CONFIG asked
       for. No `el.auth` is assigned anywhere on this page, so a
       `backend.auth` block that did not reach `_adapterFor` would leave
       a password field here and this would not exist. */
    await expect(shell(page).locator('.ct-cms__gate-form')).toBeHidden();
    const button = shell(page).locator('.ct-cms__gate-app-button');
    await expect(button).toHaveText('Sign in with GitHub');

    await button.click();

    await expect(page.locator('content-tools-cms'))
        .toHaveAttribute('state', 'ready');

    /* What the browser actually sent to GitHub. PKCE cannot be proved
       here -- GitHub ignores query parameters it does not know, so
       whether the real App flow ENFORCES `code_challenge` is only
       answerable against a real App -- but that we send it, and send
       the matching verifier to the proxy and never to GitHub, is
       exactly what is assertable and is what this checks. */
    expect(authorize.searchParams.get('client_id')).toBe('Iv1.playwright');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorize.searchParams.has('code_verifier')).toBe(false);

    expect(exchange.get('code')).toBe('the_code');
    expect(exchange.get('code_verifier')).toBeTruthy();
    /* The secret is the proxy's, and the browser must not be carrying
       one to hand it. */
    expect(exchange.has('client_secret')).toBe(false);

    /* The code is out of the address bar. It is bookmarkable and it
       leaks in a `Referer`, and `replaceUrl` runs before the exchange
       so that a failed one does not leave it there either. */
    expect(new URL(page.url()).search).toBe('');

    /* Back on the page they asked for, rather than the dashboard. */
    expect(new URL(page.url()).hash).toBe('#/c/blog');
    await expect(shell(page).locator('.ct-cms__entry-link')).toHaveText(['hello']);

    /* And the token GitHub is being called with is the EXCHANGED one --
       the end of the round trip, and the assertion no source-level test
       can make, because only here does a real `fetch` build the header
       from a token a real redirect produced. */
    const [, , headers] = fake.requests.find(([method, path]) =>
        method === 'GET' && path.startsWith('/repos/owner/site/contents/')) ?? [];
    expect(String(headers?.authorization ?? headers?.Authorization))
        .toBe(`Bearer ${EXCHANGED}`);

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

test('a proxy that is not deployed says so on the page, naming itself',
     async ({page}) => {
    const logged = collectConsoleErrors(page);

    await serveGitHub(page);
    await serveAppAuthConfig(page);
    await page.route('https://github.com/login/oauth/authorize*', route => {
        const authorize = new URL(route.request().url());
        const back = new URL(authorize.searchParams.get('redirect_uri'));
        back.searchParams.set('code', 'the_code');
        back.searchParams.set('state', authorize.searchParams.get('state'));
        return route.fulfill({status: 302, headers: {location: back.toString()}});
    });
    /* The likeliest way an App deployment is wrong: the Worker or the
       Function was never published, or its URL has a typo in it. The
       browser sees a rejected `fetch`, which is a bare `TypeError` --
       and described as one it reads "could not reach GitHub", sending
       an operator to a status page about a machine of their own. */
    await page.route(PROXY, route => route.abort('connectionfailed'));

    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__gate-app-button').click();

    await expect(shell(page).locator('.ct-cms__alert-title'))
        .toHaveText('That sign-in did not finish.');
    await expect(shell(page).locator('.ct-cms__alert-detail'))
        .toContainText(PROXY);

    /* Still at the gate, with the button to try again -- and the code
       is gone from the address bar, so a reload retries the SIGN-IN
       rather than replaying a code that has already been spent. */
    await expect(page.locator('content-tools-cms'))
        .toHaveAttribute('state', 'signed-out');
    expect(new URL(page.url()).search).toBe('');
    expect(logged).toEqual([]);
});

test('the toolbox default clears the shell rather than landing on it',
     async ({page}) => {
    /* The editor's toolbox is `position: fixed` chrome, 138px wide and
       ~320px tall, floating over whatever the host page put underneath
       it -- and the host page here is the shell. Its DEFAULT position
       is therefore a product decision about somebody else's layout,
       and it is the one thing about the toolbox that no unit test can
       see: the source browser specs load no stylesheet at all, so
       `getComputedStyle` there reports the UA's `auto` for every edge
       whatever the rule says.

       So this asserts the requirement rather than the rule: with
       NOTHING in `ct-toolbox-position`, the shipped default must not
       cover a control. It used to land at 128,128 -- over the first
       frontmatter field -- and top-right was measured too and is worse,
       covering Sign out and Submit. An overlap assertion states what
       actually matters and survives a deliberate move to some other
       free corner; a pixel assertion would fail on the move and pass
       on a regression into a different control. */
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));

    await serveGitHub(page);
    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await shell(page).locator('.ct-cms__nav-link').first().click();
    await shell(page).locator('.ct-cms__entry-link').first().click();
    await expect(page.locator('content-tools-cms > content-tools-editor'))
        .toHaveAttribute('state', 'editing');

    /* Every widget transitions itself in behind a 100ms timer, so an
       immediate read measures a toolbox mid-animation rather than where
       it comes to rest -- the same race Phase 7e met from the other
       side. */
    await expect(page.locator('content-tools-cms > content-tools-editor')
        .locator('.ct-toolbox.ct-widget--active')).toBeVisible();

    const boxes = await page.evaluate(() => {
        const rect = el => {
            const r = el.getBoundingClientRect();
            return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
        };
        const root = document.querySelector('content-tools-cms').shadowRoot;
        const toolbox = document.querySelector('content-tools-editor')
            .shadowRoot.querySelector('.ct-toolbox');
        const named = {};
        /* The controls an author reaches for while an entry is open.
           `.ct-fields` rather than each input, because the fields
           pane is the box that must stay clickable all the way across
           -- a widget covering only its right half is still covering
           a `select` or a wide text field somebody else configured. */
        for (const [name, selector] of [
            ['header', '.ct-cms__header'],
            ['the action row', '.ct-cms__entry-head'],
            ['fields', '.ct-fields']
        ]) {
            const el = root.querySelector(selector);
            /* A missing selector would make this test pass by having
               nothing to overlap, which is the failure shape an
               overlap assertion is most prone to. */
            if (!el) throw new Error(`no ${name} (${selector}) to measure`);
            named[name] = rect(el);
        }
        return {toolbox: rect(toolbox), ...named};
    });

    const {toolbox, ...controls} = boxes;
    for (const [name, box] of Object.entries(controls)) {
        const overlaps = toolbox.left < box.right && toolbox.right > box.left
            && toolbox.top < box.bottom && toolbox.bottom > box.top;
        expect(overlaps, `the toolbox covers ${name}`).toBe(false);
    }

    // And it is on screen: "clears everything" must not mean "is elsewhere".
    const size = page.viewportSize();
    expect(toolbox.left).toBeGreaterThanOrEqual(0);
    expect(toolbox.top).toBeGreaterThanOrEqual(0);
    expect(toolbox.right).toBeLessThanOrEqual(size.width);
    expect(toolbox.bottom).toBeLessThanOrEqual(size.height);

    expect(errors).toEqual([]);
});

test('dragging the toolbox moves it rather than stretching it',
     async ({page}) => {
    /* The default position is anchored with `bottom`, and the toolbox has
       no `height`. A `position: fixed` box with `top` AND `bottom` set and
       `height: auto` is STRETCHED to span both edges -- only the
       all-three-specified case is over-constrained and drops one -- so an
       inline `top` written on its own does not move the toolbox, it makes
       it as tall as the gap. `ToolboxUI._moveTop()` clears `bottom`
       first, and this is the only place that can tell: the source browser
       specs load no stylesheet, so there is no `bottom` there to fail to
       clear, and the visual suite drives the FROZEN v1.6.16 bundle, which
       has no `_moveTop` in it to test.

       Every drag would be affected, not an edge case -- the grip is the
       advertised way out of the toolbox's way, and the first drag would
       have turned it into a column of tools down the side of the page. */
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));

    await serveGitHub(page);
    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await shell(page).locator('.ct-cms__nav-link').first().click();
    await shell(page).locator('.ct-cms__entry-link').first().click();
    await expect(page.locator('content-tools-cms > content-tools-editor'))
        .toHaveAttribute('state', 'editing');

    const toolbox = page.locator('content-tools-cms > content-tools-editor')
        .locator('.ct-toolbox');
    await expect(toolbox).toHaveClass(/ct-widget--active/);

    const before = await toolbox.boundingBox();

    /* Dragged by the grip, which is what `_onStartDragging` binds --
       a drag from anywhere else on the toolbox moves nothing. */
    const grip = page.locator('content-tools-cms > content-tools-editor')
        .locator('.ct-toolbox__grip');
    const from = await grip.boundingBox();
    /* Rounded, because Chromium delivers integer `clientX`/`clientY` to
       the page: grabbing at a half-pixel makes the offset the handler
       computes differ from the one asserted here by half a pixel. */
    const grab = {x: Math.round(from.x + from.width / 2),
                  y: Math.round(from.y + from.height / 2)};
    const to = {x: 400, y: 300};
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 8});
    await page.mouse.up();

    const after = await toolbox.boundingBox();

    /* It ended up WHERE IT WAS DRAGGED, which is a different claim from
       "it moved" and the difference is the whole test. `_onDrag` sets
       `top` to the cursor minus the grab offset, so the point of the
       toolbox under the cursor is the same point it was grabbed by.

       Asserting only that y changed passes when `top` is never written
       at all: clearing `bottom` on its own drops the toolbox to its
       static position, which is a vertical move of several hundred
       pixels that has nothing to do with the drag. */
    expect(after.x).toBeCloseTo(to.x - (grab.x - before.x), 0);
    expect(after.y).toBeCloseTo(to.y - (grab.y - before.y), 0);

    // And it is the same toolbox, not a column: same height, same width.
    expect(Math.round(after.height)).toBe(Math.round(before.height));
    expect(Math.round(after.width)).toBe(Math.round(before.width));

    expect(errors).toEqual([]);
});
