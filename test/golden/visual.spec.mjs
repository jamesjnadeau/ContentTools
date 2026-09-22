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

        /* The toolbox is hidden for THIS shot, and only this one.
         *
         * Its default position deliberately differs between the two sheets
         * this suite compares: the frozen legacy file puts it at 128,128
         * and the rebuilt one puts it in the bottom-right corner, clear of
         * the host page's controls. A frozen file can never be updated to
         * agree, so leaving it in would report a diff for a change made on
         * purpose, for ever -- and the only way to clear that is to
         * regenerate this baseline from the NEW css, which would quietly
         * turn the one shot covering the whole surface into a comparison
         * with itself and bake in whatever rendering regression happened to
         * be present that day.
         *
         * Nothing is lost by hiding it. What this shot is for is the
         * Bourbon removal -- whether the rebuilt sheet RENDERS like the
         * legacy one -- and the toolbox's own rendering is covered at full
         * detail by `toolbox.png` above, which is element-scoped and so
         * does not care where it sits. Its position is a layout
         * requirement about the host page's controls, and that is asserted
         * where it can actually be seen: against the real shell, in
         * `shell-dist.spec.mjs`.
         *
         * `visibility`, not `display`: it keeps the box, so a rule that
         * wrongly made the toolbox affect the flow of the page would still
         * show up here. */
        await page.addStyleTag({content:
            '.ct-widget.ct-toolbox {visibility: hidden !important;}'});

        /* Asserted rather than left to the screenshot, because the
           screenshot cannot see it. The baseline is generated WITH the hide
           in place, so dropping the rule leaves a diff of nothing but the
           toolbox's dark icon glyphs -- its background is `#e9e9e9` at 90%
           over white, which is inside Playwright's per-pixel colour
           threshold -- and ~2000 px of a 1280x1129 image is under the
           0.002 ratio below. So the shot would still pass while quietly
           comparing a surface that has a toolbox against a baseline that
           does not, and spending the whole pixel budget this suite's real
           job needs. */
        await expect(page.locator('.ct-toolbox')).toBeHidden();

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
