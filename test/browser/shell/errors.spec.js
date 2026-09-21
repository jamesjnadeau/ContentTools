import {describeError} from '../../../src/shell/errors.js';
import {ConfigError} from '../../../src/cms/config.js';
import {GitHubError, ConflictError} from '../../../src/cms/github.js';
import {NotAuthenticatedError} from '../../../src/auth/pat.js';
import {NothingToSaveError} from '../../../src/cms/repo.js';
import {RedirectingError, SignInError} from '../../../src/auth/github-app.js';

/* The mapping from a thrown thing to what a person reads.
 *
 * The spec imports the real classes; the module under test imports none of
 * them, and the test below named "an error from another copy" is why.
 */

describe('describeError', function() {
    it('surfaces a ConfigError path, which is the whole point of the row', function() {
        /* A typo in a hand-edited config is the likeliest failure a site
           operator will ever hit. `collections[2].folder` is the difference
           between a two-minute fix and an afternoon. */
        const described = describeError(new ConfigError('collections[2].folder', 'must be a string'));
        expect(described.kind).toBe('config');
        expect(described.path).toBe('collections[2].folder');
        expect(described.detail).toBe('must be a string');
    });

    it('does not print a config path twice', function() {
        // ConfigError's own message already reads `${path}: ${message}`.
        const described = describeError(new ConfigError('backend.repo', 'must be owner/name'));
        expect(described.detail).not.toContain('backend.repo');
    });

    it('keeps the message of a ConfigError with no path', function() {
        const described = describeError(new ConfigError('', 'could not load /cms.yml: 404'));
        expect(described.path).toBe('');
        expect(described.detail).toBe('could not load /cms.yml: 404');
    });

    it('sends an empty token submission back to the gate', function() {
        expect(describeError(new NotAuthenticatedError()).kind).toBe('unauthorized');
    });

    it('sends a 401 back to the gate', function() {
        const described = describeError(new GitHubError('GET', '/repos/o/r', 401, {message: 'Bad credentials'}));
        expect(described.kind).toBe('unauthorized');
    });

    it('reads a 404 as "not permitted", not "not there"', function() {
        /* GitHub answers 404 rather than 403 for a repository a token
           cannot see, so the reply does not disclose whether it exists.
           Reporting it as missing sends an operator hunting a typo in a
           config file that is correct. */
        for (const status of [403, 404]) {
            const described = describeError(
                new GitHubError('GET', '/repos/o/r/git/ref/heads/main', status, null));
            expect(described.kind).toBe('forbidden');
            expect(described.title).toContain('cannot reach this repository');
            // It names the two permissions, because that is the fix.
            expect(described.detail).toContain('Contents');
            expect(described.detail).toContain('Pull requests');
        }
    });

    it('passes any other GitHub status through with what the API said', function() {
        const described = describeError(new GitHubError('POST', '/repos/o/r/pulls', 500, {message: 'boom'}));
        expect(described.kind).toBe('github');
        expect(described.title).toContain('500');
        expect(described.detail).toContain('boom');
    });

    it('gives a ConflictError its own kind, ahead of the GitHubError branch', function() {
        /* `ConflictError extends GitHubError`, so the suffix match below
           would claim it and report a bare "GitHub returned 422" -- which
           tells the person nothing about the only thing that matters:
           their work is still in hand and somebody else's is in the
           repository. The row has to be tested for ordering, not just for
           existence, because moving it below the GitHubError branch breaks
           it while leaving every other row passing. */
        const described = describeError(
            new ConflictError('PATCH', '/repos/o/r/git/refs/heads/x', 422, null));
        expect(described.kind).toBe('conflict');
        expect(described.title).toContain('Somebody else');
    });

    it('describes a ConflictError from ANOTHER COPY of src/cms', function() {
        /* Same reasoning as the GitHubError case below, and sharper: a
           foreign ConflictError under an instanceof check would be an
           unknown error, so the shell would report "something went wrong"
           and throw away the unwritten markdown instead of offering it. */
        const foreign = {name: 'ConflictError', message: 'ref was updated',
                         method: 'PATCH', path: '/repos/o/r/git/refs/heads/x', status: 422};
        expect(describeError(foreign).kind).toBe('conflict');
    });

    it('reports NothingToSaveError as a notice, not a failure', function() {
        /* Pressing save on an entry you have opened and not changed is an
           ordinary thing to do. Answering it in the same red panel as a
           refused token is how people learn to read past the red panel. */
        const described = describeError(new NothingToSaveError('blog', 'hello'));
        expect(described.kind).toBe('notice');
        expect(described.title).toBe('Nothing to save.');
    });

    it('describes an error from ANOTHER COPY of src/cms', function() {
        /* The reason errors.ts imports nothing and dispatches on `name`.
        
           `src/cms/` ships twice -- inlined into dist/shell.js and again as
           the standalone dist/cms.js -- and `CmsRepoOptions.github` invites
           a consumer to hand the shell an already-built client. Its errors
           are then a DIFFERENT class object, so `instanceof GitHubError` is
           false for them. Under an instanceof check this maps to `unknown`,
           the shell never returns to the gate, and the user sits on
           "Something went wrong" while the one thing that would fix it -- a
           new token -- is never offered.
        
           A plain object stands in for that foreign class, which is the
           strongest form of the test: it shares no prototype at all. */
        const foreign = {name: 'GitHubError', message: 'Bad credentials',
                         method: 'GET', path: '/repos/o/r', status: 401};
        expect(describeError(foreign).kind).toBe('unauthorized');
    });

    it('does not alarm anybody about a redirect in progress', function() {
        /* `authenticate()` raises this once the browser is on its way to
           GitHub. Described as a failure it would put a red panel on the
           screen for the fraction of a second before the page goes, which
           is how a working sign-in comes to look broken. */
        const described = describeError(new RedirectingError());
        expect(described.kind).toBe('notice');
        return expect(described.detail).toContain('signed in');
    });

    it('names the proxy, not GitHub, when the sign-in service is down',
       function() {
        /* The adapter wraps a rejected `fetch` to its exchange proxy in a
           SignInError for exactly this: as a raw TypeError it lands in the
           row below, which says "Could not reach GitHub" about a Worker
           the operator forgot to deploy. */
        const described = describeError(new SignInError(
            'The sign-in service at https://auth.example.com/exchange could not '
            + 'be reached (Failed to fetch).'));

        expect(described.kind).toBe('unauthorized');
        expect(described.title).not.toContain('GitHub');
        return expect(described.detail).toContain('auth.example.com/exchange');
    });

    it('does not blame the network for our own bug', function() {
        /* A rejected fetch and a genuine `undefined is not a function` are
           both TypeError. The message is carried verbatim rather than
           replaced, so a real bug is still readable on screen instead of
           hiding behind "you are offline". */
        const described = describeError(new TypeError('Failed to fetch'));
        expect(described.kind).toBe('offline');
        expect(described.detail).toBe('Failed to fetch');
    });

    it('survives being handed something that is not an error', function() {
        // `throw 'boom'` is legal, and a rejected promise carries anything.
        for (const thrown of ['boom', null, undefined, 42, {}]) {
            const described = describeError(thrown);
            expect(described.kind).toBe('unknown');
            expect(typeof described.title).toBe('string');
            expect(typeof described.detail).toBe('string');
        }
    });

    it('reports named fields rather than serialising whatever it was handed', function() {
        /* Everything `describeError` emits is read from a field it names.
           The tempting shortcut in the catch-all -- `JSON.stringify(error)`
           for "more detail" -- would instead drain whatever else is hanging
           off the object into the DOM, where a screenshot or a pasted bug
           report carries it out of the tab. A client that stashed its
           credential on the error it throws is all it would take, and
           nothing about the output would look wrong.
        
           So: a property nobody asked for does not come out. */
        const api = new GitHubError('GET', '/repos/o/r', 500, {message: 'boom'});
        api.token = 'github_pat_SECRET';
        expect(JSON.stringify(describeError(api))).not.toContain('SECRET');

        // The catch-all especially: it is the row with the least to say and
        // therefore the one most tempting to pad out.
        const other = new Error('boom');
        other.name = 'SomethingElse';
        other.token = 'github_pat_SECRET';
        expect(JSON.stringify(describeError(other))).not.toContain('SECRET');
    });
});
