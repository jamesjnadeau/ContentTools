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
 * Each ESM entry is measured against `closureOf()` -- itself plus exactly
 * the chunks it statically imports, transitively -- rather than against a
 * `dist/chunks/*.js` glob. The glob worked while `markdown` was
 * self-contained, and stopped working the day the shell arrived: the shell
 * imports markdown, which makes ~98 kB of micromark reachable from two
 * entries, so Rollup hoists it into `dist/chunks/` and the glob charges all
 * of it to `dist/index.js` -- a file that is 312 bytes gzipped and loads
 * none of it. The alarm the glob was really for is preserved exactly,
 * because a chunk an entry genuinely starts importing IS in its closure.
 *
 * The chunk names stay Rollup's: naming them with `manualChunks` breaks
 * the element's side-effect registration, see vite.config.mjs. What keeps
 * a hand-rolled walker honest is `orphanChunks()` in scripts/build.mjs --
 * a chunk no entry reaches fails the build, so a walker that stops
 * following some future import form cannot quietly under-measure.
 *
 * These budgets are only meaningful against a FRESH build, which is why
 * `test:size` builds first. Measuring a stale `dist/` reported a pass for
 * a commit CI then failed.
 */
import {closureOf} from './scripts/chunk-closure.mjs';

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
        path: closureOf('dist/index.js'),
        limit: '57 kB',
        gzip: true
    },
    {
        /* The same chunk, plus the element and the inlined icon font
           (~9 kB of base64). The interesting number is the DIFFERENCE from
           the line above: if it ever approaches their sum, the chunk has
           stopped being shared and there are two copies of the library. */
        name: 'ESM element entry + shared chunk',
        path: closureOf('dist/element.js'),
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
           by then it has already loaded the editor.

           10 kB -> 11 kB with the frontmatter field schema: `options`,
           `default`, the pathed errors that refuse a `select` with
           nothing to select from, and `fieldsFor`. That last one is here
           rather than in the shell because a file collection declares
           its fields per FILE, so resolving them is the same lookup
           `entryPath` does -- and two places that resolve a slug to a
           file are two places that can disagree about which file an
           entry is. */
        name: 'markdown entry',
        path: closureOf('dist/markdown.js'),
        limit: '100 kB',
        gzip: true
    },
    {
        /* The git-backed half: config, the GitHub client, the entry
           workflow, media staging, editorial status and the token
           adapter. Its own build, not part of the chunk `index` and
           `element` share, because it imports nothing from the library --
           scripts/build.mjs asserts that against the artifact. A shell
           loads it alongside one of those entries; a site that only edits
           pays none of it.

           11 kB -> 12 kB with create and delete: `slugify`, `expandSlug`
           and the slug-template rules, `deleteEntry`, and the `create`
           flag that settles the two-authors race. `slugify` is shared
           with `safeFilename` rather than written twice, which is the
           only reason this is 1 kB and not two -- a media file and an
           entry named from the same title have to agree on what a
           filename is.

           12 kB -> 13.5 kB with the GitHub App adapter: the redirect
           out, the resume back, PKCE, and the expiry arithmetic. The
           largest single addition this entry has taken, and it buys the
           thing the PAT adapter cannot -- authors who sign in rather
           than being taught what a fine-grained token is. Both adapters
           are named exports of one entry, so a deployment that stays on
           the PAT pays it here; the shell's own build tree-shakes
           whichever adapter it does not construct.

           13.5 kB -> 15.5 kB with the page mapping: `src/cms/preview.ts`
           -- both directions of one mapping, so a URL built from a
           collection's `page` template is recognised by the same
           spelling that built it -- plus the `site` block and the
           `page`/`body` schema with their pathed errors. It is here
           rather than in the shell because in-page editing has two
           readers that must agree about which entry a page is: the
           script on the site's own page, and the /admin listing that
           links to it. Two places that answer that question are two
           places that can disagree. */
        name: 'cms entry',
        path: closureOf('dist/cms.js'),
        limit: '15.5 kB',
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
        /* The OAuth code exchange, which runs on a server rather than in
           a browser -- the only artifact here that does.

           Budgeted anyway, and small on purpose: it is the module that
           holds an App's client secret, so anything that arrives in it
           arrives next to one. With no imports at all there is nothing
           here but the handler, and a jump in this number means the file
           grew a dependency that scripts/build.mjs's import check somehow
           did not see. */
        name: 'proxy entry',
        path: 'dist/proxy.js',
        limit: '1.5 kB',
        gzip: true
    },
    {
        /* The shell: the collection browser, entry editor, media library
           and editorial workflow, as `<content-tools-cms>`.

           It is in the SAME build as `index` and `element` so the page
           gets one copy of the library and therefore one EditorApp, and
           its closure is where the cost of that shows honestly: once it
           mounts the editor and reads markdown it carries both of their
           chunks, and this number becomes roughly their sum. That is the
           point -- a shell is an application, and a page that loads it
           loads all of it. `src/cms/` is inlined rather than shared with
           dist/cms.js: a second copy in the package, never on a page.

           1 kB -> 17 kB with the frame: the whole of `src/cms/` inlined
           (9.4 kB gzipped as its own entry) plus routing, rendering,
           the views and the stylesheet. 17 kB -> 19.5 kB with the entry
           list. Then 19.5 kB -> 205 kB with the entry EDITOR, which is
           the jump this comment warned was coming and is almost none of
           it the shell's own code: ~24 kB for the editor element and
           ~56 kB for the library behind it, plus ~98 kB of micromark,
           mdast and `yaml` for the markdown round trip. Roughly the sum
           of the `element` and `markdown` budgets, which is exactly what
           a shell that mounts an editor and parses markdown is.

           Both imports are STATIC, and that was the choice. A lazy
           chunk would keep this number small and move the failure: the
           editor's tag has to be registered before the shell creates
           one, and a chunk that 404s from a static host then fails
           nowhere until somebody opens an entry -- long after whoever
           deployed it has stopped looking.

           `yaml` folded into the markdown chunk with the same change,
           because the shell's dynamic `loadConfig` import is no longer
           its only path there: `src/markdown/parse.ts` imports it
           statically, and a chunk two entries reach statically is one
           chunk. A JSON-configured site still downloads it here, which
           is honestly reported rather than argued away -- the parser
           beside it is 98 kB, so the asymmetry stopped being worth a
           chunk boundary. `dist/cms.js`'s lazy copy is unaffected.

           205 kB -> 208 kB with the frontmatter form: ten widgets, the
           merge and the rules for them. Small beside the ~186 kB of
           editor and parser above, which is the shape this number keeps
           having -- the shell's own code is a rounding error against
           what a shell that mounts an editor and parses markdown
           carries.

           208 kB -> 212 kB with create and delete: the naming view and
           its live filename preview, the confirm panel, and the two
           collision checks. Same shape again.

           212 kB -> 216 kB with the media library: the grid, the tile
           state machine behind its public-URL-first thumbnails, the
           insert path into the open editor, and their rules.

           216 kB -> 218 kB with the review list: one view, the status
           moves behind it, and the shared labels the entry list already
           said. The smallest rise of the milestone, and it should be --
           the screen is a list of rows that link out.

           218 kB -> 220 kB with the GitHub App adapter reaching the
           shell: the second gate panel, `backend.auth`, the boot resume,
           and the adapter itself, which is in here as SOURCE rather than
           through `dist/cms.js` and so is counted twice across the
           package. A deployment that stays on personal access tokens
           pays for it and cannot not -- the config decides which adapter
           is built, and a config is read at runtime. */
        name: 'shell entry + its chunks',
        path: closureOf('dist/shell.js'),
        limit: '220 kB',
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
