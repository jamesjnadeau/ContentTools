/* `src/cms/` and `src/auth/` import nothing from the library.

   Two things rest on that, and neither is obvious from reading the code:

   - `dist/cms.js` is built SEPARATELY from `dist/index.js` and
     `dist/element.js`. That is only safe because there is no module-level
     singleton to end up with two copies of. `src/markdown/` could not be
     built separately for exactly this reason -- it imports `rootContext`,
     and a second context would hand `fromHTML()` a sandbox document the
     editor knows nothing about.
   - The CMS half runs with no DOM: in a worker, in a Node script, in a
     test that never opens a page.

   `scripts/build.mjs` checks the built artifact for a bundled COPY of the
   library. This checks the source for the import that would put one there,
   which is the form a human reviewing a diff would actually see.

   The eslint lesson applies here: a glob that matches nothing looks
   exactly like a codebase with no violations, so the file count is
   asserted too. */

const SOURCES = {
    ...import.meta.glob('../../../src/cms/**/*.ts', {query: '?raw', import: 'default', eager: true}),
    ...import.meta.glob('../../../src/auth/**/*.ts', {query: '?raw', import: 'default', eager: true})
};

/** The only bare package specifiers these directories may reach for. */
const ALLOWED_PACKAGES = new Set(['yaml']);

/** Every module specifier in a source file: static, re-exported and dynamic. */
function specifiers(source) {
    const found = [];
    const patterns = [
        /\bfrom\s*['"]([^'"]+)['"]/g,     // import x from 'y' / export * from 'y'
        /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
        /\bimport\s*['"]([^'"]+)['"]/g    // bare side-effect import
    ];
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            found.push(match[1]);
        }
    }
    return found;
}

/** Resolve a relative specifier against its importer, as a repo-ish path. */
function resolveFrom(importer, specifier) {
    const parts = importer.split('/').slice(0, -1);
    for (const segment of specifier.split('/')) {
        if (segment === '.') {
            continue;
        } else if (segment === '..') {
            parts.pop();
        } else {
            parts.push(segment);
        }
    }
    return parts.join('/');
}

describe('the CMS half is a leaf', function() {

    it('has source files to check', function() {
        /* Without this the rest of the file passes by matching nothing,
           which is how the no-restricted-globals rule quietly stopped
           guarding anything in Phase 5. */
        return expect(Object.keys(SOURCES).length).toBeGreaterThan(0);
    });

    it('imports nothing outside itself but the packages it declares', function() {
        const violations = [];

        for (const [path, source] of Object.entries(SOURCES)) {
            for (const specifier of specifiers(source)) {
                if (!specifier.startsWith('.')) {
                    if (!ALLOWED_PACKAGES.has(specifier)) {
                        violations.push(`${path} imports the package '${specifier}'`);
                    }
                    continue;
                }
                const resolved = resolveFrom(path, specifier);
                if (!/\/src\/(cms|auth)\//.test(`${resolved}/`)) {
                    violations.push(`${path} imports '${specifier}' -> ${resolved}`);
                }
            }
        }

        return expect(violations).toEqual([]);
    });
});
