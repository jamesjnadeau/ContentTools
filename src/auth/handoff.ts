/* What `/admin` hands an author when it sends them to the site's page.
 *
 * The management screens hold a token; the words are written on the
 * site's own page, which is a DIFFERENT BROWSING CONTEXT and usually a
 * different origin -- a deploy preview at
 * `deploy-preview-12--site.netlify.app` for anything with a pull request,
 * which is every draft. `sessionStorage` is per-origin and per-tab, so
 * the page the author lands on can see nothing the shell put away, and
 * `target="_blank"` implies `noopener` in current browsers, so even a
 * same-origin tab inherits no copy of it.
 *
 * So the token travels in the URL FRAGMENT, and this module is the one
 * place either end spells that. Two things are worth saying about the
 * choice rather than leaving them to be discovered:
 *
 * WHAT A FRAGMENT COSTS. It is never sent to a server and never appears
 * in a `Referer`, so it stays out of every log. What it does reach is
 * the address bar, the session history entry, and anything with tab
 * access -- an extension, or somebody standing behind the author. The
 * receiving script takes it out of all three on its first line, before
 * it has loaded anything; what it cannot undo is that it was there for
 * that tick.
 *
 * WHAT IT DOES NOT COST. This is not OAuth's implicit grant, whatever
 * the mechanism looks like. There is no authorization server choosing a
 * `redirect_uri`, so the open-redirector class does not exist here: the
 * URL is computed by our own shell from the deployment's own config, on
 * an explicit click. And injection buys an attacker nothing. A crafted
 * `#cms-token=` link makes a victim's browser hold the ATTACKER's token
 * for that origin -- but the repository comes from the site's config,
 * not from the token, so a token without write access makes the author's
 * next Submit fail, and one with write access is a thing the attacker
 * could already have used directly. The residual is misattribution and
 * annoyance, and it is the same in both directions.
 *
 * The VALUE is opaque here, byte for byte what the adapter's storage
 * held, and the KEY travels with it. That is what lets an App token's
 * expiry cross without this module knowing what an expiry is -- and it
 * is why the key is checked against a list rather than trusted: a
 * crafted URL must not be able to write any key it likes into somebody's
 * `sessionStorage`.
 */

import {APP_TOKEN_KEY, TOKEN_KEY} from './storage.js';

/**
 * The query flag that asks a page for the editing surface.
 *
 * Here rather than in `src/edit/index.ts` because the shell writes it
 * and that script reads it, and the two are the same handoff -- one
 * carries a secret and one does not. A flag spelled in two places is a
 * link that opens a page where nothing happens.
 *
 * It rides in the HREF, where the token deliberately does not: it is not
 * a secret, so a copied link and a middle-clicked one still reach a page
 * that puts its bar up and says how to sign in, rather than one that
 * looks like nothing loaded.
 */
export const EDIT_FLAG = 'cms-edit';

/**
 * `url` with the edit flag on it.
 *
 * Beside the flag rather than in the view that writes it, so the one
 * place that knows the spelling is the one place that knows how to add
 * it -- and so a test can drive it without a screen. `&` when the page
 * template already carries a query, which a site with a locale or a
 * preview parameter in its URLs will.
 */
export function withEditFlag(url: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}${EDIT_FLAG}`;
}

/** The fragment parameter carrying the stored value. */
export const TOKEN_PARAM = 'cms-token';

/** The fragment parameter naming which key it belongs under. */
export const KEY_PARAM = 'cms-key';

/**
 * A token as its adapter stores it: the key, and the exact string.
 *
 * Deliberately not `{token, expiresAt}`. The two adapters keep different
 * shapes -- a bare bearer, and a JSON object with an expiry -- and a
 * handoff that understood either would be a third place that has to be
 * updated when one of them changes, with the failure showing up as an
 * author who signs in and is told they are signed out.
 */
export interface Handoff {
    readonly key: string;
    readonly value: string;
}

/** The keys a handoff is allowed to name. */
const KEYS: readonly string[] = [TOKEN_KEY, APP_TOKEN_KEY];

/**
 * The fragment that hands `handoff` to another origin, with no `#`.
 *
 * The VALUE is encoded, because it is arbitrary bytes: the App adapter's
 * is a JSON object, and `&`, `=` and `#` are all ordinary characters
 * inside one. The KEY is not, and that is not an oversight -- it was
 * written both ways and no test could tell the difference, because no
 * key that can reach here needs it. `readHandoff` accepts the two
 * constants in `KEYS` and nothing else, and neither has a character a
 * fragment cares about; a key that did would be refused with the
 * encoding exactly as it is refused without it.
 */
export function handoffFragment(handoff: Handoff): string {
    return `${TOKEN_PARAM}=${encodeURIComponent(handoff.value)}`
        + `&${KEY_PARAM}=${handoff.key}`;
}

/** A handoff read out of a fragment, and the fragment without it. */
export interface Claimed {
    readonly handoff: Handoff;
    /** What is left of the fragment, `#` and all, or `''` for nothing. */
    readonly rest: string;
}

/**
 * The handoff in `hash`, or null.
 *
 * Split on `&` and rejoined rather than run through `URLSearchParams`,
 * which would be the obvious reach and is wrong here: a fragment is not
 * a query string, and a page whose own anchor is `#section-2` would come
 * back out of a round trip through `URLSearchParams` as `#section-2=`.
 * Taking two segments out of a list leaves every other one exactly as
 * the site wrote it.
 */
export function readHandoff(hash: string): Claimed | null {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;

    let value: string | null = null;
    let key: string | null = null;
    const rest: string[] = [];
    for (const segment of raw.split('&')) {
        const at = segment.indexOf('=');
        if (at === -1) {
            /* A segment with no `=` is not a parameter, it is the
               page's own anchor. Reading one as a parameter with an
               empty value is how `#cms-token` -- a link cut off at the
               `=` -- would sign somebody in as nobody: a stored empty
               string reads as a token everywhere that asks. */
            rest.push(segment);
            continue;
        }
        const name = segment.slice(0, at);
        const held = segment.slice(at + 1);
        if (name === TOKEN_PARAM) {
            value = decoded(held);
        } else if (name === KEY_PARAM) {
            key = decoded(held);
        } else {
            rest.push(segment);
        }
    }

    /* Both halves, something under the first, and a key we recognise. A
       fragment carrying one half is a link that was truncated somewhere
       -- a chat client that stopped at the `&`, a copy that missed the
       end -- and storing half of it would be storing a token under a
       name nothing reads, or a name with nothing under it.

       `key === null` is not tested for: a mangled key decodes to null
       and `KEYS` does not contain it, which is the same refusal one
       line later. */
    if (!value || !KEYS.includes(key)) {
        return null;
    }
    return {handoff: {key, value}, rest: rest.length === 0 ? '' : `#${rest.join('&')}`};
}

/** `decodeURIComponent`, or null for a fragment nobody could have meant. */
function decoded(raw: string): string | null {
    try {
        return decodeURIComponent(raw);
    } catch {
        /* A lone `%` is not an error worth a screen: it is a link that
           was mangled in transit, and the honest answer to "is there a
           handoff here" is no. */
        return null;
    }
}
