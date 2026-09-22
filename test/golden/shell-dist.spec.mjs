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

    /* NO editor, and this is the one place that can prove it of the
       built artifact. `dist/shell.js` no longer reaches
       `src/element/` at all since M6-3 -- the words of an entry are
       written on the site's own page -- and an editor mounted here
       would take the one-per-page `EditorApp` lease with it, so the
       in-page surface would refuse to boot on the site with nothing in
       any stack trace. A source spec cannot see this: every browser
       spec loads the whole library through `setup-globals.js`, so the
       tag is registered there whatever the shell imports. */
    await expect(page.locator('content-tools-cms content-tools-editor'))
        .toHaveCount(0);
    await expect(shell(page).locator('.ct-cms__entry-edit'))
        .toHaveAttribute('href', '/blog/hello/?cms-edit');
    await expect(shell(page).locator('.ct-cms__entry-edit'))
        .toHaveAttribute('target', '_blank');

    /* What IS here is the frontmatter form, holding what the file says.
       `date` is declared by app/cms-config.yml and absent from the seed,
       so it is also the case that decides the assertion below: a widget
       reporting an untouched optional field as `''` would add a key to
       the block and rewrite the whole of it. */
    await expect(shell(page).locator('#ct-field-title')).toHaveValue('Hello');
    await expect(shell(page).locator('#ct-field-date')).toHaveValue('');

    // Change a field, which is the whole of what this screen can change.
    await shell(page).locator('#ct-field-title').fill('Goodbye');

    /* Named, not positional. `.ct-cms__entry-view .ct-cms__button` used
       to mean Submit and stopped meaning it the moment Delete arrived
       beside it in the same row -- and `.first()` would then click the
       destructive one, from a line that reads as if nothing changed. */
    await shell(page).locator('.ct-cms__entry-submit').click();
    await expect(shell(page).locator('.ct-cms__entry-pull')).toContainText('Pull request');

    /* One branch, one pull request, one commit -- and the BODY comes
       back byte for byte. That is the mirror of the claim this test
       used to make: /admin never reads the body, so the file it writes
       is the file it read with the block at the top swapped, not the
       result of taking the body apart and putting it back. A
       serializer round trip would renormalise the whole file, and a
       diff covering the whole file cannot be reviewed, which is the
       premise of the workflow. */
    expect(fake.branches()).toEqual(['cms/blog/hello', 'main']);
    expect(fake.pulls().length).toBe(1);
    expect(fake.history('cms/blog/hello').length).toBe(2);

    const saved = fake.read('content/blog/hello.md', 'cms/blog/hello');
    expect(saved.startsWith('---\ntitle: Goodbye\n---\n')).toBe(true);
    const bodyOf = text => text.slice(text.indexOf('---', 3) + 3);
    expect(bodyOf(saved)).toBe(bodyOf(SEED));
    const added = saved.split('\n').filter(
        line => line && !SEED.split('\n').includes(line));
    expect(added).toEqual(['title: Goodbye']);

    expect(errors).toEqual([]);
    expect(logged).toEqual([]);
});

test('the Edit link carries this tab\'s token to the site\'s own page',
     async ({page}) => {
    /* The join between the two built artifacts, and the only place it
       can be proved: `dist/shell.js` writes the fragment and
       `dist/edit.js` reads it, from two separate Rollup invocations that
       share nothing but `src/auth/handoff.ts`. A rename on one side is a
       link that opens a page which says "sign in through the admin
       screens in this tab" -- in a tab that is not this one.

       `/admin` and the site's page are different browsing contexts, so
       `sessionStorage` does not cross; a draft's page is a deploy
       preview, so the ORIGIN does not either. */
    await serveGitHub(page);
    await page.route('**/blog/hello/**', route => route.fulfill({
        status: 200, contentType: 'text/html', body: '<p>the post</p>'
    }));

    await page.goto(PAGE);
    await shell(page).locator('.ct-cms__input').fill(TOKEN);
    await shell(page).locator('.ct-cms__gate-form button').click();
    await shell(page).locator('.ct-cms__nav-link').first().click();
    await shell(page).locator('.ct-cms__entry-link').first().click();

    /* The HREF carries the flag and no secret: it is what gets copied
       out of a context menu and middle-clicked into somebody else's
       tab. The token rides the click instead. */
    await expect(shell(page).locator('.ct-cms__entry-edit'))
        .toHaveAttribute('href', '/blog/hello/?cms-edit');

    const [opened] = await Promise.all([
        page.waitForEvent('popup'),
        shell(page).locator('.ct-cms__entry-edit').click()
    ]);
    await opened.waitForLoadState('domcontentloaded');

    const url = new URL(opened.url());
    expect(url.pathname + url.search).toBe('/blog/hello/?cms-edit');
    const handed = Object.fromEntries(new URLSearchParams(url.hash.slice(1)));
    expect(handed['cms-token']).toBe(TOKEN);
    expect(handed['cms-key']).toBe('content-tools:github-token');
    await opened.close();
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

    /* What Create produces since M6-3 is a STUB: the name, the
       collection's fields, and no words. The words are written on the
       site's own page, which is a deploy preview, which is built for a
       pull request -- so the file has to exist before it can hold
       anything. */
    await expect(shell(page).locator('#ct-field-title')).toHaveValue('');
    // Nothing is committed by naming it.
    expect(fake.branches()).toEqual(['main']);

    await shell(page).locator('#ct-field-title').fill('First post.');
    await shell(page).locator('.ct-cms__entry-submit').click();
    await expect(shell(page).locator('.ct-cms__entry-pull')).toContainText('Pull request');

    expect(fake.branches()).toEqual(['cms/blog/hello-world', 'main']);
    expect(fake.pulls().length).toBe(1);
    expect(fake.read('content/blog/hello-world.md', 'cms/blog/hello-world'))
        .toBe('---\ntitle: First post.\n---\n');
    /* The address bar caught up with the entry, in place -- the form
       the person is still looking at was not torn down to do it. */
    expect(new URL(page.url()).hash).toBe('#/c/blog/e/hello-world');
    /* And the link to write the words in is live now, on the entry's
       own preview rather than the published page: the post does not
       exist on the live site until somebody merges. */
    await expect(shell(page).locator('.ct-cms__entry-edit'))
        .toHaveAttribute('href', /deploy-preview-1--.*\/blog\/hello-world\/\?cms-edit$/);

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
    // The entry has arrived when its form is holding the file's values.
    await expect(shell(page).locator('#ct-field-title')).toHaveValue('Hello');

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

test('the media folder falls back to an authenticated read', async ({page}) => {
    /* The one path in the media library that no source test can check
       end to end: the PUBLIC URL is tried first, and here it genuinely
       404s -- `/images/cat.png` is not on the dev server -- so the tile
       falls back to a blob read over the real `fetch` and decodes real
       PNG bytes into an object URL. A source test serves both from data
       URLs and so proves nothing about the bytes surviving the wire.

       Insert went with the editor in M6-3, so what this asserts is the
       tile rather than the button: a picture goes into an entry where
       the entry's words are, which is the site's own page. */
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));
    const logged = collectConsoleErrors(page);

    const fake = await serveGitHub(page);
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
    // Read-only: there is no Insert button anywhere on this screen.
    await expect(shell(page).locator('.ct-cms__media-insert')).toHaveCount(0);

    /* The wait IS the assertion: the public URL fails, the blob read
       answers, the bytes decode, and only then does the tile have a
       natural size -- in that order, over the real network stack. */
    const thumb = shell(page).locator('.ct-cms__media-thumb').first();
    await expect.poll(
        () => thumb.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    expect(fake.requests.some(([method, path]) =>
        method === 'GET' && path.includes('/git/blobs/'))).toBe(true);
    // And the failure note stayed down, because nothing failed in the end.
    await expect(shell(page).locator('.ct-cms__media-note')).toBeHidden();

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

test('the shadow root is open, and holds no editor of any kind',
     async ({page}) => {
    await page.goto(PAGE);

    /* The M6-3 claim, asserted of the BUILT artifact, which is the only
       place it can be asserted at all: every source browser spec loads
       the whole library through `setup-globals.js`, so
       `<content-tools-editor>` is a registered custom element there
       whatever the shell imports.

       Three ways of being wrong, three checks. The tag must not be
       REGISTERED from this bundle -- registering it is how a shell that
       still reached `src/element/` would present. There must be no
       `<slot>`, because the frame used to carry one for the editor and
       a slot with nothing to land in is dead markup. And the host's
       light DOM must be empty, because that is where an editor would
       have gone. Any of the three coming back means the editor has
       found its way back into /admin, where it would hold the
       one-per-page `EditorApp` lease and stop the site's own pages
       booting one. */
    const found = await page.evaluate(() => {
        const cms = document.querySelector('content-tools-cms');
        return {
            editorTag: Boolean(customElements.get('content-tools-editor')),
            slots: [...cms.shadowRoot.querySelectorAll('slot')].map(s => s.name),
            lightChildren: cms.childNodes.length
        };
    });
    expect(found).toEqual({editorTag: false, slots: [], lightChildren: 0});
});

test('the content stylesheet is NOT linked, because nothing here is editable',
     async ({page}) => {
    await page.goto(PAGE);

    /* The inverse of an assertion this file carried from M5-0 to M6-3,
       and it is worth keeping rather than deleting. `/admin` had the
       editable content in its own document, so the content sheet had to
       be linked there; it does not any more, and a `<link>` left behind
       is a request every author pays for rules that style nothing.

       `.ce-element--empty::after` rather than the tag, for the same
       reason the positive version used it: the tag being absent is not
       the claim, the rules not being in effect is, and a renamed
       artifact would pass one and fail the other. The rules DO still
       ship and are still linked -- by `src/edit/index.ts`, on the
       site's own pages, which is the only place they can work. */
    const placeholder = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.className = 'ce-element ce-element--empty';
        document.body.appendChild(probe);
        const content = getComputedStyle(probe, '::after').content;
        probe.remove();
        return content;
    });
    expect(placeholder).not.toBe('"..."');
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
