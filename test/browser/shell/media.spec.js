import {createFakeGitHub, editorOf, forgetToken, openAt, until} from './helpers.js';

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
        const button = el.shadowRoot.querySelector('.ct-cms__entry-view .ct-cms__button');
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
