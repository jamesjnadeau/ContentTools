/* The gate's second shape, and the boot that finishes a redirect.
 *
 * What is under test here is the SHELL's half of the App flow, not the
 * adapter's: which shape the gate takes, who decides, when `resume()` is
 * called and what the shell does with the address bar afterwards. The
 * adapter has thirty-six tests of its own in
 * `test/browser/auth/github-app.spec.js`, and the round trip through a
 * real redirect belongs to `shell-dist.spec.mjs`, where a navigation can
 * actually be intercepted.
 *
 * So the adapters here are stubs. That is not a shortcut around an
 * awkward dependency: the real one calls `location.assign`, which in this
 * page would take the test runner with it.
 *
 * The PAT path is not touched anywhere in this file, and `helpers.js`'s
 * `signIn` is not edited. If either needed to change, the gate's second
 * shape was not additive and that is the finding.
 */
import {
    alertText, createFakeGitHub, forgetToken, mountShell, settled, shellFetch,
    signIn, signInWithApp, until, CONFIG_URL, CONFIG_YAML
} from './helpers.js';
import {GitHubAppAuthAdapter} from '../../../src/auth/github-app.js';
import {
    APP_FLOW_KEY, APP_TOKEN_KEY, RedirectingError, SignInError
} from '../../../src/auth/github-app.js';

/** Forget anything the App adapter left in storage. */
function forgetApp() {
    sessionStorage.removeItem(APP_TOKEN_KEY);
    sessionStorage.removeItem(APP_FLOW_KEY);
}

/** The same config, with an App block bolted on. */
const APP_YAML = CONFIG_YAML.replace('  branch: main', `  branch: main
  auth:
    kind: github-app
    clientId: Iv1.testclient
    proxy: https://auth.example.com/exchange`);

/**
 * An adapter shaped like the App one, without the navigation.
 *
 * `token` is what it will hand over once signed in; `null` leaves it
 * refusing, which is what a redirect looks like from the shell's side.
 */
function appStub({token = 'ghu_stub', authenticate, resume, gate} = {}) {
    const calls = {authenticate: 0, logout: 0, resume: 0};
    let held = null;
    const stub = {
        calls,
        gate: gate === undefined
            ? {label: 'Sign in with GitHub', note: 'You will be taken to GitHub.'}
            : gate,
        currentToken: () => held,
        grant: () => void (held = token),
        authenticate: async () => {
            calls.authenticate += 1;
            if (authenticate) {
                return authenticate();
            }
            held = token;
            return {token};
        },
        logout: async () => {
            calls.logout += 1;
            held = null;
        }
    };
    if (resume !== null) {
        stub.resume = async () => {
            calls.resume += 1;
            await resume?.(stub);
        };
    }
    return stub;
}

describe('the gate, for an adapter that needs no secret', function() {

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

    async function mount(options) {
        mounted = await mountShell(options);
        return mounted;
    }

    const shown = (shadow, selector) => !shadow.querySelector(selector).hidden;

    it('offers a button where the adapter asks for one', async function() {
        const {el, shadow} = await mount();
        expect(shown(shadow, '.ct-cms__gate-pat')).toBe(true);

        el.auth = appStub();

        expect(shown(shadow, '.ct-cms__gate-app')).toBe(true);
        expect(shown(shadow, '.ct-cms__gate-pat')).toBe(false);
        return expect(shadow.querySelector('.ct-cms__gate-app-button').textContent)
            .toBe('Sign in with GitHub');
    });

    it('says what pressing it will do', async function() {
        /* The button on its own is a question: taken where, and back? A
           person who is about to leave a page holding their work is
           owed the sentence. */
        const {el, shadow} = await mount();

        el.auth = appStub({gate: {label: 'Continue', note: 'Off to GitHub and back.'}});

        return expect(shadow.querySelector('.ct-cms__gate-app').textContent)
            .toContain('Off to GitHub and back.');
    });

    it('goes back to the field when the adapter goes back', async function() {
        /* Both panels are built and one is hidden, rather than one being
           built on demand, so that swapping back is a toggle and not a
           rebuild -- and the field keeps whatever was typed into it. */
        const {el, shadow} = await mount();
        const input = shadow.querySelector('.ct-cms__input');
        input.value = 'github_pat_halfway';

        el.auth = appStub();
        el.auth = {
            currentToken: () => null,
            authenticate: async () => ({token: 'x'}),
            logout: async () => {}
        };

        expect(shown(shadow, '.ct-cms__gate-pat')).toBe(true);
        expect(shown(shadow, '.ct-cms__gate-app')).toBe(false);
        expect(shadow.querySelector('.ct-cms__input')).toBe(input);
        return expect(input.value).toBe('github_pat_halfway');
    });

    it('is hidden, and hidden means invisible', async function() {
        /* The M5-2 lesson, one level in: `hidden` is not self-enforcing
           where an author `display` rule exists, and the property reads
           back true either way. Only the computed style can see it. */
        const {el, shadow} = await mount();
        el.auth = appStub();

        const display = selector => getComputedStyle(
            shadow.querySelector(selector)).display;

        expect(display('.ct-cms__gate-pat')).toBe('none');
        return expect(display('.ct-cms__gate-app')).not.toBe('none');
    });

    it('shows a refusal beside the button, not on the panel it hid',
       async function() {
        /* The alert is a SIBLING of both panels rather than a child of
           either. Inside one, a refusal of an App sign-in would render
           into the hidden token form: still there, still readable by
           `textContent`, and invisible to the person it is addressed to.
           Which is why this reads the computed style -- every other
           assertion about an alert in this suite reads its text, and
           text is exactly what survives being hidden. */
        const {el, shadow} = await mount();
        el.auth = appStub({
            authenticate: () => {
                throw new SignInError('That sign-in did not finish.');
            }
        });

        shadow.querySelector('.ct-cms__gate-app-button').click();
        await until(() => alertText(el) !== '', 'the refusal');

        const alert = shadow.querySelector('.ct-cms__gate .ct-cms__alert');
        return expect(alert.checkVisibility()).toBe(true);
    });

    it('signs in with nothing offered', async function() {
        /* There is no field, so there is nothing to read from one. An
           adapter handed a stale string would be an adapter that could
           act on it. */
        let offered = 'not-null';
        const {el} = await mount();
        el.auth = appStub({
            authenticate: () => {
                offered = el._offered;
                return {token: 'ghu_stub'};
            }
        });

        el.shadowRoot.querySelector('.ct-cms__gate-app-button').click();
        await until(() => offered !== 'not-null', 'authenticate to be reached');

        return expect(offered).toBe(null);
    });

    it('lets a granted token past the gate', async function() {
        const {el} = await mount();
        el.auth = appStub();

        await signInWithApp(el);

        return expect(el.getAttribute('state')).toBe('ready');
    });

    it('says it is going to GitHub rather than that something went wrong',
       async function() {
        /* The real adapter raises rather than returning a promise that
           never settles while the page is torn down, and the gate has to
           read that as a notice. Described as a failure it is a red
           panel for the fraction of a second before the page goes --
           which is how a working sign-in comes to look broken. */
        const {el, shadow} = await mount();
        el.auth = appStub({
            authenticate: () => {
                throw new RedirectingError();
            }
        });

        shadow.querySelector('.ct-cms__gate-app-button').click();
        await until(() => alertText(el) !== '', 'the notice to appear');

        expect(el.getAttribute('state')).toBe('signed-out');
        return expect(alertText(el)).toContain('GitHub');
    });

    it('does not verify a token it never got', async function() {
        /* `_verify` asks GitHub whether the token is any good. Reached
           after a redirect was raised, it would fire a request with no
           token at all and answer the notice with a 401 over the top of
           it. */
        const {el, fake} = await mount();
        const before = fake.requests.length;
        el.auth = appStub({
            authenticate: () => {
                throw new RedirectingError();
            }
        });

        el.shadowRoot.querySelector('.ct-cms__gate-app-button').click();
        await until(() => alertText(el) !== '', 'the notice to appear');

        return expect(fake.requests.length).toBe(before);
    });
});

describe('the adapter the config asks for', function() {

    let mounted = null;

    beforeEach(function() {
        forgetToken();
        forgetApp();
    });

    afterEach(function() {
        if (mounted) {
            mounted.el.remove();
            mounted = null;
        }
        forgetToken();
        forgetApp();
        history.replaceState(null, '', location.pathname);
    });

    async function mount(options) {
        mounted = await mountShell(options);
        return mounted;
    }

    it('builds a GitHub App adapter for a github-app block', async function() {
        const {el, shadow} = await mount({files: {[CONFIG_URL]: APP_YAML}});

        expect(el.auth).toBeInstanceOf(GitHubAppAuthAdapter);
        return expect(shadow.querySelector('.ct-cms__gate-app').hidden).toBe(false);
    });

    it('reaches the exchange the config names, with the shell\'s own fetch',
       async function() {
        /* The only test that drives the REAL adapter from a real config,
           and the only one that can see three things at once: that
           `backend.auth.proxy` reaches the adapter rather than being
           parsed and dropped, that the adapter posts to it, and that the
           function it posts with is the element's `fetch` property --
           late-bound and called unbound, because `this.fetch(...)` hands
           the browser this element as fetch's receiver and the browser
           answers "Illegal invocation".

           Driven by putting a callback URL in the address bar and the
           flow that started it in storage, which is exactly the state
           GitHub sends an author back in. */
        sessionStorage.setItem(APP_FLOW_KEY, JSON.stringify({
            state: 'nonce-1', verifier: 'verifier-1', hash: '#/c/blog'
        }));
        history.replaceState(null, '', `${location.pathname}?code=abc&state=nonce-1`);

        const seen = [];
        const fake = createFakeGitHub();
        const serve = shellFetch(fake, {[CONFIG_URL]: APP_YAML});
        const {el} = await mount({fake, fetch: (input, init) => {
            seen.push(typeof input === 'string' ? input : String(input.url ?? input));
            if (String(input) === 'https://auth.example.com/exchange') {
                return Promise.resolve(new Response(
                    JSON.stringify({token: 'ghu_exchanged', expires_in: 28800}),
                    {status: 200, headers: {'content-type': 'application/json'}}));
            }
            return serve(input, init);
        }});

        expect(seen).toContain('https://auth.example.com/exchange');
        expect(el.getAttribute('state')).toBe('ready');
        /* And the token the exchange returned is the one that reaches
           GitHub -- the adapter stored it, the repo reads it back, and
           the route the flow remembered is what asked. */
        await until(() => fake.requests.length > 0, 'the collection to load');
        const sent = Object.entries(fake.requests[0][2])
            .find(([name]) => name.toLowerCase() === 'authorization');
        expect(sent?.[1]).toBe('Bearer ghu_exchanged');
        return expect(location.search).toBe('');
    });

    it('keeps the token form for a config that says nothing', async function() {
        const {el, shadow} = await mount();

        expect(el.auth.gate).toBe(undefined);
        return expect(shadow.querySelector('.ct-cms__gate-pat').hidden).toBe(false);
    });

    it('is not pinned by something asking for an adapter first', async function() {
        /* The memoising getter is the hazard: a call site touching
           `this.auth` before the config lands would fix the PAT adapter
           for the life of the page, and `auth:` in the config would
           silently do nothing. */
        const el = document.createElement('content-tools-cms');
        el.fetch = shellFetch(undefined, {[CONFIG_URL]: APP_YAML});
        el.setAttribute('config', CONFIG_URL);
        /* Before connecting, so the default is memoised first. */
        expect(el.auth.gate).toBe(undefined);

        document.body.appendChild(el);
        mounted = {el, shadow: el.shadowRoot};
        await settled(el);

        return expect(el.auth).toBeInstanceOf(GitHubAppAuthAdapter);
    });

    it('lets a host page override the config', async function() {
        const given = appStub({gate: {label: 'Ours', note: 'Ours too.'}});
        const el = document.createElement('content-tools-cms');
        el.fetch = shellFetch(undefined, {[CONFIG_URL]: APP_YAML});
        el.auth = given;
        el.setAttribute('config', CONFIG_URL);

        document.body.appendChild(el);
        mounted = {el, shadow: el.shadowRoot};
        await settled(el);

        expect(el.auth).toBe(given);
        return expect(el.shadowRoot.querySelector('.ct-cms__gate-app-button')
                        .textContent).toBe('Ours');
    });

    it('names the missing half of an app block', async function() {
        /* A `clientId` and no `proxy` is a redirect this shell could
           make and an exchange it could never finish. Named at parse
           time, on the page, rather than as a failed POST an hour
           later. */
        const {el, shadow} = await mount({files: {[CONFIG_URL]:
            APP_YAML.replace('    proxy: https://auth.example.com/exchange\n', '')}});

        expect(el.getAttribute('state')).toBe('unconfigured');
        return expect(shadow.querySelector('.ct-cms__alert-path').textContent)
            .toBe('backend.auth.proxy');
    });
});

describe('finishing a redirect at boot', function() {

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
     * Mount with an adapter already in place, so boot can resume it.
     *
     * Not `mountShell`: that appends the element and only then can a test
     * reach the property, which is one tick too late -- `connectedCallback`
     * has already loaded the config and run whatever `resume` it found.
     */
    async function mountWith(auth, options = {}) {
        const fake = options.fake ?? createFakeGitHub();
        const el = document.createElement('content-tools-cms');
        el.fetch = options.fetch ?? shellFetch(fake, options.files);
        el.auth = auth;
        el.setAttribute('config', CONFIG_URL);
        document.body.appendChild(el);
        mounted = {el, fake, shadow: el.shadowRoot};
        await settled(el);
        return mounted;
    }

    /**
     * The gate screen, not the status one.
     *
     * `views/status.ts` reuses `.ct-cms__gate` for the same centred panel,
     * so a bare `querySelector('.ct-cms__gate')` finds whichever was built
     * first -- the status view, on any boot that spent a tick loading. It
     * answers `hidden` for the wrong screen, and the assertion reads as if
     * the gate were the thing being measured.
     */
    const gateNode = shadow =>
        shadow.querySelector('.ct-cms__gate-form').closest('.ct-cms__gate');

    it('is signed in before the first route loads', async function() {
        /* Called after the config and before the navigation, so a
           returning author never sees the gate flash past on the way to
           the screen they bookmarked. */
        const seen = [];
        const auth = appStub({resume: stub => {
            seen.push(document.body.contains(mounted?.el)
                ? mounted.el.getAttribute('state')
                : null);
            stub.grant();
        }});

        const {el} = await mountWith(auth);

        expect(auth.calls.resume).toBe(1);
        return expect(el.getAttribute('state')).toBe('ready');
    });

    it('puts the author back where the redirect took them from',
       async function() {
        /* GitHub drops the fragment, so the adapter restores it with
           `replaceState` -- which fires no `hashchange`. A shell
           navigating to the route it parsed at connect would land on the
           dashboard and call that a successful sign-in. */
        const auth = appStub({resume: stub => {
            history.replaceState(null, '', `${location.pathname}#/c/pages`);
            stub.grant();
        }});

        const {el} = await mountWith(auth);

        await until(() => el.getAttribute('state') === 'ready', 'the shell to open');
        return expect(el.shadowRoot
            .querySelector('.ct-cms__entries .ct-cms__heading')
            ?.textContent).toBe('Pages');
    });

    it('asks nothing of an adapter with nothing to finish', async function() {
        /* The PAT adapter declares no `resume`, so the call is optional
           -- and `?.()` rather than `()` is the difference between every
           PAT deployment booting and none of them. */
        const auth = appStub({resume: null});
        expect(auth.resume).toBe(undefined);

        const {el} = await mountWith(auth);

        return expect(el.getAttribute('state')).toBe('signed-out');
    });

    it('says on the gate why a sign-in did not finish', async function() {
        /* A `?code` whose state does not match, a bookmarked callback, a
           proxy that is not deployed. Swallowed, the person is at a gate
           that refused them for no stated reason. */
        const auth = appStub({resume: () => {
            throw new SignInError('This sign-in did not match the one this tab started.');
        }});

        const {el} = await mountWith(auth);

        expect(el.getAttribute('state')).toBe('signed-out');
        return expect(alertText(el)).toContain('did not match');
    });

    it('does not call a failed sign-in a misconfigured deployment',
       async function() {
        /* The resume runs AFTER the config lands. Before it, a throw
           would leave `_config` null, so the screen would be
           `unconfigured` and the status view would tell an operator to
           go and fix a config file that is correct. */
        const auth = appStub({resume: () => {
            throw new SignInError('The sign-in service could not be reached.');
        }});

        const {el, shadow} = await mountWith(auth);

        expect(el.getAttribute('state')).not.toBe('unconfigured');
        return expect(gateNode(shadow).hidden).toBe(false);
    });

    it('still signs a PAT in afterwards', async function() {
        /* The gate is where a failed resume leaves them, so the gate has
           to still work -- and the shape it leaves them at is the form,
           because an adapter with no `gate` descriptor is a PAT one that
           happens to have a flow to finish. Driven through the untouched
           `signIn`, which is the whole claim: a failed resume does not
           reach the path every other spec here signs in through. */
        const auth = appStub({
            gate: null,
            resume: () => {
                throw new SignInError('Nope.');
            }
        });

        const {el, shadow} = await mountWith(auth);

        expect(alertText(el)).toContain('Nope.');
        expect(shadow.querySelector('.ct-cms__gate-pat').hidden).toBe(false);

        await signIn(el);

        expect(auth.calls.authenticate).toBe(1);
        return expect(el.getAttribute('state')).toBe('ready');
    });
});
