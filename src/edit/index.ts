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
import {EDIT_FLAG, readHandoff} from '../auth/handoff.js';
/* The TYPE only. The module itself is behind the dynamic import with the
   rest of the editor, which is what keeps it off a reader's page. */
import type {EditExtension} from './extension.js';

export type {EditExtension, EditorLibrary} from './extension.js';

/* Re-exported, because this is where it was and where every
   consumer of it looks. It moved down beside `readHandoff` when
   the shell started writing it: the flag and the token are the two
   halves of one handoff, and a flag spelled in two places is a link
   that opens a page where nothing happens. */
export {EDIT_FLAG};

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
 * Take a token out of the URL, if `/admin` sent one, and put it away.
 *
 * `/admin` holds a token for ITS origin, and this page is a different
 * browsing context and usually a different origin -- a deploy preview
 * for anything with a pull request -- so the only thing that crosses is
 * what the link carries. See `src/auth/handoff.ts` for why that is a
 * fragment and what it does and does not cost.
 *
 * THE ORDER IS THE POINT, and it is the one thing here worth being
 * careful about.
 *
 * The URL is rewritten FIRST, before the token is stored and long
 * before anything is downloaded. A store that fails leaves an author
 * looking at a page that says to sign in, which is a clean answer; a
 * strip that never happens leaves a bearer token in the address bar and
 * in the session history for as long as the tab lives, which is the one
 * failure this whole design is trying to keep to a single tick.
 *
 * `replaceState` rather than assigning the hash, because assigning adds
 * a history entry -- so Back would return the author to the URL with
 * the token in it, which is the opposite of taking it out.
 *
 * And it is `sessionStorage` directly with no memory fallback, unlike
 * everywhere else in this codebase, because there is nowhere for a
 * fallback to go: `surface.ts` builds its own adapter from the config
 * and reads real storage, so a token held in a variable here would be a
 * token nothing ever finds. A browser that refuses storage is one where
 * this cannot work, and the bar says so.
 *
 * Returns whether there was one, which is what makes a failed store
 * visible: the surface comes up either way and says nobody is signed
 * in, rather than the page doing nothing at all.
 */
export function claim(where: Window): boolean {
    const claimed = readHandoff(where.location.hash);
    if (!claimed) {
        return false;
    }

    try {
        const {pathname, search} = where.location;
        where.history.replaceState(null, '', `${pathname}${search}${claimed.rest}`);
    } catch {
        /* A document that forbids it -- a sandboxed iframe, a `file:`
           URL. Nothing is gained by giving up here: the token is
           already in a URL somebody can read, and refusing to use it
           does not take it back out. */
    }

    try {
        where.sessionStorage.setItem(claimed.handoff.key, claimed.handoff.value);
    } catch {
        /* Same hostility `sessionStorageOrMemory` exists for, with no
           second-best available. See above. */
    }
    return true;
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
export async function boot(
        where: Window, extension?: EditExtension | null): Promise<void> {
    /* Before `wanted`, and OR'd with it rather than folded into it.
       Before, because the token it puts away is what `wanted` then
       finds -- and because a token in a URL should stop being in one
       whether or not this page turns out to be editable. OR'd, because
       a store that the browser refused would otherwise leave a link
       that opens a page where nothing happens: having been handed
       something is itself a reason to put the bar up and say what
       became of it. */
    const handed = claim(where);
    if (!handed && !wanted(where)) {
        return;
    }
    const {open} = await import('./surface.js');
    /* `window.contentToolsEdit`, the site's own tools, unless the caller
       handed some over. Read here because this is where the ambient
       globals enter; its shape is checked behind the import, where a
       mistake can be said on the bar. Inline rather than a named export,
       because every byte of this file is paid by every reader. */
    await open(where, {
        contentStyles: CONTENT_STYLES,
        extension: extension ?? (where as {contentToolsEdit?: EditExtension})
            .contentToolsEdit
    });
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
