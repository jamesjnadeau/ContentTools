/* A GitHub App user-to-server token, obtained by signing in.
 *
 * The adapter for a site with authors rather than an operator. A
 * fine-grained PAT asks every one of them to understand what a token is,
 * scope one to a repository they may not administer, and paste it into a
 * field; an App installed on the one repository this deployment edits
 * replaces that with a button. It is also the narrower grant -- the token
 * is bounded by the installation, which is this project's "one
 * deployment, one repo" rule in GitHub's own permission model rather than
 * in a scope an author has to get right by hand.
 *
 * THE FLOW IS A TOP-LEVEL REDIRECT, NOT A POPUP, and that is the decision
 * everything here follows from. A popup would `postMessage` its code back
 * to `window.opener`, and `github.com` serves
 * `Cross-Origin-Opener-Policy: same-origin-allow-popups`, which keeps
 * handles to popups IT opens and does not preserve its opener: navigating
 * a popup there swaps the browsing-context group, `opener` becomes null
 * inside it, and the swap is NOT undone when the popup comes back to our
 * origin. The handshake then goes nowhere and the gate sits there looking
 * idle. `popup.closed` also reads true after the swap, so a "did they
 * close it?" poll is actively wrong in exactly the case it exists for.
 * And none of that is reproducible here: a test must stub `github.com`
 * with a local fixture, and a fixture sends no COOP. A redirect has no
 * such leg -- every step is a navigation, which is interceptable, and the
 * whole round trip is one end-to-end test against the built artifact.
 *
 * The cost, recorded rather than hidden: there is no mid-session
 * re-authentication. When the token's eight hours are up the page goes to
 * GitHub and back, and what the author had unsaved is rescued separately.
 *
 * Every global is an injected option with a real default -- `location`,
 * `history`, `crypto` and `fetch` are all lint-legal in this directory,
 * so the linter is not what keeps this testable and was never going to
 * be. Only the seam is.
 */

import type {AuthAdapter} from './types.js';
import {memoryStorage, sessionStorageOrMemory} from './storage.js';
import type {TokenStorage} from './storage.js';

/** Where a person authorises the App. */
export const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

/** The token, with when it stops working. */
export const APP_TOKEN_KEY = 'content-tools:github-app-token';

/** The half-finished flow: what we sent, and where we were. */
export const APP_FLOW_KEY = 'content-tools:github-app-flow';

/**
 * How early a token is treated as gone.
 *
 * A request sent on a token with two seconds left arrives after it has
 * expired, and comes back a 401 that drops the session -- so the shell
 * would show the gate anyway, having first thrown away whatever the
 * request was carrying. A minute of margin turns that into an ordinary
 * sign-in before the work starts.
 */
export const EXPIRY_SKEW_MS = 60_000;

export interface GitHubAppAuthOptions {
    /** The App's client id. Public; the secret lives in the proxy. */
    clientId: string;
    /** The proxy that holds the client secret and does the exchange. */
    proxy: string;
    storage?: TokenStorage;
    now?: () => number;
    /** This page's URL. */
    href?: () => string;
    /** Leave this page for `url`. */
    navigate?: (url: string) => void;
    /** Rewrite this page's URL without navigating or adding history. */
    replaceUrl?: (url: string) => void;
    crypto?: Crypto;
    fetch?: typeof fetch;
}

/**
 * Thrown by `authenticate()` once the browser has been sent to GitHub.
 *
 * The alternative is a promise that never settles while the page is torn
 * down, which leaves the gate frozen with no explanation for however long
 * the navigation takes. An outcome that can be described and asserted is
 * worth an exception for something that is not really a failure.
 */
export class RedirectingError extends Error {
    constructor() {
        super('This page will come back once you have signed in with GitHub.');
        this.name = 'RedirectingError';
    }
}

/** The sign-in did not finish, and it was not GitHub that refused. */
export class SignInError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SignInError';
    }
}

interface Held {
    token: string;
    /** Milliseconds since the epoch, or null for a token that does not expire. */
    expiresAt: number | null;
}

interface Flow {
    state: string;
    verifier: string;
    /** The route the author was on, so signing in returns them to it. */
    hash: string;
}

export class GitHubAppAuthAdapter implements AuthAdapter {

    private readonly options: GitHubAppAuthOptions;
    private storage: TokenStorage;

    /**
     * What the gate shows instead of a token field.
     *
     * The eight hours is said out loud because it is the one thing about
     * this flow a person has to plan around: there is no mid-session
     * re-authentication, so when it lapses the page goes to GitHub and
     * back, and anything unsaved at that moment is rescued separately.
     */
    readonly gate = {
        label: 'Sign in with GitHub',
        note: 'You will be taken to GitHub to authorise this site, and brought '
            + 'back here. A session lasts about eight hours; after that, sign '
            + 'in again.'
    };

    constructor(options: GitHubAppAuthOptions) {
        this.options = options;
        this.storage = options.storage ?? sessionStorageOrMemory();
    }

    currentToken(): string | null {
        const held = this.read<Held>(APP_TOKEN_KEY);
        if (!held) {
            return null;
        }
        /* A token past its life is no token. Reporting it as one would
           send a request that comes back 401, and a 401 costs the whole
           session -- so the check that looks like belt and braces is the
           difference between signing in again and losing what you were
           doing. `null` means an App with expiration switched off. */
        if (held.expiresAt !== null && this.clock() + EXPIRY_SKEW_MS >= held.expiresAt) {
            return null;
        }
        return held.token;
    }

    async authenticate(): Promise<{token: string}> {
        const held = this.currentToken();
        if (held) {
            return {token: held};
        }

        const random = this.randomness();
        const state = base64url(random.getRandomValues(new Uint8Array(16)));
        const verifier = base64url(random.getRandomValues(new Uint8Array(32)));
        const challenge = await this.challengeFor(verifier, random);

        const here = this.currentHref();
        this.write(APP_FLOW_KEY, {state, verifier, hash: here.hash} satisfies Flow);

        const url = new URL(AUTHORIZE_URL);
        url.searchParams.set('client_id', this.options.clientId);
        url.searchParams.set('redirect_uri', this.redirectUri());
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', challenge);
        url.searchParams.set('code_challenge_method', 'S256');

        (this.options.navigate ?? (to => location.assign(to)))(url.toString());
        throw new RedirectingError();
    }

    /**
     * Finish a flow this page was redirected back from.
     *
     * Called once at boot, before the shell loads a route, so a returning
     * author never sees the gate flash past.
     */
    async resume(): Promise<void> {
        const here = this.currentHref();
        const code = here.searchParams.get('code');
        const returned = here.searchParams.get('state');
        const error = here.searchParams.get('error');
        if (!code && !error) {
            return;
        }

        /* Read and DELETE together, before anything can fail. The code in
           the URL bar is bookmarkable and shareable, and a flow that
           survived its own use would let a second visit to that URL spend
           it again. */
        const flow = this.read<Flow>(APP_FLOW_KEY);
        this.forget(APP_FLOW_KEY);

        /* Off the address bar first, and before the exchange rather than
           after it: a code sitting in `location.search` reaches every
           `Referer` the page sends and every screenshot anybody takes of
           it. The fragment goes back to wherever the author was when they
           pressed the button. */
        this.replace(`${here.origin}${here.pathname}${flow ? flow.hash : here.hash}`);

        if (error) {
            throw new SignInError(
                here.searchParams.get('error_description')
                ?? `GitHub refused the sign-in (${error}).`);
        }
        if (!flow) {
            throw new SignInError(
                'This sign-in could not be completed, because the browser no longer '
                + 'has the request that started it. Signing in again should work.');
        }
        if (returned !== flow.state) {
            /* The nonce. Without it, a link crafted by somebody else can
               make this page spend THEIR code and sign the author into
               THEIR repository, which is a login-CSRF and reads as the
               tool being broken rather than as an attack. */
            throw new SignInError(
                'This sign-in did not match the one this tab started, so it was '
                + 'stopped. Signing in again should work.');
        }

        const body = new URLSearchParams({
            code,
            code_verifier: flow.verifier,
            redirect_uri: this.redirectUri()
        });
        const http = this.options.fetch ?? ((input, init) => fetch(input, init));

        let answer: Response;
        try {
            answer = await http(this.options.proxy, {
                method: 'POST',
                /* Form-encoded: a CORS-simple content type, so the browser
                   sends no preflight and the proxy needs no OPTIONS
                   branch. */
                headers: {'content-type': 'application/x-www-form-urlencoded'},
                body: body.toString()
            });
        } catch (reason) {
            /* Wrapped, because a rejected `fetch` is a TypeError and the
               shell describes those as "could not reach GitHub" -- which
               names the wrong machine. The proxy is this deployment's own,
               and an operator told it is unreachable knows where to look. */
            throw new SignInError(
                `The sign-in service at ${this.options.proxy} could not be reached `
                + `(${(reason as Error).message}).`);
        }

        const result = await answer.json().catch(() => ({})) as {
            token?: string;
            expires_in?: number;
            error_description?: string;
            error?: string;
        };
        /* `!answer.ok` is deliberately not tested as well. There is no
           answer it refuses that this does not: a token is the only thing
           worth having, and a proxy that sends one with a 4xx has
           answered the question. Written both ways, the extra term was
           unkillable -- and the status is still in the message below,
           which is the part an operator reads.

           `result.error` as a second fallback went the same way: the
           handler this ships with fills `error_description` in every
           refusal it makes, falling back to the code itself, so nothing
           reaching here carries one without the other. */
        if (!result.token) {
            throw new SignInError(
                result.error_description
                ?? `The sign-in service answered ${answer.status}.`);
        }

        /* Computed against OUR clock from a relative lifetime, never from
           an absolute time GitHub sends. Skew between the two machines
           then cancels instead of accumulating into a token we think is
           live and GitHub does not. An absent `expires_in` is an App with
           expiration switched off: no expiry.

           Recorded rather than defended: computing `clock() + undefined *
           1000` instead is UNKILLABLE, because it is `NaN`, and
           `JSON.stringify` writes `NaN` as `null` -- so the storage round
           trip below launders it back into exactly the value this branch
           writes, and no test can tell the two apart. The branch stays
           because it is the honest statement of the rule, and because
           the equivalence ends the moment anything holds a `Held`
           without serialising it. */
        this.write(APP_TOKEN_KEY, {
            token: result.token,
            expiresAt: result.expires_in === undefined
                ? null
                : this.clock() + result.expires_in * 1000
        } satisfies Held);
    }

    async logout(): Promise<void> {
        this.forget(APP_TOKEN_KEY);
        /* The half-finished flow too. Leaving it would let the next
           sign-in match a state this session no longer means. */
        this.forget(APP_FLOW_KEY);
    }

    // --- the seams, and the storage guards ---------------------------------

    private clock(): number {
        return (this.options.now ?? Date.now)();
    }

    private currentHref(): URL {
        return new URL((this.options.href ?? (() => location.href))());
    }

    private replace(url: string): void {
        (this.options.replaceUrl
            ?? (to => history.replaceState(null, '', to)))(url);
    }

    private redirectUri(): string {
        /* This page without its query or fragment. Both must be gone: the
           query would carry a previous attempt's `code` into the next
           one's callback, and GitHub matches the registered callback URL
           exactly. It also has to be the SAME string at authorize and at
           exchange, which is why it is derived once here. */
        const here = this.currentHref();
        return `${here.origin}${here.pathname}`;
    }

    private randomness(): Crypto {
        const random = this.options.crypto ?? globalThis.crypto;
        if (!random || !random.subtle) {
            /* `crypto.subtle` is undefined outside a secure context. The
               message names the cause, because the alternative is
               "cannot read properties of undefined" on a deployment whose
               only mistake was http:// */
            throw new SignInError(
                'Signing in needs a secure context. Serve this page over HTTPS '
                + '(or from localhost) and try again.');
        }
        return random;
    }

    private async challengeFor(verifier: string, random: Crypto): Promise<string> {
        const digest = await random.subtle.digest(
            'SHA-256', new TextEncoder().encode(verifier));
        return base64url(new Uint8Array(digest));
    }

    private read<T>(key: string): T | null {
        try {
            const raw = this.storage.getItem(key);
            /* Unkillable, and kept: `JSON.parse(null)` coerces to the
               string `'null'` and answers `null`, and every other falsy
               value throws into the catch, so nothing distinguishes the
               guard from its absence. What it does earn is the narrowing
               -- `getItem` returns `string | null` and `JSON.parse` takes
               a string -- and a cast that says the same thing with less
               of it visible is not an improvement. */
            return raw ? JSON.parse(raw) as T : null;
        } catch {
            /* Storage that refuses, or a value somebody else wrote. Either
               way the answer to "am I signed in?" is no, and an exception
               here would take the whole shell down on boot. */
            return null;
        }
    }

    private write(key: string, value: unknown): void {
        try {
            this.storage.setItem(key, JSON.stringify(value));
        } catch {
            const memory = memoryStorage();
            memory.setItem(key, JSON.stringify(value));
            this.storage = memory;
        }
    }

    private forget(key: string): void {
        try {
            this.storage.removeItem(key);
        } catch {
            /* A storage that refuses to forget is one this adapter must
               stop reading: a logout that leaves a working token behind is
               the one failure here that matters. */
            this.storage = memoryStorage();
        }
    }
}

/** Base64 without the three characters a URL would have to escape. */
function base64url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
