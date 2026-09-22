/* What happens to somebody's writing when the token dies under it.
 *
 * The realistic expiry is not "expires while typing". It is: an author
 * writes a post, presses Submit, and the save comes back 401 -- because
 * the save path is the one that re-throws what it cannot handle, so
 * `_guard` can drop the token, so the gate can come back. Before this
 * sub-phase the answer was to throw the post away and show a sign-in
 * form, which is data loss with a button on it. That was already true of
 * a revoked personal access token; the App adapter's eight-hour session
 * turns it from rare into a routine Tuesday, and a decision that makes
 * an existing loss routine owns the mitigation.
 *
 * The draft is kept in `sessionStorage` as well as in a field, because
 * the App adapter signs somebody in by LEAVING the page. And it lives
 * exactly as long as the gate does: signing back in ends it, by either
 * route.
 */
import {
    createFakeGitHub, entryOf, forgetToken, mountShell, openAt, openedEntry,
    setField, settled, shellFetch, signIn, until, CONFIG_URL
} from './helpers.js';
import {RESCUE_KEY} from '../../../src/shell/content-tools-cms.js';
import {TOKEN_KEY} from '../../../src/auth/pat.js';
import {APP_TOKEN_KEY, SignInError} from '../../../src/auth/github-app.js';

const SEED = '---\ntitle: Hello\ndraft: false\n---\n\n# Hello\n\nWorld.\n';
const ENTRY = 'content/blog/hello.md';

/** What the gate is holding, or null when the panel is not showing. */
function rescued(el) {
    const panel = el.shadowRoot.querySelector('.ct-cms__gate-rescue');
    return panel.hidden
        ? null
        : panel.querySelector('.ct-cms__conflict-text').value;
}

describe('rescuing a draft from a refused save', function() {

    let mounted = null;

    beforeEach(function() {
        forgetToken();
        sessionStorage.removeItem(RESCUE_KEY);
    });

    afterEach(function() {
        if (mounted) {
            mounted.el.remove();
            mounted = null;
        }
        forgetToken();
        sessionStorage.removeItem(RESCUE_KEY);
        location.hash = '';
        history.replaceState(null, '', location.pathname);
    });

    /**
     * Open the entry, edit it, and have the next write come back 401.
     *
     * Reads are left alone on purpose: the sign-in check and the entry
     * read both have to succeed, or the test never reaches a save.
     */
    async function revokeMidSave(title = 'Goodbye', drafts = null) {
        const fake = createFakeGitHub({files: {[ENTRY]: SEED}});
        const real = shellFetch(fake);
        let revoked = false;
        mounted = await openAt('#/c/blog/e/hello', {
            fake,
            fetch: async (input, init) => {
                if (revoked && init?.method && init.method !== 'GET') {
                    return new Response(JSON.stringify({message: 'Bad credentials'}),
                                        {status: 401});
                }
                return real(input, init);
            }
        });
        await openedEntry(mounted.el);

        /* Reaching past `private` on purpose, and only here: the field
           is a `TokenStorage` with no setter, because nothing in the
           product has a reason to choose one. A refusing storage is a
           real state -- a full quota, a tab put in a mode that forbids
           writes -- and there is no other way into it. */
        if (drafts) {
            mounted.el._drafts = drafts;
        }

        setField(mounted.el, 'title', title);
        revoked = true;
        mounted.el.shadowRoot.querySelector('.ct-cms__entry-submit').click();
        await until(() => mounted.el.getAttribute('state') === 'signed-out',
                    'the gate to come back');
        return mounted;
    }

    it('shows what the save was carrying', async function() {
        const {el} = await revokeMidSave();

        const draft = rescued(el);
        /* The whole file, which is what a save writes -- not the body
           and not the region's HTML. Somebody copying this out has the
           thing they can paste back. */
        expect(draft).toContain('title: Goodbye');
        /* The WHOLE file, body included -- a save writes the file, and
           a pane holding only the part that changed is a pane nobody
           can paste back. */
        expect(draft).toContain('World.');
        /* And the entry really is gone with the token, so this pane is
           the only copy left anywhere on the page. */
        return expect(entryOf(el)).toBe(null);
    });

    it('is hidden when there is nothing to rescue, and hidden means invisible',
       async function() {
        /* The M5-2 lesson, a third time: this panel inherits
           `display: flex` from the rule it shares with the conflict and
           confirm panels, an author rule beats the UA stylesheet's
           `[hidden]`, and the property reads back true either way. An
           empty warning-bordered box above the sign-in field is a
           person being told something went wrong on the way in. */
        mounted = await mountShell();
        const panel = mounted.shadow.querySelector('.ct-cms__gate-rescue');

        expect(panel.hidden).toBe(true);
        return expect(getComputedStyle(panel).display).toBe('none');
    });

    it('rescues nothing when the refusal had no entry behind it',
       async function() {
        /* A 401 on a listing goes down the same branch with nothing to
           capture, so it must not leave an empty warning pane on the
           way back to the gate. That the same branch must not WIPE a
           draft it found nothing to replace is the other half, and it
           is asserted where it can actually happen -- "still has it
           when the redirect did not finish", below. */
        const fake = createFakeGitHub({files: {[ENTRY]: SEED}});
        const real = shellFetch(fake);
        let revoked = false;
        mounted = await mountShell({
            fake,
            fetch: async (input, init) => {
                if (revoked && String(input).includes('/contents/')) {
                    return new Response(JSON.stringify({message: 'Bad credentials'}),
                                        {status: 401});
                }
                return real(input, init);
            }
        });
        await signIn(mounted.el);
        revoked = true;

        location.hash = '#/c/blog';
        await until(() => mounted.el.getAttribute('state') === 'signed-out',
                    'the gate to come back');

        return expect(rescued(mounted.el)).toBe(null);
    });

    it('survives the trip to GitHub', async function() {
        /* The App adapter signs somebody in by leaving the page, so a
           field would not be there when the browser came back. This is
           the same thing a reload does, which is why a reload is how it
           is asserted. */
        const {el} = await revokeMidSave('Still here.');
        el.remove();
        mounted = null;

        mounted = await mountShell();

        expect(mounted.el.getAttribute('state')).toBe('signed-out');
        return expect(rescued(mounted.el)).toContain('Still here.');
    });

    it('is over once they are back in', async function() {
        /* A draft that outlives the screen it is shown on is a draft
           nobody can reach -- and one that reappears on a gate hours
           later, attached to nothing the person can place. */
        const {el} = await revokeMidSave();
        expect(rescued(el)).not.toBe(null);

        await signIn(el);

        expect(sessionStorage.getItem(RESCUE_KEY)).toBe(null);
        expect(rescued(el)).toBe(null);
        /* And the box is empty, not merely hidden. A textarea still
           holding the post after the shell said it had let go of it is
           somebody's unpublished writing left in the DOM of a page
           anyone at that desk can open the inspector on. */
        return expect(
            el.shadowRoot.querySelector(
                '.ct-cms__gate-rescue .ct-cms__conflict-text').value
        ).toBe('');
    });

    it('still shows the draft when storage refuses to take it',
       async function() {
        /* The screen is worth more than the trip. If `setItem` throws
           and nothing catches it, the throw lands in `_guard` -- which
           is ALREADY handling the 401 -- so the quota error replaces
           the sign-in message, the gate never says what happened, and
           the post is gone twice over. What is actually lost here is
           only surviving a reload, which is worth strictly less than
           the box it is being shown in. */
        const {el} = await revokeMidSave('Nowhere to put it.', {
            getItem: () => null,
            setItem: () => { throw new Error('QuotaExceededError'); },
            removeItem: () => {}
        });

        expect(rescued(el)).toContain('Nowhere to put it.');
        /* And it is still the sign-in that is being explained. */
        return expect(
            el.shadowRoot.querySelector('.ct-cms__gate').textContent
        ).not.toContain('Quota');
    });

    it('is kept somewhere neither adapter is keeping a token',
       async function() {
        /* Three things share one `sessionStorage`, and a name is all
           that keeps them apart. Collide the draft with a token and
           letting go of the draft DELETES THE TOKEN -- `_rescue(null)`
           removes the key, and it runs on the very sign-in that just
           wrote one. Nothing throws; the shell signs somebody in and
           the next reload asks again, for ever.

           Asserted on the constants rather than through a flow,
           because both adapters hold their token in a field as well,
           so a collision is invisible until a page that reloads. */
        expect(RESCUE_KEY).not.toBe(TOKEN_KEY);
        return expect(RESCUE_KEY).not.toBe(APP_TOKEN_KEY);
    });

    it('boots to a gate when storage refuses to be read', async function() {
        /* The other half, and the sharper one: a `getItem` that throws
           lands in `_guard` from `_loadConfig`, so the whole shell
           comes up as a failed deployment -- a person who cannot sign
           in at all, because of a draft they never asked to keep.
           Assigned before the element is connected, which is when the
           boot reads it. */
        const el = document.createElement('content-tools-cms');
        el.fetch = shellFetch(createFakeGitHub());
        el._drafts = {
            getItem: () => { throw new Error('SecurityError'); },
            setItem: () => {},
            removeItem: () => {}
        };
        el.setAttribute('config', CONFIG_URL);
        document.body.appendChild(el);
        mounted = {el, shadow: el.shadowRoot};
        await settled(el);

        expect(el.getAttribute('state')).toBe('signed-out');
        expect(rescued(el)).toBe(null);
        /* And the gate is a gate, not an apology. Uncaught, the read
           fails `_loadConfig`, so the first thing a person sees is the
           browser's own wording for a storage they never knew was
           involved -- above a sign-in field that works perfectly. */
        return expect(
            el.shadowRoot.querySelector('.ct-cms__gate-form')
                .closest('.ct-cms__gate').textContent
        ).not.toContain('SecurityError');
    });

    it('cannot be typed into', async function() {
        /* It is a copy-out box, and the thing it must not look like is
           somewhere to carry on writing: the next sign-in ends the
           draft, so anything typed in here goes with it. `h()` sets
           ATTRIBUTES, and an attribute the platform does not recognise
           does nothing at all and looks exactly like one it does --
           which is why this asserts the property the browser resolved
           rather than the attribute the source spells. */
        const {el} = await revokeMidSave();
        const box = el.shadowRoot.querySelector(
            '.ct-cms__gate-rescue .ct-cms__conflict-text');

        return expect(box.readOnly).toBe(true);
    });
});

describe('a draft and a redirect that comes back', function() {

    let mounted = null;

    /** An App-shaped adapter whose resume is whatever the test needs. */
    function appStub(resume) {
        let held = null;
        return {
            gate: {label: 'Sign in with GitHub', note: 'Off to GitHub.'},
            currentToken: () => held,
            authenticate: async () => ({token: (held = 'ghu_stub')}),
            logout: async () => void (held = null),
            resume: async () => resume(() => void (held = 'ghu_stub'))
        };
    }

    async function mountWith(auth) {
        const el = document.createElement('content-tools-cms');
        el.fetch = shellFetch(createFakeGitHub());
        el.auth = auth;
        el.setAttribute('config', CONFIG_URL);
        document.body.appendChild(el);
        mounted = {el, shadow: el.shadowRoot};
        await settled(el);
        return mounted;
    }

    beforeEach(function() {
        forgetToken();
        sessionStorage.setItem(RESCUE_KEY, '---\ntitle: Hello\n---\n\nRescued.\n');
    });

    afterEach(function() {
        if (mounted) {
            mounted.el.remove();
            mounted = null;
        }
        forgetToken();
        sessionStorage.removeItem(RESCUE_KEY);
        history.replaceState(null, '', location.pathname);
    });

    it('lets go of the draft when the redirect signed them in',
       async function() {
        const {el} = await mountWith(appStub(grant => grant()));

        expect(el.getAttribute('state')).toBe('ready');
        return expect(sessionStorage.getItem(RESCUE_KEY)).toBe(null);
    });

    it('still has it when the redirect did not finish', async function() {
        /* The case the storage exists for. A resume can fail -- a state
           that does not match, a bookmarked callback, a proxy that is
           not deployed -- and the author is then at the same gate they
           left from, which had better still be holding their post. */
        const {el} = await mountWith(appStub(() => {
            throw new SignInError('That sign-in did not finish.');
        }));

        expect(el.getAttribute('state')).toBe('signed-out');
        return expect(rescued(el)).toContain('Rescued.');
    });
});
