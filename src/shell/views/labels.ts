/* What the shell calls things, in one place because two views say them.
 *
 * Both of these were written inside `entries.ts` first and moved here the
 * moment the review list needed the same words. The failure that forces
 * one copy rather than two is quiet: a collection list calling something
 * "In review" while the review list calls the same pull request "Open"
 * reads as two different entries, and the person reconciling them has no
 * way to tell it is one.
 */
import type {Collection} from '../../cms/config.js';
import type {EditorialStatus} from '../../cms/status.js';

const STATUS_LABELS: Record<EditorialStatus, string> = {
    'draft': 'Draft',
    'in-review': 'In review',
    'ready': 'Ready'
};

/**
 * What an open pull request's badge says.
 *
 * A pull request carrying no `cms/*` label still gets one. Somebody
 * removed the label by hand, or opened the pull request themselves;
 * either way the entry IS under review, and a row that says nothing
 * reads as an ordinary published entry -- so the next person to open it
 * is editing against a branch they were never told about.
 */
export function statusLabel(status: EditorialStatus | null): string {
    return status ? STATUS_LABELS[status] : 'Open';
}

/**
 * The name to show for an entry: the operator's, when they gave one.
 *
 * A file collection's entries are named in the config (`label: About`);
 * a folder collection's are named by their filename, which is the only
 * name anybody has for them.
 */
export function entryLabel(collection: Collection, slug: string): string {
    if (collection.kind === 'file') {
        const file = collection.files.find(f => f.name === slug);
        if (file) {
            return file.label;
        }
    }
    return slug;
}
