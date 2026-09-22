/* Which adapter a config means.
 *
 * Two surfaces ask this now and they must get the same answer. The shell
 * asks it to put a sign-in screen up; the in-page script asks it to find
 * out whether this tab already holds a token, and it must NOT offer to
 * sign anybody in -- a credential field on somebody's published blog post
 * is a phishing lesson nobody should be teaching their authors.
 *
 * Written apart, the two would diverge the way this kind of dispatch
 * always does: a deployment moves to `kind: github-app`, the shell
 * follows it and the in-page script keeps reading the personal-access-
 * token key -- so an author signs in perfectly, walks to a page of their
 * own site, and is told to sign in again. Nothing has failed and there is
 * nothing to see.
 *
 * In `src/auth/` rather than `src/cms/` because it is about adapters and
 * nothing else; `src/cms/index.ts` re-exports it beside them, which is
 * where every consumer already looks.
 */

import type {CmsConfig} from '../cms/config.js';
import type {AuthAdapter} from './types.js';
import {PatAuthAdapter} from './pat.js';
import {GitHubAppAuthAdapter} from './github-app.js';

export interface AdapterOptions {
    /**
     * What the person just typed, for the PAT adapter to take. Absent on
     * a surface that only READS a token -- `currentToken()` needs none of
     * this, and an adapter built without it simply refuses to
     * authenticate, which is the correct answer there.
     */
    readonly prompt?: () => string | null;
    /** Late-bound, so a host page that sets its own `fetch` is honoured. */
    readonly fetch?: typeof globalThis.fetch;
}

/** The adapter this deployment's config asks for. */
export function adapterFor(
        config: CmsConfig, options: AdapterOptions = {}): AuthAdapter {
    const auth = config.backend.auth;
    if (auth.kind !== 'github-app') {
        return new PatAuthAdapter({prompt: options.prompt});
    }
    return new GitHubAppAuthAdapter({
        clientId: auth.clientId,
        proxy: auth.proxy,
        fetch: options.fetch
    });
}
