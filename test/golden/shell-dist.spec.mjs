import {expect, test} from '@playwright/test';

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

test('the tag registers and the element upgrades', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`));

    await page.goto(PAGE);

    /* `state` is reflected by connectedCallback, so it is only there once
       the class has been defined AND applied to the parsed element. A
       `dist/shell.js` whose `customElements.define` had been tree-shaken,
       or which threw while evaluating, leaves the tag as an unknown
       element and this never appears. */
    await expect(page.locator('content-tools-cms')).toHaveAttribute('state', 'dormant');

    expect(errors).toEqual([]);
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
