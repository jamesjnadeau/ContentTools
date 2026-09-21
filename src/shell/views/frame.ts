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
import {formatRoute} from '../routes.js';
import type {Route} from '../routes.js';
import type {Described} from '../errors.js';
import type {CmsConfig} from '../../cms/config.js';

/** Where the editor element is slotted. Its light-DOM home is the host. */
export const EDITOR_SLOT = 'editor';

export interface FrameHandlers {
    signOut(): void;
}

export interface FrameState {
    config: CmsConfig;
    route: Route;
    error: Described | null;
}

export interface Frame {
    readonly node: HTMLElement;
    /** The slot the editor is rendered through. Never re-created. */
    readonly slot: HTMLSlotElement;
    update(state: FrameState): void;
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

function collectionView(doc: Document, state: FrameState, name: string): HTMLElement[] {
    const collection = state.config.collections.find(c => c.name === name);
    if (!collection) {
        /* A link that no longer matches the config -- an old bookmark, or
           a collection somebody renamed. Named, because "empty" and "gone"
           look the same on screen and only one of them is worth telling
           somebody about. */
        return [
            h(doc, 'h2', {class: 'ct-cms__heading'}, ['No such collection']),
            h(doc, 'p', {class: 'ct-cms__note'},
              ['This deployment has no collection named ',
               h(doc, 'code', {}, [name]), '.'])
        ];
    }
    return [
        h(doc, 'h2', {class: 'ct-cms__heading'}, [collection.label]),
        h(doc, 'p', {class: 'ct-cms__note'}, ['The entry list arrives next.'])
    ];
}

function mainView(doc: Document, state: FrameState): HTMLElement[] {
    switch (state.route.kind) {
    case 'home':
        return [
            h(doc, 'h2', {class: 'ct-cms__heading'}, ['Collections']),
            h(doc, 'p', {class: 'ct-cms__note'},
              ['Choose what to edit from the list on the left.'])
        ];
    case 'collection':
        return collectionView(doc, state, state.route.collection);
    default:
        return placeholder(doc, state);
    }
}

export function buildFrame(doc: Document, handlers: FrameHandlers): Frame {
    const repo = h(doc, 'span', {class: 'ct-cms__repo'});
    const navList = h(doc, 'ul', {class: 'ct-cms__nav-list'});
    const view = h(doc, 'div', {class: 'ct-cms__view'});
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
                navList
            ]),
            h(doc, 'main', {class: 'ct-cms__main'}, [alert, view, slot])
        ])
    ]);

    return {
        node,
        slot,

        update(state: FrameState): void {
            repo.textContent = state.config.backend.repo;
            showAlert(doc, alert, state.error);

            const current = state.route.kind === 'collection'
                ? state.route.collection
                : null;

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
                (el, collection) => {
                    const link = el.firstElementChild as HTMLElement;
                    link.className = 'ct-cms__nav-link'
                        + (collection.name === current ? ' ct-cms__nav-link--current' : '');
                    /* `aria-current` rather than the class alone: the
                       highlight is the only thing saying where you are,
                       and a class says nothing to a screen reader. */
                    if (collection.name === current) {
                        link.setAttribute('aria-current', 'page');
                    } else {
                        link.removeAttribute('aria-current');
                    }
                }
            );

            view.replaceChildren(...mainView(doc, state));
        }
    };
}
