import {expect, test} from '@playwright/test';

/* A smoke test against the BUILT dist/proxy.js.
 *
 * Everything about the handler is tested against source. Two failures
 * live only in the artifact, and this repo has now been bitten by the
 * first of them three times -- `dist/element.js` throwing on `start()`
 * with 662 green tests, `dist/cms.js` losing `fetch`'s receiver, and
 * `dist/markdown.js`:
 *
 *   - the entry not being loadable at all once bundled, which no
 *     source-level test can see;
 *   - the build mode emitting something other than one self-contained
 *     module -- a chunk reference, a shared import -- which would ship a
 *     second file to whatever server holds the App's client secret, and
 *     `scripts/build.mjs` checks the text while this checks that it runs.
 *
 * It is loaded as a module in a page rather than in Node because the
 * handler is written against web APIs and the page is where those are
 * real. The Playwright project already serves the repo root.
 */

const PAGE = '/app/index.html';

test('the built handler exchanges a code', async ({page}) => {
    await page.goto(PAGE);

    const result = await page.evaluate(async () => {
        const {exchangeHandler} = await import('/dist/proxy.js');

        /* A `fetch` of our own, so nothing leaves the page and the
           request GitHub would have received is inspectable. */
        let sent = null;
        const http = async (url, init) => {
            sent = {url, body: Object.fromEntries(new URLSearchParams(init.body))};
            return new Response(
                JSON.stringify({
                    access_token: 'ghu_built',
                    expires_in: 28800,
                    refresh_token: 'ghr_must_not_escape'
                }),
                {headers: {'content-type': 'application/json'}});
        };

        const response = await exchangeHandler(
            new Request('https://proxy.test/auth', {
                method: 'POST',
                headers: {'content-type': 'application/x-www-form-urlencoded'},
                body: new URLSearchParams({
                    code: 'the-code',
                    code_verifier: 'the-verifier',
                    redirect_uri: 'https://cms.example.com/app/'
                }).toString()
            }),
            {
                clientId: 'Iv1.built',
                clientSecret: 'shh',
                origin: 'https://cms.example.com'
            },
            http);

        return {
            status: response.status,
            body: await response.text(),
            allowOrigin: response.headers.get('access-control-allow-origin'),
            sent
        };
    });

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({token: 'ghu_built', expires_in: 28800});
    // The decision the whole flow rests on, asserted on the built bytes.
    expect(result.body).not.toContain('ghr_must_not_escape');
    expect(result.allowOrigin).toBe('https://cms.example.com');
    expect(result.sent.url).toBe('https://github.com/login/oauth/access_token');
    expect(result.sent.body.client_secret).toBe('shh');
    expect(result.sent.body.code_verifier).toBe('the-verifier');
});

test('the built handler reads its config out of an environment', async ({page}) => {
    await page.goto(PAGE);

    const result = await page.evaluate(async () => {
        const {configFrom} = await import('/dist/proxy.js');
        let named = null;
        try {
            configFrom({GITHUB_CLIENT_ID: 'Iv1.built'});
        } catch (error) {
            named = error.message;
        }
        return {
            config: configFrom({
                GITHUB_CLIENT_ID: 'Iv1.built',
                GITHUB_CLIENT_SECRET: 'shh',
                ALLOWED_ORIGIN: 'https://cms.example.com'
            }),
            named
        };
    });

    /* The half of the published surface each host's snippet in
       docs/auth.md actually calls. If it were not exported from the
       built file, every one of those snippets would fail at import. */
    expect(result.config.clientId).toBe('Iv1.built');
    expect(result.named).toContain('GITHUB_CLIENT_SECRET');
});
