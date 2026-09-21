/* One branch and one pull request per entry.
 *
 * This is the whole workflow the tool exists for: a shell reads an entry,
 * the user edits it, and saving produces a commit on `cms/<collection>/<slug>`
 * and a pull request somebody reviews. Nothing here knows what an entry
 * CONTAINS -- it moves strings and bytes, and the markdown entry turns
 * those into blocks. Keeping the two apart is what lets this file be
 * tested against an in-memory GitHub, and what keeps the markdown parser
 * out of a shell that stores HTML.
 */

import type {CmsConfig, Collection} from './config.js';
import {entryPath, findCollection, slugFromPath} from './config.js';
import {ConfigError} from './config.js';
import {DIRECTORY_LIMIT, GitHub, encodeBase64} from './github.js';
import type {PullRequest, TokenSource, TreeEntry} from './github.js';
import {labelFor, statusForLabel} from './status.js';
import type {EditorialStatus} from './status.js';

/**
 * The branch namespace this tool owns.
 *
 * Reserved by convention, and the convention has teeth: a `cms/...` branch
 * with no open pull request is treated as this tool's leftover and reset.
 */
export const BRANCH_PREFIX = 'cms';

/** Where an entry's work in progress lives. */
export function branchFor(collection: string, slug: string): string {
    return `${BRANCH_PREFIX}/${collection}/${slug}`;
}

/** The entry a `cms/...` branch belongs to, or null for anything else. */
export function entryForBranch(ref: string): {collection: string; slug: string} | null {
    const parts = ref.split('/');
    if (parts.length !== 3 || parts[0] !== BRANCH_PREFIX || !parts[1] || !parts[2]) {
        return null;
    }
    return {collection: parts[1], slug: parts[2]};
}

/** An entry that exists, as a listing shows it. */
export interface EntrySummary {
    collection: string;
    slug: string;
    path: string;
}

/**
 * What one collection holds, and whether that is all of it.
 *
 * A bare array would have been enough until `truncated` had somewhere to
 * live: GitHub's contents endpoint stops at 1000 entries per directory and
 * says so nowhere in the response. A shell that cannot tell a capped
 * listing from a complete one shows an author a list their own post is
 * missing from, which reads as "somebody deleted it".
 */
export interface EntryListing {
    entries: EntrySummary[];
    /** The directory was longer than the API will list in one request. */
    truncated: boolean;
}

/** An entry open for editing. */
export interface Entry extends EntrySummary {
    /** The branch this version was read from. */
    ref: string;
    /**
     * The commit `ref` pointed at when this was read.
     *
     * Hand it back as `SaveOptions.parent` to save against exactly the
     * version that was edited. Without it a save builds on whatever the
     * branch holds at the moment it runs, so a commit pushed while the
     * editor was open is rewound into the tree with no error and nothing
     * to notice.
     */
    commit: string;
    /** The file's text, or null when it does not exist yet. */
    content: string | null;
    /** The open pull request for this entry, if there is one. */
    pull: PullRequest | null;
}

/** A file to commit alongside the entry. */
export interface MediaFile {
    /** Repository path. */
    path: string;
    bytes: Uint8Array;
}

export interface SaveOptions {
    /** The new file contents. */
    content: string;
    /** Files to land in the same commit. */
    media?: readonly MediaFile[];
    /** Commit message and pull request title. */
    message?: string;
    /** Pull request body, used only when one is opened. */
    body?: string;
    /**
     * Open the pull request as one of GitHub's own drafts.
     *
     * Off by default, and deliberately separate from `status`. REST can
     * set this flag and cannot clear it -- that is a GraphQL mutation --
     * so a pull request opened as a draft stays one until a human presses
     * the button, whatever the `cms/*` label says. Defaulting it on would
     * mean every entry this tool ever opened needed that press before it
     * could merge.
     */
    draft?: boolean;
    /**
     * Where the entry is in review.
     *
     * A new pull request is labelled `cms/draft` unless this says
     * otherwise, so that everything in the `cms/` namespace carries
     * exactly one status and a shell never has to render an entry whose
     * state is "none". On a pull request that is already open it is left
     * alone unless asked: a save is not a reason to drag an entry a
     * reviewer marked ready back to draft.
     */
    status?: EditorialStatus;
    /**
     * The commit this edit was made against -- `Entry.commit` from the
     * read that opened it.
     *
     * Omitting it is right for a shell that writes a file it has just
     * read, and wrong for one holding an editor open while a reviewer
     * pushes: the save would quietly build on the reviewer's commit while
     * carrying the pre-push tree, reverting them. Given, a push since the
     * read makes the branch update a non-fast-forward, and the client
     * turns that into a `ConflictError` the shell can catch and re-read.
     */
    parent?: string;
}

export interface SaveResult {
    branch: string;
    pull: PullRequest;
    /** The commit made, or null when there was nothing to change. */
    commit: string | null;
    changed: boolean;
    /**
     * Whether a leftover branch was reset onto the base first. Reported
     * rather than hidden: it means a previous pull request for this entry
     * is no longer open, which a shell may want to say out loud.
     */
    reset: boolean;
}

/** An entry currently under review. */
export interface InFlightEntry extends EntrySummary {
    pull: PullRequest;
}

export interface CmsRepoOptions {
    config: CmsConfig;
    token?: TokenSource;
    fetch?: typeof globalThis.fetch;
    /** An already-built client, for a shell that shares one. */
    github?: GitHub;
}

export class CmsRepo {

    readonly config: CmsConfig;
    readonly github: GitHub;

    constructor(options: CmsRepoOptions) {
        this.config = options.config;
        this.github = options.github ?? new GitHub({
            repo: options.config.backend.repo,
            apiBase: options.config.backend.apiBase,
            token: options.token,
            fetch: options.fetch
        });
    }

    /** The branch entries are read from and pull requests target. */
    get base(): string {
        return this.config.backend.branch;
    }

    private collection(name: string): Collection {
        const collection = findCollection(this.config, name);
        if (!collection) {
            throw new ConfigError('collections', `no collection named "${name}"`);
        }
        return collection;
    }

    /**
     * The entries of a collection, as they stand on the base branch.
     *
     * Entries that exist only inside an open pull request are NOT here --
     * they are not in the published site either. `listInFlight()` is the
     * other half, and a shell showing "all entries" merges the two rather
     * than this method guessing which it wanted.
     */
    async listEntries(name: string): Promise<EntryListing> {
        const collection = this.collection(name);

        if (collection.kind === 'file') {
            /* Configuration, not discovery: the files are named in the
               config, so this branch reaches the network not at all and
               can never be cut short. */
            return {
                entries: collection.files.map(file => ({
                    collection: name, slug: file.name, path: file.file
                })),
                truncated: false
            };
        }

        const listing = await this.github.listDirectory(collection.folder, this.base);
        return {
            entries: listing
                .filter(item => item.type === 'file')
                .map(item => ({slug: slugFromPath(collection, item.path), path: item.path}))
                .filter((item): item is {slug: string; path: string} => item.slug !== null)
                .map(item => ({collection: name, ...item})),
            /* Measured against the RAW listing, before the filters above.
               A folder of 1000 files holding a handful of directories and
               a stray `.gitkeep` comes back short of the cap once filtered,
               so counting what survived would report a capped listing as a
               complete one -- which is the silently-short list this flag
               exists to prevent. */
            truncated: listing.length >= DIRECTORY_LIMIT
        };
    }

    /**
     * Open an entry for editing.
     *
     * If a pull request is open for it, the version under review is the
     * one to edit. Reading the base branch instead would show the user a
     * version without their own unmerged work in it, and the next save
     * would commit that over the top -- a silent revert of everything in
     * the pull request, with no error and nothing to notice.
     */
    async readEntry(name: string, slug: string): Promise<Entry> {
        const collection = this.collection(name);
        const path = entryPath(collection, slug);
        const branch = branchFor(name, slug);

        /* Keyed on an OPEN pull request rather than on the branch
           existing. A branch whose pull request was merged or closed is
           leftover, and its content is behind the base rather than ahead
           of it. */
        const pull = await this.github.findPull(branch);
        const ref = pull ? branch : this.base;

        return {
            collection: name,
            slug,
            path,
            ref,
            /* From the pull request rather than a second request for the
               ref: GitHub reports the head it has, so the two cannot
               disagree about which commit this content came from. */
            commit: pull ? pull.head.sha : await this.baseSha(),
            content: await this.github.readFile(path, ref),
            pull
        };
    }

    /**
     * Commit an entry, and its media, and open a pull request.
     *
     * One commit whatever is attached: an entry and the images it
     * references land together or not at all, so an abandoned edit leaves
     * nothing behind and a reviewer never sees a post pointing at a file
     * that arrives in the next commit.
     */
    async saveEntry(name: string, slug: string, options: SaveOptions): Promise<SaveResult> {
        const collection = this.collection(name);
        const path = entryPath(collection, slug);
        const branch = branchFor(name, slug);
        const media = options.media ?? [];
        const message = options.message ?? `Update ${name}/${slug}`;

        const pull = await this.github.findPull(branch);

        /* Nothing to say is not a commit. A user who opens an entry,
           changes their mind and saves anyway should not produce an empty
           pull request for somebody to review. */
        const current = await this.github.readFile(path, pull ? branch : this.base);
        if (current === options.content && media.length === 0) {
            if (pull) {
                return {branch, pull, commit: null, changed: false, reset: false};
            }
            throw new NothingToSaveError(name, slug);
        }

        const existing = await this.github.branchSha(branch);
        const baseSha = await this.baseSha();

        /* The parent is the branch head only while a pull request is open
           on it. Otherwise the work starts from the base, so that an entry
           edited long after its last pull request merged does not produce
           a diff reverting everything that happened in between. A caller
           that pinned the version it read overrides both. */
        const parent = options.parent ?? (pull ? existing as string : baseSha);

        /* Exactly the condition the forced write below runs under: a
           branch is there and nothing is reviewing it. Reported rather
           than inferred, because a shell cannot tell from the outside
           whether a pull request for this entry quietly went away. */
        const reset = Boolean(existing) && !pull;

        const tree = await this.github.createTree(
            await this.github.commitTree(parent),
            await this.treeEntries(path, options.content, media));
        const commit = await this.github.createCommit(message, tree, [parent]);

        if (!existing) {
            await this.github.createBranch(branch, commit);
        } else if (pull) {
            /* Fast-forward. A non-descendant here means somebody pushed to
               the entry's branch while it was open, and the ConflictError
               that comes back is recoverable: re-read and re-apply. */
            await this.github.updateBranch(branch, commit);
        } else {
            /* Forced, and only here: no pull request is open, so nothing
               is under review. A closed pull request's commits stay
               reachable through the pull request itself, so this discards
               a branch rather than the work on it. */
            await this.github.resetBranch(branch, commit);
        }

        const found = pull ?? await this.github.createPull({
            title: message,
            body: options.body ?? '',
            head: branch,
            base: this.base,
            draft: Boolean(options.draft)
        });

        /* The head this save just gave it. An open pull request was read
           BEFORE the commit, so its `head.sha` describes the branch as it
           was -- and a shell that pins that for its next save gets a
           `ConflictError` against its own work. */
        const open = {...found, head: {...found.head, sha: commit}};

        /* Only a new pull request gets a status it did not ask for. */
        const status = options.status ?? (pull ? null : 'draft');

        return {
            branch,
            commit,
            changed: true,
            reset,
            pull: status ? await this.setStatus(open, status) : open
        };
    }

    /**
     * Move an entry's pull request to a status.
     *
     * The new label goes on before the old one comes off, so a pull
     * request is never briefly unlabelled -- a board built on label
     * queries would drop the card. The other way round, a failure between
     * the two leaves both labels, which `statusOf` resolves in favour of
     * the furthest along.
     *
     * The pull request comes back with its labels as they now stand,
     * computed rather than re-read: it saves a request, and the caller's
     * copy would otherwise still describe the status it just changed.
     */
    async setStatus(pull: PullRequest, status: EditorialStatus): Promise<PullRequest> {
        const wanted = labelFor(status);
        const labels = pull.labels.filter(label => !statusForLabel(label.name));

        if (!pull.labels.some(label => label.name === wanted)) {
            await this.github.addLabels(pull.number, [wanted]);
        }
        for (const label of pull.labels) {
            if (statusForLabel(label.name) && label.name !== wanted) {
                await this.github.removeLabel(pull.number, label.name);
            }
        }
        return {...pull, labels: [...labels, {name: wanted}]};
    }

    /** The base branch's head, which everything here is measured from. */
    private async baseSha(): Promise<string> {
        const sha = await this.github.branchSha(this.base);
        if (sha === null) {
            throw new ConfigError('backend.branch', `branch "${this.base}" does not exist`);
        }
        return sha;
    }

    /** Blobs for the entry and everything travelling with it. */
    private async treeEntries(
        path: string, content: string, media: readonly MediaFile[]
    ): Promise<TreeEntry[]> {
        const entries: TreeEntry[] = [{
            path,
            mode: '100644',
            type: 'blob',
            /* Text goes up as text. An earlier version base64'd the entry
               too, so that it travelled the same way as the media; no
               test could tell the two apart, and `utf-8` is the API's own
               default, a third smaller on the wire and readable in a
               network log when a save goes wrong. Media has no choice --
               it is bytes, and most of them are not text. */
            sha: await this.github.createBlob(content, 'utf-8')
        }];

        for (const file of media) {
            entries.push({
                path: file.path,
                mode: '100644',
                type: 'blob',
                sha: await this.github.createBlob(encodeBase64(file.bytes), 'base64')
            });
        }
        return entries;
    }

    /**
     * The entries currently under review.
     *
     * Pull requests outside the `cms/` namespace, and ones naming a
     * collection this deployment does not have, are skipped: a repository
     * is not only edited by this tool, and a config that has dropped a
     * collection should not start reporting entries nobody can open.
     */
    async listInFlight(): Promise<InFlightEntry[]> {
        const entries: InFlightEntry[] = [];

        for (const pull of await this.github.listPulls()) {
            const named = entryForBranch(pull.head.ref);
            if (!named) {
                continue;
            }
            const collection = findCollection(this.config, named.collection);
            if (!collection) {
                continue;
            }
            entries.push({
                collection: named.collection,
                slug: named.slug,
                path: entryPath(collection, named.slug),
                pull
            });
        }
        return entries;
    }
}

/** Saving an entry that has no pull request and no changes. */
export class NothingToSaveError extends Error {
    readonly collection: string;
    readonly slug: string;

    constructor(collection: string, slug: string) {
        super(`${collection}/${slug} is unchanged, so there is nothing to open a pull request for`);
        this.name = 'NothingToSaveError';
        this.collection = collection;
        this.slug = slug;
    }
}
