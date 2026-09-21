/* Everything currently under review, across every collection.
 *
 * The collection list answers "what is on the site"; this answers "what
 * is waiting for somebody". They are different questions, and an author
 * with three changes in flight across two collections can only answer
 * the second by opening both -- which is how a change sits in a branch
 * for a fortnight because nobody remembered it was there.
 *
 * The shell NEVER MERGES, and this is the screen where that shows. It
 * moves an entry between `cms/draft`, `cms/in-review` and `cms/ready`,
 * and then it links out. Branch protection, required reviews and
 * CODEOWNERS are the repository's own controls, and a tool that can
 * write, approve and publish in one session has quietly removed the
 * review gate that is the entire premise of this workflow.
 */
import {h, list} from '../render.js';
import {entryLabel, statusLabel} from './labels.js';
import {formatRoute} from '../routes.js';
import {STATUSES, statusOf} from '../../cms/status.js';
import type {EditorialStatus} from '../../cms/status.js';
import type {InFlightEntry} from '../../cms/repo.js';
import type {CmsConfig, Collection} from '../../cms/config.js';

export interface ReviewState {
    /** For the labels, which are the operator's words wherever they gave any. */
    config: CmsConfig;
    /** null while the listing is in flight -- not the same as nothing. */
    entries: readonly InFlightEntry[] | null;
    /**
     * Pull request numbers whose status is being written right now.
     *
     * A list rather than one number. `_setState` renders synchronously,
     * so the row that was clicked is disabled before the click handler
     * returns -- but the row below it is not, and two moves can
     * genuinely be in flight at once.
     */
    moving: readonly number[];
}

export interface ReviewHandlers {
    /** Move an entry's pull request to a status. */
    moveStatus(entry: InFlightEntry, status: EditorialStatus): void;
}

export interface ReviewView {
    readonly node: HTMLElement;
    update(state: ReviewState): void;
}

function collectionFor(config: CmsConfig, name: string): Collection | null {
    return config.collections.find(c => c.name === name) ?? null;
}

function row(doc: Document): HTMLElement {
    return h(doc, 'li', {class: 'ct-cms__review'}, [
        h(doc, 'a', {class: 'ct-cms__review-link'}),
        h(doc, 'span', {class: 'ct-cms__review-where'}),
        h(doc, 'span', {class: 'ct-cms__badge ct-cms__review-badge'}),
        h(doc, 'span', {class: 'ct-cms__spacer'}),
        /* A group with a name, because three buttons in a row are
           otherwise announced as three unrelated commands, and "Ready"
           on its own says nothing about what it is ready for. */
        h(doc, 'span', {
            class: 'ct-cms__review-moves',
            role: 'group',
            'aria-label': 'Status'
        }, STATUSES.map(status => h(doc, 'button', {
            class: 'ct-cms__button ct-cms__button--muted ct-cms__review-move',
            type: 'button',
            'data-status': status
        }, [statusLabel(status)]))),
        /* `rel` as well as `target`: without it the opened tab gets a
           handle on this one through `window.opener`, and this one is
           holding a GitHub token. */
        h(doc, 'a', {
            class: 'ct-cms__review-pull',
            target: '_blank',
            rel: 'noopener noreferrer'
        })
    ]);
}

function fill(
        el: HTMLElement,
        handlers: ReviewHandlers,
        state: ReviewState,
        entry: InFlightEntry
        ): void {
    const collection = collectionFor(state.config, entry.collection);

    const link = el.querySelector('.ct-cms__review-link') as HTMLAnchorElement;
    /* The slug, for a collection the config does not have. It cannot
       arrive from `listInFlight`, which skips a pull request naming one
       -- but the label is the only thing on this row that a missing
       collection decides, and the slug is a true answer either way. */
    link.textContent = collection ? entryLabel(collection, entry.slug) : entry.slug;
    link.setAttribute('href', formatRoute({
        kind: 'entry', collection: entry.collection, slug: entry.slug
    }));

    /* Which collection, on every row. This list spans them, so a row
       saying only `About` leaves an author guessing which of two
       collections holds the About they are looking at. */
    const where = el.querySelector('.ct-cms__review-where') as HTMLElement;
    where.textContent = collection ? collection.label : entry.collection;

    const status = statusOf(entry.pull);
    const badge = el.querySelector('.ct-cms__review-badge') as HTMLElement;
    badge.textContent = statusLabel(status);

    const moving = state.moving.includes(entry.pull.number);
    el.querySelectorAll('.ct-cms__review-move').forEach(node => {
        const button = node as HTMLButtonElement;
        const wanted = button.dataset.status as EditorialStatus;
        const here = wanted === status;
        /* Rebound on every render rather than closed over at build
           time. `list()` keeps a row across renders and hands it a new
           entry, so a handler bound once would move the status of
           whichever review happened to be in that position when the
           screen first drew. Assigned, not added, so the old one goes. */
        button.onclick = () => handlers.moveStatus(entry, wanted);
        /* `aria-pressed` rather than the class alone: the pressed button
           IS the status for anybody not looking at the badge, and a
           class says nothing to a screen reader. */
        button.setAttribute('aria-pressed', String(here));
        button.className = 'ct-cms__button ct-cms__button--muted ct-cms__review-move'
            + (here ? ' ct-cms__review-move--current' : '');
        /* The status it already carries is disabled too. Writing a label
           a pull request already has is a request that changes nothing,
           and a button that looks live and does nothing is
           indistinguishable from one that failed. */
        button.disabled = moving || here;
    });

    const pull = el.querySelector('.ct-cms__review-pull') as HTMLAnchorElement;
    pull.textContent = `#${entry.pull.number} on GitHub`;
    pull.setAttribute('href', entry.pull.html_url);
}

export function buildReview(doc: Document, handlers: ReviewHandlers): ReviewView {
    const note = h(doc, 'p', {class: 'ct-cms__note'});
    const rows = h(doc, 'ul', {class: 'ct-cms__review-list'});
    const node = h(doc, 'div', {class: 'ct-cms__reviews'}, [
        h(doc, 'div', {class: 'ct-cms__entries-head'}, [
            h(doc, 'h2', {class: 'ct-cms__heading'}, ['In review'])
        ]),
        note,
        rows,
        h(doc, 'p', {class: 'ct-cms__hint'},
          ['Merging is a human decision, so it happens on GitHub. Moving an'
           + ' entry to Ready says it is finished, not that it is published.'])
    ]);

    return {
        node,

        update(state: ReviewState): void {
            const entries = state.entries;
            /* "Loading" and "nothing is waiting" are opposite answers,
               and an author who reads the second over the first stops
               looking for the change they know they left open. */
            note.textContent = entries === null
                ? 'Loading…'
                : (entries.length === 0
                    ? 'Nothing is under review. Every change this tool makes opens a'
                      + ' pull request, so this is where they wait.'
                    : '');

            list(
                rows,
                entries ?? [],
                /* The pull request number, which is the identity of a
                   review: an entry can be renamed and a branch can be
                   force-pushed, and it is the same review throughout.
                   The key earns itself here rather than being recorded
                   as equivalent-for-now, the way the entry list's was --
                   a status move updates a row IN PLACE, so rekeying
                   rebuilds the node under the pointer between the click
                   and the answer. */
                entry => String(entry.pull.number),
                () => row(doc),
                (el, entry) => fill(el, handlers, state, entry)
            );
        }
    };
}
