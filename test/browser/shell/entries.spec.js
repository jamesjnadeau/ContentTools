import {
    alertText, createFakeGitHub, forgetToken, mountShell, shellFetch, signIn, until
} from './helpers.js';
import {DIRECTORY_LIMIT} from '../../../src/cms/github.js';
import {TOKEN_KEY} from '../../../src/auth/pat.js';

/* The entry list, end to end through the shell against an in-memory GitHub.
 *
 * The three things this file exists for are all silent when they are wrong:
 *
 *   - an entry that exists only inside an open pull request appearing
 *     twice, or not at all. Twice reads as two pages with the same name and
 *     invites somebody to open the stale one; not at all means the work
 *     under review is invisible to everyone but its author.
 *   - a slow listing for a collection the user has already left rendering
 *     over the one they are looking at now: one collection's rows under
 *     another's heading, and a click that opens the wrong entry.
 *   - a listing GitHub cut short at its 1000-entry cap looking exactly like
 *     a complete one, so an author's own post is simply missing.
 */

const SEED = {
    'content/blog/hello.md': '# Hello\n',
    'content/blog/second.md': '# Second\n',
    'content/about.md': '# About\n'
};

const rows = shadow => [...shadow.querySelectorAll('.ct-cms__entry')];
const names = shadow =>
    rows(shadow).map(li => li.querySelector('.ct-cms__entry-link').textContent);
/** What a row's badge SAYS, counting a hidden one as saying nothing. */
const mark = (li, selector) => {
    const el = li.querySelector(selector);
    return el.hidden ? '' : el.textContent;
};
const badge = li => mark(li, '.ct-cms__badge');
const unpublished = li => mark(li, '.ct-cms__badge--unpublished');
const noteText = shadow => {
    const note = shadow.querySelector('.ct-cms__entries .ct-cms__note');
    return note && getComputedStyle(note).display !== 'none' ? note.textContent : '';
};
/** Whether an element is rendered at all, as the page decides it. */
const shown = el => getComputedStyle(el).display !== 'none';

describe('the entry list', function() {

    let mounted = null;

    beforeEach(function() {
        forgetToken();
    });

    afterEach(function() {
        if (mounted) {
            mounted.el.remove();
            mounted = null;
        }
        forgetToken();
        history.replaceState(null, '', location.pathname + location.search);
    });

    /**
     * Mount already ON a route, and sign in.
     *
     * The hash is set before the element is connected, because that is the
     * case a bookmarked entry actually exercises: the route exists before
     * the config does.
     */
    async function open(hash, options = {}) {
        history.replaceState(null, '', hash);
        const fake = options.fake ?? createFakeGitHub({files: options.files ?? SEED});
        mounted = await mountShell({fake, fetch: options.fetch ?? shellFetch(fake)});
        await signIn(mounted.el);
        return mounted;
    }

    it('lists what the collection publishes', async function() {
        const {shadow} = await open('#/c/blog');
        await until(() => rows(shadow).length === 2, 'two entries');
        expect(names(shadow)).toEqual(['hello', 'second']);
        // Nothing here is under review, so nothing claims to be. Asked of
        // the computed style, not of `textContent`: an empty badge still
        // has a border and a background, so a row that merely says
        // nothing is a grey box on every line of the list.
        expect(rows(shadow).map(li => shown(li.querySelector('.ct-cms__badge'))))
            .toEqual([false, false]);
        expect(rows(shadow).map(li => shown(li.querySelector('.ct-cms__entry-pull'))))
            .toEqual([false, false]);
        return expect(noteText(shadow)).toBe('');
    });

    it('takes the note out of the flow when it has nothing to say',
       async function() {
        /* Emptying its text is not enough: a <p> with no content still
           carries the UA's 1em above and below it, so the list would drop
           two lines the moment the note went away and rise again the next
           time one appeared. Asked of the computed style because that is
           the only place the difference exists -- `textContent` is the
           empty string either way. */
        const {shadow} = await open('#/c/blog');
        await until(() => rows(shadow).length === 2, 'two entries');
        const note = shadow.querySelector('.ct-cms__entries .ct-cms__note');
        expect(note.textContent).toBe('');
        return expect(getComputedStyle(note).display).toBe('none');
    });

    it('shows an entry that exists only in a pull request EXACTLY once',
       async function() {
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'unseen', ['cms/draft']);
        const {shadow} = await open('#/c/blog', {fake});

        await until(() => rows(shadow).length === 3, 'three entries');
        expect(names(shadow).filter(name => name === 'unseen').length).toBe(1);

        const row = rows(shadow).find(
            li => li.querySelector('.ct-cms__entry-link').textContent === 'unseen');
        expect(badge(row)).toBe('Draft');
        // The question an author about to hand somebody a URL is asking,
        // and one a status badge does not answer.
        return expect(unpublished(row)).toBe('Not published yet');
    });

    it('shows a published entry under review once, and does not call it new',
       async function() {
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/in-review']);
        const {shadow} = await open('#/c/blog', {fake});

        await until(() => rows(shadow).length === 2, 'two entries');
        expect(names(shadow)).toEqual(['hello', 'second']);
        expect(badge(rows(shadow)[0])).toBe('In review');
        return expect(unpublished(rows(shadow)[0])).toBe('');
    });

    it('puts the work in progress first', async function() {
        // Where the person came back to find it. A tool whose premise is
        // that every change is a pull request should not bury them in an
        // alphabetical list.
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'second', ['cms/ready']);
        const {shadow} = await open('#/c/blog', {fake});

        await until(() => rows(shadow).length === 2, 'two entries');
        expect(names(shadow)).toEqual(['second', 'hello']);
        return expect(rows(shadow).map(badge)).toEqual(['Ready', '']);
    });

    it('badges a pull request carrying no status label', async function() {
        /* Somebody removed the label by hand, or opened the pull request
           themselves. The entry IS under review either way, and a row that
           says nothing reads as an ordinary published entry -- so the next
           person edits against a branch nobody told them about. */
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello');
        const {shadow} = await open('#/c/blog', {fake});

        await until(() => rows(shadow).length === 2, 'two entries');
        return expect(badge(rows(shadow)[0])).toBe('Open');
    });

    it('links out to the pull request on GitHub', async function() {
        // The shell never merges: branch protection, required reviews and
        // CODEOWNERS are the site's controls, so the way out to them is
        // part of the product rather than a convenience.
        const fake = createFakeGitHub({files: SEED});
        const pull = fake.openPull('blog', 'hello', ['cms/draft']);
        const {shadow} = await open('#/c/blog', {fake});

        await until(() => rows(shadow).length === 2, 'two entries');
        const link = rows(shadow)[0].querySelector('.ct-cms__entry-pull');
        expect(link.textContent).toBe(`#${pull.number}`);
        expect(link.getAttribute('href')).toBe(pull.html_url);
        // The opened tab gets a handle on this one otherwise, and this one
        // is holding a GitHub token.
        return expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('leaves no dangling link on a row with no pull request', async function() {
        // A hidden <a href=""> is a link to the current page, and a screen
        // reader in links mode still offers it.
        const {shadow} = await open('#/c/blog');
        await until(() => rows(shadow).length === 2, 'two entries');
        const link = rows(shadow)[0].querySelector('.ct-cms__entry-pull');
        return expect(link.hasAttribute('href')).toBe(false);
    });

    it('names a file collection\'s entries the way the operator did',
       async function() {
        const {shadow} = await open('#/c/pages');
        await until(() => rows(shadow).length === 1, 'the one file');
        // `about` is the key; `About` is what the config calls it, and the
        // config is the only place that knows.
        return expect(names(shadow)).toEqual(['About']);
    });

    it('asks GitHub for no directory listing for a file collection',
       async function() {
        /* A file collection is configuration, not discovery -- the paths
           are in the config file the page already loaded. `listInFlight`
           still runs, and should: a pull request against a file
           collection's entry is as real as any other. */
        const {fake, shadow} = await open('#/c/pages');
        await until(() => rows(shadow).length === 1, 'the one file');

        const listings = fake.requests.filter(
            ([method, path]) => method === 'GET' && path.includes('/contents/'));
        expect(listings).toEqual([]);
        return expect(fake.requests.some(
            ([method, path]) => method === 'GET' && path.includes('/pulls'))).toBe(true);
    });

    it('says a collection is empty rather than leaving it blank', async function() {
        const {shadow} = await open('#/c/blog', {files: {'README.md': 'x'}});
        await until(() => noteText(shadow) !== '' && noteText(shadow) !== 'Loading…',
                    'a settled note');
        expect(noteText(shadow)).toBe('No entries yet.');
        return expect(rows(shadow)).toEqual([]);
    });

    it('says a listing was cut short rather than showing a short list',
       async function() {
        /* GitHub returns the first 1000 entries of a directory and says so
           nowhere. Without this the author of post number 1001 sees a list
           their own post is missing from, which reads as a deletion. */
        const files = {};
        for (let i = 0; i < DIRECTORY_LIMIT; i += 1) {
            files[`content/blog/post-${String(i).padStart(4, '0')}.md`] = '# Post\n';
        }
        const {shadow} = await open('#/c/blog', {files});
        await until(() => rows(shadow).length === DIRECTORY_LIMIT, 'a full page');
        return expect(noteText(shadow)).toContain('only the first part');
    });

    it('says it is loading rather than showing the last collection\'s rows',
       async function() {
        /* "Loading" and "nothing here" are different answers, and so are
           "loading" and "here is what some other collection holds". */
        const fake = createFakeGitHub({files: SEED});
        const gate = held(fake);
        gate.hold = false;
        const {el, shadow} = await open('#/c/pages', {fake, fetch: gate.fetch});
        await until(() => rows(shadow).length === 1, 'the pages entry');

        gate.hold = true;
        el.ownerDocument.defaultView.location.hash = '#/c/blog';
        await until(() => noteText(shadow) === 'Loading…', 'a loading note');
        return expect(rows(shadow)).toEqual([]);
    });

    it('does not let a listing the user navigated away from render',
       async function() {
        /* The `_nav` token. Without it the slow answer for the collection
           they left lands last and wins: one collection's rows under
           another's heading, and a click that opens the wrong entry. */
        const fake = createFakeGitHub({files: SEED});
        const gate = held(fake);
        history.replaceState(null, '', '#/');
        mounted = await mountShell({fake, fetch: gate.fetch});
        await signIn(mounted.el);
        const {el, shadow} = mounted;

        gate.hold = true;
        el.ownerDocument.defaultView.location.hash = '#/c/blog';
        await until(() => gate.waiting.length === 1, 'the blog listing to be in flight');

        gate.hold = false;
        el.ownerDocument.defaultView.location.hash = '#/c/pages';
        await until(() => names(shadow).length === 1, 'the pages entry');

        gate.release();
        // Two ticks is plenty for a resolved fetch to render if it is
        // going to; the point is that it must not.
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(names(shadow)).toEqual(['About']);
        return expect(shadow.querySelector('.ct-cms__heading').textContent).toBe('Pages');
    });

    it('asks for nothing at all for a collection the config does not have',
       async function() {
        /* The view already says "No such collection" by name. Asking the
           repository would throw a ConfigError over the top of it -- an
           alert on a page that is already explaining itself, in worse
           words. */
        const {fake, shadow} = await open('#/c/gone');
        await until(() => shadow.querySelector('.ct-cms__heading')
                              .textContent === 'No such collection',
                    'the missing-collection view');
        expect(alertText(mounted.el)).toBe('');
        return expect(fake.requests.some(
            ([method, path]) => method === 'GET' && path.includes('/contents/'))).toBe(false);
    });

    it('asks GitHub for nothing before anyone has signed in', async function() {
        /* The gate is a state that pre-empts routing, so a bookmarked
           collection must not start fetching behind it. Against a private
           repository an unauthenticated read comes back 404, and a 404
           over the gate reads as "that repository is gone" to somebody
           who has not yet been asked for a token. */
        history.replaceState(null, '', '#/c/blog');
        const fake = createFakeGitHub({files: SEED});
        mounted = await mountShell({fake, fetch: shellFetch(fake)});

        expect(mounted.el.getAttribute('state')).toBe('signed-out');
        return expect(fake.requests).toEqual([]);
    });

    it('loads the route it booted on when the tab already holds a token',
       async function() {
        /* A reload. The adapter reads the token straight out of
           sessionStorage, so the shell goes to `ready` without anybody
           touching the gate -- and the navigation that the gate would
           otherwise have triggered has to happen anyway, or the list
           never loads and the page sits on "Loading" for ever. */
        sessionStorage.setItem(TOKEN_KEY, 'github_pat_remembered');
        history.replaceState(null, '', '#/c/blog');
        const fake = createFakeGitHub({files: SEED});
        mounted = await mountShell({fake, fetch: shellFetch(fake)});

        expect(mounted.el.getAttribute('state')).toBe('ready');
        await until(() => rows(mounted.shadow).length === 2, 'two entries');
        return expect(names(mounted.shadow)).toEqual(['hello', 'second']);
    });

    it('goes back to the gate when the listing says the token is gone',
       async function() {
        /* A token revoked on GitHub, or expired while the tab sat open.
           Keeping it leaves the person inside a shell where every request
           fails and nothing on screen suggests signing in again. */
        const fake = createFakeGitHub({files: SEED});
        history.replaceState(null, '', '#/');
        mounted = await mountShell({fake});
        await signIn(mounted.el);
        const {el, shadow} = mounted;

        const real = el.fetch;
        el.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : String(input.url ?? input);
            return url.includes('/contents/')
                ? new Response('{"message":"Bad credentials"}', {status: 401})
                : real(input, init);
        };

        el.ownerDocument.defaultView.location.hash = '#/c/blog';
        await until(() => el.getAttribute('state') === 'signed-out', 'the gate');

        expect(sessionStorage.getItem(TOKEN_KEY)).toBe(null);
        expect(shadow.querySelector('.ct-cms__gate').hidden).toBe(false);
        return expect(alertText(el)).not.toBe('');
    });
});

/**
 * A `fetch` that can be made to hold directory listings open.
 *
 * Only the `contents/` calls: holding everything would block the pull
 * request half of the same `Promise.all` and the test would be waiting on
 * its own scaffolding rather than on the shell.
 */
function held(fake) {
    const base = shellFetch(fake);
    const waiting = [];
    const gate = {
        hold: true,
        waiting,
        release() {
            gate.hold = false;
            for (const resolve of waiting.splice(0)) {
                resolve();
            }
        },
        async fetch(input, init) {
            const url = typeof input === 'string' ? input : String(input.url ?? input);
            if (gate.hold && url.includes('/contents/')) {
                await new Promise(resolve => waiting.push(resolve));
            }
            return base(input, init);
        }
    };
    return gate;
}
