/* The walker every size budget now rests on.
 *
 * `.size-limit.js` measures each ESM entry against `closureOf()` instead of
 * a `dist/chunks/*.js` glob, so a mistake here is not a failing test: it is
 * a budget that passes while measuring less than we publish. A limit is an
 * upper bound, so a walker that finds NOTHING reports a few hundred bytes
 * and every number goes green.
 *
 * Two things stop that. `orphanChunks()` fails the build when a chunk falls
 * out of every closure, which is the alarm for a regex that stopped
 * matching. And this file, which pins the shapes, because the real `dist/`
 * cannot be made to contain the cases that matter -- a chunk nobody
 * reaches, an import of a file that is not there -- without breaking the
 * build it is part of.
 *
 * In test/golden/ rather than test/browser/ because it reads the file
 * system: these specs run in Node, as styles.spec.mjs already does when it
 * shells out to Sass. It opens no page.
 */
import {test, expect} from '@playwright/test';
import {closureOf, lazyClosureOf, orphanChunks} from '../../scripts/chunk-closure.mjs';

const AT = 'test/golden/fixtures/chunk-closure';

test.describe('closureOf', () => {
    test('follows static imports, transitively', () => {
        expect(closureOf(`${AT}/entry-a.js`).sort()).toEqual([
            `${AT}/chunks/one.js`,
            `${AT}/chunks/two.js`,
            `${AT}/entry-a.js`
        ]);
    });

    test('does NOT follow a dynamic import', () => {
        /* The property the `cms lazy YAML chunk` budget exists to state: a
           JSON-configured site never downloads it, so charging it to
           dist/cms.js would make that number a lie. */
        expect(closureOf(`${AT}/entry-b.js`)).toEqual([`${AT}/entry-b.js`]);
    });

    test('reads single quotes, no whitespace, and a bare side-effect import', () => {
        /* Rollup's output is unminified today and these spellings all
           appear across the five entries. A walker that only knew
           `from "..."` would drop a chunk silently. */
        expect(closureOf(`${AT}/entry-quotes.js`).sort()).toEqual([
            `${AT}/chunks/one.js`,
            `${AT}/chunks/two.js`,
            `${AT}/entry-quotes.js`
        ]);
    });

    test('skips a specifier that resolves to nothing', () => {
        /* size-limit is handed these paths verbatim. A file that is not
           there is not a measurable artifact, and inventing one turns a
           budget into an error about the wrong thing. */
        expect(closureOf(`${AT}/entry-missing.js`)).toEqual([
            `${AT}/entry-missing.js`
        ]);
    });

    test('throws for an entry that does not exist', () => {
        /* Not an empty list. A budget measured against a file the build
           never produced passes trivially, which is the failure this whole
           file is about. */
        expect(() => closureOf('dist/no-such-entry.js'))
            .toThrow(/does not exist -- build first/);
    });
});

test.describe('lazyClosureOf', () => {
    test('is everything reached ONLY through a dynamic import', () => {
        /* `dist/edit.js`'s shape, and both halves of what this number
           means. `chunks/five.js` is in it although nothing imports it
           dynamically -- the lazily loaded chunk imports it STATICALLY,
           and a walker that stopped at the first hop would under-measure
           the thing this budget states. `chunks/two.js` is NOT in it
           although the lazy side reaches it, because the static side
           reached it first: the page already has those bytes, so they
           are not part of what pressing Edit costs. */
        expect(lazyClosureOf(`${AT}/entry-mixed.js`).sort()).toEqual([
            `${AT}/chunks/five.js`,
            `${AT}/chunks/four.js`
        ]);
    });

    test('is the whole graph for an entry whose body is only a decision', () => {
        expect(lazyClosureOf(`${AT}/entry-b.js`)).toEqual([
            `${AT}/chunks/three.js`
        ]);
    });

    test('throws when there is nothing lazy about the entry', () => {
        /* Not an empty list, for the reason `closureOf` throws for a
           missing file: size-limit given no paths measures nothing and
           passes. An entry whose dynamic import has been inlined --
           `inlineDynamicImports`, a bundler default changing -- is
           precisely what this budget exists to catch, and it would
           otherwise catch it by going green. */
        expect(() => lazyClosureOf(`${AT}/entry-a.js`))
            .toThrow(/imports nothing dynamically/);
    });
});

test.describe('orphanChunks', () => {
    test('reports a chunk no entry reaches', () => {
        expect(orphanChunks(
            [`${AT}/entry-a.js`, `${AT}/entry-b.js`, `${AT}/entry-mixed.js`],
            [`${AT}/chunks`]
        )).toEqual([`${AT}/chunks/orphan.js`]);
    });

    test('counts a dynamically imported chunk as reached', () => {
        /* The asymmetry with closureOf is the whole design: the lazy chunk
           must not be CHARGED to an entry, but it must still be accounted
           for by something, or the orphan check would fail every build. */
        expect(orphanChunks([`${AT}/entry-b.js`], [`${AT}/chunks`]))
            .toContain(`${AT}/chunks/one.js`);
        expect(orphanChunks([`${AT}/entry-b.js`], [`${AT}/chunks`]))
            .not.toContain(`${AT}/chunks/three.js`);
    });

    test('ignores a directory that is not there', () => {
        // `dist/cms-chunks` does not exist until the cms build has run.
        expect(orphanChunks([`${AT}/entry-a.js`], ['dist/no-such-directory']))
            .toEqual([]);
    });
});
