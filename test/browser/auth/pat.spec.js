/* The token adapter that needs no infrastructure.

   One assertion here is not about behaviour at all: the token must not
   reach `localStorage`. The difference between the two storages is one
   word and no observable behaviour until somebody else uses the machine,
   so it is asserted rather than commented. */

import {
    NotAuthenticatedError, PatAuthAdapter, TOKEN_KEY
} from '../../../src/auth/pat.js';

/** A `Storage` that works, so a test does not depend on the browser's. */
function fakeStorage(initial = {}) {
    const held = new Map(Object.entries(initial));
    return {
        held,
        getItem: key => held.get(key) ?? null,
        setItem: (key, value) => void held.set(key, value),
        removeItem: key => void held.delete(key)
    };
}

/** A `Storage` that is there and refuses -- a sandboxed iframe's. */
function hostileStorage(failing = ['getItem', 'setItem', 'removeItem']) {
    const throwing = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    const real = fakeStorage();
    return {
        getItem: failing.includes('getItem') ? throwing : real.getItem,
        setItem: failing.includes('setItem') ? throwing : real.setItem,
        removeItem: failing.includes('removeItem') ? throwing : real.removeItem
    };
}

const adapter = (options = {}) => new PatAuthAdapter({
    prompt: () => 'github_pat_typed',
    storage: fakeStorage(),
    ...options
});

describe('PatAuthAdapter', function() {

    it('asks for a token and holds on to it', async function() {
        const storage = fakeStorage();
        const auth = adapter({storage});

        expect(await auth.authenticate()).toEqual({token: 'github_pat_typed'});
        expect(auth.currentToken()).toBe('github_pat_typed');
        return expect(storage.held.get(TOKEN_KEY)).toBe('github_pat_typed');
    });

    it('does not ask twice', async function() {
        /* The shell calls `authenticate()` whenever it needs a token,
           including after a 401 on an unrelated request. Prompting each
           time would make a rate limit look like a logout. */
        let asked = 0;
        const auth = adapter({prompt: () => {
            asked += 1;
            return 'token';
        }});

        await auth.authenticate();
        await auth.authenticate();
        return expect(asked).toBe(1);
    });

    it('takes a token that was already there', async function() {
        // A reload of the same tab.
        const auth = adapter({
            storage: fakeStorage({[TOKEN_KEY]: 'from-before'}),
            prompt: () => 'should not be asked'
        });
        return expect((await auth.authenticate()).token).toBe('from-before');
    });

    it('has no token before anybody signs in', function() {
        return expect(adapter().currentToken()).toBe(null);
    });

    it('trims what was pasted', async function() {
        /* A token copied out of GitHub's own page arrives with a newline
           about as often as not, and a bearer header carrying one comes
           back as a 401 that says nothing about whitespace. */
        const auth = adapter({prompt: () => '  github_pat_x\n'});
        return expect((await auth.authenticate()).token).toBe('github_pat_x');
    });

    it.each([[null], [''], ['   ']])('refuses %p rather than carrying on', async function(given) {
        /* Cancelling the prompt is a refusal, not an empty token: a
           client built with one fails later at a request, where the
           error says 401 and not "you have not signed in". */
        const auth = adapter({prompt: () => given});
        await expect(auth.authenticate()).rejects.toThrow(NotAuthenticatedError);
        return expect(auth.currentToken()).toBe(null);
    });

    it('takes a prompt that answers later', async function() {
        // A dialog the user types into, rather than `window.prompt`.
        const auth = adapter({prompt: async () => 'from-a-dialog'});
        return expect((await auth.authenticate()).token).toBe('from-a-dialog');
    });

    it('forgets the token on logout, and asks again after', async function() {
        const storage = fakeStorage();
        const auth = adapter({storage});
        await auth.authenticate();

        await auth.logout();
        expect(auth.currentToken()).toBe(null);
        expect(storage.held.has(TOKEN_KEY)).toBe(false);
        return expect((await auth.authenticate()).token).toBe('github_pat_typed');
    });

    it('keeps using the storage after an ordinary logout', async function() {
        /* A logout is not a reason to stop persisting: signing back in
           should survive a reload exactly as the first sign-in did. */
        const storage = fakeStorage();
        const auth = adapter({storage});
        await auth.authenticate();
        await auth.logout();
        await auth.authenticate();
        return expect(storage.held.get(TOKEN_KEY)).toBe('github_pat_typed');
    });

    describe('storage that is there and refuses', function() {

        /* A sandboxed iframe, and some private-browsing modes: touching
           `sessionStorage` throws rather than returning null. Failing to
           start is worse than losing the token on reload. */

        it('still signs in when writing throws', async function() {
            const auth = adapter({storage: hostileStorage(['setItem'])});
            expect((await auth.authenticate()).token).toBe('github_pat_typed');
            return expect(auth.currentToken()).toBe('github_pat_typed');
        });

        it('reads as signed out when reading throws', function() {
            return expect(adapter({storage: hostileStorage(['getItem'])}).currentToken()).toBe(null);
        });

        it('really signs out when forgetting throws', async function() {
            /* The one failure here that matters: a logout that leaves a
               working token behind. */
            const auth = adapter({storage: hostileStorage(['removeItem'])});
            await auth.authenticate();
            await auth.logout();
            return expect(auth.currentToken()).toBe(null);
        });
    });

    it('defaults to sessionStorage, and never touches localStorage', async function() {
        /* The assertion this file exists for. A token in `localStorage`
           outlives the tab, and the reason the user pasted it, and sits
           in a shared origin on a machine somebody else may use next. */
        window.sessionStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(TOKEN_KEY);

        const auth = new PatAuthAdapter({prompt: () => 'in-the-real-storage'});
        try {
            await auth.authenticate();
            expect(window.sessionStorage.getItem(TOKEN_KEY)).toBe('in-the-real-storage');
            expect(window.localStorage.getItem(TOKEN_KEY)).toBe(null);
            // Nothing else of ours, under any key.
            return expect([...Array(window.localStorage.length).keys()]
                .map(i => window.localStorage.key(i))
                .filter(key => key.startsWith('content-tools'))).toEqual([]);
        } finally {
            await auth.logout();
        }
    });
});
