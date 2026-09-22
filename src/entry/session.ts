/* One open entry: the bytes that were read, the editor over them, and the
 * bytes a save would write.
 *
 * This is everything about editing an entry that is NOT about where the
 * editing happens. The shell opens an entry inside `/admin`; the in-page
 * surface opens the same entry on the site's own published page, with the
 * real template around it. Both need the same six answers -- what the
 * editor element should be, what the body says right now, whether the
 * frontmatter form has changed anything, what a save would write, whether
 * that differs from the file, and how to commit it -- and two
 * implementations of those answers are two implementations that can
 * disagree about what "unchanged" means. One of them would then hold a
 * navigation over work a save reports as nothing, or let one go that a
 * save would have written.
 *
 * A session exists only while an entry is open. There is no "no entry"
 * state inside it: the caller holds `EntrySession | null` and every
 * question about an open entry is asked of a session that exists. That is
 * what deletes the null checks the shell used to carry through `_doc`,
 * `_store`, `_entry` and `_edited` separately -- four fields written
 * together and cleared together, which is one object.
 */

import type {CmsRepo, Entry, MediaFile, SaveResult} from '../cms/repo.js';
import type {MediaStore} from '../cms/media.js';
import {mediaUploader} from '../cms/media.js';
/* The CLASS module, never `../element/index.js`: that is a build ENTRY of
   the same Vite invocation, and Rollup turns an entry another entry
   imports into a facade whose body it hoists into a shared chunk -- taking
   `customElements.define` out of the file `package.json` names in
   `sideEffects`. Same rule the shell follows, same test enforcing it. */
import {ContentToolsEditor, TAG_NAME as EDITOR_TAG}
    from '../element/content-tools-editor.js';
import type {MarkdownDocument} from '../markdown/document.js';
import {frontmatterChanged, mergeFrontmatter} from './frontmatter.js';
import type {FieldValues} from './frontmatter.js';

/**
 * The one region an entry has, and the key its HTML arrives under.
 *
 * One region because a markdown file is one body. The frontmatter is a
 * form beside the editor, not a second editable region: a YAML block
 * edited as prose is a YAML block somebody will break.
 */
export const REGION = 'body';

/** The markup the editor is handed, around the body it is editing. */
const EDITOR_REGIONS = '[data-editable]';

/** Exactly what a save would write, and what has to travel with it. */
export interface Pending {
    readonly content: string;
    readonly media: readonly MediaFile[];
}

export interface SessionOptions {
    /** The document the editor element is created in. */
    readonly document: Document;
    /** The entry as it was read, pinned to the commit it was read at. */
    readonly entry: Entry;
    /** Its parsed source. NEVER re-parsed afterwards -- see `commit`. */
    readonly doc: MarkdownDocument;
    /** Where an uploaded image waits until the commit that carries it. */
    readonly store: MediaStore;
    /**
     * What the frontmatter form currently says, or null when there is no
     * usable form -- no fields declared, or a block the form refused.
     *
     * A function rather than a value because the form is asked at the
     * moment of the comparison, and it is asked TWICE on the way to a
     * save: once to decide whether there is anything to write, and once
     * to write it. A snapshot taken when the session opened would be the
     * answers nobody had given yet.
     */
    readonly values: () => FieldValues | null;
}

export class EntrySession {

    /** The editor element, fully built and not yet connected. */
    readonly editor: ContentToolsEditor;

    readonly doc: MarkdownDocument;

    readonly store: MediaStore;

    /**
     * The entry as the repository holds it, re-pinned by `commit`.
     *
     * One copy, here. A caller keeping its own would be a second answer
     * to "what does the file say", and the one that goes stale is the
     * one the dirty check compares against -- so a saved entry still
     * reads as unsaved and the leave panel appears over work that is
     * safely committed.
     */
    entry: Entry;

    private readonly _values: () => FieldValues | null;

    /** What the editor last reported for the body. See `_remember`. */
    private _edited: string | null;

    constructor(options: SessionOptions) {
        this.entry = options.entry;
        this.doc = options.doc;
        this.store = options.store;
        this._values = options.values;
        this._edited = null;
        this.editor = this._build(options.document);
    }

    /**
     * Begin editing.
     *
     * Started by the caller, not by an ignition button: opening an entry
     * in a CMS IS the decision to edit it, and an editor sitting inert
     * behind a second press is a screen that looks broken. It also has
     * to be started for `save(true)` to have any regions to report --
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
     * Exactly what a save would write, and the media that must travel
     * with it.
     *
     * ONE method, because the dirty check and the submit both need this
     * answer and two spellings of it can disagree -- which they would do
     * by holding a navigation over work that a save then reports as
     * unchanged, or worse by letting one go that a save would have
     * written. The media rewrite belongs here for the same reason: it
     * happens on the way to the commit, so it has to happen on the way
     * to the comparison.
     */
    pending(): Pending {
        /* One pass giving both answers. Rewriting the HTML and asking
           separately what to commit can disagree, and the way they
           disagree is an entry referencing an image nobody uploaded. */
        const {html, media} = this.store.rewrite(this.html());
        return {content: this.doc.update(html, this._frontmatterOption()), media};
    }

    /**
     * Whether there is work that a save would write.
     *
     * The MARKDOWN decides, not the HTML. The editor normalises what it
     * is handed -- attribute order, whitespace, the placeholder
     * paragraph an empty region needs to hold a caret -- so an HTML
     * comparison reports edits nobody made, and a leave panel that
     * appears every time is a leave panel people click through.
     */
    dirty(): boolean {
        return this.pending().content !== (this.entry.content ?? '');
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
     * Commit what is in the editor, and open or update the pull request.
     *
     * The open `MarkdownDocument` is NEVER re-parsed afterwards, and that
     * is the subtlest rule here. Re-parsing the string just written would
     * renumber the blocks while the live DOM still carries the old
     * `data-ct-md` indices, so the next save would splice against the
     * wrong originals -- content corruption inside a diff that looks
     * perfectly reviewable. It stays correct because `parent` pins the
     * commit this edit was read at: the branch is what we read plus our
     * own change, or it is a `ConflictError`.
     *
     * Takes the `Pending` rather than computing it, so the caller still
     * holds the markdown when this throws. A conflict is the one failure
     * where the person's work is in hand and the only way forward throws
     * it away, and offering them the reload without showing them what
     * they wrote is data loss with a button on it.
     */
    async commit(repo: CmsRepo, pending: Pending): Promise<SaveResult> {
        const entry = this.entry;
        /* Derived from the entry, never stored beside it. `content` is
           null exactly when there is no file at this path -- which is
           what `readEntry` reports for a slug that was just named, and
           what the save turns into a string. So a second submit is an
           update without anything having to remember that the first one
           was not. */
        const fresh = entry.content === null;

        const result = await repo.saveEntry(entry.collection, entry.slug, {
            content: pending.content,
            media: pending.media,
            parent: entry.commit,
            /* Asked for, not inferred. The caller checked this before
               opening the editor; this is the check that settles the
               race the first one cannot -- two authors who both passed
               it and are both now pressing Submit. Without it the second
               one's post is committed onto the first one's pull
               request. */
            create: fresh,
            message: `${fresh ? 'Create' : 'Update'} ${entry.path}`
        });

        /* `content` is now what the repository holds, so it becomes the
           baseline `dirty()` compares against -- otherwise a saved entry
           still reads as unsaved. */
        this.entry = {
            ...entry,
            content: pending.content,
            commit: result.commit ?? entry.commit,
            pull: result.pull
        };
        return result;
    }

    /**
     * The `frontmatter` option for `update`, or nothing at all.
     *
     * Returning `undefined` is not the same as returning `{frontmatter:
     * <unchanged>}`: `update` preserves the original block BYTE FOR BYTE
     * only when it is given no data, and a YAML round trip loses key
     * order, comments and quoting style. So a save that only touched the
     * body has to reach `update` with no options object, and this is the
     * line that decides it.
     */
    private _frontmatterOption(): {frontmatter: unknown} | undefined {
        const values = this._values();
        if (values === null) {
            return undefined;
        }
        /* Read from the DOCUMENT rather than remembered beside the form.
           The document is never re-parsed while a session is open, so
           these are the same bytes the form was built from -- and a
           remembered copy is a second description of what the file holds,
           which is the thing a byte-preserving comparison cannot afford
           to be wrong about. */
        const data = this.doc.frontmatter()?.data ?? null;
        const merged = mergeFrontmatter(data, values);
        return frontmatterChanged(data, merged) ? {frontmatter: merged} : undefined;
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
    private _build(document: Document): ContentToolsEditor {
        const editor = document.createElement(EDITOR_TAG) as ContentToolsEditor;
        editor.setAttribute('regions', EDITOR_REGIONS);
        /* The whole reason markdown mode exists: the editor must not be
           able to produce something the serializer cannot express. */
        editor.setAttribute('mode', 'markdown');
        /* Staged in memory and committed by `saveEntry`, so an entry and
           its images land in one commit. An uploader that commits on its
           own leaves an orphan blob behind every abandoned edit. */
        editor.imageUploader = mediaUploader({store: this.store});

        const region = document.createElement('div');
        region.setAttribute('data-editable', '');
        region.setAttribute('data-name', REGION);
        region.innerHTML = this.doc.toHTML();
        editor.appendChild(region);

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
