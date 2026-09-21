/* The entry workflow, against the in-memory GitHub.

   Three of these are the reason the file exists, and each is a silent
   failure rather than a crash:

   - reading the base branch for an entry that already has a pull request
     open, which shows the user a version missing their own unmerged work
     and then commits over the top of it;
   - a second save opening a second pull request, or replacing the first
     branch rather than adding to it;
   - an entry and its media arriving in two commits, so that a reviewer
     sees a post referencing a file that is not there yet. */

import {parseConfig} from '../../../src/cms/config.js';
import {ConflictError} from '../../../src/cms/github.js';
import {
    CmsRepo, NothingToSaveError, branchFor, entryForBranch
} from '../../../src/cms/repo.js';
import {MediaStore} from '../../../src/cms/media.js';
import {statusOf} from '../../../src/cms/status.js';
import {createFakeGitHub} from './fake-github.js';

const CONFIG = parseConfig({
    backend: {repo: 'owner/site', branch: 'main'},
    media: {folder: 'static/images', publicPath: '/images'},
    collections: [
        {name: 'blog', folder: 'content/blog'},
        {name: 'docs', folder: 'content/docs', extension: 'mdx'},
        {name: 'settings', files: [{name: 'about', file: 'content/about.md'}]}
    ]
});

const SEED = {
    'content/blog/hello.md': '# Hello\n',
    'content/blog/second.md': '# Second\n',
    'content/blog/2026/nested.md': '# Nested\n',
    'content/blog/draft.txt': 'not markdown\n',
    'content/blog/archive.md/old.md': '# Archived\n',
    'content/docs/guide.mdx': '# Guide\n',
    'content/about.md': '# About\n',
    'README.md': 'not an entry\n'
};

function open(files = SEED) {
    const fake = createFakeGitHub({files});
    return {fake, repo: new CmsRepo({config: CONFIG, token: 't', fetch: fake.fetch})};
}

/** Bytes, for a media file. */
const bytes = text => new TextEncoder().encode(text);

describe('branch names', function() {

    it('round-trip', function() {
        expect(branchFor('blog', 'hello')).toBe('cms/blog/hello');
        return expect(entryForBranch('cms/blog/hello')).toEqual({collection: 'blog', slug: 'hello'});
    });

    it.each([
        ['feature/thing', 'another tool'],
        ['cms/blog', 'no slug'],
        ['cms/blog/a/b', 'too deep'],
        ['cms', 'the prefix alone'],
        ['cms//hello', 'an empty collection'],
        ['dependabot/npm_and_yarn/yaml-2.8.1', 'a bot, three deep like ours']
    ])('does not read %s as an entry (%s)', function(ref) {
        /* A repository is not edited only by this tool. Claiming somebody
           else's branch would put an unrelated pull request in the list
           of entries under review. */
        return expect(entryForBranch(ref)).toBe(null);
    });
});

describe('listEntries', function() {

    it('lists a folder collection', async function() {
        const {repo} = open();
        const entries = await repo.listEntries('blog');
        return expect(entries.map(e => e.slug).sort()).toEqual(['hello', 'second']);
    });

    it('leaves out files a subfolder or the wrong extension disqualifies', async function() {
        /* Nothing here is an entry of this collection: saving one would
           write to a path `entryPath` can never produce, so the edit
           would land where nobody looks. */
        const {repo} = open();
        const paths = (await repo.listEntries('blog')).map(e => e.path);
        expect(paths).not.toContain('content/blog/2026/nested.md');
        expect(paths).not.toContain('content/blog/draft.txt');
        return expect(paths).not.toContain('README.md');
    });

    it('leaves out a DIRECTORY named like an entry', async function() {
        /* `content/blog/archive.md/` is a directory, and the extension
           check cannot tell: its path ends in `.md` like every real
           entry's. Listing it would offer the user an entry that 404s on
           open and, on save, asks the API to put a blob where a tree
           is. */
        const {repo} = open();
        return expect((await repo.listEntries('blog')).map(e => e.slug).sort())
            .toEqual(['hello', 'second']);
    });

    it('honours a collection extension', async function() {
        const {repo} = open();
        return expect(await repo.listEntries('docs'))
            .toEqual([{collection: 'docs', slug: 'guide', path: 'content/docs/guide.mdx'}]);
    });

    it('lists a file collection from the config', async function() {
        const {repo} = open();
        return expect(await repo.listEntries('settings'))
            .toEqual([{collection: 'settings', slug: 'about', path: 'content/about.md'}]);
    });

    it('reads an empty collection as empty rather than failing', async function() {
        const {repo} = open({'README.md': 'x'});
        return expect(await repo.listEntries('blog')).toEqual([]);
    });

    it('refuses a collection the config does not have', async function() {
        const {repo} = open();
        return expect(repo.listEntries('absent')).rejects.toThrow('no collection named');
    });
});

describe('readEntry', function() {

    it('reads from the base branch', async function() {
        const {repo} = open();
        const entry = await repo.readEntry('blog', 'hello');
        expect(entry).toMatchObject({
            collection: 'blog', slug: 'hello', path: 'content/blog/hello.md',
            ref: 'main', content: '# Hello\n', pull: null
        });
        return expect(entry.pull).toBe(null);
    });

    it('reports the commit it read, so a save can pin it', async function() {
        const {fake, repo} = open();
        const entry = await repo.readEntry('blog', 'hello');
        return expect(entry.commit).toBe(fake.history('main')[0].sha);
    });

    it('refuses a base branch the repository does not have', async function() {
        /* The likeliest config error after a typo'd repo name -- a site
           whose default branch is `master`. Worth its own message,
           because the alternative is a 404 from a git ref endpoint the
           operator never asked for. */
        const {fake} = open();
        const repo = new CmsRepo({
            config: parseConfig({
                backend: {repo: 'owner/site', branch: 'trunk'},
                media: {folder: 'static/images', publicPath: '/images'},
                collections: [{name: 'blog', folder: 'content/blog'}]
            }),
            fetch: fake.fetch
        });
        return expect(repo.readEntry('blog', 'hello')).rejects.toThrow('"trunk" does not exist');
    });

    it('reads an entry that does not exist yet as null', async function() {
        // A new entry is an ordinary state, not a failure.
        const {repo} = open();
        return expect((await repo.readEntry('blog', 'brand-new')).content).toBe(null);
    });

    it('reads the version under review, not the base one', async function() {
        /* THE data-loss case. Reading `main` here would show the user a
           version without their own unmerged work, and the next save
           would commit that over the top -- reverting everything in the
           pull request, with no error anywhere. */
        const {repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# Hello, edited\n'});

        const entry = await repo.readEntry('blog', 'hello');
        expect(entry.ref).toBe('cms/blog/hello');
        expect(entry.content).toBe('# Hello, edited\n');
        return expect(entry.pull.number).toBe(1);
    });

    it('goes back to the base once the pull request closes', async function() {
        /* A branch whose pull request is merged or closed is behind the
           base, not ahead of it. */
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# Hello, edited\n'});
        fake.pulls()[0].state = 'closed';

        const entry = await repo.readEntry('blog', 'hello');
        expect(entry.ref).toBe('main');
        return expect(entry.content).toBe('# Hello\n');
    });
});

describe('saveEntry', function() {

    it('commits to a branch of its own and opens a pull request', async function() {
        const {fake, repo} = open();
        const result = await repo.saveEntry('blog', 'hello', {content: '# Edited\n'});

        expect(result.changed).toBe(true);
        expect(result.branch).toBe('cms/blog/hello');
        expect(fake.branches()).toEqual(['cms/blog/hello', 'main']);
        expect(fake.read('content/blog/hello.md', 'cms/blog/hello')).toBe('# Edited\n');
        expect(result.pull.head.ref).toBe('cms/blog/hello');
        return expect(result.pull.base.ref).toBe('main');
    });

    it('leaves the base branch alone', async function() {
        // The whole premise: nothing reaches the published site without
        // a pull request.
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# Edited\n'});
        expect(fake.read('content/blog/hello.md', 'main')).toBe('# Hello\n');
        return expect(fake.history('main').length).toBe(1);
    });

    it('creates an entry that did not exist', async function() {
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'brand-new', {content: '# New\n'});
        expect(fake.read('content/blog/brand-new.md', 'cms/blog/brand-new')).toBe('# New\n');
        return expect(fake.read('content/blog/brand-new.md', 'main')).toBe(null);
    });

    it('adds a commit to the same pull request on a second save', async function() {
        /* Not a second pull request, and not a replaced branch: the
           review is a conversation, and restarting it on every save
           would throw away every comment on it. */
        const {fake, repo} = open();
        const first = await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        const second = await repo.saveEntry('blog', 'hello', {content: '# Two\n'});

        expect(second.pull.number).toBe(first.pull.number);
        expect(fake.pulls().length).toBe(1);
        /* Nothing was discarded, so nothing to report. A shell showing
           `reset` tells the user a previous review of this entry has
           gone away, which on a second save of an open one is a lie. */
        expect(second.reset).toBe(false);
        expect(fake.read('content/blog/hello.md', 'cms/blog/hello')).toBe('# Two\n');
        // Seed, then one commit per save.
        return expect(fake.history('cms/blog/hello').length).toBe(3);
    });

    it('hands back a pull request that names the commit it just made', async function() {
        /* An open pull request is read before the commit, so its
           `head.sha` describes the branch as it was. A shell pinning
           that for its next save would conflict against its own work,
           which is indistinguishable from a reviewer having pushed. */
        const {repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        const second = await repo.saveEntry('blog', 'hello', {content: '# Two\n'});

        expect(second.pull.head.sha).toBe(second.commit);
        return expect((await repo.saveEntry('blog', 'hello', {
            content: '# Three\n', parent: second.pull.head.sha
        })).changed).toBe(true);
    });

    it('keeps the rest of the repository', async function() {
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# Edited\n'});
        return expect(fake.paths('cms/blog/hello')).toEqual(Object.keys(SEED).sort());
    });

    it('writes non-ASCII content unmangled', async function() {
        const {fake, repo} = open();
        const content = '# Café ☕\n\nRésumé, naïvely — 日本語。\n';
        await repo.saveEntry('blog', 'hello', {content});
        expect(fake.read('content/blog/hello.md', 'cms/blog/hello')).toBe(content);
        return expect((await repo.readEntry('blog', 'hello')).content).toBe(content);
    });

    it('uses the message for the commit and the pull request title', async function() {
        const {fake, repo} = open();
        const result = await repo.saveEntry('blog', 'hello', {
            content: '# Edited\n', message: 'Fix the opening line', body: 'It was wrong.'
        });
        expect(fake.history('cms/blog/hello')[0].message).toBe('Fix the opening line');
        expect(result.pull.title).toBe('Fix the opening line');
        return expect(result.pull.body).toBe('It was wrong.');
    });

    it('opens a draft pull request when asked', async function() {
        const {repo} = open();
        const result = await repo.saveEntry('blog', 'hello', {content: '# Edited\n', draft: true});
        return expect(result.pull.draft).toBe(true);
    });

    it('refuses to open a pull request for no change', async function() {
        /* A user who opens an entry, changes their mind and saves anyway
           should not produce an empty pull request for somebody to
           review. */
        const {fake, repo} = open();
        await expect(repo.saveEntry('blog', 'hello', {content: '# Hello\n'}))
            .rejects.toThrow(NothingToSaveError);
        expect(fake.pulls()).toEqual([]);
        return expect(fake.branches()).toEqual(['main']);
    });

    it('is a no-op, not an error, when a pull request is already open', async function() {
        // Saving twice with the same text is a UI double-submit, not a
        // mistake worth interrupting anyone over.
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        const again = await repo.saveEntry('blog', 'hello', {content: '# One\n'});

        expect(again.changed).toBe(false);
        expect(again.commit).toBe(null);
        expect(again.pull.number).toBe(1);
        return expect(fake.history('cms/blog/hello').length).toBe(2);
    });

    it('works on a file collection', async function() {
        const {fake, repo} = open();
        await repo.saveEntry('settings', 'about', {content: '# About us\n'});
        return expect(fake.read('content/about.md', 'cms/settings/about')).toBe('# About us\n');
    });

    it('refuses a slug the file collection does not name', async function() {
        const {repo} = open();
        return expect(repo.saveEntry('settings', 'nope', {content: 'x'}))
            .rejects.toThrow('has no file named');
    });

    describe('media', function() {

        it('lands with the entry in ONE commit', async function() {
            /* The property the whole staging design exists for. Two
               commits would let a reviewer see a post referencing an
               image that arrives later, and an abandoned edit would
               leave the image behind in the repository. */
            const {fake, repo} = open();
            await repo.saveEntry('blog', 'hello', {
                content: '# Edited\n\n![cat](/images/cat.png)\n',
                media: [
                    {path: 'static/images/cat.png', bytes: bytes('CAT')},
                    {path: 'static/images/dog.png', bytes: bytes('DOG')}
                ]
            });

            const history = fake.history('cms/blog/hello');
            expect(history.length).toBe(2);
            expect(fake.paths('cms/blog/hello')).toContain('static/images/cat.png');
            expect(fake.paths('cms/blog/hello')).toContain('static/images/dog.png');
            return expect(fake.read('content/blog/hello.md', 'cms/blog/hello'))
                .toContain('![cat](/images/cat.png)');
        });

        it('goes from a staged object URL to a committed file in one save', async function() {
            /* The two halves joined, which is the only place the whole
               path is visible: the uploader stages bytes against the URL
               the editor shows, `rewrite` turns that URL into the one the
               file will have, and the save commits both. An object URL
               left in the content renders fine in the editor and is a
               broken link to everybody else, with nothing failing
               anywhere along the way. */
            const {fake, repo} = open();
            const store = new MediaStore({config: CONFIG, taken: []});
            const cat = store.stage({
                token: 'blob:abc', filename: 'Cat Photo.png', bytes: bytes('CAT')
            });

            const {html, media} = store.rewrite(`<p><img src="${cat.token}"></p>`);
            await repo.saveEntry('blog', 'hello', {content: `# Edited\n\n${html}\n`, media});

            const saved = fake.read('content/blog/hello.md', 'cms/blog/hello');
            expect(saved).not.toContain('blob:');
            expect(saved).toContain('/images/cat-photo.png');
            // One commit, and the bytes really arrived with it.
            expect(fake.history('cms/blog/hello').length).toBe(2);
            return expect(fake.read('static/images/cat-photo.png', 'cms/blog/hello')).toBe('CAT');
        });

        it('preserves bytes that are not text', async function() {
            /* A PNG is not UTF-8, and an encoder that assumes it is
               produces a file that is the right length and the wrong
               image. */
            const {fake, repo} = open();
            const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]);
            await repo.saveEntry('blog', 'hello', {
                content: '# Edited\n',
                media: [{path: 'static/images/x.png', bytes: png}]
            });
            return expect([...fake.bytes('static/images/x.png', 'cms/blog/hello')]).toEqual([...png]);
        });

        it('commits media even when the entry text is unchanged', async function() {
            // Replacing an image without touching a word is a real edit.
            const {fake, repo} = open();
            const result = await repo.saveEntry('blog', 'hello', {
                content: '# Hello\n',
                media: [{path: 'static/images/cat.png', bytes: bytes('CAT')}]
            });
            expect(result.changed).toBe(true);
            return expect(fake.read('static/images/cat.png', 'cms/blog/hello')).toBe('CAT');
        });
    });

    describe('a branch left over from a closed pull request', function() {

        async function leftover() {
            const {fake, repo} = open();
            await repo.saveEntry('blog', 'hello', {content: '# Old work\n'});
            fake.pulls()[0].state = 'closed';
            fake.pushOther('main', {'content/blog/second.md': '# Moved on\n'});
            return {fake, repo};
        }

        it('is reset onto the base rather than built on', async function() {
            /* Building on it would produce a pull request whose diff
               reverts everything that happened on the base since -- here,
               it would undo the change to `second.md` that nobody
               touched. */
            const {fake, repo} = await leftover();
            const result = await repo.saveEntry('blog', 'hello', {content: '# Fresh\n'});

            expect(result.reset).toBe(true);
            expect(fake.read('content/blog/hello.md', 'cms/blog/hello')).toBe('# Fresh\n');
            return expect(fake.read('content/blog/second.md', 'cms/blog/hello')).toBe('# Moved on\n');
        });

        it('opens a new pull request', async function() {
            const {fake, repo} = await leftover();
            const result = await repo.saveEntry('blog', 'hello', {content: '# Fresh\n'});
            expect(result.pull.number).toBe(2);
            return expect(fake.pulls().length).toBe(2);
        });

        it('does not report a reset when there was no leftover branch', async function() {
            const {repo} = open();
            return expect((await repo.saveEntry('blog', 'hello', {content: '# x\n'})).reset).toBe(false);
        });
    });

    describe('a push to the entry branch while it is open', function() {

        /* A reviewer pushing a fixup while somebody has the entry open in
           an editor. The user's save was computed against the version
           they read, so it carries a tree from before the push: landing
           it would revert the reviewer with no error and nothing in the
           diff to say what happened. */
        async function reviewerPushes() {
            const {fake, repo} = open();
            await repo.saveEntry('blog', 'hello', {content: '# One\n'});
            const entry = await repo.readEntry('blog', 'hello');
            fake.pushOther('cms/blog/hello', {'content/blog/hello.md': '# Reviewer edit\n'});
            return {fake, repo, entry};
        }

        it('is refused as a ConflictError when the read is pinned', async function() {
            const {fake, repo, entry} = await reviewerPushes();

            const error = await repo.saveEntry('blog', 'hello', {
                content: '# Two\n', parent: entry.commit
            }).catch(e => e);

            expect(error).toBeInstanceOf(ConflictError);
            // Refused, not half-applied: the branch still holds their work.
            return expect(fake.read('content/blog/hello.md', 'cms/blog/hello'))
                .toBe('# Reviewer edit\n');
        });

        it('is built on rather than over when the caller did not pin', async function() {
            /* The other half of the contract, and the reason `parent` is
               a caller's choice rather than something this file works out
               for itself: a shell writing a file it has just read wants
               the push it did not see, not a conflict about it. */
            const {fake, repo} = await reviewerPushes();
            fake.pushOther('cms/blog/hello', {'docs/note.md': 'reviewer note\n'});

            await repo.saveEntry('blog', 'hello', {content: '# Two\n'});

            expect(fake.read('content/blog/hello.md', 'cms/blog/hello')).toBe('# Two\n');
            return expect(fake.read('docs/note.md', 'cms/blog/hello')).toBe('reviewer note\n');
        });

        it('reports the head the pull request is really at', async function() {
            /* `Entry.commit` is what a shell pins with, so a read taken
               after the push has to give the pushed commit -- otherwise
               every later save conflicts against a version nobody has. */
            const {fake, repo} = await reviewerPushes();
            const entry = await repo.readEntry('blog', 'hello');

            expect(entry.commit).toBe(fake.history('cms/blog/hello')[0].sha);
            return expect((await repo.saveEntry('blog', 'hello', {
                content: '# Two\n', parent: entry.commit
            })).changed).toBe(true);
        });
    });
});

describe('editorial status', function() {

    /** The `cms/*` labels on the entry's pull request, in the API's order. */
    const labelsOn = fake => fake.pulls()[0].labels.map(label => label.name);

    it('labels a new pull request as a draft', async function() {
        /* Every pull request this tool opens carries exactly one status,
           so a shell never has to render an entry whose state is
           "none". */
        const {fake, repo} = open();
        const result = await repo.saveEntry('blog', 'hello', {content: '# One\n'});

        expect(labelsOn(fake)).toEqual(['cms/draft']);
        // ...and the returned pull request says so without a re-read.
        return expect(statusOf(result.pull)).toBe('draft');
    });

    it('opens at the status the caller asked for', async function() {
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# One\n', status: 'in-review'});
        return expect(labelsOn(fake)).toEqual(['cms/in-review']);
    });

    it('is not a GitHub draft unless asked', async function() {
        /* Deliberately not tied to the `cms/draft` label. REST can set
           that flag and cannot clear it -- clearing is a GraphQL
           mutation -- so a pull request opened as a draft needs a human
           to press a button before it can ever merge. */
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        return expect(fake.pulls()[0].draft).toBe(false);
    });

    it('leaves a status a reviewer set alone on the next save', async function() {
        /* A save is not a reason to drag an entry somebody marked ready
           back to draft. */
        const {fake, repo} = open();
        const first = await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        await repo.setStatus(first.pull, 'ready');

        await repo.saveEntry('blog', 'hello', {content: '# Two\n'});
        return expect(labelsOn(fake)).toEqual(['cms/ready']);
    });

    it('moves the status when a save asks for one', async function() {
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        const second = await repo.saveEntry('blog', 'hello', {
            content: '# Two\n', status: 'in-review'
        });

        expect(labelsOn(fake)).toEqual(['cms/in-review']);
        return expect(statusOf(second.pull)).toBe('in-review');
    });

    it('keeps labels that are not ours', async function() {
        /* A repository has labels of its own, and a status change that
           swept them off would quietly undo somebody's triage. */
        const {fake, repo} = open();
        const first = await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        fake.pulls()[0].labels.push({name: 'needs-photo'});

        const moved = await repo.setStatus({...first.pull, labels: fake.pulls()[0].labels}, 'ready');
        expect(labelsOn(fake).sort()).toEqual(['cms/ready', 'needs-photo']);
        return expect(moved.labels.map(l => l.name)).toEqual(['needs-photo', 'cms/ready']);
    });

    it('adds the new label before removing the old one', async function() {
        /* Never briefly unlabelled: a board built on label queries would
           drop the card. The other way round leaves both labels for an
           instant, which `statusOf` resolves in favour of the furthest
           along. */
        const {fake, repo} = open();
        const first = await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        const before = fake.requests.length;
        await repo.setStatus(first.pull, 'ready');

        return expect(fake.requests.slice(before).map(([method]) => method))
            .toEqual(['POST', 'DELETE']);
    });

    it('asks for no removals on a pull request that has no status yet', async function() {
        // Two DELETEs that 404 on every entry ever created is not free.
        const {fake, repo} = open();
        const before = fake.requests.length;
        await repo.saveEntry('blog', 'hello', {content: '# One\n'});

        return expect(fake.requests.slice(before)
            .filter(([method]) => method === 'DELETE')).toEqual([]);
    });

    it('does nothing to a status that is already set', async function() {
        const {fake, repo} = open();
        const first = await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        const before = fake.requests.length;

        await repo.setStatus(first.pull, 'draft');
        expect(fake.requests.length).toBe(before);
        return expect(labelsOn(fake)).toEqual(['cms/draft']);
    });

    it('reports the status of everything in flight', async function() {
        const {repo} = open();
        const saved = await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        await repo.setStatus(saved.pull, 'in-review');

        const flight = await repo.listInFlight();
        return expect(flight.map(entry => statusOf(entry.pull))).toEqual(['in-review']);
    });
});

describe('listInFlight', function() {

    it('reports the entries under review', async function() {
        const {repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        await repo.saveEntry('docs', 'guide', {content: '# Two\n'});

        const flight = await repo.listInFlight();
        expect(flight.map(e => `${e.collection}/${e.slug}`).sort())
            .toEqual(['blog/hello', 'docs/guide']);
        return expect(flight.find(e => e.collection === 'docs').path)
            .toBe('content/docs/guide.mdx');
    });

    it('ignores pull requests from outside the cms namespace', async function() {
        /* A repository is not edited only by this tool, and listing
           somebody's dependency bump as an entry under review is worse
           than useless. */
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        fake.pulls().push({
            number: 99, title: 'Bump a dependency', body: '', draft: false, state: 'open',
            head: {ref: 'dependabot/npm/left-pad', sha: 'x'}, base: {ref: 'main'},
            labels: [], html_url: '', updated_at: ''
        });
        return expect((await repo.listInFlight()).map(e => e.slug)).toEqual(['hello']);
    });

    it('ignores a collection this config no longer has', async function() {
        // Reporting an entry nobody can open is a dead end in the UI.
        const {fake, repo} = open();
        await repo.saveEntry('blog', 'hello', {content: '# One\n'});
        fake.pulls().push({
            number: 98, title: 'x', body: '', draft: false, state: 'open',
            head: {ref: 'cms/recipes/soup', sha: 'x'}, base: {ref: 'main'},
            labels: [], html_url: '', updated_at: ''
        });
        return expect((await repo.listInFlight()).map(e => e.slug)).toEqual(['hello']);
    });

    it('is empty when nothing is in flight', async function() {
        const {repo} = open();
        return expect(await repo.listInFlight()).toEqual([]);
    });
});
