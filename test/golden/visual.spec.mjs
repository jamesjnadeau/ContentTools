import {test, expect} from '@playwright/test';

/* Visual regression for the Bourbon removal.

   Dropping ~55 vendor-prefix mixins is not observable in the golden master --
   it only affects rendering. Screenshots are the only check that actually
   catches it, so this suite renders identical DOM under the legacy stylesheet
   and the rebuilt one.

   Generate baselines with the LEGACY css, then run against the NEW css:
     CT_CSS=/build/content-tools.min.css npx playwright test visual --update-snapshots
     CT_CSS=/dist/content-tools.css      npx playwright test visual          */

const CSS = process.env.CT_CSS || '/build/content-tools.min.css';
const PAGE = `/test/golden/fixtures/page.html`
    + `?bundle=${encodeURIComponent('/test/golden/legacy-bundle.js')}`
    + `&css=${encodeURIComponent(CSS)}`;

async function boot(page) {
    await page.goto(PAGE);
    await page.waitForFunction(() => window.__ct && window.ContentTools);
    await page.evaluate(() => window.__ct.init({stylePalette: true, imageUploader: true}));
    await page.evaluate(() => window.__ct.start());
    // Animations are disabled in the fixture; wait for fonts so icon glyphs
    // render rather than tofu (the shadow-DOM @font-face trap's cousin).
    await page.evaluate(() => document.fonts.ready);
}

/* Screenshot options shared by every case. `animations: 'disabled'` is belt and
   braces on top of the fixture's own CSS override. */
const SHOT = {animations: 'disabled', caret: 'hide'};

test.describe('visual regression', () => {

    test('ignition switch', async ({page}) => {
        await boot(page);
        // .ct-ignition is a 0x0 container -- its buttons are absolutely
        // positioned, so screenshot the visible one.
        await expect(page.locator('.ct-ignition__button--edit'))
            .toHaveScreenshot('ignition.png', SHOT);
    });

    test('toolbox', async ({page}) => {
        await boot(page);
        await expect(page.locator('.ct-toolbox')).toHaveScreenshot('toolbox.png', SHOT);
    });

    test('inspector', async ({page}) => {
        await boot(page);
        await page.evaluate(() => window.__ct.focusRegion('body', 0));
        await expect(page.locator('.ct-inspector')).toHaveScreenshot('inspector.png', SHOT);
    });

    test('whole editing surface', async ({page}) => {
        await boot(page);
        await expect(page).toHaveScreenshot('surface.png', {...SHOT, fullPage: true});
    });

    test('icon glyphs render (font-face reaches the toolbox)', async ({page}) => {
        await boot(page);
        // A tofu box and a real glyph differ in advance width; assert the
        // icon font actually loaded rather than trusting the screenshot alone.
        const loaded = await page.evaluate(async () => {
            // check() reports false until the face is actually requested.
            await document.fonts.load('16px icon');
            return document.fonts.check('16px icon');
        });
        expect(loaded).toBe(true);
    });
});
