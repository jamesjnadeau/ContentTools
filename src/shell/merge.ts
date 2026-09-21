/* One list out of two: what the site publishes, and what is under review.
 *
 * `CmsRepo.listEntries` reads the base branch and says so in its own
 * comment -- an entry that exists only inside an open pull request is not
 * in it, because it is not on the published site either. `listInFlight`
 * is the other half. Neither guesses which the caller wanted, and joining
 * them lives here rather than down in `src/cms/` for the same reason: the
 * join is a product decision about what an author should see, and the
 * repository layer has no opinion about that.
 *
 * The failure this exists to prevent is an entry appearing TWICE -- once
 * as published and once as in review -- which reads as two different
 * pages with the same name, and invites somebody to open the stale one.
 */
import type {EntrySummary, InFlightEntry} from '../cms/repo.js';
import type {PullRequest} from '../cms/github.js';
import type {EditorialStatus} from '../cms/status.js';
import {statusOf} from '../cms/status.js';

export interface ListedEntry {
    readonly collection: string;
    readonly slug: string;
    readonly path: string;
    /** The open pull request for this entry, or null when it has none. */
    readonly pull: PullRequest | null;
    /** What its labels say, or null -- including for an entry with no pull. */
    readonly status: EditorialStatus | null;
    /**
     * It exists only inside a pull request: the published site has no such
     * page yet.
     *
     * Worth its own field rather than inferred from `pull`, because an
     * author needs to know whether what they are looking at is live. An
     * edit to a published page and a page nobody outside the review has
     * ever seen are different things to be holding.
     */
    readonly unpublished: boolean;
}

function describe(
        entry: EntrySummary,
        pull: PullRequest | null,
        unpublished: boolean
        ): ListedEntry {
    return {
        collection: entry.collection,
        slug: entry.slug,
        path: entry.path,
        pull,
        status: pull ? statusOf(pull) : null,
        unpublished
    };
}

/**
 * The entries of one collection: published, in review, or both.
 *
 * `published` is already scoped to the collection -- it is one
 * `listEntries` call -- but `inFlight` is repo-wide, so it is filtered
 * here. Leaving that to the caller is how another collection's entries
 * end up in this list, which looks like a listing bug rather than a
 * missing filter.
 *
 * Order: everything with an open pull request first, then the rest, each
 * group keeping the order it arrived in. A tool whose premise is that
 * every change is a pull request should put the work in progress where
 * the person came back to find it -- and the published order is worth
 * keeping intact underneath, because for a file collection it is the
 * order the operator wrote in their config and alphabetising it would
 * throw away something they chose.
 */
export function mergeEntries(
        collection: string,
        published: readonly EntrySummary[],
        inFlight: readonly InFlightEntry[]
        ): ListedEntry[] {
    const open = new Map<string, PullRequest>();
    for (const entry of inFlight) {
        if (entry.collection === collection) {
            open.set(entry.slug, entry.pull);
        }
    }

    const listed = published.map(
        entry => describe(entry, open.get(entry.slug) ?? null, false));

    const seen = new Set(published.map(entry => entry.slug));
    for (const entry of inFlight) {
        if (entry.collection === collection && !seen.has(entry.slug)) {
            listed.push(describe(entry, entry.pull, true));
        }
    }

    return [
        ...listed.filter(entry => entry.pull !== null),
        ...listed.filter(entry => entry.pull === null)
    ];
}
