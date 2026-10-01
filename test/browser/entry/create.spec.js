import {parseConfig, fieldsFor} from '../../../src/cms/config.js';
import {blankDocument, previewPath, refuseCreate} from '../../../src/entry/create.js';

/* How a new entry is named and what it starts as. This module is shared by
   /admin and by the site's own page, so what is pinned here is what both
   surfaces will do. */

/** A config with one collection, whose extra keys are `extra`. */
function collectionWith(extra = {}) {
    const config = parseConfig({
        backend: {repo: 'owner/site'},
        media: {folder: 'static/images', publicPath: '/images'},
        collections: [{name: 'blog', label: 'Blog', folder: 'content/blog', ...extra}]
    });
    return config.collections[0];
}

/** The parsed fields of a collection declaring `fields`. */
function parsed(fields) {
    const collection = collectionWith({fields});
    return fieldsFor(collection, 'x');
}

describe('blankDocument', function() {
    const fields = [{name: 'title', widget: 'string'}, {name: 'draft', widget: 'boolean', default: true}];

    it('is empty when no field has a default and no title is given', function() {
        expect(blankDocument(parsed([{name: 'title', widget: 'string'}])).source()).toBe('');
    });
    it('carries the defaults', function() {
        expect(blankDocument(parsed(fields)).frontmatter().data).toEqual({draft: true});
    });
    it('seeds the title with the name that was typed', function() {
        expect(blankDocument(parsed(fields), '  My first post ').frontmatter().data)
            .toEqual({title: 'My first post', draft: true});
    });
    it('writes the title before the other defaults', function() {
        expect(blankDocument(parsed(fields), 'Hello').source())
            .toMatch(/^---\ntitle: Hello\ndraft: true\n---/);
    });
    it('is a title and nothing else when that is all there is to write', function() {
        const doc = blankDocument(parsed([{name: 'title', widget: 'string'}]), 'Hello');
        expect(doc.frontmatter().data).toEqual({title: 'Hello'});
    });
    it('writes no front matter for a name that is only spaces', function() {
        expect(blankDocument(parsed([{name: 'title', widget: 'string'}]), '   ').source()).toBe('');
    });
    it('leaves a title field with its own default alone', function() {
        const doc = blankDocument(parsed([{name: 'title', widget: 'string', default: 'Untitled'}]), 'Mine');
        expect(doc.frontmatter().data).toEqual({title: 'Untitled'});
    });
    it('does not invent a title for a collection without that field', function() {
        const doc = blankDocument(parsed([{name: 'date', widget: 'datetime'}]), 'Mine');
        expect(doc.source()).toBe('');
    });
    it('does not seed a title field that is not a string', function() {
        const doc = blankDocument(parsed([{name: 'title', widget: 'list'}]), 'Mine');
        expect(doc.source()).toBe('');
    });
    it('has an empty body either way', function() {
        expect(blankDocument(parsed(fields), 'x').toHTML()).toBe('');
        expect(blankDocument(parsed(fields)).toHTML()).toBe('');
    });
});

describe('previewPath and refuseCreate', function() {
    it('previewPath names the file a typed name would get', function() {
        const collection = collectionWith({create: true});
        expect(previewPath(collection, 'My First Post', new Date(2026, 0, 2)))
            .toBe('content/blog/my-first-post.md');
    });
    it('previewPath has no path for a name with nothing a filename can use', function() {
        const collection = collectionWith({create: true});
        expect(previewPath(collection, '日本語', new Date())).toBeNull();
        expect(previewPath(collection, '!!!', new Date())).toBeNull();
        expect(previewPath(collection, '   ', new Date())).toBeNull();
    });
    it('refuseCreate allows a folder collection that turned create on', function() {
        expect(refuseCreate(collectionWith({create: true}))).toBeNull();
    });
    it('refuseCreate says why a folder collection without create is refused', function() {
        expect(refuseCreate(collectionWith())).toMatch(/Blog does not allow new entries\./);
    });
    it('refuseCreate refuses a file collection', function() {
        const config = parseConfig({
            backend: {repo: 'owner/site'},
            media: {folder: 'static/images', publicPath: '/images'},
            collections: [{
                name: 'pages', label: 'Pages',
                files: [{name: 'about', label: 'About', file: 'content/about.md'}]
            }]
        });
        expect(refuseCreate(config.collections[0])).toBe(
            'Pages is a fixed set of pages, so entries cannot be added to it.');
    });
});
