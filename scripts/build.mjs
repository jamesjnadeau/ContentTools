/* Builds every published artifact.
 *
 *   dist/content-tools.js       IIFE, five browser globals, readable
 *   dist/content-tools.min.js   the same, minified
 *   dist/index.js               ESM, for consumers with a bundler
 *   dist/content-tools.css          stylesheet + dist/images/ assets
 *   dist/content-tools-content.css  the subset that must reach the document
 *
 * Plus the dev playground.
 */
import {execFileSync} from 'node:child_process';
import {rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const run = (cmd, args) => execFileSync(cmd, args, {cwd: ROOT, stdio: 'inherit'});

run('npx', ['vite', 'build', '--mode', 'style']); // CSS + images/
// The document-level subset, for Mode A of the custom element. Built second
// so it reuses the images/ the full sheet already emitted.
run('npx', ['vite', 'build', '--mode', 'style-content']);
run('npx', ['vite', 'build']);                    // IIFE
run('npx', ['vite', 'build', '--mode', 'min']);   // minified pair
run('npx', ['vite', 'build', '--mode', 'esm']);   // ESM
run(process.execPath, [join(ROOT, 'scripts/build-playground.mjs')]);

rmSync(join(ROOT, 'dist/.styles-entry.js'), {force: true});
rmSync(join(ROOT, 'dist/.styles-content-entry.js'), {force: true});
