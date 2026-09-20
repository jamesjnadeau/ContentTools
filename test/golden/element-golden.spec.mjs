import {test, expect} from '@playwright/test';

/* The equivalence proof for the whole web-component layer.
 *
 * `golden.spec.mjs` records what the imperative `EditorApp.get().init(...)`
 * integration DOES, against frozen snapshots. This suite runs the same
 * scenarios a second time through `<content-tools-editor>` and compares the
 * two pages to EACH OTHER, live, in the same test.
 *
 * Comparing pages rather than re-recording snapshots is deliberate:
 *
 *   - A second set of snapshot files would have to be regenerated whenever
 *     the first legitimately changes, and nothing would notice if the two
 *     drifted apart. A direct comparison cannot drift.
 *   - It runs on all three engines without a snapshot per engine, which
 *     matters because snapshots of serialized chrome are not portable
 *     between Chromium, Firefox and WebKit -- but EQUALITY between two pages
 *     on the same engine is.
 *
 * The observation code is shared (fixtures/driver-core.js), so a difference
 * the scenarios see is a difference in the element, not in the driver.
 *
 * Three engines is the point of this file as much as the equivalence is:
 * `ShadowRootContext.getRange()` has three branches and each engine takes a
 * different one, so a Chromium-only run proves nothing about the other two.
 */

const IMPERATIVE_BUNDLE = process.env.CT_BUNDLE || '/dist/content-tools.js';
const IMPERATIVE = '/test/golden/fixtures/page.html?bundle='
    + encodeURIComponent(IMPERATIVE_BUNDLE);
const ELEMENT = '/test/golden/fixtures/element-page.html';

/* The scenarios, in the order golden.spec.mjs runs them. `act` runs in the
   page; whatever it returns is compared too, which is how the scenarios with
   a bespoke observation (the empty region's placeholder) stay uniform. */
const SCENARIOS = [
    {
        name: 'regions are discovered with the expected names and order',
        act: () => { window.__ct.start(); }
    },
    {
        name: 'the full tool shelf is registered',
        // The 21 tools are in every blob; this scenario is the one that only
        // asserts them, so it does nothing else.
        act: () => {}
    },
    {
        name: 'no-op save returns no regions',
        act: () => { window.__ct.start(); window.__ct.save(false); }
    },
    {
        name: 'editing one region returns only that region',
        act: () => {
            window.__ct.start();
            window.__ct.setText('body', 0, 'Edited by-line');
            window.__ct.save(false);
        }
    },
    {
        name: 'editing a heading fixture',
        act: () => {
            window.__ct.start();
            window.__ct.setText('title', 0, 'A new title');
            window.__ct.save(false);
        }
    },
    {
        name: 'editing a link fixture',
        act: () => {
            window.__ct.start();
            window.__ct.setText('link', 0, 'Replacement link text');
            window.__ct.save(false);
        }
    },
    {
        name: 'passive save leaves the DOM editable',
        act: () => {
            window.__ct.start();
            window.__ct.setText('sidebar', 0, 'Passive edit');
            window.__ct.save(true);
        }
    },
    {
        name: 'empty region round-trips without leaking its placeholder',
        act: () => {
            window.__ct.start();
            const placeholder = window.__ct.regionChildren('empty');
            window.__ct.setText('empty', 0, 'now it has content');
            window.__ct.save(false);
            return placeholder;
        }
    },
    {
        name: 'an untouched empty region is never reported as changed',
        act: () => {
            window.__ct.start();
            window.__ct.setText('sidebar', 0, 'only the sidebar changed');
            window.__ct.save(false);
        }
    },
    {
        name: 'bold and italic via the tool shelf',
        act: () => {
            window.__ct.start();
            window.__ct.focusRegion('body', 5);
            window.__ct.selectRange(0, 5);
            window.__ct.applyTool('bold');
            window.__ct.selectRange(6, 11);
            window.__ct.applyTool('italic');
            window.__ct.save(false);
        }
    },
    {
        name: 'revert restores the initial snapshot',
        // revert() prompts through window.confirm; run() accepts it.
        act: () => {
            window.__ct.start();
            window.__ct.setText('body', 0, 'This should be discarded');
            window.__ct.revert();
        }
    },
    {
        name: 'lifecycle event ordering',
        act: () => {
            window.__ct.start();
            window.__ct.setText('body', 0, 'x');
            window.__ct.stop(true);
        }
    },
    {
        name: 'IMAGE_UPLOADER assignment is honoured',
        opts: {imageUploader: true},
        act: () => {}
    },
    {
        name: 'StylePalette.add is honoured',
        opts: {stylePalette: true},
        act: () => {}
    },
    {
        name: 'a caret placed through the seam reads back through the seam',
        /* The selection round trip: select() writes with setBaseAndExtent,
           query() reads with getRange(). On the element page the read is the
           three-branch shadow chain and the write crosses into light DOM;
           on the imperative page both are the document implementation. The
           same four numbers either way is the whole claim. */
        act: () => {
            window.__ct.start();
            window.__ct.focusRegion('body', 5);
            window.__ct.selectRange(3, 7);
            const span = window.__ct.querySelection();
            window.__ct.selectRange(4, 4);
            return {span, collapsed: window.__ct.querySelection()};
        }
    },
    {
        name: 'a collapsed caret can be measured',
        act: () => {
            window.__ct.start();
            return window.__ct.measureCaret('body', 5, 4);
        }
    },
    {
        name: 'the drag helper lands in the document and the body class cycles',
        act: () => {
            window.__ct.start();
            return window.__ct.dragProbe('body', 5);
        }
    }
];

/** Everything observable, as one comparable blob. */
function observe() {
    return {
        events: window.__ct.eventLog(),
        saved: window.__ct.savedPayloads(),
        savedRegionNames: window.__ct.savedRegionNames(),
        regions: window.__ct.regionNames(),
        orderedRegions: window.__ct.orderedRegionNames(),
        chrome: window.__ct.chrome(),
        content: window.__ct.contentHTML(),
        tools: window.__ct.toolNames(),
        uploaderCalls: window.__ct.uploaderCalls(),
        imageUploader: window.__ct.imageUploaderType(),
        stylePalette: window.__ct.stylePaletteNames()
    };
}

/* Every widget adds `ct-widget--active` behind a 100 ms setTimeout, so that
   its CSS transition actually runs (src/scripts/ui/ui.ts:294). A chrome
   serialization taken immediately after an action therefore records a race
   rather than a state -- and the two pages do not boot at the same moment:
   the element boots during page load, the imperative page when the test
   calls init(). Waiting out the timer is what makes the comparison about the
   element instead of about the clock. */
const FADE_MS = 100;
const settle = page => page.waitForTimeout(FADE_MS * 3);

/** Boot a page, run one scenario on it, and report everything observable. */
async function run(page, url, scenario) {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', d => d.accept());

    /* The fixture embeds a YouTube iframe, and ContentEdit reads only its
       `src` to build a video element -- so actually fetching it buys nothing
       and costs the suite a network dependency. It also costs correctness:
       WebKit reports the loaded frame's Fullscreen permission-policy check
       as an uncaught page error, which would read here as the imperative
       page throwing. Blocking it makes the run hermetic and quiet. */
    await page.route('**://www.youtube.com/**', route => route.abort());

    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.__ct));
    await page.evaluate(o => window.__ct.init(o), scenario.opts || {});
    await settle(page);
    const result = (await page.evaluate(scenario.act)) ?? null;
    await settle(page);
    const observed = await page.evaluate(observe);
    return {errors, blob: {result, ...observed}};
}

test.describe('element-driven === imperative', () => {

    test('the two fixtures carry the same markup', async ({page}) => {
        /* The equivalence below is only worth what this is worth: two pages
           that disagree about their own content prove nothing about the
           element. Compared raw, not normalised, so a drift fails here with
           a readable diff instead of somewhere downstream. */
        const read = async url => {
            await page.goto(url);
            return page.evaluate(() => document.querySelector('.article').outerHTML);
        };
        expect(await read(ELEMENT)).toBe(await read(IMPERATIVE));
    });

    for (const scenario of SCENARIOS) {
        test(scenario.name, async ({browser}) => {
            /* A context each, because both pages share an origin and the
               toolbox persists its position to localStorage -- one page
               would otherwise inherit the other's chrome geometry. The
               viewport is set explicitly: a hand-made context does not pick
               up the project's `use`, and chrome position and wrapping
               depend on it. */
            const contexts = await Promise.all([1, 2].map(
                () => browser.newContext({viewport: {width: 1280, height: 900}})));
            try {
                const [imperative, element] = await Promise.all(
                    contexts.map(c => c.newPage()));
                const [a, b] = await Promise.all([
                    run(imperative, IMPERATIVE, scenario),
                    run(element, ELEMENT, scenario)
                ]);
                expect(a.errors, 'imperative page threw').toEqual([]);
                expect(b.errors, 'element page threw').toEqual([]);
                expect(b.blob).toEqual(a.blob);
            } finally {
                await Promise.all(contexts.map(c => c.close()));
            }
        });
    }
});

test.describe('the element on its own terms', () => {

    test('the chrome is in the shadow root and nowhere else', async ({page}) => {
        /* The equivalence tests above read the chrome through whichever root
           the page keeps it in, by construction -- so on their own they
           would still pass if the element mounted into document.body. */
        await page.goto(ELEMENT);
        await page.waitForFunction(() => Boolean(window.__ct));
        const counts = await page.evaluate(() => {
            window.__ct.init({});
            window.__ct.start();
            const el = document.querySelector('content-tools-editor');
            return {
                shadow: el.shadowRoot.querySelectorAll('.ct-app').length,
                light: document.querySelectorAll('.ct-app').length
            };
        });
        expect(counts).toEqual({shadow: 1, light: 0});
    });

    test('focus descends into the light-DOM content', async ({page}) => {
        /* getActiveElement() walks shadow roots. With the chrome in a shadow
           root and the content outside it, the naive document.activeElement
           is the HOST -- which is what dialogs.ts used to blur. */
        await page.goto(ELEMENT);
        await page.waitForFunction(() => Boolean(window.__ct));
        const focus = await page.evaluate(() => {
            window.__ct.init({});
            window.__ct.start();
            window.__ct.focusRegion('body', 5);
            const el = document.querySelector('content-tools-editor');
            const active = el.rootContext.getActiveElement();
            return {
                tag: active && active.tagName,
                naive: document.activeElement.tagName,
                text: active && active.textContent.slice(0, 9)
            };
        });
        expect(focus.tag).toBe('P');
        expect(focus.text).toBe('The names');
        // Not the host: that is the difference the seam exists for.
        expect(focus.naive).not.toBe('CONTENT-TOOLS-EDITOR');
    });

    test('Mode B reads a selection from inside the shadow root', async ({page}) => {
        /* The only configuration where the content itself is in the shadow
           tree, and therefore the only one that takes branch 1 or 2 of
           getRange() rather than falling through to the document. Mode B is
           an experimental preview, but this branch is not optional -- it is
           the branch Chromium takes for any shadow-hosted content. */
        await page.goto(ELEMENT);
        await page.waitForFunction(() => Boolean(window.__ct));
        const result = await page.evaluate(async () => {
            const el = document.querySelector('content-tools-editor');
            el.setAttribute('content-scope', 'shadow');
            // The reboot runs destroy(), whose no-arg removeEventListener()
            // clears the driver's own bindings, so re-init afterwards.
            window.__ct.init({});
            window.__ct.start();
            window.__ct.focusRegion('body', 5);
            window.__ct.selectRange(2, 9);

            /* Which branch actually answered. Without this the test passes on
               all three engines even if two of them quietly fall through to
               the last one -- and a three-engine CI bill that proves nothing
               about the first two branches is worse than no bill at all.
               Spied from the page, on the platform objects, so the seam keeps
               no test-only instrumentation. */
            const root = el.shadowRoot;
            const branches = [];
            const ownGetSelection = root.getSelection;
            if (ownGetSelection) {
                root.getSelection = function (...args) {
                    branches.push('ShadowRoot.getSelection');
                    return ownGetSelection.apply(this, args);
                };
            }
            const proto = Object.getPrototypeOf(document.getSelection());
            const composed = proto.getComposedRanges;
            if (composed) {
                proto.getComposedRanges = function (...args) {
                    branches.push('Selection.getComposedRanges');
                    return composed.apply(this, args);
                };
            }
            let span;
            try {
                span = window.__ct.querySelection();
            } finally {
                if (ownGetSelection) { delete root.getSelection; }
                if (composed) { proto.getComposedRanges = composed; }
            }

            return {
                span,
                branches,
                has: {
                    rootGetSelection: Boolean(ownGetSelection),
                    composedRanges: Boolean(composed)
                },
                inShadow: Boolean(root.querySelector('[data-name="body"]')),
                inLight: Boolean(document.querySelector('.article__content'))
            };
        });

        expect(result.inShadow).toBe(true);
        expect(result.inLight).toBe(false);
        // The answer, first: every engine must get the same four numbers.
        expect(result.span).toEqual([2, 9]);

        // And then WHICH branch produced it, which is what differs per engine.
        if (result.has.rootGetSelection) {
            expect(result.branches[0]).toBe('ShadowRoot.getSelection');
        } else if (result.has.composedRanges) {
            expect(result.branches).toEqual(['Selection.getComposedRanges']);
        } else {
            // Firefox: neither API, and its document selection does not
            // retarget, so the third branch is both the fallback and correct.
            expect(result.branches).toEqual([]);
        }
    });
});
