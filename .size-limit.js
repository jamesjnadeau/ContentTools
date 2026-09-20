/* Size budgets for every published artifact.
 *
 * A ratchet, not an aspiration: each limit sits just above what the artifact
 * costs today, so an accidental dependency, a lost tree-shake or a chunk
 * that stops being shared fails the build instead of arriving unnoticed in
 * someone's page weight. Raise a limit deliberately, in the commit that
 * earns it, and say why in the message.
 *
 * Measured with @size-limit/file -- the bytes we actually publish, gzipped,
 * with no bundler in the middle. That matters for the two ESM entries,
 * which are a few hundred bytes each next to a shared chunk holding the
 * library: measuring the entry file alone would report ~0 while shipping
 * 300 KB, so each one is listed together with the chunk it pulls in.
 *
 * The ESM build is deliberately NOT minified -- a library should stay
 * debuggable and every consumer's bundler minifies it anyway -- so those
 * two numbers are larger than what a consumer's users download. The IIFE
 * bundle and the stylesheets are minified and served as-is, so for those
 * the number is the number.
 */
export default [
    {
        /* The script-tag artifact, and the v1.6.x drop-in path. Reference
           point: build/content-tools.min.js, the frozen v1.6.16 file, is
           37.0 kB gzipped -- so this must not grow past it. */
        name: 'IIFE bundle (script tag)',
        path: 'dist/content-tools.min.js',
        limit: '36 kB',
        gzip: true
    },
    {
        /* Everything: the entry re-exports all five namespaces, so nothing
           is shakeable from here. A consumer importing one tool pays less;
           this is the ceiling. */
        name: 'ESM library entry + shared chunk',
        path: ['dist/index.js', 'dist/chunks/*.js'],
        limit: '56 kB',
        gzip: true
    },
    {
        /* The same chunk, plus the element and the inlined icon font
           (~9 kB of base64). The interesting number is the DIFFERENCE from
           the line above: if it ever approaches their sum, the chunk has
           stopped being shared and there are two copies of the library. */
        name: 'ESM element entry + shared chunk',
        path: ['dist/element.js', 'dist/chunks/*.js'],
        limit: '80 kB',
        gzip: true
    },
    {
        name: 'stylesheet',
        path: 'dist/content-tools.min.css',
        limit: '5.5 kB',
        gzip: true
    },
    {
        /* Mode A consumers link this into the document; a strict subset of
           the sheet above. */
        name: 'content stylesheet',
        path: 'dist/content-tools-content.min.css',
        limit: '1.5 kB',
        gzip: true
    }
];
