/* One collection's entries: what the site publishes, what is under review,
 * and which of those an author has not seen live yet.
 *
 * Built once and updated in place, like the frame, and for a reason this
 * view has of its own: `list()` keeps the node for an unchanged key, so a
 * keyboard user who has tabbed three rows down keeps their place when a
 * status badge changes underneath them. Rebuilding the <ul> on every render
 * would move focus back to the top of the document with nothing on screen
 * to explain it.
 *
 * The LABEL is resolved here rather than in `mergeEntries` because it is the
 * only thing on a row that needs the config: a file collection's entries are
 * named by the operator (`label: About`), a folder collection's are named by
 * their filename. Pushing that down into the merge would give a pure
 * function a reason to know about configuration, and `merge.ts` exists
 * precisely because the join is the product decision and nothing else is.
 */
import {h, list} from '../render.js';
import {formatRoute} from '../routes.js';
import type {ListedEntry} from '../merge.js';
import type {Collection} from '../../cms/config.js';
import type {EditorialStatus} from '../../cms/status.js';

export interface EntriesState {
    collection: Collection;
    /** null while the listing is in flight -- not the same as empty. */
    entries: readonly ListedEntry[] | null;
    /** The directory was longer than the API will list in one request. */
    truncated: boolean;
}

export interface Entries {
    readonly node: HTMLElement;
    update(state: EntriesState): void;
}

const STATUS_LABELS: Record<EditorialStatus, string> = {
    'draft': 'Draft',
    'in-review': 'In review',
    'ready': 'Ready'
};

/**
 * What the badge says for an entry with a pull request open.
 *
 * A pull request carrying no `cms/*` label still gets a badge. Somebody
 * removed the label by hand, or opened the pull request themselves; either
 * way the entry IS under review, and a row that says nothing reads as an
 * ordinary published entry -- so the next person to open it is editing
 * against a branch they were never told about.
 */
function badgeFor(entry: ListedEntry): string {
    return entry.status ? STATUS_LABELS[entry.status] : 'Open';
}

/** The name to show: the operator's, when they gave one. */
function labelFor(collection: Collection, entry: ListedEntry): string {
    if (collection.kind === 'file') {
        const file = collection.files.find(f => f.name === entry.slug);
        if (file) {
            return file.label;
        }
    }
    return entry.slug;
}

function row(doc: Document): HTMLElement {
    return h(doc, 'li', {class: 'ct-cms__entry'}, [
        h(doc, 'a', {class: 'ct-cms__entry-link'}),
        h(doc, 'span', {class: 'ct-cms__entry-marks'}, [
            h(doc, 'span', {class: 'ct-cms__badge'}),
            h(doc, 'span', {class: 'ct-cms__badge ct-cms__badge--unpublished'}),
            /* `rel` as well as `target`: the opened tab gets a handle on
               this one through `window.opener` otherwise, and this one is
               holding a GitHub token. */
            h(doc, 'a', {
                class: 'ct-cms__entry-pull',
                target: '_blank',
                rel: 'noopener noreferrer'
            })
        ])
    ]);
}

function fill(el: HTMLElement, collection: Collection, entry: ListedEntry): void {
    const link = el.querySelector('.ct-cms__entry-link') as HTMLAnchorElement;
    link.textContent = labelFor(collection, entry);
    link.setAttribute('href', formatRoute({
        kind: 'entry', collection: entry.collection, slug: entry.slug
    }));

    const [badge, unpublished] = [
        el.querySelector('.ct-cms__badge') as HTMLElement,
        el.querySelector('.ct-cms__badge--unpublished') as HTMLElement
    ];
    badge.textContent = entry.pull ? badgeFor(entry) : '';
    badge.hidden = entry.pull === null;
    /* Separate from the status badge, because they answer different
       questions: "how far along is this change" and "is there a live page
       behind it at all". An author about to hand somebody a URL needs the
       second one, and a `Draft` badge does not say it. */
    unpublished.textContent = 'Not published yet';
    unpublished.hidden = !entry.unpublished;

    const pull = el.querySelector('.ct-cms__entry-pull') as HTMLAnchorElement;
    pull.textContent = entry.pull ? `#${entry.pull.number}` : '';
    pull.hidden = entry.pull === null;
    if (entry.pull) {
        pull.setAttribute('href', entry.pull.html_url);
    } else {
        /* Removed rather than emptied. A hidden <a href=""> is still a
           link to the current page, and a screen reader in links mode
           still offers it. */
        pull.removeAttribute('href');
    }
}

export function buildEntries(doc: Document): Entries {
    const heading = h(doc, 'h2', {class: 'ct-cms__heading'});
    const note = h(doc, 'p', {class: 'ct-cms__note'});
    const rows = h(doc, 'ul', {class: 'ct-cms__entry-list'});
    const node = h(doc, 'div', {class: 'ct-cms__entries'}, [heading, note, rows]);

    return {
        node,

        update(state: EntriesState): void {
            heading.textContent = state.collection.label;

            const entries = state.entries;
            /* "Loading" and "nothing here" are different answers and the
               difference matters: an author who reads "No entries yet" on
               a collection that has fifty concludes the repository is
               broken, or worse, adds a duplicate. */
            note.textContent = entries === null
                ? 'Loading…'
                : (entries.length === 0
                    ? 'No entries yet.'
                    : (state.truncated
                        ? 'This collection is larger than GitHub will list in one'
                          + ' request, so what follows is only the first part of it.'
                        : ''));
            /* Nothing sets `hidden` on it: `.ct-cms__note:empty` in the
               stylesheet does that, so there is no second rule in here
               saying the same thing in JavaScript -- and an empty <p> left
               standing is not nothing, it is the UA's 1em of margin above
               and below, so the list jumps when the note comes and goes. */

            list(
                rows,
                entries ?? [],
                /* The slug IS the identity of an entry within a
                   collection -- it is the filename, and two entries
                   cannot share one. Mutating this to a constant leaves
                   every test in the suite green today, because nothing in
                   M5-2 re-renders a list it is still holding: the only
                   transition is null -> loaded, which rebuilds regardless.
                   It becomes live with the first in-place change to a row
                   -- a status moved from the pull request the shell just
                   got back, or a frontmatter field being typed into --
                   and there the wrong key rebuilds the node under the
                   caret. Recorded rather than defended with a test
                   written only to reach it. */
                entry => entry.slug,
                () => row(doc),
                (el, entry) => fill(el, state.collection, entry)
            );
        }
    };
}
