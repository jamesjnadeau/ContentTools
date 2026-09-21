/* `<content-tools-cms>` -- the shell, and the thing a site's authors open.
 *
 * The editor element is the editing surface and `./cms` is the repository;
 * neither knows the other exists. This is what joins them: it loads the
 * config for the one repository this deployment serves, signs the user in,
 * lists what they can edit, and turns a save into a pull request.
 *
 * MODE A, ONE LEVEL UP. The shell's own chrome lives in its shadow root,
 * and the `<content-tools-editor>` is appended as a LIGHT-DOM child of this
 * host, rendered through `<slot name="editor">`. That is not a style
 * preference, it is the only arrangement that works:
 *
 *   `ShadowRootContext.getRange()` is a three-branch chain, and in Mode A
 *   the editable content is in the light DOM -- so Chromium's
 *   `ShadowRoot.getSelection()` and `getComposedRanges({shadowRoots:[...]})`
 *   both decline on containment and it falls through to
 *   `document.getSelection()`, whose range it returns EVEN THOUGH the nodes
 *   are outside the editor's own root, because in Mode A that is the
 *   content. Nest the editor inside a second shadow root and
 *   `document.getSelection()` retargets in Chromium and WebKit: the range
 *   comes back pointing at this host, the caret is in the wrong place, and
 *   nothing throws. The document-level `content.css` would not reach the
 *   content either.
 *
 * Slotting does not move nodes -- the region stays in the document tree --
 * so both problems simply do not arise. `test/browser/shell/selection.spec.js`
 * asserts on the resolved range rather than on where the element sits, so a
 * later refactor that nests it under some OTHER shadow root fails too.
 */

/** Where the editor element is slotted. Its light-DOM home is this host. */
export const EDITOR_SLOT = 'editor';

/** The registered tag name. Declared here, re-exported by ./index.ts. */
export const TAG_NAME = 'content-tools-cms';

export class ContentToolsCms extends HTMLElement {
    declare private _shadow: ShadowRoot;

    constructor() {
        super();
        /* Open, like the editor's: a closed root buys no real
           encapsulation and costs every test and every debugging session
           the ability to look inside. */
        this._shadow = this.attachShadow({mode: 'open'});

        /* Appended in the constructor, not on connect. Without a slot the
           editor element -- a light-DOM child -- renders nowhere, and an
           editor nobody can see is indistinguishable from one that failed
           to boot. */
        const slot = this.ownerDocument.createElement('slot');
        slot.name = EDITOR_SLOT;
        this._shadow.appendChild(slot);
    }

    connectedCallback() {
        /* Reflected out, never read back in: `state` is how a host page and
           a test wait for the shell without polling a property. */
        this.setAttribute('state', 'dormant');
    }
}
