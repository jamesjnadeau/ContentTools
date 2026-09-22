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
 *
 * NOTHING HERE TOUCHES THE PAGE UNTIL THE SWITCH IS PRESSED. That is the
 * rule the whole file is arranged around, and it costs more than it looks
 * like it should -- see `_build` and `_dress`.
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
     * Its CHILDREN are replaced, but only once the switch is pressed.
     * What the site's template rendered is HTML built from the base
     * branch by a static site generator; what the editor must hold is
     * our render of the markdown on the branch being edited, with the
     * `data-ct-md` indices the splice reads back. Those are different
     * documents even when they look identical, and editing the former
     * would serialize to bytes that splice against the wrong blocks.
     */
    readonly region: HTMLElement;
}

export class EditingSession extends EntrySession {

    /** The editor element, fully built and not yet connected. */
    readonly editor: ContentToolsEditor;

    readonly store: MediaStore;

    /** The site's own element, whose children are the body. */
    private readonly _region: HTMLElement;

    /**
     * The body exactly as the site published it.
     *
     * Read before anything is touched, and put back when the switch is
     * cancelled. The editor's own revert restores the snapshot it took
     * at `start()`, which is OUR render of the markdown -- so without
     * this, cancelling would leave the page showing the thing the
     * person just asked to be rid of.
     */
    private readonly _original: string;

    /** What the editor last reported for the body. See `_remember`. */
    private _edited: string | null;

    /**
     * What `_edited` was when the pencil was last pressed.
     *
     * Where a cancel goes back to, which is what the editor's own
     * revert means -- it restores the snapshot it took at `start()`.
     * That is NOT always the file: somebody who edits, presses the
     * tick to read the page, presses the pencil again and then
     * changes their mind is cancelling the second session, not the
     * first, and the edits the tick kept are still theirs. `_edited`
     * cannot answer this itself, because a Submit in the middle of an
     * editing session moves it.
     */
    private _dressed: string | null;

    /** Between `ct-started` and `ct-stopped`: the switch is on. */
    private _started: boolean;

    /**
     * Whether the stop in flight is a confirm or a cancel.
     *
     * Read off `ct-stop`'s own detail rather than from `ct-revert`,
     * because a revert can be REFUSED: `CANCEL_MESSAGE` puts a confirm
     * dialog up and a person who says no aborts the stop, so
     * `ct-stopped` never arrives. A flag set by `ct-revert` would still
     * be standing at the next stop, and the next stop is usually the
     * confirm -- so saying no to "discard your changes?" would discard
     * them one press later.
     */
    private _saving: boolean;

    /** Told when the switch is pressed. See `watch`. */
    private _watcher: (() => void) | null;

    constructor(options: EditingOptions) {
        super(options);
        this.store = options.store;
        this._region = options.region;
        this._original = options.region.innerHTML;
        this._edited = null;
        this._dressed = null;
        this._started = false;
        this._saving = false;
        this._watcher = null;
        this.editor = this._build(options);
    }

    /** Whether the switch is on: the tools are up and the body is ours. */
    started(): boolean {
        return this._started;
    }

    /**
     * Be told when the switch is pressed.
     *
     * One watcher, set by whoever is showing the bar. The switch is the
     * only thing on this surface that changes state without anybody
     * calling a method here, so it is the only thing that needs to push
     * rather than be asked -- and one caller means a plain field rather
     * than a subscriber list whose removal path no test could reach.
     */
    watch(fn: () => void): void {
        this._watcher = fn;
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
     *
     * Asked of the editor even while the switch is OFF, and a
     * `state === 'editing'` guard was written here and deleted after
     * mutation testing could not kill it. It is measured rather than
     * assumed: `save()` with no regions reports `{}` -- by the early
     * return when nothing has moved since the last start, and by an
     * empty loop otherwise -- so `_remember` skips and the cached
     * answer stands either way. The one thing it does touch,
     * `_domRegions`, is recomputed from the region list at the top of
     * the next `syncRegions()`, which is the first line of `start()`.
     *
     * So with the switch off the answer is what the last editing
     * session left behind, or the branch as it was read if there has
     * not been one. That is what makes Submit mean something after a
     * tick: the edits are kept, the tools are gone, and the button
     * still commits them.
     */
    html(): string {
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
        /* THE SWITCH. The library's own, which is the pencil that becomes
           a green tick and a red cross -- v1.6.16's ignition, back where
           it was, and the reason nothing below replaces the page until
           somebody presses it. The element's default is off because the
           shell drives its editor from its own chrome; here there is no
           chrome of ours around the words, so the switch is how a person
           says yes. */
        editor.setAttribute('ignition', '');
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
        /* Named rather than matched, and the editor stays empty. See
           `regionElements`: moving this element under the editor to make
           `[data-editable]` reach it would change its ancestry, and the
           site's own CSS is written against the ancestry it has. */
        editor.regionElements = [region];

        /* `ct-start` fires BEFORE the regions are parsed -- `start()`
           dispatches it on its first line and calls `syncRegions()` on
           its fourth -- which is what lets the swap happen here rather
           than in the constructor. That ordering is load-bearing: done
           a line later, ContentEdit would have parsed the site's own
           markup and the person would be editing the wrong document. */
        editor.addEventListener('ct-start', () => this._dress());
        editor.addEventListener('ct-started', () => {
            this._started = true;
            this._watcher?.();
        });
        editor.addEventListener('ct-stop', ev => {
            this._saving = (ev as CustomEvent).detail?.save === true;
        });
        editor.addEventListener('ct-saved', ev => this._remember(ev as CustomEvent));
        editor.addEventListener('ct-stopped', () => this._undress());
        return editor;
    }

    /** Put our render of the branch in the page, ready to be edited. */
    private _dress(): void {
        /* `_edited` first, so a second press after a tick picks the
           edits up where they were left rather than re-rendering the
           file and throwing them away. */
        this._dressed = this._edited;
        this._region.innerHTML = this._edited ?? this.doc.toHTML();
    }

    /** Hand the page back, as it was or as it has been edited. */
    private _undress(): void {
        this._started = false;
        if (!this._saving) {
            /* Cancelled, so back to where the pencil found it. For the
               FIRST press that is the site's own markup, and the
               editor cannot put it back: the snapshot its revert
               restores is our render of the markdown, which is the
               thing the person just asked to be rid of. For a later
               one it is the edits a tick kept, which the revert has
               already restored and which are still what Submit
               commits -- so only `_edited` moves, and the page is left
               alone. */
            this._edited = this._dressed;
            if (this._dressed === null) {
                this._region.innerHTML = this._original;
            }
        }
        this._watcher?.();
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
