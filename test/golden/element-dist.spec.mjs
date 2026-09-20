import {expect, test} from '@playwright/test';

/* A smoke test against the BUILT dist/element.js.
 *
 * Everything else about the element is tested against source, which cannot
 * see the two failures that only exist in an artifact: the tag registration
 * being tree-shaken away, and the two ESM entries carrying separate copies
 * of the library and therefore separate singletons. Both are silent -- no
 * error, no stack, just an element that does nothing -- which is the exact
 * shape of the IIFE export regression this suite was extended for.
 */

const PAGE = '/test/golden/fixtures/element-smoke.html';

test.beforeEach(async ({page}) => {
    await page.goto(PAGE);
    await page.waitForFunction(
        () => customElements.get('content-tools-editor') !== undefined);
});

test('the tag registers and the element boots', async ({page}) => {
    const state = await page.locator('content-tools-editor').getAttribute('state');
    expect(state).toBe('ready');

    // The chrome is in the shadow root and nowhere else.
    const counts = await page.evaluate(() => {
        const el = document.querySelector('content-tools-editor');
        return {
            shadow: el.shadowRoot.querySelectorAll('.ct-app').length,
            light: document.querySelectorAll('.ct-app').length,
            regions: el.editorApp.domRegions().length
        };
    });
    expect(counts).toEqual({shadow: 1, light: 0, regions: 2});
});

test('the chrome stylesheet is adopted and applies', async ({page}) => {
    // No <link> to content-tools.css on this page at all: if the adopted
    // sheet were missing or empty, the chrome would render unstyled and
    // every DOM assertion above would still pass.
    const position = await page.evaluate(() => {
        const el = document.querySelector('content-tools-editor');
        const ignition = el.shadowRoot.querySelector('.ct-ignition');
        return getComputedStyle(ignition).position;
    });
    expect(position).toBe('fixed');
});

test('the icon font reaches the document and renders glyphs', async ({page}) => {
    /* The tofu trap. @font-face inside a shadow root is ignored by Chromium
       and WebKit, so the element registers the face on the DOCUMENT; the
       page links no font of its own, so this passes only if that worked.
       Measured as well as checked, because fonts.check() answers true
       vacuously for a family with no registered face. */
    const result = await page.evaluate(async () => {
        await document.fonts.load('16px icon');
        const span = document.createElement('span');
        span.textContent = '';
        span.style.cssText = 'position:absolute;font-size:64px;font-family:icon';
        document.body.appendChild(span);
        const icon = span.getBoundingClientRect().width;
        span.style.fontFamily = 'ct-no-such-family';
        const fallback = span.getBoundingClientRect().width;
        span.remove();
        return {
            registered: [...document.fonts].some(
                f => String(f.family).replace(/['"]/g, '') === 'icon'),
            loaded: document.fonts.check('16px icon'),
            icon,
            fallback
        };
    });
    expect(result.registered).toBe(true);
    expect(result.loaded).toBe(true);
    expect(result.icon).toBeGreaterThan(0);
    expect(result.icon).not.toBe(result.fallback);
});

test('there is exactly ONE copy of the library', async ({page}) => {
    /* Two entries built separately would each carry their own
       ContentTools, and the element would drive a different EditorApp
       singleton from the one a consumer imported. Nothing about that is
       observable except by identity. */
    const same = await page.evaluate(async () => {
        const lib = await import('/dist/index.js');
        const el = document.querySelector('content-tools-editor');
        return el.editorApp === lib.ContentTools.EditorApp.get();
    });
    expect(same).toBe(true);
});

test('the editor starts, saves and stops', async ({page}) => {
    /* Typed through the browser rather than written into the DOM, because
       save() returns only the regions ContentEdit has seen CHANGE -- a
       textContent assignment behind its back comes back as no change at
       all. Typing also puts a caret in a light-DOM child while the context
       is shadow-backed, which is the Mode A selection path end to end. */
    await page.evaluate(() => {
        const el = document.querySelector('content-tools-editor');
        window.__saved = new Promise(resolve => {
            el.addEventListener('ct-saved', ev => resolve(ev.detail), {once: true});
        });
        el.start();
    });

    await page.locator('content-tools-editor [data-name="body"] p').first().click();
    await page.keyboard.type('EDITED ');

    const saved = await page.evaluate(async () => {
        document.querySelector('content-tools-editor').stop(true);
        return window.__saved;
    });
    expect(saved.regions.body).toContain('EDITED');
});

test('ct-* events escape the shadow boundary', async ({page}) => {
    // `composed: true` is the entire consumer contract; without it every
    // listener above the element silently never fires.
    const seen = await page.evaluate(() => {
        const el = document.querySelector('content-tools-editor');
        const names = [];
        for (const name of ['ct-start', 'ct-started', 'ct-stop', 'ct-stopped']) {
            document.addEventListener(name, () => names.push(name));
        }
        el.start();
        el.stop(true);
        return names;
    });
    expect(seen).toEqual(['ct-start', 'ct-started', 'ct-stop', 'ct-stopped']);
});
