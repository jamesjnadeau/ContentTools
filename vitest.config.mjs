import {defineConfig} from 'vitest/config';

/* The ported ContentEdit and ContentTools suites run in a real browser.
 *
 * They are not unit tests in the jsdom sense: nearly every one constructs real
 * elements, measures them, and drives ContentSelect ranges over contenteditable
 * nodes. jsdom and happy-dom have no selection model and return zero-sized
 * rects, so they would report false passes. */
export default defineConfig({
    test: {
        include: ['test/browser/**/*.spec.js'],
        // The ported specs call describe/it/expect bare, as Jasmine did.
        globals: true,
        setupFiles: ['test/browser/setup-globals.js'],
        browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{
                browser: 'chromium',
                // The image ships Chromium at a fixed path that may not match
                // this Playwright revision; in CI Playwright manages its own.
                launch: process.env.CI
                    ? {}
                    : {executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'}
            }]
        }
    }
});
