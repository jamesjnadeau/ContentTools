import {
    alertText, createFakeGitHub, editorOf, forgetToken, mountShell, openAt, retype,
    settled, shellFetch, signIn, until, CONFIG_URL, CONFIG_YAML
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
    return shadow(el).querySelector('.ct-cms__create-form .ct-cms__field-hint').textContent;
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
            await until(() => editorOf(el) !== null, 'the editor');
            return expect(editorOf(el)).not.toBe(null);
        });

        it('creates nothing on any other key', async function() {
            /* The handler is on `keydown` over the whole field, so a
               condition that let anything through would open an editor
               on the first letter of the name somebody is still typing. */
            const {el} = await openNew();
            press(typeTitle(el, 'Hello'), 'o');
            press(titleField(el), 'Escape');
            await new Promise(resolve => setTimeout(resolve, 0));
            return expect(editorOf(el)).toBe(null);
        });

        it('ignores Enter while there is no usable name', async function() {
            /* The button is disabled and Enter has to honour that, or
               the one input the view refuses through the mouse is
               reachable through the keyboard -- and `content/blog/.md`
               is the file it makes. */
            const {el, fake} = await openNew();
            press(typeTitle(el, '!!!'), 'Enter');
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(editorOf(el)).toBe(null);
            return expect(fake.branches()).toEqual(['main']);
        });

        it('holds Create while the collision check is in flight',
           async function() {
            /* The check is a round trip, and a button that stays live
               through it invites a second press -- which is how somebody
               ends up looking at a second editor for the same slug. */
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
            return until(() => editorOf(el) !== null, 'the editor');
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

        it('opens an editor and commits NOTHING', async function() {
            /* An author who names a post, reads what they were about to
               write and closes the tab leaves nothing behind. The same
               rule staged media follows, and for the same reason: half
               an intention is not a change to the repository. */
            const {el, fake} = await openNew();
            typeTitle(el, 'Hello World!');
            createButton(el).click();
            await until(() => editorOf(el) !== null, 'the editor');

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
            await until(() => editorOf(el) !== null, 'the editor');

            expect(shadow(el).querySelector('#ct-cms-field-title').value).toBe('Untitled');
            expect(shadow(el).querySelector('#ct-cms-field-draft').checked).toBe(true);

            await until(() => editorOf(el).state === 'editing', 'the editor to start');
            retype(el, 'First post.', 0);
            await submit(el);
            const saved = fake.read('content/blog/hello.md', 'cms/blog/hello');
            expect(saved).toContain('title: Untitled');
            return expect(saved).toContain('draft: true');
        });

        it('gives a collection with no defaults no frontmatter block',
           async function() {
            /* An empty `---\n---` on every new entry is a line every
               later diff carries for nothing. */
            const {el, fake} = await openNew();
            typeTitle(el, 'Hello');
            createButton(el).click();
            await until(() => editorOf(el)?.state === 'editing', 'the editor');
            retype(el, 'First post.', 0);
            await submit(el);
            return expect(fake.read('content/blog/hello.md', 'cms/blog/hello'))
                .toBe('First post.\n');
        });

        it('does not open an editor for a route the person has left',
           async function() {
            /* The collision check is a round trip, and somebody who
               changes their mind during it clicks back to the list.
               Without the navigation token the read arrives afterwards
               and mounts an editor over whatever is on screen -- and
               the next Submit writes the abandoned entry. */
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
            return expect(editorOf(el)).toBe(null);
        });

        it('refuses a name that is already taken, before opening anything',
           async function() {
            /* The check that saves the afternoon. `saveEntry` checks
               again at write time and that is the one that settles a
               race between two authors -- but only this one runs before
               somebody has spent an hour in the editor. */
            const {el, fake} = await openNew({seed: {[HELLO]: SEED}});
            typeTitle(el, 'Hello');
            createButton(el).click();
            await until(() => alertText(el) !== '', 'the refusal');

            expect(alertText(el)).toContain('already an entry with that name');
            expect(alertText(el)).toContain(HELLO);
            expect(editorOf(el)).toBe(null);
            return expect(fake.read(HELLO)).toBe(SEED);
        });

        it('refuses a name a pull request has already claimed',
           async function() {
            /* The file is not on the base branch at all -- somebody
               else's unmerged pull request creates it. Checking the base
               alone would open a second editor on the same slug, and the
               second save would commit onto the first author's branch. */
            const fake = createFakeGitHub({files: {}});
            fake.openPull('blog', 'hello');
            const {el} = await openNew({fake});
            typeTitle(el, 'Hello');
            createButton(el).click();
            await until(() => alertText(el) !== '', 'the refusal');

            expect(alertText(el)).toContain('already an entry with that name');
            return expect(editorOf(el)).toBe(null);
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
            await until(() => editorOf(el) !== null, 'the editor');
            return expect(editorOf(el)).not.toBe(null);
        });
    });

    // --- the first save ----------------------------------------------------

    describe('the first save', function() {

        /** Name `title`, wait for the editor, and type `body` into it. */
        async function start(title, body, options = {}) {
            const opened = await openNew(options);
            typeTitle(opened.el, title);
            createButton(opened.el).click();
            await until(() => editorOf(opened.el)?.state === 'editing', 'the editor');
            retype(opened.el, body, 0);
            return opened;
        }

        it('writes the file at the expanded path, on its own branch, with a pull request',
           async function() {
            const {el, fake} = await start('Hello World!', 'First post.');
            await submit(el);

            expect(fake.branches()).toEqual(['cms/blog/hello-world', 'main']);
            expect(fake.read('content/blog/hello-world.md', 'cms/blog/hello-world'))
                .toBe('First post.\n');
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

        it('moves the address bar to the entry without tearing the editor down',
           async function() {
            /* The entry is real now, so the hash catches up with it --
               in place. A navigation here would throw away the editor
               the person is still looking at and fetch back the bytes it
               just sent. */
            const {el} = await start('Hello World!', 'First post.');
            const before = editorOf(el);
            await submit(el);

            expect(location.hash).toBe('#/c/blog/e/hello-world');
            expect(editorOf(el)).toBe(before);
            return expect(editorOf(el).state).toBe('editing');
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
            retype(el, 'Second thoughts.', 0);
            await submit(el);

            expect(fake.pulls().length).toBe(1);
            expect(fake.history('cms/blog/hello-world').length).toBe(3);
            expect(fake.read('content/blog/hello-world.md', 'cms/blog/hello-world'))
                .toBe('Second thoughts.\n');
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

        /** Open `hello` with whatever config, and wait for the editor. */
        async function openHello(yaml = DELETABLE, files = {[HELLO]: SEED}) {
            const fake = createFakeGitHub({files});
            const {el} = await open('#/c/blog/e/hello', {fake, files: filesFor(yaml)});
            await until(() => editorOf(el)?.state === 'editing', 'the editor');
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
            return expect(editorOf(el)).not.toBe(null);
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
            await until(() => editorOf(el)?.state === 'editing', 'the editor');
            deleteButton(el).click();
            expect(confirmPanel(el).hidden).toBe(false);

            const first = editorOf(el);
            location.hash = '#/c/blog/e/other';
            /* A different element, not merely one that is editing: the
               first editor is still on the page and still editing until
               the second entry's read comes back, so waiting on the
               state alone returns before anything has happened. */
            await until(() => editorOf(el) !== null && editorOf(el) !== first,
                        'the next editor');
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
            expect(editorOf(el)).toBe(null);
            expect(alertText(el)).toContain('pull request #1');
            return expect(alertText(el)).toContain('stays on the site');
        });

        it('releases the editor lease on the way out', async function() {
            /* An editor left behind is invisible, still connected, and
               holding the one-per-page lease for the rest of the
               session -- so every later entry refuses to open with
               nothing in any stack trace. */
            const {el, fake} = await openHello();
            deleteButton(el).click();
            confirmButton(el).click();
            await until(() => fake.pulls().length === 1, 'the pull request');
            return expect(ContentTools.EditorApp.current()).toBe(null);
        });

        it('simply abandons an entry that was never saved', async function() {
            /* There is no file anywhere, so there is nothing to open a
               pull request about. Asking the repository to delete a path
               it has never held gets a correct refusal, which reads as a
               failure to do something that had already happened. */
            const {el, fake} = await openNew({yaml: DELETABLE});
            typeTitle(el, 'Hello');
            createButton(el).click();
            await until(() => editorOf(el)?.state === 'editing', 'the editor');

            deleteButton(el).click();
            confirmButton(el).click();
            await until(() => editorOf(el) === null, 'the editor to go');

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
            await until(() => editorOf(el)?.state === 'editing', 'the editor');

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
            await until(() => editorOf(el)?.state === 'editing', 'the editor');

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
