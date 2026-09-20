import {defineConfig} from 'vite';
import {resolve} from 'node:path';

/* Phase 1: Vite owns the stylesheet and asset pipeline. The JS is still
 * CoffeeScript under the shared-closure `join: true` model and is produced by
 * scripts/build-legacy.mjs; Vite takes over the JS in Phase 3, once the source
 * is real ESM modules. */
export default defineConfig({
    // Emit relative asset URLs ("images/x.woff", not "/images/x.woff") so the
    // built CSS works via <link> from any path, matching the v1.6.16 contract.
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: false,          // the legacy JS shim writes here too
        cssMinify: false,
        rollupOptions: {
            input: resolve(__dirname, 'src/styles-entry.js'),
            output: {
                // Keep asset filenames unhashed and under images/, so the
                // legacy `images/icons.woff` relative path keeps working for
                // anyone dropping the built CSS onto a page with a <link>.
                assetFileNames: info =>
                    info.name && info.name.endsWith('.css')
                        ? 'content-tools.css'
                        : 'images/[name][extname]',
                // The entry exists only to pull in the stylesheet; its JS
                // output is empty and gets removed by the build script.
                entryFileNames: '.styles-entry.js'
            }
        },
        // Never inline the woff as a data URI: it bloats the CSS and breaks
        // the images/ path contract above.
        assetsInlineLimit: 0
    }
});
