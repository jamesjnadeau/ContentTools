/* The runtime config: what a site operator writes, and what happens when
   they get it wrong.

   The second half is the point of the whole module. A hand-edited YAML
   file is the single most likely failure anyone will hit with this tool,
   and the difference between a good and a bad config layer is not whether
   it accepts a correct file -- it is whether an incorrect one says which
   line is wrong. So every validation rule below asserts on the reported
   PATH, not merely that something threw. */

import {
    parseConfig, loadConfig, ConfigError, findCollection,
    entryPath, slugFromPath, mediaPath, mediaURL
} from '../../../src/cms/config.js';

/** The smallest config that parses, as a fresh object each time. */
function minimal(overrides = {}) {
    return {
        backend: {repo: 'owner/site'},
        media: {folder: 'static/images', publicPath: '/images'},
        collections: [{name: 'blog', folder: 'content/blog'}],
        ...overrides
    };
}

/** Parse and return the ConfigError, or fail if it parsed. */
function errorFrom(input) {
    try {
        parseConfig(input);
    } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        return error;
    }
    throw new Error('expected parseConfig to throw, but it did not');
}

describe('parseConfig', function() {

    it('fills in every optional field', function() {
        const config = parseConfig(minimal());

        expect(config.backend.branch).toBe('main');
        expect(config.backend.apiBase).toBe('https://api.github.com');

        const [blog] = config.collections;
        expect(blog.kind).toBe('folder');
        /* `label` defaulting to `name` is what lets a config file stay
           short; a shell that renders `label` must never see undefined. */
        expect(blog.label).toBe('blog');
        expect(blog.create).toBe(false);
        expect(blog.extension).toBe('md');
        expect(blog.slug).toBe('{{slug}}');
        return expect(blog.fields).toEqual([]);
    });

    it('keeps what was given', function() {
        const config = parseConfig(minimal({
            backend: {repo: 'owner/site', branch: 'trunk', apiBase: 'https://ghe.example.com/api/v3'},
            collections: [{
                name: 'blog',
                label: 'Blog posts',
                folder: 'content/blog',
                create: true,
                extension: 'mdx',
                slug: '{{year}}-{{slug}}'
            }]
        }));

        expect(config.backend.branch).toBe('trunk');
        expect(config.backend.apiBase).toBe('https://ghe.example.com/api/v3');
        const [blog] = config.collections;
        expect(blog.label).toBe('Blog posts');
        expect(blog.create).toBe(true);
        expect(blog.extension).toBe('mdx');
        return expect(blog.slug).toBe('{{year}}-{{slug}}');
    });

    it('returns data that is frozen all the way down', function() {
        /* The config is read by the client, the repo and the media store,
           on every call. One of them mutating it would change the others'
           behaviour with nothing to point at.

           Walked rather than spot-checked, so that a newly added branch of
           the tree cannot arrive unfrozen. */
        const config = parseConfig(minimal({
            collections: [
                {name: 'blog', folder: 'content/blog', fields: [{name: 'title'}]},
                {name: 'settings', files: [{name: 'about', file: 'about.md', fields: [{name: 'body'}]}]}
            ]
        }));

        const thawed = [];
        const walk = (value, path) => {
            if (value === null || typeof value !== 'object') {
                return;
            }
            if (!Object.isFrozen(value)) {
                thawed.push(path);
            }
            for (const [key, child] of Object.entries(value)) {
                walk(child, `${path}.${key}`);
            }
        };
        walk(config, 'config');

        return expect(thawed).toEqual([]);
    });

    describe('normalising', function() {

        it('trims slashes off repository paths', function() {
            const config = parseConfig(minimal({
                media: {folder: '/static/images/', publicPath: '/images'},
                collections: [{name: 'blog', folder: '/content/blog/'}]
            }));
            expect(config.media.folder).toBe('static/images');
            return expect(config.collections[0].folder).toBe('content/blog');
        });

        it('keeps a leading slash on the public path', function() {
            /* Not cosmetic: `/images/x.png` and `images/x.png` resolve
               differently in a document, so normalising it would change
               what the published markdown says. */
            const config = parseConfig(minimal({
                media: {folder: 'static/images', publicPath: '/images/'}
            }));
            return expect(config.media.publicPath).toBe('/images');
        });

        it('accepts an extension written with its dot', function() {
            const config = parseConfig(minimal({
                collections: [{name: 'blog', folder: 'content/blog', extension: '.md'}]
            }));
            return expect(config.collections[0].extension).toBe('md');
        });

        it('trims a trailing slash off the API base', function() {
            const config = parseConfig(minimal({
                backend: {repo: 'owner/site', apiBase: 'https://ghe.example.com/api/v3/'}
            }));
            return expect(config.backend.apiBase).toBe('https://ghe.example.com/api/v3');
        });
    });

    describe('reporting where a config is wrong', function() {

        it('names a missing repo', function() {
            const error = errorFrom(minimal({backend: {}}));
            expect(error.path).toBe('backend.repo');
            return expect(error.message).toContain('backend.repo');
        });

        it.each([
            ['site', 'a bare name'],
            ['owner/site/extra', 'an extra segment'],
            ['owner /site', 'a space']
        ])('rejects %s as a repo (%s)', function(repo) {
            /* Checked here rather than left to produce a 404, which reads
               as "no such repository" and sends the operator looking at
               GitHub permissions instead of at their own config. */
            const error = errorFrom(minimal({backend: {repo}}));
            return expect(error.path).toBe('backend.repo');
        });

        it('names a collection by index', function() {
            const error = errorFrom(minimal({
                collections: [
                    {name: 'blog', folder: 'content/blog'},
                    {name: 'pages', folder: 'content/pages'},
                    {folder: 'content/docs'}
                ]
            }));
            return expect(error.path).toBe('collections[2].name');
        });

        it('names a field inside a collection', function() {
            const error = errorFrom(minimal({
                collections: [{
                    name: 'blog',
                    folder: 'content/blog',
                    fields: [{name: 'title'}, {label: 'Date'}]
                }]
            }));
            return expect(error.path).toBe('collections[0].fields[1].name');
        });

        it('names a file inside a file collection', function() {
            const error = errorFrom(minimal({
                collections: [{name: 'settings', files: [{name: 'about'}]}]
            }));
            return expect(error.path).toBe('collections[0].files[0].file');
        });

        it('rejects a collection that is both kinds', function() {
            /* Ambiguous rather than redundant: there is no way to guess
               which the author meant, and guessing silently ignores half
               of what they wrote. */
            const error = errorFrom(minimal({
                collections: [{name: 'blog', folder: 'content/blog', files: [{name: 'a', file: 'a.md'}]}]
            }));
            expect(error.path).toBe('collections[0]');
            return expect(error.message).toContain('one or the other');
        });

        it('rejects a collection that is neither kind', function() {
            const error = errorFrom(minimal({collections: [{name: 'blog'}]}));
            return expect(error.path).toBe('collections[0]');
        });

        it('rejects an empty files list', function() {
            const error = errorFrom(minimal({
                collections: [{name: 'settings', files: []}]
            }));
            return expect(error.path).toBe('collections[0].files');
        });

        it('rejects duplicate collection names', function() {
            /* `findCollection` returns the first match, so a duplicate
               makes the second collection unreachable -- it would simply
               never appear, with no error. */
            const error = errorFrom(minimal({
                collections: [
                    {name: 'blog', folder: 'content/blog'},
                    {name: 'blog', folder: 'content/posts'}
                ]
            }));
            expect(error.path).toBe('collections');
            return expect(error.message).toContain('duplicate');
        });

        it('rejects an empty collections list', function() {
            return expect(errorFrom(minimal({collections: []})).path).toBe('collections');
        });

        it.each([
            ['backend', {backend: 'owner/site'}],
            ['media', {media: 'static/images'}]
        ])('rejects %s when it is not an object', function(path, override) {
            return expect(errorFrom(minimal(override)).path).toBe(path);
        });

        it('rejects collections when it is not an array', function() {
            return expect(errorFrom(minimal({collections: {blog: {}}})).path).toBe('collections');
        });

        it('rejects a collection that is not an object', function() {
            return expect(errorFrom(minimal({collections: ['blog']})).path).toBe('collections[0]');
        });

        it('rejects an array where an object belongs', function() {
            /* A mis-indented YAML list -- `backend:` followed by `- repo:`
               -- parses as an array, and an array IS an object. Without
               the check the failure surfaces one level deeper as
               "backend.repo: expected a non-empty string", which sends
               the reader to the line after the one that is wrong. */
            const error = errorFrom(minimal({backend: [{repo: 'owner/site'}]}));
            expect(error.path).toBe('backend');
            return expect(error.message).toContain('expected an object');
        });

        it('treats an empty YAML key as absent', function() {
            /* `branch:` with nothing after it parses as null, not as a
               missing key -- so a config file that merely LOOKS incomplete
               must default rather than throw. */
            const config = parseConfig(minimal({
                backend: {repo: 'owner/site', branch: null, apiBase: null},
                collections: [{name: 'blog', folder: 'content/blog', create: null, fields: null}]
            }));
            expect(config.backend.branch).toBe('main');
            expect(config.collections[0].create).toBe(false);
            return expect(config.collections[0].fields).toEqual([]);
        });

        it('rejects a present-but-wrong optional field', function() {
            /* Absent means "use the default"; present and of the wrong
               type means the author tried to say something and it did not
               land. Defaulting over it would hide that. */
            const error = errorFrom(minimal({
                collections: [{name: 'blog', folder: 'content/blog', create: 'yes'}]
            }));
            return expect(error.path).toBe('collections[0].create');
        });

        it('rejects an empty string as though it were absent', function() {
            return expect(errorFrom(minimal({
                media: {folder: '   ', publicPath: '/images'}
            })).path).toBe('media.folder');
        });
    });
});

describe('loadConfig', function() {

    /** A fetch that serves one body. */
    function serving(body, init = {}) {
        return () => Promise.resolve(new Response(body, {status: 200, ...init}));
    }

    const YAML_SOURCE = [
        'backend:',
        '  repo: owner/site',
        '  branch: trunk',
        'media:',
        '  folder: static/images',
        '  publicPath: /images',
        'collections:',
        '  - name: blog',
        '    folder: content/blog',
        '    create: true'
    ].join('\n');

    const JSON_SOURCE = JSON.stringify({
        backend: {repo: 'owner/site', branch: 'trunk'},
        media: {folder: 'static/images', publicPath: '/images'},
        collections: [{name: 'blog', folder: 'content/blog', create: true}]
    });

    it('reads a YAML config', async function() {
        const config = await loadConfig('/cms.config.yml', {fetch: serving(YAML_SOURCE)});
        expect(config.backend.branch).toBe('trunk');
        return expect(config.collections[0].create).toBe(true);
    });

    it('reads a JSON config', async function() {
        const config = await loadConfig('/cms.config.json', {fetch: serving(JSON_SOURCE)});
        return expect(config.backend.branch).toBe('trunk');
    });

    it('reads the two identically', async function() {
        /* The same config in both formats is the assertion that keeps the
           two branches honest with each other. */
        const fromYAML = await loadConfig('/a.yml', {fetch: serving(YAML_SOURCE)});
        const fromJSON = await loadConfig('/a.json', {fetch: serving(JSON_SOURCE)});
        return expect(fromYAML).toEqual(fromJSON);
    });

    it('reports a failed fetch', async function() {
        const fetch = serving('not found', {status: 404, statusText: 'Not Found'});
        const error = await loadConfig('/missing.yml', {fetch}).catch(e => e);
        expect(error).toBeInstanceOf(ConfigError);
        expect(error.path).toBe('');
        /* An error with no path must not be prefixed by an empty one: a
           message beginning ": could not load" is the sort of detail that
           makes a tool feel broken before it has done anything wrong. */
        expect(error.message.startsWith('could not load /missing.yml')).toBe(true);
        return expect(error.message).toContain('404');
    });

    it('reports a file that is neither JSON nor YAML', async function() {
        const fetch = serving('backend: [unclosed\n  repo: x');
        return expect(loadConfig('/bad.yml', {fetch})).rejects.toThrow(ConfigError);
    });

    it('validates what it parsed', async function() {
        // Well-formed YAML, wrong shape: the path still has to come through.
        const fetch = serving('backend:\n  repo: nope\nmedia:\n  folder: a\n  publicPath: /a\ncollections: []');
        return expect(loadConfig('/bad.yml', {fetch})).rejects.toThrow('backend.repo');
    });
});

describe('paths', function() {

    const config = parseConfig(minimal({
        collections: [
            {name: 'blog', folder: 'content/blog'},
            {name: 'docs', folder: 'content/docs', extension: 'mdx'},
            {name: 'settings', files: [{name: 'about', file: 'content/about.md'}]}
        ]
    }));
    const blog = findCollection(config, 'blog');
    const docs = findCollection(config, 'docs');
    const settings = findCollection(config, 'settings');

    it('finds a collection by name', function() {
        expect(blog.name).toBe('blog');
        return expect(findCollection(config, 'absent')).toBe(null);
    });

    it('builds an entry path', function() {
        expect(entryPath(blog, 'hello')).toBe('content/blog/hello.md');
        return expect(entryPath(docs, 'hello')).toBe('content/docs/hello.mdx');
    });

    it('builds a file collection path from its name', function() {
        return expect(entryPath(settings, 'about')).toBe('content/about.md');
    });

    it('rejects an unknown file collection entry', function() {
        return expect(() => entryPath(settings, 'nope')).toThrow(ConfigError);
    });

    it('reads a slug back off a path', function() {
        expect(slugFromPath(blog, 'content/blog/hello.md')).toBe('hello');
        return expect(slugFromPath(settings, 'content/about.md')).toBe('about');
    });

    it('round-trips every slug', function() {
        for (const slug of ['hello', '2026-01-01-a-post', 'a.b']) {
            expect(slugFromPath(blog, entryPath(blog, slug))).toBe(slug);
        }
        return expect(slugFromPath(docs, entryPath(docs, 'x'))).toBe('x');
    });

    it.each([
        ['content/blog/draft.txt', 'the wrong extension'],
        ['content/pages/hello.md', 'another collection'],
        ['content/blog/.md', 'no name at all'],
        ['content/blog/2026/hello.md', 'a subfolder']
    ])('does not read %s as a slug (%s)', function(path) {
        /* The subfolder case is the one that matters: without it the shell
           lists the file and saving it writes to `content/blog/2026%2Fhello.md`
           -- a path `entryPath` can never produce, so the edit lands
           somewhere nobody looks. */
        return expect(slugFromPath(blog, path)).toBe(null);
    });

    it('locates media in the repository and in the document', function() {
        expect(mediaPath(config, 'cat.png')).toBe('static/images/cat.png');
        return expect(mediaURL(config, 'cat.png')).toBe('/images/cat.png');
    });
});
