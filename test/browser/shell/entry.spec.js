import {
    alertText, createFakeGitHub, editorOf, forgetToken, openAt, retype, shellFetch,
    signIn, until, CONFIG_URL
} from './helpers.js';

/* Opening an entry, editing it, and turning that into a pull request.
 *
 * This is the sub-phase where the three finished layers finally meet, so
 * most of what is asserted here is a JOIN going wrong rather than any one
 * layer being wrong -- and a join goes wrong quietly. An editor with no
 * `slot` attribute is connected, functional and invisible. An editor left
 * behind on sign-out holds the one-per-page lease for the rest of the
 * session. A document re-parsed after a save renumbers its blocks while
 * the live DOM still carries the old indices, and the NEXT save splices
 * the wrong originals -- corruption inside a diff that reads perfectly.
 */

const SEED = '---\ntitle: Hello\ndraft: false\n---\n\n# Hello\n\nWorld.\n';
const ENTRY = 'content/blog/hello.md';
const BRANCH = 'cms/blog/hello';

function fakeWith(files = {[ENTRY]: SEED}) {
    return createFakeGitHub({files});
}

/** Open `#/c/blog/e/hello` and wait for the editor to be editing. */
async function openHello(options = {}) {
    const mounted = await openAt(
        '#/c/blog/e/hello', {fake: options.fake ?? fakeWith(), ...options});
    await until(() => editorOf(mounted.el)?.state === 'editing', 'the editor to start');
    return mounted;
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

describe('the entry editor', function() {

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

    // --- where the editor goes -------------------------------------------

    it('puts the editor in the shell LIGHT DOM, slotted', async function() {
        /* Mode A one level up, and the only arrangement that works. In
           the shell's shadow root `document.getSelection()` retargets in
           Chromium and WebKit, so the editor's own selection chain hands
           back a range pointing at the shell host -- a caret in the
           wrong place with nothing thrown. `selection.spec.js` asserts
           the consequence; this asserts the arrangement. */
        const {el, shadow} = await open();
        const editor = editorOf(el);
        expect(editor.parentNode).toBe(el);
        expect(shadow.contains(editor)).toBe(false);

        /* And it is ASSIGNED. The frame's only slot is a named one, so
           an editor without this attribute renders nowhere while being
           perfectly connected -- and holding the lease. */
        expect(editor.getAttribute('slot')).toBe('editor');
        return expect(editor.assignedSlot)
            .toBe(shadow.querySelector('slot[name="editor"]'));
    });

    it('opens in markdown mode, holding the body as HTML', async function() {
        const {el} = await open();
        const editor = editorOf(el);
        expect(editor.mode).toBe('markdown');
        const region = editor.querySelector('[data-editable][data-name="body"]');
        expect(region.querySelector('h1').textContent).toBe('Hello');
        // The frontmatter is NOT in the region: a YAML block edited as
        // prose is a YAML block somebody will break.
        return expect(region.textContent).not.toContain('title:');
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

    it('turns one edited paragraph into one branch, one pull request and '
       + 'a one-line diff', async function() {
        const {el, fake} = await open();
        retype(el, 'Goodbye.');
        await submit(el);

        expect(fake.branches()).toEqual(['cms/blog/hello', 'main']);
        expect(fake.pulls().length).toBe(1);
        expect(fake.history(BRANCH).length).toBe(2);

        /* The assertion the whole project rests on. A serializer that
           renormalised the file would produce a diff covering all of it,
           and a diff covering all of it cannot be reviewed -- which is
           the point of routing every change through a pull request. */
        const saved = fake.read(ENTRY, BRANCH);
        expect(addedLines(SEED, saved)).toEqual(['Goodbye.']);
        expect(saved.startsWith('---\ntitle: Hello\ndraft: false\n---\n')).toBe(true);

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
        retype(el, 'Goodbye.');
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
           the live DOM still carries the old `data-ct-md` indices, so
           this second save would splice against the wrong originals --
           content corruption inside a diff that looks reviewable. */
        const {el, fake} = await open();
        retype(el, 'Goodbye.');
        await submit(el);
        retype(el, 'Farewell.');
        await submit(el);

        const saved = fake.read(ENTRY, BRANCH);
        expect(addedLines(SEED, saved)).toEqual(['Farewell.']);
        expect(fake.history(BRANCH).length).toBe(3);
        // Still one pull request: a second save adds a commit to the
        // branch rather than opening a second review of the same entry.
        return expect(fake.pulls().length).toBe(1);
    });

    it('shows the pull request once there is one', async function() {
        const {el, shadow} = await open();
        expect(shadow.querySelector('.ct-cms__entry-pull').hidden).toBe(true);

        retype(el, 'Goodbye.');
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

        const {el} = await open({fake});
        const region = editorOf(el).querySelector('[data-editable]');
        expect(region.textContent).toContain('Reviewed.');
        return expect(region.textContent).not.toContain('World.');
    });

    // --- conflict ---------------------------------------------------------

    it('keeps the unwritten markdown when somebody else got there first',
       async function() {
        const {el, fake, shadow} = await open();
        retype(el, 'Goodbye.');
        await submit(el);

        // A reviewer pushes to the entry's branch while the editor is open.
        fake.pushOther(BRANCH, {[ENTRY]: SEED.replace('World.', 'Theirs.')});
        retype(el, 'Mine.');
        await submit(el);

        expect(alertText(el)).toContain('Somebody else changed this entry');
        const pane = shadow.querySelector('.ct-cms__conflict');
        expect(pane.hidden).toBe(false);
        /* The text is the whole point of the panel: the only way
           forward throws the work away, and offering that without first
           showing what was written is data loss with a button on it. */
        expect(shadow.querySelector('.ct-cms__conflict-text').value).toContain('Mine.');
        // And nothing of theirs was lost.
        return expect(fake.read(ENTRY, BRANCH)).toContain('Theirs.');
    });

    it('reloads the entry from the conflict panel', async function() {
        const {el, fake, shadow} = await open();
        retype(el, 'Goodbye.');
        await submit(el);
        fake.pushOther(BRANCH, {[ENTRY]: SEED.replace('World.', 'Theirs.')});
        retype(el, 'Mine.');
        await submit(el);

        shadow.querySelector('.ct-cms__conflict .ct-cms__button--cancel').click();
        await until(() => editorOf(el)?.state === 'editing', 'the editor to come back');

        expect(editorOf(el).querySelector('[data-editable]').textContent)
            .toContain('Theirs.');
        return expect(shadow.querySelector('.ct-cms__conflict').hidden).toBe(true);
    });

    // --- the lease --------------------------------------------------------

    it('frees the editor lease when the entry is left', async function() {
        /* The failure this names has no symptom at the time: an editor
           that is still connected holds the process-wide `EditorApp`,
           and the NEXT entry opened refuses to boot with nothing in any
           stack trace. */
        const {el} = await open();
        expect(ContentTools.EditorApp.current()).not.toBe(null);

        location.hash = '#/c/blog';
        await until(() => editorOf(el) === null, 'the editor to be removed');
        return expect(ContentTools.EditorApp.current()).toBe(null);
    });

    it('frees it on sign-out too, where the frame is only hidden',
       async function() {
        /* Sign-out hides the frame rather than detaching it, so an
           editor left behind is invisible AND connected -- the worst
           version of the same bug, because the person cannot even see
           what is holding it. */
        const {el} = await open();
        el.shadowRoot.querySelector('.ct-cms__button--muted').click();
        await until(() => el.getAttribute('state') === 'signed-out', 'the gate');

        expect(editorOf(el)).toBe(null);
        return expect(ContentTools.EditorApp.current()).toBe(null);
    });

    it('holds exactly one editor across an entry-to-entry move',
       async function() {
        const {el} = await open({
            fake: fakeWith({[ENTRY]: SEED, 'content/blog/other.md': '# Other\n'})
        });
        location.hash = '#/c/blog/e/other';
        await until(
            () => editorOf(el)?.querySelector('[data-editable]')
                ?.textContent.includes('Other'),
            'the second entry');

        /* One element, and one live app behind it. Two editors is the
           failure the lease exists to make loud; ZERO is the quieter one
           -- an entry that opened into an element whose boot was refused
           because the previous one had not let go. */
        expect(el.querySelectorAll('content-tools-editor').length).toBe(1);
        expect(editorOf(el).state).toBe('editing');
        return expect(ContentTools.EditorApp.current()).not.toBe(null);
    });

    it('survives being moved to another parent, editor and all',
       async function() {
        /* A DOM move fires `disconnectedCallback` and then
           `connectedCallback`, synchronously, and a shell that took that
           as a removal would detach the editor -- destroying the open
           entry and the person's unsaved work every time a framework
           reparented it. The editor's OWN teardown already survives this
           (deferred a microtask, re-checking `isConnected`), so the
           shell's job here is to do nothing. */
        const {el} = await open();
        retype(el, 'Goodbye.');
        const editor = editorOf(el);

        const host = document.createElement('div');
        document.body.appendChild(host);
        try {
            host.appendChild(el);

            expect(editorOf(el)).toBe(editor);
            expect(editor.state).toBe('editing');
            expect(ContentTools.EditorApp.current()).not.toBe(null);
            /* And the edit is still there, which is the thing that was
               actually at stake. */
            return expect(editor.querySelector('[data-editable]').textContent)
                .toContain('Goodbye.');
        } finally {
            document.body.appendChild(el);
            host.remove();
        }
    });

    it('frees the lease when the shell itself is taken off the page',
       async function() {
        /* Not the shell's own doing -- the editor is its child, so the
           DOM disconnects it in the same operation and it releases the
           lease on its way out. Asserted because the arrangement that
           makes it true is exactly what the test above forbids the shell
           from tidying up by hand. */
        const {el} = await open();
        expect(ContentTools.EditorApp.current()).not.toBe(null);

        el.remove();
        mounted = null;
        await until(() => ContentTools.EditorApp.current() === null,
                    'the lease to be released');
        return expect(ContentTools.EditorApp.current()).toBe(null);
    });

    // --- leaving with unsaved work ----------------------------------------

    it('holds a navigation that would lose work, and puts the hash back',
       async function() {
        const {el, shadow} = await open();
        retype(el, 'Goodbye.');

        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden,
                    'the leave panel');

        /* The address bar too. A hashchange cannot be cancelled -- by the
           time it fires the bar has already moved -- so leaving it would
           put the shell and the URL out of step, and a reload would land
           somewhere the person never got to. */
        expect(location.hash).toBe('#/c/blog/e/hello');
        return expect(editorOf(el)).not.toBe(null);
    });

    it('does not hold a navigation when nothing was changed', async function() {
        /* The predicate is the SERIALIZED MARKDOWN, not the HTML. The
           editor normalises what it is handed, so an HTML comparison
           reports edits nobody made -- and a panel that appears every
           time is a panel people click through without reading. */
        const {el, shadow} = await open();
        location.hash = '#/c/blog';
        await until(() => editorOf(el) === null, 'the entry to close');

        /* Nothing held it: the address bar was left where the click put
           it, and the entry view -- panel and all -- is gone from the
           pane rather than merely hidden inside it. */
        expect(location.hash).toBe('#/c/blog');
        return expect(shadow.querySelector('.ct-cms__entry-view')).toBe(null);
    });

    it('stays put when asked to', async function() {
        const {el, shadow} = await open();
        retype(el, 'Goodbye.');
        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');

        shadow.querySelectorAll('.ct-cms__leave .ct-cms__button')[0].click();
        expect(shadow.querySelector('.ct-cms__leave').hidden).toBe(true);
        expect(editorOf(el)).not.toBe(null);
        return expect(location.hash).toBe('#/c/blog/e/hello');
    });

    it('still saves the work after a leave was checked and abandoned',
       async function() {
        /* Two reads of the editor in one edit, which is the case the
           `_edited` cache exists for. `save()` reports the regions that
           moved since the LAST save and then resets that baseline, so
           the leave check consumes the report and the submit that
           follows is told nothing changed -- and writes the file back
           exactly as it was, silently, while saying it saved. */
        const {el, shadow, fake} = await open();
        retype(el, 'Goodbye.');

        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');
        shadow.querySelectorAll('.ct-cms__leave .ct-cms__button')[0].click();

        await submit(el);
        return expect(addedLines(SEED, fake.read(ENTRY, BRANCH))).toEqual(['Goodbye.']);
    });

    it('leaves, and moves the address bar with it, when told to discard',
       async function() {
        const {el, shadow} = await open();
        retype(el, 'Goodbye.');
        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');

        shadow.querySelector('.ct-cms__leave .ct-cms__button--cancel').click();
        await until(() => editorOf(el) === null, 'the entry to close');

        expect(location.hash).toBe('#/c/blog');
        expect(ContentTools.EditorApp.current()).toBe(null);
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
        retype(el, 'Goodbye.');
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
        retype(el, 'Goodbye.');
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
        retype(el, 'Goodbye.');

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
        retype(el, 'Goodbye.');

        location.hash = '#/c/blog/e/hello/';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');
        expect(location.hash).toBe('#/c/blog/e/hello');

        shadow.querySelectorAll('.ct-cms__leave .ct-cms__button')[1].click();
        await until(() => editorOf(el)?.state === 'editing', 'the entry to reload');

        // Now a real navigation, which must not be eaten.
        location.hash = '#/c/blog';
        return until(() => editorOf(el) === null, 'the shell to leave the entry');
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
        retype(el, 'Goodbye.');
        await submit(el);
        fake.pushOther(BRANCH, {[ENTRY]: SEED.replace('World.', 'Theirs.')});
        retype(el, 'Mine.');
        await submit(el);
        expect(shadow.querySelector('.ct-cms__conflict').hidden).toBe(false);

        location.hash = '#/c/blog';
        await until(() => !shadow.querySelector('.ct-cms__leave').hidden, 'the panel');

        shadow.querySelector('.ct-cms__conflict .ct-cms__button--cancel').click();
        await until(() => editorOf(el)?.state === 'editing', 'the editor to come back');
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
        retype(el, 'Goodbye.');
        revoked = true;

        el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
        await until(() => el.getAttribute('state') === 'signed-out', 'the gate');

        expect(alertText(el)).toContain('GitHub rejected that token');
        /* And the editor went with the token. The frame is only hidden
           behind the gate, so one left behind would be invisible,
           connected, and holding the lease for the rest of the
           session. */
        expect(editorOf(el)).toBe(null);
        return expect(ContentTools.EditorApp.current()).toBe(null);
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

        it('leaves the frontmatter BYTE-identical on a body-only save',
           async function() {
            /* The gate for the whole sub-phase. `update` preserves the
               original block verbatim only when it is handed no data, so
               a form that always reported its values would put every
               save through a YAML round trip -- comments gone, key order
               sorted, quoting normalised, and a whole-file diff in a
               pull request whose only reason to exist is that somebody
               can read it. */
            const seed = '---\n# who wrote it\ntitle: "Hello"\ndraft: false\n---\n\n'
                + '# Hello\n\nWorld.\n';
            const {el, fake} = await openWith(seed);
            retype(el, 'Goodbye.');
            await submit(el);

            const saved = fake.read(ENTRY, BRANCH);
            expect(saved.startsWith('---\n# who wrote it\ntitle: "Hello"\ndraft: false\n---\n'))
                .toBe(true);
            return expect(addedLines(seed, saved)).toEqual(['Goodbye.']);
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
            expect(editorOf(el)).not.toBe(null);
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
            // Nothing was filled in, so nothing about the file's
            // frontmatter has changed -- including that it has none.
            const {el, fake} = await openWith('# Hello\n\nWorld.\n');
            retype(el, 'Goodbye.');
            await submit(el);
            return expect(fake.read(ENTRY, BRANCH).startsWith('---')).toBe(false);
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

            retype(el, 'Goodbye.', 0);
            await submit(el);
            const saved = fake.read(ENTRY, BRANCH);
            expect(saved.startsWith('---\ntitle: "unterminated\n  - nope\n---\n'))
                .toBe(true);
            return expect(saved).toContain('Goodbye.');
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
            await until(() => editorOf(el)?.state === 'editing', 'the editor');
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
            retype(el, 'Goodbye.');
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
            retype(el, 'Goodbye.');
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
            await until(() => editorOf(el)?.state === 'editing', 'the first entry');
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
            await until(() => editorOf(el) === null, 'the listing');
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
            retype(el, 'Goodbye.');
            await submit(el);
            // Untouched means the block was never rewritten at all.
            return expect(fake.read(ENTRY, BRANCH))
                .toContain('---\ntitle: Hello\nmeta: {a: 1}\n---');
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
        await until(() => editorOf(el)?.state === 'editing', 'the first entry');

        gate.hold = true;
        location.hash = '#/c/blog/e/hello';
        await until(() => gate.release !== null, 'the read to be in flight');

        location.hash = '#/c/blog';
        await until(() => editorOf(el) === null, 'the listing');
        gate.release();

        /* The late answer must not put an editor back on a page that has
           moved on. Silently: an entry's chrome over a listing, and a
           save that writes the wrong file. */
        await new Promise(resolve => setTimeout(resolve, 20));
        return expect(editorOf(el)).toBe(null);
    });
});

/* Imported for the stale-response test's own fetch, which cannot use
   `shellFetch` because it has to wrap the fake rather than fall through
   to it. */
import {CONFIG_YAML as CONFIG_YAML_TEXT} from './helpers.js';
