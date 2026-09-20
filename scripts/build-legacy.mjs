/* Builds dist/content-tools.js.
 *
 * Every library -- ContentTools and the three it was built on -- is plain
 * JavaScript in this repo now; nothing is compiled, and nothing is taken from
 * a prebuilt bundle. Each unit's files are concatenated inside one IIFE,
 * preserving the single shared closure that CoffeeScript's `join` gave them:
 * within a unit, files still see each other's top-level declarations, which
 * is how every file reaches its library's namespace object.
 *
 * Phase 3 replaces this with real ESM modules and per-file imports.
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PREAMBLE, UNITS} from './sources.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'dist');

/** Concatenate a unit's files inside one IIFE, preserving the shared scope. */
function buildUnit(unit) {
    const chunks = unit.files.map(
        f => readFileSync(join(ROOT, unit.dir, `${f}.js`), 'utf8'));
    // Files in a unit share one scope, so a top-level `const`/`let` declared
    // by two of them is a redeclaration SyntaxError -- and one that only
    // surfaces once both files have been converted. Fail loudly and name the
    // culprit instead of emitting a bundle that will not parse.
    const seen = new Map();
    chunks.forEach((chunk, i) => {
        for (const m of chunk.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)/gm)) {
            const prev = seen.get(m[1]);
            if (prev !== undefined && prev !== i) {
                throw new Error(
                    `${unit.name}: '${m[1]}' is declared at the top level of both ` +
                    `${unit.files[prev]} and ${unit.files[i]}, which share one scope. ` +
                    `Rename it in one of them.`);
            }
            seen.set(m[1], i);
        }
    });

    // Do NOT declare shared names here: if a converted file uses `let`/`const`
    // for one, a `var` of the same name in this wrapper is a redeclaration
    // SyntaxError. Same-block visibility already covers it.
    return `(function() {\n${chunks.join('\n')}\n}).call(this);\n`;
}

mkdirSync(OUT, {recursive: true});

const parts = PREAMBLE.map(p => readFileSync(join(ROOT, p), 'utf8'))
    .concat(UNITS.map(buildUnit));

// grunt-contrib-concat joined these with a single linefeed.
writeFileSync(join(OUT, 'content-tools.js'), parts.join('\n'));

console.log('built dist/content-tools.js');
