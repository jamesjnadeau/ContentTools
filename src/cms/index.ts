/* Public entry for `@jamesjnadeau/content-tools/cms`.
 *
 * The git-backed half: which repository this deployment edits, how to reach
 * it, and how a save becomes a branch, a commit and a pull request.
 *
 * It is a LEAF. Nothing here imports the editor, the element, the
 * RootContext or any vendored library, and `test/browser/cms/leaf.spec.js`
 * fails the build if that stops being true. Two things rest on it: this
 * entry is its own Vite build rather than sharing the chunk `index` and
 * `element` share (the shared-singleton argument that forced the markdown
 * entry into that build does not apply to code with no singletons), and it
 * is usable from a worker, a test or a Node script with no DOM at all.
 *
 * The Milestone 1 obligation still holds in the other direction: the editor
 * and the element know nothing about any of this, and their contract still
 * ends at `ct-saved`. A shell composes the two halves; neither imports the
 * other.
 */

export {
    parseConfig,
    loadConfig,
    ConfigError,
    findCollection,
    entryPath,
    fieldsFor,
    slugFromPath,
    mediaPath,
    mediaURL
} from './config.js';

/* The client is public because a shell will want to reach past the entry
 * workflow eventually -- to read an arbitrary file, or to open a pull
 * request this layer has no opinion about. The base64 helpers are NOT: they
 * are an implementation detail of committing, and nothing outside has asked
 * for them.
 */
export {GitHub, GitHubError, ConflictError} from './github.js';
export type {GitHubOptions, PullRequest, TokenSource, TreeEntry} from './github.js';

export type {
    CmsConfig,
    CmsConfigInput,
    BackendConfig,
    MediaConfig,
    Collection,
    FolderCollection,
    FileCollection,
    FileEntry,
    Field,
    FieldOption
} from './config.js';

/* The entry workflow itself. `branchFor`/`entryForBranch` are public
 * because the branch namespace is a contract with the repository, not a
 * private detail: a shell filtering a branch list, or a CI job deciding
 * whether a pull request came from here, needs the same answer this file
 * gives.
 */
export {
    CmsRepo,
    NothingToSaveError,
    BRANCH_PREFIX,
    branchFor,
    entryForBranch
} from './repo.js';

export type {
    CmsRepoOptions,
    Entry,
    EntryListing,
    EntrySummary,
    InFlightEntry,
    MediaFile,
    SaveOptions,
    SaveResult
} from './repo.js';

/* Media, and where an entry is in review. `safeFilename` is public because
 * a shell that shows the name an upload will get has to agree with the
 * store about it, and re-deriving that rule is how the two come to differ.
 */
export {MediaStore, mediaUploader, safeFilename} from './media.js';
export type {
    ImageDialogLike, MediaStoreOptions, MediaUploaderOptions, StagedMedia
} from './media.js';

export {STATUSES, labelFor, statusForLabel, statusOf} from './status.js';
export type {EditorialStatus} from './status.js';

/* Auth. The interface is here so a shell can hold "whatever produces a
 * token" without knowing which one it got; the PAT adapter is the
 * implementation that needs no infrastructure, and M4's GitHub App proxy
 * will be the second. Pass the token to the client as a FUNCTION --
 * `token: () => auth.currentToken()` -- so a logout takes effect instead
 * of the client holding the string it was built with.
 */
export {PatAuthAdapter, NotAuthenticatedError, TOKEN_KEY} from '../auth/pat.js';
export type {PatAuthOptions, TokenStorage} from '../auth/pat.js';
export type {AuthAdapter} from '../auth/types.js';
