/* An image and the entry that references it, in ONE commit.
 *
 * `MediaStore` and `mediaUploader` are tested on their own in
 * test/browser/cms/media.spec.js. What only this file can see is whether
 * the in-page SURFACE wires them together: whether the uploader it hands
 * the editor is stocked from the media folder that actually exists,
 * whether the store it rewrites against at save time is the same one the
 * uploader staged into, and whether the bytes reach the same commit as
 * the entry.
 *
 * Two commits, or an entry referencing a blob: URL, is the failure -- and
 * either one produces a pull request that looks fine in the list and a
 * published page with a broken image.
 *
 * This suite used to live under `test/browser/shell/`, against the editor
 * `/admin` mounted. Since M6-3 that screen has none: an image is put into
 * an entry where the entry's words are, which is the site's own page, and
 * this is the surface that has one.
 */

import {DEFAULT_CONFIG_URL, open} from '../../../src/edit/surface.js';
import {BAR_TAG} from '../../../src/edit/chrome.js';
import {TOKEN_KEY} from '../../../src/auth/pat.js';
import {createFakeGitHub} from '../cms/fake-github.js';

const ENTRY = 'content/blog/hello.md';
const BRANCH = 'cms/blog/hello';
const SOURCE = '---\ntitle: Gallery\n---\n\nOne.\n';

const CONFIG = {
    backend: {repo: 'owner/site'},
    media: {folder: 'static/images', publicPath: '/images'},
    collections: [
        {name: 'blog', folder: 'content/blog',
         page: '/blog/{{slug}}/', body: 'article.post'}
    ]
};

const TEMPLATE = '<main class="layout">'
    + '<article class="post"><p>What the site built.</p></article></main>';

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

async function until(check, describe) {
    /* A DEADLINE rather than a count of event-loop turns: some of what
       is waited on here is a real request to the test server, and a
       couple of hundred `setTimeout(0)` turns is not a duration -- on a
       loaded runner it elapses in milliseconds while the round trip has
       not landed. Only paid in full by a test that was going to fail. */
    const deadline = Date.now() + 5000;
    do {
        if (check()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    } while (Date.now() < deadline);
    throw new Error(`${describe} never happened`);
}

/**
 * Press the ignition switch, as a person does.
 *
 * Through the pencil in the editor's own shadow root rather than
 * `editor.start()`, because the switch IS what this surface now turns
 * on: nothing replaces the reader's page until it is pressed, and a
 * test that reached past it would go on passing over a switch that had
 * come unwired.
 */
function pressEdit(session, button = 'edit') {
    session.editor.shadowRoot
        .querySelector(`.ct-ignition__button--${button}`).click();
}

describe('media travels with its entry', function() {

    const planted = [];
    const opened = [];

    afterEach(async function() {
        for (const surface of opened) {
            surface.session?.close();
        }
        opened.length = 0;
        /* Teardown is deferred a microtask so a DOM move is not mistaken
           for a removal. Two, because the lease releases on the second. */
        await Promise.resolve();
        await Promise.resolve();

        for (const node of [...document.querySelectorAll(BAR_TAG)]) {
            node.remove();
        }
        for (const node of planted.splice(0)) {
            node.remove();
        }
        try {
            sessionStorage.removeItem(TOKEN_KEY);
        } catch {
            /* Storage refused, so nothing was ever written to it. */
        }
    });

    /** Open the surface over a page of the site, signed in. */
    async function mount(files = {[ENTRY]: SOURCE}) {
        const host = document.createElement('div');
        host.innerHTML = TEMPLATE;
        document.body.appendChild(host);
        planted.push(host);

        const fake = createFakeGitHub({files});
        sessionStorage.setItem(TOKEN_KEY, 'github_pat_test');

        const surface = await open(
            {document, location: {href: 'https://site.test/blog/hello/'}},
            {
                fetch: async (input, init) => {
                    const at = typeof input === 'string'
                        ? input : String(input.url ?? input);
                    return at === DEFAULT_CONFIG_URL
                        ? new Response(JSON.stringify(CONFIG))
                        : fake.fetch(input, init);
                }
            });
        opened.push(surface);
        /* The switch, pressed. Every test here is about what travels
           with an entry once somebody is editing it, and nothing in
           this file is about the moment before that. */
        pressEdit(surface.session);
        return {fake, surface, bar: surface.bar, session: surface.session};
    }

    /**
     * Stage a file through the uploader the surface gave the editor, and
     * return the URL it told the dialog to preview.
     *
     * Called with the real `imageUploader` property rather than a store
     * built here: the property IS the seam the image dialog uses, so
     * anything the surface forgot to pass fails at this line.
     */
    async function stage(session, name = 'Cat.png') {
        const dialog = fakeDialog();
        session.editor.imageUploader(dialog);
        await dialog.fire('imageuploader.fileready', {
            file: new File([pngBytes()], name, {type: 'image/png'})
        });
        const populate = dialog.calls.find(call => call[0] === 'populate');
        expect(populate).not.toBe(undefined);
        return populate[1];
    }

    /** Put an image referencing `url` into the region being edited. */
    function insertImage(session, url) {
        const region = session.editor.editorApp.regions().body;
        const image = new ContentEdit.Image({src: url});
        region.attach(image, region.children.length);
        image.taint();
        return image;
    }

    const inBar = (bar, selector) => bar.node.shadowRoot.querySelector(selector);

    async function submit(bar) {
        inBar(bar, '.ct-edit__submit').click();
        await until(() => inBar(bar, '.ct-edit__note').textContent !== '',
                    'the bar to report the submit');
    }

    it('commits the bytes and the entry together, under the public path',
       async function() {
        const {fake, session, bar} = await mount();
        insertImage(session, await stage(session));
        await submit(bar);

        /* ONE commit. Two is the failure `MediaStore` exists to prevent:
           a reviewer sees a post pointing at a file that arrives in the
           next commit, and an abandoned edit leaves the blob behind for
           ever. */
        expect(fake.history(BRANCH).length).toBe(2);
        expect(fake.paths(BRANCH)).toContain('static/images/cat.png');
        /* The BYTES, not just the path. Media goes up base64-encoded,
           and a mangled encoding produces a file of the right name and
           the wrong length -- a broken image in a green pull request. */
        expect([...fake.bytes('static/images/cat.png', BRANCH)])
            .toEqual([...pngBytes()]);

        /* And the saved markdown references the PUBLIC path. A blob:
           URL surviving into the file is the other half of the same
           failure: the commit is fine and the published page is
           broken. */
        const saved = fake.read(ENTRY, BRANCH);
        expect(saved).toContain('/images/cat.png');
        return expect(saved).not.toContain('blob:');
    });

    it('resolves a collision against what the folder already holds',
       async function() {
        /* At STAGE time, not commit time: the URL the editor shows has
           to be the URL that ends up in the file, so renaming later
           would leave the entry pointing at a name nothing was written
           to. The surface is what lists the folder, so only a test at
           this level proves the names ever reach the store. */
        const {fake, session, bar} = await mount(
            {[ENTRY]: SOURCE, 'static/images/cat.png': 'OLD'});
        insertImage(session, await stage(session));
        await submit(bar);

        expect(fake.read(ENTRY, BRANCH)).toContain('/images/cat-1.png');
        // And the original is untouched.
        return expect(new TextDecoder()
            .decode(fake.bytes('static/images/cat.png', BRANCH))).toBe('OLD');
    });

    it('commits nothing for an image that was staged and then removed',
       async function() {
        /* One pass answers both "what does the HTML say" and "what must
           be committed", so they cannot disagree. An image inserted and
           then deleted is staged, unreferenced, and never reaches the
           repository. */
        const {fake, session, bar} = await mount();
        const image = insertImage(session, await stage(session));
        image.parent().detach(image);
        await submit(bar);

        /* No branch at all: with the image gone the entry is back to
           exactly what the repository holds, so there is nothing to open
           a pull request for. */
        expect(fake.branches()).toEqual(['main']);
        return expect(fake.paths('main')).not.toContain('static/images/cat.png');
    });
});
