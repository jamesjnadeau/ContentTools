import {createFakeGitHub, forgetToken, openAt, shellFetch, until}
    from './helpers.js';
import {DIRECTORY_LIMIT} from '../../../src/cms/github.js';

const SEED = '# Gallery\n\nOne.\n';
const ENTRY = 'content/blog/hello.md';

/* A real 1x1 PNG, because a tile MEASURES what it is handed: it waits for
   the thumbnail to decode before it will show it, so a made-up byte
   string never gets past the loading state. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN'
    + 'kYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/* The library: the `#/media` route, and nothing else.
 *
 * READ-ONLY since M6-3, which is what this file lost most of. There is no
 * Insert button and no panel under an open entry, because there is no
 * editor under `/admin` for either to reach: a picture goes into an entry
 * where the entry's words are, which is the site's own page. Putting one
 * there is `test/browser/edit/media.spec.js`, which is also where the
 * one-commit property moved to.
 *
 * `media-view.spec.js` drives the grid directly, so what only this file
 * can see is the WIRING -- whether the folder the shell lists is the one
 * the grid renders, and whether a thumbnail the published site does not
 * serve is fetched with the token instead.
 */
describe('the media library', function() {

    let el = null;

    beforeEach(function() {
        forgetToken();
    });

    afterEach(function() {
        if (el) {
            el.remove();
            el = null;
        }
        forgetToken();
        history.replaceState(null, '', location.pathname + location.search);
    });

    /* A media folder with one picture, one file that is not a picture,
       and a subdirectory -- the three shapes a tile has to tell apart. */
    const FOLDER = {
        [ENTRY]: SEED,
        'static/images/cat.png': {base64: PNG_BASE64},
        'static/images/notes.pdf': 'not a picture',
        'static/images/thumbs/small.png': {base64: PNG_BASE64}
    };

    async function openAtHash(hash, files = FOLDER) {
        const fake = createFakeGitHub({files});
        const mounted = await openAt(hash, {fake});
        el = mounted.el;
        return mounted;
    }

    const tiles = () => [...el.shadowRoot.querySelectorAll('.ct-cms__media-item')];
    const names = () => tiles()
        .map(t => t.querySelector('.ct-cms__media-name').textContent);
    const tileFor = name => tiles()
        .find(t => t.querySelector('.ct-cms__media-name').textContent === name);
    const blobReads = fake => fake.requests
        .filter(([method, path]) => method === 'GET' && path.includes('/git/blobs/'));
    const folderReads = fake => fake.requests.filter(([method, path]) =>
        method === 'GET' && path.startsWith('/repos/owner/site/contents/static/images'));

    describe('the #/media route', function() {

        it('shows what the folder holds, and not its subdirectories',
           async function() {
            /* A `thumbs/` folder beside the images would otherwise
               become a tile with a broken preview, and a name an author
               would try to copy into a post. */
            await openAtHash('#/media');
            await until(() => tiles().length > 0, 'the grid to fill');
            return expect(names().sort()).toEqual(['cat.png', 'notes.pdf']);
        });

        it('reads a picture the published site does not serve', async function() {
            /* The day-one case for every deployment: `publicPath` points
               at a site that has not been built yet, so the tile's first
               try 404s for real against this test server. Without the
               fallback the library is an empty-looking grid over a folder
               full of pictures. */
            const {fake} = await openAtHash('#/media');
            const image = () => tileFor('cat.png')?.querySelector('.ct-cms__media-thumb');
            await until(() => tiles().length > 0, 'the grid to fill');
            expect(image().getAttribute('src')).toBe('/images/cat.png');

            await until(() => image().src.startsWith('blob:'),
                        'the authenticated read to land');
            return expect(blobReads(fake).length).toBe(1);
        });

        it('never asks the API for a file it could not show anyway',
           async function() {
            /* The PDF has no `src`, so it makes no request at all --
               neither the public one nor the authenticated fallback.
               One rate-limited request per unshowable file is the cost
               of getting this wrong, and nothing on screen says so. */
            const {fake} = await openAtHash('#/media');
            await until(() => tiles().length > 0, 'the grid to fill');
            await until(() => blobReads(fake).length === 1, 'the png to be read');

            const pdf = tileFor('notes.pdf');
            expect(pdf.querySelector('.ct-cms__media-thumb').hasAttribute('src'))
                .toBe(false);
            return expect(blobReads(fake).length).toBe(1);
        });

        it('says a folder was cut short rather than showing a short grid',
           async function() {
            /* GitHub returns the first 1000 entries of a directory and
               says so nowhere, and the count that matters is the RAW
               one: this folder holds 999 files and one subdirectory, so
               it is at the cap while the grid shows 999 tiles. Counting
               the tiles would call it complete, and the author of the
               thousandth picture would look at a folder their own upload
               is missing from.

               Named `.txt` rather than `.png` so that a thousand tiles
               ask for nothing: the point here is the count, and an image
               per tile is a thousand requests to make it. */
            const files = {[ENTRY]: SEED, 'static/images/sub/deep.png':
                           {base64: PNG_BASE64}};
            for (let i = 0; i < DIRECTORY_LIMIT - 1; i += 1) {
                files[`static/images/file-${String(i).padStart(4, '0')}.txt`] = 'x';
            }
            await openAtHash('#/media', files);
            await until(() => tiles().length === DIRECTORY_LIMIT - 1,
                        'the grid to fill');
            return expect(el.shadowRoot.querySelector(
                '.ct-cms__media .ct-cms__note').textContent)
                .toContain('only the first part');
        });

        it('says it is loading rather than that the folder is empty',
           async function() {
            /* The two answers are not the same one, and reading the
               wrong one is how an author decides the uploads they made
               last week are gone. The listing is held open, so the grid
               is genuinely mid-flight rather than merely quick. */
            const fake = createFakeGitHub({files: FOLDER});
            const base = shellFetch(fake);
            let release = null;
            const held = new Promise(resolve => {
                release = resolve;
            });
            const mounted = await openAt('#/media', {
                fake,
                async fetch(input, init) {
                    const url = typeof input === 'string'
                        ? input : String(input.url ?? input);
                    if (url.includes('/contents/static/images')) {
                        await held;
                    }
                    return base(input, init);
                }
            });
            el = mounted.el;
            const note = () => el.shadowRoot
                .querySelector('.ct-cms__media .ct-cms__note').textContent;
            expect(note()).toBe('Loading…');
            release();
            await until(() => tiles().length > 0, 'the grid to fill');
            return expect(note()).not.toBe('Loading…');
        });

        it('shows an SVG, which is the one format the bytes cannot speak for',
           async function() {
            /* An `<img>` sniffs a PNG out of a typeless Blob and refuses
               to sniff an SVG, because it is XML -- so the content type
               `imageType` returns is what makes this tile render at all,
               and it fails as a broken picture with nothing logged. */
            const files = {
                [ENTRY]: SEED,
                'static/images/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"'
                    + ' width="4" height="4"><rect width="4" height="4"/></svg>'
            };
            await openAtHash('#/media', files);
            const image = () => tileFor('logo.svg')
                ?.querySelector('.ct-cms__media-thumb');
            await until(() => image()?.src.startsWith('blob:'),
                        'the authenticated read to land');
            return until(() => image().naturalWidth === 4, 'the SVG to decode');
        });

        it('offers nothing to insert with, and says where pictures go',
           async function() {
            /* The screen has no editor to insert into, so it has no
               Insert button at all -- and an empty folder has to say
               where uploads come from, or an author looking at "nothing
               here" goes hunting for the upload button this screen
               deliberately does not have. */
            await openAtHash('#/media');
            await until(() => tiles().length > 0, 'the grid to fill');
            expect(el.shadowRoot.querySelector('.ct-cms__media-insert')).toBe(null);

            await openAtHash('#/media', {[ENTRY]: SEED});
            await until(() => el.shadowRoot.querySelector(
                '.ct-cms__media .ct-cms__note').textContent !== 'Loading…',
                        'the empty folder');
            return expect(el.shadowRoot.querySelector('.ct-cms__media .ct-cms__note')
                            .textContent).toContain('from inside an entry');
        });

        it('says nothing, and takes up no room, once the folder has loaded',
           async function() {
            /* The last of the note's four answers, and the only one
               that is an absence. It used to be a sentence -- "Open an
               entry to insert one of these into it" -- and it went with
               Insert in M6-3.

               Through the COMPUTED style rather than `textContent`,
               which is the M5-2 lesson: an empty `<p>` still carries
               the UA's 1em above and below, so a note that merely
               empties itself pushes the grid two lines down the page
               every time it has nothing to say. `.ct-cms__note:empty`
               is what stops it, and nothing but a computed style can
               see whether a rule acts on a class name. */
            await openAtHash('#/media');
            await until(() => tiles().length > 0, 'the grid to fill');

            const note = el.shadowRoot.querySelector('.ct-cms__media .ct-cms__note');
            expect(note.textContent).toBe('');
            return expect(getComputedStyle(note).display).toBe('none');
        });

        it('gives back every object URL it made, once it is really gone',
           async function() {
            /* Deferred and checked, because a DOM MOVE fires
               `disconnectedCallback` synchronously before the reconnect
               -- and a revoked object URL is not an error anywhere, it is
               a grid of broken pictures after a reparent, with the tiles
               kept by key so nothing re-fetches them. */
            await openAtHash('#/media');
            /* Waited on the SRC, not on the request. The blob read
               landing is one tick short of the URL being assigned, so
               waiting on `blobReads(fake).length` reads `src` before the
               tile has one -- green on a quiet machine and red on a
               loaded one, which is the worst shape a gate can have. */
            const thumb = () => tileFor('cat.png')?.querySelector('.ct-cms__media-thumb');
            await until(() => thumb()?.src.startsWith('blob:'),
                        'the object URL to reach the tile');
            const url = thumb().src;

            const revoked = [];
            const real = URL.revokeObjectURL.bind(URL);
            URL.revokeObjectURL = value => {
                revoked.push(value);
                real(value);
            };
            try {
                // A move: out and straight back in. Nothing is released.
                const parent = el.parentNode;
                el.remove();
                parent.appendChild(el);
                await Promise.resolve();
                expect(revoked).toEqual([]);

                el.remove();
                await until(() => revoked.length > 0, 'the URL to be revoked');
                expect(revoked).toEqual([url]);
            } finally {
                URL.revokeObjectURL = real;
            }
        });
    });

});
