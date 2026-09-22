import {buildMedia, mediaItem} from '../../../src/shell/views/media.js';
import {parseConfig} from '../../../src/cms/config.js';
import {until} from './helpers.js';

/* The media grid, driven directly.
 *
 * `media.spec.js` drives the whole shell, so it can only reach the states
 * a shell can be PUT into -- and most of what this view has to get right
 * is per-tile and asynchronous: a picture that loads, one that has to be
 * fetched with a token instead, one that cannot be read at all, and one
 * that is not a picture. Each of those is a different tile in the same
 * grid at the same moment, which no whole-shell assertion can arrange.
 *
 * READ-ONLY since M6-3. There is no Insert button, so what a tile shows
 * is the whole of what it does, and the assertions here are on the two
 * things a person can see: the picture, and the sentence that replaces
 * it when there is no picture to be had.
 *
 * Every image here is a `data:` URL, so nothing is requested and a load
 * and a failure are both deterministic. The point of the view is WHICH of
 * the two it reacts to, not where the bytes came from.
 */

/** A real 1x1 PNG. Loads, and reports a natural size of 1x1. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFc'
    + 'SJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/* Declared as a PNG and holding four bytes that are not one, so the
   decoder refuses it and the element fires `error`. A 404 would do the
   same thing over the network; this needs no server. */
const BROKEN = 'data:image/png;base64,AAAAAA==';

const CONFIG = parseConfig({
    backend: {repo: 'owner/site'},
    media: {folder: 'static/images', publicPath: '/images'},
    collections: [{name: 'blog', label: 'Blog', folder: 'content/blog'}]
});

function file(name, sha = 'sha-1') {
    return {name, path: `static/images/${name}`, sha};
}

/** An item whose public URL is `url`, so a tile can be made to load or not. */
function item(name, url) {
    return {...mediaItem(CONFIG, file(name)), url};
}

function harness(overrides = {}) {
    const calls = {thumbnail: []};
    const view = buildMedia(document, {
        thumbnail(it) {
            calls.thumbnail.push(it.name);
            return overrides.thumbnail
                ? overrides.thumbnail(it)
                : Promise.resolve(null);
        }
    });
    document.body.appendChild(view.node);
    return {view, calls, node: view.node};
}

const state = (files, extra = {}) => ({
    folder: 'static/images', files, truncated: false, ...extra
});

const tiles = node => [...node.querySelectorAll('.ct-cms__media-item')];
const partsOf = tile => ({
    image: tile.querySelector('.ct-cms__media-thumb'),
    name: tile.querySelector('.ct-cms__media-name'),
    note: tile.querySelector('.ct-cms__media-note')
});
const noteText = node => node.querySelector('.ct-cms__note').textContent;

describe('the media grid', function() {

    let built = null;

    afterEach(function() {
        if (built) {
            built.node.remove();
            built = null;
        }
    });

    function open(files, extra) {
        built = harness(extra?.handlers);
        built.view.update(state(files, extra?.state));
        return built;
    }

    describe('what it says before there is a grid', function() {

        it('distinguishes loading from empty', function() {
            /* The two are different answers and the difference matters:
               an author who reads "nothing here" over a folder holding
               fifty concludes last week's upload never happened. */
            built = harness();
            built.view.update(state(null));
            expect(noteText(built.node)).toBe('Loading…');

            built.view.update(state([]));
            expect(noteText(built.node)).toContain('Nothing in this folder yet');
        });

        it('says where images come from, since they cannot be added here',
           function() {
            /* The one deliberate limitation of this screen. Without the
               sentence it reads as a feature somebody forgot to build,
               and the answer -- that a picture is committed with the
               entry using it -- is the whole reason there is no upload
               button. */
            const {node} = open([]);
            expect(noteText(node)).toContain('image button');
        });

        it('reports a folder the API would not list in one request', function() {
            const {node} = open([item('a.png', PNG)], {state: {truncated: true}});
            expect(noteText(node)).toContain('only the first part');
        });
    });

    describe('a tile', function() {

        it('tries the public URL first', function() {
            /* The published site is free and needs no token, and the URL
               it tries is the SAME string an insert writes -- so a
               thumbnail that renders is evidence the reference will. */
            const {node} = open([item('a.png', '/images/a.png')]);
            expect(partsOf(tiles(node)[0]).image.getAttribute('src'))
                .toBe('/images/a.png');
        });

        it('shows the picture, and says nothing, while it is arriving',
           async function() {
            /* A tile that is waiting must not read as a tile that
               failed. The two are opposite answers -- one is a wait and
               one is a problem -- and the failure sentence appearing
               for the moment a picture takes to arrive is how somebody
               concludes their upload is broken. */
            const {node} = open([item('a.png', PNG)]);
            const {image, note} = partsOf(tiles(node)[0]);
            expect(note.hidden).toBe(true);
            expect(image.hidden).toBe(false);

            await until(() => image.naturalWidth > 0, 'the picture to decode');
            expect(note.hidden).toBe(true);
            return expect(image.hidden).toBe(false);
        });

        it('says so for a file it cannot show', function() {
            /* A PDF in the media folder is a real thing to have there,
               and it gets a tile with its name on it -- but no `src` at
               all, because an `<img>` with no source makes no request
               rather than a failing one. */
            const {node} = open([mediaItem(CONFIG, file('notes.pdf'))]);
            const {image, note} = partsOf(tiles(node)[0]);
            expect(image.hasAttribute('src')).toBe(false);
            expect(image.hidden).toBe(true);
            expect(note.hidden).toBe(false);
        });

        it('is labelled by its filename', function() {
            const {node} = open([item('a.png', PNG)]);
            expect(partsOf(tiles(node)[0]).name.textContent).toBe('a.png');
        });
    });

    describe('the authenticated fallback', function() {

        it('reads the file through the API when the public URL does not answer',
           async function() {
            /* The case every deployment hits on day one: the site has not
               been built yet, so `publicPath` serves nothing. Without the
               fallback the media library is an empty-looking grid on a
               folder full of pictures. */
            const {node, calls} = open([item('a.png', BROKEN)], {
                handlers: {thumbnail: () => Promise.resolve(PNG)}
            });
            const {image} = partsOf(tiles(node)[0]);
            await until(() => image.getAttribute('src') === PNG,
                        'the fallback to be tried');
            expect(calls.thumbnail).toEqual(['a.png']);
            return until(() => image.naturalWidth > 0, 'the fallback to decode');
        });

        it('gives up rather than asking twice', async function() {
            /* The fallback failing too is the end of it. Retrying is the
               same request with the same answer, and a grid that retries
               for ever is a tab that never goes idle -- on a folder of
               fifty files, fifty requests a second. */
            const {node, calls} = open([item('a.png', BROKEN)], {
                handlers: {thumbnail: () => Promise.resolve(BROKEN)}
            });
            const {image, note} = partsOf(tiles(node)[0]);
            await until(() => !note.hidden, 'the tile to give up');
            expect(calls.thumbnail).toEqual(['a.png']);
            expect(image.hidden).toBe(true);
        });

        it('says so when there are no bytes to be had either', async function() {
            const {node} = open([item('a.png', BROKEN)]);
            const {image, note} = partsOf(tiles(node)[0]);
            await until(() => !note.hidden, 'the tile to give up');
            expect(note.textContent).toBe('This file could not be read.');
            expect(image.hidden).toBe(true);
            /* And nothing was requested to find that out. Assigning the
               null straight through would set `src` to the string
               "null", which the page then fetches relative to itself and
               reaches the same failed tile one 404 later -- invisible on
               one file and a request per tile on a folder of fifty. */
            expect(image.getAttribute('src')).toBe(BROKEN);
        });
    });

    describe('re-rendering', function() {

        it('keeps a tile that has already paid for its thumbnail',
           async function() {
            /* The key earns itself here in a way the entry list's does
               not: a tile carries loading state nothing can rebuild, so
               rekeying restarts every thumbnail -- including the ones
               that cost an authenticated round trip. */
            const {view, node, calls} = open([item('a.png', BROKEN)], {
                handlers: {thumbnail: () => Promise.resolve(PNG)}
            });
            const first = tiles(node)[0];
            await until(() => partsOf(first).image.getAttribute('src') === PNG,
                        'the fallback');

            view.update(state([item('a.png', BROKEN), item('b.png', PNG)]));
            expect(tiles(node)[0]).toBe(first);
            expect(partsOf(first).image.getAttribute('src')).toBe(PNG);
            expect(calls.thumbnail).toEqual(['a.png']);
        });

        it('drops a tile for a file that is no longer there', function() {
            const {view, node} = open([item('a.png', PNG), item('b.png', PNG)]);
            expect(tiles(node).length).toBe(2);
            view.update(state([item('b.png', PNG)]));
            expect(tiles(node).map(t => partsOf(t).name.textContent)).toEqual(['b.png']);
        });
    });

    describe('mediaItem', function() {

        it('gives a file the URL an entry will reference it by', function() {
            /* The same string the thumbnail tries. Two spellings of it
               is how a grid shows a picture that the entry then cannot
               find. */
            expect(mediaItem(CONFIG, file('cat.png')).url).toBe('/images/cat.png');
        });

        it('carries the sha, which is what the fallback reads', function() {
            expect(mediaItem(CONFIG, file('cat.png', 'abc')).sha).toBe('abc');
        });

        it('types what it can show and nothing else', function() {
            expect(mediaItem(CONFIG, file('cat.png')).type).toBe('image/png');
            expect(mediaItem(CONFIG, file('notes.pdf')).type).toBe(null);
        });
    });
});
