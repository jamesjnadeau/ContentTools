import {createFakeGitHub, editorOf, forgetToken, openAt, shellFetch, until}
    from './helpers.js';
import {DIRECTORY_LIMIT} from '../../../src/cms/github.js';

/* An image and the entry that references it, in ONE commit.
 *
 * `MediaStore` and `mediaUploader` are tested on their own in
 * test/browser/cms/media.spec.js. What only this file can see is whether
 * the SHELL wires them together: whether the uploader it hands the editor
 * is stocked from the media folder that actually exists, whether the
 * store it rewrites against at save time is the same one the uploader
 * staged into, and whether the bytes reach the same commit as the entry.
 *
 * Two commits, or an entry referencing a blob:// URL, is the failure --
 * and either one produces a pull request that looks fine in the list and
 * a published page with a broken image.
 */

const SEED = '# Gallery\n\nOne.\n';

/* A real 1x1 PNG, because the uploader MEASURES what it is handed before
   it previews it -- it loads the object URL into an `Image` to get the
   natural size the dialog shows. A made-up byte string fails that load,
   so the whole staging path would never run and the test would be
   asserting about an upload that was refused. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN'
    + 'kYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function pngBytes() {
    return Uint8Array.from(atob(PNG_BASE64), c => c.charCodeAt(0));
}
const ENTRY = 'content/blog/hello.md';
const BRANCH = 'cms/blog/hello';

/** The parts of `ContentTools.ImageDialog` the uploader touches. */
function fakeDialog() {
    const handlers = new Map();
    return {
        calls: [],
        addEventListener(name, handler) {
            handlers.set(name, handler);
        },
        fire(name, detail) {
            return handlers.get(name)({detail: () => detail});
        },
        clear() { this.calls.push(['clear']); },
        progress(value) { this.calls.push(['progress', value]); },
        state(value) { this.calls.push(['state', value]); },
        populate(url, size) { this.calls.push(['populate', url, size]); },
        save(url, size, attrs) { this.calls.push(['save', url, size, attrs]); }
    };
}

describe('media travels with its entry', function() {

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

    async function open(files = {[ENTRY]: SEED}) {
        const fake = createFakeGitHub({files});
        const mounted = await openAt('#/c/blog/e/hello', {fake});
        el = mounted.el;
        await until(() => editorOf(el)?.state === 'editing', 'the editor to start');
        return mounted;
    }

    /**
     * Stage a file through the uploader the shell gave the editor, and
     * return the URL it told the dialog to preview.
     *
     * Called with the real `imageUploader` property rather than a store
     * built here: the property IS the seam the image dialog uses, so
     * anything the shell forgot to pass fails at this line.
     */
    async function stage(name = 'Cat.png') {
        const dialog = fakeDialog();
        editorOf(el).imageUploader(dialog);
        await dialog.fire('imageuploader.fileready', {
            file: new File([pngBytes()], name, {type: 'image/png'})
        });
        const populate = dialog.calls.find(call => call[0] === 'populate');
        expect(populate).not.toBe(undefined);
        return populate[1];
    }

    /** Put an image referencing `url` into the open region. */
    function insertImage(url) {
        const region = editorOf(el).editorApp.regions().body;
        const image = new ContentEdit.Image({src: url});
        region.attach(image, region.children.length);
        image.taint();
        return image;
    }

    async function submit() {
        const button = el.shadowRoot.querySelector('.ct-cms__entry-submit');
        button.click();
        await until(() => !button.disabled, 'the save to finish');
    }

    it('commits the bytes and the entry together, under the public path',
       async function() {
        const {fake} = await open();
        insertImage(await stage());
        await submit();

        /* ONE commit. Two is the failure `MediaStore` exists to
           prevent: a reviewer sees a post pointing at a file that
           arrives in the next commit, and an abandoned edit leaves the
           blob behind for ever. */
        expect(fake.history(BRANCH).length).toBe(2);
        expect(fake.paths(BRANCH)).toContain('static/images/cat.png');
        /* The BYTES, not just the path. Media goes up base64-encoded,
           and a mangled encoding produces a file of the right name and
           the wrong length -- a broken image in a green pull request. */
        expect([...fake.bytes('static/images/cat.png', BRANCH)])
            .toEqual([...pngBytes()]);

        /* And the saved markdown references the PUBLIC path. A blob://
           URL surviving into the file is the other half of the same
           failure: the commit is fine and the published page is broken. */
        const saved = fake.read(ENTRY, BRANCH);
        expect(saved).toContain('/images/cat.png');
        return expect(saved).not.toContain('blob:');
    });

    it('resolves a collision against what the folder already holds',
       async function() {
        /* At STAGE time, not commit time: the URL the editor shows has
           to be the URL that ends up in the file, so renaming later
           would leave the entry pointing at a name nothing was written
           to. The shell is what lists the folder, so only a shell test
           proves the names ever reach the store. */
        const {fake} = await open({[ENTRY]: SEED, 'static/images/cat.png': 'OLD'});
        insertImage(await stage());
        await submit();

        expect(fake.read(ENTRY, BRANCH)).toContain('/images/cat-1.png');
        // And the original is untouched.
        return expect(new TextDecoder().decode(fake.bytes('static/images/cat.png', BRANCH)))
            .toBe('OLD');
    });

    it('needs the media folder listed before anything can be staged',
       async function() {
        /* A guard on the test above rather than a claim of its own: if
           the shell ever stopped listing the folder, `taken` would be
           empty and the collision test would silently start passing for
           the wrong reason -- a first upload always gets its plain
           name. */
        const {fake} = await open({[ENTRY]: SEED, 'static/images/cat.png': 'OLD'});
        expect(fake.requests.some(([method, path]) =>
            method === 'GET' && path.startsWith('/repos/owner/site/contents/static/images')))
            .toBe(true);
    });

    it('commits nothing for an image that was staged and then removed',
       async function() {
        /* One pass answers both "what does the HTML say" and "what must
           be committed", so they cannot disagree. An image inserted and
           then deleted is staged, unreferenced, and never reaches the
           repository. */
        const {fake} = await open();
        const image = insertImage(await stage());
        image.parent().detach(image);
        await submit();

        /* No branch at all: with the image gone the entry is back to
           exactly what the repository holds, so there is nothing to
           open a pull request for. */
        expect(fake.branches()).toEqual(['main']);
        return expect(fake.paths('main')).not.toContain('static/images/cat.png');
    });
});

/* The library itself: the `#/media` route and the panel under an entry.
 *
 * `media-view.spec.js` drives the grid directly, so what only this file
 * can see is the WIRING -- whether the folder the shell lists is the one
 * the grid renders, whether a thumbnail the published site does not serve
 * is fetched with the token instead, whether an Insert reaches the open
 * editor's own tree, and whether an insert survives a save.
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
               become a tile with a broken preview and an Insert button
               that writes an `<img>` pointing at a directory. */
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

        it('offers nothing to insert, because nothing is open', async function() {
            await openAtHash('#/media');
            await until(() => tiles().length > 0, 'the grid to fill');
            expect(tileFor('cat.png').querySelector('.ct-cms__media-insert').hidden)
                .toBe(true);
            return expect(el.shadowRoot.querySelector('.ct-cms__media .ct-cms__note')
                            .textContent).toContain('Open an entry');
        });

        it('gives back every object URL it made, once it is really gone',
           async function() {
            /* Deferred and checked, because a DOM MOVE fires
               `disconnectedCallback` synchronously before the reconnect
               -- and a revoked object URL is not an error anywhere, it is
               a grid of broken pictures after a reparent, with the tiles
               kept by key so nothing re-fetches them. */
            const {fake} = await openAtHash('#/media');
            await until(() => blobReads(fake).length === 1, 'the read to land');
            const image = tileFor('cat.png').querySelector('.ct-cms__media-thumb');
            const url = image.src;
            expect(url.startsWith('blob:')).toBe(true);

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

    describe('the panel under an open entry', function() {

        async function openEntry(files = FOLDER) {
            const mounted = await openAtHash('#/c/blog/e/hello', files);
            await until(() => editorOf(el)?.state === 'editing', 'the editor to start');
            return mounted;
        }

        const toggle = () => el.shadowRoot.querySelector('.ct-cms__entry-media');

        async function showPanel() {
            toggle().click();
            await until(() => tiles().length > 0, 'the panel to fill');
        }

        it('is closed until it is asked for', async function() {
            await openEntry();
            expect(tiles()).toEqual([]);
            return expect(toggle().getAttribute('aria-expanded')).toBe('false');
        });

        it('costs no second listing of the folder', async function() {
            /* The names the uploader stages against and the files the
               panel shows come from ONE round trip. Two would be two
               answers that can differ -- a picture uploaded from another
               tab appearing in the panel while the store still thinks
               its name is free, so the next upload overwrites it. */
            const {fake} = await openEntry();
            const before = folderReads(fake).length;
            await showPanel();
            expect(before).toBe(1);
            return expect(folderReads(fake).length).toBe(1);
        });

        it('is a toggle, not a link', async function() {
            /* Navigating to `#/media` closes the entry -- `_navigate`
               releases the editor's lease before it fetches anything --
               so a link would throw away the unsaved work somebody
               opened the picker to add a picture to. */
            await openEntry();
            await showPanel();
            expect(location.hash).toBe('#/c/blog/e/hello');
            expect(toggle().getAttribute('aria-expanded')).toBe('true');
            expect(editorOf(el)).not.toBe(null);

            toggle().click();
            expect(tiles()).toEqual([]);
            return expect(toggle().getAttribute('aria-expanded')).toBe('false');
        });

        it('puts the picture into the entry, and the save writes one line',
           async function() {
            const {fake} = await openEntry();
            await showPanel();
            const insert = tileFor('cat.png').querySelector('.ct-cms__media-insert');
            await until(() => !insert.disabled, 'the thumbnail to decode');
            insert.click();

            /* Into the EDITOR's own tree, not the region's DOM behind
               its back: ContentEdit keeps its model beside the DOM, so a
               node it does not know about is silently dropped by the
               next save and the entry commits unchanged. */
            const body = editorOf(el).editorApp.regions().body;
            expect(body.children[body.children.length - 1].type()).toBe('Image');

            const button = el.shadowRoot.querySelector('.ct-cms__entry-submit');
            button.click();
            await until(() => !button.disabled, 'the save to finish');

            const saved = fake.read(ENTRY, BRANCH);
            expect(saved).toContain('![cat.png](/images/cat.png)');
            /* Nothing was staged and nothing was re-committed: the file
               is in the repository already, so the tree carries the
               entry and nothing else. */
            expect(saved.startsWith(SEED)).toBe(true);
            return expect(fake.history(BRANCH).length).toBe(2);
        });

        it('is there for an entry that does not exist yet either',
           async function() {
            /* The create route holds an open editor once the entry has
               been named, and it is a BRANCH of the route rather than a
               route of its own -- so the panel has to be reached from
               there too. An author writing a new post is the likeliest
               person in the deployment to want a picture, and sending
               them to `#/media` for it would close the post. */
            await openAtHash('#/c/blog/new');
            const title = el.shadowRoot.querySelector('.ct-cms__create-form input');
            title.value = 'A new post';
            title.dispatchEvent(new Event('input', {bubbles: true}));
            el.shadowRoot.querySelector('.ct-cms__create-form .ct-cms__button').click();
            await until(() => editorOf(el)?.state === 'editing', 'the editor to start');

            expect(location.hash).toBe('#/c/blog/new');
            await showPanel();
            return expect(names().sort()).toEqual(['cat.png', 'notes.pdf']);
        });

        it('goes away with the entry it belonged to', async function() {
            /* Left open, the next entry arrives with a grid of Insert
               buttons already on screen, wired to an entry nobody has
               read yet. */
            await openEntry();
            await showPanel();
            location.hash = '#/c/blog';
            await until(() => el.shadowRoot.querySelector('.ct-cms__entry-list'),
                        'the list to come back');
            expect(tiles()).toEqual([]);

            location.hash = '#/c/blog/e/hello';
            await until(() => editorOf(el)?.state === 'editing', 'the entry to reopen');
            return expect(el.shadowRoot.querySelector('.ct-cms__entry-media')
                            .getAttribute('aria-expanded')).toBe('false');
        });
    });
});
