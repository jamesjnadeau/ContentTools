/* One open entry: the bytes that were read, and the bytes a save would
 * write.
 *
 * This is everything about having an entry open that is NOT about editing
 * its body. The management screens under `/admin` open an entry to change
 * its frontmatter, see its pull request and delete it; the in-page surface
 * opens the same entry on the site's own published page, with the real
 * template around it, and edits the words. Both need the same answers --
 * what the frontmatter form has changed, what a save would write, whether
 * that differs from the file, and how to commit it -- and two
 * implementations of those answers are two implementations that can
 * disagree about what "unchanged" means. One of them would then hold a
 * navigation over work a save reports as nothing, or let one go that a
 * save would have written.
 *
 * THE EDITOR IS NOT HERE. It belongs to the surface that has one, which is
 * `src/edit/session.ts` and only that -- /admin has no editor at all since
 * M6-3, and an editor import in this file would put the whole library back
 * inside `dist/shell.js` for a screen that never shows one. `EditingSession`
 * extends this class rather than replacing it, so the frontmatter merge,
 * the dirty check and the commit are written once.
 *
 * A session exists only while an entry is open. There is no "no entry"
 * state inside it: the caller holds `EntrySession | null` and every
 * question about an open entry is asked of a session that exists. That is
 * what deletes the null checks the shell used to carry through `_doc`,
 * `_store`, `_entry` and `_edited` separately -- four fields written
 * together and cleared together, which is one object.
 */

import type {CmsRepo, Entry, MediaFile, SaveResult} from '../cms/repo.js';
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

/** Exactly what a save would write, and what has to travel with it. */
export interface Pending {
    readonly content: string;
    readonly media: readonly MediaFile[];
}

export interface SessionOptions {
    /** The entry as it was read, pinned to the commit it was read at. */
    readonly entry: Entry;
    /** Its parsed source. NEVER re-parsed afterwards -- see `commit`. */
    readonly doc: MarkdownDocument;
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

    readonly doc: MarkdownDocument;

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

    constructor(options: SessionOptions) {
        this.entry = options.entry;
        this.doc = options.doc;
        this._values = options.values;
    }

    /**
     * Exactly what a save would write, and the media that must travel
     * with it.
     *
     * ONE method, because the dirty check and the submit both need this
     * answer and two spellings of it can disagree -- which they would do
     * by holding a navigation over work that a save then reports as
     * unchanged, or worse by letting one go that a save would have
     * written.
     *
     * Nothing to write means the SOURCE, unchanged: a screen with no
     * editor cannot have touched the body, so the file it would save is
     * the file it read. `updateFrontmatter` keeps that true on the other
     * branch too -- see its own header for why the body is not put
     * through the walker to get there.
     *
     * No media travels from here. Staging an upload needs an image
     * dialog, which needs an editor; `EditingSession` is where that
     * happens and where this is overridden.
     */
    pending(): Pending {
        const merged = this.merged();
        return {
            content: merged === null
                ? this.doc.source()
                : this.doc.updateFrontmatter(merged),
            media: []
        };
    }

    /**
     * Whether there is work that a save would write.
     *
     * The MARKDOWN decides, not the form's own idea of having been
     * typed into. Somebody who clears a field and types it back has
     * touched the form without changing the file, and a leave panel
     * that appears every time is a leave panel people click through.
     *
     * Compared against `content` RAW, null and all, which is what
     * makes a FRESH entry read as work from the moment it is named:
     * there is no file at its path, and no string equals null. The old
     * spelling read `?? ''` here, so a just-named entry nobody had
     * typed into was nothing to lose -- and it is the one thing on that
     * screen that is. The filename is what a create route exists to
     * decide, it is the one thing about an entry nobody can change
     * afterwards without breaking its URL, and leaving without
     * submitting throws it away.
     *
     * Only the LEAVE question turns on this, and that is worth knowing
     * before changing it: `_submit` never asks, it hands the pending
     * bytes to the repository and lets a create be a create. So the
     * test that can tell the two spellings apart is a navigation away
     * from an untouched new entry, and nothing else in the shell can.
     *
     * An explicit `content === null ||` was written beside this and
     * deleted: it says the same thing the comparison already says, and
     * no test could tell those two apart at all.
     */
    dirty(): boolean {
        return this.pending().content !== this.entry.content;
    }

    /**
     * Commit what this session holds, and open or update the pull
     * request.
     *
     * The open `MarkdownDocument` is NEVER re-parsed afterwards, and that
     * is the subtlest rule here. Re-parsing the string just written would
     * renumber the blocks while a live DOM still carries the old
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
               opening the entry; this is the check that settles the
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
     * What the frontmatter should become, or null when it should be
     * left exactly as it is.
     *
     * Null is not "no frontmatter": it is the instruction to preserve the
     * original block BYTE FOR BYTE, which a YAML round trip would not --
     * key order, comments and quoting style all go. So a save that
     * touched nothing in the form has to reach the document without any
     * data at all, and this is the line that decides it.
     */
    protected merged(): Record<string, unknown> | null {
        const values = this._values();
        if (values === null) {
            return null;
        }
        /* Read from the DOCUMENT rather than remembered beside the form.
           The document is never re-parsed while a session is open, so
           these are the same bytes the form was built from -- and a
           remembered copy is a second description of what the file holds,
           which is the thing a byte-preserving comparison cannot afford
           to be wrong about. */
        const data = this.doc.frontmatter()?.data ?? null;
        const merged = mergeFrontmatter(data, values);
        return frontmatterChanged(data, merged) ? merged : null;
    }
}
