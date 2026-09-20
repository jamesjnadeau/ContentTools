/* decaffeinate emits CoffeeScript's pre-super constructor statements (bound
 * method assignments, and occasionally others) before the super() call,
 * mirroring what the CoffeeScript compiler did. ES classes forbid touching
 * `this` before super(), so hoist the super call to the top of the body.
 *
 * The reordering is observable only if a base constructor invokes something
 * the hoisted statements set up; the 455-test suite is the check on that.
 */
import {readFileSync, writeFileSync} from 'node:fs';

/** Find the body of each `constructor(...) { ... }` by brace matching. */
function* constructors(src) {
    const re = /\bconstructor\s*\([^)]*\)\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
        let depth = 1, i = m.index + m[0].length;
        const start = i;
        while (i < src.length && depth > 0) {
            const c = src[i];
            if (c === '{') depth++;
            else if (c === '}') depth--;
            else if (c === '"' || c === "'" || c === '`') {       // skip strings
                const q = c; i++;
                while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
            }
            i++;
        }
        yield {start, end: i - 1};
    }
}

let touched = 0;
for (const file of process.argv.slice(2)) {
    let src = readFileSync(file, 'utf8');
    let changed = true;
    while (changed) {                       // offsets shift after each edit
        changed = false;
        for (const {start, end} of constructors(src)) {
            const body = src.slice(start, end);
            const sm = /^([ \t]*)super\(([^;]*)\);[ \t]*\n/m.exec(body);
            if (!sm || sm.index === 0) continue;
            const before = body.slice(0, sm.index);
            if (!/\bthis\b/.test(before)) continue;   // nothing illegal precedes it
            const rest = body.slice(0, sm.index) + body.slice(sm.index + sm[0].length);
            src = src.slice(0, start) + '\n' + sm[0] + rest + src.slice(end);
            touched++; changed = true; break;
        }
    }
    writeFileSync(file, src);
}
console.log(`hoisted super() in ${touched} constructor(s)`);
