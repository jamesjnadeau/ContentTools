import {
    alertText, createFakeGitHub, entryOf, fieldOf, forgetToken, openAt, openedEntry,
    setField, shellFetch, signIn, until, CONFIG_URL
} from './helpers.js';
import {readHandoff} from '../../../src/auth/handoff.js';
import {TOKEN_KEY} from '../../../src/auth/pat.js';

/* Opening an entry under `/admin`, changing its frontmatter, and turning
 * that into a pull request.
 *
 * `/admin` is MANAGEMENT since M6-3: no editor, no body, no light-DOM
 * children at all. The words of an entry are edited on the site's own
 * page, by `src/edit/`, and what this screen offers instead is a link to
 * that page -- built by `editUrl`, which sends a draft to its pull
 * request's deploy preview and a published entry to the live site.
 *
 * Most of what is asserted here is a JOIN going wrong rather than any one
 * layer being wrong, and a join goes wrong quietly. A save that reaches
 * `update` instead of `updateFrontmatter` puts a body nobody looked at
 * through the walker, so an inline type nobody has thought about rewrites
 * a block on a save that changed a date. A form that always reports its
 * values puts every save through a YAML round trip -- comments gone, key
 * order sorted -- and the pull request nobody can read is the whole
 * premise of the project, lost.
 */

const SEED = '---\ntitle: Hello\ndraft: false\n---\n\n# Hello\n\nWorld.\n';
const ENTRY = 'content/blog/hello.md';
const BRANCH = 'cms/blog/hello';

function fakeWith(files = {[ENTRY]: SEED}) {
    return createFakeGitHub({files});
}

/** Open `#/c/blog/e/hello` and wait for the file to arrive. */
async function openHello(options = {}) {
    const mounted = await openAt(
        '#/c/blog/e/hello', {fake: options.fake ?? fakeWith(), ...options});
    await openedEntry(mounted.el);
    return mounted;
}

/**
 * Everything after the frontmatter block, including the gap.
 *
 * The one assertion this screen exists to keep true. `/admin` never reads
 * the body, so every save it makes has to leave it exactly as it was --
 * not "semantically the same", the same bytes, because a diff that
 * touches a paragraph nobody edited is a diff a reviewer stops reading.
 */
function bodyOf(source) {
    const end = source.indexOf('\n---\n', 4);
    return end === -1 ? source : source.slice(end + 5);
}

/** Press Submit and wait for the save to finish. */
async function submit(el) {
    el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
    await until(
        () => !el.shadowRoot.querySelector('.ct-cms__entry-submit').disabled,
        'the save to finish');
}

/** The lines of `after` that `before` does not have. */
function addedLines(before, after) {
    const had = new Set(before.split('\n'));
    return after.split('\n').filter(line => line && !had.has(line));
}

describe('the entry management screen', function() {

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

    async function open(options) {
        mounted = await openHello(options);
        return mounted;
    }

    // --- no editor, anywhere ---------------------------------------------

    it('mounts no editor and writes nothing into its own light DOM',
       async function() {
        /* The M6-3 invariant, and the one nothing else can see. An
           editor here would work perfectly -- and would hold the
           one-per-page `EditorApp` lease, so the in-page surface on the
           site's own page, which is where the body is actually edited,
           would refuse to boot with nothing in any stack trace.

           `current()` rather than counting elements: a lease claimed by
           something this test cannot name is the failure, not a tag. */
        const {el} = await open();
        expect(el.childNodes.length).toBe(0);
        expect(el.querySelector('content-tools-editor')).toBe(null);
        return expect(ContentTools.EditorApp.current()).toBe(null);
    });

    it('offers the site\u2019s own page as the way to edit the words',
       async function() {
        /* The link is the whole replacement for the editor that used to
           be here, and there is nothing else on this screen that can
           change a word of the body. A new tab deliberately: the two
           surfaces write the same file and an author moves between them,
           so closing this one to reach the other would mean re-opening
           the entry on every trip back. */
        const {shadow} = await open();
        const link = shadow.querySelector('.ct-cms__entry-edit');
        expect(link.hidden).toBe(false);
        /* The flag, and NO token. The page needs one -- it cannot see
           this tab's -- but an href is what gets copied into a chat
           window and middle-clicked into somebody else's tab, so the
           token rides a click instead. See the handoff tests below. */
        expect(link.getAttribute('href')).toBe('/blog/hello/?cms-edit');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        // No warning: a published entry's live page IS the right page.
        return expect(shadow.querySelector('.ct-cms__entry-stale').hidden).toBe(true);
    });

    it('sends a draft to its pull request\u2019s preview, not the live page',
       async function() {
        /* The live site is built from the base branch, so it shows the
           published text and knows nothing about the branch the editor
           would be committing to. An author sent there to work on a
           draft edits the old version, and their pull request comes
           back carrying the reviewer's changes reverted. */
        const fake = fakeWith();
        fake.openPull('blog', 'hello', ['cms/in-review']);
        const {shadow} = await open({fake});

        const link = shadow.querySelector('.ct-cms__entry-edit');
        expect(link.getAttribute('href'))
            .toBe('https://deploy-preview-1--site.test/blog/hello/?cms-edit');
        return expect(shadow.querySelector('.ct-cms__entry-stale').hidden).toBe(true);
    });

    it('warns when a draft has no preview to be edited on', async function() {
        /* `editUrl` falls back to the live page rather than refusing,
           because refusing would take in-page editing away from every
           site that builds no previews. The fallback is the wrong page
           for the reason above, so it is said out loud rather than
           linked silently. */
        const {shadow} = await open({
            fake: (() => {
                const fake = fakeWith();
                fake.openPull('blog', 'hello', ['cms/draft']);
                return fake;
            })(),
            files: {[CONFIG_URL]: CONFIG_YAML_TEXT.replace(
                /  preview: .*\n/, '')}
        });

        expect(shadow.querySelector('.ct-cms__entry-edit').getAttribute('href'))
            .toBe('/blog/hello/?cms-edit');
        const warning = shadow.querySelector('.ct-cms__entry-stale');
        expect(warning.hidden).toBe(false);
        return expect(warning.textContent).toContain('write over the draft');
    });

    it('offers no link at all for a collection that is not published as pages',
       async function() {
        /* Null is a real answer and not a failure: a collection of data
           files has no page. Emptied rather than left behind `hidden`,
           because a hidden node's text is still in `textContent`. */
        const {el, shadow} = await open({
            files: {[CONFIG_URL]: CONFIG_YAML_TEXT.replace(
                /    page: .*\n/, '')}
        });
        const link = shadow.querySelector('.ct-cms__entry-edit');
        expect(link.hidden).toBe(true);
        expect(link.textContent).toBe('');
        expect(link.hasAttribute('href')).toBe(false);
        expect(getComputedStyle(link).display).toBe('none');
        return expect(shadow.querySelector('.ct-cms__entry-stale').hidden).toBe(true);
    });


    // --- the token that crosses with the click ----------------------------

    /* The href carries the flag and no secret, so what gets copied out of
       the address bar or middle-clicked into somebody else's tab is
       harmless. The token rides an unmodified primary click instead,
       through `window.open`, where it reaches the fragment and nothing
       else -- not a server log, not a `Referer`. */

    /** Catch what the shell hands `window.open`, and open nothing. */
    function watchOpen() {
        const opened = [];
        const real = window.open;
        window.open = (...args) => {
            opened.push(args);
            return null;
        };
        return {opened, restore: () => void (window.open = real)};
    }

    /** Click the Edit link, and say whether the shell took the click. */
    function clickEdit(shadow, init = {}) {
        const ev = new MouseEvent(
            'click', {bubbles: true, cancelable: true, ...init});
        shadow.querySelector('.ct-cms__entry-edit').dispatchEvent(ev);
        return ev;
    }

    it('carries this tab’s token to the page it opens', async function() {
        /* `sessionStorage` is per-origin AND per browsing context, and a
           draft's page is usually neither: an author signed in here
           cannot be seen there. Without this the link lands on a page
           that says "sign in through the admin screens in this tab" --
           in a tab that is not this one, about a screen that cannot
           help it. */
        const {shadow} = await open();
        const watch = watchOpen();

        try {
            const ev = clickEdit(shadow);

            expect(ev.defaultPrevented).toBe(true);
            expect(watch.opened.length).toBe(1);
            const [url, target, features] = watch.opened[0];
            expect(target).toBe('_blank');
            /* `noopener` deliberately, even though it costs the
               `sessionStorage` copy a same-origin tab would otherwise
               inherit: the copy is not what is being relied on -- the
               fragment is -- and an opener handle is a live reference
               into this tab from a page the deployment does not own. */
            expect(features).toBe('noopener');

            const [page, fragment] = url.split('#');
            expect(page).toBe('/blog/hello/?cms-edit');
            return expect(readHandoff(fragment).handoff)
                .toEqual({key: TOKEN_KEY, value: 'github_pat_test'});
        } finally {
            watch.restore();
        }
    });

    it.each([
        ['⌘-click', {metaKey: true}],
        ['ctrl-click', {ctrlKey: true}],
        ['shift-click', {shiftKey: true}],
        ['alt-click', {altKey: true}],
        ['a middle click', {button: 1}]
    ])('leaves %s to the browser, carrying no token', async function(_name, init) {
        /* Every one of these means "open this somewhere I choose", and
           `window.open` is not that place. Taking the click would break
           the browser's own affordances; the href is what runs instead,
           and the page it reaches says how to sign in. A visible
           degradation rather than a token in a bookmark. */
        const {shadow} = await open();
        const watch = watchOpen();

        try {
            expect(clickEdit(shadow, init).defaultPrevented).toBe(false);
            return expect(watch.opened).toEqual([]);
        } finally {
            watch.restore();
        }
    });

    it('opens the plain link for an adapter that hands nothing on',
       async function() {
        /* `handoff` is optional, so an adapter written before it existed
           -- or a host page's own -- is not broken, just quieter. The
           link still opens, and the page it opens says how to sign in.
           The alternative, refusing to open, would take in-page editing
           away from a deployment whose only fault is an older adapter. */
        const {el, shadow} = await open();
        el.auth = {
            currentToken: () => 'held-elsewhere',
            authenticate: async () => ({token: 'held-elsewhere'}),
            logout: async () => {}
        };
        const watch = watchOpen();

        try {
            expect(clickEdit(shadow).defaultPrevented).toBe(true);
            return expect(watch.opened[0][0]).toBe('/blog/hello/?cms-edit');
        } finally {
            watch.restore();
        }
    });

    it('names the entry and links back to its collection', async function() {
        const {shadow} = await open();
        expect(shadow.querySelector('.ct-cms__heading').textContent).toBe('hello');
        return expect(shadow.querySelector('.ct-cms__entry-back').getAttribute('href'))
            .toBe('#/c/blog');
    });

    // --- saving -----------------------------------------------------------

    it('says nothing was saved rather than opening an empty pull request',
       async function() {
        /* An author who opens an entry, changes their mind and presses
           save should not produce a pull request for somebody to review.
           It is also not a failure, so it must not be in the red panel:
           answering an ordinary press in red is how people learn to read
           past the red panel. */
        const {el, fake} = await open();
        await submit(el);

        expect(fake.pulls()).toEqual([]);
        expect(fake.branches()).toEqual(['main']);
        expect(alertText(el)).toContain('Nothing to save');
        const notice = el.shadowRoot.querySelector('.ct-cms__alert--notice');
        return expect(notice).not.toBe(null);
    });

    it('turns one edited field into one branch, one pull request and '
       + 'a one-line diff', async function() {
        const {el, fake} = await open();
        setField(el, 'title', 'Goodbye');
        await submit(el);

        expect(fake.branches()).toEqual(['cms/blog/hello', 'main']);
        expect(fake.pulls().length).toBe(1);
        expect(fake.history(BRANCH).length).toBe(2);

        /* The assertion the whole project rests on. A serializer that
           renormalised the file would produce a diff covering all of it,
           and a diff covering all of it cannot be reviewed -- which is
           the point of routing every change through a pull request. */
        const saved = fake.read(ENTRY, BRANCH);
        expect(addedLines(SEED, saved)).toEqual(['title: Goodbye']);
        /* And the BODY is byte-identical, which is the stronger claim
           and the reason `updateFrontmatter` exists: this screen never
           reads the body, so the file it writes must be the file it
           read with one block swapped -- not the result of taking the
           body apart and putting it back. */
        expect(bodyOf(saved)).toBe(bodyOf(SEED));

        /* And it SAYS so, naming the commit. Without the receipt a save
           that committed and a save that did nothing look identical --
           which is the difference between walking away and pressing the
           button again. */
        const head = fake.history(BRANCH)[0].sha;
        return expect(el.shadowRoot.querySelector('.ct-cms__entry-view .ct-cms__note')
                          .textContent).toBe(`Saved as ${head.slice(0, 7)}.`);
    });

    it('says nothing was saved when the pull request already holds this',
       async function() {
        /* The SECOND way the repository reports an unchanged save: with
           a pull request open it returns `changed: false` instead of
           throwing `NothingToSaveError`, which is a distinction about
           branch bookkeeping and nothing at all to the person who
           pressed the button. Both have to read the same, and only this
           one reaches the `result.changed` line. */
        const {el, shadow} = await open();
        setField(el, 'title', 'Goodbye');
        await submit(el);

        // Pressed again with nothing touched in between.
        await submit(el);

        expect(alertText(el)).toContain('Nothing to save.');
        /* And as a NOTICE, not a failure. An ordinary answer to an
           ordinary press, shown in the same red panel as a refused
           token, is how people learn to read past the red panel. */
        return expect(shadow.querySelector('.ct-cms__alert--notice')).not.toBe(null);
    });

    it('still produces a one-line diff on the SECOND save', async function() {
        /* The open `MarkdownDocument` is never re-parsed after a save.
           Re-parsing the string just written renumbers the blocks while
           the live DOM still carries the old `data-ct-md` indices -- and
           although THIS screen never splices a body, the document it
           holds is the same one the in-page surface would, so the rule
           is the same rule and it is asserted where a save happens. */
        const {el, fake} = await open();
        setField(el, 'title', 'Goodbye');
        await submit(el);
        setField(el, 'title', 'Farewell');
        await submit(el);

        const saved = fake.read(ENTRY, BRANCH);
        expect(addedLines(SEED, saved)).toEqual(['title: Farewell']);
        expect(bodyOf(saved)).toBe(bodyOf(SEED));
        expect(fake.history(BRANCH).length).toBe(3);
        // Still one pull request: a second save adds a commit to the
        // branch rather than opening a second review of the same entry.
        return expect(fake.pulls().length).toBe(1);
    });

    it('shows the pull request once there is one', async function() {
        const {el, shadow} = await open();
        expect(shadow.querySelector('.ct-cms__entry-pull').hidden).toBe(true);

        setField(el, 'title', 'Goodbye');
        await submit(el);

        const link = shadow.querySelector('.ct-cms__entry-pull');
        expect(link.hidden).toBe(false);
        expect(link.textContent).toBe('Pull request #1');
        expect(link.getAttribute('href')).toContain('/pull/1');
        // Labelled `cms/draft` at creation, so the badge says so rather
        // than leaving the entry in a state the shell cannot name.
        return expect(shadow.querySelector('.ct-cms__entry-view .ct-cms__badge')
                          .textContent).toBe('Draft');
    });

    it('reads the version under review, not the one on the base branch',
       async function() {
        /* Opening the base copy of an entry that already has a pull
           request open would show the author a version without their own
           unmerged work, and the next save would commit that over the
           top: a silent revert of everything in the review. */
        const fake = fakeWith();
        fake.openPull('blog', 'hello', ['cms/in-review']);
        fake.pushOther(BRANCH, {[ENTRY]: SEED.replace('World.', 'Reviewed.')});

        const {el, fake: theirs} = await open({fake});
        /* Read off the SAVE rather than off a rendered body: this screen
           shows no body, so the only place the version it is holding is
           visible is the file a save would write. Nothing was typed, so
           what goes up is the bytes that came down. */
        setField(el, 'title', 'Goodbye');
        await submit(el);

        const saved = theirs.read(ENTRY, BRANCH);
        expect(saved).toContain('Reviewed.');
        return expect(saved).not.toContain('World.');
    });

    // --- conflict ---------------------------------------------------------

    it('keeps the unwritten markdown when somebody else got there first',
       async function() {
        const {el, fake, shadow} = await open();
        setField(el, 'title', 'Goodbye');
        await submit(el);

        // A reviewer pushes to the entry's branch while it is open here.
        fake.pushOther(BRANCH, {[ENTRY]: SEED.replace('World.', 'Theirs.')});
        setField(el, 'title', 'Mine');
        await submit(el);

        expect(alertText(el)).toContain('Somebody else changed this entry');
        const pane = shadow.querySelector('.ct-cms__conflict');
        expect(pane.hidden).toBe(false);
        /* The text is the whole point of the panel: the only way
           forward throws the work away, and offering that without first
           showing what was written is data loss with a button on it. */
        expect(shadow.querySelector('.ct-cms__conflict-text').value)
            .toContain('title: Mine');
        // And nothing of theirs was lost.
        return expect(fake.read(ENTRY, BRANCH)).toContain('Theirs.');
    });

    it('reloads the entry from the conflict panel', async function() {
        const {el, fake, shadow} = await open();
        setField(el, 'title', 'Goodbye');
        await submit(el);
        fake.pushOther(BRANCH, {[ENTRY]: SEED.replace('title: Hello', 'title: Theirs')});
        setField(el, 'title', 'Mine');
        await submit(el);

        shadow.querySelector('.ct-cms__conflict .ct-cms__button--cancel').click();
        await until(() => fieldOf(el, 'title')?.value === 'Theirs',
                    'the reviewer\u2019s version to come back');
        return expect(shadow.querySelector('.ct-cms__conflict').hidden).toBe(true);
    });

    // --- the lease this screen must never take ----------------------------

    it('claims no editor lease across an entry-to-entry move', async function() {
        /* The lease belongs to the in-page surface, and it is
           process-wide: one claimed here is one the site's own page
           cannot have, and the symptom there is an editor that refuses
           to boot with nothing in any stack trace. Asserted across a
           move because that is where a shell that DID mount one would
           have had to hand it over. */
        const {el} = await open({
            fake: fakeWith({
                [ENTRY]: SEED,
                'content/blog/other.md': '---\ntitle: Other\n---\n\nText.\n'
            })
        });
        expect(ContentTools.EditorApp.current()).toBe(null);

        location.hash = '#/c/blog/e/other';
        await until(() => fieldOf(el, 'title')?.value === 'Other', 'the second entry');
        expect(el.childNodes.length).toBe(0);
        return expect(ContentTools.EditorApp.current()).toBe(null);
    });

    it('survives being moved to another parent, unsaved work and all',
       async function() {
        /* A DOM move fires `disconnectedCallback` and then
           `connectedCallback`, synchronously, and a shell that took that
           as a removal would close the open entry -- throwing away
           whatever had been typed into the form every time a framework
           reparented it. The shell's job here is to do nothing, and this
           is what says so. */
        const {el} = await open();
        setField(el, 'title', 'Goodbye');

        const host = document.createElement('div');
        document.body.appendChild(host);
        try {
            host.appendChild(el);

            expect(entryOf(el)).not.toBe(null);
            /* The same control, not a rebuilt one holding the same
               string: a form rebuilt under whoever is typing loses the
               caret even when it keeps the text. */
            return expect(fieldOf(el, 'title').value).toBe('Goodbye');
        } finally {
            document.body.appendChild(el);
            host.remove();
        }
    });

    // --- leaving with unsaved work ----------------------------------------

    it('holds a navigation that would lose work, and puts the hash back',
       async function() {
        const {el, shadow} = await open();
        setField(el, 'title', 'Goodbye');

        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden,
                    'the leave panel');

        /* The address bar too. A hashchange cannot be cancelled -- by the
           time it fires the bar has already moved -- so leaving it would
           put the shell and the URL out of step, and a reload would land
           somewhere the person never got to. */
        expect(location.hash).toBe('#/c/blog/e/hello');
        return expect(entryOf(el)).not.toBe(null);
    });

    it('does not hold a navigation when nothing was changed', async function() {
        /* The predicate is the SERIALIZED MARKDOWN, not the form's own
           idea of having been typed into: somebody who clears a field
           and types it back has touched the form without changing the
           file, and a panel that appears every time is a panel people
           click through without reading. */
        const {el, shadow} = await open();
        location.hash = '#/c/blog';
        await until(() => entryOf(el) === null, 'the entry to close');

        /* Nothing held it: the address bar was left where the click put
           it, and the entry view -- panel and all -- is gone from the
           pane rather than merely hidden inside it. */
        expect(location.hash).toBe('#/c/blog');
        return expect(shadow.querySelector('.ct-cms__entry-view')).toBe(null);
    });

    it('stays put when asked to', async function() {
        const {el, shadow} = await open();
        setField(el, 'title', 'Goodbye');
        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');

        shadow.querySelectorAll('.ct-cms__leave .ct-cms__button')[0].click();
        expect(shadow.querySelector('.ct-cms__leave').hidden).toBe(true);
        expect(entryOf(el)).not.toBe(null);
        return expect(location.hash).toBe('#/c/blog/e/hello');
    });

    it('keeps the form\u2019s own nodes across a render', async function() {
        /* Why the frame and this view are built ONCE and updated in
           place, rather than rebuilt per render. It used to be an
           invariant about `<slot name="editor">` -- an editor slotted
           into a slot a re-render replaced is invisible, still
           connected, and still holding the one-per-page lease -- and
           that hazard left with the editor in M6-3. What is left is the
           ordinary one, and on this screen it is the only one: the
           frontmatter form is the whole of what `/admin` can change, so
           a rebuild under whoever is typing eats their keystrokes and
           their caret with them.

           Driven through the leave panel because it is the one render
           this screen performs WITHOUT closing the entry -- a save
           renders too, but it also finishes, and a node that survived
           because nothing re-rendered proves nothing. Identity, not
           value: a rebuilt control holding the same string reads
           identically and has lost the caret. */
        const {el, shadow} = await open();
        const before = setField(el, 'title', 'Goodbye');

        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');
        shadow.querySelectorAll('.ct-cms__leave .ct-cms__button')[0].click();

        expect(fieldOf(el, 'title')).toBe(before);
        return expect(fieldOf(el, 'title').value).toBe('Goodbye');
    });

    it('still saves the work after a leave was checked and abandoned',
       async function() {
        /* Two reads of what a save would write, in one edit. They have
           to agree, which is why `_dirty` and `_submit` share one
           `pending()`: two spellings disagree by holding a navigation
           over work the save then reports as nothing, or by letting one
           go that the save would have written. */
        const {el, shadow, fake} = await open();
        setField(el, 'title', 'Goodbye');

        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');
        shadow.querySelectorAll('.ct-cms__leave .ct-cms__button')[0].click();

        await submit(el);
        return expect(addedLines(SEED, fake.read(ENTRY, BRANCH)))
            .toEqual(['title: Goodbye']);
    });

    it('leaves, and moves the address bar with it, when told to discard',
       async function() {
        const {el, shadow} = await open();
        setField(el, 'title', 'Goodbye');
        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');

        shadow.querySelector('.ct-cms__leave .ct-cms__button--cancel').click();
        await until(() => entryOf(el) === null, 'the entry to close');

        expect(location.hash).toBe('#/c/blog');
        /* And the collection it went to actually loaded, rather than the
           discard leaving the shell on a route it never fetched. */
        return until(() => el.shadowRoot.querySelectorAll('.ct-cms__entry-link').length > 0,
                     'the collection listing');
    });

    it('arms the browser prompt only while there is work to lose',
       async function() {
        /* The one exit the shell cannot render over. Same predicate as
           the panel, deliberately: two guards that disagree is worse
           than one, because the panel would hold a navigation the
           browser then let through without a word. */
        const {el} = await open();
        const ask = () => {
            const ev = new Event('beforeunload', {cancelable: true});
            window.dispatchEvent(ev);
            return ev.defaultPrevented;
        };
        expect(ask()).toBe(false);
        setField(el, 'title', 'Goodbye');
        expect(ask()).toBe(true);

        // And it goes quiet again once the work is committed.
        await submit(el);
        return expect(ask()).toBe(false);
    });

    it('stops asking once the shell is removed from the page', async function() {
        /* A listener on `window` outlives its element. Left behind, a
           torn-down shell keeps blocking the tab from closing over an
           entry nobody can see. */
        const {el} = await open();
        setField(el, 'title', 'Goodbye');
        el.remove();
        mounted = null;

        const ev = new Event('beforeunload', {cancelable: true});
        window.dispatchEvent(ev);
        return expect(ev.defaultPrevented).toBe(false);
    });

    it('asks again the second time, rather than going deaf', async function() {
        /* `_restoring` is armed so that the hashchange the RESTORATION
           itself causes is ignored, and it has to be disarmed by that
           event. Left set, the next real navigation is swallowed
           instead: the shell stops responding to its own links, once,
           with nothing to see. */
        const {el, shadow} = await open();
        setField(el, 'title', 'Goodbye');

        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');
        shadow.querySelectorAll('.ct-cms__leave .ct-cms__button')[0].click();
        expect(shadow.querySelector('.ct-cms__leave').hidden).toBe(true);

        location.hash = '#/c/pages';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden,
                    'the panel a second time');
        return expect(location.hash).toBe('#/c/blog/e/hello');
    });

    it('still answers its links after discarding to where it already was',
       async function() {
        /* `#/c/blog/e/hello/` is the SAME page to `parseRoute`, so this
           hold is answered by a discard that navigates to the route the
           shell is already on -- and `_restoreHash` then finds the
           address bar already correct. Assigning a hash that is already
           set fires no event, so arming `_restoring` for an event that
           never comes leaves it armed, and the NEXT navigation is
           swallowed. The equality guard is what stops that, and this is
           the only path that reaches it. */
        const {el, shadow} = await open();
        setField(el, 'title', 'Goodbye');

        location.hash = '#/c/blog/e/hello/';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');
        expect(location.hash).toBe('#/c/blog/e/hello');

        shadow.querySelectorAll('.ct-cms__leave .ct-cms__button')[1].click();
        await until(() => fieldOf(el, 'title')?.value === 'Hello',
                    'the entry to reload');

        // Now a real navigation, which must not be eaten.
        location.hash = '#/c/blog';
        return until(() => entryOf(el) === null, 'the shell to leave the entry');
    });

    it('takes the leave panel down when the conflict panel reloads the entry',
       async function() {
        /* Both panels can be up at once: a save conflicts, and then the
           person tries to navigate away with the unwritten work still
           in the editor. Reloading from the conflict panel goes
           straight to `_navigate`, never through the hash, so nothing
           else clears the held navigation -- and it would sit there
           over a freshly reloaded entry, offering to discard work that
           no longer exists. */
        const {el, fake, shadow} = await open();
        setField(el, 'title', 'Goodbye');
        await submit(el);
        fake.pushOther(BRANCH, {[ENTRY]: SEED.replace('title: Hello', 'title: Theirs')});
        setField(el, 'title', 'Mine');
        await submit(el);
        expect(shadow.querySelector('.ct-cms__conflict').hidden).toBe(false);

        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');

        shadow.querySelector('.ct-cms__conflict .ct-cms__button--cancel').click();
        await until(() => fieldOf(el, 'title')?.value === 'Theirs',
                    'the entry to come back');
        return expect(shadow.querySelector('.ct-cms__leave').hidden).toBe(true);
    });

    it('returns to the gate when the token is revoked mid-save',
       async function() {
        /* A save is as able to provoke a 401 as any other request, and
           the token is dropped by `_guard` rather than by the submit --
           so the submit has to RE-THROW what it cannot handle. Swallow
           it and the revoked token stays in place, every later save
           fails the same way, and there is no way back to the field
           that would fix it. */
        const fake = fakeWith();
        let revoked = false;
        const real = shellFetch(fake);
        const {el} = await open({
            fake,
            fetch: async (input, init) => {
                /* Only writes, and only once the entry is open -- the
                   sign-in check and the read have to succeed or the
                   test never reaches a save. */
                if (revoked && init?.method && init.method !== 'GET') {
                    return new Response(JSON.stringify({message: 'Bad credentials'}),
                                        {status: 401});
                }
                return real(input, init);
            }
        });
        setField(el, 'title', 'Goodbye');
        revoked = true;

        el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
        await until(() => el.getAttribute('state') === 'signed-out', 'the gate');

        expect(alertText(el)).toContain('GitHub rejected that token');
        /* And the open entry went with the token. Every question this
           screen can ask about an entry needs the token being given up,
           so one left open is a heading and a form over a file nothing
           can read, save or delete. */
        return expect(entryOf(el)).toBe(null);
    });


    // --- the frontmatter form ---------------------------------------------

    describe('the frontmatter form', function() {

        /** A config whose `blog` collection declares exactly `fields`. */
        function configWith(fields) {
            return CONFIG_YAML_TEXT.replace(
                /    fields:\n(?:      - .*\n)+/,
                `    fields:\n${fields.map(line => `      - ${line}\n`).join('')}`);
        }

        /** Open `hello` against a seed and, optionally, a different config. */
        async function openWith(seed, fields) {
            const files = fields
                ? {[CONFIG_URL]: configWith(fields)}
                : undefined;
            return open({fake: fakeWith({[ENTRY]: seed}), files});
        }

        /** The control the widget for `name` rendered. */
        function control(el, name) {
            return el.shadowRoot.querySelector(`#ct-field-${name}`);
        }

        it('shows a control per declared field, holding what the file says',
           async function() {
            const {el} = await open();
            expect(control(el, 'title').value).toBe('Hello');
            expect(control(el, 'draft').checked).toBe(false);
            // Declared, absent from the file, and therefore empty.
            return expect(control(el, 'tags').value).toBe('');
        });

        it('leaves the BODY byte-identical when a field is edited',
           async function() {
            /* The mirror of the claim this screen used to make the other
               way round, and the only half of it that survives M6-3.
               `/admin` never reads the body, so the file it writes has to
               be the file it read with the block at the top swapped --
               not the result of taking the body apart and putting it
               back. The seed is deliberately awkward about it: a setext
               heading, a hard-wrapped paragraph and a fenced block are
               each things no HTML round trip returns unchanged.
               (The other half -- frontmatter byte-identical on a save
               that only edited the body -- moved with the body, to
               `test/browser/edit/surface.spec.js`.) */
            const seed = '---\ntitle: Hello\n---\n\n'
                + 'Hello\n=====\n\nA sentence that the author\nwrapped by hand.\n\n'
                + '```js\nconst x = 1;\n```\n';
            const {el, fake} = await openWith(seed);
            setField(el, 'title', 'Goodbye');
            await submit(el);

            const saved = fake.read(ENTRY, BRANCH);
            expect(addedLines(seed, saved)).toEqual(['title: Goodbye']);
            return expect(bodyOf(saved)).toBe(bodyOf(seed));
        });

        it('writes a field that was edited, and only that key', async function() {
            const {el, fake} = await openWith(
                '---\nlayout: post\ntitle: Hello\naliases: ["/old/"]\n---\n\nWorld.\n');
            control(el, 'title').value = 'Edited';
            await submit(el);

            const saved = fake.read(ENTRY, BRANCH);
            /* The keys the config never declared are the assertion. A
               merge that started from the form would delete `layout` and
               `aliases`, and the page would stop rendering days later
               with nothing connecting it to a title change. */
            expect(saved).toContain('layout: post');
            expect(saved).toContain('aliases:');
            expect(saved).toContain('/old/');
            expect(saved).toContain('title: Edited');
            return expect(saved).toContain('World.');
        });

        it('treats a field edit ALONE as work worth committing', async function() {
            /* The body is untouched, so an HTML-only dirty check would
               report nothing to save and the button would do nothing at
               all -- the worst available shape, because it looks like
               the click was missed. */
            const {el, fake} = await openWith('---\ntitle: Hello\n---\n\nWorld.\n');
            control(el, 'title').value = 'Retitled';
            await submit(el);
            return expect(fake.read(ENTRY, BRANCH)).toContain('title: Retitled');
        });

        it('holds a navigation when only a field has been edited',
           async function() {
            const {el} = await openWith('---\ntitle: Hello\n---\n\nWorld.\n');
            control(el, 'title').value = 'Retitled';
            location.hash = '#/c/blog';
            await until(() => el.shadowRoot.querySelector('.ct-cms__leave') !== null
                && !el.shadowRoot.querySelector('.ct-cms__leave').hidden,
                        'the leave panel');
            // And the entry is still open behind it, edit intact.
            expect(entryOf(el)).not.toBe(null);
            return expect(control(el, 'title').value).toBe('Retitled');
        });

        it('adds frontmatter to a file that never had any', async function() {
            /* This used to throw a TypeError from inside the save --
               `gapAfterFrontmatter` read `.end` off a null frontmatter
               through a cast. The first time anybody filled a field in
               on a legacy `.md`, with their work in the editor and a
               message about an undefined property on screen. */
            const {el, fake} = await openWith('# Hello\n\nWorld.\n');
            control(el, 'title').value = 'Now titled';
            await submit(el);

            const saved = fake.read(ENTRY, BRANCH);
            expect(saved.startsWith('---\ntitle: Now titled\n---\n\n')).toBe(true);
            return expect(saved).toContain('World.');
        });

        it('does not add an empty block to a file that had none', async function() {
            /* Nothing was filled in, so nothing about the file's
               frontmatter has changed -- including that it has none. A
               form reporting its empty controls as answers would open a
               pull request adding `---\n---` to a file nobody typed
               into, which is the whole of what the diff would say. */
            const {el, fake} = await openWith('# Hello\n\nWorld.\n');
            el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
            await until(() => alertText(el) !== '', 'the notice');

            expect(alertText(el)).toContain('Nothing to save');
            return expect(fake.branches()).toEqual(['main']);
        });

        it('refuses to edit a block the parser could not read', async function() {
            /* Writing a merge over frontmatter nobody has read replaces
               a broken-but-recoverable block with whatever the form
               happened to hold -- which for an unparseable block is
               every key gone. */
            const broken = '---\ntitle: "unterminated\n  - nope\n---\n\nWorld.\n';
            const {el, fake} = await openWith(broken);
            expect(control(el, 'title')).toBe(null);
            expect(el.shadowRoot.querySelector('.ct-fields').textContent)
                .toContain('could not be read');

            /* And there is no way to write over it from here. With no
               form to answer, the only edit this screen can make is one
               it has refused to offer -- so a save has nothing to change
               and says so, rather than committing the merge of an empty
               form over a block nobody read. */
            el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
            await until(() => alertText(el) !== '', 'the notice');

            expect(alertText(el)).toContain('Nothing to save');
            return expect(fake.branches()).toEqual(['main']);
        });

        it('refuses to edit frontmatter that is not a set of keys',
           async function() {
            // `---\n- one\n- two\n---` parses fine and is a list.
            const {el} = await openWith('---\n- one\n- two\n---\n\nWorld.\n');
            expect(control(el, 'title')).toBe(null);
            return expect(el.shadowRoot.querySelector('.ct-fields').textContent)
                .toContain('not a set of keys');
        });

        it('shows no form for a collection that declares no fields',
           async function() {
            // The panel is hidden rather than rendering a "Details"
            // heading over nothing.
            const {el} = await openWith(SEED, []);
            expect(el.shadowRoot.querySelector('.ct-fields').hidden).toBe(true);
            return expect(control(el, 'title')).toBe(null);
        });

        it('takes a file collection\u2019s fields from the FILE', async function() {
            /* A file collection declares its fields per entry, so the
               fields for `about` are not the collection's. Resolving
               them anywhere but beside `entryPath` is how two places
               come to disagree about which file an entry is. */
            const {el} = await openAt('#/c/pages/e/about', {
                fake: createFakeGitHub({
                    files: {'content/about.md': '---\nheading: Us\n---\n\n# About\n'}
                })
            });
            mounted = {el};
            await openedEntry(el);
            expect(control(el, 'heading').value).toBe('Us');
            // And `blog`'s fields are not on it.
            return expect(control(el, 'tags')).toBe(null);
        });

        // --- refusing a save -------------------------------------------------

        it('refuses to save while a required field is empty', async function() {
            /* A file the site cannot render, and the person who finds
               out is a reader. Checked before anything is computed,
               because `validate()` is also what marks each field -- so
               refusing afterwards would mark them and commit anyway. */
            const {el, fake} = await openWith(
                '---\ntitle: Hello\n---\n\n# Hello\n\nWorld.\n',
                ['{name: title, required: true}']);
            control(el, 'title').value = '';
            el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
            await until(() => alertText(el) !== '', 'the refusal');

            expect(alertText(el)).toContain('One field needs filling in');
            expect(alertText(el)).toContain('title is required.');
            // The message is also under the field it belongs to.
            expect(el.shadowRoot.querySelector('.ct-field__error').hidden)
                .toBe(false);
            // And nothing was written.
            return expect(fake.history(BRANCH).length).toBe(0);
        });

        it('counts the fields when more than one is empty', async function() {
            const {el} = await openWith('---\ntitle: Hello\n---\n\nWorld.\n', [
                '{name: title, required: true}',
                '{name: summary, required: true}'
            ]);
            control(el, 'title').value = '';
            el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
            await until(() => alertText(el) !== '', 'the refusal');
            return expect(alertText(el)).toContain('2 fields need filling in');
        });

        it('saves once the required field is filled in', async function() {
            const {el, fake} = await openWith('---\ntitle: Hello\n---\n\nWorld.\n',
                                              ['{name: title, required: true}']);
            control(el, 'title').value = '';
            el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
            await until(() => alertText(el) !== '', 'the refusal');

            control(el, 'title').value = 'Filled';
            await submit(el);
            return expect(fake.read(ENTRY, BRANCH)).toContain('title: Filled');
        });

        // --- the form's own lifetime -------------------------------------------

        it('keeps the controls across a save', async function() {
            /* A save replaces the `Entry` object with a copy pinned to
               the new commit. Keying the form on it would rebuild every
               control under whoever was typing, on every Submit. */
            const {el} = await openWith(
                '---\ntitle: Hello\n---\n\n# Hello\n\nWorld.\n');
            const before = control(el, 'title');
            control(el, 'title').value = 'Goodbye';
            await submit(el);
            return expect(control(el, 'title')).toBe(before);
        });

        it('rebuilds the controls for a different entry', async function() {
            const {el} = await open({
                fake: fakeWith({
                    [ENTRY]: SEED,
                    'content/blog/other.md': '---\ntitle: Other\n---\n\nText.\n'
                })
            });
            expect(control(el, 'title').value).toBe('Hello');
            location.hash = '#/c/blog/e/other';
            await until(() => control(el, 'title')?.value === 'Other',
                        'the other entry’s form');
            return expect(control(el, 'title').value).toBe('Other');
        });

        it('does not leave the last entry\u2019s form up while the next loads',
           async function() {
            /* The read is a round trip, and for its whole length the
               route already says `other`. A form still holding
               `hello`'s answers there is not merely stale: press
               Submit while it is up and those answers are merged into
               the file that is arriving. */
            const fake = fakeWith({
                [ENTRY]: SEED,
                'content/blog/other.md': '---\ntitle: Other\n---\n\n# Other\n\nText.\n'
            });
            const gate = {hold: false, release: null};
            const inner = fake.fetch;
            const {el} = await openAt('#/c/blog/e/hello', {
                fake,
                fetch: async (input, init) => {
                    const url = typeof input === 'string' ? input : String(input.url ?? input);
                    if (url === CONFIG_URL) {
                        return new Response(CONFIG_YAML_TEXT, {status: 200});
                    }
                    if (gate.hold && url.includes('other.md')) {
                        await new Promise(resolve => {
                            gate.release = resolve;
                        });
                    }
                    return inner(input, init);
                }
            });
            mounted = {el};
            await openedEntry(el, 'the first entry');
            expect(control(el, 'title').value).toBe('Hello');

            gate.hold = true;
            location.hash = '#/c/blog/e/other';
            await until(() => gate.release !== null, 'the read to be in flight');
            expect(control(el, 'title')).toBe(null);

            gate.release();
            return until(() => control(el, 'title')?.value === 'Other',
                         'the second entry\u2019s form');
        });

        // --- what a site can change ----------------------------------------------

        it('lets a site add a widget without losing the shipped ones',
           async function() {
            const {el} = await openWith('---\ntitle: Hello\n---\n\nWorld.\n',
                                        ['{name: title, widget: colour}']);
            el.widgets = {
                colour: (doc, field, value) => {
                    const node = doc.createElement('div');
                    node.className = 'site-colour';
                    return {node, value: () => value, validate: () => null};
                }
            };
            // Set after boot, which is when a host page has the element
            // to set it on -- so the frame reads the registry late.
            location.hash = '#/c/blog';
            await until(() => entryOf(el) === null, 'the listing');
            location.hash = '#/c/blog/e/hello';
            await until(() => el.shadowRoot.querySelector('.site-colour') !== null,
                        'the site’s own widget');
            // And `string`, which the site did not mention, still works.
            expect(typeof el.widgets.string).toBe('function');
            return expect(el.widgets.colour).not.toBe(undefined);
        });

        it('leaves a field alone when its widget is not one we have',
           async function() {
            /* `widget: strng` is a config somebody will ship. The key
               passes through untouched rather than being flattened to
               whatever a text box would hold. */
            const {el, fake} = await openWith(
                '---\ntitle: Hello\nmeta: {a: 1}\n---\n\n# Hello\n\nWorld.\n',
                ['{name: title}', '{name: meta, widget: strng}']);
            expect(control(el, 'meta').readOnly).toBe(true);
            control(el, 'title').value = 'Edited';
            await submit(el);

            const saved = fake.read(ENTRY, BRANCH);
            expect(saved).toContain('title: Edited');
            /* And `meta` kept its VALUE. A fallback to `string` would
               have written back whatever a text box holds -- the string
               `[object Object]` -- over a mapping the site's templates
               read. */
            expect(saved).toContain('a: 1');
            return expect(saved).not.toContain('[object Object]');
        });
    });

    // --- ordering ---------------------------------------------------------

    it('does not let a slow entry render over a newer route', async function() {
        const fake = fakeWith({[ENTRY]: SEED, 'content/blog/other.md': '# Other\n'});
        const gate = {hold: false, release: null};
        const inner = fake.fetch;
        const held = async (input, init) => {
            const url = typeof input === 'string' ? input : String(input.url ?? input);
            if (gate.hold && url.includes('hello.md')) {
                await new Promise(resolve => {
                    gate.release = resolve;
                });
            }
            return inner(input, init);
        };

        const {el} = await openAt('#/c/blog/e/other', {
            fake, fetch: (input, init) => {
                const url = typeof input === 'string' ? input : String(input.url ?? input);
                return url === CONFIG_URL
                    ? new Response(CONFIG_YAML_TEXT, {status: 200})
                    : held(input, init);
            }
        });
        mounted = {el};
        await openedEntry(el, 'the first entry');

        gate.hold = true;
        location.hash = '#/c/blog/e/hello';
        await until(() => gate.release !== null, 'the read to be in flight');

        location.hash = '#/c/blog';
        await until(() => entryOf(el) === null, 'the listing');
        gate.release();

        /* The late answer must not put an entry back on a page that has
           moved on. Silently: an entry's chrome over a listing, and a
           save that writes the wrong file. */
        await new Promise(resolve => setTimeout(resolve, 20));
        return expect(entryOf(el)).toBe(null);
    });
});

/* Imported for the stale-response test's own fetch, which cannot use
   `shellFetch` because it has to wrap the fake rather than fall through
   to it. */
import {CONFIG_YAML as CONFIG_YAML_TEXT} from './helpers.js';
