/* The entry view as a pure function of state.
 *
 * `entry.spec.js` drives the whole shell against a fake GitHub, which is
 * what proves the round trip works -- and it is the wrong instrument for
 * this. A shell test can only reach the states a shell can be put into, so
 * every branch that exists for a state the happy path passes through in
 * one tick (no entry yet, a save in flight, a pull request that went away)
 * is untestable from there while being exactly where a stale label or a
 * live link to nowhere hides.
 *
 * `buildEntry` takes a `Document` and returns a node plus an `update`, so
 * it can simply be handed each state in turn. Every assertion below is one
 * a shell test cannot make.
 */
import {buildEntry} from '../../../src/shell/views/entry.js';
import {parseConfig} from '../../../src/cms/config.js';

/* A deployment that publishes `blog` as pages and `notes` as nothing.
   Two collections, because the link is built from the one the OPEN
   ENTRY names -- and a view holding one entry and one collection that
   disagree is exactly what sends an author to another post's page. */
const CONFIG = parseConfig({
    backend: {repo: 'owner/site'},
    /* No `base`: served at the root, which is spelled by omitting the
       key rather than writing it empty. */
    site: {preview: 'https://preview-{{pr}}.test'},
    media: {folder: 'static/images', publicPath: '/images'},
    collections: [
        {name: 'blog', label: 'Blog', folder: 'content/blog',
         page: '/blog/{{slug}}/', body: 'article'},
        {name: 'notes', label: 'Notes', folder: 'content/notes'}
    ]
});

const PULL = {
    number: 12,
    title: 'Update content/blog/hello.md',
    body: '',
    draft: false,
    state: 'open',
    head: {ref: 'cms/blog/hello', sha: 'a'.repeat(40)},
    base: {ref: 'main'},
    labels: [],
    html_url: 'https://github.com/owner/site/pull/12',
    updated_at: '2026-01-01T00:00:00Z'
};

const ENTRY = {
    collection: 'blog',
    slug: 'hello',
    path: 'content/blog/hello.md',
    ref: 'main',
    commit: 'b'.repeat(40),
    content: '# Hello\n',
    pull: null
};

/** The state the shell holds for an entry that has only just been asked for. */
const LOADING = {
    entry: null, saving: false, saved: null, conflict: null, leaving: false,
    deletable: false, deleting: false, config: CONFIG,
    /* No form. The fields are their own view with their own spec, and
       every assertion here is about the chrome around them. */
    fields: null
};

function view(state = {}, handlers = {}) {
    const built = buildEntry(document, {
        submit() {}, reload() {}, stay() {}, discard() {},
        askDelete() {}, confirmDelete() {},
        ...handlers
    });
    built.update({...LOADING, ...state});
    return {
        built,
        find: selector => built.node.querySelector(selector)
    };
}

describe('the entry view', () => {
    describe('before the entry has arrived', () => {
        it('says so, rather than showing empty chrome', () => {
            /* The one thing on screen between the click and the
               response. Without it the pane is blank and indistinguishable
               from an entry that failed to load. */
            const {find} = view();
            return expect(find('.ct-cms__note').textContent).toBe('Loading…');
        });

        it('leaves the back link with no href at all', () => {
            /* Not an empty one. `<a href="">` is a link to the CURRENT
               page, so a keyboard user who tabs onto it -- `hidden` is
               not applied by every UA to a focusable element in every
               arrangement, and it is one CSS rule away from not applying
               at all -- reloads the shell and loses the entry. */
            const {find} = view();
            return expect(find('.ct-cms__entry-back').hasAttribute('href')).toBe(false);
        });

        it('hides the back link and the badge', () => {
            const {find} = view();
            expect(find('.ct-cms__entry-back').hidden).toBe(true);
            return expect(find('.ct-cms__badge').hidden).toBe(true);
        });

        it('disables submit, because there is nothing to submit', () => {
            /* Pressing it would call `saveEntry` with no entry to name.
               The handler guards that too, so the failure this prevents
               is not a throw -- it is a button that looks live and does
               nothing, on the one screen where the person is waiting for
               something to happen. */
            const {find} = view();
            return expect(find('.ct-cms__entry-submit').disabled).toBe(true);
        });
    });

    describe('the delete button', () => {
        it('is disabled before the entry has arrived', () => {
            /* Hidden is not the answer here -- the collection is known
               from the route, so the button is offered as soon as the
               screen is -- and an entry that has not loaded has no path
               to delete. A live button there opens a pull request
               against whatever the last entry was. */
            const {find} = view({deletable: true});
            expect(find('.ct-cms__entry-delete').hidden).toBe(false);
            return expect(find('.ct-cms__entry-delete').disabled).toBe(true);
        });

        it('is disabled while a save is in flight', () => {
            /* The two write the same branch. Pressing Delete during a
               save builds a second commit on the same parent, and the
               second one loses -- so the two buttons would race to
               produce the conflict panel that explains the race. */
            const {find} = view({entry: ENTRY, saving: true});
            return expect(find('.ct-cms__entry-delete').disabled).toBe(true);
        });

        it('is live once there is an entry and no save running', () => {
            const {find} = view({entry: ENTRY, deletable: true});
            return expect(find('.ct-cms__entry-delete').disabled).toBe(false);
        });
    });

    describe('with an entry open', () => {
        it('names the collection on the back link', () => {
            const {find} = view({entry: ENTRY});
            const back = find('.ct-cms__entry-back');
            expect(back.textContent).toBe('All blog');
            expect(back.getAttribute('href')).toBe('#/c/blog');
            return expect(back.hidden).toBe(false);
        });

        it('says nothing in the note when nothing has happened yet', () => {
            const {find} = view({entry: ENTRY});
            return expect(find('.ct-cms__note').textContent).toBe('');
        });

        it('says it is saving while a save is in flight', () => {
            const {find} = view({entry: ENTRY, saving: true});
            return expect(find('.ct-cms__note').textContent).toBe('Saving…');
        });

        it('reports what the last save said', () => {
            /* The commit is the receipt. Without it a save that changed
               nothing and a save that committed look identical, which is
               the difference between "it worked" and "press it again". */
            const {find} = view({entry: ENTRY, saved: 'Saved as abc1234.'});
            return expect(find('.ct-cms__note').textContent).toBe('Saved as abc1234.');
        });

        it('shows the badge and the pull link once there is a pull request', () => {
            const {find} = view({entry: {...ENTRY, pull: PULL}});
            expect(find('.ct-cms__badge').hidden).toBe(false);
            return expect(find('.ct-cms__badge').textContent).toBe('Open');
        });
    });

    describe('when the state changes under it', () => {
        it('empties the badge rather than only hiding it', () => {
            /* A hidden node's text is still its `textContent`, which is
               what every assertion in this suite reads and what a screen
               reader reads if the `hidden` is ever lost. A stale "In
               review" left behind a `hidden` attribute is a label that
               reappears, correct-looking and wrong, the moment anything
               unhides it. */
            const withPull = {...ENTRY, pull: {...PULL, labels: [{name: 'cms/in-review'}]}};
            const built = buildEntry(document, {
                submit() {}, reload() {}, stay() {}, discard() {}
            });
            built.update({...LOADING, entry: withPull});
            expect(built.node.querySelector('.ct-cms__badge').textContent).toBe('In review');

            built.update({...LOADING, entry: ENTRY});
            const badge = built.node.querySelector('.ct-cms__badge');
            expect(badge.textContent).toBe('');
            return expect(badge.hidden).toBe(true);
        });
    });

    describe('the link to the site’s own page', () => {
        /* Three different reasons for there to be no link, and the shell
           can only be put into one of them -- a collection that declares
           no `page`, which `entry.spec.js` covers. The other two are
           here because they are exactly where a live link to nowhere
           hides: an `<a>` whose `href` was never set resolves to the
           page it is already on, so a broken link and a link back to
           `/admin` look identical in the DOM and differ only when
           somebody clicks. */

        it('offers nothing while the config is still null', () => {
            /* A state the shell passes through and never renders: it
               shows the status screen until the config has loaded, so
               the view is only ever handed one. The branch stays
               because the alternative is a view that throws if that
               order ever changes, and a screen that throws during
               render is a blank page. */
            const {find} = view({entry: ENTRY, config: null});
            const link = find('.ct-cms__entry-edit');
            expect(link.hidden).toBe(true);
            expect(link.textContent).toBe('');
            expect(link.hasAttribute('href')).toBe(false);
            return expect(find('.ct-cms__entry-stale').hidden).toBe(true);
        });

        it('offers nothing for a collection the config no longer has', () => {
            /* Unreachable from the shell for a reason worth stating:
               `readEntry` resolves the collection first and throws a
               `ConfigError`, so a bookmark naming a renamed collection
               never reaches this view at all. What it guards is the
               order changing -- an entry held across a config reload,
               or a read that resolves its collection later than it does
               now -- where the difference between "no page" and "a link
               to the wrong post's page" is one `findCollection`. */
            const {find} = view({
                entry: {...ENTRY, collection: 'gone'},
                config: CONFIG
            });
            const link = find('.ct-cms__entry-edit');
            expect(link.hidden).toBe(true);
            expect(link.textContent).toBe('');
            return expect(link.hasAttribute('href')).toBe(false);
        });

        it('links a published entry to its page, with no warning', () => {
            /* The positive case, here as well as in `entry.spec.js`,
               because the two above assert an absence and an absence
               that is always absent proves nothing. */
            const {find} = view({entry: ENTRY, config: CONFIG});
            const link = find('.ct-cms__entry-edit');
            expect(link.hidden).toBe(false);
            expect(link.getAttribute('href')).toBe('/blog/hello/');
            return expect(find('.ct-cms__entry-stale').hidden).toBe(true);
        });
    });

    describe('the conflict panel', () => {
        it('cannot be typed into', () => {
            /* It is a copy source, and nothing reads it back. Without
               `readonly` it looks like the place to fix the conflict,
               and every keystroke spent there is thrown away by the
               reload the same panel is asking for. */
            const {find} = view({entry: ENTRY, conflict: '# Mine\n'});
            return expect(find('.ct-cms__conflict-text').readOnly).toBe(true);
        });
    });
});
