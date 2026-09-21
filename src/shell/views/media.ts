/* What is in the repository's media folder.
 *
 * Two places show this and there is one of it: the `#/media` route, where
 * it is a browser, and a panel inside an open entry, where each tile can
 * also be inserted. The difference is one flag, because the alternative --
 * a browse view and an insert view -- is two grids that drift apart, and
 * the way they drift is the insert one quietly showing a different set of
 * files from the one somebody was just looking at.
 *
 * There is deliberately NO upload here. Media still arrives through the
 * editor's image dialog and `MediaStore`, so that a picture and the entry
 * referencing it land in one commit. An upload button on this screen would
 * commit a file with nothing pointing at it, which is precisely the orphan
 * blob the staging design exists to prevent -- and an author who abandons
 * the entry afterwards leaves it there for ever. Documented as a
 * limitation rather than hidden.
 *
 * Thumbnails are PUBLIC URL FIRST. The published site is the fastest and
 * cheapest source, it needs no token, and it is what the entry will
 * actually reference -- so a thumbnail that renders is also a check that
 * the reference will. When it does not answer -- a site that has not built
 * yet, a private host, a `publicPath` that does not match where the site
 * serves from -- the file is read from the API instead and shown from a
 * Blob. Falling back the other way round would work and would spend a
 * rate-limited authenticated request per tile to show what a static host
 * was giving away.
 */
import {h, list} from '../render.js';
import {mediaURL} from '../../cms/config.js';
import {imageType} from '../../cms/media.js';
import type {CmsConfig} from '../../cms/config.js';

/** One file in the media folder, as a tile needs it. */
export interface MediaItem {
    /** The filename, which is its identity within the folder. */
    name: string;
    /** Where it lives in the repository, for the authenticated read. */
    path: string;
    /** The blob, for the same. Content-addressed, so it cannot go stale. */
    sha: string;
    /** What an entry referencing it writes -- and the thumbnail's first try. */
    url: string;
    /** Its content type, or null for anything this cannot show or insert. */
    type: string | null;
}

/**
 * A directory entry as a tile.
 *
 * Pure, and separate from the element, because the two things it decides
 * are worth stating on their own: the URL a tile previews is THE SAME
 * string an insert writes into the entry -- so a thumbnail that renders
 * is evidence the reference will resolve -- and whether a file can be
 * previewed is the same question as whether it can be inserted, asked of
 * `imageType` once.
 */
export function mediaItem(
        config: CmsConfig,
        file: {name: string; path: string; sha: string}
        ): MediaItem {
    return {
        name: file.name,
        path: file.path,
        sha: file.sha,
        url: mediaURL(config, file.name),
        type: imageType(file.name)
    };
}

export interface MediaState {
    /** Where these live, for the heading. */
    folder: string;
    /** null while the listing is in flight -- not the same as empty. */
    files: readonly MediaItem[] | null;
    /** The folder was longer than the API will list in one request. */
    truncated: boolean;
    /** Whether there is an open entry for `insert` to put one into. */
    insertable: boolean;
}

export interface MediaHandlers {
    /**
     * An object URL for a file whose public URL did not answer, or null.
     *
     * The VIEW does not create it. Whoever creates an object URL owns
     * revoking it, and a view that is rebuilt whenever the route changes
     * is the wrong place to hold that obligation -- the element outlives
     * every grid it renders, so the element allocates and the element
     * revokes.
     */
    thumbnail(item: MediaItem): Promise<string | null>;
    /** Put it in the open entry, at its natural size. */
    insert(item: MediaItem, size: [number, number]): void;
}

export interface MediaView {
    readonly node: HTMLElement;
    update(state: MediaState): void;
}

/** The parts of a tile that have to be reached again after it is built. */
interface Tile {
    image: HTMLImageElement;
    button: HTMLButtonElement;
    note: HTMLElement;
}

function partsOf(el: HTMLElement): Tile {
    return {
        image: el.querySelector('.ct-cms__media-thumb') as HTMLImageElement,
        button: el.querySelector('.ct-cms__media-insert') as HTMLButtonElement,
        note: el.querySelector('.ct-cms__media-note') as HTMLElement
    };
}

export function buildMedia(doc: Document, handlers: MediaHandlers): MediaView {
    const heading = h(doc, 'h2', {class: 'ct-cms__heading'}, ['Media']);
    const folder = h(doc, 'code', {class: 'ct-cms__media-folder'});
    const note = h(doc, 'p', {class: 'ct-cms__note'});
    const grid = h(doc, 'ul', {class: 'ct-cms__media-grid'});
    const node = h(doc, 'section', {class: 'ct-cms__media'}, [
        h(doc, 'div', {class: 'ct-cms__entries-head'}, [heading, folder]),
        note,
        grid
    ]);

    /* The state the tiles' own handlers read. A tile's load and error
       events arrive long after `update()` returned, and what they have to
       decide -- whether Insert is offered -- depends on the state as it
       is THEN, not as it was when the request went out. An author who
       opened the panel and navigated away while a thumbnail was in flight
       would otherwise be handed a live Insert button on a closed entry. */
    let current: MediaState = {folder: '', files: null, truncated: false, insertable: false};

    /** Everything about a tile that depends on state or on loading. */
    function paint(el: HTMLElement, item: MediaItem): void {
        const {image, button, note: failed} = partsOf(el);
        /* `naturalWidth` is the one honest answer to "did this render".
           The `load` event alone is not: a zero-byte or truncated file
           can fire `load` in some engines with nothing decoded, and
           inserting that gives `ContentEdit.Image` a zero to divide by.
           The height was checked here too and no test could fail without
           it -- nothing decodes to a width without a height -- so the
           width, which is the one the division needs, is the whole of
           the question. */
        const ready = image.naturalWidth > 0;

        button.hidden = !current.insertable || item.type === null;
        /* Disabled rather than hidden while the image is still loading:
           a button that appears under the pointer a second after the
           grid draws is how somebody clicks the tile next to the one
           they meant. */
        button.disabled = !ready;

        /* Said once the fallback has also failed, and not before -- a
           file being fetched is not a file that is missing. `hidden`
           until then, because the reasons are opposite: one is a wait
           and the other is a problem. */
        failed.hidden = !(el.dataset.ctState === 'failed');
        image.hidden = el.dataset.ctState === 'failed';
    }

    function tile(item: MediaItem): HTMLElement {
        const image = h(doc, 'img', {
            class: 'ct-cms__media-thumb',
            /* The filename. A picture in a file browser is labelled by
               its caption below it, so repeating the name here would
               have a screen reader read it twice -- but an empty `alt`
               on an image that is also a button's target says nothing
               at all when the caption is off screen. The name it is. */
            alt: item.name,
            /* A media folder is the one place in this shell that can
               hold hundreds of items, and every one of them is a
               request. */
            loading: 'lazy'
        }) as HTMLImageElement;

        const el = h(doc, 'li', {class: 'ct-cms__media-item'}, [
            image,
            h(doc, 'span', {class: 'ct-cms__media-name'}, [item.name]),
            h(doc, 'p', {class: 'ct-cms__media-note'},
              ['This file could not be read.']),
            h(doc, 'button', {
                class: 'ct-cms__button ct-cms__media-insert',
                type: 'button',
                onclick: () => handlers.insert(
                    item, [image.naturalWidth, image.naturalHeight])
            }, ['Insert'])
        ]);

        /* No state recorded for a picture that arrived: three states
           are the whole machine. A fourth -- `shown` -- was written and
           no test could fail without it, because the only thing it
           changes is what an image that loaded and THEN failed does, and
           the one way that happens here is the object URL being revoked
           as the element goes away. Leaving the state alone spends one
           retry on that; claiming it would spend a lie. */
        image.addEventListener('load', () => paint(el, item));
        /* One fallback, once. A second `error` -- the object URL failing
           too, or `thumbnail` answering null -- is the end of it: asking
           again would be the same request with the same answer, and a
           tile that retries for ever is a tab that never goes idle. */
        image.addEventListener('error', () => {
            if (el.dataset.ctState !== 'public') {
                el.dataset.ctState = 'failed';
                paint(el, item);
                return;
            }
            el.dataset.ctState = 'fallback';
            paint(el, item);
            void handlers.thumbnail(item).then(url => {
                if (url) {
                    image.src = url;
                } else {
                    el.dataset.ctState = 'failed';
                    paint(el, item);
                }
            });
        });

        /* Set LAST, after the listeners: a cached image can fire `load`
           synchronously from the assignment, and a listener added
           afterwards never hears it. The tile would sit disabled with a
           picture visibly in it. */
        if (item.type === null) {
            /* Nothing to preview and nothing to insert. Left with no
               `src` at all rather than pointed at a URL that will fail:
               an `<img>` with no source makes no request, and the tile
               says what it is by its name. */
            el.dataset.ctState = 'failed';
        } else {
            el.dataset.ctState = 'public';
            image.src = item.url;
        }
        /* Not painted here. `list()` runs its update on a node it has
           just built as well as on one it kept -- the M5-1 fix that put
           the nav's current-route highlight on screen at its first
           render -- so a paint here is the same call twice, and the
           second one is the one that would be kept in step. */
        return el;
    }

    return {
        node,

        update(state: MediaState): void {
            current = state;
            folder.textContent = state.folder;

            const files = state.files;
            /* "Loading" and "nothing here" are different answers, the
               same way they are in the entry list: an author who reads
               "No files yet" over a folder holding fifty concludes the
               upload they did last week never happened. */
            note.textContent = files === null
                ? 'Loading…'
                : (files.length === 0
                    ? 'Nothing in this folder yet. Images are added from inside an'
                      + ' entry, through the editor’s image button, so that a'
                      + ' picture and the entry using it are committed together.'
                    : (state.truncated
                        ? 'This folder is larger than GitHub will list in one'
                          + ' request, so what follows is only the first part of it.'
                        : (state.insertable
                            ? ''
                            : 'Open an entry to insert one of these into it.')));

            list(
                grid,
                files ?? [],
                /* The filename, which is the identity of a file in a
                   folder -- and here the key genuinely earns itself
                   rather than being recorded as equivalent-for-now, the
                   way the entry list's was. A tile carries loading state
                   nothing can rebuild: rekey it and every thumbnail
                   restarts, including the ones that took an
                   authenticated round trip to fetch. */
                item => item.name,
                item => tile(item),
                (el, item) => paint(el, item)
            );
        }
    };
}
