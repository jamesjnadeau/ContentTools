/* A GitHub REST client, written rather than depended on.
 *
 * Twelve endpoints. `@octokit/rest` is the obvious alternative and was the
 * one the plan first named, but `@octokit/plugin-rest-endpoint-methods`
 * alone is 1.4 MB unpacked and its endpoint map is a single object literal
 * no bundler can shake -- for twelve endpoints, all of which are one line
 * each here.
 *
 * `fetch` is a constructor argument, not a global. That is what makes every
 * layer above this file testable with no interception anywhere: the entry
 * workflow is driven against an in-memory GitHub, and the only test that
 * needs a real network stack is the one that deliberately exercises it.
 */

/** Anything the API refused. */
/**
 * How many entries `GET /contents/{dir}` will return for a directory.
 *
 * GitHub's own limit, and it is not an error: a longer directory comes
 * back as exactly this many items with nothing to say more exist. Reading
 * past it means the git trees API, which is a different shape and a
 * different cost, so this layer reports the cap rather than hiding it.
 */
export const DIRECTORY_LIMIT = 1000;

export class GitHubError extends Error {
    readonly status: number;
    readonly method: string;
    readonly path: string;
    /** The parsed response body, when there was one. */
    readonly body: unknown;

    constructor(method: string, path: string, status: number, body: unknown) {
        const detail = messageFrom(body);
        super(`${method} ${path} failed: ${status}${detail ? ` -- ${detail}` : ''}`);
        this.name = 'GitHubError';
        this.status = status;
        this.method = method;
        this.path = path;
        this.body = body;
    }
}

/**
 * Somebody else moved the ref first.
 *
 * Its own type because it is the one API failure a shell must handle rather
 * than report: the user's work is still in hand and re-reading the branch
 * can recover it. Matching on a status code or an error string to find that
 * out is the kind of thing that breaks when a message is reworded.
 */
export class ConflictError extends GitHubError {
    constructor(method: string, path: string, status: number, body: unknown) {
        super(method, path, status, body);
        this.name = 'ConflictError';
    }
}

function messageFrom(body: unknown): string {
    if (body && typeof body === 'object' && typeof (body as {message?: unknown}).message === 'string') {
        return (body as {message: string}).message;
    }
    return '';
}

// --- bytes ----------------------------------------------------------------

/* `btoa` takes a string of code points below 256, so a multi-byte character
   handed to it straight either throws or -- worse, where it does not --
   writes the wrong bytes. Everything that leaves here is encoded through
   `TextEncoder` first, which is the only reason an accented word in a post
   survives a round trip. */

/** Base64 for arbitrary bytes. */
export function encodeBase64(bytes: Uint8Array): string {
    /* Chunked, because `String.fromCharCode(...bytes)` spreads the whole
       array into an argument list and overflows the stack somewhere around
       a hundred thousand elements -- which is a small image. */
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/** Base64 of a string's UTF-8 bytes. */
export function encodeText(text: string): string {
    return encodeBase64(new TextEncoder().encode(text));
}

/** The bytes a base64 payload stands for. */
export function decodeBase64(base64: string): Uint8Array {
    /* No whitespace strip before `atob`. The API wraps its base64 at 60
       columns, but nothing here ever sees that -- reads go through
       `Accept: raw` -- and `atob` is specified to ignore ASCII whitespace
       anyway. Mutation testing confirmed no test could fail with it. */
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** The text a base64 payload stands for, read as UTF-8. */
export function decodeText(base64: string): string {
    return new TextDecoder().decode(decodeBase64(base64));
}

// --- the client -----------------------------------------------------------

/** Supplies a token per request, so a refresh is invisible from here. */
export type TokenSource = string | (() => string | null | Promise<string | null>);

export interface GitHubOptions {
    /** `owner/name`. */
    repo: string;
    token?: TokenSource;
    /**
     * REST root, without a trailing slash.
     *
     * Not normalised here: `parseConfig` already strips it, and a second
     * copy of the same rule is one more place for the two to disagree.
     */
    apiBase?: string;
    fetch?: typeof globalThis.fetch;
}

export interface TreeEntry {
    path: string;
    mode: '100644' | '100755' | '040000' | '160000' | '120000';
    type: 'blob' | 'tree' | 'commit';
    sha: string | null;
    size?: number;
}

export interface PullRequest {
    number: number;
    title: string;
    body: string;
    draft: boolean;
    state: string;
    head: {ref: string; sha: string};
    base: {ref: string};
    labels: {name: string}[];
    html_url: string;
    updated_at: string;
}

const JSON_MEDIA = 'application/vnd.github+json';

export class GitHub {

    readonly owner: string;
    readonly name: string;
    private readonly apiBase: string;
    private readonly token: TokenSource | undefined;
    private readonly http: typeof globalThis.fetch;

    constructor(options: GitHubOptions) {
        const [owner, name] = options.repo.split('/');
        this.owner = owner;
        this.name = name;
        this.apiBase = options.apiBase ?? 'https://api.github.com';
        this.token = options.token;
        /* Bound. `this.http(...)` is a method call, so an unbound
           `globalThis.fetch` arrives with the client as its receiver and
           the browser refuses it -- "Illegal invocation", from a line
           that looks like a plain function call. Invisible to every test
           that injects a transport, which is all of them until one drives
           a real page. */
        this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
    }

    /** `/repos/{owner}/{name}` plus whatever follows. */
    private repoPath(suffix = ''): string {
        return `/repos/${this.owner}/${this.name}${suffix}`;
    }

    private async headers(accept: string): Promise<Record<string, string>> {
        const headers: Record<string, string> = {
            Accept: accept,
            'X-GitHub-Api-Version': '2022-11-28'
        };
        const token = typeof this.token === 'function' ? await this.token() : this.token;
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        return headers;
    }

    /**
     * One request, for the endpoints where any failure is a failure.
     *
     * The others -- reading a file, a directory or a branch head -- call
     * `send` instead, because for them a 404 is an answer rather than an
     * error and has to be seen before this would throw over it.
     */
    async request<T>(method: string, path: string, options: {body?: unknown} = {}): Promise<T> {
        const response = await this.send(method, path, options);
        if (!response.ok) {
            throw await errorFor(method, path, response);
        }
        return await response.json() as T;
    }

    private async send(
        method: string,
        path: string,
        options: {body?: unknown; accept?: string} = {}
    ): Promise<Response> {
        const init: RequestInit = {
            method,
            headers: await this.headers(options.accept ?? JSON_MEDIA)
        };
        if (options.body !== undefined) {
            init.body = JSON.stringify(options.body);
            (init.headers as Record<string, string>)['Content-Type'] = JSON_MEDIA;
        }
        return this.http(`${this.apiBase}${path}`, init);
    }

    /**
     * Every page of a list endpoint, followed by the `Link` header.
     *
     * Following the header rather than counting pages: a collection that
     * grows past `per_page` between two requests would otherwise be read
     * short, and a folder quietly missing its newest entries is not a
     * failure anyone would look for.
     */
    async paginate<T>(path: string): Promise<T[]> {
        const items: T[] = [];
        let next: string | null = `${this.apiBase}${path}${path.includes('?') ? '&' : '?'}per_page=100`;

        while (next) {
            const response: Response = await this.http(next, {
                method: 'GET',
                headers: await this.headers(JSON_MEDIA)
            });
            if (!response.ok) {
                throw await errorFor('GET', next, response);
            }
            items.push(...await response.json() as T[]);
            next = nextLink(response.headers.get('Link'));
        }
        return items;
    }

    // --- repository -------------------------------------------------------

    /** Repository metadata, including `default_branch`. */
    repo(): Promise<{default_branch: string; permissions?: {push?: boolean}}> {
        return this.request('GET', this.repoPath());
    }

    // --- contents ---------------------------------------------------------

    /**
     * A file's text, or null if it is not there.
     *
     * Read as `raw` rather than as base64 JSON. Two reasons, both silent
     * when got wrong: the JSON form wraps its base64 in newlines and
     * decodes to mojibake for any non-ASCII byte if handled naively, and
     * over 1 MB it gives up entirely, returning `encoding: "none"` and an
     * empty string rather than an error.
     */
    async readFile(path: string, ref: string): Promise<string | null> {
        const at = `${this.repoPath(`/contents/${encodePath(path)}`)}?ref=${encodeURIComponent(ref)}`;
        const response = await this.send('GET', at, {accept: 'application/vnd.github.raw'});
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw await errorFor('GET', at, response);
        }
        return response.text();
    }

    /**
     * The entries of a directory, or [] if it is not there.
     *
     * Silently capped at `DIRECTORY_LIMIT`, which is why that constant is
     * exported: the response carries no `Link` header and no flag saying
     * it was cut short, so the only way to notice is to count.
     */
    async listDirectory(path: string, ref: string): Promise<{name: string; path: string; type: string; sha: string}[]> {
        const at = `${this.repoPath(`/contents/${encodePath(path)}`)}?ref=${encodeURIComponent(ref)}`;
        const response = await this.send('GET', at);
        if (response.status === 404) {
            /* An empty folder and a folder nobody has created yet are the
               same thing in git, and a collection with no entries is an
               ordinary state rather than a misconfiguration. */
            return [];
        }
        if (!response.ok) {
            throw await errorFor('GET', at, response);
        }
        const body = await response.json();
        return Array.isArray(body) ? body : [];
    }

    // --- git data ---------------------------------------------------------

    /** The commit sha a branch points at, or null if there is no such branch. */
    async branchSha(branch: string): Promise<string | null> {
        const at = this.repoPath(`/git/ref/heads/${encodePath(branch)}`);
        const response = await this.send('GET', at);
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw await errorFor('GET', at, response);
        }
        return (await response.json() as {object: {sha: string}}).object.sha;
    }

    createBranch(branch: string, sha: string): Promise<unknown> {
        return this.request('POST', this.repoPath('/git/refs'), {
            body: {ref: `refs/heads/${branch}`, sha}
        });
    }

    /**
     * Move a branch, never forcing.
     *
     * A forced update would silently discard a commit somebody else pushed
     * to this entry's branch -- a reviewer's fixup, most likely. Refusing
     * and surfacing a `ConflictError` leaves the shell able to re-read and
     * retry with the user's work still in hand.
     */
    updateBranch(branch: string, sha: string): Promise<unknown> {
        return this.request('PATCH', this.repoPath(`/git/refs/heads/${encodePath(branch)}`), {
            body: {sha, force: false}
        });
    }

    /**
     * Move a branch anywhere, discarding whatever it pointed at.
     *
     * Separate from `updateBranch` rather than a flag on it, so that
     * every forced write is visible at the call site. There is exactly
     * one: `CmsRepo.saveEntry` resetting a `cms/...` branch whose pull
     * request is no longer open.
     */
    resetBranch(branch: string, sha: string): Promise<unknown> {
        return this.request('PATCH', this.repoPath(`/git/refs/heads/${encodePath(branch)}`), {
            body: {sha, force: true}
        });
    }

    /**
     * A blob's bytes, by sha.
     *
     * Content-addressed, so unlike `readFile` there is no ref for this to
     * be stale against and a 404 means the sha is wrong rather than "not
     * committed yet" -- which is why this one throws on every failure
     * instead of answering null.
     *
     * Read as `raw`, and handed back as BYTES rather than text. A blob
     * reached this way is an image: decoding it as a string would replace
     * every byte the encoder does not recognise with U+FFFD, and the
     * damage shows up as a picture that will not render rather than as an
     * error anybody can trace back to here.
     */
    async readBlob(sha: string): Promise<Uint8Array> {
        const at = this.repoPath(`/git/blobs/${encodeURIComponent(sha)}`);
        const response = await this.send('GET', at, {accept: 'application/vnd.github.raw'});
        if (!response.ok) {
            throw await errorFor('GET', at, response);
        }
        return new Uint8Array(await response.arrayBuffer());
    }

    async createBlob(content: string, encoding: 'utf-8' | 'base64'): Promise<string> {
        const blob = await this.request<{sha: string}>('POST', this.repoPath('/git/blobs'), {
            body: {content, encoding}
        });
        return blob.sha;
    }

    /** A commit's tree sha. */
    async commitTree(sha: string): Promise<string> {
        const commit = await this.request<{tree: {sha: string}}>(
            'GET', this.repoPath(`/git/commits/${sha}`));
        return commit.tree.sha;
    }

    listTree(sha: string): Promise<{tree: TreeEntry[]; truncated: boolean}> {
        return this.request('GET', this.repoPath(`/git/trees/${sha}?recursive=1`));
    }

    async createTree(baseTree: string, entries: TreeEntry[]): Promise<string> {
        const tree = await this.request<{sha: string}>('POST', this.repoPath('/git/trees'), {
            body: {base_tree: baseTree, tree: entries}
        });
        return tree.sha;
    }

    async createCommit(message: string, tree: string, parents: string[]): Promise<string> {
        const commit = await this.request<{sha: string}>('POST', this.repoPath('/git/commits'), {
            body: {message, tree, parents}
        });
        return commit.sha;
    }

    // --- pull requests ----------------------------------------------------

    createPull(options: {
        title: string; body: string; head: string; base: string; draft: boolean;
    }): Promise<PullRequest> {
        return this.request('POST', this.repoPath('/pulls'), {body: options});
    }

    /** Every open pull request. */
    listPulls(): Promise<PullRequest[]> {
        return this.paginate(this.repoPath('/pulls?state=open'));
    }

    async findPull(head: string): Promise<PullRequest | null> {
        /* Filtered by the API rather than by us, because `head` has to be
           qualified with the owner and getting that wrong returns every
           open pull request instead of none -- a bug that reads as "the
           wrong PR was updated". */
        const pulls = await this.request<PullRequest[]>('GET',
            `${this.repoPath('/pulls')}?state=open&head=${encodeURIComponent(`${this.owner}:${head}`)}`);
        return pulls[0] ?? null;
    }

    // --- labels -----------------------------------------------------------

    /**
     * Add labels, creating any the repository does not have.
     *
     * `POST /issues/{n}/labels` creates unknown labels implicitly, which is
     * the behaviour this relies on: a fresh repository has none of the
     * `cms/*` labels and asking the operator to make three by hand before
     * the tool works is not a setup step worth having.
     */
    addLabels(issue: number, labels: string[]): Promise<unknown> {
        return this.request('POST', this.repoPath(`/issues/${issue}/labels`), {body: {labels}});
    }

    async removeLabel(issue: number, label: string): Promise<void> {
        const at = this.repoPath(`/issues/${issue}/labels/${encodeURIComponent(label)}`);
        const response = await this.send('DELETE', at);
        /* Removing a label the issue does not carry is the state the caller
           wanted, so a 404 here is success. Treating it as an error would
           make every status transition conditional on reading the labels
           first. */
        if (!response.ok && response.status !== 404) {
            throw await errorFor('DELETE', at, response);
        }
    }
}

// --- helpers --------------------------------------------------------------

/** Percent-encode a repository path, keeping its separators. */
function encodePath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
}

async function errorFor(method: string, path: string, response: Response): Promise<GitHubError> {
    let body: unknown = null;
    try {
        const text = await response.text();
        body = text ? JSON.parse(text) : null;
    } catch {
        /* A non-JSON error body says nothing the status does not. Losing
           it must not replace the API's failure with a parse failure. */
    }
    /* 409 is git's own "the ref moved"; 422 is what a non-forced ref
       update returns when the new commit is not a descendant of the old
       one, which is the same condition reached from the other side. */
    const Ctor = response.status === 409 || (response.status === 422 && /\/git\/refs\//.test(path))
        ? ConflictError
        : GitHubError;
    return new Ctor(method, path, response.status, body);
}

/** The `rel="next"` URL of a Link header, or null. */
function nextLink(header: string | null): string | null {
    if (!header) {
        return null;
    }
    for (const part of header.split(',')) {
        const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
        if (match) {
            return match[1];
        }
    }
    return null;
}
