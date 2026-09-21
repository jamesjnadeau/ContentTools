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
    | 'conflict'      // somebody pushed first; offer a reload, keep the work
    | 'notice'        // not a failure at all -- say so, and do not alarm
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
 * Saving an entry nobody changed.
 *
 * Not a failure, and it must not read as one: pressing save on an entry
 * you opened and did not change is an ordinary thing to do, and answering
 * it in the same red panel as a refused token is how people learn to read
 * past the red panel.
 *
 * A constant rather than only a row in `describeError`, because the
 * repository reports the same condition two ways and both have to say the
 * same sentence. `saveEntry` THROWS `NothingToSaveError` when there is no
 * pull request to leave alone, and RETURNS `changed: false` when there is
 * one -- a distinction about branch bookkeeping that means nothing to the
 * person who pressed the button.
 */
export const NOTHING_TO_SAVE: Described = {
    title: 'Nothing to save.',
    detail: 'This entry already matches what the repository holds, so no commit '
        + 'was made.',
    kind: 'notice',
    path: ''
};

/**
 * Describe a failure.
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

    if (name === 'NothingToSaveError') {
        return NOTHING_TO_SAVE;
    }

    /* The author typed a TITLE and the repository is answering about a
       FILENAME, so the path is the whole message: `hello-world already
       exists` is a puzzle to somebody who wrote `Hello, World!` under a
       `{{year}}-{{slug}}` template they have never seen. */
    if (name === 'EntryExistsError') {
        return {
            title: 'There is already an entry with that name.',
            detail: `${readString(error, 'path')} exists, either on the site or in a `
                + 'pull request waiting for review. Choose a different name.',
            kind: 'notice',
            path: ''
        };
    }

    /* A notice rather than a failure: the entry being gone is the outcome
       the person asked for. It happens when two tabs are open, or when
       somebody else's pull request deleting it has already merged. */
    if (name === 'EntryMissingError') {
        return {
            title: 'That entry is already gone.',
            detail: `${readString(error, 'path')} is not in the repository, so there `
                + 'is nothing to delete.',
            kind: 'notice',
            path: ''
        };
    }

    /* Before the `GitHubError` branch, because `ConflictError` extends it
       and would otherwise be reported as an ordinary 422. It is the one
       API failure a shell HANDLES rather than reports: the person's work
       is still in hand, and the view offers a reload beside a copy of the
       markdown that was not written. */
    if (name === 'ConflictError') {
        return {
            title: 'Somebody else changed this entry while it was open.',
            detail: 'Nothing was written, and nothing of theirs was lost. Reload the entry '
                + 'to get their version; what this save would have written is below, to '
                + 'copy from.',
            kind: 'conflict',
            path: ''
        };
    }

    /* Not a failure: the browser is on its way to GitHub and this page is
       being torn down. `authenticate()` raises it rather than returning a
       promise that never settles, because a gate frozen with nothing on it
       for as long as a navigation takes is indistinguishable from a gate
       that is broken. */
    if (name === 'RedirectingError') {
        return {
            title: 'Taking you to GitHub.',
            detail: message,
            kind: 'notice',
            path: ''
        };
    }

    /* Before the `TypeError` row below, and that ordering is the point.
       The App adapter wraps a rejected `fetch` to the exchange proxy in
       one of these, because a raw TypeError would be described as "could
       not reach GitHub" -- naming the wrong machine, and sending an
       operator to check GitHub's status page about a Worker of their own
       that is not deployed. Every one of these messages names its own
       cause already, so the row carries it through rather than replacing
       it.

       `unauthorized` because the outcome is the same whatever refused:
       there is no token, and the person belongs at the gate with a reason
       on it. */
    if (name === 'SignInError') {
        return {
            title: 'That sign-in did not finish.',
            detail: message,
            kind: 'unauthorized',
            path: ''
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

/**
 * A deletion that was opened for review.
 *
 * A notice, because it is the outcome somebody asked for -- and it has to
 * say the second sentence out loud. The entry is still in the list
 * afterwards, still on the site, and an author who is not told why will
 * either press Delete again or conclude it did not work.
 */
export function deletedNotice(pull: number): Described {
    return {
        title: `Deletion opened as pull request #${pull}.`,
        detail: 'The entry stays on the site, and in this list, until somebody '
              + 'reviews and merges that pull request.',
        kind: 'notice',
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
