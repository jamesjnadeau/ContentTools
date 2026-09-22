/* Both directions of one mapping: where an entry is published, and which
   entry a page is showing.

   They are tested together because they are written together, and for the
   same reason. Two functions mapping between the same two things disagree
   at the edges -- a trailing slash, a base prefix, an `index.html` -- and
   the way that presents is an author standing on their own post being
   told it is not an entry. So most of what follows is round trips: build
   a URL, then hand it back and get the entry out again. */

import {
    pagePath, previewOrigin, editUrl, editUrlIsStale, entryForUrl,
    declaredEntry, bodySelector
} from '../../../src/cms/preview.js';
import {parseConfig, findCollection} from '../../../src/cms/config.js';

function config(overrides = {}) {
    return parseConfig({
        backend: {repo: 'owner/site'},
        media: {folder: 'static/images', publicPath: '/images'},
        site: {base: '/prefix',
               preview: 'https://deploy-preview-{{pr}}--site.netlify.app'},
        collections: [
            {name: 'blog', folder: 'content/blog',
             page: '/blog/{{slug}}/', body: 'main'},
            {name: 'notes', folder: 'content/notes'},
            {name: 'pages', body: '#content', files: [
                {name: 'about', file: 'src/about.md', page: '/about/'},
                {name: 'data', file: 'src/data.md'}
            ]}
        ],
        ...overrides
    });
}

const blog = c => findCollection(c, 'blog');

/** A detached document, so nothing here depends on the page running it. */
function page(html) {
    return new DOMParser().parseFromString(
        `<!doctype html><html><head></head><body>${html}</body></html>`,
        'text/html');
}

describe('pagePath', function() {

    it('expands the slug and carries the base', function() {
        const c = config();
        return expect(pagePath(c, blog(c), 'hello')).toBe('/prefix/blog/hello/');
    });

    it('does not make a bare slash out of an absent base', function() {
        /* `${base}${page}` with `base` normalised to `/` would give
           `//blog/hello/`, which a browser reads as a protocol-relative
           URL to a host called `blog` -- an author sent off the site
           entirely, from a config that says nothing about hosts. */
        const c = config({site: {}});
        return expect(pagePath(c, blog(c), 'hello')).toBe('/blog/hello/');
    });

    it('is null for a collection that is not pages', function() {
        const c = config();
        return expect(pagePath(c, findCollection(c, 'notes'), 'x')).toBe(null);
    });

    it('reads a file collection\'s page off the file, not the collection', function() {
        const c = config();
        const pages = findCollection(c, 'pages');
        expect(pagePath(c, pages, 'about')).toBe('/prefix/about/');
        return expect(pagePath(c, pages, 'data')).toBe(null);
    });
});

describe('previewOrigin', function() {

    it('substitutes the pull request number', function() {
        return expect(previewOrigin(config(), 12))
            .toBe('https://deploy-preview-12--site.netlify.app');
    });

    it('is null when the deployment builds no previews', function() {
        return expect(previewOrigin(config({site: {base: '/prefix'}}), 12)).toBe(null);
    });
});

describe('editUrl', function() {

    it('is the live page when nothing is in flight', function() {
        const c = config();
        return expect(editUrl(c, blog(c), 'hello', null)).toBe('/prefix/blog/hello/');
    });

    it('is the pull request\'s preview when there is one', function() {
        /* Not a preference. The live site is built from the base
           branch, so it shows the PUBLISHED text and knows nothing
           about the branch the editor commits to -- an author sent
           there would edit the old version and their pull request would
           come back carrying the reviewer's changes reverted. */
        const c = config();
        return expect(editUrl(c, blog(c), 'hello', 12))
            .toBe('https://deploy-preview-12--site.netlify.app/prefix/blog/hello/');
    });

    it('falls back to the live page when there is no preview template', function() {
        const c = config({site: {base: '/prefix'}});
        expect(editUrl(c, blog(c), 'hello', 12)).toBe('/prefix/blog/hello/');
        return expect(editUrlIsStale(c, 12)).toBe(true);
    });

    it('is not stale for an entry with nothing in flight', function() {
        return expect(editUrlIsStale(config({site: {base: '/prefix'}}), null)).toBe(false);
    });

    it('is not stale when a preview is configured', function() {
        return expect(editUrlIsStale(config(), 12)).toBe(false);
    });

    it('is null for a collection that is not pages', function() {
        const c = config();
        return expect(editUrl(c, findCollection(c, 'notes'), 'x', 12)).toBe(null);
    });
});

describe('entryForUrl', function() {

    it('round-trips what pagePath built', function() {
        const c = config();
        const url = `https://site.example${pagePath(c, blog(c), 'hello')}`;
        return expect(entryForUrl(c, url)).toEqual({collection: 'blog', slug: 'hello'});
    });

    it('matches a page served WITHOUT the base prefix', function() {
        /* One build, two prefixes: this very site answers at `/` on
           Netlify and at `/ContentTools-test/` on Pages and, through a
           rewrite, on Netlify too. A page reached by either spelling is
           the same entry. */
        return expect(entryForUrl(config(), 'https://site.example/blog/hello/'))
            .toEqual({collection: 'blog', slug: 'hello'});
    });

    it('matches with no trailing slash', function() {
        return expect(entryForUrl(config(), '/prefix/blog/hello'))
            .toEqual({collection: 'blog', slug: 'hello'});
    });

    it('matches the index.html a static host serves it from', function() {
        return expect(entryForUrl(config(), '/prefix/blog/hello/index.html'))
            .toEqual({collection: 'blog', slug: 'hello'});
    });

    it('percent-decodes the slug', function() {
        return expect(entryForUrl(config(), '/prefix/blog/hello%20there/'))
            .toEqual({collection: 'blog', slug: 'hello there'});
    });

    it('answers null rather than throwing on a malformed escape', function() {
        /* This runs on every page of a public site, from a script
           nobody asked for. A pasted URL with a bad escape has to be an
           ordinary "not an entry", not a stack trace in a visitor's
           console. */
        return expect(entryForUrl(config(), '/prefix/blog/%zz/')).toBe(null);
    });

    it('does not match a slug with a slash in it', function() {
        /* A slug is one path segment, which is what `slugFromPath`
           already refuses a repository path with a subfolder for. The
           two have to agree, or a page would map to an entry the
           listing will never show. */
        return expect(entryForUrl(config(), '/prefix/blog/2026/hello/')).toBe(null);
    });

    it('does not match an empty slug', function() {
        return expect(entryForUrl(config(), '/prefix/blog/')).toBe(null);
    });

    it('does not match the site root', function() {
        return expect(entryForUrl(config(), '/prefix/')).toBe(null);
    });

    it('skips a collection that is not pages', function() {
        return expect(entryForUrl(config(), '/prefix/content/notes/x/')).toBe(null);
    });

    it('matches a file collection by its literal page', function() {
        return expect(entryForUrl(config(), '/prefix/about/'))
            .toEqual({collection: 'pages', slug: 'about'});
    });

    it('takes the template\'s own dots literally', function() {
        /* The template is escaped into the pattern rather than dropped
           into it: an unescaped `.` matches any character, so a site
           publishing at `/blog/{{slug}}.html` would map `/blog/axhtml`
           to the entry `a` and edit the wrong file. */
        const c = config({collections: [
            {name: 'blog', folder: 'content/blog',
             page: '/blog/{{slug}}.html', body: 'main'}
        ]});
        expect(entryForUrl(c, '/prefix/blog/hello.html'))
            .toEqual({collection: 'blog', slug: 'hello'});
        return expect(entryForUrl(c, '/prefix/blog/helloxhtml')).toBe(null);
    });

    it('refuses a template naming {{slug}} twice with two values', function() {
        const c = config({collections: [
            {name: 'blog', folder: 'content/blog',
             page: '/{{slug}}/{{slug}}/', body: 'main'}
        ]});
        expect(entryForUrl(c, '/prefix/hello/hello/'))
            .toEqual({collection: 'blog', slug: 'hello'});
        return expect(entryForUrl(c, '/prefix/hello/there/')).toBe(null);
    });

    it('reads a config written {{ slug }} the same as {{slug}}', function() {
        const c = config({collections: [
            {name: 'blog', folder: 'content/blog',
             page: '/blog/{{ slug }}/', body: 'main'}
        ]});
        return expect(entryForUrl(c, '/prefix/blog/hello/'))
            .toEqual({collection: 'blog', slug: 'hello'});
    });
});

describe('declaredEntry', function() {

    it('reads the entry a page names in its own markup', function() {
        return expect(declaredEntry(
            config(), page('<meta name="cms:entry" content="blog/hello">')))
            .toEqual({collection: 'blog', slug: 'hello'});
    });

    it('is null when the page says nothing', function() {
        return expect(declaredEntry(config(), page(''))).toBe(null);
    });

    it('is null for a collection the config does not have', function() {
        /* A `<meta>` naming a collection nobody configured is a typo in
           a template. Mapping it to nothing is what makes that visible;
           trusting it would produce a 404 from the repository instead,
           which reads as "that entry is gone". */
        return expect(declaredEntry(
            config(), page('<meta name="cms:entry" content="nope/hello">'))).toBe(null);
    });

    it('is null for a value with no slug', function() {
        return expect(declaredEntry(
            config(), page('<meta name="cms:entry" content="blog">'))).toBe(null);
    });

    it('is null for a value with no collection', function() {
        return expect(declaredEntry(
            config(), page('<meta name="cms:entry" content="/hello">'))).toBe(null);
    });

    it('is null for a slug carrying a slash', function() {
        return expect(declaredEntry(
            config(), page('<meta name="cms:entry" content="blog/a/b">'))).toBe(null);
    });

    it('ignores surrounding whitespace, which a template will add', function() {
        return expect(declaredEntry(
            config(), page('<meta name="cms:entry" content=" blog/hello ">')))
            .toEqual({collection: 'blog', slug: 'hello'});
    });

    it('is null for an empty content attribute', function() {
        return expect(declaredEntry(
            config(), page('<meta name="cms:entry" content="">'))).toBe(null);
    });
});

describe('bodySelector', function() {

    it('is the collection\'s when the page marks nothing', function() {
        const c = config();
        return expect(bodySelector(blog(c), page('<main></main>'))).toBe('main');
    });

    it('is the markup\'s when the page marks something', function() {
        const c = config();
        return expect(bodySelector(blog(c), page('<div data-cms-body></div>')))
            .toBe('[data-cms-body]');
    });

    it('lets a page with no config selector mark its own', function() {
        const c = config();
        return expect(bodySelector(
            findCollection(c, 'notes'), page('<div data-cms-body></div>')))
            .toBe('[data-cms-body]');
    });

    it('is null when neither says', function() {
        const c = config();
        return expect(bodySelector(findCollection(c, 'notes'), page(''))).toBe(null);
    });
});
