/* Images the user drops into an entry, held until the entry is saved.
 *
 * The editor's contract is `ContentTools.IMAGE_UPLOADER`: a function handed
 * the image dialog, which is expected to take a `File` and eventually call
 * `dialog.save(url, size, attrs)` with a URL the page can show. The obvious
 * implementation commits the file there and then -- and it is wrong twice
 * over. An edit the user abandons leaves an orphan blob nobody references,
 * and an edit they finish arrives as two commits, so a reviewer opening the
 * first one sees a post pointing at a file that does not exist yet.
 *
 * So nothing is uploaded here. The bytes are staged in memory against the
 * object URL the editor previews, and at save time `rewrite()` swaps every
 * staged URL for the path it will live at, handing back both the corrected
 * HTML and exactly the files that HTML still references. `CmsRepo.saveEntry`
 * puts them in one tree with the entry.
 *
 * `MediaStore` is pure and `mediaUploader` is the browser half. That split
 * is deliberate: the rewrite is the piece that loses somebody's images if
 * it is wrong, and a pure string function can be tested until it is not.
 */

import type {CmsConfig} from './config.js';
import {mediaPath, mediaURL} from './config.js';
import type {MediaFile} from './repo.js';

/** A file waiting for the save that will commit it. */
export interface StagedMedia {
    /**
     * What the HTML holds while editing -- an object URL, normally.
     *
     * `rewrite` looks for this string, so it has to be something no other
     * part of the document could contain.
     */
    token: string;
    /** The name it is committed under, after collision resolution. */
    filename: string;
    /** Where it is committed. */
    path: string;
    /** What the saved content references it by. */
    url: string;
    bytes: Uint8Array;
}

export interface MediaStoreOptions {
    config: CmsConfig;
    /**
     * Filenames the media folder already holds.
     *
     * Collisions are resolved when the file is staged rather than when it
     * is committed, because the URL the editor is showing has to be the
     * URL that ends up in the file -- renaming at commit time would leave
     * the entry pointing at a name nothing was written to.
     */
    taken?: Iterable<string>;
}

/**
 * The filename part a repository can hold and a URL can carry unescaped.
 *
 * A markdown link to `/images/my photo.png` is not a link to that file: the
 * space ends the destination, and what renders is broken with no error
 * anywhere. Percent-encoding would work in the URL and leave the repository
 * with a name nobody can type, so the name itself is made safe instead.
 */
export function safeFilename(filename: string): string {
    const at = filename.lastIndexOf('.');
    /* A leading dot is the whole name of a dotfile, not an extension --
       `.gitignore` has no stem to keep. */
    const stem = at > 0 ? filename.slice(0, at) : filename;
    const extension = at > 0 ? filename.slice(at + 1) : '';

    const clean = (part: string) => part
        .toLowerCase()
        /* Accents come off rather than being replaced: `ünïcode.png`
           should be `unicode.png`, not `n-code.png`, and a European
           filename is not an edge case. Anything with no ASCII form at
           all -- a name written in Chinese, say -- still ends up as
           dashes, which is the best a name a URL can carry unescaped can
           do for it. */
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    /* `file` rather than an empty name, which is what a name written
       entirely in a script this rule cannot spell would otherwise leave. */
    const safe = clean(stem) || 'file';
    const suffix = clean(extension);
    return suffix ? `${safe}.${suffix}` : safe;
}

export class MediaStore {

    private readonly config: CmsConfig;
    private readonly taken: Set<string>;
    private readonly files: StagedMedia[] = [];

    constructor(options: MediaStoreOptions) {
        this.config = options.config;
        this.taken = new Set(options.taken ?? []);
    }

    /** Everything staged, whether or not the content still references it. */
    staged(): readonly StagedMedia[] {
        return this.files;
    }

    /**
     * Hold a file against the URL the editor is showing for it.
     *
     * Returns the record rather than nothing, because the caller has to
     * know the name that survived collision resolution to show it.
     */
    stage(file: {token: string; filename: string; bytes: Uint8Array}): StagedMedia {
        const filename = this.unique(safeFilename(file.filename));
        this.taken.add(filename);

        const staged: StagedMedia = {
            token: file.token,
            filename,
            path: mediaPath(this.config, filename),
            url: mediaURL(this.config, filename),
            bytes: file.bytes
        };
        this.files.push(staged);
        return staged;
    }

    /**
     * Swap every staged URL in `html` for the one the file will have, and
     * report the files that HTML still references.
     *
     * Both answers come from one pass on purpose. Two calls -- rewrite the
     * HTML, then ask separately what to commit -- can disagree, and the way
     * they disagree is an entry referencing an image that was never
     * committed. An image the user inserted and then deleted is simply not
     * in the list: it is staged, unreferenced, and never reaches the
     * repository.
     */
    rewrite(html: string): {html: string; media: MediaFile[]} {
        let out = html;
        const media: MediaFile[] = [];

        for (const file of this.files) {
            if (!out.includes(file.token)) {
                continue;
            }
            /* split/join rather than a RegExp: an object URL is not a
               pattern, and building one out of a string somebody else
               chose is how a `+` or a `?` in a filename becomes a silent
               non-match. */
            out = out.split(file.token).join(file.url);
            media.push({path: file.path, bytes: file.bytes});
        }
        return {html: out, media};
    }

    /** `name.png` → `name-1.png`, until nothing holds the name. */
    private unique(filename: string): string {
        if (!this.taken.has(filename)) {
            return filename;
        }
        const at = filename.lastIndexOf('.');
        const stem = at > 0 ? filename.slice(0, at) : filename;
        const extension = at > 0 ? filename.slice(at) : '';

        for (let n = 1; ; n += 1) {
            const candidate = `${stem}-${n}${extension}`;
            if (!this.taken.has(candidate)) {
                return candidate;
            }
        }
    }
}

// --- the browser half -----------------------------------------------------

/**
 * The parts of `ContentTools.ImageDialog` an uploader touches.
 *
 * Structural, not imported: `src/cms/` is a leaf, and a test enforces it.
 * This is also the entire contract -- if the dialog ever stops offering one
 * of these, the type error lands here rather than at run time in a dialog
 * nobody is watching.
 */
export interface ImageDialogLike {
    addEventListener(name: string, handler: (ev: {detail(): {file: File}}) => void): void;
    clear(): void;
    progress(progress?: number): unknown;
    state(state?: string): unknown;
    populate(url: string, size: [number, number]): unknown;
    save(url?: string, size?: [number, number], attrs?: Record<string, string>): unknown;
}

export interface MediaUploaderOptions {
    /** Where staged bytes go. */
    store: MediaStore;
    /** For tests, and for a future crop that wants to substitute its own. */
    createObjectURL?: (blob: Blob) => string;
    /** Measures an image, so a test does not need a decoder. */
    measure?: (url: string) => Promise<[number, number]>;
}

/**
 * An `IMAGE_UPLOADER` that stages instead of uploading.
 *
 * Two of the dialog's controls do nothing here, and that is a limitation
 * rather than an oversight: rotating and cropping need something that can
 * re-encode an image, and this deployment has a repository and a browser
 * and nothing in between. The bytes committed are the bytes chosen.
 */
export function mediaUploader(options: MediaUploaderOptions): (dialog: ImageDialogLike) => void {
    const store = options.store;
    const makeURL = options.createObjectURL ?? (blob => URL.createObjectURL(blob));
    const measure = options.measure ?? measureImage;

    return function attach(dialog: ImageDialogLike): void {
        let staged: StagedMedia | null = null;
        let size: [number, number] = [0, 0];

        /* The promise is returned, not dropped: the dialog ignores it,
           and a test that does not have to poll for the staging to
           finish is a test that cannot be flaky. */
        dialog.addEventListener('imageuploader.fileready', ev => accept(ev.detail().file));
        dialog.addEventListener('imageuploader.clear', () => dialog.clear());
        dialog.addEventListener('imageuploader.cancelupload', () => {
            /* Nothing to abort: the file never left the page. Putting the
               dialog back to empty is the whole of it. */
            dialog.state('empty');
        });
        dialog.addEventListener('imageuploader.save', () => {
            /* Saved as the object URL, which is what the page can show.
               `MediaStore.rewrite` turns it into the repository path when
               the entry is saved, so the bytes and the reference to them
               are decided in the same place.

               The filename goes in as alt text because the dialog has
               nowhere to type one and `![](...)` gives a reviewer nothing
               to react to; it is a placeholder the author is meant to
               replace, which the properties dialog lets them do. */
            if (staged) {
                dialog.save(staged.token, size, {alt: staged.filename});
            }
        });

        async function accept(file: File): Promise<void> {
            /* Zeroed rather than left alone: the bar still holds the width
               the last image left it at, and starting a new one at full
               reads as finished. */
            dialog.progress(0);
            dialog.state('uploading');

            try {
                const bytes = new Uint8Array(await file.arrayBuffer());
                const token = makeURL(new Blob([bytes], {type: file.type}));

                /* Measured before staging, so a file the browser cannot
                   decode leaves nothing staged: the dialog goes back to
                   empty and the user picks another, rather than the entry
                   being committed with a reference to a broken image
                   nobody sees until the site builds. */
                size = await measure(token);
                staged = store.stage({token, filename: file.name, bytes});
                dialog.populate(token, size);
            } catch (error) {
                dialog.clear();
                console.error('content-tools: could not read that image', error);
            }
        }
    };
}

/** An image's natural size, via the browser's own decoder. */
function measureImage(url: string): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
        image.onerror = () => reject(new Error(`could not read ${url} as an image`));
        image.src = url;
    });
}
