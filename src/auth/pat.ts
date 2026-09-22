/* A fine-grained personal access token, held for the life of the tab.
 *
 * The adapter that needs no infrastructure: no OAuth app, no hosted secret,
 * no function to deploy. A solo operator scopes a token to the one
 * repository their deployment edits, pastes it in, and the pull request
 * workflow works on a static host with nothing else running. That is a real
 * deployment shape rather than a stand-in for the App flow, and it is also
 * the only way to try the workflow by hand on the day it first runs.
 *
 * `sessionStorage`, never `localStorage`: a token that outlives the tab
 * outlives the reason the user pasted it, and sits in a shared origin on a
 * machine somebody else may use next. A test asserts the absence, because
 * the difference between the two is one word and no behaviour.
 */

import type {AuthAdapter} from './types.js';
import {memoryStorage, sessionStorageOrMemory, TOKEN_KEY} from './storage.js';
import type {Handoff} from './handoff.js';
export {TOKEN_KEY};
/* Re-exported so `./cms` keeps exporting it from here, where every
   consumer already imports it from. */
export type {TokenStorage} from './storage.js';
import type {TokenStorage} from './storage.js';


export interface PatAuthOptions {
    /**
     * Asks the user for a token. Returning null or an empty string is a
     * refusal, and `authenticate()` rejects rather than carrying on with
     * nothing -- a client built around a missing token fails later, at a
     * request, where the error says 401 and not "you have not signed in".
     *
     * OPTIONAL, because a surface can want `currentToken()` and nothing
     * else: the in-page script asks whether this tab is already signed in
     * and must never put a credential field on somebody's published page.
     * An adapter built without one refuses to authenticate, in the same
     * words a refused prompt gets.
     */
    prompt?: () => string | null | Promise<string | null>;
    /** Defaults to `sessionStorage`. */
    storage?: TokenStorage;
    /** Defaults to `content-tools:github-token`. */
    key?: string;
}


/** Nobody signed in. */
export class NotAuthenticatedError extends Error {
    constructor(message = 'no GitHub token was given') {
        super(message);
        this.name = 'NotAuthenticatedError';
    }
}

export class PatAuthAdapter implements AuthAdapter {

    private readonly ask: (() => string | null | Promise<string | null>) | undefined;
    private readonly key: string;
    private storage: TokenStorage;

    constructor(options: PatAuthOptions) {
        this.ask = options.prompt;
        this.key = options.key ?? TOKEN_KEY;
        this.storage = options.storage ?? sessionStorageOrMemory();
    }

    currentToken(): string | null {
        try {
            return this.storage.getItem(this.key);
        } catch {
            /* Storage that worked at construction and fails now: the tab
               has been put in a state that forbids it, and a shell asking
               "am I signed in?" wants an answer rather than an
               exception. */
            return null;
        }
    }

    /**
     * What crosses to the site's own page.
     *
     * `currentToken()` rather than a second read of storage, so a
     * storage that has started refusing answers the same way here as it
     * does everywhere else -- and so the two can never disagree about
     * whether this tab is signed in.
     */
    handoff(): Handoff | null {
        const held = this.currentToken();
        /* The KEY this instance was built with, not the module
           constant. `options.key` exists so a second adapter can be
           parked somewhere else, and a handoff naming the default would
           put the token where that instance is not looking. */
        return held === null ? null : {key: this.key, value: held};
    }

    async authenticate(): Promise<{token: string}> {
        const held = this.currentToken();
        if (held) {
            return {token: held};
        }

        /* Trimmed, because a token pasted out of GitHub's own page comes
           with a trailing newline about as often as not, and a bearer
           header with one in it fails as a 401 that says nothing about
           whitespace. */
        /* No prompt is a refusal, not a crash. Under
           `strictNullChecks: false` an absent one arrives here as
           `undefined` however carefully the caller was written, and
           "this.ask is not a function" on an author's own blog post is
           the worst available way to say nobody is signed in. */
        const given = (this.ask ? await this.ask() ?? '' : '').trim();
        if (!given) {
            throw new NotAuthenticatedError();
        }

        this.remember(given);
        return {token: given};
    }

    async logout(): Promise<void> {
        try {
            this.storage.removeItem(this.key);
        } catch {
            /* A storage that refuses to forget is one this adapter must
               stop reading: a logout that leaves a working token behind
               is the one failure here that matters. Signing in again
               then keeps the token in memory for this tab, which is a
               reload away from being asked for -- the safe way round. */
            this.storage = memoryStorage();
        }
    }

    private remember(token: string): void {
        try {
            this.storage.setItem(this.key, token);
        } catch {
            const memory = memoryStorage();
            memory.setItem(this.key, token);
            this.storage = memory;
        }
    }
}
