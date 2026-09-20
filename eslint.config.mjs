import js from '@eslint/js';

/* The one rule that matters here: no bare `document` or `window` in library
 * source. Every host-environment access goes through the RootContext, which
 * is what lets a ShadowRootContext be swapped in without touching call sites.
 * Without this rule the seam silently rots the first time someone reaches for
 * a global. */
const NO_GLOBALS = {
    'no-restricted-globals': ['error',
        {name: 'document', message: 'Use rootContext() from src/core/root-context.js.'},
        {name: 'window', message: 'Use rootContext() from src/core/root-context.js.'}
    ]
};

export default [
    {ignores: ['dist/**', 'node_modules/**', 'build/**', 'playground/*.js',
               'test/golden/legacy-bundle.js', 'vendor-src/**/spec/**']},
    {
        files: ['src/**/*.js', 'vendor-src/**/*.js'],
        languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
        rules: NO_GLOBALS
    },
    {
        // Exempt: the seam itself; the entry that attaches the browser
        // globals; and the playground, which is a HOST page rather than
        // library code -- it is exactly the sort of integration that is
        // supposed to touch window directly.
        files: ['src/core/document-root-context.js', 'src/core/root-context.js',
                'src/global.js', 'src/playground/**/*.js'],
        rules: {'no-restricted-globals': 'off'}
    }
];
