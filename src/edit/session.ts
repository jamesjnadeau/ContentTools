/* One open entry WITH AN EDITOR OVER IT.
 *
 * The half of a session that needs a `<content-tools-editor>`: the element
 * itself, the body HTML it reports, and the images somebody drops into it
 * on the way to the commit that carries them. Everything that is true of
 * an open entry whether or not anybody is editing its words -- the
 * frontmatter merge, the dirty check, the commit -- is `EntrySession`, one
 * directory down, shared with the management screens.
 *
 * It lives HERE rather than beside the base class, and that is a packaging
 * rule as much as a design one: importing this module pulls in
 * `src/element/`, which pulls in the whole library, and /admin does not
 * show an editor. In `src/entry/` it would be reachable from both surfaces
 * and Rollup would put ~80 kB of editor back inside `dist/shell.js` for a
 * screen that never mounts one. `test/browser/shell/imports.spec.js` is
 * what says so out loud.
 */

import {MediaStore} from '../cms/media.js';
import {mediaUploader} from '../cms/media.js';
/* The CLASS module, never `../element/index.js`: that is a build ENTRY of
   the same Vite invocation, and Rollup turns an entry another entry
   imports into a facade whose body it hoists into a shared chunk -- taking
   `customElements.define` out of the file `package.json` names in
   `sideEffects`. Same rule the shell follows, same test enforcing it. */
import {ContentToolsEditor, TAG_NAME as EDITOR_TAG}
    from '../element/content-tools-editor.js';
import {EntrySession, REGION} from '../entry/session.js';
import type {Pending, SessionOptions} from '../entry/session.js';

/** The markup the editor is handed, around the body it is editing. */
const EDITOR_REGIONS = '[data-editable]';

export interface EditingOptions extends SessionOptions {
    /** The document the editor element is created in. */
    readonly document: Document;
    /** Where an uploaded image waits until the commit that carries it. */
    readonly store: MediaStore;
    /**
     * The element on the page whose children ARE the body.
     *
     * The site's own `<article class="post">`, found by the `body`
     * selector. It must stay where it is, with its classes and its
     * ancestry intact, or the site's own CSS stops matching it and the
     * page reflows the moment somebody presses Edit.
     *
     * Its CHILDREN are replaced. What the site's template rendered is
     * HTML built from the base branch by a static site generator; what
     * the editor must hold is our render of the markdown on the branch
     * being edited, with the `data-ct-md` indices the splice reads back.
     * Those are different documents even when they look identical, and
     * editing the former would serialize to bytes that splice against
     * the wrong blocks.
     */
    readonly region: HTMLElement;
}

export class EditingSession extends EntrySession {

    /** The editor element, fully built and not yet connected. */
    readonly editor: ContentToolsEditor;

    readonly store: MediaStore;

    /** What the editor last reported for the body. See `_remember`. */
    private _edited: string | null;

    constructor(options: EditingOptions) {
        super(options);
        this.store = options.store;
        this._edited = null;
        this.editor = this._build(options);
    }

    /**
     * Begin editing.
     *
     * Started by the caller, not by an ignition button: pressing Edit on
     * the page IS the decision to edit it, and an editor sitting inert
     * behind a second press is a page that looks broken. It also has to
     * be started for `save(true)` to have any regions to report --
     * `_regions` is populated by `start()`.
     */
    start(): void {
        this.editor.start();
    }

    /** Take the editor back off the page. */
    close(): void {
        this.editor.remove();
    }

    /**
     * What a save would write, with the body as the editor holds it.
     *
     * The media rewrite belongs in the same pass for the reason the base
     * class gives about `pending` generally: it happens on the way to the
     * commit, so it has to happen on the way to the comparison. Rewriting
     * the HTML and asking separately what to commit can disagree, and the
     * way they disagree is an entry referencing an image nobody uploaded.
     *
     * `update` rather than the base's `updateFrontmatter`, because here
     * the body genuinely has been through an editor and every block has
     * to be re-compared against the source.
     */
    override pending(): Pending {
        const merged = this.merged();
        const {html, media} = this.store.rewrite(this.html());
        return {
            content: this.doc.update(html, merged === null
                ? undefined
                : {frontmatter: merged}),
            media
        };
    }

    /**
     * The body HTML as it stands right now.
     *
     * `save(true)` is passive: it reports without unmounting the
     * regions, so the caret stays where the person left it. It fills
     * `_edited` synchronously through the handler below, and the cache
     * is why this may be called twice -- the dirty check and the submit
     * both want the answer, and the second caller would otherwise be
     * told nothing had changed.
     */
    html(): string {
        /* No `state === 'editing'` test beside this one. The editor is
           built in the constructor and started one line after the
           caller connects it, so an editor that is here and not editing
           does not exist. If that stops being true, `save()` throws on
           a disconnected editor, which is the loud failure rather than
           the quiet one. */
        this.editor.save(true);
        return this._edited ?? this.doc.toHTML();
    }

    /**
     * The editor element for this entry, built and not yet connected.
     *
     * Everything is in place before it enters the DOM, because
     * `connectedCallback` boots immediately: an element connected first
     * and configured afterwards boots against the defaults and then has
     * to be rebooted, which tears down and re-claims the lease for
     * nothing.
     */
    private _build(options: EditingOptions): ContentToolsEditor {
        const document = options.document;
        const editor = document.createElement(EDITOR_TAG) as ContentToolsEditor;
        editor.setAttribute('regions', EDITOR_REGIONS);
        /* The whole reason markdown mode exists: the editor must not be
           able to produce something the serializer cannot express. */
        editor.setAttribute('mode', 'markdown');
        /* Staged in memory and committed by `saveEntry`, so an entry and
           its images land in one commit. An uploader that commits on its
           own leaves an orphan blob behind every abandoned edit. */
        editor.imageUploader = mediaUploader({store: this.store});

        const region = options.region;
        /* The name the saved-regions map arrives under, and the only
           attribute set on an element we did not make. `data-editable` is
           NOT set beside it: with the region named directly there is no
           selector to satisfy, and an attribute written onto somebody's
           published markup for the benefit of a query nobody runs is a
           change to their page for nothing. */
        region.setAttribute('data-name', REGION);
        region.innerHTML = this.doc.toHTML();
        /* Named rather than matched, and the editor stays empty. See
           `regionElements`: moving this element under the editor to make
           `[data-editable]` reach it would change its ancestry, and the
           site's own CSS is written against the ancestry it has. */
        editor.regionElements = [region];

        editor.addEventListener('ct-saved', ev => this._remember(ev as CustomEvent));
        return editor;
    }

    /**
     * Remember what the editor last reported for the body.
     *
     * Only when the region is actually in the map. `save()` reports the
     * regions whose content moved since the last save and then RESETS
     * that baseline, so an unchanged save reports none -- and reading
     * the absent key as "the body is empty now" would make the next
     * submit write an empty file over somebody's post.
     */
    private _remember(ev: CustomEvent): void {
        const regions = (ev.detail as {regions?: Record<string, string>} | null)?.regions;
        const html = regions ? regions[REGION] : undefined;
        if (typeof html === 'string') {
            this._edited = html;
        }
    }
}
