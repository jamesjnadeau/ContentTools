import {buildReview} from '../../../src/shell/views/review.js';
import {parseConfig} from '../../../src/cms/config.js';

/* The review list, driven directly.
 *
 * `review.spec.js` drives the whole shell, so it can only reach the states
 * a shell can be PUT into -- and three of the things this view has to get
 * right are not among them:
 *
 *   - a pull request naming a collection the config does not have.
 *     `listInFlight` skips those, so the shell can never hand one over;
 *     the view is what decides that a row missing its label still says a
 *     true thing rather than `undefined`.
 *   - a handler rebound when `list()` hands a KEPT row a different entry.
 *     The shell clears the list on every navigation, so the only way to
 *     reach it is to render twice into the same view.
 *   - a pull request carrying no status label at all, offering all three
 *     moves rather than treating one of them as where it already is.
 */

const CONFIG = parseConfig({
    backend: {repo: 'owner/site'},
    media: {folder: 'static/images', publicPath: '/images'},
    collections: [
        {name: 'blog', label: 'Blog', folder: 'content/blog'},
        {
            name: 'pages',
            label: 'Pages',
            files: [{name: 'about', label: 'About', file: 'content/about.md'}]
        }
    ]
});

function entry(number, collection, slug, labels = []) {
    return {
        collection,
        slug,
        path: `content/${collection}/${slug}.md`,
        pull: {
            number,
            title: `${collection}/${slug}`,
            body: '',
            draft: false,
            state: 'open',
            head: {ref: `cms/${collection}/${slug}`, sha: 'sha'},
            base: {ref: 'main'},
            labels: labels.map(name => ({name})),
            html_url: `https://github.com/owner/site/pull/${number}`,
            updated_at: new Date(0).toISOString()
        }
    };
}

function harness() {
    const moved = [];
    const view = buildReview(document, {
        moveStatus(which, status) {
            moved.push([which, status]);
        }
    });
    document.body.appendChild(view.node);
    return {view, moved, node: view.node};
}

const rows = node => [...node.querySelectorAll('.ct-cms__review')];
const moves = li => [...li.querySelectorAll('.ct-cms__review-move')];

describe('the review view', function() {

    let harnessed = null;

    afterEach(function() {
        if (harnessed) {
            harnessed.node.remove();
            harnessed = null;
        }
    });

    function draw(entries, moving = []) {
        harnessed = harnessed ?? harness();
        harnessed.view.update({config: CONFIG, entries, moving});
        return harnessed;
    }

    it('says it is loading rather than saying nothing is waiting',
       function() {
        // Opposite answers, and an author who reads the second over the
        // first stops looking for the change they know they left open.
        const {node} = draw(null);
        expect(node.querySelector('.ct-cms__note').textContent).toBe('Loading…');
        expect(rows(node)).toEqual([]);
    });

    it('falls back to the slug for a collection the config lost', function() {
        /* A pull request on `cms/archive/post` after `archive` was
           renamed or removed. `listInFlight` skips it, so this cannot
           arrive from the shell -- but the label is the only thing on
           the row a missing collection decides, and the slug is a true
           answer either way. The alternative is `undefined` where a
           person expects a name. */
        const {node} = draw([entry(7, 'archive', 'post', ['cms/draft'])]);
        const row = rows(node)[0];
        expect(row.querySelector('.ct-cms__review-link').textContent).toBe('post');
        expect(row.querySelector('.ct-cms__review-where').textContent).toBe('archive');
    });

    it('offers all three moves on a pull request carrying no status',
       function() {
        /* Somebody removed the label by hand, or opened the pull request
           themselves. It IS under review, and none of the three is where
           it already is -- so all three are live and the badge says
           something rather than nothing. */
        const {node} = draw([entry(1, 'blog', 'hello')]);
        const row = rows(node)[0];
        expect(row.querySelector('.ct-cms__review-badge').textContent).toBe('Open');
        expect(moves(row).map(button => button.disabled))
            .toEqual([false, false, false]);
        expect(moves(row).map(button => button.getAttribute('aria-pressed')))
            .toEqual(['false', 'false', 'false']);
    });

    it('rebinds a kept row\'s buttons to the entry it now shows', function() {
        /* `list()` keeps the node for an unchanged key and hands it a
           new entry -- and after a move that entry is a NEW object,
           carrying the labels the pull request now has. A handler
           closed over at build time would hand `setStatus` the labels
           the row was drawn with, so the label it removes is one that
           is already gone and the one actually on the pull request
           stays: an entry marked both In review and Ready, which
           `statusOf` then resolves in favour of the furthest along and
           nothing on screen contradicts. */
        const {node, moved, view} = draw([entry(1, 'blog', 'hello', ['cms/draft'])]);
        const kept = rows(node)[0];

        view.update({
            config: CONFIG,
            entries: [entry(1, 'blog', 'hello', ['cms/in-review'])],
            moving: []
        });
        expect(rows(node)[0]).toBe(kept);

        moves(kept).find(button => button.textContent === 'Ready').click();
        expect(moved.length).toBe(1);
        expect(moved[0][1]).toBe('ready');
        return expect(moved[0][0].pull.labels).toEqual([{name: 'cms/in-review'}]);
    });

    it('marks the status it is on, and holds only that one', function() {
        const {node} = draw([entry(1, 'blog', 'hello', ['cms/in-review'])]);
        const row = rows(node)[0];
        expect(moves(row).map(button => button.getAttribute('aria-pressed')))
            .toEqual(['false', 'true', 'false']);
        expect(moves(row).map(button => button.disabled))
            .toEqual([false, true, false]);
        /* And it is marked visibly as well as to a screen reader: the
           one button that is disabled AND current has to look different
           from one that is merely in flight, or a row mid-move and a row
           at rest are the same picture. */
        expect(moves(row)[1].className).toContain('ct-cms__review-move--current');
        expect(moves(row)[0].className).not.toContain('ct-cms__review-move--current');
    });

    it('holds every button on a row whose move is in flight', function() {
        const {node} = draw([
            entry(1, 'blog', 'hello', ['cms/draft']),
            entry(2, 'blog', 'second', ['cms/draft'])
        ], [1]);
        // Only that row. Two moves can genuinely be in flight at once,
        // and one in flight must not freeze the rest of the screen.
        expect(moves(rows(node)[0]).map(button => button.disabled))
            .toEqual([true, true, true]);
        expect(moves(rows(node)[1]).map(button => button.disabled))
            .toEqual([true, false, false]);
    });

    it('names the group the three buttons belong to', function() {
        /* Three buttons in a row are otherwise announced as three
           unrelated commands, and `Ready` on its own says nothing about
           what it is ready for. */
        const {node} = draw([entry(1, 'blog', 'hello', ['cms/draft'])]);
        const group = rows(node)[0].querySelector('.ct-cms__review-moves');
        expect(group.getAttribute('role')).toBe('group');
        expect(group.getAttribute('aria-label')).toBe('Status');
    });

    it('says the merge is not its to make', function() {
        // The shell never merges. Saying so on the screen where somebody
        // has just marked an entry Ready is the only place it lands.
        const {node} = draw([]);
        const hint = node.querySelector('.ct-cms__hint').textContent;
        expect(hint).toContain('happens on GitHub');
        expect(hint).toContain('not that it is published');
    });
});
