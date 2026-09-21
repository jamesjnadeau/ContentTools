/* Where a token is kept, and what to do when the browser refuses.
 *
 * Extracted from `pat.ts` when the GitHub App adapter needed the same
 * three things. Both adapters hold a bearer token for the life of a tab,
 * and both meet the same hostile browser; two copies of that would be two
 * places for the fallback to be subtly different, and the difference
 * would only show on the machines where it matters.
 */

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
