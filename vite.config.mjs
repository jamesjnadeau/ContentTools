import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import dts from 'vite-plugin-dts';

/* Artifacts, each from its own mode:
 *
 *   (default)  dist/content-tools.js       IIFE, five browser globals, readable
 *   min        dist/content-tools.min.js   the same, minified
 *   esm        dist/index.js, element.js, markdown.js, shell.js
 *                                          ESM, sharing one library chunk
 *   cms        dist/cms.js                 the git-backed half, standalone
 *   style      dist/content-tools.css      stylesheet + dist/images/
 *   style-min  dist/content-tools.min.css  the same, minified
 *
 * The stylesheet is deliberately NOT built in library mode. Vite's lib mode
 * ignores assetsInlineLimit and always inlines assets as data URIs, which
 * bloats the CSS by ~11 KB and destroys the `images/icons.woff` relative path
 * that existing <link> integrations rely on.
 */
const shared = {emptyOutDir: false, cssMinify: false, minify: false};

export default defineConfig(({mode}) => {
    if (mode.startsWith('style')) {
        /* Four artifacts from two entries: each stylesheet is emitted both
         * readable and minified.
         *
         * The content sheet is a strict SUBSET of the full one -- the rules
         * that must reach the document rather than the shadow root -- so it
         * references the same five assets and must emit them to the same
         * `images/` path.
         *
         * The minified pair exists because v1.6.16 shipped
         * `build/content-tools.min.css` and nothing else: a drop-in
         * replacement that handed back a 2.3x larger stylesheet (gzipped)
         * would be a regression dressed as an upgrade. The readable sheets
         * keep their names and their bytes, which is what
         * test/golden/styles.spec.mjs asserts a partition over.
         */
        const content = mode.includes('content');
        const min = mode.endsWith('-min');
        const name = `content-tools${content ? '-content' : ''}${min ? '.min' : ''}`;
        return {
            base: './',
            build: {
                ...shared,
                cssMinify: min,
                assetsInlineLimit: 0,
                rollupOptions: {
                    input: resolve(__dirname, content
                        ? 'src/styles-content-entry.js'
                        : 'src/styles-entry.js'),
                    output: {
                        assetFileNames: info =>
                            info.name && info.name.endsWith('.css')
                                ? `${name}.css`
                                : 'images/[name][extname]',
                        // The entry exists only to pull in the stylesheet; its
                        // JS output is empty and the build script removes it.
                        entryFileNames: `.${name}-entry.js`
                    }
                }
            }
        };
    }

    if (mode === 'cms') {
        /* The git-backed half, in its OWN build rather than alongside the
         * other three entries.
         *
         * `src/markdown/` had to join them because it imports `rootContext`,
         * and a second copy of a module-level singleton is a bug you cannot
         * see. `src/cms/` imports nothing from the library at all -- there is
         * no singleton to duplicate -- and a test enforces that rather than a
         * comment, which is what keeps this justified.
         *
         * Separate also keeps `dist/chunks/*.js` meaning what .size-limit.js
         * says it means. `yaml` is already a static import of the markdown
         * entry; adding a second entry that reaches it would hoist it into a
         * shared chunk, and `index` and `element` would then fail a budget
         * over bytes neither of them loads. Here the YAML parser is a lazy
         * import of this entry alone, and is budgeted as one.
         */
        return {
            // No `dts` here: the esm build already emits declarations for
            // all of `src`, this entry's included.
            build: {
                ...shared,
                lib: {
                    entry: {cms: resolve(__dirname, 'src/cms/index.js')},
                    formats: ['es']
                },
                rollupOptions: {
                    output: {
                        entryFileNames: '[name].js',
                        chunkFileNames: 'cms-chunks/[name]-[hash].js'
                    }
                }
            }
        };
    }

    if (mode === 'esm') {
        /* FOUR entries, ONE copy of the library.
         *
         * `dist/index.js` stops being a single standalone file and that is
         * an accepted, visible change to a published artifact. The
         * alternative -- building the entries separately -- gives a
         * consumer who imports both two copies of every module, and
         * therefore two ContentTools.EditorApp singletons and two
         * ContentEdit.Roots. That failure presents as "my addEventListener
         * never fires", with nothing in any stack trace to suggest why.
         */
        return {
            // Declarations ship with the ESM build so consumers get types.
            plugins: [dts({include: ['src', 'vendor-src'], rollupTypes: false})],
            build: {
                ...shared,
                lib: {
                    entry: {
                        index: resolve(__dirname, 'src/index.js'),
                        element: resolve(__dirname, 'src/element/index.js'),
                        /* In the SAME build as the other two, not its own.
                           It imports `rootContext`, which is a module-level
                           singleton -- a separate build would give it a
                           second copy and therefore a second context. The
                           mdast dependencies still land in their own
                           chunk, because nothing else imports them. */
                        markdown: resolve(__dirname, 'src/markdown/index.js'),
                        /* The shell imports the editor, markdown AND the
                           git-backed half, so it has to be here: its own
                           build would give the page a second copy of the
                           library and therefore a second EditorApp, which
                           is the failure this multi-entry build exists to
                           prevent. `src/cms/` is inlined into it instead
                           of shared with dist/cms.js -- a second copy in
                           the PACKAGE, never on a page, and harmless
                           because a leaf with no module-level singleton is
                           inert in duplicate. That is the same property
                           that lets dist/cms.js be built separately at
                           all. */
                        shell: resolve(__dirname, 'src/shell/index.js')
                    },
                    formats: ['es']
                },
                rollupOptions: {
                    output: {
                        entryFileNames: '[name].js',
                        /* The chunk name is Rollup's, not ours. Forcing
                           one with `manualChunks` also sweeps the element
                           entry's own body into it, which moves the
                           `customElements.define` call out of the file
                           `package.json` lists in `sideEffects` -- the
                           build assertion in scripts/build.mjs catches
                           exactly that, and did. */
                        chunkFileNames: 'chunks/[name]-[hash].js'
                    }
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
