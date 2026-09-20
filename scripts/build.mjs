/* Builds every published artifact.
 *
 *   dist/content-tools.js       IIFE, five browser globals, readable
 *   dist/content-tools.min.js   the same, minified
 *   dist/index.js               ESM, for consumers with a bundler
 *   dist/element.js             ESM, registers <content-tools-editor>
 *   dist/chunks/*.js            the library, shared by the two ESM entries
 *   dist/content-tools.css          stylesheet + dist/images/ assets
 *   dist/content-tools-content.css  the subset that must reach the document
 *   dist/*.min.css                  minified twins of both
 *
 * Plus the dev playground.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const run = (cmd, args) => execFileSync(cmd, args, {cwd: ROOT, stdio: 'inherit'});

run('npx', ['vite', 'build', '--mode', 'style']); // CSS + images/
// The document-level subset, for Mode A of the custom element. Built second
// so it reuses the images/ the full sheet already emitted.
run('npx', ['vite', 'build', '--mode', 'style-content']);
// Minified twins. v1.6.16 shipped only a minified stylesheet, so a drop-in
// replacement has to offer one; the readable sheets stay as they are.
run('npx', ['vite', 'build', '--mode', 'style-min']);
run('npx', ['vite', 'build', '--mode', 'style-content-min']);
run('npx', ['vite', 'build']);                    // IIFE
run('npx', ['vite', 'build', '--mode', 'min']);   // minified pair
/* Every build uses emptyOutDir:false so the five modes can share dist/, but
   the shared chunk's filename is content-hashed -- so without this the
   previous build's chunk survives and is published as dead weight. */
rmSync(join(ROOT, 'dist/chunks'), {recursive: true, force: true});
run('npx', ['vite', 'build', '--mode', 'esm']);   // ESM
run(process.execPath, [join(ROOT, 'scripts/build-playground.mjs')]);

for (const stub of ['content-tools', 'content-tools-content',
                    'content-tools.min', 'content-tools-content.min']) {
    rmSync(join(ROOT, `dist/.${stub}-entry.js`), {force: true});
}

/* The element registers its tag by SIDE EFFECT, and `package.json` keeps
 * `./dist/element.js` in its `sideEffects` allowlist so a consumer's bundler
 * does not drop `import '@.../element'` as unused. That entry names a FILE,
 * so if Rollup ever hoists the `customElements.define` call into the shared
 * chunk the allowlist silently stops covering it: the import compiles to
 * nothing, the tag never registers, and there is no error anywhere.
 *
 * Checked here rather than in a unit test because it is a property of the
 * BUILT artifact -- exactly the class of bug the IIFE export regression was. */
const element = readFileSync(join(ROOT, 'dist/element.js'), 'utf8');
if (!element.includes('customElements.define')) {
    throw new Error(
        'dist/element.js does not contain customElements.define -- it has ' +
        'moved into a shared chunk, and the package.json sideEffects entry ' +
        'no longer protects it.');
}
