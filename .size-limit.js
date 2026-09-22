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
import {closureOf, lazyClosureOf} from './scripts/chunk-closure.mjs';

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
           is built, and a config is read at runtime.

           220 kB -> 222 kB for a change that added NO code to the shell
           at all: the in-page script arrived as a fifth entry of this
           build, and it shares `src/cms/config.ts` and
           `src/core/render.ts` with the shell -- so Rollup hoists both
           into a chunk the shell now imports rather than inlining. Most
           of the 1.4 kB is gzip: a dictionary built over one 158 kB file
           compresses better than two files compressed apart, and this
           entry is measured as the bytes we publish. It is the cost of
           the two surfaces sharing one answer to what an entry is, and
           it is the right thing to pay -- two copies of that mapping are
           two places that can disagree about which entry a page is
           showing.

           222 kB -> 224 kB the same way, and again for no shell code:
           the in-page script now mounts an editor, so `EntrySession`,
           the editor element and the markdown parser are all reached by
           two entries instead of one and Rollup splits each into its own
           chunk. `dist/shell.js` itself drops 143 kB -> 101 kB raw; the
           closure grows 1.5 kB because five files gzipped apart do not
           compress as well as two, and what this budget measures is the
           bytes a page downloads. The published total is what it was;
           only the boundaries moved.

           224 kB -> 145 kB, which is a RATCHET DOWN and the only one in
           this file. /admin stopped being an editor in M6-3: the words
           of an entry are written on the site's own page, so the editor
           element, the whole ContentEdit library behind it and the
           markdown parser that turns a region back into bytes are none
           of them reached from here any more. What is left is the
           management screens and the frontmatter form -- and `yaml`,
           because a frontmatter block still has to be read and written.
           The budget is lowered rather than left slack on purpose: a
           slack budget is not a budget, and the failure it now guards
           is a static import of the editor creeping back in, which
           would show up here as +80 kB and nowhere else. */
        name: 'shell entry + its chunks',
        path: closureOf('dist/shell.js'),
        limit: '145 kB',
        gzip: true
    },
    {
        /* The script a site puts on EVERY page, and the only number here
           that is paid by people who are not using this software.

           A blog's readers outnumber its authors by a very long way, so
           this file is the decision and nothing else: a query flag, two
           storage keys, and a dynamic import for everything behind it.
           Its static closure is therefore the whole cost to a reader,
           and it is the number to defend -- a jump here means something
           heavy has become a STATIC import of the loader, which is the
           one mistake this entry's whole shape exists to prevent. The
           budget is the alarm, because nothing else would ring: the site
           would keep working perfectly, a little slower, for everybody.

           749 B -> 1.36 kB in M6-4, and the limit deliberately does NOT
           move with it: the headroom is what is left to spend, and
           spending it on something a reader cannot use should have to
           be argued for. What arrived is `readHandoff` -- the token
           `/admin` puts on the fragment has to come off the URL before
           anything is downloaded, so it cannot live behind the dynamic
           import like everything else does. About a tenth of the rise
           is the WRITE half (`handoffFragment`, `withEditFlag`), which
           only the shell calls and a reader still carries, because both
           entries reach one module and Rollup shares it. That is the
           price of the two surfaces spelling the handoff in one place,
           and it is the right way round: a flag spelled twice is a link
           that opens a page where nothing happens. */
        name: 'edit entry (every page)',
        path: closureOf('dist/edit.js'),
        limit: '1.5 kB',
        gzip: true
    },
    {
        /* What pressing Edit costs: everything `dist/edit.js` reaches
           only through `import(...)`.

           Measured as a set difference rather than a glob because this
           chunk shares `dist/chunks/` with the library -- see
           `lazyClosureOf`.

           53 kB -> 202 kB with the mount, and the rise is the editor
           arriving: ~25 kB for the editor element, ~56 kB for the
           library behind it, and ~98 kB of micromark, mdast and `yaml`
           for the markdown round trip -- roughly the sum of the
           `element` and `markdown` budgets, which is the same shape the
           shell's number took at M5-3 and for the same reason. An
           author editing on the site downloads what an author editing
           under /admin downloads, because it is the same editor reading
           the same bytes.

           202 kB -> 207 kB for the frontmatter form and Submit: nine
           widgets, the form view, the merge, the described failures and
           this surface's own rules for all of it. Small because almost
           none of it is new code -- the widgets, `describeError` and
           the byte-preserving merge are `src/entry/`, shared with the
           shell rather than written twice, so what arrived here is one
           controller and one stylesheet.

           What matters is which side of the `import()` it is on. The
           budget above -- `edit entry (every page)`, 1.5 kB -- is the
           one a reader pays, and it did not move. This one is paid once
           by the person who pressed Edit, and a jump HERE is only ever
           news about the editor; a jump THERE would mean the decision
           had stopped being a decision.

           207 kB -> 209 kB for the same reason the shell's number fell
           by eighty: M6-3 took the editor out of /admin, so the editor,
           the library and the markdown parser are reached by ONE entry
           now instead of two. Rollup stops splitting them out and
           inlines them here, and a few large files gzipped together do
           not weigh quite what the same code weighed split across
           chunks. No code arrived; the boundary moved, and this side of
           it is where it moved to. */
        name: 'edit lazy surface',
        path: lazyClosureOf('dist/edit.js'),
        limit: '209 kB',
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
