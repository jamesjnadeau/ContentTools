import {expect, test} from '@playwright/test';

/* A smoke test against the BUILT dist/markdown.js, through the playground.
 *
 * `markdown.js` is a fourth published entry with seven runtime dependencies
 * behind it, and everything else about it is tested against source. Two
 * failures live only in the artifact: the entry not resolving its own
 * dependencies once bundled, and `rootContext()` arriving as a SECOND copy
 * because the markdown entry fell out of the chunk `index` and `element`
 * share -- which would give `fromHTML()` a sandbox document from a root
 * context the editor knows nothing about. Both are silent.
 *
 * Driving it through `playground/markdown.html` rather than a fixture of
 * its own is deliberate: a playground page that nobody runs is a page that
 * has quietly stopped working, and this is the same set of assertions
 * either way.
 */

const PAGE = '/playground/markdown.html';

/** The output pane's text, and which of its lines are marked changed. */
async function output(page) {
    return page.evaluate(() => {
        const lines = [...document.querySelectorAll('#out span')];
        return {
            text: lines.map(line => line.textContent).join('\n'),
            changed: lines
                .map((line, i) => (line.className === 'changed' ? i + 1 : 0))
                .filter(Boolean)
        };
    });
}

test.beforeEach(async ({page}) => {
    await page.goto(PAGE);
    await page.waitForFunction(
        () => document.querySelector('content-tools-editor')?.state === 'ready');
});

test('the page boots the editor in markdown mode', async ({page}) => {
    const state = await page.evaluate(() => {
        const el = document.querySelector('content-tools-editor');
        return {
            profile: el.editorApp.profile().name,
            tools: el.editorApp.toolbox().tools().flat().length,
            // `regions()` is empty until start(); `domRegions()` is what
            // init() found.
            regions: el.editorApp.domRegions().length
        };
    });
    expect(state).toEqual({profile: 'markdown', tools: 17, regions: 1});
});

test('the built markdown entry shares the library, not a copy of it', async ({page}) => {
    /* `fromHTML()` parses through `rootContext().createSandboxDocument()`,
       and `rootContext` is a module-level singleton. A duplicated module
       graph would hand it a DIFFERENT singleton from the one the element
       installed -- no error, just a sandbox document belonging to nobody.
       Asserted through the seam rather than by identity, because the
       markdown entry does not re-export `rootContext` and should not:
       what matters is that a context set on one side is seen on the
       other. */
    const shared = await page.evaluate(async () => {
        const [markdown, index] = await Promise.all([
            import('/dist/markdown.js'), import('/dist/index.js')
        ]);
        const real = index.rootContext();
        let calls = 0;
        index.setRootContext(Object.create(real, {
            createSandboxDocument: {
                value: () => {
                    calls += 1;
                    return real.createSandboxDocument();
                }
            }
        }));
        try {
            markdown.fromHTML('<p>x</p>');
        } finally {
            index.setRootContext(real);
        }
        return calls;
    });
    expect(shared).toBe(1);
});

test('a save with no edits changes nothing', async ({page}) => {
    await page.locator('#start').click();
    await page.locator('#stop').click();

    const {text, changed} = await output(page);
    expect(changed).toEqual([]);
    // Not merely "no line is marked" -- the pane really holds the file.
    expect(text).toContain('# A post');
});

test('editing one paragraph changes one line', async ({page}) => {
    await page.locator('#start').click();

    // Type into the first paragraph the way a user would.
    const paragraph = page.locator('[data-ct-md="1"]');
    await paragraph.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Replaced.');

    await page.locator('#stop').click();

    const {changed, text} = await output(page);
    expect(changed).toHaveLength(1);
    expect(text.split('\n')[changed[0] - 1]).toBe('Replaced.');
});

test('a shortcode file is read-only and survives untouched', async ({page}) => {
    await page.selectOption('#file', 'shortcodes.md');
    await page.waitForFunction(
        () => document.querySelector('#status').textContent.includes('shortcodes.md'));

    await page.locator('#start').click();
    const readOnly = await page.evaluate(() => {
        const el = document.querySelector('content-tools-editor');
        return el.editorApp.regions().body.children
            .filter(child => child.type() === 'Static')
            .map(child => child.can('drag'));
    });
    expect(readOnly).toEqual([false, false, false, false]);

    await page.locator('#stop').click();
    expect((await output(page)).changed).toEqual([]);
});
