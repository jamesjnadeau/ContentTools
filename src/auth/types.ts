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
}
