/* The two editing surfaces' dependency direction, enforced rather than
 * commented.
 *
 * Four silent failures live here, and none of them produces an error at
 * the point of the mistake:
 *
 * 1. A `src/shell/`, `src/entry/` or `src/edit/` file importing another
 *    ENTRY of the same Vite build.
 *    Rollup turns an entry that another entry imports into a facade and
 *    hoists its body into a shared chunk. For `src/element/index.ts` that
 *    body includes `customElements.define`, and `package.json` lists
 *    `./dist/element.js` in `sideEffects` by FILE -- so the allowlist
 *    stops covering the call, `import '@.../element'` compiles to nothing
 *    for a consumer whose bundler trusts it, and `<content-tools-editor>`
 *    never registers. `src/markdown/index.ts` and `src/index.ts` are the
 *    same hazard with a quieter symptom: a hoisted facade moves bytes
 *    between the measured closures, so a budget starts charging an entry
 *    for a parser it does not load. The build asserts the artifact; this
 *    asserts the source, which is the form a human sees in a diff.
 *
 *    `src/cms/index.ts` is NOT on the list, and the difference is worth
 *    stating: it is the entry of a SEPARATE Vite invocation (`--mode
 *    cms`), so inside the esm build it is an ordinary module.
 *
 * 2. Anything below a surface importing one. The Milestone 1 obligation
 *    is that the editor knows nothing about persistence and its contract
 *    ends at `ct-saved`; one import the other way and the editor entry
 *    starts carrying a CMS.
 *
 * 3. One surface importing the other. They are siblings that share what
 *    they share by reaching DOWN, so a sideways import puts the shell's
 *    screens inside the script every reader of every page downloads --
 *    visible only as a size budget nobody reads carefully that week.
 *
 * 4. A bare package in either. "Vanilla, no new runtime dependency" is a
 *    decision, and a decision nobody checks is a preference.
 *
 * 5. `src/shell/` reaching `src/element/` at all. The management screens
 *    have shown no editor since M6-3 -- the body of an entry is edited on
 *    the site's own page -- and `src/element/` pulls in the whole
 *    library, so one import puts ~80 kB of editor into `dist/shell.js`
 *    for a surface that never mounts one. Nothing throws, nothing looks
 *    wrong, and the shell's size budget is the only thing that notices.
 *
 * The technique is test/browser/cms/leaf.spec.js's, including its
 * file-count assertion -- a glob that matches nothing looks exactly like a
 * codebase with no violations.
 */
const SHELL = import.meta.glob('../../../src/shell/**/*.ts', {
    query: '?raw', eager: true, import: 'default'
});

/* `src/entry/` -- one open entry, shared by the shell and by the in-page
   editing surface -- is held to the SAME two rules as the shell, because
   it sits in the same build and is imported by two entries rather than
   one. It is also in BELOW, which is the rule that keeps the sharing
   one-directional: the shell may reach down into it, and it may never
   reach back up. */
const ENTRY = import.meta.glob('../../../src/entry/**/*.ts', {
    query: '?raw', eager: true, import: 'default'
});

/* `src/edit/` -- the script that runs on the SITE's own pages -- is the
   second surface, and it is held to the same rules for the same reasons.
   It is also the one with the sharpest version of rule 3: it is
   downloaded by every reader of every page, so a bare package here is
   not a preference lost, it is somebody's page weight. */
const EDIT = import.meta.glob('../../../src/edit/**/*.ts', {
    query: '?raw', eager: true, import: 'default'
});

const ABOVE = {...SHELL, ...ENTRY, ...EDIT};

const BELOW = import.meta.glob(
    ['../../../src/cms/**/*.ts', '../../../src/auth/**/*.ts',
     '../../../src/markdown/**/*.ts', '../../../src/element/**/*.ts',
     '../../../src/core/**/*.ts', '../../../src/scripts/**/*.ts',
     '../../../src/entry/**/*.ts'],
    {query: '?raw', eager: true, import: 'default'});

/* Static imports and re-exports, dynamic imports, and bare side-effect
   imports. Three patterns rather than one, because a single expression
   covering all three is unreadable and this file's whole job is to be
   obviously right. */
const PATTERNS = [
    /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g
];

function specifiersOf(source) {
    const out = new Set();
    for (const pattern of PATTERNS) {
        for (const [, specifier] of source.matchAll(pattern)) {
            out.add(specifier);
        }
    }
    return out;
}

/** Resolve a relative specifier against the importing file's own path. */
function resolveFrom(importer, specifier) {
    const parts = importer.split('/').slice(0, -1);
    for (const step of specifier.split('/')) {
        if (step === '.') { continue; }
        if (step === '..') { parts.pop(); continue; }
        parts.push(step);
    }
    return parts.join('/');
}

describe('the editing surfaces import one way only', () => {
    it('has source files to check', () => {
        /* All four globs. If any silently matched nothing -- a renamed
           directory, a changed extension -- every assertion below would
           pass while checking no code at all. */
        expect(Object.keys(SHELL).length).toBeGreaterThan(0);
        expect(Object.keys(ENTRY).length).toBeGreaterThan(0);
        expect(Object.keys(EDIT).length).toBeGreaterThan(0);
        expect(Object.keys(BELOW).length).toBeGreaterThan(0);
    });

    it('never reaches for a sibling build ENTRY, only the class modules', () => {
        /* Every OTHER entry of the `esm` build, as vite.config.mjs lists
           them -- the two surfaces' own entries included, because they
           are siblings to each other. Neither can name itself here: a
           module does not import itself, so a rule about `src/edit/
           index.ts` is a rule for every file that is not it. */
        const ENTRIES = [
            /\/src\/element\/index(\.js)?$/,
            /\/src\/markdown\/index(\.js)?$/,
            /\/src\/index(\.js)?$/,
            /\/src\/shell\/index(\.js)?$/,
            /\/src\/edit\/index(\.js)?$/
        ];
        const violations = [];
        for (const [path, source] of Object.entries(ABOVE)) {
            for (const specifier of specifiersOf(source)) {
                if (!specifier.startsWith('.')) { continue; }
                const resolved = resolveFrom(path, specifier);
                if (ENTRIES.some(entry => entry.test(resolved))) {
                    violations.push(`${path} -> ${specifier}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('is imported by nothing below it', () => {
        const violations = [];
        for (const [path, source] of Object.entries(BELOW)) {
            for (const specifier of specifiersOf(source)) {
                if (!specifier.startsWith('.')) { continue; }
                const resolved = resolveFrom(path, specifier);
                /* Both surfaces, one rule. They sit at the same level
                   and the direction is the same for each: down into the
                   editor, the parser and the git client, and never back
                   up into a screen. */
                if (resolved.includes('/src/shell/')
                    || resolved.includes('/src/edit/')) {
                    violations.push(`${path} -> ${specifier}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('keeps the two surfaces out of each other', () => {
        /* Siblings, not layers. They share `src/entry/`, `src/cms/` and
           `src/core/` by reaching DOWN into them -- which is why the
           frontmatter form lives in `src/entry/` rather than being
           imported out of the shell's views. One import sideways and
           `dist/edit.js`, the file every reader of every page
           downloads, starts carrying the collection browser.

           Rule 2 above does not cover this: it asks what BELOW imports,
           and neither surface is below the other. */
        const violations = [];
        for (const [path, source] of Object.entries(ABOVE)) {
            /* `src/entry/` is in ABOVE too and is neither surface, so
               it falls through both and is skipped -- it is held to the
               direction rule by being in BELOW instead. */
            let other = null;
            if (path.includes('/src/shell/')) { other = '/src/edit/'; }
            if (path.includes('/src/edit/')) { other = '/src/shell/'; }
            if (other === null) { continue; }
            for (const specifier of specifiersOf(source)) {
                if (!specifier.startsWith('.')) { continue; }
                if (resolveFrom(path, specifier).includes(other)) {
                    violations.push(`${path} -> ${specifier}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('keeps the editor out of the management screens', () => {
        /* Rule 1 already forbids `src/element/index.js` -- the entry --
           and this forbids the whole directory, which is a different
           claim: the shell imported the CLASS module quite legally until
           M6-3, and what changed is not the packaging hazard but the
           product. /admin manages drafts and pull requests; the words
           are edited where they are read.

           Only the shell. `src/edit/` imports the element on purpose,
           and `src/entry/` must not -- it is shared, so an editor
           imported there arrives in both surfaces -- which is rule 2's
           job, since `src/element/` is in BELOW. */
        const violations = [];
        for (const [path, source] of Object.entries(SHELL)) {
            for (const specifier of specifiersOf(source)) {
                if (!specifier.startsWith('.')) { continue; }
                if (resolveFrom(path, specifier).includes('/src/element/')) {
                    violations.push(`${path} -> ${specifier}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('takes no third-party dependency at all', () => {
        /* Not an allowlist, unlike the CMS half's -- which permits `yaml`
           because `loadConfig` genuinely needs a parser. The answer here
           is zero, so the check is a count rather than a set, and adding
           the first one is a deliberate edit to this line. */
        const bare = [];
        for (const [path, source] of Object.entries(ABOVE)) {
            for (const specifier of specifiersOf(source)) {
                if (!specifier.startsWith('.')) {
                    bare.push(`${path} -> ${specifier}`);
                }
            }
        }
        expect(bare).toEqual([]);
    });
});
