/* The code exchange, which is the whole reason this adapter needs a server.
 *
 * GitHub's App web flow hands the browser a short-lived `code`. Turning it
 * into a token requires the App's `client_secret`, and
 * `POST https://github.com/login/oauth/access_token` sends no CORS headers,
 * so a browser cannot do it even if it held the secret. PKCE does not
 * change either fact -- it is additive there, not a replacement. Hence a
 * hosted endpoint, and hence this file.
 *
 * Written against web APIs only -- `Request`, `Response`, `URL`,
 * `URLSearchParams`, `fetch` -- with its configuration passed in rather
 * than read from an environment. Two reasons, and the second is the one
 * that shaped the file: the repo has no Node types, so `process.env` would
 * not typecheck; and a pure function over a `Request` is testable in the
 * browser project that already exists, with no host runtime to emulate and
 * no second test runner to configure.
 *
 * The hosts this is published for want exactly this shape already -- a
 * Cloudflare Worker is `{fetch(request, env)}` and a Netlify Function v2 is
 * `(request) => Response` -- so the glue in docs/auth.md is three lines
 * over `configFrom` and `exchangeHandler`. It is documentation rather than
 * shipped source because the two hosts' entry points are both a DEFAULT
 * export and so cannot live in one module, and because four lines of glue
 * against a runtime this repo cannot install is four lines no test kills.
 */

/** Where the token comes from. Overridable so a test needs no interception. */
export const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';

export interface ExchangeConfig {
    clientId: string;
    clientSecret: string;
    /**
     * The one origin allowed to call this, e.g. `https://cms.example.com`.
     *
     * Omit it for a same-origin deployment -- a Netlify Function is always
     * same-origin with the page -- and no CORS headers are sent at all,
     * because none are needed and a header that is not there cannot be
     * too generous.
     */
    origin?: string;
    /**
     * Narrows the token to one repository, by numeric id.
     *
     * The App installation already bounds it; this bounds it further for
     * an App installed on more than one repository, which a deployment
     * editing exactly one site has no use for.
     */
    repositoryId?: string;
    endpoint?: string;
}

/** What a misconfigured deployment gets, instead of a 500 on first use. */
export class ProxyConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProxyConfigError';
    }
}

/**
 * Read the config out of a host's environment record.
 *
 * Kept here, tested here, and exported, so that each host's snippet in the
 * docs is glue over something with tests rather than the only copy of the
 * rules. A missing variable is named: an operator who has set two of the
 * three should be told which one is missing, not handed a 500 by the first
 * person who tries to sign in.
 */
export function configFrom(env: Record<string, string | undefined>): ExchangeConfig {
    const required = (name: string): string => {
        const value = env[name];
        if (!value) {
            throw new ProxyConfigError(
                `${name} is not set -- the OAuth proxy cannot exchange a ` +
                'code without it.');
        }
        return value;
    };
    return {
        clientId: required('GITHUB_CLIENT_ID'),
        clientSecret: required('GITHUB_CLIENT_SECRET'),
        origin: env.ALLOWED_ORIGIN,
        repositoryId: env.GITHUB_REPOSITORY_ID
    };
}

/** CORS headers for a response, or none at all when same-origin. */
function cors(config: ExchangeConfig): Record<string, string> {
    /* Never `*`. The body carries a bearer token with write access to
       somebody's repository, and `*` would let any page on the internet
       read one it had managed to obtain a code for.

       `Vary: Origin` because the answer differs by origin, and a shared
       cache that missed that would serve one deployment's headers to
       another. */
    return config.origin
        ? {'access-control-allow-origin': config.origin, 'vary': 'Origin'}
        : {};
}

function json(body: unknown, status: number, config: ExchangeConfig): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {'content-type': 'application/json', ...cors(config)}
    });
}

/**
 * Exchange a code for a user-to-server token.
 *
 * The browser posts `{code, code_verifier, redirect_uri}` form-encoded --
 * form-encoded because that is a CORS-simple content type, so there is no
 * preflight, so there is no `OPTIONS` branch here to write and leave
 * untested.
 */
export async function exchangeHandler(request: Request, config: ExchangeConfig,
                                      http: typeof fetch = fetch): Promise<Response> {
    if (request.method !== 'POST') {
        return json({error: 'method_not_allowed'}, 405, config);
    }

    /* No check on the `Origin` HEADER, deliberately.
     *
     * It was written, and no test in this project can drive it: `Origin`
     * is a forbidden header name, so the browser strips it from a
     * `Request` a test constructs, and the branch survived every mutation
     * because nothing could reach it. It also has no teeth -- a client
     * that is not a browser sends whatever origin it likes, and CORS
     * already stops a foreign PAGE reading the answer.
     *
     * The check with teeth is the `redirect_uri` one below: that is the
     * value GitHub binds the code to, it cannot be absent, and a test can
     * set it.
     */
    const given = new URLSearchParams(await request.text());
    const code = given.get('code');
    if (!code) {
        return json({error: 'missing_code'}, 400, config);
    }

    /* The origin rule, and the only enforceable half of it. GitHub checks
       `redirect_uri` against the App's registered callback, but it is
       this proxy that decides which deployments it will mint tokens for
       -- an App may carry up to ten callback URLs, and one deployment's
       proxy has no business serving another's. */
    const redirectUri = given.get('redirect_uri');
    if (!redirectUri || (config.origin && !sameOrigin(redirectUri, config.origin))) {
        return json({error: 'forbidden_redirect_uri'}, 403, config);
    }

    /* `client_id`, `client_secret` and `repository_id` are the proxy's
       own, never the request's. Reading any of them from the body would
       let a caller point this endpoint at a different App. */
    const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code
    });
    /* Forwarded, always. GitHub validates it against the one the
       authorize leg carried, and an exchange that omits it comes back
       `redirect_uri_mismatch` -- which reads as a misconfigured App
       rather than as a missing parameter. */
    body.set('redirect_uri', redirectUri);
    const verifier = given.get('code_verifier');
    if (verifier) {
        body.set('code_verifier', verifier);
    }
    if (config.repositoryId) {
        body.set('repository_id', config.repositoryId);
    }

    const answer = await http(config.endpoint ?? TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            /* Without this GitHub answers form-encoded, and the parse
               below would read the whole body as one key. */
            'accept': 'application/json'
        },
        body: body.toString()
    });
    const result = await answer.json() as {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
    };

    /* A failure arrives as HTTP 200 with an `error` key -- a bad code, a
       replayed code, a wrong verifier. Testing `answer.ok` would forward
       it as a success carrying no token, and the adapter would store
       `undefined` and 401 on every later request with nothing anywhere
       saying why. Read `error` first. */
    if (result.error) {
        return json({
            error: result.error,
            error_description: result.error_description ?? result.error
        }, 400, config);
    }
    if (!result.access_token) {
        return json({error: 'no_token', error_description:
            'GitHub answered without a token and without an error.'}, 502, config);
    }

    /* Built explicitly rather than forwarded. GitHub's body also carries
       `refresh_token` and `refresh_token_expires_in` -- a six-month
       credential -- and forwarding the body verbatim would put it in the
       browser's sessionStorage, which is the exact opposite of the
       "expiring, no refresh" decision this whole flow is built around.
       This is the only place that decision can be ENFORCED rather than
       merely respected, and a test greps the body for the name.

       `expires_in` is relative on purpose: the client turns it into an
       absolute time against its OWN clock, so skew between the two
       machines cancels instead of accumulating. */
    return json({token: result.access_token, expires_in: result.expires_in}, 200, config);
}

/** Is `url` on `origin`? Compared as origins, never as a string prefix. */
function sameOrigin(url: string, origin: string | undefined): boolean {
    /* A prefix test would accept `https://cms.example.com.evil.test/`,
       which is the whole attack this check exists to stop. `URL` throws on
       a malformed one, and a malformed redirect_uri is a refusal. */
    try {
        return new URL(url).origin === new URL(origin).origin;
    } catch {
        return false;
    }
}
