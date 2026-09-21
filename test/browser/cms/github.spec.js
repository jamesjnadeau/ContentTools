/* The GitHub client, against the in-memory GitHub.

   Most of what is worth asserting here is not "the happy path works" --
   it is the handful of behaviours that fail SILENTLY when got wrong:
   non-ASCII text mangled by base64, a list read short because pagination
   stopped at one page, a ref update that overwrites somebody else's
   commit, and a 404 that means "not there yet" rather than "broken". */

import {
    GitHub, GitHubError, ConflictError,
    encodeText, encodeBase64, decodeText, decodeBase64
} from '../../../src/cms/github.js';
import {createFakeGitHub} from './fake-github.js';

/** A client wired to a fresh fake. */
function connect(files = {}, options = {}) {
    const fake = createFakeGitHub({files, ...options});
    const client = new GitHub({repo: fake.repo, token: 'tok', fetch: fake.fetch});
    return {fake, client};
}

describe('base64', function() {

    /* The trap is that the naive version WORKS for ASCII, so a repository
       of English prose looks fine right up until somebody writes "café". */
    const SAMPLES = [
        'plain ascii',
        'café — naïve, résumé',
        'emoji: 🐈 🇬🇧 👩‍👩‍👧‍👦',
        'CJK: 日本語のテキスト',
        'combining: é vs é',
        ''
    ];

    it.each(SAMPLES.map(s => [s]))('round-trips %j', function(text) {
        return expect(decodeText(encodeText(text))).toBe(text);
    });

    it('round-trips arbitrary bytes', function() {
        const bytes = new Uint8Array(256);
        for (let i = 0; i < 256; i += 1) {
            bytes[i] = i;
        }
        return expect([...decodeBase64(encodeBase64(bytes))]).toEqual([...bytes]);
    });

    it('encodes more bytes than fit in an argument list', function() {
        /* `String.fromCharCode(...bytes)` overflows the stack somewhere
           around a hundred thousand arguments, which is a small image --
           so this is an ordinary upload, not an edge case. */
        const bytes = new Uint8Array(400_000).map((_, i) => i % 251);
        const decoded = decodeBase64(encodeBase64(bytes));
        expect(decoded.length).toBe(bytes.length);
        return expect(decoded[399_999]).toBe(bytes[399_999]);
    });

});

describe('requests', function() {

    it('authenticates', async function() {
        const {fake, client} = connect();
        await client.repo();
        const [, , headers] = fake.requests[0];
        return expect(headers.Authorization).toBe('Bearer tok');
    });

    it('takes a token from a function, per request', async function() {
        /* A token that can be refreshed between calls is why this is not
           just a string: an adapter re-authenticating mid-session must
           not require the client to be rebuilt. */
        const fake = createFakeGitHub();
        const tokens = ['first', 'second'];
        const client = new GitHub({
            repo: fake.repo, fetch: fake.fetch, token: () => tokens.shift()
        });
        await client.repo();
        await client.repo();
        return expect(fake.requests.map(([, , h]) => h.Authorization))
            .toEqual(['Bearer first', 'Bearer second']);
    });

    it('sends no Authorization when there is no token', async function() {
        // A public repository is readable unauthenticated, and an empty
        // Bearer header is rejected where no header is accepted.
        const fake = createFakeGitHub();
        await new GitHub({repo: fake.repo, fetch: fake.fetch}).repo();
        return expect('Authorization' in fake.requests[0][2]).toBe(false);
    });

    it('pins the API version', async function() {
        /* Without the header GitHub serves whatever its current default
           version is, so a future breaking default would change this
           client's behaviour with no commit here to explain it. */
        const {fake, client} = connect();
        await client.repo();
        return expect(fake.requests[0][2]['X-GitHub-Api-Version']).toBe('2022-11-28');
    });

    it('declares the content type of a body it sends', async function() {
        const {fake, client} = connect({'a.md': 'a'});
        await client.createBlob('x', 'utf-8');
        return expect(fake.requests.at(-1)[2]['Content-Type']).toBe('application/vnd.github+json');
    });

    it('talks to a GitHub Enterprise host when told to', async function() {
        /* `backend.apiBase` is a documented config option, and the
           failure if it is ignored is every request going to
           api.github.com -- which answers, with someone else's data. */
        const fake = createFakeGitHub();
        const seen = [];
        const client = new GitHub({
            repo: fake.repo,
            apiBase: 'https://ghe.example.com/api/v3',
            fetch: (url, init) => {
                seen.push(url);
                return fake.fetch(url.replace('https://ghe.example.com/api/v3', ''), init);
            }
        });
        await client.repo();
        return expect(seen).toEqual(['https://ghe.example.com/api/v3/repos/owner/site']);
    });

    it('reports the repository default branch', async function() {
        const {client} = connect({}, {branch: 'trunk'});
        return expect((await client.repo()).default_branch).toBe('trunk');
    });

    it('throws a GitHubError carrying the status and the API message', async function() {
        const fake = createFakeGitHub();
        const client = new GitHub({repo: 'owner/absent', fetch: fake.fetch});
        const error = await client.repo().catch(e => e);
        expect(error).toBeInstanceOf(GitHubError);
        expect(error.status).toBe(404);
        expect(error.method).toBe('GET');
        return expect(error.message).toContain('Not Found');
    });
});

describe('reading', function() {

    it('reads a file as text', async function() {
        const {client} = connect({'content/blog/a.md': '# Hello\n'});
        return expect(await client.readFile('content/blog/a.md', 'main')).toBe('# Hello\n');
    });

    it('reads non-ASCII text unmangled', async function() {
        const {client} = connect({'a.md': 'café 🐈\n'});
        return expect(await client.readFile('a.md', 'main')).toBe('café 🐈\n');
    });

    it('reads a file larger than the contents API will inline', async function() {
        /* Over 1 MB the JSON form gives up, returning `encoding: "none"`
           and an empty string rather than an error -- so a long post
           would come back blank and saving it would empty the file.
           Reading as raw is what avoids that. */
        const big = 'x'.repeat(1_500_000);
        const {fake, client} = connect({'big.md': big});
        expect(await client.readFile('big.md', 'main')).toBe(big);
        return expect(fake.requests[0][2].Accept).toContain('raw');
    });

    it('returns null for a file that is not there', async function() {
        // Distinct from an error: a new entry has no file yet.
        const {client} = connect();
        return expect(await client.readFile('nope.md', 'main')).toBe(null);
    });

    it('lists a directory one level deep', async function() {
        const {client} = connect({
            'content/blog/a.md': 'a',
            'content/blog/b.md': 'b',
            'content/blog/2026/c.md': 'c',
            'content/pages/x.md': 'x'
        });
        const entries = await client.listDirectory('content/blog', 'main');
        return expect(entries.map(e => `${e.type}:${e.name}`).sort())
            .toEqual(['dir:2026', 'file:a.md', 'file:b.md']);
    });

    it('reads an absent directory as empty', async function() {
        /* An empty folder and a folder nobody has created are the same
           thing in git, and a collection with no entries yet is an
           ordinary state rather than a misconfiguration. */
        const {client} = connect();
        return expect(await client.listDirectory('content/blog', 'main')).toEqual([]);
    });

    it('encodes a path without destroying its separators', async function() {
        const {fake, client} = connect({'content/a b/c+d.md': 'x'});
        expect(await client.readFile('content/a b/c+d.md', 'main')).toBe('x');
        return expect(fake.requests[0][1]).toContain('/contents/content/a%20b/c%2Bd.md');
    });
});

describe('branches', function() {

    it('reads a branch head, and null for one that does not exist', async function() {
        const {fake, client} = connect({'a.md': 'a'});
        expect(await client.branchSha('main')).toBe(fake.history('main')[0].sha);
        return expect(await client.branchSha('cms/blog/nope')).toBe(null);
    });

    it('creates a branch', async function() {
        const {fake, client} = connect({'a.md': 'a'});
        await client.createBranch('cms/blog/a', await client.branchSha('main'));
        return expect(fake.branches()).toEqual(['cms/blog/a', 'main']);
    });

    it('moves a branch forward', async function() {
        const {fake, client} = connect({'a.md': 'a'});
        const head = await client.branchSha('main');
        const tree = await client.createTree(await client.commitTree(head), [
            {path: 'a.md', mode: '100644', type: 'blob', sha: await client.createBlob('b', 'utf-8')}
        ]);
        await client.updateBranch('main', await client.createCommit('edit', tree, [head]));
        return expect(fake.read('a.md')).toBe('b');
    });

    it('refuses to move a branch backwards, as a ConflictError', async function() {
        /* The case this exists for: a reviewer pushes a fixup to the
           entry's branch while it is open in the editor. Forcing would
           discard their commit silently; refusing leaves the shell able
           to re-read and retry with the user's work still in hand. */
        const {fake, client} = connect({'a.md': 'a'});
        const stale = await client.branchSha('main');
        fake.pushOther('main', {'a.md': 'theirs'});

        const tree = await client.createTree(await client.commitTree(stale), [
            {path: 'a.md', mode: '100644', type: 'blob', sha: await client.createBlob('mine', 'utf-8')}
        ]);
        const commit = await client.createCommit('mine', tree, [stale]);

        const error = await client.updateBranch('main', commit).catch(e => e);
        expect(error).toBeInstanceOf(ConflictError);
        /* A ConflictError is still a GitHubError, so a caller that only
           handles the general case is not broken by the narrower one. */
        expect(error).toBeInstanceOf(GitHubError);
        return expect(fake.read('a.md')).toBe('theirs');
    });

    it('does not report an ordinary 422 as a conflict', async function() {
        // Creating a branch that already exists is a bug in the caller,
        // not a race with another writer.
        const {client} = connect({'a.md': 'a'});
        const head = await client.branchSha('main');
        const error = await client.createBranch('main', head).catch(e => e);
        expect(error).toBeInstanceOf(GitHubError);
        return expect(error).not.toBeInstanceOf(ConflictError);
    });
});

describe('trees and commits', function() {

    it('writes several files in one commit', async function() {
        /* The property the media scope rests on: an entry and its images
           are one commit, so an abandoned upload leaves nothing behind
           and a reviewer sees one coherent change. */
        const {fake, client} = connect({'a.md': 'a'});
        const head = await client.branchSha('main');
        const tree = await client.createTree(await client.commitTree(head), [
            {path: 'a.md', mode: '100644', type: 'blob', sha: await client.createBlob('edited', 'utf-8')},
            {path: 'img/one.png', mode: '100644', type: 'blob', sha: await client.createBlob(encodeText('ONE'), 'base64')},
            {path: 'img/two.png', mode: '100644', type: 'blob', sha: await client.createBlob(encodeText('TWO'), 'base64')}
        ]);
        await client.updateBranch('main', await client.createCommit('one commit', tree, [head]));

        expect(fake.paths()).toEqual(['a.md', 'img/one.png', 'img/two.png']);
        expect(fake.read('img/two.png')).toBe('TWO');
        return expect(fake.history().length).toBe(2);
    });

    it('keeps the rest of the tree', async function() {
        const {fake, client} = connect({'a.md': 'a', 'b.md': 'b'});
        const head = await client.branchSha('main');
        const tree = await client.createTree(await client.commitTree(head), [
            {path: 'a.md', mode: '100644', type: 'blob', sha: await client.createBlob('edited', 'utf-8')}
        ]);
        await client.updateBranch('main', await client.createCommit('edit', tree, [head]));
        return expect(fake.read('b.md')).toBe('b');
    });

    it('deletes a path with a null sha', async function() {
        const {fake, client} = connect({'a.md': 'a', 'b.md': 'b'});
        const head = await client.branchSha('main');
        const tree = await client.createTree(await client.commitTree(head), [
            {path: 'b.md', mode: '100644', type: 'blob', sha: null}
        ]);
        await client.updateBranch('main', await client.createCommit('drop', tree, [head]));
        return expect(fake.paths()).toEqual(['a.md']);
    });

    it('lists a tree', async function() {
        const {fake, client} = connect({'a.md': 'a', 'x/b.md': 'b'});
        const listed = await client.listTree(await client.commitTree(fake.history()[0].sha));
        return expect(listed.tree.map(e => e.path).sort()).toEqual(['a.md', 'x/b.md']);
    });
});

describe('pull requests', function() {

    async function withBranch() {
        const {fake, client} = connect({'a.md': 'a'});
        await client.createBranch('cms/blog/a', await client.branchSha('main'));
        return {fake, client};
    }

    it('opens one', async function() {
        const {client} = await withBranch();
        const pull = await client.createPull({
            title: 'Update a', body: 'why', head: 'cms/blog/a', base: 'main', draft: false
        });
        expect(pull.number).toBe(1);
        return expect(pull.head.ref).toBe('cms/blog/a');
    });

    it('finds one by its head branch', async function() {
        const {client} = await withBranch();
        await client.createPull({title: 't', body: '', head: 'cms/blog/a', base: 'main', draft: false});
        expect((await client.findPull('cms/blog/a')).number).toBe(1);
        return expect(await client.findPull('cms/blog/absent')).toBe(null);
    });

    it('qualifies the head with the owner when searching', async function() {
        /* Unqualified, GitHub ignores the filter and returns EVERY open
           pull request -- so `findPull` would hand back an unrelated one
           and the next save would push to somebody else's branch. */
        const {fake, client} = await withBranch();
        await client.findPull('cms/blog/a');
        return expect(fake.requests.at(-1)[1]).toContain(`head=${encodeURIComponent('owner:cms/blog/a')}`);
    });

    it('follows pagination to the last page', async function() {
        /* Reading one page would silently list only the first hundred
           entries in flight, and a missing entry looks like a missing
           entry rather than like a bug here. */
        const {fake, client} = connect({'a.md': 'a'});
        fake.addPulls(250);
        expect((await client.listPulls()).length).toBe(250);

        /* Three requests, not nine: the page size is asked for rather
           than taken as the API's default of 30. */
        return expect(fake.requests.filter(([, path]) => path.includes('/pulls')).length).toBe(3);
    });
});

describe('labels', function() {

    async function withPull() {
        const {fake, client} = connect({'a.md': 'a'});
        await client.createBranch('cms/blog/a', await client.branchSha('main'));
        const pull = await client.createPull({
            title: 't', body: '', head: 'cms/blog/a', base: 'main', draft: false});
        return {fake, client, pull};
    }

    it('adds labels the repository has never seen', async function() {
        /* A fresh repository has none of the cms/* labels, and making
           three by hand before the tool works is not a setup step worth
           having. */
        const {fake, client, pull} = await withPull();
        await client.addLabels(pull.number, ['cms/in-review']);
        return expect(fake.pulls()[0].labels.map(l => l.name)).toEqual(['cms/in-review']);
    });

    it('removes one', async function() {
        const {fake, client, pull} = await withPull();
        await client.addLabels(pull.number, ['cms/draft', 'cms/ready']);
        await client.removeLabel(pull.number, 'cms/draft');
        return expect(fake.pulls()[0].labels.map(l => l.name)).toEqual(['cms/ready']);
    });

    it('treats removing an absent label as success', async function() {
        /* It is the state the caller asked for. Throwing would make
           every status transition conditional on reading the labels
           first, for no gain. */
        const {client, pull} = await withPull();
        return expect(client.removeLabel(pull.number, 'cms/nope')).resolves.toBeUndefined();
    });

    it('still reports a label delete that failed for another reason', async function() {
        /* Only the 404 is forgiven. A read-only token gets a 403 here,
           and swallowing that would leave the shell showing a status
           transition that never happened. */
        const {fake} = await withPull();
        const forbidden = new GitHub({
            repo: fake.repo,
            fetch: (url, init) => ((init.method ?? 'GET') === 'DELETE'
                ? Promise.resolve(new Response(JSON.stringify({message: 'Resource not accessible'}),
                                               {status: 403}))
                : fake.fetch(url, init))
        });
        const error = await forbidden.removeLabel(1, 'cms/draft').catch(e => e);
        expect(error).toBeInstanceOf(GitHubError);
        expect(error.status).toBe(403);
        return expect(error.message).toContain('Resource not accessible');
    });
});
