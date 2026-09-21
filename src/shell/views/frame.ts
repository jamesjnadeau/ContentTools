/* The shell's chrome: a header, a nav of collections, and a main pane.
 *
 * Built once and updated in place. That is not an optimisation, it is the
 * invariant the whole sub-phase rests on: `<slot name="editor">` lives in
 * here, and an editor element slotted into a slot that a re-render
 * replaced is INVISIBLE but still connected -- so it still holds the
 * process-wide `EditorApp` lease, and every entry opened afterwards
 * refuses to open with nothing in any stack trace. The slot is created
 * here, exposed, and never touched again.
 *
 * For the same reason the view pane and the slot are siblings: `update()`
 * rebuilds the pane's contents freely and can never reach the slot.
 */
import {h, list} from '../render.js';
import {alertRegion, showAlert} from './alert.js';
import {buildEntries} from './entries.js';
import type {Entries} from './entries.js';
import {buildEntry} from './entry.js';
import type {EntryHandlers, EntryState, EntryView} from './entry.js';
import {buildCreate} from './create.js';
import type {CreateHandlers, CreateView} from './create.js';
import {buildMedia} from './media.js';
import type {MediaHandlers, MediaState, MediaView} from './media.js';
import {buildReview} from './review.js';
import type {ReviewHandlers, ReviewState, ReviewView} from './review.js';
import type {WidgetSource} from './fields.js';
import {formatRoute} from '../routes.js';
import type {Route} from '../routes.js';
import type {Described} from '../errors.js';
import type {ListedEntry} from '../merge.js';
import type {CmsConfig} from '../../cms/config.js';

/** Where the editor element is slotted. Its light-DOM home is the host. */
export const EDITOR_SLOT = 'editor';

export interface FrameHandlers
        extends EntryHandlers, CreateHandlers, MediaHandlers, ReviewHandlers {
    signOut(): void;
}

export interface FrameState {
    config: CmsConfig;
    route: Route;
    error: Described | null;
    /** The current collection's entries, or null while they are loading. */
    entries: readonly ListedEntry[] | null;
    /** The listing was cut short by the API's one-page cap. */
    truncated: boolean;
    /** The open entry, and everything the editor's chrome shows about it. */
    entry: EntryState;
    /** A create is in flight, so the Create button is held. */
    creating: boolean;
    /** The media folder: its own route, and the panel under an open entry. */
    media: MediaState;
    /** Everything in flight, for `#/review`. */
    review: {
        /** null while the listing is in flight -- not the same as nothing. */
        entries: ReviewState['entries'];
        /** Pull request numbers whose status is being written right now. */
        moving: readonly number[];
    };
}

/**
 * The open entry's view, reachable from the frame.
 *
 * The frontmatter widgets ARE the state of the form -- there is no copy
 * in the element to get out of step with what somebody is typing -- so
 * the element has to read them back through here at save and dirty-check
 * time. The alternative, an `onChange` pushing every keystroke up into
 * `setState`, is a render per character and two places holding the same
 * answer.
 */
export interface Frame {
    /** The open entry's chrome, including the frontmatter form. */
    readonly entry: EntryView;
    readonly node: HTMLElement;
    /** The slot the editor is rendered through. Never re-created. */
    readonly slot: HTMLSlotElement;
    update(state: FrameState): void;
}

/**
 * The open entry, with the media folder under it when it is open.
 *
 * The grid is a SIBLING of the entry's own node rather than a child of
 * it, and it sits between the frontmatter form and `<slot name="editor">`
 * -- directly above the editor it inserts into. One `MediaView` serves
 * this and the `#/media` route, so a tile that has already paid for an
 * authenticated thumbnail keeps it across the two.
 */
function withMedia(
        state: FrameState,
        media: MediaView,
        entry: EntryView
        ): HTMLElement[] {
    entry.update(state.entry);
    if (!state.entry.mediaOpen) {
        return [entry.node];
    }
    media.update(state.media);
    return [entry.node, media.node];
}

/** What the main pane says, for a route M5-1 does not render yet. */
function placeholder(doc: Document, state: FrameState): HTMLElement[] {
    const route = state.route;
    if (route.kind === 'unknown') {
        /* The hash is echoed rather than swallowed. Sending an
           unrecognised URL silently home renders the dashboard for a stale
           bookmark, which is indistinguishable from the root -- so the
           reader concludes the entry was deleted. */
        return [
            h(doc, 'h2', {class: 'ct-cms__heading'}, ['Not found']),
            h(doc, 'p', {class: 'ct-cms__note'},
              ['Nothing here answers to ', h(doc, 'code', {}, [route.hash]), '.'])
        ];
    }
    return [
        h(doc, 'h2', {class: 'ct-cms__heading'}, ['Not built yet']),
        h(doc, 'p', {class: 'ct-cms__note'},
          ['This part of the shell arrives in a later step.'])
    ];
}

function collectionView(
        doc: Document,
        state: FrameState,
        entries: Entries,
        name: string
        ): HTMLElement[] {
    const collection = state.config.collections.find(c => c.name === name);
    if (!collection) {
        // An old bookmark, or a collection somebody renamed.
        return missing(doc, name);
    }
    /* The one view that is built once and merely re-shown. Everything else
       in the main pane is rebuilt per render, which is fine for a heading
       and a sentence; a LIST needs its nodes kept, or focus and scroll
       position are thrown away every time a badge changes. */
    entries.update({
        collection,
        entries: state.entries,
        truncated: state.truncated
    });
    return [entries.node];
}

/**
 * Naming a new entry, or editing the one that naming produced.
 *
 * The create route holds an OPEN EDITOR once the entry has been named,
 * and that is why this is a branch rather than a second route: the entry
 * is not in the repository yet, so there is no slug to link to and
 * nothing to navigate to. The address bar catches up when the first save
 * makes the entry real.
 */
function createView(
        doc: Document,
        state: FrameState,
        create: CreateView,
        entry: EntryView,
        media: MediaView,
        name: string
        ): HTMLElement[] {
    if (state.entry.entry) {
        return withMedia(state, media, entry);
    }
    const collection = state.config.collections.find(c => c.name === name);
    if (!collection) {
        return missing(doc, name);
    }
    create.update({collection, busy: state.creating});
    return [create.node];
}

/** A link or a bookmark naming a collection this config does not have. */
function missing(doc: Document, name: string): HTMLElement[] {
    /* Named, because "empty" and "gone" look the same on screen and only
       one of them is worth telling somebody about. */
    return [
        h(doc, 'h2', {class: 'ct-cms__heading'}, ['No such collection']),
        h(doc, 'p', {class: 'ct-cms__note'},
          ['This deployment has no collection named ',
           h(doc, 'code', {}, [name]), '.'])
    ];
}

function mainView(
        doc: Document,
        state: FrameState,
        entries: Entries,
        entry: EntryView,
        create: CreateView,
        media: MediaView,
        review: ReviewView
        ): HTMLElement[] {
    switch (state.route.kind) {
    case 'home':
        return [
            h(doc, 'h2', {class: 'ct-cms__heading'}, ['Collections']),
            h(doc, 'p', {class: 'ct-cms__note'},
              ['Choose what to edit from the list on the left.'])
        ];
    case 'collection':
        return collectionView(doc, state, entries, state.route.collection);
    case 'new':
        return createView(doc, state, create, entry, media, state.route.collection);
    case 'entry':
        /* Built once and merely re-shown, for the same reason the list
           is -- and with a second reason of its own from M5-4, when the
           frontmatter fields land inside it and a rebuild per render
           starts eating keystrokes. */
        return withMedia(state, media, entry);
    case 'media':
        media.update(state.media);
        return [media.node];
    case 'review':
        /* Built once and re-shown, like the entry list and for the same
           reason: a status move updates a row IN PLACE, so a rebuild
           per render would replace the button under the pointer
           between the click and the answer. */
        review.update({
            config: state.config,
            entries: state.review.entries,
            moving: state.review.moving
        });
        return [review.node];
    default:
        return placeholder(doc, state);
    }
}

/**
 * Say, on the link, that this is where you are.
 *
 * Both marks together, because they serve different readers and only one
 * of them is visible: the class draws the highlight, and `aria-current`
 * is the whole of what a screen reader gets -- a class says nothing to
 * it. Written once rather than per link: the collections, the media
 * folder and the review list all mark the same way, and three copies of
 * a two-line rule is three places for one of them to lose the attribute
 * while the highlight keeps working and nothing looks wrong.
 */
function markCurrent(link: HTMLElement, current: boolean): void {
    link.className = 'ct-cms__nav-link' + (current ? ' ct-cms__nav-link--current' : '');
    if (current) {
        link.setAttribute('aria-current', 'page');
    } else {
        link.removeAttribute('aria-current');
    }
}

export function buildFrame(
        doc: Document,
        handlers: FrameHandlers,
        widgets?: WidgetSource
        ): Frame {
    const repo = h(doc, 'span', {class: 'ct-cms__repo'});
    const navList = h(doc, 'ul', {class: 'ct-cms__nav-list'});
    /* The media folder is not a collection -- it holds no entries and has
       no pull requests -- so it gets its own heading rather than a row
       among them. Its own `<ul>` too, because `list()` owns `navList`'s
       children entirely and a hand-added `<li>` in there has no
       `data-key`, so the next reconciliation walks straight past it and
       leaves it wherever it happens to be. */
    const mediaLink = h(doc, 'a', {
        class: 'ct-cms__nav-link',
        href: formatRoute({kind: 'media'})
    }, ['Media']);
    /* Neither is the review list, for the same reason and one more of
       its own: it spans every collection, so it belongs to none of
       them. It is last because it is where a change goes after it is
       written, not where writing starts. */
    const reviewLink = h(doc, 'a', {
        class: 'ct-cms__nav-link',
        href: formatRoute({kind: 'review'})
    }, ['In review']);
    const view = h(doc, 'div', {class: 'ct-cms__view'});
    const entries = buildEntries(doc);
    const entry = buildEntry(doc, handlers, widgets);
    const create = buildCreate(doc, handlers);
    const media = buildMedia(doc, handlers);
    const review = buildReview(doc, handlers);
    const alert = alertRegion(doc);

    const slot = doc.createElement('slot');
    slot.name = EDITOR_SLOT;

    const node = h(doc, 'div', {class: 'ct-cms'}, [
        h(doc, 'header', {class: 'ct-cms__header'}, [
            h(doc, 'h1', {class: 'ct-cms__title'}, ['Content']),
            repo,
            h(doc, 'span', {class: 'ct-cms__spacer'}),
            h(doc, 'button', {
                class: 'ct-cms__button ct-cms__button--muted',
                type: 'button',
                onclick: () => handlers.signOut()
            }, ['Sign out'])
        ]),
        h(doc, 'div', {class: 'ct-cms__body'}, [
            /* A real <nav> of real <a href> links, not click handlers on
               divs. This is the first surface in the project a person
               navigates rather than types into, so it is the first place
               keyboard and screen-reader access is owed -- and the hrefs
               are what make an entry linkable and reloadable at all. */
            h(doc, 'nav', {class: 'ct-cms__nav', 'aria-label': 'Collections'}, [
                h(doc, 'h2', {class: 'ct-cms__nav-heading'}, ['Collections']),
                navList,
                h(doc, 'h2', {class: 'ct-cms__nav-heading'}, ['Library']),
                h(doc, 'ul', {class: 'ct-cms__nav-list'}, [
                    h(doc, 'li', {}, [mediaLink])
                ]),
                h(doc, 'h2', {class: 'ct-cms__nav-heading'}, ['Workflow']),
                h(doc, 'ul', {class: 'ct-cms__nav-list'}, [
                    h(doc, 'li', {}, [reviewLink])
                ])
            ]),
            h(doc, 'main', {class: 'ct-cms__main'}, [alert, view, slot])
        ])
    ]);

    return {
        node,
        slot,
        entry,

        update(state: FrameState): void {
            repo.textContent = state.config.backend.repo;
            showAlert(doc, alert, state.error);

            const current = state.route.kind === 'collection'
                ? state.route.collection
                : null;

            markCurrent(mediaLink, state.route.kind === 'media');
            markCurrent(reviewLink, state.route.kind === 'review');

            /* Keyed reconciliation rather than a rebuild. The collections
               rarely change, so this is almost always a no-op on the
               nodes -- which is what keeps focus where the keyboard user
               left it when a route change re-renders around them. */
            list(
                navList,
                state.config.collections,
                collection => collection.name,
                collection => h(doc, 'li', {}, [
                    h(doc, 'a', {
                        class: 'ct-cms__nav-link',
                        href: formatRoute({kind: 'collection', collection: collection.name})
                    }, [collection.label])
                ]),
                (el, collection) => markCurrent(
                    el.firstElementChild as HTMLElement, collection.name === current)
            );

            view.replaceChildren(
                ...mainView(doc, state, entries, entry, create, media, review));
        }
    };
}
