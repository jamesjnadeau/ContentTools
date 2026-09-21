import {
    alertText, createFakeGitHub, forgetToken, mountShell, settled, shellFetch,
    signIn, until, CONFIG_URL, CONFIG_YAML
} from './helpers.js';
import {TOKEN_KEY} from '../../../src/auth/pat.js';

/* `<content-tools-cms>`, end to end against an in-memory GitHub.
 *
 * Everything asserted here fails QUIETLY when it is wrong, which is the
 * only reason each of these is a test: a shell that logs to the console and
 * renders nothing looks idle rather than broken; a config error swallowed
 * into "something went wrong" costs the operator the one coordinate they
 * could have acted on; a token kept after a 401 means the gate never comes
 * back, so the single fix is never offered.
 *
 * Note that this suite loads the whole library through
 * `test/browser/setup-globals.js`, so a green run here says nothing about
 * whether `dist/shell.js` resolves its own imports. That is what
 * `test/golden/shell-dist.spec.mjs` is for, and the reason it exists is
 * that `dist/element.js` once shipped throwing on `start()` with 662 green
 * tests behind it.
 */

describe('content-tools-cms', function() {

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
        /* The hash is page state, so a test that navigates leaves the
           next one mounting into its route. replaceState rather than
           `location.hash = ''`, which leaves a bare '#' behind and fires
           a hashchange into whatever mounts next. */
        history.replaceState(null, '', location.pathname + location.search);
    });

    async function mount(options) {
        mounted = await mountShell(options);
        return mounted;
    }

    it('registers the tag', function() {
        expect(customElements.get('content-tools-cms')).toBeTruthy();
    });

    it('shows the gate before anything else', async function() {
        const {el, shadow} = await mount();
        expect(el.getAttribute('state')).toBe('signed-out');
        expect(shadow.querySelector('.ct-cms__gate')).not.toBe(null);
        // The repository, named on the gate: one build serves many sites,
        // so it is not something a person can infer from the page, and
        // they are about to scope a token to it.
        expect(shadow.querySelector('.ct-cms__gate-repo').textContent).toBe('owner/site');
    });

    it('names the permissions a token needs', async function() {
        // A token scoped without them comes back 404 -- GitHub answers 404
        // rather than 403 for a repository a token cannot see -- and a 404
        // reads as "that repository is gone", which leads nowhere.
        const {shadow} = await mount();
        const permissions = shadow.querySelector('.ct-cms__gate-permissions').textContent;
        expect(permissions).toContain('Contents');
        expect(permissions).toContain('Pull requests');
        const link = shadow.querySelector('.ct-cms__gate a');
        expect(link.getAttribute('href'))
            .toBe('https://github.com/settings/personal-access-tokens/new');
        // The opened page gets a handle on this one otherwise, and this
        // one is holding a token.
        expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('shows exactly ONE screen, as the page renders it', async function() {
        /* `hidden` is a property, and every assertion in this file that
           reads it would pass while both screens were on the page: the
           shell's own `display: flex` on `.ct-cms` and `.ct-cms__gate`
           beats the UA stylesheet's `[hidden] { display: none }`, because
           an author rule beats a UA rule at any specificity. So this asks
           the one question those cannot -- what a person sees. */
        const {el, shadow} = await mount();
        const display = selector =>
            getComputedStyle(shadow.querySelector(selector)).display;

        expect(display('.ct-cms')).toBe('none');
        expect(display('.ct-cms__gate')).not.toBe('none');

        await signIn(el);
        expect(display('.ct-cms')).not.toBe('none');
        return expect(display('.ct-cms__gate')).toBe('none');
    });

    it('reaches the chrome once a token is given', async function() {
        const {el, shadow} = await mount();
        await signIn(el);

        expect(el.getAttribute('state')).toBe('ready');
        expect(shadow.querySelector('.ct-cms').hidden).toBe(false);
        expect(shadow.querySelector('.ct-cms__gate').hidden).toBe(true);
        expect(shadow.querySelector('.ct-cms__repo').textContent).toBe('owner/site');

        const links = [...shadow.querySelectorAll('.ct-cms__nav-link')];
        /* The media folder and the review list come after the
           collections, each under its own heading, because neither is
           one. A media row among them would offer a "New entry" link
           for a folder that holds no entries; a review row would ask
           which collection it belongs to, and the answer is all of
           them. */
        expect(links.map(a => a.textContent))
            .toEqual(['Blog', 'Pages', 'Media', 'In review']);
        // Real hrefs, not click handlers: this is what makes a collection
        // linkable, reloadable and reachable from the keyboard.
        expect(links.map(a => a.getAttribute('href')))
            .toEqual(['#/c/blog', '#/c/pages', '#/media', '#/review']);
    });

    it('refuses an empty token rather than signing in with nothing', async function() {
        // A client built around a missing token fails later, at a request,
        // where the error says 401 and not "you have not signed in".
        const {el, shadow} = await mount();
        shadow.querySelector('.ct-cms__gate-form')
            .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(el.getAttribute('state')).toBe('signed-out');
    });

    it('keeps what was typed when a sign-in is refused', async function() {
        /* The gate is built once and updated, never rebuilt. Rebuilding
           would wipe the field at the exact moment the person needs to
           look at what they pasted. Asserted through node identity,
           because a rebuilt gate is structurally identical. */
        const {shadow} = await mount();
        const before = shadow.querySelector('.ct-cms__input');
        before.value = 'half-pasted';
        shadow.querySelector('.ct-cms__gate-form')
            .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(shadow.querySelector('.ct-cms__input')).toBe(before);
        expect(before.value).toBe('half-pasted');
    });

    it('renders a ConfigError with its PATH on the page', async function() {
        /* The operator's likeliest failure by a distance is a typo in a
           hand-edited config file, and the path is the one thing in the
           message they can go and act on. Swallowing it into "something
           went wrong" costs exactly that. */
        const broken = CONFIG_YAML.replace('folder: content/blog', 'folder: 7');
        const {el, shadow} = await mount({files: {[CONFIG_URL]: broken}});

        expect(el.getAttribute('state')).toBe('unconfigured');
        expect(shadow.querySelector('.ct-cms__alert-path').textContent)
            .toBe('collections[0].folder');
        // And no gate: there is no repository to name and no permissions
        // to list, so asking for a token would be asking for one scoped to
        // a repository the page cannot say.
        expect(shadow.querySelector('.ct-cms__gate-form')).toBe(null);
    });

    it('says which attribute is missing when there is no config at all', async function() {
        const {el, shadow} = await mount({config: null});
        expect(el.getAttribute('state')).toBe('unconfigured');
        expect(alertText(el)).toContain('config');
        expect(shadow.querySelector('.ct-cms__alert-path').textContent).toBe('config');
    });

    it('reports a config file that does not load', async function() {
        const {el} = await mount({files: {[CONFIG_URL]: 404}});
        expect(el.getAttribute('state')).toBe('unconfigured');
        expect(alertText(el)).toContain('404');
    });

    it('refuses a token GitHub rejects, without leaving the gate', async function() {
        /* The token is checked HERE, next to the field that produced it
           and the permissions written beside that field. Without the
           check the first thing a bad token does is fail a listing
           several screens away, where the only thing on offer is a 401. */
        const {el, shadow} = await mount();
        el.fetch = async () => new Response(
            JSON.stringify({message: 'Bad credentials'}), {status: 401});

        shadow.querySelector('.ct-cms__input').value = 'github_pat_wrong';
        shadow.querySelector('.ct-cms__gate-form')
            .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        await until(() => alertText(el) !== '', 'the refusal to be reported');

        expect(el.getAttribute('state')).toBe('signed-out');
        expect(alertText(el)).toContain('token');
    });

    it('drops the rejected token, so the gate is reachable again', async function() {
        /* A 401 that leaves the token in storage means the gate never
           comes back: the shell renders as signed IN on the next visit,
           fails every request, and the one fix -- a new token -- is
           never offered. `currentToken()` is read at render time for
           exactly this reason, so dropping it IS the way back. */
        const {el, shadow} = await mount();
        el.fetch = async () => new Response(
            JSON.stringify({message: 'Bad credentials'}), {status: 401});
        shadow.querySelector('.ct-cms__input').value = 'github_pat_wrong';
        shadow.querySelector('.ct-cms__gate-form')
            .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        await until(() => alertText(el) !== '', 'the refusal');

        expect(sessionStorage.getItem(TOKEN_KEY)).toBe(null);

        // And a good token still gets in, from the same gate.
        el.fetch = shellFetch(mounted.fake);
        await signIn(el, 'github_pat_good');
        expect(el.getAttribute('state')).toBe('ready');
    });

    it('refuses a read-only token at the gate, not at the first save', async function() {
        /* The worst-shaped failure the gate can catch: a token that reads
           everything, so the whole shell works, until a save fails with
           somebody's afternoon in the editor. The API answers 200 and
           says no in the body, which is why this is checked by value
           rather than caught. */
        const fake = createFakeGitHub();
        const {el, shadow} = await mount({fake});
        const real = el.fetch;
        el.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : String(input.url ?? input);
            if (/\/repos\/owner\/site$/.test(url)) {
                return new Response(
                    JSON.stringify({default_branch: 'main', permissions: {push: false}}),
                    {status: 200, headers: {'content-type': 'application/json'}});
            }
            return real(input, init);
        };

        shadow.querySelector('.ct-cms__input').value = 'github_pat_readonly';
        shadow.querySelector('.ct-cms__gate-form')
            .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        await until(() => alertText(el) !== '', 'the refusal');

        expect(el.getAttribute('state')).toBe('signed-out');
        expect(alertText(el)).toContain('cannot write');
        expect(sessionStorage.getItem(TOKEN_KEY)).toBe(null);
    });

    it('still boots when the hash changes while the config is loading', async function() {
        /* A regression with no error and no stack: a navigation arriving
           mid-boot used to make the config load's own staleness check
           fail, so the load completed and rendered nothing. The shell sat
           on "Loading" for ever. A person's only clue would have been
           that clicking a link during startup broke the whole page. */
        const fake = createFakeGitHub();
        let release = null;
        const slow = new Promise(resolve => { release = resolve; });
        const base = shellFetch(fake);

        const el = document.createElement('content-tools-cms');
        el.fetch = async (input, init) => {
            await slow;
            return base(input, init);
        };
        el.setAttribute('config', CONFIG_URL);
        document.body.appendChild(el);
        const shadow = el.shadowRoot;
        mounted = {el, fake, shadow};

        location.hash = '#/c/blog';
        await until(() => el.getAttribute('state') === 'loading', 'the loading screen');
        release();

        await settled(el);
        expect(el.getAttribute('state')).toBe('signed-out');
        // And the loading panel is gone rather than merely overtaken: two
        // full-screen panels stacked in one shadow root leaves whichever
        // is second in the DOM on top, which is nobody's intent.
        expect(shadow.querySelector('.ct-cms__gate-panel .ct-cms__note')
                     .closest('.ct-cms__gate').hidden).toBe(true);
    });

    it('writes nothing into its own light DOM', async function() {
        /* The host's light DOM belongs to the editor element, and only to
           it: `<content-tools-editor>` is a light-DOM CHILD of this host
           rendered through a slot, because nesting it in a second shadow
           root retargets `document.getSelection()` and puts the caret in
           the wrong place with nothing thrown. A shell that renders chrome
           into its own children would collide with that. */
        const {el} = await mount();
        expect(el.childNodes).toHaveLength(0);
        await signIn(el);
        expect(el.childNodes).toHaveLength(0);
    });

    it('keeps the editor slot across every render', async function() {
        /* The failure this prevents has no stack trace: an editor slotted
           into a slot a re-render replaced is invisible but still
           connected, so it holds the one-per-page EditorApp lease forever
           and every entry opened afterwards refuses to open. */
        const {el, shadow} = await mount();
        const slot = shadow.querySelector('slot[name="editor"]');
        expect(slot).not.toBe(null);

        await signIn(el);
        el.ownerDocument.defaultView.location.hash = '#/c/blog';
        await until(() => shadow.querySelector('.ct-cms__heading').textContent === 'Blog',
                    'the collection view');

        expect(shadow.querySelector('slot[name="editor"]')).toBe(slot);
        expect(slot.isConnected).toBe(true);
    });

    it('follows the hash to a collection, and marks it current', async function() {
        const {el, shadow} = await mount();
        await signIn(el);

        el.ownerDocument.defaultView.location.hash = '#/c/pages';
        await until(() => shadow.querySelector('.ct-cms__heading').textContent === 'Pages',
                    'the pages collection');

        const current = shadow.querySelector('.ct-cms__nav-link--current');
        expect(current.textContent).toBe('Pages');
        // A class says nothing to a screen reader, and the highlight is
        // the only thing saying where you are.
        expect(current.getAttribute('aria-current')).toBe('page');
    });

    it('keeps the nav nodes across a navigation', async function() {
        // Keyed reconciliation, asserted by identity. A rebuild would
        // produce nav that looks identical while losing keyboard focus on
        // every route change.
        const {el, shadow} = await mount();
        await signIn(el);
        const before = [...shadow.querySelectorAll('.ct-cms__nav-link')];

        el.ownerDocument.defaultView.location.hash = '#/c/blog';
        await until(() => shadow.querySelector('.ct-cms__nav-link--current') !== null,
                    'a current collection');

        const after = [...shadow.querySelectorAll('.ct-cms__nav-link')];
        expect(after[0]).toBe(before[0]);
        expect(after[1]).toBe(before[1]);
    });

    it('says what it could not read, rather than showing the dashboard', async function() {
        // Falling back to home for an unrecognised hash renders the root,
        // which is indistinguishable from the root -- so a stale bookmark
        // reads as "that entry was deleted".
        const {el, shadow} = await mount();
        await signIn(el);
        el.ownerDocument.defaultView.location.hash = '#/nonsense';
        await until(() => shadow.querySelector('.ct-cms__heading').textContent === 'Not found',
                    'the not-found view');
        expect(shadow.querySelector('.ct-cms__view').textContent).toContain('#/nonsense');
    });

    it('names a collection the config no longer has', async function() {
        const {el, shadow} = await mount();
        await signIn(el);
        el.ownerDocument.defaultView.location.hash = '#/c/gone';
        await until(() => shadow.querySelector('.ct-cms__heading')
                              .textContent === 'No such collection',
                    'the missing-collection view');
        expect(shadow.querySelector('.ct-cms__view').textContent).toContain('gone');
    });

    it('signs out back to the gate', async function() {
        const {el, shadow} = await mount();
        await signIn(el);
        shadow.querySelector('.ct-cms__button--muted').click();
        await until(() => el.getAttribute('state') === 'signed-out', 'the gate');
        expect(shadow.querySelector('.ct-cms').hidden).toBe(true);
    });

    it('treats a whitespace-only token exactly like an empty one', async function() {
        // A pasted token comes with a trailing newline about as often as
        // not, so whitespace is trimmed rather than offered to the
        // adapter -- otherwise a stray space produces "no token was
        // given" as if the person had submitted nothing, which is a
        // different and more confusing failure from the silent refusal.
        const {el, shadow} = await mount();
        shadow.querySelector('.ct-cms__input').value = '   ';
        shadow.querySelector('.ct-cms__gate-form')
            .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(el.getAttribute('state')).toBe('signed-out');
        expect(alertText(el)).toBe('');
    });

    it('stops the form submitting the page', async function() {
        /* Without preventDefault the browser navigates -- to the same URL
           with an empty query string -- which reloads the shell and
           discards the token before it is ever read. The user sees the
           gate again and concludes their token was rejected. */
        const {shadow} = await mount();
        shadow.querySelector('.ct-cms__input').value = 'github_pat_test';
        const submitted = shadow.querySelector('.ct-cms__gate-form')
            .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        expect(submitted).toBe(false);
    });

    it('does not read an absent `permissions` as a refusal', async function() {
        // GitHub omits the block for some token types. A check that
        // refuses tokens it cannot assess is worse than the failure it
        // prevents: nobody could sign in at all.
        const fake = createFakeGitHub();
        const {el} = await mount({fake});
        const real = el.fetch;
        el.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : String(input.url ?? input);
            if (/\/repos\/owner\/site$/.test(url)) {
                return new Response(JSON.stringify({default_branch: 'main'}),
                    {status: 200, headers: {'content-type': 'application/json'}});
            }
            return real(input, init);
        };
        await signIn(el);
        expect(el.getAttribute('state')).toBe('ready');
    });

    it('moves `aria-current` rather than accumulating it', async function() {
        // Two links both claiming to be the current page is worse than
        // none: a screen reader reads the wrong one and there is nothing
        // visually wrong to notice.
        const {el, shadow} = await mount();
        await signIn(el);
        location.hash = '#/c/blog';
        await until(() => shadow.querySelector('[aria-current]') !== null, 'blog current');
        location.hash = '#/c/pages';
        await until(() => shadow.querySelector('[aria-current]')?.textContent === 'Pages',
                    'pages current');
        expect(shadow.querySelectorAll('[aria-current]')).toHaveLength(1);
        expect(shadow.querySelectorAll('.ct-cms__nav-link--current')).toHaveLength(1);

        /* The media folder is under its own heading and outside the
           keyed list the collections are reconciled through, so it
           carries the highlight by its own code path -- which is the
           reason it is asserted here rather than assumed to follow. */
        location.hash = '#/media';
        await until(() => shadow.querySelector('[aria-current]')?.textContent === 'Media',
                    'media current');
        expect(shadow.querySelectorAll('[aria-current]')).toHaveLength(1);
        expect(shadow.querySelectorAll('.ct-cms__nav-link--current')).toHaveLength(1);

        location.hash = '#/c/blog';
        await until(() => shadow.querySelector('[aria-current]')?.textContent === 'Blog',
                    'blog current again');
        expect(shadow.querySelectorAll('[aria-current]')).toHaveLength(1);
    });

    it('replaces an alert rather than stacking failures', async function() {
        /* Two rejected tokens in a row must leave ONE message. A region
           that appends keeps the first failure at the top, where it reads
           as the current problem, and the message that actually describes
           what just happened is below the fold. */
        const {el, shadow} = await mount();

        // Two DIFFERENT refusals, so the second is distinguishable from
        // the first still being on screen. Waiting for "an alert exists"
        // twice over would be satisfied immediately by the first one, and
        // would assert nothing.
        const attempts = [
            [401, 'rejected that token'],
            [404, 'cannot reach this repository']
        ];
        for (const [status, says] of attempts) {
            el.fetch = async () => new Response(
                JSON.stringify({message: 'no'}), {status});
            shadow.querySelector('.ct-cms__input').value = `github_pat_${status}`;
            shadow.querySelector('.ct-cms__gate-form')
                .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
            await until(() => alertText(el).includes(says), `the ${status} refusal`);
        }
        expect(shadow.querySelectorAll('.ct-cms__alert')).toHaveLength(1);
    });

    it('clears an alert once the failure is over', async function() {
        // An alert region that appends rather than replaces stacks every
        // failure of the session, and the oldest one sits at the top
        // where it reads as the current problem.
        const {el, shadow} = await mount();
        el.fetch = async () => new Response(
            JSON.stringify({message: 'Bad credentials'}), {status: 401});
        shadow.querySelector('.ct-cms__input').value = 'github_pat_wrong';
        shadow.querySelector('.ct-cms__gate-form')
            .dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
        await until(() => alertText(el) !== '', 'the refusal');
        // A GitHub failure has no config path; rendering an empty one
        // puts a blank monospaced line in the middle of the message.
        expect(shadow.querySelector('.ct-cms__alert-path')).toBe(null);

        el.fetch = shellFetch(mounted.fake);
        await signIn(el);
        expect(alertText(el)).toBe('');
        expect(shadow.querySelectorAll('.ct-cms__alert')).toHaveLength(0);
    });

    it('stops saying it is loading once it has failed', async function() {
        const {shadow} = await mount({files: {[CONFIG_URL]: 404}});
        const note = shadow.querySelector('.ct-cms__gate-panel .ct-cms__note');
        expect(note.hidden).toBe(true);
    });

    it('goes straight in for an adapter that already holds a token', async function() {
        /* The seam M4's GitHub App adapter arrives through: a host page
           assigns an adapter that has already completed its own flow.
           Signed-in-ness is derived at render time, so the assignment has
           to re-render -- otherwise the shell sits at a gate for a token
           it is already holding, and nothing but an unrelated navigation
           would ever move it. */
        const {el} = await mount();
        expect(el.getAttribute('state')).toBe('signed-out');
        el.auth = {
            currentToken: () => 'already-held',
            authenticate: async () => ({token: 'already-held'}),
            logout: async () => {}
        };
        expect(el.getAttribute('state')).toBe('ready');
    });

    it('reports a failing sign-out in the chrome, and clears it on a move',
       async function() {
        /* `auth` is a settable property so M4's GitHub App adapter drops
           in without forking the shell -- and that adapter's logout goes
           over the network, so it can fail. A sign-out that silently does
           nothing leaves somebody believing they have signed out of a tab
           that still holds a token.

           The clearing half matters as much: an alert about the screen
           you just left, still on screen over the one you just opened,
           reads as a fresh failure of the new one. */
        const {el, shadow} = await mount();
        await signIn(el);
        el.auth = {
            currentToken: () => 'still-here',
            authenticate: async () => ({token: 'still-here'}),
            logout: async () => { throw new Error('could not revoke the token'); }
        };

        shadow.querySelector('.ct-cms__button--muted').click();
        await until(() => alertText(el) !== '', 'the sign-out failure');
        expect(el.getAttribute('state')).toBe('ready');
        expect(shadow.querySelector('.ct-cms__main .ct-cms__alert')).not.toBe(null);
        expect(alertText(el)).toContain('could not revoke the token');

        location.hash = '#/c/blog';
        await until(() => alertText(el) === '', 'the alert to clear');
    });

    it('adopts its stylesheet into its own root', async function() {
        const {shadow} = await mount();
        expect(shadow.adoptedStyleSheets.length).toBe(1);
    });

    it('adopts it once, however many times it is connected', async function() {
        // A shell moved in the DOM -- which a framework does routinely --
        // would otherwise accumulate a copy of its own stylesheet per
        // move, silently growing the style resolution it does on every
        // render.
        const {el, shadow} = await mount();
        el.remove();
        document.body.appendChild(el);
        expect(shadow.adoptedStyleSheets.length).toBe(1);
    });

    it('loads the config once, however many times it is connected', async function() {
        const fake = createFakeGitHub();
        const base = shellFetch(fake);
        let loads = 0;
        const el = document.createElement('content-tools-cms');
        el.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : String(input.url ?? input);
            if (url === CONFIG_URL) {
                loads += 1;
            }
            return base(input, init);
        };
        el.setAttribute('config', CONFIG_URL);
        document.body.appendChild(el);
        mounted = {el, fake, shadow: el.shadowRoot};
        await settled(el);

        el.remove();
        document.body.appendChild(el);
        await settled(el);
        expect(loads).toBe(1);
    });

    it('stops following the hash once it is removed', async function() {
        // A listener on the window outlives the element that added it,
        // so a removed shell keeps re-rendering in the background --
        // invisible, and holding on to everything it references.
        const {el, shadow} = await mount();
        await signIn(el);
        const before = shadow.querySelector('.ct-cms__heading').textContent;
        el.remove();
        location.hash = '#/c/pages';
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(shadow.querySelector('.ct-cms__heading').textContent).toBe(before);
    });

    it('builds a repo client pointed at the configured repository', async function() {
        const {el} = await mount();
        expect(el.repo.github.owner).toBe('owner');
        expect(el.repo.github.name).toBe('site');
        expect(el.repo.base).toBe('main');
    });
});
