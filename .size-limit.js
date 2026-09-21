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
 *
 * `dist/chunks/*.js` is a glob rather than a list because the chunk names
 * are Rollup's -- naming them with `manualChunks` breaks the element's
 * side-effect registration, see vite.config.mjs. So it also catches a
 * chunk that appears for some OTHER entry: if the markdown entry ever
 * stops being self-contained, its chunk lands in the two ESM numbers and
 * they fail. That is the right alarm, even though the message points at
 * the wrong line.
 *
 * These budgets are only meaningful against a FRESH build, which is why
 * `test:size` builds first. Measuring a stale `dist/` reported a pass for
 * a commit CI then failed.
 */
export default [
    {
        /* The script-tag artifact, and the v1.6.x drop-in path. Reference
           point: build/content-tools.min.js, the frozen v1.6.16 file, is
           37.0 kB gzipped -- so this must not grow past it. */
        name: 'IIFE bundle (script tag)',
        path: 'dist/content-tools.min.js',
        limit: '36.5 kB',
        gzip: true
    },
    {
        /* Everything: the entry re-exports all five namespaces, so nothing
           is shakeable from here. A consumer importing one tool pays less;
           this is the ceiling. */
        name: 'ESM library entry + shared chunk',
        path: ['dist/index.js', 'dist/chunks/*.js'],
        limit: '57 kB',
        gzip: true
    },
    {
        /* The same chunk, plus the element and the inlined icon font
           (~9 kB of base64). The interesting number is the DIFFERENCE from
           the line above: if it ever approaches their sum, the chunk has
           stopped being shared and there are two copies of the library. */
        name: 'ESM element entry + shared chunk',
        path: ['dist/element.js', 'dist/chunks/*.js'],
        limit: '81 kB',
        gzip: true
    },
    {
        /* Opt-in, behind its own subpath, and by far the largest artifact
           here: micromark, mdast and `yaml` are a complete CommonMark +
           GFM parser and serializer. It is not in the root entry and not
           in the chunk the other two share, which is the property that
           actually matters -- a script-tag consumer, and a consumer of
           the plain editor, pay none of it. The markdown MODE (the
           constraint profile) is dependency-free and unaffected.

           Only a CMS shell that reads and writes markdown loads this, and
           by then it has already loaded the editor. */
        name: 'markdown entry',
        path: 'dist/markdown.js',
        limit: '100 kB',
        gzip: true
    },
    {
        /* The git-backed half: config, the GitHub client, the entry
           workflow. Its own build, not part of the chunk `index` and
           `element` share, because it imports nothing from the library --
           scripts/build.mjs asserts that against the artifact. A shell
           loads it alongside one of those entries; a site that only edits
           pays none of it. */
        name: 'cms entry',
        path: 'dist/cms.js',
        limit: '4 kB',
        gzip: true
    },
    {
        /* The YAML parser, reached only by `loadConfig` and only when the
           config file is not JSON -- so a JSON-configured site never
           downloads it. It is a second copy of the `yaml` already inside
           dist/markdown.js, which is the price of keeping the two entries
           in separate builds; budgeted separately so the duplication is
           visible rather than folded into a number nobody reads. */
        name: 'cms lazy YAML chunk',
        path: 'dist/cms-chunks/*.js',
        limit: '45 kB',
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
