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
        /* These suites mutate process-wide singletons -- ContentEdit.Root and
           ContentTools.EditorApp are both memoised, and one spec nulls
           window.getComputedStyle outright. Running files concurrently lets
           that state cross between them, which showed up as a merge silently
           doing nothing in a file that passes on its own. */
        isolate: true,
        fileParallelism: false,
        coverage: {
            // istanbul, not v8: the suites exercise the BUILT bundle for its
            // browser globals, and v8 coverage cannot map that back to source.
            provider: 'istanbul',
            include: ['src/scripts/**', 'src/core/**', 'src/element/**'],
            reporter: ['text-summary', 'json-summary'],
            // editor.ts owns the save/region contract the CMS milestones are
            // built on, and had ZERO coverage until Phase 6. It is now at
            // ~69% lines.
            //
            // The target is 80 and this floor is set at what is actually
            // reached, as a ratchet: it prevents regression without leaving
            // a red gate everyone learns to ignore. Raise it as the gap
            // closes. What is still uncovered, and why:
            //   - revertToSnapshot and the deeper history paths
            //   - the delayed shift-to-highlight timer
            //   - the visibilitychange handler, which needs a genuinely
            //     hidden page rather than a dispatched event
            //   - parts of pasteHTML's per-element-type branching
            thresholds: {
                'src/scripts/editor.ts': {lines: 69, statements: 69}
            }
        },
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
