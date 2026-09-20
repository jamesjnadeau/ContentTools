/* Converts one source file from CoffeeScript to JavaScript, then proves the
 * conversion by rebuilding and running the suites. The mixed-mode build takes
 * <name>.js over <name>.coffee, so a file that does not pass is simply
 * deleted and the CoffeeScript original keeps being used -- conversion is
 * incremental and reversible per file.
 *
 * Usage: node scripts/decaf.mjs <dir> <name> [...]
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [dir, ...names] = process.argv.slice(2);

for (const name of names) {
    const coffee = join(ROOT, dir, `${name}.coffee`);
    const js = join(ROOT, dir, `${name}.js`);
    if (!existsSync(coffee)) { console.log(`skip (no source): ${dir}/${name}`); continue; }

    // decaffeinate writes alongside its input, so convert a scratch copy and
    // move the result into place.
    const tmp = join(ROOT, 'src/tmp-decaf.coffee');
    copyFileSync(coffee, tmp);
    try {
        // NOT --loose. That bundle includes --loose-for-expressions and
        // --loose-includes, which drop the Array.from() wrappers decaffeinate
        // otherwise emits. Those wrappers are not noise here: CoffeeScript's
        // `(c for c in domElement.childNodes)` idiom exists specifically to
        // SNAPSHOT a live NodeList before mutating it, and without the copy
        // the DOM parse iterates a list that changes underneath it -- which
        // showed up as regions parsing the same <p> twice.
        execFileSync('npx', ['decaffeinate', tmp],
                     {cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit']});
    } catch {
        console.log(`FAILED to convert: ${dir}/${name}`);
        rmSync(tmp, {force: true});
        continue;
    }
    // decaffeinate names a generated class alias `Cls` in every file that
    // needs one. Files in a unit share one scope, so two of them collide with
    // "Identifier 'Cls' has already been declared". The name never appears in
    // the CoffeeScript sources, so renaming it per file is safe.
    const unique = 'Cls$' + name.replace(/[^A-Za-z0-9]/g, '_');
    let out = readFileSync(join(ROOT, 'src/tmp-decaf.js'), 'utf8');
    out = out.replace(/\bCls\b/g, unique);
    writeFileSync(js, out);
    rmSync(join(ROOT, 'src/tmp-decaf.js'), {force: true});
    rmSync(tmp, {force: true});
    console.log(`converted: ${dir}/${name}.coffee -> ${name}.js`);
}
