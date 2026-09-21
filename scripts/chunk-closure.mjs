/* Which files a built ESM entry actually pulls in.
 *
 * `.size-limit.js` used to measure each ESM entry against the glob
 * `dist/chunks/*.js`, on the reasoning that any chunk appearing there was
 * either the shared library or an alarm worth raising. That held while the
 * only entries were `index`, `element` and a self-contained `markdown`. It
 * stops holding the moment two entries share a dependency the others do
 * not have: adding the shell, which imports markdown, makes ~98 kB of
 * micromark reachable from two entries, so Rollup hoists it into
 * `dist/chunks/` and the glob charges all of it to `dist/index.js` -- a
 * file that is 312 bytes gzipped and loads none of it. The budget file's
 * own comment predicted this and called it "the right alarm, even though
 * the message points at the wrong line". It is now the wrong alarm.
 *
 * So: measure each entry against exactly the chunks it imports. The alarm
 * the glob was really for -- "the shared chunk grew", "index now reaches
 * something it did not" -- is preserved precisely, because a chunk `index`
 * genuinely starts importing is in its closure and does fail its budget.
 *
 * STATIC IMPORTS ONLY, deliberately. Following `await import(...)` would
 * fold the lazily-loaded YAML parser into `dist/cms.js`'s number and
 * destroy the exact property that budget exists to state: that a
 * JSON-configured site never downloads it. Dynamic chunks keep their own
 * budget line.
 *
 * This is a regex over generated JavaScript, which is only defensible
 * because of two things. The ESM build is deliberately unminified, so the
 * import forms are stable and readable. And `scripts/build.mjs` runs
 * `orphanChunks()` after every build: if this regex ever stops matching a
 * form Rollup emits, the chunk falls out of every closure and the build
 * FAILS, rather than quietly under-measuring. That is the difference
 * between this and a prefix glob like `chunks/remove-*.js`, which matches
 * nothing the day the chunk is renamed and under-measures in silence.
 */
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {dirname, join, posix, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/* `from "./chunks/x.js"`, `import "./chunks/x.js"` and
   `export ... from "./chunks/x.js"`, in either quote style. A quote has to
   follow the keyword directly, which is what excludes `import("./x.js")`
   -- the dynamic form, deliberately not a static edge. The leading
   `from|import` keeps it from matching a relative path that merely appears
   inside a string in the bundled source. */
const STATIC_IMPORT = /\b(?:from|import)\s*(['"])(\.[^'"]*)\1/g;

/* `import("./cms-chunks/x.js")`. Not an edge for budgets -- see above --
   but it is an edge for reachability, or the lazy YAML chunk would look
   like dead weight to the orphan check. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(['"])(\.[^'"]*)\1/g;

function specifiers(file, pattern) {
    const source = readFileSync(file, 'utf8');
    const out = new Set();
    for (const [, , specifier] of source.matchAll(pattern)) {
        out.add(resolve(dirname(file), specifier));
    }
    return out;
}

/** Walk `edges` from every entry to a fixed point. Missing files are skipped. */
function walk(entries, edges) {
    const seen = new Set(entries);
    const queue = [...entries];
    while (queue.length) {
        for (const next of edges(queue.pop())) {
            if (!seen.has(next) && existsSync(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }
    return seen;
}

/**
 * An entry plus every file it statically imports, transitively, as paths
 * relative to the repository root and in `posix` form so they can be used
 * as size-limit globs on any platform.
 *
 * Throws for a missing entry rather than returning just the entry: a
 * budget measured against a file that is not there passes trivially, and
 * the whole point of these numbers is that they fail.
 */
export function closureOf(entry) {
    const start = resolve(ROOT, entry);
    if (!existsSync(start)) {
        throw new Error(`chunk-closure: ${entry} does not exist -- build first`);
    }

    const seen = walk([start], file => specifiers(file, STATIC_IMPORT));
    return [...seen].map(toRepoPath);
}

const toRepoPath = file => relative(ROOT, file).split(/[\\/]/).join(posix.sep);

/**
 * Chunk files no entry reaches, statically or dynamically.
 *
 * This is what makes the regex above acceptable. Every chunk must be
 * reachable from some entry; anything else is either dead weight left in
 * `dist/` by an earlier build or -- much worse -- a chunk this walker
 * failed to follow, and therefore a chunk in nobody's budget.
 *
 * Note this walk follows dynamic edges too, while `closureOf` does not.
 * The lazy YAML chunk must not be charged to `dist/cms.js`, but it must
 * still be accounted for by something.
 */
export function orphanChunks(entries, directories) {
    const starts = entries.map(entry => resolve(ROOT, entry));
    const reached = new Set([...walk(starts, file => new Set([
        ...specifiers(file, STATIC_IMPORT),
        ...specifiers(file, DYNAMIC_IMPORT)
    ]))].map(toRepoPath));

    const orphans = [];
    for (const directory of directories) {
        const at = join(ROOT, directory);
        if (!existsSync(at)) {
            continue;
        }
        for (const name of readdirSync(at)) {
            const path = `${directory}/${name}`;
            if (!reached.has(path)) {
                orphans.push(path);
            }
        }
    }
    return orphans;
}
