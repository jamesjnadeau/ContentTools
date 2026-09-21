/* The code exchange, driven as what it is: a function over a `Request`.

   No host runtime is emulated and no second test runner exists, because
   the handler is written against browser APIs -- `Request`, `Response`,
   `URL`, `URLSearchParams`, `fetch` -- which is the argument for having
   written it that way.

   Two assertions here are about what is NOT in a response rather than
   what is, and both are the security-relevant lines of the file: the
   refresh token GitHub sends back must never reach the browser, and
   `Access-Control-Allow-Origin` must never be `*` on a body carrying a
   bearer token. */

import {
    configFrom, exchangeHandler, ProxyConfigError, TOKEN_ENDPOINT
} from '../../../src/auth/exchange.js';

const CONFIG = {
    clientId: 'Iv1.testclient',
    clientSecret: 's3cr3t',
    origin: 'https://cms.example.com'
};

/** A `fetch` that records what it was asked and answers what it is told. */
function stubFetch(answer = {access_token: 'ghu_token', expires_in: 28800},
                   status = 200) {
    const calls = [];
    const http = async (url, init) => {
        calls.push({
            url,
            init,
            body: new URLSearchParams(init.body)
        });
        return new Response(JSON.stringify(answer), {
            status,
            headers: {'content-type': 'application/json'}
        });
    };
    http.calls = calls;
    return http;
}

/* No `Origin` header: it is a forbidden header name, so the browser
   strips whatever a test sets. That is why the handler does not check
   one -- see the comment in exchange.ts. */
function post(fields, {method = 'POST'} = {}) {
    return new Request('https://proxy.example.com/auth', {
        method,
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams(fields).toString()
    });
}

const GOOD = {
    code: 'the-code',
    code_verifier: 'the-verifier',
    redirect_uri: 'https://cms.example.com/app/'
};

describe('exchangeHandler', function() {

    it('exchanges a code for a token', async function() {
        const http = stubFetch();

        const response = await exchangeHandler(post(GOOD), CONFIG, http);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({token: 'ghu_token', expires_in: 28800});
        return expect(http.calls[0].url).toBe(TOKEN_ENDPOINT);
    });

    it('adds the client secret and never reads one from the request', async function() {
        /* The whole reason this endpoint exists is that the secret cannot
           be in the browser. A handler that took either value from the
           body would let any caller point it at a different App. */
        const http = stubFetch();

        await exchangeHandler(
            post({...GOOD, client_id: 'Iv1.someone-else', client_secret: 'theirs'}),
            CONFIG, http);

        const sent = http.calls[0].body;
        expect(sent.get('client_id')).toBe('Iv1.testclient');
        return expect(sent.get('client_secret')).toBe('s3cr3t');
    });

    it('forwards the PKCE verifier', async function() {
        /* Forwarded is all this can assert. Whether GitHub ENFORCES the
           challenge is not observable from here -- it ignores unknown
           query parameters, so a flow that did not enforce it would look
           identical -- and that gap is recorded in docs/auth.md rather
           than papered over with a test that proves something else. */
        const http = stubFetch();

        await exchangeHandler(post(GOOD), CONFIG, http);

        return expect(http.calls[0].body.get('code_verifier')).toBe('the-verifier');
    });

    it('forwards the redirect_uri', async function() {
        /* GitHub validates it against the one the authorize leg carried.
           An exchange that omits it comes back `redirect_uri_mismatch`,
           which reads as a misconfigured App rather than as a parameter
           this proxy dropped. */
        const http = stubFetch();

        await exchangeHandler(post(GOOD), CONFIG, http);

        return expect(http.calls[0].body.get('redirect_uri'))
            .toBe('https://cms.example.com/app/');
    });

    it('narrows the token to a repository when one is configured', async function() {
        const http = stubFetch();

        await exchangeHandler(post(GOOD), {...CONFIG, repositoryId: '42'}, http);

        return expect(http.calls[0].body.get('repository_id')).toBe('42');
    });

    it('does not send a repository_id when none is configured', async function() {
        const http = stubFetch();

        await exchangeHandler(post(GOOD), CONFIG, http);

        return expect(http.calls[0].body.has('repository_id')).toBe(false);
    });

    it('asks GitHub for JSON', async function() {
        /* Without this GitHub answers form-encoded and `response.json()`
           throws on the first character. */
        const http = stubFetch();

        await exchangeHandler(post(GOOD), CONFIG, http);

        return expect(http.calls[0].init.headers.accept).toBe('application/json');
    });

    it('never hands the browser a refresh token', async function() {
        /* GitHub's body carries `refresh_token` and
           `refresh_token_expires_in` -- a six-month credential. This is
           the only place "expiring, no refresh" can be ENFORCED rather
           than merely respected, so it is asserted on the bytes. */
        const http = stubFetch({
            access_token: 'ghu_token',
            expires_in: 28800,
            refresh_token: 'ghr_refresh',
            refresh_token_expires_in: 15897600
        });

        const response = await exchangeHandler(post(GOOD), CONFIG, http);
        const body = await response.text();

        expect(body).not.toContain('ghr_refresh');
        return expect(body).not.toContain('refresh_token');
    });

    it('passes on an absent expires_in rather than inventing one', async function() {
        /* An App with token expiration switched off sends no
           `expires_in`. Substituting a number here would expire a token
           that does not expire; the client reads absent as "no expiry". */
        const http = stubFetch({access_token: 'ghu_token'});

        const response = await exchangeHandler(post(GOOD), CONFIG, http);

        return expect(await response.json()).toEqual({token: 'ghu_token'});
    });

    it('treats an error in a 200 body as a failure', async function() {
        /* GitHub answers a bad or replayed code with HTTP 200 and an
           `error` key. A handler that tested `response.ok` would forward
           it as a success carrying no token, and the adapter would store
           `undefined` and 401 for ever with nothing saying why. */
        const http = stubFetch({
            error: 'bad_verification_code',
            error_description: 'The code passed is incorrect or expired.'
        });

        const response = await exchangeHandler(post(GOOD), CONFIG, http);

        expect(response.status).toBe(400);
        return expect(await response.json()).toEqual({
            error: 'bad_verification_code',
            error_description: 'The code passed is incorrect or expired.'
        });
    });

    it('falls back to the error code when GitHub sends no description', async function() {
        const http = stubFetch({error: 'incorrect_client_credentials'});

        const response = await exchangeHandler(post(GOOD), CONFIG, http);

        return expect((await response.json()).error_description)
            .toBe('incorrect_client_credentials');
    });

    it('refuses a body with neither a token nor an error', async function() {
        const http = stubFetch({});

        const response = await exchangeHandler(post(GOOD), CONFIG, http);

        expect(response.status).toBe(502);
        return expect((await response.json()).error).toBe('no_token');
    });

    it('refuses anything but POST', async function() {
        const http = stubFetch();

        const response = await exchangeHandler(
            new Request('https://proxy.example.com/auth'), CONFIG, http);

        expect(response.status).toBe(405);
        return expect(http.calls.length).toBe(0);
    });

    it('refuses a request with no code', async function() {
        const http = stubFetch();

        const response = await exchangeHandler(
            post({redirect_uri: GOOD.redirect_uri}), CONFIG, http);

        expect(response.status).toBe(400);
        return expect(http.calls.length).toBe(0);
    });

    it('refuses a redirect_uri that is not on the configured origin', async function() {
        const http = stubFetch();

        const response = await exchangeHandler(
            post({...GOOD, redirect_uri: 'https://evil.test/app/'}), CONFIG, http);

        expect(response.status).toBe(403);
        return expect(http.calls.length).toBe(0);
    });

    it('is not fooled by a redirect_uri that merely starts with the origin',
       async function() {
        /* `https://cms.example.com.evil.test/` passes a string prefix
           test and is a different site. Origins are compared as origins. */
        const http = stubFetch();

        const response = await exchangeHandler(
            post({...GOOD, redirect_uri: 'https://cms.example.com.evil.test/app/'}),
            CONFIG, http);

        expect(response.status).toBe(403);
        return expect(http.calls.length).toBe(0);
    });

    it('refuses a malformed redirect_uri', async function() {
        const http = stubFetch();

        const response = await exchangeHandler(
            post({...GOOD, redirect_uri: 'not a url'}), CONFIG, http);

        return expect(response.status).toBe(403);
    });

    it('allows the configured origin to read the answer, and only it',
       async function() {
        const response = await exchangeHandler(post(GOOD), CONFIG, stubFetch());

        expect(response.headers.get('access-control-allow-origin'))
            .toBe('https://cms.example.com');
        return expect(response.headers.get('vary')).toBe('Origin');
    });

    it('sends no CORS headers at all for a same-origin deployment',
       async function() {
        /* A Netlify Function is always same-origin with the page it
           serves, so it needs no CORS -- and a header that is not there
           cannot be too generous. */
        const {origin, ...sameOrigin} = CONFIG;
        void origin;

        const response = await exchangeHandler(post(GOOD), sameOrigin, stubFetch());

        expect(response.status).toBe(200);
        return expect(response.headers.get('access-control-allow-origin')).toBe(null);
    });

    it('never answers with a wildcard origin', async function() {
        /* The body is a bearer token with write access to somebody's
           repository. `*` would let any page that obtained a code read
           one. */
        for (const config of [CONFIG, {...CONFIG, origin: undefined}]) {
            const response = await exchangeHandler(post(GOOD), config, stubFetch());
            expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
        }
        return expect(true).toBe(true);
    });

    it('refuses a request carrying no redirect_uri at all', async function() {
        /* The origin rule has one enforceable half. `Origin` is a
           forbidden header name, so a caller controls it and a test
           cannot even set it; `redirect_uri` is what GitHub binds the
           code to, and its absence is as much a refusal as a wrong one.

           Refused even with no origin configured, because the adapter
           always sends one and GitHub wants it either way. */
        for (const config of [CONFIG, {...CONFIG, origin: undefined}]) {
            const http = stubFetch();

            const response = await exchangeHandler(
                post({code: 'the-code'}), config, http);

            expect(response.status).toBe(403);
            expect(http.calls.length).toBe(0);
        }
        return expect(true).toBe(true);
    });
});

describe('configFrom', function() {

    it('reads the three variables a deployment sets', function() {
        return expect(configFrom({
            GITHUB_CLIENT_ID: 'Iv1.x',
            GITHUB_CLIENT_SECRET: 'shh',
            ALLOWED_ORIGIN: 'https://cms.example.com',
            GITHUB_REPOSITORY_ID: '42'
        })).toEqual({
            clientId: 'Iv1.x',
            clientSecret: 'shh',
            origin: 'https://cms.example.com',
            repositoryId: '42'
        });
    });

    it('names the variable that is missing', function() {
        /* An operator who has set two of the three should be told which
           one is missing, not handed a 500 by the first person who tries
           to sign in. */
        let thrown = null;
        try {
            configFrom({GITHUB_CLIENT_ID: 'Iv1.x'});
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(ProxyConfigError);
        return expect(thrown.message).toContain('GITHUB_CLIENT_SECRET');
    });

    it('treats an empty string as missing', function() {
        /* A host that defines a variable with no value is the common
           shape of this mistake, and `''` would otherwise sail through
           to GitHub as a client id. */
        return expect(() => configFrom({
            GITHUB_CLIENT_ID: '',
            GITHUB_CLIENT_SECRET: 'shh'
        })).toThrow();
    });

    it('leaves the optional two undefined', function() {
        const config = configFrom({
            GITHUB_CLIENT_ID: 'Iv1.x',
            GITHUB_CLIENT_SECRET: 'shh'
        });

        expect(config.origin).toBe(undefined);
        return expect(config.repositoryId).toBe(undefined);
    });
});
