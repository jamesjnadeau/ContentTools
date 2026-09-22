/* An in-memory GitHub, over the twelve endpoints `src/cms/github.ts` uses.
 *
 * It is a `fetch`, so it substitutes for the real one with no interception
 * anywhere -- the client is constructed with it and nothing else in the
 * stack knows the difference. That is the whole reason `fetch` is a
 * constructor argument.
 *
 * It models git rather than a key-value store: blobs, trees, commits with
 * parents, and refs. That costs perhaps eighty lines more than a
 * `Map<path, text>` and buys the only assertions worth making about this
 * layer -- that an entry and its two images arrive in ONE commit, that a
 * non-forced ref update refuses when somebody else has pushed, that a
 * second save adds a commit to the branch rather than replacing it. A
 * key-value fake passes all of those vacuously.
 *
 * `test/golden/cms-dist.spec.mjs` serves the same model through Playwright
 * route interception against the real `fetch`, so the request shapes this
 * file accepts are checked against the browser's own stack too.
 */

const API = 'https://api.github.com';

/**
 * One header, however it was spelled.
 *
 * HTTP header names are case-insensitive and the two callers spell them
 * differently: the client sends a plain object with `Accept`, and the
 * Playwright route in `test/golden/cms-dist.spec.mjs` hands over what the
 * browser actually sent, which is lower-cased. Matching only one spelling
 * made a `raw` read come back as JSON, and the client stored the JSON
 * envelope as the entry's text.
 */
function header(headers, name) {
    for (const [key, value] of Object.entries(headers ?? {})) {
        if (key.toLowerCase() === name) {
            return value;
        }
    }
    return '';
}

/** Bytes as base64, for the JSON form of a blob read. */
function encode64(bytes) {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

/** Deterministic 40-hex object ids, so failures read the same twice. */
function makeSha(kind, n) {
    return `${kind}${String(n).padStart(38 - kind.length, '0')}0`.slice(0, 40).padEnd(40, '0');
}

export function createFakeGitHub(options = {}) {
    const repo = options.repo ?? 'owner/site';
    const defaultBranch = options.branch ?? 'main';

    const blobs = new Map();     // sha -> {content, encoding}
    const trees = new Map();     // sha -> [{path, mode, type, sha}]
    const commits = new Map();   // sha -> {tree, parents, message}
    const refs = new Map();      // branch -> commit sha
    const pulls = [];
    const requests = [];         // every [method, path] served, in order

    let counter = 0;
    const next = kind => makeSha(kind, counter += 1);

    // --- seeding ----------------------------------------------------------

    function putBlob(content, encoding = 'utf-8') {
        const sha = next('b');
        blobs.set(sha, {content, encoding});
        return sha;
    }

    /** Text of a blob, whatever it was stored as. */
    function blobText(sha) {
        const blob = blobs.get(sha);
        if (!blob) {
            return null;
        }
        if (blob.encoding !== 'base64') {
            return blob.content;
        }
        const binary = atob(blob.content.replace(/\s+/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder().decode(bytes);
    }

    /**
     * A blob's BYTES, whatever it was stored as.
     *
     * Separate from `blobText` on purpose. The media library reads
     * pictures through `/git/blobs`, and running those through
     * `TextDecoder` and back would replace every byte above 0x7f with
     * U+FFFD -- so a fake that only spoke text would hand the shell a
     * corrupted PNG and call it a pass.
     */
    function blobBytes(sha) {
        const blob = blobs.get(sha);
        if (!blob) {
            return null;
        }
        if (blob.encoding !== 'base64') {
            return new TextEncoder().encode(blob.content);
        }
        const binary = atob(blob.content.replace(/\s+/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function putTree(entries) {
        const sha = next('t');
        trees.set(sha, entries);
        return sha;
    }

    function putCommit(tree, parents, message) {
        const sha = next('c');
        commits.set(sha, {tree, parents, message});
        return sha;
    }

    /**
     * Seed the default branch with `{path: text}`.
     *
     * A value may also be `{base64}`, for a file that is not text. A
     * media folder seeded as a string would round-trip through
     * `TextEncoder` and decode as a picture nothing can read, which is
     * the fake lying about the one thing the media tests are checking.
     */
    function seed(files) {
        const entries = Object.entries(files).map(([path, content]) => ({
            path,
            mode: '100644',
            type: 'blob',
            sha: typeof content === 'string'
                ? putBlob(content)
                : putBlob(content.base64, 'base64')
        }));
        const commit = putCommit(putTree(entries), [], 'seed');
        refs.set(defaultBranch, commit);
    }
    seed(options.files ?? {});

    // --- reading ----------------------------------------------------------

    /** The tree entries a ref name or commit sha resolves to. */
    function treeFor(ref) {
        const commitSha = refs.has(ref) ? refs.get(ref) : (commits.has(ref) ? ref : null);
        if (!commitSha) {
            return null;
        }
        return trees.get(commits.get(commitSha).tree) ?? [];
    }

    /** Is `ancestor` reachable from `sha` by walking parents? */
    function isDescendant(sha, ancestor) {
        const seen = new Set();
        const stack = [sha];
        while (stack.length) {
            const at = stack.pop();
            if (at === ancestor) {
                return true;
            }
            if (seen.has(at)) {
                continue;
            }
            seen.add(at);
            stack.push(...(commits.get(at)?.parents ?? []));
        }
        return false;
    }

    // --- the fetch --------------------------------------------------------

    const json = (body, status = 200, headers = {}) => new Response(
        body === null ? '' : JSON.stringify(body),
        {status, headers: {'Content-Type': 'application/json', ...headers}});

    const fail = (status, message) => json({message}, status);

    async function fakeFetch(url, init = {}) {
        const request = new URL(url, API);
        const method = (init.method ?? 'GET').toUpperCase();
        const path = request.pathname;
        const query = request.searchParams;
        const accept = header(init.headers, 'accept');
        const body = init.body ? JSON.parse(init.body) : undefined;

        requests.push([method, path + (request.search || ''), init.headers ?? {}]);

        /* GitHub refuses a request body that does not declare
           `application/json` -- the VERSIONED type it wants on `Accept` is
           rejected here, which is not a distinction any amount of reading
           the docs makes obvious.

           This check exists because its absence certified a broken client
           for the whole of M3 through M5: the shipped `GitHub` client sent
           `application/vnd.github+json` as its Content-Type, every write
           against real GitHub came back 415, and 1,577 unit tests and 14
           dist tests were green the entire time. A fake that accepts what
           the real server refuses is worse than no fake, because it is
           trusted. Found by the first save against a real repository. */
        if (init.body !== undefined) {
            const sent = (header(init.headers, 'content-type') ?? '')
                .split(';')[0].trim().toLowerCase();
            if (sent !== 'application/json') {
                return fail(415, 'Request bodies must declare Content-Type: '
                    + 'application/json. Resend the JSON body with that header.');
            }
        }

        const prefix = `/repos/${repo}`;
        if (!path.startsWith(prefix)) {
            return fail(404, 'Not Found');
        }
        const rest = path.slice(prefix.length);

        // GET /repos/{o}/{r}
        if (rest === '' && method === 'GET') {
            return json({default_branch: defaultBranch, permissions: {push: true}});
        }

        // /contents/{path}
        if (rest.startsWith('/contents/') && method === 'GET') {
            const target = decodeURIComponent(rest.slice('/contents/'.length));
            const tree = treeFor(query.get('ref') ?? defaultBranch);
            if (!tree) {
                return fail(404, 'No commit found for the ref');
            }
            const file = tree.find(entry => entry.path === target);
            if (file) {
                return accept.includes('raw')
                    ? new Response(blobText(file.sha), {status: 200})
                    : json({path: target, sha: file.sha, encoding: 'base64',
                            content: btoa(blobText(file.sha))});
            }
            const inside = tree.filter(entry => entry.path.startsWith(`${target}/`));
            if (inside.length === 0) {
                return fail(404, 'Not Found');
            }
            /* A directory listing is one level deep and names a
               subdirectory once, which is what makes `slugFromPath`
               reject nested paths rather than never see them. */
            const seen = new Map();
            for (const entry of inside) {
                const [name, ...deeper] = entry.path.slice(target.length + 1).split('/');
                if (!seen.has(name)) {
                    seen.set(name, {
                        name,
                        path: `${target}/${name}`,
                        type: deeper.length ? 'dir' : 'file',
                        sha: entry.sha
                    });
                }
            }
            return json([...seen.values()]);
        }

        // /git/ref/heads/{branch}
        if (rest.startsWith('/git/ref/heads/') && method === 'GET') {
            const branch = decodeURIComponent(rest.slice('/git/ref/heads/'.length));
            if (!refs.has(branch)) {
                return fail(404, 'Not Found');
            }
            return json({ref: `refs/heads/${branch}`, object: {sha: refs.get(branch), type: 'commit'}});
        }

        // POST /git/refs
        if (rest === '/git/refs' && method === 'POST') {
            const branch = body.ref.replace('refs/heads/', '');
            if (refs.has(branch)) {
                return fail(422, 'Reference already exists');
            }
            refs.set(branch, body.sha);
            return json({ref: body.ref, object: {sha: body.sha}}, 201);
        }

        // PATCH /git/refs/heads/{branch}
        if (rest.startsWith('/git/refs/heads/') && method === 'PATCH') {
            const branch = decodeURIComponent(rest.slice('/git/refs/heads/'.length));
            if (!refs.has(branch)) {
                return fail(422, 'Reference does not exist');
            }
            if (!body.force && !isDescendant(body.sha, refs.get(branch))) {
                return fail(422, 'Update is not a fast forward');
            }
            refs.set(branch, body.sha);
            return json({ref: `refs/heads/${branch}`, object: {sha: body.sha}});
        }

        // POST /git/blobs
        if (rest === '/git/blobs' && method === 'POST') {
            const sha = next('b');
            blobs.set(sha, {content: body.content, encoding: body.encoding ?? 'utf-8'});
            return json({sha}, 201);
        }

        // GET /git/blobs/{sha}
        if (rest.startsWith('/git/blobs/') && method === 'GET') {
            const sha = decodeURIComponent(rest.slice('/git/blobs/'.length));
            const bytes = blobBytes(sha);
            if (!bytes) {
                return fail(404, 'Not Found');
            }
            /* Raw BYTES for a raw accept, not a string: the client reads
               this with `arrayBuffer()`, and a `Response` built from a
               string would UTF-8 encode it on the way out -- turning
               every byte above 0x7f into two and producing an image the
               browser refuses, from a fake that looked fine. */
            return accept.includes('raw')
                ? new Response(bytes, {status: 200})
                : json({sha, encoding: 'base64', content: encode64(bytes)});
        }

        // GET /git/commits/{sha}
        if (rest.startsWith('/git/commits/') && method === 'GET') {
            const sha = rest.slice('/git/commits/'.length);
            const commit = commits.get(sha);
            if (!commit) {
                return fail(404, 'Not Found');
            }
            return json({sha, message: commit.message, tree: {sha: commit.tree},
                         parents: commit.parents.map(p => ({sha: p}))});
        }

        // POST /git/commits
        if (rest === '/git/commits' && method === 'POST') {
            return json({sha: putCommit(body.tree, body.parents ?? [], body.message)}, 201);
        }

        // GET /git/trees/{sha}
        if (rest.startsWith('/git/trees/') && method === 'GET') {
            const sha = rest.slice('/git/trees/'.length);
            const tree = trees.get(sha);
            if (!tree) {
                return fail(404, 'Not Found');
            }
            return json({sha, truncated: false, tree});
        }

        // POST /git/trees
        if (rest === '/git/trees' && method === 'POST') {
            const base = new Map((trees.get(body.base_tree) ?? []).map(e => [e.path, e]));
            for (const entry of body.tree) {
                if (entry.sha === null) {
                    base.delete(entry.path);
                } else {
                    base.set(entry.path, {
                        path: entry.path,
                        mode: entry.mode ?? '100644',
                        type: entry.type ?? 'blob',
                        sha: entry.sha
                    });
                }
            }
            return json({sha: putTree([...base.values()])}, 201);
        }

        // /pulls
        if (rest === '/pulls' && method === 'GET') {
            let open = pulls.filter(pull => pull.state === 'open');
            const head = query.get('head');
            if (head) {
                open = open.filter(pull => `${repo.split('/')[0]}:${pull.head.ref}` === head);
            }
            return paged(open.map(view), query);
        }

        if (rest === '/pulls' && method === 'POST') {
            if (!refs.has(body.head)) {
                return fail(422, `No commits between ${body.base} and ${body.head}`);
            }
            const pull = {
                number: pulls.length + 1,
                title: body.title,
                body: body.body ?? '',
                draft: Boolean(body.draft),
                state: 'open',
                head: {ref: body.head},
                base: {ref: body.base},
                labels: [],
                html_url: `https://github.com/${repo}/pull/${pulls.length + 1}`,
                updated_at: new Date(0).toISOString()
            };
            pulls.push(pull);
            return json(view(pull), 201);
        }

        // /issues/{n}/labels
        const labelMatch = /^\/issues\/(\d+)\/labels(?:\/(.+))?$/.exec(rest);
        if (labelMatch) {
            const pull = pulls.find(p => p.number === Number(labelMatch[1]));
            if (!pull) {
                return fail(404, 'Not Found');
            }
            if (method === 'POST') {
                for (const name of body.labels) {
                    if (!pull.labels.some(label => label.name === name)) {
                        pull.labels.push({name});
                    }
                }
                return json(pull.labels);
            }
            if (method === 'DELETE') {
                const name = decodeURIComponent(labelMatch[2]);
                if (!pull.labels.some(label => label.name === name)) {
                    return fail(404, 'Label does not exist');
                }
                pull.labels = pull.labels.filter(label => label.name !== name);
                return json(pull.labels);
            }
        }

        return fail(404, `no fake route for ${method} ${rest}`);
    }

    /**
     * A pull request as the API reports it NOW.
     *
     * `head.sha` is not stored on the pull request, it is read from the
     * ref every time -- because that is what GitHub does, and a fake that
     * froze it at creation would report a stale head for exactly the case
     * the client uses it for: telling a shell which commit its copy of an
     * entry came from, so a save can refuse to build on a version somebody
     * has pushed past.
     */
    function view(pull) {
        return {...pull, head: {ref: pull.head.ref, sha: refs.get(pull.head.ref)}};
    }

    /** Serve one page, with a Link header when more remain. */
    function paged(items, query) {
        const perPage = Number(query.get('per_page') ?? 30);
        const page = Number(query.get('page') ?? 1);
        const slice = items.slice((page - 1) * perPage, page * perPage);
        const headers = {};
        const last = Math.ceil(items.length / perPage);
        if (page < last) {
            /* Every rel GitHub actually sends, in its order -- `next` is
               NOT first. A client that takes the first `<...>` it finds
               would follow `prev` back to the page it just read, or
               `last` and skip everything between. */
            const at = n => `<${API}/repos/${repo}/pulls?state=open&per_page=${perPage}&page=${n}>`;
            const links = [];
            if (page > 1) {
                links.push(`${at(page - 1)}; rel="prev"`, `${at(1)}; rel="first"`);
            }
            links.push(`${at(page + 1)}; rel="next"`, `${at(last)}; rel="last"`);
            headers.Link = links.join(', ');
        }
        return json(slice, 200, headers);
    }

    return {
        fetch: fakeFetch,
        repo,
        defaultBranch,
        requests,

        /** Text at a path on a branch, or null. */
        read(path, ref = defaultBranch) {
            const entry = (treeFor(ref) ?? []).find(e => e.path === path);
            return entry ? blobText(entry.sha) : null;
        },

        /** Raw bytes at a path on a branch, or null. */
        bytes(path, ref = defaultBranch) {
            const entry = (treeFor(ref) ?? []).find(e => e.path === path);
            if (!entry) {
                return null;
            }
            const blob = blobs.get(entry.sha);
            if (blob.encoding !== 'base64') {
                return new TextEncoder().encode(blob.content);
            }
            const binary = atob(blob.content.replace(/\s+/g, ''));
            return Uint8Array.from(binary, c => c.charCodeAt(0));
        },

        /** Every path on a branch. */
        paths(ref = defaultBranch) {
            return (treeFor(ref) ?? []).map(entry => entry.path).sort();
        },

        /** The commits on a branch, newest first. */
        history(ref = defaultBranch) {
            const out = [];
            let at = refs.get(ref);
            while (at) {
                out.push({sha: at, ...commits.get(at)});
                at = commits.get(at).parents[0];
            }
            return out;
        },

        branches() {
            return [...refs.keys()].sort();
        },

        pulls() {
            return pulls;
        },

        /** Push a commit as somebody else would, to force a conflict. */
        pushOther(branch, files, message = 'someone else') {
            const base = new Map((treeFor(branch) ?? []).map(e => [e.path, e]));
            for (const [path, text] of Object.entries(files)) {
                base.set(path, {path, mode: '100644', type: 'blob', sha: putBlob(text)});
            }
            const commit = putCommit(putTree([...base.values()]), [refs.get(branch)], message);
            refs.set(branch, commit);
            return commit;
        },

        /**
         * Open a pull request for one entry, as a save would have.
         *
         * The branch is created pointing at the base, so `listInFlight`
         * sees a real ref rather than a name. Labels are given as plain
         * strings because that is how a test talks about them; the API's
         * `{name}` shape is this layer's problem, not the caller's.
         */
        openPull(collection, slug, labels = []) {
            const ref = `cms/${collection}/${slug}`;
            refs.set(ref, refs.get(defaultBranch));
            const number = pulls.length + 1;
            const pull = {
                number,
                title: `${collection}/${slug}`,
                body: '',
                draft: false,
                state: 'open',
                head: {ref},
                base: {ref: defaultBranch},
                labels: labels.map(name => ({name})),
                html_url: `https://github.com/${repo}/pull/${number}`,
                updated_at: new Date(0).toISOString()
            };
            pulls.push(pull);
            return pull;
        },

        /**
         * Merge a pull request, as a person does on GitHub.
         *
         * The base branch moves to the head and the pull request
         * closes. Closing it and nothing else would be the easier lie:
         * the review list empties either way, and the entry would
         * still be missing from the base branch -- so a test could not
         * tell a merge from an abandoned change, which is the
         * difference the merge means.
         *
         * The head branch is left standing, because GitHub leaves it
         * standing unless the repository is set to delete it.
         */
        mergePull(number) {
            const pull = pulls.find(candidate => candidate.number === number);
            refs.set(pull.base.ref, refs.get(pull.head.ref));
            pull.state = 'closed';
            return pull;
        },

        /** Add `count` open pull requests, to exercise pagination. */
        addPulls(count) {
            for (let i = 0; i < count; i += 1) {
                const ref = `cms/bulk/entry-${i}`;
                refs.set(ref, refs.get(defaultBranch));
                pulls.push({
                    number: pulls.length + 1, title: ref, body: '', draft: false,
                    state: 'open', head: {ref},
                    base: {ref: defaultBranch}, labels: [],
                    html_url: '', updated_at: new Date(0).toISOString()
                });
            }
        }
    };
}
