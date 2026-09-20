import {defineConfig} from '@playwright/test';

const PORT = 8931;

/* The one suite that is worth running on more than one engine.
 *
 * `ShadowRootContext.getRange()` is a three-branch feature-detected chain and
 * each engine takes a different branch, so a Chromium-only run leaves two
 * thirds of it unexecuted. Everything else here is either snapshot-based --
 * and serialized chrome is not portable between engines -- or a property of
 * the build rather than of the browser, so widening it would buy nothing and
 * cost three sets of snapshots to keep in step. */
const THREE_ENGINE_SPEC = 'element-golden.spec.mjs';

/* Firefox and WebKit have to be installed before they can be launched, which
 * is a real cost and not something a clean clone has paid. CI installs all
 * three; locally they are off by default and `CT_ENGINES` turns them on
 * (`CT_ENGINES=firefox,webkit npm run test:element:golden`).
 *
 * Chromium is not optional and is not read from this list: every other suite
 * here runs only on it, so dropping it would leave them with no project. */
const ENGINES = (process.env.CT_ENGINES
    || (process.env.CI ? 'chromium,firefox,webkit' : 'chromium'))
    .split(',').map(name => name.trim()).filter(Boolean);

export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.mjs',
    // Screenshot comparison needs a small tolerance for font rasterisation.
    expect: {toHaveScreenshot: {maxDiffPixelRatio: 0.002}},
    // The whole point of a characterisation oracle is determinism, so a retry
    // would hide exactly the flakiness we need to know about.
    retries: 0,
    fullyParallel: false,
    workers: 1,
    reporter: process.env.CI ? 'line' : 'list',
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        // Fixed viewport: chrome position and wrapping depend on it.
        viewport: {width: 1280, height: 900}
    },
    webServer: {
        command: 'node test/golden/server.mjs',
        url: `http://127.0.0.1:${PORT}/test/golden/fixtures/page.html`,
        cwd: new URL('../../', import.meta.url).pathname,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                // The image ships Chromium r1194 at a fixed path; @playwright/test
                // may pin a different revision, so point at what is actually here
                // rather than downloading a second copy.
                // In CI, Playwright manages its own browser; locally the image
                // ships Chromium at a fixed path that may not match this
                // @playwright/test revision, so point at what is actually there.
                launchOptions: process.env.CI
                    ? {}
                    : {executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'}
            }
        },
        /* Scoped to the one suite, so `playwright test golden.spec.mjs` still
           runs exactly once even with all three engines enabled. */
        ...['firefox', 'webkit']
            .filter(name => ENGINES.includes(name))
            .map(name => ({name, testMatch: THREE_ENGINE_SPEC, use: {browserName: name}}))
    ]
});
