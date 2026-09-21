/* Where an entry is in review, as a label on its pull request.
 *
 * Labels rather than GitHub's own draft flag, and the reason is not
 * preference: `POST /pulls` accepts `draft`, and `PATCH /pulls/{n}` does
 * not. Moving a pull request between draft and ready for review is a
 * GraphQL mutation, so a draft-based status would have cost this milestone
 * a GraphQL client -- in a milestone whose whole premise is that twelve
 * REST endpoints do not need one. Labels are plain REST, they are visible
 * to everyone looking at the pull request on GitHub, and they survive
 * anything this tool is not running for.
 */

import type {PullRequest} from './github.js';

/** How far along an entry is. */
export type EditorialStatus = 'draft' | 'in-review' | 'ready';

/**
 * In order, least finished first. The order is load-bearing: `statusOf`
 * reads it to resolve a pull request carrying more than one.
 */
export const STATUSES: readonly EditorialStatus[] = Object.freeze([
    'draft', 'in-review', 'ready'
]);

/** The `cms/` namespace again, so a repository's own labels never collide. */
export function labelFor(status: EditorialStatus): string {
    return `cms/${status}`;
}

/** The status a label names, or null for a label that is not one of ours. */
export function statusForLabel(label: string): EditorialStatus | null {
    return STATUSES.find(status => labelFor(status) === label) ?? null;
}

/**
 * What a pull request's labels say, or null if they say nothing.
 *
 * More than one is possible -- somebody labelling by hand, or a status
 * change that added the new label and then failed before removing the old
 * one -- and the furthest along wins. A shell showing a board would
 * otherwise move a card backwards on the strength of a label nobody meant
 * to leave.
 */
export function statusOf(pull: Pick<PullRequest, 'labels'>): EditorialStatus | null {
    let found: EditorialStatus | null = null;
    for (const label of pull.labels) {
        const status = statusForLabel(label.name);
        if (status && (!found || STATUSES.indexOf(status) > STATUSES.indexOf(found))) {
            found = status;
        }
    }
    return found;
}
