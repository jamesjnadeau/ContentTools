/* `dist/edit.js` -- the script a site puts on its OWN pages.
 *
 * This is the other half of the product from `<content-tools-cms>`. The
 * shell under `/admin` manages drafts and pull requests; the editing
 * happens HERE, on the published page, with the site's real template and
 * real stylesheet around the words being edited. That is the whole
 * argument: an editor that shows you the page you are editing is worth
 * more than one that shows you a text box.
 *
 * IT GOES ON EVERY PAGE, WHICH DECIDES ITS SHAPE. A blog's readers
 * outnumber its authors by a very long way, and none of them should pay
 * for an editor. So this module -- the one a page downloads -- is the
 * decision and nothing else, and every byte behind that decision is
 * behind a dynamic `import()`:
 *
 *     <script type="module" src="/cms/edit.js"></script>
 *
 * The cost to a reader is this file plus the two storage keys it asks
 * about. The editor, the markdown parser, the GitHub client and the
 * config loader arrive only for somebody who is actually editing.
 *
 * The price of that is stated rather than hidden: a lazy chunk that 404s
 * from a badly-deployed static host fails nowhere until an author asks
 * for the editor, by which time whoever deployed it has stopped looking.
 * `open()` puts that failure on the screen rather than in the console,
 * and the deployment guide says to press the button once.
 *
 * This file is exempt from the `no-restricted-globals` rule, like
 * `src/global.ts` and for the same reason: a plain script has no element
 * to hand it a document, so this is the boundary where the ambient
 * globals enter. Everything below takes them as parameters.
 */

import {APP_TOKEN_KEY, TOKEN_KEY} from '../auth/storage.js';

/**
 * The query flag that asks for the editing surface on this page.
 *
 * This is what `/admin` links out with, so an author who presses Edit on
 * a row lands on the page itself with the editor already coming up.
 */
export const EDIT_FLAG = 'cms-edit';

/**
 * Whether this page should load the editing surface at all.
 *
 * Two ways in, and the second is the one that makes this feel like part
 * of the site rather than a mode you enter from somewhere else: an
 * author who has signed in keeps the editor as they move around,
 * because the token is already in this tab. A reader has neither, asks
 * `sessionStorage` twice, and downloads nothing more.
 *
 * `sessionStorage` is reached inside a try/catch because reaching for
 * the PROPERTY is what throws in a sandboxed iframe and in some private
 * modes -- the same hostility `sessionStorageOrMemory` exists for. A
 * browser that refuses it is a browser where nobody is signed in, so the
 * honest answer to the question is the flag alone.
 */
export function wanted(where: Window): boolean {
    if (new URLSearchParams(where.location.search).has(EDIT_FLAG)) {
        return true;
    }
    try {
        const held = where.sessionStorage;
        return held.getItem(TOKEN_KEY) !== null
            || held.getItem(APP_TOKEN_KEY) !== null;
    } catch {
        return false;
    }
}

/**
 * Load the editing surface, if this page wants one.
 *
 * Exported and called at the bottom of this file, rather than only
 * called: a host page that wants to decide for itself -- a staging site
 * that offers the editor to everyone, a CMS embedded in something larger
 * -- imports this module and calls `boot(window)` on its own terms, and
 * the automatic call has already answered no.
 */
export async function boot(where: Window): Promise<void> {
    if (!wanted(where)) {
        return;
    }
    const {open} = await import('./surface.js');
    await open(where, {contentStyles: CONTENT_STYLES});
}

/**
 * Where the content stylesheet is, worked out from where THIS file is.
 *
 * It has to be computed here and passed down, rather than in the module
 * that uses it: `./surface.js` is bundled into a hashed chunk in
 * `dist/chunks/`, so its own `import.meta.url` is a directory deeper and
 * a relative href from there points at a file that is not on the server.
 * This module is `dist/edit.js` itself -- the one path the site wrote in
 * its own `<script src>` -- so it is the only place on this side of the
 * dynamic import that knows where `dist/` is.
 *
 * Minified, unlike the ESM entries: this one is served to an author's
 * browser as-is rather than handed to somebody's bundler, and the rules
 * are identical either way.
 */
const CONTENT_STYLES =
    new URL('./content-tools-content.min.css', import.meta.url).href;

/* `typeof` rather than a bare read, so importing this module in a
   non-browser context -- a bundler's SSR pass, a Node test -- is inert
   rather than a ReferenceError. */
if (typeof window !== 'undefined') {
    void boot(window);
}
