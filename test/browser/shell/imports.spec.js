/* The shell's dependency direction, enforced rather than commented.
 *
 * Three silent failures live here, and none of them produces an error at
 * the point of the mistake:
 *
 * 1. A `src/shell/` file importing `src/element/index.ts`. That module is
 *    the ELEMENT's build entry, and Rollup turns an entry another entry
 *    imports into a facade, hoisting its body -- the `customElements
 *    .define` call included -- into a shared chunk. `package.json` lists
 *    `./dist/element.js` in `sideEffects` by FILE, so the allowlist stops
 *    covering the call, `import '@.../element'` compiles to nothing for a
 *    consumer whose bundler trusts it, and `<content-tools-editor>` never
 *    registers. The build asserts the artifact; this asserts the source,
 *    which is the form a human sees in a diff.
 *
 * 2. Anything below the shell importing the shell. The Milestone 1
 *    obligation is that the editor knows nothing about persistence and its
 *    contract ends at `ct-saved`; one import the other way and the editor
 *    entry starts carrying a CMS.
 *
 * 3. A bare package in `src/shell/`. "Vanilla, no new runtime dependency"
 *    is a decision, and a decision nobody checks is a preference.
 *
 * The technique is test/browser/cms/leaf.spec.js's, including its
 * file-count assertion -- a glob that matches nothing looks exactly like a
 * codebase with no violations.
 */
const SHELL = import.meta.glob('../../../src/shell/**/*.ts', {
    query: '?raw', eager: true, import: 'default'
});

const BELOW = import.meta.glob(
    ['../../../src/cms/**/*.ts', '../../../src/auth/**/*.ts',
     '../../../src/markdown/**/*.ts', '../../../src/element/**/*.ts',
     '../../../src/core/**/*.ts', '../../../src/scripts/**/*.ts'],
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

describe('the shell imports one way only', () => {
    it('has source files to check', () => {
        /* Both globs. If either silently matched nothing -- a renamed
           directory, a changed extension -- every assertion below would
           pass while checking no code at all. */
        expect(Object.keys(SHELL).length).toBeGreaterThan(0);
        expect(Object.keys(BELOW).length).toBeGreaterThan(0);
    });

    it('never reaches for the element ENTRY, only the class module', () => {
        const violations = [];
        for (const [path, source] of Object.entries(SHELL)) {
            for (const specifier of specifiersOf(source)) {
                if (!specifier.startsWith('.')) { continue; }
                const resolved = resolveFrom(path, specifier);
                if (/\/src\/element\/index(\.js)?$/.test(resolved)) {
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
                if (specifier.startsWith('.')
                    && resolveFrom(path, specifier).includes('/src/shell/')) {
                    violations.push(`${path} -> ${specifier}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('takes no third-party dependency at all', () => {
        /* Not an allowlist, unlike the CMS half's -- which permits `yaml`
           because `loadConfig` genuinely needs a parser. The shell's
           answer is zero, so the check is a count rather than a set, and
           adding the first one is a deliberate edit to this line. */
        const bare = [];
        for (const [path, source] of Object.entries(SHELL)) {
            for (const specifier of specifiersOf(source)) {
                if (!specifier.startsWith('.')) {
                    bare.push(`${path} -> ${specifier}`);
                }
            }
        }
        expect(bare).toEqual([]);
    });
});
