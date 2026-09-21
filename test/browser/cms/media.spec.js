/* Images staged in the browser, committed with the entry that uses them.

   The assertion this file exists for is the rewrite: an object URL left
   in the saved content is an image that renders in the editor, renders in
   the preview, and is a broken link the moment anybody else opens the
   page -- and nothing in the save path errors. Every other test here is
   about not committing bytes nobody asked for. */

import {parseConfig} from '../../../src/cms/config.js';
import {MediaStore, mediaUploader, safeFilename, imageType}
    from '../../../src/cms/media.js';

const CONFIG = parseConfig({
    backend: {repo: 'owner/site'},
    media: {folder: 'static/images', publicPath: '/images'},
    collections: [{name: 'blog', folder: 'content/blog'}]
});

const bytes = text => new TextEncoder().encode(text);
const text = data => new TextDecoder().decode(data);

const store = (taken = []) => new MediaStore({config: CONFIG, taken});

/** Stage a file under a predictable token. */
function stage(media, filename, token = `blob:${filename}`, content = filename) {
    return media.stage({token, filename, bytes: bytes(content)});
}

describe('safeFilename', function() {

    it.each([
        ['cat.png', 'cat.png'],
        ['My Photo.PNG', 'my-photo.png'],
        ['a  b--c.png', 'a-b-c.png'],
        ['-leading-.png', 'leading.png'],
        ['report.final.pdf', 'report-final.pdf'],
        ['.gitignore', 'gitignore'],
        ['noextension', 'noextension'],
        ['%%%.png', 'file.png'],
        ['ünïcode.png', 'unicode.png'],
        ['Ünïcödé Bïld.JPEG', 'unicode-bild.jpeg']
    ])('%s -> %s', function(input, expected) {
        return expect(safeFilename(input)).toBe(expected);
    });

    it('leaves nothing a markdown destination would end early on', function() {
        /* `![](/images/my photo.png)` is not a link to that file: the
           space ends the destination and what renders is broken, with no
           error anywhere. */
        return expect(safeFilename('a b(c)d#e.png')).toBe('a-b-c-d-e.png');
    });
});

describe('imageType', function() {

    it.each([
        ['cat.png', 'image/png'],
        ['cat.jpg', 'image/jpeg'],
        ['cat.jpeg', 'image/jpeg'],
        ['cat.gif', 'image/gif'],
        ['cat.webp', 'image/webp'],
        ['cat.avif', 'image/avif'],
        ['logo.svg', 'image/svg+xml']
    ])('types %s', function(name, type) {
        return expect(imageType(name)).toBe(type);
    });

    it('does not care how the extension was spelled', function() {
        /* A file committed from a phone is as likely to be `IMG_1.JPG` as
           anything else, and a case-sensitive lookup would show it as an
           unreadable tile with no Insert -- a picture the library can see
           in the listing and claims it cannot open. */
        return expect(imageType('IMG_0001.JPG')).toBe('image/jpeg');
    });

    it('refuses what a browser will not draw in an <img>', function() {
        /* Null is not a rejection of the file, it is a refusal to PREVIEW
           and INSERT it. A PDF in the media folder is a reasonable thing
           to have; an `<img>` pointing at one is a broken picture in
           somebody's post. */
        expect(imageType('notes.pdf')).toBe(null);
        return expect(imageType('data.json')).toBe(null);
    });

    it('reads a dotfile as a name rather than an extension', function() {
        /* `.png` is the whole name of a hidden file. Treating the dot as
           a separator would make `.gitkeep` -- which every empty media
           folder in git has -- into a file of type `gitkeep`, and any
           dotfile named after an image format into a picture. */
        expect(imageType('.png')).toBe(null);
        return expect(imageType('.gitkeep')).toBe(null);
    });

    it('refuses a name with no extension at all', function() {
        return expect(imageType('README')).toBe(null);
    });

    it('reads only the LAST extension', function() {
        /* `cat.png.txt` is a text file somebody renamed. Matching the
           first dot would preview it as a PNG and offer to insert it. */
        expect(imageType('cat.png.txt')).toBe(null);
        return expect(imageType('archive.tar.png')).toBe('image/png');
    });
});

describe('MediaStore.stage', function() {

    it('gives a file a repository path and a public URL', function() {
        return expect(stage(store(), 'Cat Picture.png')).toMatchObject({
            filename: 'cat-picture.png',
            path: 'static/images/cat-picture.png',
            url: '/images/cat-picture.png'
        });
    });

    it('does not overwrite a file the repository already has', function() {
        /* Resolved now rather than at commit time: the URL the editor is
           showing has to be the URL that ends up in the file, and
           renaming later would leave the entry pointing at a name nothing
           was written to. */
        return expect(stage(store(['cat.png']), 'cat.png').filename).toBe('cat-1.png');
    });

    it('does not overwrite a file staged a moment ago', function() {
        const media = store();
        stage(media, 'cat.png', 'blob:one');
        expect(stage(media, 'cat.png', 'blob:two').filename).toBe('cat-1.png');
        return expect(stage(media, 'cat.png', 'blob:three').filename).toBe('cat-2.png');
    });

    it('counts from the first free name, not from one', function() {
        return expect(stage(store(['cat.png', 'cat-1.png']), 'cat.png').filename)
            .toBe('cat-2.png');
    });

    it('keeps the extension when it renames', function() {
        return expect(stage(store(['a-tar.gz']), 'a.tar.gz').filename).toBe('a-tar-1.gz');
    });
});

describe('MediaStore.rewrite', function() {

    it('replaces the token with the public URL', function() {
        const media = store();
        const cat = stage(media, 'cat.png');
        const {html} = media.rewrite(`<p><img src="${cat.token}"></p>`);
        return expect(html).toBe('<p><img src="/images/cat.png"></p>');
    });

    it('replaces every occurrence of one token', function() {
        // The same image used twice, which the editor allows by copy and paste.
        const media = store();
        const cat = stage(media, 'cat.png');
        const {html} = media.rewrite(`<img src="${cat.token}"><img src="${cat.token}">`);
        return expect(html).not.toContain('blob:');
    });

    it('reports exactly the files the content still references', function() {
        const media = store();
        const cat = stage(media, 'cat.png', 'blob:cat');
        stage(media, 'dog.png', 'blob:dog');

        const {media: files} = media.rewrite(`<img src="${cat.token}">`);
        expect(files.map(file => file.path)).toEqual(['static/images/cat.png']);
        return expect(text(files[0].bytes)).toBe('cat.png');
    });

    it('commits nothing for content that references nothing', function() {
        /* The abandoned edit: a user inserts an image, thinks better of
           it, deletes it and saves. Committing it anyway leaves a blob in
           the repository that no page points at. */
        const media = store();
        stage(media, 'cat.png');
        return expect(media.rewrite('<p>No image after all.</p>').media).toEqual([]);
    });

    it('leaves content alone when nothing is staged', function() {
        const html = '<p><img src="/images/existing.png"></p>';
        return expect(store().rewrite(html).html).toBe(html);
    });

    it('does not treat a token as a pattern', function() {
        /* An object URL is not a regular expression, and neither is a
           filename. Building one out of a string somebody else chose is
           how a `+` or a `?` becomes a silent non-match. */
        const media = store();
        const odd = media.stage({token: 'blob:a+b?c.png', filename: 'x.png', bytes: bytes('x')});
        return expect(media.rewrite(`<img src="${odd.token}">`).html)
            .toBe('<img src="/images/x.png">');
    });

    it('keeps everything staged, referenced or not', function() {
        // `staged()` is what a shell lists; `rewrite` decides what commits.
        const media = store();
        stage(media, 'cat.png');
        media.rewrite('<p>nothing</p>');
        return expect(media.staged().length).toBe(1);
    });
});

describe('the image uploader', function() {

    /** A recording stand-in for `ContentTools.ImageDialog`. */
    function fakeDialog() {
        const handlers = new Map();
        const calls = [];
        return {
            calls,
            fire(name, detail) {
                return handlers.get(name)({detail: () => detail});
            },
            addEventListener(name, handler) {
                handlers.set(name, handler);
            },
            clear() {
                calls.push(['clear']);
            },
            progress(value) {
                calls.push(['progress', value]);
            },
            state(value) {
                calls.push(['state', value]);
            },
            populate(url, size) {
                calls.push(['populate', url, size]);
            },
            save(url, size, attrs) {
                calls.push(['save', url, size, attrs]);
            }
        };
    }

    function attach(options = {}) {
        const media = options.store ?? store();
        const dialog = fakeDialog();
        mediaUploader({
            store: media,
            createObjectURL: () => 'blob:made-up',
            measure: options.measure ?? (async () => [600, 400])
        })(dialog);
        return {media, dialog};
    }

    const file = (name = 'Cat.png', content = 'CAT') =>
        new File([bytes(content)], name, {type: 'image/png'});

    it('stages the file instead of uploading it', async function() {
        /* The whole point. An upload here leaves an orphan blob when the
           user abandons the edit, and puts the entry and its image in two
           commits when they do not. */
        const {media, dialog} = attach();
        await dialog.fire('imageuploader.fileready', {file: file()});

        expect(media.staged().length).toBe(1);
        return expect(text(media.staged()[0].bytes)).toBe('CAT');
    });

    it('previews the object URL, at the size the browser measured', async function() {
        const {dialog} = attach();
        await dialog.fire('imageuploader.fileready', {file: file()});
        return expect(dialog.calls).toEqual([
            ['progress', 0],
            ['state', 'uploading'],
            ['populate', 'blob:made-up', [600, 400]]
        ]);
    });

    it('saves the object URL, not the public one', async function() {
        /* The editor has to show the image now, and the file is not in
           the repository yet. `MediaStore.rewrite` swaps it at save
           time, so the bytes and the reference to them are decided in
           one place. */
        const {dialog} = attach();
        await dialog.fire('imageuploader.fileready', {file: file()});
        dialog.fire('imageuploader.save');

        return expect(dialog.calls.at(-1))
            .toEqual(['save', 'blob:made-up', [600, 400], {alt: 'cat.png'}]);
    });

    it('saves nothing when no file was chosen', async function() {
        // The dialog's save button with an empty dialog behind it.
        const {dialog} = attach();
        dialog.fire('imageuploader.save');
        return expect(dialog.calls).toEqual([]);
    });

    it('stages nothing when the browser cannot read the image', async function() {
        /* A `.png` that is not one. Staging it anyway commits a file the
           site build breaks on, and the entry references it. */
        const {media, dialog} = attach({
            measure: async () => {
                throw new Error('not an image');
            }
        });
        await dialog.fire('imageuploader.fileready', {file: file()});

        expect(media.staged()).toEqual([]);
        return expect(dialog.calls.at(-1)).toEqual(['clear']);
    });

    it('clears the dialog when the user clears it', function() {
        const {dialog} = attach();
        dialog.fire('imageuploader.clear');
        return expect(dialog.calls).toEqual([['clear']]);
    });

    it('puts the dialog back to empty when the user cancels', function() {
        const {dialog} = attach();
        dialog.fire('imageuploader.cancelupload');
        return expect(dialog.calls).toEqual([['state', 'empty']]);
    });
});
