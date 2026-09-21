/* Every failure the shell can show, as one pure function.
 *
 * Pure because the mapping is the part worth testing and the rendering is
 * not: given an error, what does a person read, and what may the shell do
 * about it. A `switch` smeared across the views would be tested nowhere.
 *
 * The rule this serves, inherited from the CMS half's dist suite: errors
 * land on the PAGE, not the console. A shell that swallows a failure shows
 * an editor that silently never saves, and `shell-dist.spec.mjs` asserts
 * zero console errors for exactly that reason.
 *
 * THIS MODULE IMPORTS NOTHING, AND THE EMPTY IMPORT LIST IS THE POINT.
 *
 * `src/cms/` ships TWICE -- inlined into `dist/shell.js`, and again as the
 * standalone `dist/cms.js` (see vite.config.mjs). `CmsRepoOptions.github`
 * is a documented seam for handing the shell an already-built client, so an
 * error thrown by a consumer's copy is a different class object from the
 * one this bundle holds, and `instanceof GitHubError` is FALSE for it. The
 * failure is silent and total: a 401 falls through to the catch-all, the
 * shell never returns to the gate, and the user sits on "Something went
 * wrong" without ever being offered the token field that would fix it.
 *
 * So dispatch on `error.name`, which every class in `src/cms/` and
 * `src/auth/` sets explicitly in its constructor, and read `status` and
 * `path` defensively. Having no imports is what makes writing `instanceof`
 * impossible rather than merely discouraged.
 */

/** How the SHELL reacts. Never rendered; `title` and `detail` are. */
export type ErrorKind =
    | 'config'        // the deployment is wrong; there is nothing to sign in to
    | 'unauthorized'  // forget the token and go back to the gate
    | 'forbidden'     // the token is real but not allowed here
    | 'github'        // the API refused, for some other reason
    | 'offline'       // the request never arrived
    | 'unknown';

export interface Described {
    /** One line, the alert's first sentence. */
    readonly title: string;
    /** The specifics. May be empty. */
    readonly detail: string;
    readonly kind: ErrorKind;
    /** A ConfigError's offending path, e.g. `collections[2].folder`. */
    readonly path: string;
}

/**
 * Describe a failure.
 *
 * Deliberately NOT mapped: `ConflictError` and `NothingToSaveError`, which
 * nothing in the shell can yet produce because nothing can yet save. A row
 * for either would be unreachable code with a test written only to reach
 * it; they arrive with the save path in M5-3, and until then fall through
 * to `github` and `unknown`, which are terse but true.
 *
 * Also not mapped: a rate-limited 403. Telling one apart from a permissions
 * 403 needs `x-ratelimit-remaining`, and a `GitHubError` carries status,
 * method, path and body but no headers -- so the only way to recognise it
 * from here is to match the API's wording, which is the thing that breaks
 * silently when the API rewords it. That row belongs to the commit that
 * gives `GitHubError` its headers.
 */
export function describeError(error: unknown): Described {
    const name = readString(error, 'name');
    const message = readString(error, 'message');
    const status = readNumber(error, 'status');

    if (name === 'ConfigError') {
        /* `.path` is the whole value of this row. A typo in a hand-edited
           config is the likeliest failure a site operator will ever hit,
           and `collections[2].folder` is the difference between a
           two-minute fix and an afternoon. */
        const path = readString(error, 'path');
        return {
            title: 'This deployment is misconfigured.',
            // The message already reads `${path}: ${message}`, so rendering
            // both would print the path twice.
            detail: withoutPrefix(message, `${path}: `),
            kind: 'config',
            path
        };
    }

    if (name === 'NotAuthenticatedError') {
        return {title: 'No token was given.', detail: message, kind: 'unauthorized', path: ''};
    }

    // `ConflictError` extends `GitHubError` and is named separately, so
    // match the suffix rather than the whole name.
    if (name.endsWith('GitHubError') || status !== null) {
        const where = `${readString(error, 'method')} ${readString(error, 'path')}`.trim();
        if (status === 401) {
            return {
                title: 'GitHub rejected that token.',
                detail: 'It may have expired or been revoked. Signing in again with a new '
                    + 'one is the fix.',
                kind: 'unauthorized',
                path: ''
            };
        }
        if (status === 403 || status === 404) {
            /* 403 and 404 are folded together deliberately. GitHub answers
               404 rather than 403 for a repository a token cannot see, so
               that the reply does not disclose whether it exists -- which
               means "not found" here usually means "not permitted", and
               reporting it as missing sends an operator hunting a typo in
               a config file that is correct. */
            return {
                title: 'That token cannot reach this repository.',
                detail: `${where} was refused (${status}). Check the token is scoped to this `
                    + 'repository and grants Contents and Pull requests, both read and write.',
                kind: 'forbidden',
                path: ''
            };
        }
        return {
            title: `GitHub returned ${status ?? 'an error'}.`,
            detail: message,
            kind: 'github',
            path: ''
        };
    }

    /* A rejected `fetch` is a TypeError, and so is a genuine bug of ours.
       The `status === null` above has already excluded anything API-shaped,
       but the message is still carried verbatim rather than replaced:
       mapping every TypeError to "you are offline" hides our own bugs
       behind a network excuse. */
    if (name === 'TypeError') {
        return {title: 'Could not reach GitHub.', detail: message, kind: 'offline', path: ''};
    }

    if (name) {
        return {title: 'Something went wrong.', detail: `${name}: ${message}`, kind: 'unknown', path: ''};
    }
    return {title: 'Something went wrong.', detail: String(error), kind: 'unknown', path: ''};
}

/**
 * A token that can read the repository but not push to it.
 *
 * Not a thrown error -- it is a 200 whose body says no -- but it is a
 * failure with a fix, and it belongs beside the rest of the wording
 * rather than inline at its one call site. It is also the worst-shaped
 * failure the gate can catch: everything works until the first save,
 * which fails with somebody's afternoon's work in the editor.
 */
export function cannotPush(repo: string): Described {
    return {
        title: `This token cannot write to ${repo}.`,
        detail: 'It needs Contents and Pull requests set to read and write, '
              + 'not read-only.',
        kind: 'forbidden',
        path: ''
    };
}

function readString(error: unknown, key: string): string {
    const value = (error as Record<string, unknown> | null)?.[key];
    return typeof value === 'string' ? value : '';
}

function readNumber(error: unknown, key: string): number | null {
    const value = (error as Record<string, unknown> | null)?.[key];
    return typeof value === 'number' ? value : null;
}

function withoutPrefix(text: string, prefix: string): string {
    return prefix.length > 2 && text.startsWith(prefix) ? text.slice(prefix.length) : text;
}
