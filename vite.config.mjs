import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import dts from 'vite-plugin-dts';

/* Artifacts, each from its own mode:
 *
 *   (default)  dist/content-tools.js       IIFE, five browser globals, readable
 *   min        dist/content-tools.min.js   the same, minified
 *   esm        dist/index.js               ESM, for consumers with a bundler
 *   style      dist/content-tools.css      stylesheet + dist/images/
 *
 * The stylesheet is deliberately NOT built in library mode. Vite's lib mode
 * ignores assetsInlineLimit and always inlines assets as data URIs, which
 * bloats the CSS by ~11 KB and destroys the `images/icons.woff` relative path
 * that existing <link> integrations rely on.
 */
const shared = {emptyOutDir: false, cssMinify: false, minify: false};

export default defineConfig(({mode}) => {
    if (mode === 'style' || mode === 'style-content') {
        // Both stylesheets are built the same way and differ only in entry and
        // output name. The content sheet is a strict SUBSET of the full one --
        // the rules that must reach the document rather than the shadow root --
        // so it references the same five assets and must emit them to the same
        // `images/` path.
        const content = mode === 'style-content';
        return {
            base: './',
            build: {
                ...shared,
                assetsInlineLimit: 0,
                rollupOptions: {
                    input: resolve(__dirname, content
                        ? 'src/styles-content-entry.js'
                        : 'src/styles-entry.js'),
                    output: {
                        assetFileNames: info =>
                            info.name && info.name.endsWith('.css')
                                ? (content
                                    ? 'content-tools-content.css'
                                    : 'content-tools.css')
                                : 'images/[name][extname]',
                        // The entry exists only to pull in the stylesheet; its
                        // JS output is empty and the build script removes it.
                        entryFileNames: content
                            ? '.styles-content-entry.js'
                            : '.styles-entry.js'
                    }
                }
            }
        };
    }

    if (mode === 'esm') {
        return {
            // Declarations ship with the ESM build so consumers get types.
            plugins: [dts({include: ['src', 'vendor-src'], rollupTypes: false})],
            build: {
                ...shared,
                lib: {
                    entry: resolve(__dirname, 'src/index.js'),
                    formats: ['es'],
                    fileName: () => 'index.js'
                }
            }
        };
    }

    return {
        build: {
            ...shared,
            minify: mode === 'min' ? 'esbuild' : false,
            lib: {
                entry: resolve(__dirname, 'src/global.js'),
                formats: ['iife'],
                name: 'ContentTools',
                fileName: () => mode === 'min' ? 'content-tools.min.js' : 'content-tools.js'
            }
        }
    };
});
