import {test, expect} from '@playwright/test';

/* Characterisation ("golden master") suite.

   These tests assert nothing about what the editor SHOULD do. They record what
   v1.6.16 DOES do, so that every step of the CoffeeScript -> TypeScript port can
   be diffed against it. A failure here means behaviour changed; whether that is
   a bug or an intended change is a judgement call, but it must never pass
   unnoticed.

   The bundle under test is parameterised via ?bundle=, so the identical
   scenarios run against the frozen legacy build and against any later build. */

const BUNDLE = process.env.CT_BUNDLE || '/test/golden/legacy-bundle.js';
const PAGE = `/test/golden/fixtures/page.html?bundle=${encodeURIComponent(BUNDLE)}`;

/** Boot the fixture and initialise the editor. */
async function boot(page, opts = {}) {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(PAGE);
    await page.waitForFunction(() => window.__ct && window.ContentTools);
    await page.evaluate(o => window.__ct.init(o), opts);
    return errors;
}

/** Everything observable, as one comparable blob. */
async function snapshot(page) {
    return page.evaluate(() => ({
        events: window.__ct.eventLog(),
        saved: window.__ct.savedPayloads(),
        savedRegionNames: window.__ct.savedRegionNames(),
        regions: window.__ct.regionNames(),
        orderedRegions: window.__ct.orderedRegionNames(),
        chrome: window.__ct.chrome(),
        content: window.__ct.contentHTML()
    }));
}

function asSnapshot(value) {
    return JSON.stringify(value, null, 2);
}

test.describe('golden master (v1.6.16)', () => {

    test('the bundle installs the five browser globals', async ({page}) => {
        /* The script-tag contract, asserted against whichever bundle is under
           test -- which is the point, since it has to hold for both.

           This exists because it once did not. Vite builds src/global.ts as
           `var ContentTools = (function(exports){...})({})`, so an entry with
           exports had its outer assignment overwrite the window.ContentTools
           the body had just set, leaving the ESM namespace object there
           instead. Every `ContentTools.EditorApp` read undefined.

           Nothing caught it: the unit suite loads the SOURCE (for coverage
           attribution), and the default golden run loads the frozen legacy
           bundle. Only the run against the current build sees it, so the
           assertion lives here. */
        await page.goto(PAGE);
        await page.waitForFunction(() => window.ContentTools);
        const shape = await page.evaluate(() => ({
            globals: ['FSM', 'HTMLString', 'ContentSelect', 'ContentEdit', 'ContentTools']
                .filter(name => window[name] !== undefined),
            // The members a consumer actually reaches for, one per namespace.
            editorApp: typeof window.ContentTools.EditorApp,
            toolShelf: typeof window.ContentTools.ToolShelf,
            flashUI: typeof window.ContentTools.FlashUI,
            ceRoot: typeof window.ContentEdit.Root,
            csRange: typeof window.ContentSelect.Range,
            hsString: typeof window.HTMLString.String
        }));
        expect(shape).toEqual({
            globals: ['FSM', 'HTMLString', 'ContentSelect', 'ContentEdit', 'ContentTools'],
            editorApp: 'function',
            toolShelf: 'function',
            flashUI: 'function',
            ceRoot: 'function',
            csRange: 'function',
            hsString: 'function'
        });
    });

    test('regions are discovered with the expected names and order', async ({page}) => {
        const errors = await boot(page);
        expect(errors).toEqual([]);
        // regions() is populated by _initRegions(), which start() calls --
        // querying before start() silently returns {} and asserts nothing.
        const shape = await page.evaluate(() => {
            window.__ct.start();
            return {
                regions: window.__ct.regionNames(),
                ordered: window.__ct.orderedRegionNames()
            };
        });
        expect(shape.regions.length).toBeGreaterThan(0);
        expect(asSnapshot(shape)).toMatchSnapshot('regions.json');
    });

    test('the full tool shelf is registered', async ({page}) => {
        await boot(page);
        const tools = await page.evaluate(() => window.__ct.toolNames());
        // v1.6.16 registers exactly 21 tools via side-effecting ToolShelf.stow()
        // calls in class bodies. This count is the tree-shaking canary.
        expect(tools).toHaveLength(21);
        // Guards the ESM side-effect-registration trap: if tree-shaking ever
        // drops a ToolShelf.stow() call, this is where it surfaces.
        expect(asSnapshot(tools)).toMatchSnapshot('tools.json');
    });

    test('no-op save returns no regions', async ({page}) => {
        await boot(page);
        await page.evaluate(() => { window.__ct.start(); window.__ct.save(false); });
        expect(asSnapshot(await snapshot(page))).toMatchSnapshot('save-noop.json');
    });

    test('editing one region returns only that region', async ({page}) => {
        await boot(page);
        await page.evaluate(() => {
            window.__ct.start();
            window.__ct.setText('body', 0, 'Edited by-line');
            window.__ct.save(false);
        });
        // The contract the CMS depends on: changed regions only.
        expect(await page.evaluate(() => window.__ct.savedRegionNames()))
            .toEqual([['body']]);
        expect(asSnapshot(await snapshot(page))).toMatchSnapshot('save-one-region.json');
    });

    test('editing a heading fixture', async ({page}) => {
        await boot(page);
        await page.evaluate(() => {
            window.__ct.start();
            window.__ct.setText('title', 0, 'A new title');
            window.__ct.save(false);
        });
        expect(asSnapshot(await snapshot(page))).toMatchSnapshot('save-fixture-heading.json');
    });

    test('editing a link fixture', async ({page}) => {
        await boot(page);
        await page.evaluate(() => {
            window.__ct.start();
            window.__ct.setText('link', 0, 'Replacement link text');
            window.__ct.save(false);
        });
        expect(asSnapshot(await snapshot(page))).toMatchSnapshot('save-fixture-link.json');
    });

    test('passive save leaves the DOM editable', async ({page}) => {
        await boot(page);
        await page.evaluate(() => {
            window.__ct.start();
            window.__ct.setText('sidebar', 0, 'Passive edit');
            window.__ct.save(true);
        });
        expect(asSnapshot(await snapshot(page))).toMatchSnapshot('save-passive.json');
    });

    test('empty region round-trips without leaking its placeholder', async ({page}) => {
        // Starting the editor injects a placeholder <p> into an empty region so
        // it is clickable. That placeholder must not end up in the saved output.
        await boot(page);
        const result = await page.evaluate(() => {
            window.__ct.start();
            const region = window.__ct.regionChildren('empty');
            window.__ct.setText('empty', 0, 'now it has content');
            window.__ct.save(false);
            return {placeholderChildren: region, saved: window.__ct.savedPayloads()};
        });
        expect(asSnapshot(result)).toMatchSnapshot('save-empty-region.json');
    });

    test('an untouched empty region is never reported as changed', async ({page}) => {
        await boot(page);
        const names = await page.evaluate(() => {
            window.__ct.start();
            window.__ct.setText('sidebar', 0, 'only the sidebar changed');
            window.__ct.save(false);
            return window.__ct.savedRegionNames();
        });
        expect(names).toEqual([['sidebar']]);
    });

    test('bold and italic via the tool shelf', async ({page}) => {
        await boot(page);
        await page.evaluate(() => {
            window.__ct.start();
            window.__ct.focusRegion('body', 5);
            window.__ct.selectRange(0, 5);
            window.__ct.applyTool('bold');
            window.__ct.selectRange(6, 11);
            window.__ct.applyTool('italic');
            window.__ct.save(false);
        });
        expect(asSnapshot(await snapshot(page))).toMatchSnapshot('tool-bold-italic.json');
    });

    test('revert restores the initial snapshot', async ({page}) => {
        await boot(page);
        await page.evaluate(() => {
            window.__ct.start();
            window.__ct.setText('body', 0, 'This should be discarded');
        });
        // revert() prompts via window.confirm; auto-accept it.
        page.on('dialog', d => d.accept());
        await page.evaluate(() => window.__ct.revert());
        expect(asSnapshot(await snapshot(page))).toMatchSnapshot('revert.json');
    });

    test('lifecycle event ordering', async ({page}) => {
        await boot(page);
        await page.evaluate(() => {
            window.__ct.start();
            window.__ct.setText('body', 0, 'x');
            window.__ct.stop(true);
        });
        expect(await page.evaluate(() => window.__ct.eventLog()))
            .toEqual(['start', 'started', 'stop', 'save', 'saved', 'stopped']);
    });

    test('IMAGE_UPLOADER assignment is honoured', async ({page}) => {
        // Tripwire for the ESM config-mutability trap: consumers assign
        // ContentTools.IMAGE_UPLOADER, which read-only ESM bindings would break.
        const errors = await boot(page, {imageUploader: true});
        expect(errors).toEqual([]);
        const wired = await page.evaluate(() => typeof ContentTools.IMAGE_UPLOADER === 'function');
        expect(wired).toBe(true);
    });

    test('StylePalette.add is honoured', async ({page}) => {
        // Second tripwire for the same trap.
        const errors = await boot(page, {stylePalette: true});
        expect(errors).toEqual([]);
        const styles = await page.evaluate(() =>
            ContentTools.StylePalette.styles(new ContentEdit.Text('p')).map(s => s.name()));
        expect(asSnapshot(styles)).toMatchSnapshot('style-palette.json');
    });
});
