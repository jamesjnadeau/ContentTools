/* Phase 1 build: stylesheet + assets via Vite, JS via the CoffeeScript shim.
   The two halves merge in dist/ and split apart again in Phase 3, when the JS
   becomes real ESM modules that Vite can own. */
import {execFileSync} from 'node:child_process';
import {rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const run = (cmd, args) => execFileSync(cmd, args, {cwd: ROOT, stdio: 'inherit'});

run('npx', ['vite', 'build']);
run(process.execPath, [join(ROOT, 'scripts/build-legacy.mjs')]);
run(process.execPath, [join(ROOT, 'scripts/build-playground.mjs')]);

// The stylesheet entry emits an empty JS chunk; it is not part of the package.
rmSync(join(ROOT, 'dist/.styles-entry.js'), {force: true});
