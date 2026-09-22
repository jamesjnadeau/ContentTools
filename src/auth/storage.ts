/* Where a token is kept, and what to do when the browser refuses.
 *
 * Extracted from `pat.ts` when the GitHub App adapter needed the same
 * three things. Both adapters hold a bearer token for the life of a tab,
 * and both meet the same hostile browser; two copies of that would be two
 * places for the fallback to be subtly different, and the difference
 * would only show on the machines where it matters.
 */

/**
 * Where each adapter keeps its token.
 *
 * Here rather than in the adapter that uses each one, because a THIRD
 * reader arrived: the in-page script decides whether to load its editing
 * surface at all by asking whether this tab already holds a token, and it
 * has to ask WITHOUT importing an adapter -- the whole point of that
 * script's top level is that a reader of the site downloads almost none
 * of it. A key spelled in two places is a key that can be spelled
 * differently, and the symptom is an author who signs in and is then
 * never offered the editor, on a page where nothing has gone wrong.
 */
export const TOKEN_KEY = 'content-tools:github-token';

/** The App's token, with when it stops working. */
export const APP_TOKEN_KEY = 'content-tools:github-app-token';

/** The little of `Storage` an adapter needs, so a test can hand over a Map. */
export interface TokenStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

/**
 * Storage that is there but refuses.
 *
 * `sessionStorage` exists and throws on access in a sandboxed iframe and
 * in some private-browsing modes, so every read and write is guarded and
 * the token simply lives in memory for that tab instead. Losing the token
 * on reload is a worse experience; failing to start at all is a broken
 * one.
 */
export function memoryStorage(): TokenStorage {
    const held = new Map<string, string>();
    return {
        getItem: key => held.get(key) ?? null,
        setItem: (key, value) => void held.set(key, value),
        removeItem: key => void held.delete(key)
    };
}

export function sessionStorageOrMemory(): TokenStorage {
    try {
        /* Reaching for the property is what throws -- that is how a
           sandboxed iframe refuses. A probe read as well would be
           belt-and-braces over nothing: every later call is guarded
           separately, so a storage that starts failing halfway through
           the tab's life falls back on its own. */
        return globalThis.sessionStorage;
    } catch {
        return memoryStorage();
    }
}
