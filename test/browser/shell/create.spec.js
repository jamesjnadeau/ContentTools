import {
    alertText, createFakeGitHub, entryOf, forgetToken, mountShell, openAt,
    openedEntry, setField, settled, shellFetch, signIn, until, CONFIG_URL,
    CONFIG_YAML
} from './helpers.js';

/* Naming an entry into existence, and taking one away again.
 *
 * Both are the same shape and that is the point of the sub-phase: a
 * created entry is opened, edited and saved through exactly the code an
 * existing one goes through, and a delete is a pull request like every
 * other change. So most of what is asserted here is that the two paths
 * did NOT grow a second set of rules -- a created entry whose first save
 * lands on somebody else's branch, a delete that writes nothing and says
 * nothing, a `new` route that lets a hand-typed URL past a `create:
 * false` a deployment set on purpose.
 *
 * What Create produces since M6-3 is a STUB: a name, whatever the
 * collection's fields say, and no words. The words are written on the
 * site's own page, which is a deploy preview, which is built for a pull
 * request -- so the entry has to be committed before it can be written
 * at all, and a stub with nothing in it is still a stub worth
 * committing. The name is the work on this screen.
 *
 * The configs are per-test, through `files`, rather than edits to the
 * shared `CONFIG_YAML`: a third collection or a `delete: true` in there
 * would move every nav assertion in the suite for the sake of this file.
 */

/** The shared config with `blog`'s collection body replaced. */
function configWith(lines) {
    return CONFIG_YAML.replace(
        /  - name: blog\n(?:    .*\n|      .*\n)*?(?=  - name: pages\n)/,
        `  - name: blog\n${lines.map(line => `    ${line}\n`).join('')}`);
}

/** `blog` as the suite's other specs know it, plus whatever is passed. */
function blogWith(...extra) {
    return configWith([
        'label: Blog',
        'folder: content/blog',
        'create: true',
        ...extra,
        'fields:',
        '  - {name: title, label: Title}'
    ]);
}

function filesFor(yaml) {
    return {[CONFIG_URL]: yaml};
}

const HELLO = 'content/blog/hello.md';
const SEED = '---\ntitle: Hello\n---\n\nWorld.\n';

function shadow(el) {
    return el.shadowRoot;
}

/** The create form's title field. */
function titleField(el) {
    return shadow(el).querySelector('#ct-cms-new-title');
}

/** The form itself, which a refused collection hides rather than drops. */
function createForm(el) {
    return shadow(el).querySelector('.ct-cms__create-form');
}

/** Press a key in a field, as the view listens for it. */
function press(input, key) {
    input.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
}

/** Type into the create field the way the view is told about it. */
function typeTitle(el, text) {
    const input = titleField(el);
    input.value = text;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    return input;
}

function createButton(el) {
    return shadow(el).querySelector('.ct-cms__create-form .ct-cms__button');
}

function previewText(el) {
    return shadow(el).querySelector('.ct-cms__create-form .ct-field__hint').textContent;
}

/** Press Submit and wait for the save to finish. */
async function submit(el) {
    shadow(el).querySelector('.ct-cms__entry-submit').click();
    await until(
        () => !shadow(el).querySelector('.ct-cms__entry-submit').disabled,
        'the save to finish');
}

describe('creating and deleting entries', function() {

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

    async function open(hash, options = {}) {
        mounted = await openAt(hash, options);
        return mounted;
    }

    /** Open `#/c/blog/new` against `yaml` and whatever the repo holds. */
    async function openNew(options = {}) {
        const fake = options.fake ?? createFakeGitHub({files: options.seed ?? {}});
        const {el} = await open('#/c/blog/new', {
            fake, files: filesFor(options.yaml ?? blogWith())
        });
        await until(() => shadow(el).querySelector('.ct-cms__create') !== null,
                    'the create view');
        return {el, fake};
    }

    // --- getting there ----------------------------------------------------

    describe('the New entry link', function() {

        /** The link, and the href it is currently offering. */
        function link(el) {
            return shadow(el).querySelector('.ct-cms__button--add');
        }

        it('offers a folder collection that allows it', async function() {
            const {el} = await open('#/c/blog', {files: filesFor(blogWith())});
            await until(() => shadow(el).querySelector('.ct-cms__entry-list'), 'the list');
            expect(link(el).hidden).toBe(false);
            return expect(link(el).getAttribute('href')).toBe('#/c/blog/new');
        });

        it('hides itself for a collection with `create: false`', async function() {
            const {el} = await open('#/c/blog', {
                files: filesFor(configWith([
                    'label: Blog', 'folder: content/blog', 'create: false'
                ]))
            });
            await until(() => shadow(el).querySelector('.ct-cms__entry-list'), 'the list');
            expect(link(el).hidden).toBe(true);
            /* And the href is REMOVED rather than emptied. A hidden
               `<a href="">` is a link to the current page, and a screen
               reader in links mode still offers it. */
            return expect(link(el).hasAttribute('href')).toBe(false);
        });

        it('hides itself for a file collection', async function() {
            const {el} = await open('#/c/pages', {files: filesFor(blogWith())});
            await until(() => shadow(el).querySelector('.ct-cms__entry-list'), 'the list');
            return expect(link(el).hidden).toBe(true);
        });
    });

    // --- naming it --------------------------------------------------------

    describe('the name', function() {

        it('shows the filename the title would get, while it is typed',
           async function() {
            /* The field is not the title of the post, it is the
               FILENAME -- the one thing about an entry nobody can change
               afterwards without breaking its URL. Deriving it silently
               and showing it for the first time in a pull request is how
               somebody ends up with `untitled-1`. */
            const {el} = await openNew();
            expect(previewText(el)).toBe('');
            /* And the heading names the collection, because a deployment
               with four of them puts the same form at four addresses. */
            expect(el.shadowRoot.querySelector('.ct-cms__create .ct-cms__heading').textContent)
                .toBe('New Blog entry');

            typeTitle(el, 'Hello World!');
            return expect(previewText(el)).toBe('Saved as content/blog/hello-world.md');
        });

        it('expands the collection\'s slug template', async function() {
            const {el} = await openNew({yaml: blogWith('slug: "{{year}}-{{slug}}"')});
            typeTitle(el, 'Hello World!');
            const year = String(new Date().getFullYear());
            return expect(previewText(el))
                .toBe(`Saved as content/blog/${year}-hello-world.md`);
        });

        it('refuses a title with no filename in it, and says why',
           async function() {
            /* Not an edge case to paper over: a title written entirely
               in a script `slugify` cannot spell has no ASCII filename,
               and inventing one gives somebody a page at a URL they did
               not choose and cannot guess. */
            const {el} = await openNew();
            typeTitle(el, '!!! ???');
            expect(createButton(el).disabled).toBe(true);
            return expect(previewText(el)).toContain('no letters or numbers');
        });

        it('holds Create until there is a name at all', async function() {
            const {el} = await openNew();
            expect(createButton(el).disabled).toBe(true);
            typeTitle(el, 'Hello');
            return expect(createButton(el).disabled).toBe(false);
        });

        it('accepts Enter as well as the button', async function() {
            /* A one-field form that ignores Enter is a form people type
               into twice. It is not a real `<form>`, because a submit
               inside a shadow root still navigates the page -- which
               would throw away the shell -- so the key has to be wired
               by hand, and that wiring is what this covers. */
            const {el} = await openNew();
            press(typeTitle(el, 'Hello'), 'Enter');
            await openedEntry(el);
            return expect(entryOf(el)).not.toBe(null);
        });

        it('creates nothing on any other key', async function() {
            /* The handler is on `keydown` over the whole field, so a
               condition that let anything through would open an entry
               on the first letter of the name somebody is still typing. */
            const {el} = await openNew();
            press(typeTitle(el, 'Hello'), 'o');
            press(titleField(el), 'Escape');
            await new Promise(resolve => setTimeout(resolve, 0));
            return expect(entryOf(el)).toBe(null);
        });

        it('ignores Enter while there is no usable name', async function() {
            /* The button is disabled and Enter has to honour that, or
               the one input the view refuses through the mouse is
               reachable through the keyboard -- and `content/blog/.md`
               is the file it makes. */
            const {el, fake} = await openNew();
            press(typeTitle(el, '!!!'), 'Enter');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(entryOf(el)).toBe(null);
            return expect(fake.branches()).toEqual(['main']);
        });

        it('holds Create while the collision check is in flight',
           async function() {
            /* The check is a round trip, and a button that stays live
               through it invites a second press -- which is how somebody
               ends up looking at a second screen for the same slug. */
            let release = null;
            const held = new Promise(resolve => {
                release = resolve;
            });
            const fake = createFakeGitHub({files: {}});
            const real = shellFetch(fake, filesFor(blogWith()));
            const {el} = await open('#/c/blog/new', {
                fake,
                files: filesFor(blogWith()),
                fetch: async (input, init) => {
                    const url = typeof input === 'string' ? input : String(input.url);
                    if (url.includes('contents/content/blog/hello.md')) {
                        await held;
                    }
                    return real(input, init);
                }
            });
            await until(() => titleField(el) !== null, 'the create form');

            typeTitle(el, 'Hello');
            createButton(el).click();
            await until(() => createButton(el).disabled, 'Create to be held');
            release();
            return openedEntry(el);
        });
    });

    // --- the route refuses what the link never offers ----------------------

    describe('the `new` route', function() {

        it('refuses a collection with `create: false`', async function() {
            /* Reachable only by a hand-typed URL or an old bookmark, and
               a hand-typed URL is not a permission. The refusal has to
               be on the page rather than a blank panel: a deployment
               turned this off on purpose and the person who typed the
               URL needs to know that, not think the shell broke. */
            const {el} = await openNew({
                yaml: configWith(['label: Blog', 'folder: content/blog', 'create: false'])
            });
            expect(createForm(el).hidden).toBe(true);
            /* The computed style, not the property. `hidden` is not
               self-enforcing here -- the UA's `[hidden] { display: none }`
               loses to any author rule, and a form reading back hidden
               while it is on screen is exactly the shape of the bug M5-2
               found in the gate. */
            expect(getComputedStyle(createForm(el)).display).toBe('none');
            return expect(shadow(el).querySelector('.ct-cms__create').textContent)
                .toContain('does not allow new entries');
        });

        it('refuses a file collection', async function() {
            const {el} = await open('#/c/pages/new', {files: filesFor(blogWith())});
            await until(() => shadow(el).querySelector('.ct-cms__create'), 'the create view');
            expect(createForm(el).hidden).toBe(true);
            return expect(shadow(el).querySelector('.ct-cms__create').textContent)
                .toContain('fixed set of pages');
        });

        it('names a collection this config does not have', async function() {
            const {el} = await open('#/c/nope/new', {files: filesFor(blogWith())});
            await until(() => shadow(el).querySelector('.ct-cms__heading'), 'a heading');
            return expect(shadow(el).querySelector('.ct-cms__view').textContent)
                .toContain('No such collection');
        });
    });

    // --- what Create actually does ----------------------------------------

    describe('pressing Create', function() {

        it('opens the entry and commits NOTHING', async function() {
            /* An author who names a post, reads what they were about to
               write and closes the tab leaves nothing behind. The same
               rule staged media follows, and for the same reason: half
               an intention is not a change to the repository. */
            const {el, fake} = await openNew();
            typeTitle(el, 'Hello World!');
            createButton(el).click();
            await openedEntry(el);

            expect(fake.branches()).toEqual(['main']);
            expect(fake.pulls()).toEqual([]);
            return expect(fake.read('content/blog/hello-world.md')).toBe(null);
        });

        it('starts from the fields\' defaults', async function() {
            /* The defaults go into the document SOURCE, not into the
               form beside it -- so everything downstream is unable to
               tell a created entry from an opened one, which is what
               stops "new" becoming a second set of rules. */
            const {el, fake} = await openNew({
                yaml: configWith([
                    'label: Blog', 'folder: content/blog', 'create: true',
                    'fields:',
                    '  - {name: title, label: Title, default: Untitled}',
                    '  - {name: draft, label: Draft, widget: boolean, default: true}'
                ])
            });
            typeTitle(el, 'Hello');
            createButton(el).click();
            await openedEntry(el);

            expect(shadow(el).querySelector('#ct-field-title').value).toBe('Untitled');
            expect(shadow(el).querySelector('#ct-field-draft').checked).toBe(true);

            await submit(el);
            const saved = fake.read('content/blog/hello.md', 'cms/blog/hello');
            expect(saved).toContain('title: Untitled');
            return expect(saved).toContain('draft: true');
        });

        it('gives a collection with no defaults no frontmatter block',
           async function() {
            /* An empty `---\n---` on every new entry is a line every
               later diff carries for nothing. With nothing declared to
               default and nothing filled in, the stub is an EMPTY FILE
               -- which is what a stub is: the entry has to exist before
               the site can build a preview of it, and the preview is
               where its words get written. */
            const {el, fake} = await openNew();
            typeTitle(el, 'Hello');
            createButton(el).click();
            await openedEntry(el);
            await submit(el);
            return expect(fake.read('content/blog/hello.md', 'cms/blog/hello'))
                .toBe('');
        });

        it('does not open an editor for a route the person has left',
           async function() {
            /* The collision check is a round trip, and somebody who
               changes their mind during it clicks back to the list.
               Without the navigation token the read arrives afterwards
               and puts the entry over whatever is on screen -- and the
               next Submit writes the abandoned entry. */
            let release = null;
            const held = new Promise(resolve => {
                release = resolve;
            });
            const fake = createFakeGitHub({files: {}});
            const real = shellFetch(fake, filesFor(blogWith()));
            const {el} = await open('#/c/blog/new', {
                fake,
                files: filesFor(blogWith()),
                fetch: async (input, init) => {
                    const url = typeof input === 'string' ? input : String(input.url);
                    if (url.includes('contents/content/blog/hello.md')) {
                        await held;
                    }
                    return real(input, init);
                }
            });
            await until(() => titleField(el) !== null, 'the create form');

            typeTitle(el, 'Hello');
            createButton(el).click();
            location.hash = '#/c/blog';
            await until(() => shadow(el).querySelector('.ct-cms__entry-list'), 'the list');

            /* Back to the form, with the abandoned read still in
               flight. The in-flight hold is per-route state: left
               behind, it greys out Create on a screen whose own request
               never started, and nothing later re-renders to take it
               off -- so the person is looking at a dead button on a
               form they just opened. */
            location.hash = '#/c/blog/new';
            await until(() => titleField(el) !== null, 'the create form again');
            typeTitle(el, 'Something else');
            expect(createButton(el).disabled).toBe(false);

            release();
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));
            return expect(entryOf(el)).toBe(null);
        });

        it('refuses a name that is already taken, before opening anything',
           async function() {
            /* The check that saves the afternoon. `saveEntry` checks
               again at write time and that is the one that settles a
               race between two authors -- but only this one runs before
               somebody has spent an hour on the entry. */
            const {el, fake} = await openNew({seed: {[HELLO]: SEED}});
            typeTitle(el, 'Hello');
            createButton(el).click();
            await until(() => alertText(el) !== '', 'the refusal');

            expect(alertText(el)).toContain('already an entry with that name');
            expect(alertText(el)).toContain(HELLO);
            expect(entryOf(el)).toBe(null);
            return expect(fake.read(HELLO)).toBe(SEED);
        });

        it('refuses a name a pull request has already claimed',
           async function() {
            /* The file is not on the base branch at all -- somebody
               else's unmerged pull request creates it. Checking the base
               alone would open the same slug twice, and the second save
               would commit onto the first author's branch. */
            const fake = createFakeGitHub({files: {}});
            fake.openPull('blog', 'hello');
            const {el} = await openNew({fake});
            typeTitle(el, 'Hello');
            createButton(el).click();
            await until(() => alertText(el) !== '', 'the refusal');

            expect(alertText(el)).toContain('already an entry with that name');
            return expect(entryOf(el)).toBe(null);
        });

        it('lets Create be pressed again after a refusal', async function() {
            /* The person who most needs the button is exactly the one
               whose first choice of name collided, so the in-flight hold
               has to come off however the check ended. */
            const {el} = await openNew({seed: {[HELLO]: SEED}});
            typeTitle(el, 'Hello');
            createButton(el).click();
            await until(() => alertText(el) !== '', 'the refusal');
            expect(createButton(el).disabled).toBe(false);

            typeTitle(el, 'Hello Again');
            createButton(el).click();
            await openedEntry(el);
            return expect(entryOf(el)).not.toBe(null);
        });
    });

    // --- the first save ----------------------------------------------------

    describe('the first save', function() {

        /**
         * Name `title`, wait for the entry, and put `heading` in its form.
         *
         * A field rather than a body, which is the whole of what this
         * screen can change since M6-3. The stub it commits is a
         * frontmatter block and nothing else; the words come later, on
         * the site's own page.
         */
        async function start(title, heading, options = {}) {
            const opened = await openNew(options);
            typeTitle(opened.el, title);
            createButton(opened.el).click();
            await openedEntry(opened.el);
            setField(opened.el, 'title', heading);
            return opened;
        }

        it('writes the file at the expanded path, on its own branch, with a pull request',
           async function() {
            const {el, fake} = await start('Hello World!', 'First post.');
            await submit(el);

            expect(fake.branches()).toEqual(['cms/blog/hello-world', 'main']);
            expect(fake.read('content/blog/hello-world.md', 'cms/blog/hello-world'))
                .toBe('---\ntitle: First post.\n---\n');
            /* And nothing on the base branch. The site does not change
               until somebody merges, which is the whole premise. */
            expect(fake.read('content/blog/hello-world.md')).toBe(null);
            expect(fake.pulls().length).toBe(1);
            /* The message a reviewer reads first. "Update" on a file
               that did not exist is a small lie that costs somebody a
               diff to work out. */
            expect(fake.history('cms/blog/hello-world')[0].message)
                .toBe('Create content/blog/hello-world.md');
            return expect(fake.pulls()[0].head.ref).toBe('cms/blog/hello-world');
        });

        it('asks before throwing away a name that was never committed',
           async function() {
            /* The other half of the raw `content` comparison, and the
               only test that can see it. A just-named entry has no file
               at its path, so `content` is null and nothing equals it:
               the entry reads as work from the moment it is named. It
               IS work -- the filename is the one thing about an entry
               nobody can change afterwards without breaking its URL,
               and it is the decision this whole route exists to take.
               Leaving without submitting loses it.

               The spelling that would not ask compares against `''`,
               and there is nothing else in the shell that can tell the
               two apart: `_submit` never consults `dirty()`, it lets
               the repository decide, and a create is always a change
               to the repository. */
            const {el} = await openNew();
            typeTitle(el, 'Hello World!');
            createButton(el).click();
            await openedEntry(el);

            location.hash = '#/c/blog';
            await until(() => !shadow(el).querySelector('.ct-cms__leave').hidden,
                        'the leave panel');
            return expect(location.hash).toBe('#/c/blog/new');
        });

        it('commits a stub with nothing filled in at all', async function() {
            /* The case M6-3 turns from tidy into load-bearing. An
               entry's words are written on the site's own page, the
               page is a deploy preview, the preview is built for a
               pull request, and the pull request needs a commit -- so
               the file has to exist BEFORE there is anything in it,
               and a collection whose fields nobody fills in is one
               nobody could otherwise add to at all.

               Nothing consults `dirty()` on the way: `_submit` hands
               the pending bytes to the repository, and a create is a
               change to the repository however empty it is. The claim
               here is that the whole path holds for a form nobody
               touched -- which is the only arrangement that exercises
               `pending()` with `merged === null` on a fresh entry. */
            const {el, fake} = await openNew();
            typeTitle(el, 'Hello World!');
            createButton(el).click();
            await openedEntry(el);

            await submit(el);

            expect(alertText(el)).not.toContain('Nothing to save');
            /* EMPTY, and deliberately so: a stub is a path, and what
               goes in it is whatever the collection's `default`s say.
               A collection that declares none gets a file with nothing
               in it -- which is a file, which is a pull request, which
               is a preview, which is a page to write the words on. */
            expect(fake.read('content/blog/hello-world.md', 'cms/blog/hello-world'))
                .toBe('');
            expect(fake.branches()).toContain('cms/blog/hello-world');
            return expect(fake.pulls().length).toBe(1);
        });

        it('moves the address bar to the entry without tearing the form down',
           async function() {
            /* The entry is real now, so the hash catches up with it --
               in place. A navigation here would throw away the form the
               person is still looking at and fetch back the bytes it
               just sent, and the controls would be rebuilt under
               whoever was typing into them. */
            const {el} = await start('Hello World!', 'First post.');
            const before = shadow(el).querySelector('#ct-field-title');
            await submit(el);

            expect(location.hash).toBe('#/c/blog/e/hello-world');
            expect(entryOf(el)).not.toBe(null);
            return expect(shadow(el).querySelector('#ct-field-title')).toBe(before);
        });

        it('makes the SECOND save an ordinary update of the same branch',
           async function() {
            /* Nothing remembers that the first save was a create: the
               entry's own `content` is null exactly while there is no
               file, so the create flag is derived rather than stored.
               A second create would be refused by its own collision
               check, on the entry it had just written. */
            const {el, fake} = await start('Hello World!', 'First post.');
            await submit(el);
            setField(el, 'title', 'Second thoughts.');
            await submit(el);

            expect(fake.pulls().length).toBe(1);
            expect(fake.history('cms/blog/hello-world').length).toBe(3);
            expect(fake.read('content/blog/hello-world.md', 'cms/blog/hello-world'))
                .toBe('---\ntitle: Second thoughts.\n---\n');
            return expect(alertText(el)).not.toContain('already an entry');
        });

        it('refuses when somebody else created the same slug meanwhile',
           async function() {
            /* The race the pre-check cannot settle: two authors who both
               passed it and are both now pressing Submit. Without the
               `create` flag the second one's post is committed straight
               onto the first one's pull request, and one of them never
               finds out. */
            const {el, fake} = await start('Hello', 'Mine.');
            fake.pushOther('main', {[HELLO]: 'Theirs.\n'});
            await submit(el);

            expect(alertText(el)).toContain('already an entry with that name');
            return expect(fake.read(HELLO)).toBe('Theirs.\n');
        });
    });

    // --- taking one away ---------------------------------------------------

    describe('deleting an entry', function() {

        const DELETABLE = blogWith('delete: true');

        /** Open `hello` with whatever config, and wait for the file. */
        async function openHello(yaml = DELETABLE, files = {[HELLO]: SEED}) {
            const fake = createFakeGitHub({files});
            const {el} = await open('#/c/blog/e/hello', {fake, files: filesFor(yaml)});
            await openedEntry(el);
            return {el, fake};
        }

        function deleteButton(el) {
            return shadow(el).querySelector('.ct-cms__entry-delete');
        }

        function confirmPanel(el) {
            return shadow(el).querySelector('.ct-cms__confirm');
        }

        /** The confirm panel's Delete it, which is its `--cancel` button. */
        function confirmButton(el) {
            return confirmPanel(el).querySelector('.ct-cms__button--cancel');
        }

        it('hides the button when the collection does not allow it',
           async function() {
            /* `delete` is its own flag, defaulting to false and separate
               from `create`: a deployment that lets authors add posts has
               not thereby said they may remove pages. */
            const {el} = await openHello(blogWith());
            return expect(deleteButton(el).hidden).toBe(true);
        });

        it('asks first, and says what pressing it actually does',
           async function() {
            const {el} = await openHello();
            expect(deleteButton(el).hidden).toBe(false);
            expect(confirmPanel(el).hidden).toBe(true);

            deleteButton(el).click();
            expect(confirmPanel(el).hidden).toBe(false);
            /* "Are you sure?" invites a reflex. The fact that nothing
               leaves the site until somebody merges is what makes this
               safe to press, and a person who knows it does not come
               back asking where their page went. */
            return expect(confirmPanel(el).textContent)
                .toContain('until somebody reviews and merges it');
        });

        it('takes the question back', async function() {
            const {el, fake} = await openHello();
            deleteButton(el).click();
            shadow(el).querySelector('.ct-cms__confirm .ct-cms__button').click();

            expect(confirmPanel(el).hidden).toBe(true);
            expect(fake.pulls()).toEqual([]);
            return expect(entryOf(el)).not.toBe(null);
        });

        it('puts the question away when the entry is left unanswered',
           async function() {
            /* A confirmation belongs to the entry it was asked about.
               Left standing, the next entry opens with "Delete it"
               already on screen -- and the person who presses it is
               answering a question about a file they have closed. */
            const fake = createFakeGitHub({
                files: {[HELLO]: SEED, 'content/blog/other.md': SEED}
            });
            const {el} = await open('#/c/blog/e/hello', {
                fake, files: filesFor(DELETABLE)
            });
            await openedEntry(el);
            deleteButton(el).click();
            expect(confirmPanel(el).hidden).toBe(false);

            location.hash = '#/c/blog/e/other';
            /* The next entry's own heading, not merely "an entry is
               open": the first one stays on screen until the second
               entry's read comes back, so waiting on the panel alone
               returns before anything has happened. */
            await until(() => el.shadowRoot.querySelector('.ct-cms__entry-view '
                                                          + '.ct-cms__heading')
                                  .textContent.includes('other'),
                        'the next entry');
            expect(confirmPanel(el).hidden).toBe(true);
            return expect(fake.pulls()).toEqual([]);
        });

        it('opens ONE pull request whose tree no longer has the path',
           async function() {
            const {el, fake} = await openHello();
            deleteButton(el).click();
            confirmButton(el).click();
            await until(() => fake.pulls().length === 1, 'the pull request');

            expect(fake.paths('cms/blog/hello')).not.toContain(HELLO);
            expect(fake.history('cms/blog/hello')[0].message).toBe(`Delete ${HELLO}`);
            /* Still on the site. That is the honest picture -- the base
               branch is untouched until a human merges -- and it is why
               the notice has to say so out loud. */
            return expect(fake.read(HELLO)).toBe(SEED);
        });

        it('goes back to the list and says the entry is still there',
           async function() {
            /* The entry is in that list afterwards, and an author who is
               not told why will either press Delete again or conclude it
               did not work. */
            const {el, fake} = await openHello();
            deleteButton(el).click();
            confirmButton(el).click();
            await until(() => fake.pulls().length === 1, 'the pull request');
            await until(() => alertText(el) !== '', 'the notice');

            expect(location.hash).toBe('#/c/blog');
            expect(entryOf(el)).toBe(null);
            expect(alertText(el)).toContain('pull request #1');
            return expect(alertText(el)).toContain('stays on the site');
        });

        it('simply abandons an entry that was never saved', async function() {
            /* There is no file anywhere, so there is nothing to open a
               pull request about. Asking the repository to delete a path
               it has never held gets a correct refusal, which reads as a
               failure to do something that had already happened. */
            const {el, fake} = await openNew({yaml: DELETABLE});
            typeTitle(el, 'Hello');
            createButton(el).click();
            await openedEntry(el);

            deleteButton(el).click();
            confirmButton(el).click();
            await until(() => entryOf(el) === null, 'the entry to go');

            expect(location.hash).toBe('#/c/blog');
            expect(fake.pulls()).toEqual([]);
            return expect(fake.branches()).toEqual(['main']);
        });

        it('says so plainly when the entry is already gone', async function() {
            /* Two tabs, or somebody else's delete merged while this one
               was open. The entry being gone is the outcome that was
               asked for, so it is a notice and not a failure -- and it
               has to say which file, because "already gone" with no name
               reads as the shell refusing to do anything at all. */
            const fake = createFakeGitHub({files: {[HELLO]: SEED}});
            let vanished = false;
            const {el} = await open('#/c/blog/e/hello', {
                fake,
                files: filesFor(DELETABLE),
                fetch: async (input, init) => {
                    const url = typeof input === 'string' ? input : String(input.url);
                    if (url === CONFIG_URL) {
                        return new Response(DELETABLE, {status: 200});
                    }
                    if (vanished && url.includes(`contents/${HELLO}`)) {
                        return new Response(JSON.stringify({message: 'Not Found'}),
                                            {status: 404});
                    }
                    return fake.fetch(input, init);
                }
            });
            await openedEntry(el);

            vanished = true;
            deleteButton(el).click();
            confirmButton(el).click();
            await until(() => alertText(el) !== '', 'the notice');

            expect(alertText(el)).toContain('already gone');
            expect(alertText(el)).toContain(HELLO);
            return expect(fake.pulls()).toEqual([]);
        });

        it('refuses when a reviewer pushed to the entry\'s branch meanwhile',
           async function() {
            /* Pinned to the commit the entry was read at, for the same
               reason a save is: a reviewer who pushed to the open pull
               request since then gets a conflict rather than having
               their work deleted out from under them by an author who
               never saw it.

               A push to the BASE branch is not this, and must not be
               made to look like it: a delete opened from an older commit
               is diffed against its merge base, so it removes the file
               and reverts nothing. Only a branch that is already under
               review can conflict. */
            const fake = createFakeGitHub({files: {[HELLO]: SEED}});
            fake.openPull('blog', 'hello');
            const {el} = await open('#/c/blog/e/hello', {
                fake, files: filesFor(DELETABLE)
            });
            await openedEntry(el);

            fake.pushOther('cms/blog/hello', {[HELLO]: `${SEED}Theirs.\n`});
            deleteButton(el).click();
            confirmButton(el).click();
            await until(() => alertText(el) !== '', 'the conflict');

            expect(alertText(el)).toContain('Somebody else changed this entry');
            /* And the question is put away. It was answered -- the
               failure is the repository's, not a second chance to say
               yes -- and a confirm panel still standing under an error
               message is an invitation to press Delete again. */
            expect(confirmPanel(el).hidden).toBe(true);
            return expect(fake.read(HELLO, 'cms/blog/hello')).toContain('Theirs.');
        });
    });

    // --- the gate holds -----------------------------------------------------

    it('survives a reload on the `new` route', async function() {
        /* A create route is an address like any other: it has to come
           back after a refresh, because the editor it opens is where
           somebody writes a post and the browser is entitled to reload. */
        const fake = createFakeGitHub({files: {}});
        location.hash = '#/c/blog/new';
        mounted = await mountShell({fake, files: filesFor(blogWith())});
        await signIn(mounted.el);
        await settled(mounted.el);
        await until(() => titleField(mounted.el) !== null, 'the create form');
        return expect(titleField(mounted.el)).not.toBe(null);
    });
});
