import {
    alertText, createFakeGitHub, forgetToken, mountShell, shellFetch, signIn, until
} from './helpers.js';

/* The review list, end to end through the shell against an in-memory GitHub.
 *
 * This is the screen that answers "what is waiting for somebody", which no
 * collection can: an author with three changes in flight across two
 * collections can only answer it by opening both, which is how a change
 * sits in a branch for a fortnight because nobody remembered it was there.
 *
 * Three things here are silent when they are wrong:
 *
 *   - a status move that does not reach the row. The write succeeded on
 *     GitHub, so the next refresh corrects it -- and in between, a second
 *     press sends the same label again and the person learns the buttons
 *     do nothing.
 *   - a merged pull request still listed. Its branch is gone, so opening
 *     it reads the base and saving it opens a NEW pull request for a
 *     change that is already published.
 *   - a row keyed by anything but its pull request. A move updates a row
 *     in place, so rekeying rebuilds the node under the pointer between
 *     the click and the answer.
 */

const SEED = {
    'content/blog/hello.md': '# Hello\n',
    'content/blog/second.md': '# Second\n',
    'content/about.md': '# About\n'
};

const rows = shadow => [...shadow.querySelectorAll('.ct-cms__review')];
const names = shadow =>
    rows(shadow).map(li => li.querySelector('.ct-cms__review-link').textContent);
const badges = shadow =>
    rows(shadow).map(li => li.querySelector('.ct-cms__review-badge').textContent);
const moves = li => [...li.querySelectorAll('.ct-cms__review-move')];
const press = (li, label) =>
    moves(li).find(button => button.textContent === label).click();
const noteText = shadow => {
    const note = shadow.querySelector('.ct-cms__reviews .ct-cms__note');
    return note ? note.textContent : null;
};
/** Which labels a pull request carries in the fake, ours or otherwise. */
const labelsOf = (fake, number) =>
    fake.pulls().find(pull => pull.number === number).labels.map(label => label.name);

describe('the review list', function() {

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

    async function open(options = {}) {
        history.replaceState(null, '', '#/review');
        const fake = options.fake ?? createFakeGitHub({files: SEED});
        mounted = await mountShell({fake, fetch: options.fetch ?? shellFetch(fake)});
        await signIn(mounted.el);
        return mounted;
    }

    it('lists what is in flight across every collection', async function() {
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/in-review']);
        fake.openPull('pages', 'about', ['cms/draft']);
        const {shadow} = await open({fake});

        await until(() => rows(shadow).length === 2, 'two reviews');
        // `About` rather than `about`: a file collection's label is what
        // the operator called it, and the config is the only place that
        // knows. The words come from the same function the entry list
        // uses, which is why they are the same words.
        expect(names(shadow)).toEqual(['hello', 'About']);
        expect(badges(shadow)).toEqual(['In review', 'Draft']);
        /* Which collection, on every row. This list spans them, so a row
           saying only `About` leaves an author guessing which of two
           collections holds the About they are looking at. */
        return expect(rows(shadow).map(
            li => li.querySelector('.ct-cms__review-where').textContent))
            .toEqual(['Blog', 'Pages']);
    });

    it('says nothing is waiting rather than leaving the screen blank',
       async function() {
        /* "Loading" and "nothing is waiting" are opposite answers, and an
           author who reads the second over the first stops looking for the
           change they know they left open. */
        const {shadow} = await open();
        await until(() => noteText(shadow) !== null && noteText(shadow) !== 'Loading…',
                    'a settled note');
        expect(noteText(shadow)).toContain('Nothing is under review');
        return expect(rows(shadow)).toEqual([]);
    });

    it('moves an entry to a status and shows it from what came back',
       async function() {
        const fake = createFakeGitHub({files: SEED});
        const pull = fake.openPull('blog', 'hello', ['cms/draft']);
        const {shadow} = await open({fake});
        await until(() => rows(shadow).length === 1, 'the one review');

        press(rows(shadow)[0], 'Ready');
        await until(() => badges(shadow)[0] === 'Ready', 'the badge to move');

        // The label really moved on GitHub, and exactly one of ours is on
        // it: a pull request carrying both `draft` and `ready` is what a
        // status change that failed halfway leaves behind.
        expect(labelsOf(fake, pull.number)).toEqual(['cms/ready']);
        /* And the view was updated from the object `setStatus` RETURNED.
           A re-fetch would be a request that can only tell us what we
           already know, and GitHub's label writes are not read-your-own,
           so it can come back stale. */
        return expect(fake.requests.filter(
            ([method, path]) => method === 'GET' && path.includes('/pulls')).length)
            .toBe(1);
    });

    it('keeps the rows themselves across a move', async function() {
        /* The key is the pull request number, which is the identity of a
           review: an entry can be renamed and a branch can be
           force-pushed, and it is the same review throughout. Rekeying
           rebuilds the node under the pointer between the click and the
           answer -- so the button somebody is still holding the mouse
           down on is a different button by the time it answers.

           Two rows, because one is kept by any key at all. */
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/draft']);
        fake.openPull('blog', 'second', ['cms/draft']);
        const {shadow} = await open({fake});
        await until(() => rows(shadow).length === 2, 'two reviews');

        const before = rows(shadow);
        press(before[0], 'In review');
        await until(() => badges(shadow)[0] === 'In review', 'the badge to move');
        expect(rows(shadow)[0]).toBe(before[0]);
        return expect(rows(shadow)[1]).toBe(before[1]);
    });

    it('leaves exactly one of our labels after a second move', async function() {
        /* The second move is the one that catches a row still holding
           the entry it was DRAWN with: `setStatus` removes the labels
           the pull request it is handed carries, so a stale entry has
           it removing one that is already gone and leaving the one
           actually on the pull request. The entry ends up both In
           review and Ready, `statusOf` resolves in favour of the
           furthest along, and nothing on screen contradicts it. */
        const fake = createFakeGitHub({files: SEED});
        const pull = fake.openPull('blog', 'hello', ['cms/draft']);
        const {shadow} = await open({fake});
        await until(() => rows(shadow).length === 1, 'the one review');

        press(rows(shadow)[0], 'In review');
        await until(() => badges(shadow)[0] === 'In review', 'the first move');
        press(rows(shadow)[0], 'Ready');
        await until(() => badges(shadow)[0] === 'Ready', 'the second move');

        return expect(labelsOf(fake, pull.number)).toEqual(['cms/ready']);
    });

    it('holds every button on the row while the move is in flight',
       async function() {
        /* A button that looks live during the round trip invites a second
           press, and the second press is a second write of a label the
           first one is already setting. */
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/draft']);
        let release = null;
        const held = new Promise(resolve => {
            release = resolve;
        });
        const fetchFor = shellFetch(fake);
        const {shadow} = await open({
            fake,
            fetch: async (input, init) => {
                const url = typeof input === 'string' ? input : String(input.url ?? input);
                if (url.includes('/labels')) {
                    await held;
                }
                return fetchFor(input, init);
            }
        });
        await until(() => rows(shadow).length === 1, 'the one review');

        press(rows(shadow)[0], 'Ready');
        await until(() => moves(rows(shadow)[0]).every(button => button.disabled),
                    'every button held');
        /* And the one it is CURRENTLY on still reads as the status
           rather than as another held button. Every button in this row
           is disabled at this moment, so `:disabled` alone greys all
           three and a row mid-move stops saying where the entry is --
           which is the one thing the row is for. Asked of the computed
           style, because the class assertion elsewhere cannot see
           whether any rule acts on it. */
        const [draft, inReview] = moves(rows(shadow)[0]);
        expect(getComputedStyle(draft).fontWeight)
            .not.toBe(getComputedStyle(inReview).fontWeight);
        release();
        await until(() => badges(shadow)[0] === 'Ready', 'the badge to move');
        /* And released afterwards -- except the one it is now on, which
           stays held because writing a label a pull request already
           carries is a request that changes nothing, and a button that
           looks live and does nothing is indistinguishable from one that
           failed. */
        return expect(moves(rows(shadow)[0]).map(button => button.disabled))
            .toEqual([false, false, true]);
    });

    it('releases the buttons when the move FAILS', async function() {
        /* Left held, the row is a review nobody is allowed to touch --
           for as long as the tab is open, and across a refresh that
           brings the same review back. */
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/draft']);
        const fetchFor = shellFetch(fake);
        const {el, shadow} = await open({
            fake,
            fetch: async (input, init) => {
                const url = typeof input === 'string' ? input : String(input.url ?? input);
                if (url.includes('/labels')) {
                    return new Response(JSON.stringify({message: 'Nope'}), {status: 500});
                }
                return fetchFor(input, init);
            }
        });
        await until(() => rows(shadow).length === 1, 'the one review');

        press(rows(shadow)[0], 'Ready');
        await until(() => alertText(el).includes('Nope'), 'the failure on the page');
        expect(badges(shadow)).toEqual(['Draft']);
        return expect(moves(rows(shadow)[0]).map(button => button.disabled))
            .toEqual([true, false, false]);
    });

    it('drops a merged pull request, and the entry becomes an ordinary one',
       async function() {
        /* A review that has merged is finished: the change is on the
           base branch and there is nothing left to wait for. Left on
           this list it is work nobody can do -- and the entry list
           beside it would still be calling a published page
           unpublished, which is the one badge an author about to hand
           somebody a URL reads. */
        const fake = createFakeGitHub({files: SEED});
        /* An entry that exists only inside the pull request, so the
           merge is what puts it on the site. Written AFTER the pull
           request is opened, because opening one points its branch at
           the base. */
        const pull = fake.openPull('blog', 'unseen', ['cms/ready']);
        fake.pushOther(
            'cms/blog/unseen', {'content/blog/unseen.md': '# Unseen\n'}, 'add unseen');
        const {el, shadow} = await open({fake});
        await until(() => rows(shadow).length === 1, 'the one review');

        fake.mergePull(pull.number);
        location.hash = '#/c/blog';
        await until(() => shadow.querySelector('.ct-cms__entries') !== null,
                    'the collection screen');
        location.hash = '#/review';
        await until(() => noteText(shadow)?.includes('Nothing is under review'),
                    'an empty review list');
        expect(alertText(el)).toBe('');

        location.hash = '#/c/blog';
        await until(() => [...shadow.querySelectorAll('.ct-cms__entry-link')]
            .some(a => a.textContent === 'unseen'), 'the merged entry, published');
        const row = [...shadow.querySelectorAll('.ct-cms__entry')].find(
            li => li.querySelector('.ct-cms__entry-link').textContent === 'unseen');
        expect(row.querySelector('.ct-cms__badge').hidden).toBe(true);
        return expect(
            row.querySelector('.ct-cms__badge--unpublished').hidden).toBe(true);
    });

    it('lets go of a row whose move finished after the author left',
       async function() {
        /* The answer arrives on a screen that is no longer showing, so
           nothing renders it -- but the number has to come off the
           in-flight list all the same. Left on it, the row is disabled
           for as long as the tab is open, INCLUDING after a refresh
           brings the same review back: a review nobody is allowed to
           touch, for a move that succeeded. */
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/draft']);
        let release = null;
        const held = new Promise(resolve => {
            release = resolve;
        });
        const fetchFor = shellFetch(fake);
        const {shadow} = await open({
            fake,
            fetch: async (input, init) => {
                const url = typeof input === 'string' ? input : String(input.url ?? input);
                if (url.includes('/labels')) {
                    await held;
                }
                return fetchFor(input, init);
            }
        });
        await until(() => rows(shadow).length === 1, 'the one review');

        press(rows(shadow)[0], 'Ready');
        location.hash = '#/c/blog';
        await until(() => rows(shadow).length === 0, 'the review screen left');
        release();
        location.hash = '#/review';
        await until(() => rows(shadow).length === 1, 'the review listed again');
        expect(badges(shadow)).toEqual(['Ready']);
        expect(moves(rows(shadow)[0]).map(button => button.disabled))
            .toEqual([false, false, true]);
        /* And nothing on the page says it went wrong. There is no list
           to splice the answer into at that moment, which is a thing to
           leave alone rather than a failure to report. */
        return expect(alertText(mounted.el)).toBe('');
    });

    it('says it is loading again when you come back to it', async function() {
        /* Rather than showing what was true last time. The rows it
           still holds can be stale in the one way that matters here --
           a review merged on GitHub while the author was elsewhere --
           and a list presented as current is one somebody acts on: they
           open an entry whose branch no longer exists.

           The second listing is HELD, because that is the only window
           in which the difference exists: released, a fresh list
           corrects the screen a tick later either way. */
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/draft']);
        const gate = {hold: false};
        const fetchFor = shellFetch(fake);
        const {shadow} = await open({
            fake,
            fetch: async (input, init) => {
                const url = typeof input === 'string' ? input : String(input.url ?? input);
                if (gate.hold && url.includes('/pulls?')) {
                    await new Promise(() => {});
                }
                return fetchFor(input, init);
            }
        });
        await until(() => rows(shadow).length === 1, 'the one review');

        gate.hold = true;
        location.hash = '#/c/blog';
        /* Waited for, not assumed: `hashchange` is asynchronous, so
           without this the assertions below run on the review screen
           that never left and pass whatever the shell does. */
        await until(() => shadow.querySelector('.ct-cms__entries') !== null,
                    'the collection screen');
        location.hash = '#/review';
        await until(() => shadow.querySelector('.ct-cms__reviews') !== null,
                    'the review screen again');
        expect(noteText(shadow)).toBe('Loading…');
        return expect(rows(shadow)).toEqual([]);
    });

    it('does not let a listing the author already left behind win',
       async function() {
        /* Two listings of the same screen, overlapping. The author
           leaves the review list and comes back, so the second listing
           is the true one -- and the first, which describes the
           repository as it was before, must not land on top of it. It
           looks entirely plausible when it does: a review that has
           since been opened is simply missing, and nothing says the
           list is out of date. */
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/draft']);
        let release = null;
        const held = new Promise(resolve => {
            release = resolve;
        });
        let holds = 1;
        const fetchFor = shellFetch(fake);
        const {shadow} = await open({
            fake,
            fetch: async (input, init) => {
                const url = typeof input === 'string' ? input : String(input.url ?? input);
                if (url.includes('/pulls?') && holds > 0) {
                    holds -= 1;
                    /* Answered NOW and delivered later, rather than
                       held before it runs: the point is a body that
                       describes the repository as it was, and a
                       request held at the door would be answered
                       from the repository as it has since become. */
                    const answer = await fetchFor(input, init);
                    await held;
                    return answer;
                }
                return fetchFor(input, init);
            }
        });

        // Away, and a review opened while the author is elsewhere, so
        // the two listings genuinely differ.
        location.hash = '#/c/blog';
        await until(() => shadow.querySelector('.ct-cms__entries') !== null,
                    'the collection screen');
        fake.openPull('blog', 'second', ['cms/draft']);

        // Back, which starts a second listing -- and let that one land
        // FIRST, so what follows is the stale answer arriving last.
        location.hash = '#/review';
        await until(() => rows(shadow).length === 2, 'the second listing');
        release();
        await new Promise(resolve => setTimeout(resolve, 0));

        return expect(names(shadow)).toEqual(['hello', 'second']);
    });

    it('holds only the row whose move is in flight', async function() {
        /* Two moves can genuinely be in flight at once, and releasing
           the first must not release the second: a row that looks live
           while its own request is still running invites a second press
           of a label the first one is already writing. */
        const fake = createFakeGitHub({files: SEED});
        fake.openPull('blog', 'hello', ['cms/draft']);
        fake.openPull('blog', 'second', ['cms/draft']);
        const held = new Map();
        const fetchFor = shellFetch(fake);
        const {shadow} = await open({
            fake,
            fetch: async (input, init) => {
                const url = typeof input === 'string' ? input : String(input.url ?? input);
                const at = /\/issues\/(\d+)\/labels/.exec(url);
                if (at && held.has(at[1])) {
                    await held.get(at[1]);
                }
                return fetchFor(input, init);
            }
        });
        await until(() => rows(shadow).length === 2, 'two reviews');

        let releaseSecond = null;
        held.set('2', new Promise(resolve => {
            releaseSecond = resolve;
        }));
        press(rows(shadow)[0], 'Ready');
        press(rows(shadow)[1], 'Ready');
        await until(() => badges(shadow)[0] === 'Ready', 'the first move to land');

        // The first is back, minus the status it is now on; the second
        // is still held, all three.
        expect(moves(rows(shadow)[0]).map(button => button.disabled))
            .toEqual([false, false, true]);
        expect(moves(rows(shadow)[1]).map(button => button.disabled))
            .toEqual([true, true, true]);
        releaseSecond();
        await until(() => badges(shadow)[1] === 'Ready', 'the second move to land');
        return expect(moves(rows(shadow)[1]).map(button => button.disabled))
            .toEqual([false, false, true]);
    });

    it('marks the review link as where you are', async function() {
        const {shadow} = await open();
        const link = [...shadow.querySelectorAll('.ct-cms__nav-link')]
            .find(a => a.textContent === 'In review');
        expect(link.getAttribute('href')).toBe('#/review');
        // `aria-current` as well as the class: the highlight is the only
        // thing saying where you are, and a class says nothing to a
        // screen reader.
        expect(link.getAttribute('aria-current')).toBe('page');
        expect(link.className).toContain('ct-cms__nav-link--current');

        location.hash = '#/c/blog';
        await until(() => link.getAttribute('aria-current') === null,
                    'the mark to move off');
        return expect(link.className).not.toContain('ct-cms__nav-link--current');
    });

    it('links a row to the entry, and out to GitHub', async function() {
        const fake = createFakeGitHub({files: SEED});
        const pull = fake.openPull('blog', 'hello', ['cms/draft']);
        const {shadow} = await open({fake});
        await until(() => rows(shadow).length === 1, 'the one review');

        const row = rows(shadow)[0];
        expect(row.querySelector('.ct-cms__review-link').getAttribute('href'))
            .toBe('#/c/blog/e/hello');
        const out = row.querySelector('.ct-cms__review-pull');
        expect(out.textContent).toBe(`#${pull.number} on GitHub`);
        expect(out.getAttribute('href')).toBe(pull.html_url);
        // The opened tab gets a handle on this one otherwise, and this
        // one is holding a GitHub token.
        return expect(out.getAttribute('rel')).toContain('noopener');
    });
});
