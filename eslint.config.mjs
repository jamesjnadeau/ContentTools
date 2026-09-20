import tseslint from 'typescript-eslint';

/* The one rule that matters here: no bare `document` or `window` in library
 * source. Every host-environment access goes through the RootContext, which
 * is what lets a ShadowRootContext be swapped in without touching call sites.
 *
 * NOTE the .ts globs. When the sources were renamed in Phase 5 this config
 * still matched only JavaScript, so the rule matched nothing and silently
 * stopped
 * guarding anything -- a rule that covers no files looks exactly like a
 * clean codebase. There is a test for the rule itself in CI for that reason.
 */
const NO_GLOBALS = {
    'no-restricted-globals': ['error',
        {name: 'document', message: 'Use rootContext() from src/core/root-context.ts.'},
        {name: 'window', message: 'Use rootContext() from src/core/root-context.ts.'}
    ]
};

export default [
    {ignores: ['dist/**', 'node_modules/**', 'build/**', 'playground/*.js',
               'test/golden/legacy-bundle.js', 'vendor-src/**/spec/**']},
    {
        files: ['src/**/*.ts', 'vendor-src/**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module'
        },
        rules: NO_GLOBALS
    },
    {
        // Exempt: the seam itself; the entry that attaches the browser
        // globals; and the playground, which is a HOST page rather than
        // library code -- exactly the sort of integration that is supposed
        // to touch window directly.
        files: ['src/core/document-root-context.ts', 'src/core/root-context.ts',
                'src/global.ts', 'src/playground/**/*.{ts,js}'],
        rules: {'no-restricted-globals': 'off'}
    }
];
