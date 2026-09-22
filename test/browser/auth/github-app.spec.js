/* The GitHub App adapter, driven through its seams.

   Every global it touches -- the URL, the navigation, the clock, the
   randomness, `fetch`, storage -- is a constructor option, so the whole
   two-leg flow runs synthetically with no navigation and no interception.
   That is not a convenience: the linter here restricts `document` and
   `window` and nothing else, so `location.assign` would have passed lint
   and left the flow testable only end to end.

   Two assertions are about what is NOT there: the code must be off the
   address bar before the exchange resolves, and the token must not reach
   `localStorage`. */

import {
    APP_FLOW_KEY, APP_TOKEN_KEY, AUTHORIZE_URL, EXPIRY_SKEW_MS,
    GitHubAppAuthAdapter, RedirectingError, SignInError
} from '../../../src/auth/github-app.js';

const PAGE = 'https://cms.example.com/app/';

function fakeStorage(initial = {}) {
    const held = new Map(Object.entries(initial));
    return {
        held,
        getItem: key => held.get(key) ?? null,
        setItem: (key, value) => void held.set(key, value),
        removeItem: key => void held.delete(key)
    };
}

/** Randomness that is not random, so a test can name what was sent.
 *
 * `0xfb` rather than a friendlier byte on purpose: a run of them
 * base64s to `+/v7...`, with padding, so the three characters a URL
 * would have to escape are all present in what the adapter mints. Filled
 * with 7s -- the first thing written here -- every one of those
 * substitutions was unkillable, because nothing being encoded ever
 * needed them.
 */
function fakeCrypto(fill = 0xfb) {
    return {
        getRandomValues: array => {
            array.fill(fill);
            return array;
        },
        subtle: {
            /* Not SHA-256. The adapter's job is to hash the verifier and
               send the digest; which digest is `crypto.subtle`'s job, and
               a real one here would only assert that Chromium implements
               SHA-256. This one is distinguishable from the verifier,
               which is the property the test needs. */
            digest: async (_algorithm, bytes) =>
                new Uint8Array(bytes).map(byte => byte ^ 0xff).buffer
        }
    };
}

function harness({url = PAGE, answer, status = 200, now = () => 1_700_000_000_000,
                  storage = fakeStorage(), ...rest} = {}) {
    const navigated = [];
    const replaced = [];
    const posted = [];
    const adapter = new GitHubAppAuthAdapter({
        clientId: 'Iv1.test',
        proxy: 'https://auth.example.com/exchange',
        storage,
        crypto: fakeCrypto(),
        now,
        href: () => url,
        navigate: to => void navigated.push(to),
        replaceUrl: to => void replaced.push(to),
        fetch: async (input, init) => {
            posted.push({
                url: input,
                body: Object.fromEntries(new URLSearchParams(init.body)),
                headers: init.headers
            });
            return new Response(
                JSON.stringify(answer ?? {token: 'ghu_live', expires_in: 28800}),
                {status, headers: {'content-type': 'application/json'}});
        },
        ...rest
    });
    return {adapter, navigated, replaced, posted, storage};
}

/** `?code=...&state=...` on the page the flow started from. */
function returnedWith(params) {
    const url = new URL(PAGE);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}

async function startedFlow(kit) {
    await kit.adapter.authenticate().catch(() => {});
    return JSON.parse(kit.storage.held.get(APP_FLOW_KEY));
}

describe('GitHubAppAuthAdapter, going to GitHub', function() {

    it('sends the browser to the authorize URL', async function() {
        const kit = harness();

        await expect(kit.adapter.authenticate()).rejects.toBeInstanceOf(RedirectingError);

        const url = new URL(kit.navigated[0]);
        expect(`${url.origin}${url.pathname}`).toBe(AUTHORIZE_URL);
        expect(url.searchParams.get('client_id')).toBe('Iv1.test');
        return expect(url.searchParams.get('redirect_uri')).toBe(PAGE);
    });

    it('raises a notice rather than never settling', async function() {
        /* The page is being torn down. A promise left pending would leave
           the gate frozen with nothing on it for as long as the
           navigation takes, and nothing to assert either. */
        const kit = harness();

        return expect(kit.adapter.authenticate()).rejects.toThrow(/GitHub/);
    });

    it('carries a state nonce and remembers it', async function() {
        const kit = harness();

        const flow = await startedFlow(kit);

        return expect(new URL(kit.navigated[0]).searchParams.get('state'))
            .toBe(flow.state);
    });

    it('carries an S256 challenge and keeps the verifier to itself',
       async function() {
        const kit = harness();

        const flow = await startedFlow(kit);
        const sent = new URL(kit.navigated[0]).searchParams;

        expect(sent.get('code_challenge_method')).toBe('S256');
        expect(sent.get('code_challenge')).toBeTruthy();
        /* The whole of PKCE: what GitHub sees is the digest, and the
           verifier stays here until the exchange. Sending the verifier
           itself would be an elaborate way of sending nothing. */
        return expect(sent.get('code_challenge')).not.toBe(flow.verifier);
    });

    it('mints values that survive a URL without escaping', async function() {
        /* Base64 spells three characters a query string does not: `+`
           reads as a space, `/` and `=` are structural. A state that
           needs escaping matches nothing on the way back, and the
           sign-in fails with a nonce complaint about a nonce that was
           right. */
        const kit = harness();

        const flow = await startedFlow(kit);

        expect(flow.state).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(flow.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
        return expect(new URL(kit.navigated[0]).searchParams.get('code_challenge'))
            .toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('remembers the route the author was on', async function() {
        /* GitHub redirects to the callback with no fragment, so without
           this a person who signed in from an entry lands on the
           dashboard and has to find their way back. */
        const kit = harness({url: `${PAGE}#/c/blog/e/hello`});

        return expect((await startedFlow(kit)).hash).toBe('#/c/blog/e/hello');
    });

    it('registers a callback URL with no query and no fragment', async function() {
        /* It has to match the App's registered callback exactly, and it
           has to be the SAME string at authorize and at exchange. A
           previous attempt's `code` still in the query would otherwise
           travel into the next one's. */
        const kit = harness({url: `${PAGE}?code=stale#/c/blog`});

        await kit.adapter.authenticate().catch(() => {});

        return expect(new URL(kit.navigated[0]).searchParams.get('redirect_uri'))
            .toBe(PAGE);
    });

    it('hands back a token it already holds instead of leaving the page',
       async function() {
        /* The shell calls `authenticate()` whenever it wants a token. A
           redirect each time would throw away whatever the caller was
           doing, for a token already in hand. */
        const kit = harness({storage: fakeStorage({
            [APP_TOKEN_KEY]: JSON.stringify({token: 'ghu_live', expiresAt: null})
        })});

        expect(await kit.adapter.authenticate()).toEqual({token: 'ghu_live'});
        return expect(kit.navigated).toEqual([]);
    });

    it('refuses to start without a secure context', async function() {
        /* `crypto.subtle` is undefined over plain http. The alternative
           message is "cannot read properties of undefined", on a
           deployment whose only mistake was the scheme. */
        const kit = harness({crypto: {getRandomValues: a => a}});

        await expect(kit.adapter.authenticate()).rejects.toThrow(/HTTPS/);
        return expect(kit.navigated).toEqual([]);
    });
});

describe('GitHubAppAuthAdapter, coming back', function() {

    /** Start a flow on one page, then answer it on another. */
    async function roundTrip({params, ...options} = {}) {
        const storage = fakeStorage();
        const going = harness({storage, url: options.url ?? PAGE});
        await going.adapter.authenticate().catch(() => {});
        const flow = JSON.parse(storage.held.get(APP_FLOW_KEY));

        const back = harness({
            ...options,
            storage,
            url: returnedWith({code: 'the-code', state: flow.state, ...params})
        });
        return {...back, flow};
    }

    it('does nothing when the page carries no code', async function() {
        const kit = harness();

        await kit.adapter.resume();

        expect(kit.posted).toEqual([]);
        expect(kit.replaced).toEqual([]);
        return expect(kit.adapter.currentToken()).toBe(null);
    });

    it('exchanges the code and holds the token', async function() {
        const kit = await roundTrip();

        await kit.adapter.resume();

        expect(kit.posted[0].url).toBe('https://auth.example.com/exchange');
        expect(kit.posted[0].body.code).toBe('the-code');
        return expect(kit.adapter.currentToken()).toBe('ghu_live');
    });

    it('sends the verifier it kept, and the same redirect_uri',
       async function() {
        const kit = await roundTrip();

        await kit.adapter.resume();

        expect(kit.posted[0].body.code_verifier).toBe(kit.flow.verifier);
        return expect(kit.posted[0].body.redirect_uri).toBe(PAGE);
    });

    it('posts form-encoded, so the browser sends no preflight',
       async function() {
        const kit = await roundTrip();

        await kit.adapter.resume();

        return expect(kit.posted[0].headers['content-type'])
            .toBe('application/x-www-form-urlencoded');
    });

    it('takes the code off the address bar before the exchange resolves',
       async function() {
        /* A code left in `location.search` reaches every `Referer` the
           page sends afterwards, and every screenshot of it. */
        const kit = await roundTrip();
        let atExchange = null;
        const adapter = new GitHubAppAuthAdapter({
            clientId: 'Iv1.test',
            proxy: 'https://auth.example.com/exchange',
            storage: kit.storage,
            crypto: fakeCrypto(),
            href: () => returnedWith({code: 'the-code', state: kit.flow.state}),
            replaceUrl: to => void kit.replaced.push(to),
            navigate: () => {},
            fetch: async () => {
                atExchange = [...kit.replaced];
                return new Response(JSON.stringify({token: 'ghu_live'}));
            }
        });

        await adapter.resume();

        return expect(atExchange).toEqual([PAGE]);
    });

    it('puts the author back on the route they left from', async function() {
        const kit = await roundTrip({url: `${PAGE}#/c/blog/e/hello`});

        await kit.adapter.resume();

        return expect(kit.replaced).toEqual([`${PAGE}#/c/blog/e/hello`]);
    });

    it('refuses a code whose state is not the one this tab sent',
       async function() {
        /* Without the nonce, a link somebody else crafts makes this page
           spend THEIR code and signs the author into THEIR repository --
           which reads as the tool being broken rather than as an attack. */
        const kit = await roundTrip({params: {state: 'somebody-elses'}});

        await expect(kit.adapter.resume()).rejects.toBeInstanceOf(SignInError);
        expect(kit.posted).toEqual([]);
        return expect(kit.adapter.currentToken()).toBe(null);
    });

    it('refuses a second visit to the same callback URL', async function() {
        /* The URL is bookmarkable and shareable, and the flow is spent
           the moment it is read. */
        const kit = await roundTrip();

        await kit.adapter.resume();
        const again = harness({
            storage: kit.storage,
            url: returnedWith({code: 'the-code', state: kit.flow.state})});

        return expect(again.adapter.resume()).rejects.toThrow(/no longer has/);
    });

    it('says something readable for a code with no flow behind it',
       async function() {
        /* A bookmarked callback, or storage cleared between the two legs.
           Ignoring the code silently would leave the person at a gate
           that just refused them for no stated reason. */
        const kit = harness({url: returnedWith({code: 'the-code', state: 'x'})});

        await expect(kit.adapter.resume()).rejects.toThrow(/no longer has/);
        return expect(kit.posted).toEqual([]);
    });

    it('reports what GitHub refused, when GitHub refuses', async function() {
        const kit = harness({url: returnedWith({
            error: 'access_denied',
            error_description: 'The user denied the request.'
        })});

        await expect(kit.adapter.resume()).rejects.toThrow('The user denied the request.');
        return expect(kit.replaced).toEqual([PAGE]);
    });

    it('falls back to the error code when GitHub sends no description',
       async function() {
        const kit = harness({url: returnedWith({error: 'application_suspended'})});

        return expect(kit.adapter.resume()).rejects.toThrow(/application_suspended/);
    });

    it('names the proxy, not GitHub, when the proxy cannot be reached',
       async function() {
        /* A rejected `fetch` is a TypeError, which the shell describes as
           "could not reach GitHub" -- the wrong machine, and an operator
           sent to check the wrong thing. */
        const kit = await roundTrip();
        const adapter = new GitHubAppAuthAdapter({
            clientId: 'Iv1.test',
            proxy: 'https://auth.example.com/exchange',
            storage: kit.storage,
            crypto: fakeCrypto(),
            href: () => returnedWith({code: 'the-code', state: kit.flow.state}),
            replaceUrl: () => {},
            fetch: async () => {
                throw new TypeError('Failed to fetch');
            }
        });

        return expect(adapter.resume()).rejects
            .toThrow(/auth\.example\.com\/exchange could not be reached/);
    });

    it('reports what the proxy said when the proxy refuses', async function() {
        const kit = await roundTrip({
            status: 400,
            answer: {error: 'bad_verification_code',
                     error_description: 'The code passed is incorrect or expired.'}
        });

        return expect(kit.adapter.resume()).rejects
            .toThrow('The code passed is incorrect or expired.');
    });

    it('refuses a 200 that carries no token', async function() {
        const kit = await roundTrip({answer: {}});

        await expect(kit.adapter.resume()).rejects.toBeInstanceOf(SignInError);
        return expect(kit.adapter.currentToken()).toBe(null);
    });

    it('survives a proxy answering something that is not JSON', async function() {
        const kit = await roundTrip();
        const adapter = new GitHubAppAuthAdapter({
            clientId: 'Iv1.test',
            proxy: 'https://auth.example.com/exchange',
            storage: kit.storage,
            crypto: fakeCrypto(),
            href: () => returnedWith({code: 'the-code', state: kit.flow.state}),
            replaceUrl: () => {},
            /* The body carries no digits, deliberately. Written as
               `<html>502 Bad Gateway</html>`, the SyntaxError from
               `JSON.parse` quotes the body back and so contains `502`
               itself -- and the assertion passed with the guard
               removed. */
            fetch: async () => new Response('<html>Bad Gateway</html>', {status: 502})
        });

        return expect(adapter.resume()).rejects
            .toThrow('The sign-in service answered 502.');
    });
});

describe('GitHubAppAuthAdapter, expiry', function() {

    const held = (expiresAt) => fakeStorage({
        [APP_TOKEN_KEY]: JSON.stringify({token: 'ghu_live', expiresAt})
    });

    it('computes expiry against its own clock', async function() {
        /* From a RELATIVE lifetime, never an absolute time GitHub sends,
           so skew between the two machines cancels rather than
           accumulating into a token we think is live and GitHub does
           not. */
        const storage = fakeStorage();
        const going = harness({storage, now: () => 1_000_000});
        await going.adapter.authenticate().catch(() => {});
        const flow = JSON.parse(storage.held.get(APP_FLOW_KEY));

        const back = harness({
            storage,
            now: () => 1_000_000,
            url: returnedWith({code: 'the-code', state: flow.state}),
            answer: {token: 'ghu_live', expires_in: 28800}
        });
        await back.adapter.resume();

        return expect(JSON.parse(storage.held.get(APP_TOKEN_KEY)).expiresAt)
            .toBe(1_000_000 + 28800 * 1000);
    });

    it('treats an absent expires_in as a token that does not expire',
       async function() {
        /* An App with expiration switched off sends none. `now +
           undefined` is NaN, which compares false against everything, so
           a token would be reported live for ever -- or, written the
           other way round, never. Either is an infinite loop with no
           error anywhere. */
        const storage = fakeStorage();
        const going = harness({storage});
        await going.adapter.authenticate().catch(() => {});
        const flow = JSON.parse(storage.held.get(APP_FLOW_KEY));

        const back = harness({
            storage,
            url: returnedWith({code: 'the-code', state: flow.state}),
            answer: {token: 'ghu_live'},
            now: () => 1_000
        });
        await back.adapter.resume();

        expect(JSON.parse(storage.held.get(APP_TOKEN_KEY)).expiresAt).toBe(null);
        const later = harness({storage, now: () => 1_000 + 9 * 3600 * 1000});
        return expect(later.adapter.currentToken()).toBe('ghu_live');
    });

    it('reports an expired token as no token', async function() {
        const kit = harness({storage: held(5_000), now: () => 6_000});

        return expect(kit.adapter.currentToken()).toBe(null);
    });

    it('gives up a token with half a minute left rather than spending it',
       async function() {
        /* A request sent on a token with seconds left arrives after it
           has gone and comes back 401, which costs the session AND
           whatever the request was carrying.

           Thirty seconds, written as a number rather than against
           `EXPIRY_SKEW_MS`: a test that names the constant moves with it,
           so setting the margin to zero left this green. */
        const kit = harness({
            storage: held(1_000_000),
            now: () => 1_000_000 - 30_000
        });

        return expect(kit.adapter.currentToken()).toBe(null);
    });

    it('gives up a token at exactly the margin', async function() {
        /* The boundary, and here naming the constant is the point --
           this is about which comparison, not about how wide the margin
           is. A token that lapses at the instant the margin begins is
           already gone. */
        const kit = harness({
            storage: held(1_000_000),
            now: () => 1_000_000 - EXPIRY_SKEW_MS
        });

        return expect(kit.adapter.currentToken()).toBe(null);
    });

    it('keeps a token with ten minutes left', async function() {
        const kit = harness({
            storage: held(1_000_000),
            now: () => 1_000_000 - 600_000
        });

        return expect(kit.adapter.currentToken()).toBe('ghu_live');
    });
});

describe('GitHubAppAuthAdapter, storage', function() {

    it('forgets the token and the half-finished flow on logout',
       async function() {
        /* The flow too: left behind, it would let the next sign-in match
           a state this session no longer means. */
        const kit = harness({storage: fakeStorage({
            [APP_TOKEN_KEY]: JSON.stringify({token: 'ghu_live', expiresAt: null}),
            [APP_FLOW_KEY]: JSON.stringify({state: 's', verifier: 'v', hash: ''})
        })});

        await kit.adapter.logout();

        expect(kit.adapter.currentToken()).toBe(null);
        return expect(kit.storage.held.has(APP_FLOW_KEY)).toBe(false);
    });

    it('keeps the token out of localStorage', async function() {
        /* The difference between the two storages is one word and no
           observable behaviour until somebody else uses the machine. */
        const kit = await (async () => {
            const storage = fakeStorage();
            const going = harness({storage});
            await going.adapter.authenticate().catch(() => {});
            const flow = JSON.parse(storage.held.get(APP_FLOW_KEY));
            return harness({
                storage,
                url: returnedWith({code: 'the-code', state: flow.state})
            });
        })();
        localStorage.removeItem(APP_TOKEN_KEY);

        await kit.adapter.resume();

        expect(kit.adapter.currentToken()).toBe('ghu_live');
        return expect(localStorage.getItem(APP_TOKEN_KEY)).toBe(null);
    });

    it('answers "no token" for a stored value somebody else wrote',
       async function() {
        /* One shared origin, and `sessionStorage` is not ours alone. A
           throw from `currentToken()` would take the shell down on boot,
           at the one moment there is nothing on screen to explain it. */
        const kit = harness({storage: fakeStorage({[APP_TOKEN_KEY]: 'not json'})});

        return expect(kit.adapter.currentToken()).toBe(null);
    });

    it('falls back to memory when storage refuses to write', async function() {
        /* A sandboxed iframe, or private browsing. Losing the token on
           reload is worse than not starting at all only if you have not
           tried to use a CMS that will not start. */
        const throwing = {
            getItem: () => null,
            setItem: () => {
                throw new DOMException('The operation is insecure.', 'SecurityError');
            },
            removeItem: () => {}
        };
        const going = harness({storage: throwing});
        await going.adapter.authenticate().catch(() => {});

        return expect(going.navigated.length).toBe(1);
    });

    it('goes on reading the memory it fell back to', async function() {
        /* Writing the value into a fresh Map and then dropping the Map
           is the shape this goes wrong in: every write appears to work,
           every read still goes to the storage that refuses, and the
           second leg cannot find the flow the first one started. The
           person is told their browser no longer has the request --
           which is true, and says nothing about why.

           One adapter across both legs, because that is the object the
           fallback lives on. */
        let here = PAGE;
        const adapter = new GitHubAppAuthAdapter({
            clientId: 'Iv1.test',
            proxy: 'https://auth.example.com/exchange',
            crypto: fakeCrypto(),
            href: () => here,
            replaceUrl: () => {},
            storage: {
                getItem: () => null,
                setItem: () => {
                    throw new DOMException('The operation is insecure.',
                                           'SecurityError');
                },
                removeItem: () => {}
            },
            navigate: to => {
                here = returnedWith({
                    code: 'the-code',
                    state: new URL(to).searchParams.get('state')
                });
            },
            fetch: async () => new Response(
                JSON.stringify({token: 'ghu_live', expires_in: 28800}))
        });

        await adapter.authenticate().catch(() => {});
        await adapter.resume();

        return expect(adapter.currentToken()).toBe('ghu_live');
    });

    it('stops reading a storage that refuses to forget', async function() {
        const stubborn = {
            ...fakeStorage({
                [APP_TOKEN_KEY]: JSON.stringify({token: 'ghu_live', expiresAt: null})
            }),
            removeItem: () => {
                throw new DOMException('The operation is insecure.', 'SecurityError');
            }
        };
        const kit = harness({storage: stubborn});

        await kit.adapter.logout();

        /* A logout that leaves a working token behind is the one failure
           here that matters. */
        return expect(kit.adapter.currentToken()).toBe(null);
    });

    describe('handing the token to the site\'s own page', function() {

        const NOW = 1_700_000_000_000;
        const signedIn = expiresAt => harness({
            storage: fakeStorage({
                [APP_TOKEN_KEY]: JSON.stringify({token: 'ghu_live', expiresAt})
            })
        });

        it('hands on the whole record, expiry and all', function() {
            /* The VALUE as storage holds it, not the bearer inside it.
               An App token that crossed as a bare string would arrive
               with no expiry, and the page holding it would go on
               offering to save hours after GitHub stopped listening --
               a 401 on Submit rather than a gate before it. */
            const kit = signedIn(NOW + 28_800_000);

            const handed = kit.adapter.handoff();

            expect(handed.key).toBe(APP_TOKEN_KEY);
            return expect(JSON.parse(handed.value))
                .toEqual({token: 'ghu_live', expiresAt: NOW + 28_800_000});
        });

        it('hands on a token with no expiry at all', function() {
            // An App with token expiration switched off.
            const kit = signedIn(null);

            return expect(JSON.parse(kit.adapter.handoff().value).expiresAt)
                .toBe(null);
        });

        it('refuses one that has already expired', function() {
            const kit = signedIn(NOW - 1);

            expect(kit.adapter.currentToken()).toBe(null);
            return expect(kit.adapter.handoff()).toBe(null);
        });

        it('refuses one that lapses inside the skew', function() {
            /* The gate is `currentToken()` rather than a comparison
               written again here, so the two cannot come to disagree
               about what "expired" means. A token with thirty seconds
               left is one this adapter refuses to send a request on;
               handing it to another page would be sending it on
               somebody else's behalf. */
            const kit = signedIn(NOW + EXPIRY_SKEW_MS / 2);

            return expect(kit.adapter.handoff()).toBe(null);
        });

        it('hands on nothing when nobody has signed in', function() {
            return expect(harness().adapter.handoff()).toBe(null);
        });
    });
});
