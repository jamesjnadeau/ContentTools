import {mergeEntries} from '../../../src/shell/merge.js';

/* Joining the published listing to the open pull requests.
 *
 * A pure function over two arrays, and every case below is one that shows
 * as a plausible-looking list rather than as an error: the same entry
 * twice, a draft nobody can find, another collection's work appearing in
 * this one, or a badge that says the wrong thing because more than one
 * label is on the pull request.
 */

function summary(collection, slug) {
    return {collection, slug, path: `content/${collection}/${slug}.md`};
}

function pull(number, ref, labels = ['cms/draft']) {
    return {
        number,
        title: ref,
        body: '',
        draft: false,
        state: 'open',
        head: {ref, sha: `sha${number}`},
        base: {ref: 'main'},
        labels: labels.map(name => ({name})),
        html_url: `https://github.com/owner/site/pull/${number}`,
        updated_at: '2026-01-01T00:00:00Z'
    };
}

function inFlight(collection, slug, labels) {
    return {...summary(collection, slug), pull: pull(1, `cms/${collection}/${slug}`, labels)};
}

const slugs = entries => entries.map(entry => entry.slug);

describe('mergeEntries', function() {

    it('lists the published entries when nothing is in review', function() {
        const merged = mergeEntries('blog',
            [summary('blog', 'a'), summary('blog', 'b')], []);
        expect(slugs(merged)).toEqual(['a', 'b']);
        expect(merged.every(entry => entry.pull === null)).toBe(true);
        expect(merged.every(entry => entry.status === null)).toBe(true);
        expect(merged.every(entry => entry.unpublished === false)).toBe(true);
    });

    it('shows an entry that is BOTH published and in review exactly once',
       function() {
        /* The failure the whole function exists for. Two rows with the
           same name read as two different pages, and one of them is a
           stale copy somebody will open and edit. */
        const merged = mergeEntries('blog',
            [summary('blog', 'a'), summary('blog', 'b')],
            [inFlight('blog', 'a', ['cms/in-review'])]);

        expect(slugs(merged)).toEqual(['a', 'b']);
        expect(merged[0].pull.number).toBe(1);
        expect(merged[0].status).toBe('in-review');
        // It IS on the published site; the pull request is an edit to it.
        expect(merged[0].unpublished).toBe(false);
    });

    it('includes an entry that exists ONLY inside a pull request', function() {
        // Otherwise a draft somebody created is invisible in the very
        // list they would go to to find it again -- and the only way back
        // to it is the pull request on GitHub.
        const merged = mergeEntries('blog',
            [summary('blog', 'b')], [inFlight('blog', 'new')]);
        expect(slugs(merged)).toEqual(['new', 'b']);
        expect(merged[0].unpublished).toBe(true);
    });

    it('puts everything with a pull request first, keeping each order',
       function() {
        /* Work in progress is what the author came back for. The
           published order underneath is left alone, because for a file
           collection it is the order the operator wrote in their config
           and alphabetising it would silently discard a choice they
           made. */
        const merged = mergeEntries('blog',
            [summary('blog', 'zebra'), summary('blog', 'apple'),
             summary('blog', 'mango')],
            [inFlight('blog', 'mango')]);
        expect(slugs(merged)).toEqual(['mango', 'zebra', 'apple']);
    });

    it('ignores pull requests belonging to another collection', function() {
        /* `listInFlight` is repo-wide. Filtering it is done here rather
           than left to the caller, because a forgotten filter puts the
           `pages` collection's drafts in the `blog` list, where they look
           like blog entries nobody recognises. */
        const merged = mergeEntries('blog',
            [summary('blog', 'a')], [inFlight('pages', 'about')]);
        expect(slugs(merged)).toEqual(['a']);
        expect(merged[0].pull).toBe(null);
    });

    it('does not let another collection\'s pull request claim a same-named entry',
       function() {
        // `blog/post` and `pages/post` are different files. Keying the
        // join on the slug alone would badge one with the other's review.
        const merged = mergeEntries('blog',
            [summary('blog', 'post')], [inFlight('pages', 'post')]);
        expect(merged[0].pull).toBe(null);
        expect(merged[0].status).toBe(null);
    });

    it('reads the furthest-along label when a pull request carries several',
       function() {
        // A status change that added the new label and failed before
        // removing the old one, or somebody labelling by hand. Taking the
        // first would move a card backwards on the strength of a label
        // nobody meant to leave.
        const merged = mergeEntries('blog', [],
            [inFlight('blog', 'a', ['cms/draft', 'cms/ready'])]);
        expect(merged[0].status).toBe('ready');
    });

    it('reports no status for a pull request that carries none', function() {
        // A pull request somebody opened by hand on a cms/ branch, or one
        // whose labels were stripped. It is still open work, so it still
        // belongs in the list -- the view says "open" rather than
        // pretending to know how far along it is.
        const merged = mergeEntries('blog', [], [inFlight('blog', 'a', [])]);
        expect(merged[0].pull).not.toBe(null);
        expect(merged[0].status).toBe(null);
    });

    it('carries the path through, so a caller need not rebuild it', function() {
        const merged = mergeEntries('blog', [summary('blog', 'a')], []);
        expect(merged[0].path).toBe('content/blog/a.md');
    });

    it('is empty for a collection with nothing in it', function() {
        expect(mergeEntries('blog', [], [])).toEqual([]);
    });
});
