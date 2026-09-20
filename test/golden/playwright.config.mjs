import {defineConfig} from '@playwright/test';

const PORT = 8931;

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
    projects: [{
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
    }]
});
