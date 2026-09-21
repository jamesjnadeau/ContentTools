/* What the CMS needs from whatever holds a GitHub token.
 *
 * One interface, two implementations eventually: the fine-grained personal
 * access token here, and a GitHub App OAuth proxy (M4) whose whole extra
 * weight is a hosted endpoint doing the code exchange. Both hand back the
 * same thing -- a bearer token the client sends -- so the shell above them
 * does not branch on which is installed.
 *
 * Nothing in here knows about the editor, and the editor knows nothing
 * about it: the Milestone 1 obligation is that network, persistence and
 * auth stay out of `editor.ts` and the element, and their contract still
 * ends at `ct-saved`.
 */

export interface AuthAdapter {
    /**
     * A token, asking the user for one if there is not already one to
     * hand. Called when the shell starts and again after a 401.
     */
    authenticate(): Promise<{token: string}>;
    /** Forget the token. */
    logout(): Promise<void>;
    /** The token held right now, without asking anybody for one. */
    currentToken(): string | null;

    /**
     * What the gate offers instead of a field for a secret.
     *
     * Absent means the PAT form, which is why it is optional: nothing
     * written against this interface before the App adapter existed
     * needs an edit, including every hand-rolled stub in the specs.
     *
     * It hangs off the ADAPTER rather than off config-derived state
     * because "does signing in need a secret from the person, or just a
     * click?" is a property of the thing that produces a token. Derived
     * from config instead, a host page that assigns `el.auth` directly
     * gets a password field wired to an adapter that ignores it.
     */
    readonly gate?: {
        /** What the button says, e.g. `Sign in with GitHub`. */
        readonly label: string;
        /** One sentence about what pressing it does. */
        readonly note: string;
    };

    /**
     * Finish a flow this page was redirected back from.
     *
     * Called once at boot, after the config resolves and before the
     * first route loads, so a returning author never sees the gate flash
     * past. Absent means there is nothing to finish -- an adapter whose
     * whole flow happens in the page, like the PAT one, needs no such
     * call and does not declare one.
     */
    resume?(): Promise<void>;
}
