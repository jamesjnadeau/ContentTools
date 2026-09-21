/* Builds every published artifact.
 *
 *   dist/content-tools.js       IIFE, five browser globals, readable
 *   dist/content-tools.min.js   the same, minified
 *   dist/index.js               ESM, for consumers with a bundler
 *   dist/element.js             ESM, registers <content-tools-editor>
 *   dist/markdown.js            ESM, the markdown round trip
 *   dist/shell.js               ESM, registers <content-tools-cms>
 *   dist/chunks/*.js            the library, shared by the ESM entries
 *   dist/cms.js                 ESM, the git-backed half, standalone
 *   dist/cms-chunks/*.js        its lazily-imported YAML parser
 *   dist/content-tools.css          stylesheet + dist/images/ assets
 *   dist/content-tools-content.css  the subset that must reach the document
 *   dist/*.min.css                  minified twins of both
 *
 * Plus the dev playground.
 */
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {orphanChunks} from './chunk-closure.mjs';

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
rmSync(join(ROOT, 'dist/cms-chunks'), {recursive: true, force: true});
run('npx', ['vite', 'build', '--mode', 'esm']);   // ESM
run('npx', ['vite', 'build', '--mode', 'cms']);   // the git-backed half
run(process.execPath, [join(ROOT, 'scripts/build-playground.mjs')]);

for (const stub of ['content-tools', 'content-tools-content',
                    'content-tools.min', 'content-tools-content.min']) {
    rmSync(join(ROOT, `dist/.${stub}-entry.js`), {force: true});
}

/* The element and the shell both register their tag by SIDE EFFECT, and
 * `package.json` keeps both files in its `sideEffects` allowlist so a
 * consumer's bundler does not drop `import '@.../element'` as unused. Those
 * entries name FILES, so if Rollup ever hoists a `customElements.define`
 * call into a shared chunk the allowlist silently stops covering it: the
 * import compiles to nothing, the tag never registers, and there is no
 * error anywhere.
 *
 * The element's is also the alarm for a second failure. `src/element/
 * index.ts` is the element's own build entry, so a `src/shell/` file
 * importing it makes Rollup turn that module into a facade and hoist its
 * body -- `define` call included -- into a shared chunk. The shell would
 * still register its own tag; it is the EDITOR's that would vanish.
 *
 * Checked here rather than in a unit test because it is a property of the
 * BUILT artifact -- exactly the class of bug the IIFE export regression was. */
for (const entry of ['dist/element.js', 'dist/shell.js']) {
    if (!readFileSync(join(ROOT, entry), 'utf8').includes('customElements.define')) {
        throw new Error(
            `${entry} does not contain customElements.define -- it has ` +
            'moved into a shared chunk, and the package.json sideEffects ' +
            'entry no longer protects it.');
    }
}

/* `src/cms/` is a leaf -- it imports nothing from the editor, the element,
 * the RootContext or any vendored library -- and TWO things rest on that:
 * this entry is built separately from the other three, which is only safe
 * because it shares no module-level singleton with them, and it is usable
 * with no DOM at all.
 *
 * `test/browser/cms/leaf.spec.js` checks the import graph in source. This
 * checks the artifact, because the failure mode is a bundled COPY of the
 * library rather than a visible import, and a copy is what would give a
 * page two RootContexts with nothing in any stack trace to say so.
 */
const cms = readFileSync(join(ROOT, 'dist/cms.js'), 'utf8');
for (const marker of ['ContentTools', 'ContentEdit', 'rootContext']) {
    if (cms.includes(marker)) {
        throw new Error(
            `dist/cms.js contains "${marker}" -- src/cms/ has picked up an ` +
            'import from the library, so it is no longer a leaf and must ' +
            'not be built separately from dist/index.js.');
    }
}

/* Every chunk is in somebody's budget.
 *
 * `.size-limit.js` measures each entry against the closure of its own
 * static imports rather than a `dist/chunks/*` glob, so that a dependency
 * shared by two entries is charged to those two and not to the entries
 * that never load it. The cost of that precision is a regex over generated
 * JavaScript, and this is what makes it safe: if the walker ever stops
 * following a form Rollup emits, the chunk falls out of every closure and
 * lands here, loudly, instead of shipping unmeasured.
 *
 * It also catches plain dead weight -- a chunk from an earlier build that
 * the rmSync above somehow missed.
 */
const ENTRIES = ['dist/index.js', 'dist/element.js', 'dist/markdown.js',
                 'dist/shell.js', 'dist/cms.js'];
const orphans = orphanChunks(ENTRIES, ['dist/chunks', 'dist/cms-chunks']);
if (orphans.length) {
    throw new Error(
        `no entry reaches ${orphans.join(', ')} -- either it is dead weight ` +
        'in dist/, or scripts/chunk-closure.mjs failed to follow an import ' +
        'form and the size budgets are now measuring less than we publish.');
}

/* `app/index.html` is the deployable CMS AND the page the dist smoke test
 * drives. It references dist/ by relative path, which no bundler resolves
 * and no test would notice until it 404s, so a renamed artifact silently
 * breaks the one page a user actually opens. */
const app = readFileSync(join(ROOT, 'app/index.html'), 'utf8');
for (const [, reference] of app.matchAll(/(?:src|href)="(\.\.\/dist\/[^"]+)"/g)) {
    if (!existsSync(join(ROOT, 'app', reference))) {
        throw new Error(
            `app/index.html references ${reference}, which the build does ` +
            'not produce.');
    }
}
