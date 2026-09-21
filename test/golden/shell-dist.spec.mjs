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

async function serveGitHub(page) {
    const fake = createFakeGitHub({
        files: {'content/blog/hello.md': SEED, 'content/about.md': '# About\n'}
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
            body: await response.text()
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
    expect(await shell(page).locator('.ct-cms__nav-link').allTextContents())
        .toEqual(['Blog', 'Pages']);

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
    await expect(shell(page).locator('#ct-cms-field-title')).toHaveValue('Hello');
    await expect(shell(page).locator('#ct-cms-field-date')).toHaveValue('');

    // Type into the body, the way a person does.
    const paragraph = editor.locator('[data-editable] p').first();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Again.');

    await shell(page).locator('.ct-cms__entry-view .ct-cms__button').first().click();
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
