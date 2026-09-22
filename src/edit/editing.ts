/* What the two controls on the in-page bar actually do.
 *
 * The bar is a view: it says what it is given and reports what its form
 * holds. This is the half that decides -- when a press is refused, what
 * a refusal reads as, and what is kept when one happens. It is separate
 * from `./surface.ts` because that file's job is finished once the
 * editor is up: everything in it runs once, in order, before anybody has
 * touched anything, and everything here runs afterwards, repeatedly, in
 * whatever order the person chooses.
 *
 * NOTHING HERE THROWS. This script runs on the site's own published
 * pages, so an unhandled rejection is an error in the console of a page
 * that belongs to somebody else -- and the person who would see it is a
 * reader, not an author. Every failure lands in the bar's note instead,
 * which is the rule both dist suites already assert for the other two
 * surfaces: errors go on the page.
 *
 * There is no `_guard` here and no gate to return to, and that is the
 * one real difference from the shell. A 401 in the shell drops the token
 * and shows the sign-in field; this script has no field to show, on
 * purpose -- a credential prompt appearing on a published blog post is
 * indistinguishable from the thing every phishing guide warns about. So
 * an expired token is described, said, and left for the author to fix
 * one link away under /admin.
 */

import type {CmsRepo} from '../cms/repo.js';
import {describeError, fieldsNeeded, NOTHING_TO_SAVE} from '../entry/errors.js';
import type {Described} from '../entry/errors.js';
import type {FieldsState} from '../entry/fields.js';
import type {EditingSession} from './session.js';
import type {Bar, Located, SaveState} from './chrome.js';

export interface PageEditOptions {
    readonly bar: Bar;
    readonly session: EditingSession;
    readonly repo: CmsRepo;
    /** The three things the bar says about the page in every state. */
    readonly seen: Located;
    /** The frontmatter form. See `Editing.fields` for why not null. */
    readonly fields: FieldsState;
}

/** An entry being edited in the page it is published on. */
export class PageEdit {

    readonly session: EditingSession;

    private readonly _bar: Bar;
    private readonly _repo: CmsRepo;
    private readonly _seen: Located;
    private readonly _fields: FieldsState;

    /** The form is showing. Closed to start with -- see `render`. */
    private _open: boolean;
    private _busy: boolean;
    private _note: string;
    private _refused: boolean;
    private _conflict: string | null;

    constructor(options: PageEditOptions) {
        this.session = options.session;
        this._bar = options.bar;
        this._repo = options.repo;
        this._seen = options.seen;
        this._fields = options.fields;
        this._open = false;
        this._busy = false;
        this._note = '';
        this._refused = false;
        this._conflict = null;
        /* The switch is the one control on this surface that nothing
           here owns: it lives in the editor's own chrome, and a person
           can press it at any moment. So the session pushes, and this
           is the only thing it pushes to. */
        this.session.watch(() => this.render());
    }

    /**
     * Put the current state on the bar.
     *
     * The form starts CLOSED, which is the one place this surface
     * differs from the shell's and it is not a style choice. Under
     * /admin the form is a pane beside the editor and the screen is
     * ours; here the bar floats over somebody's published page, and a
     * panel that opens itself to the height of a nine-field form covers
     * the words the author came to read.
     */
    render(): void {
        this._bar.update({
            kind: 'editing',
            ...this._seen,
            fields: this._fields,
            fieldsOpen: this._open,
            /* Asked of the session at render time rather than
               remembered here. The switch changes it, and the switch is
               not ours -- a copy kept beside it would be a second
               answer that goes stale exactly when somebody presses the
               thing this whole surface is about. */
            started: this.session.started(),
            save: this._state()
        });
    }

    /** Show or hide the frontmatter form. */
    show(open: boolean): void {
        this._open = open;
        this.render();
    }

    /**
     * Commit what is in the editor, and open or update the pull request.
     *
     * Returns nothing and never rejects: it is a click handler, and the
     * promise it starts is one nobody is holding. The `void` is what
     * says so at the one call site that matters.
     */
    submit(): void {
        void this._submit();
    }

    private async _submit(): Promise<void> {
        /* Asked BEFORE anything is computed, because `validate()` is
           also what puts each message under its own control -- so
           refusing after the rewrite would mark the fields and then
           commit anyway. The shell does this in the same order for the
           same reason. */
        const errors = this._bar.errors();
        if (errors.length > 0) {
            this._say(fieldsNeeded(errors));
            return;
        }

        /* Held here rather than only inside `commit`, because a conflict
           is the one failure where the person's work is still in hand
           and the only way forward throws it away. */
        const pending = this.session.pending();

        this._busy = true;
        this._note = '';
        this._refused = false;
        this._conflict = null;
        this.render();

        let result;
        try {
            result = await this.session.commit(this._repo, pending);
        } catch (error) {
            /* Cleared whatever happened. Leaving it set disables the
               button for good, so the one person who most needs to try
               again cannot. */
            this._busy = false;
            const said = describeError(error);
            this._say(said, said.kind === 'conflict' ? pending.content : null);
            return;
        }

        this._busy = false;
        /* `commit` rather than `changed`: `saveEntry` writes the two
           together -- a sha and `true`, or null and `false` -- so
           reading both would be two conditions that can only ever
           agree, and this one narrows to a string for the line below.
           Its `NothingToSaveError` throw is the same answer arriving by
           the other door, which is why the words are a shared constant
           rather than written twice. */
        if (result.commit === null) {
            this._say(NOTHING_TO_SAVE);
            return;
        }
        this._note = `Submitted as ${result.commit.slice(0, 7)}.`;
        this._refused = false;
        this._conflict = null;
        this.render();
    }

    /** Say a described outcome, and show it. */
    private _say(said: Described, conflict: string | null = null): void {
        /* Both lines. The title alone is not enough on the rows that
           matter: "That token cannot reach this repository" without the
           detail beside it leaves out the two permission names, which
           are the whole fix.

           A `.trim()` was written here and removed: no row of
           `describeError` that this surface can reach has an empty
           detail -- a `GitHubError`'s message always names the method,
           the path and the status, and `fieldsNeeded` is only built
           from a non-empty list -- so the trailing space it removed
           belongs to no reachable answer, and no test could tell it
           from this. */
        this._note = `${said.title} ${said.detail}`;
        /* Carried from the KIND, never guessed from the words. A
           required field left empty and an entry nobody changed are
           both ordinary answers to pressing Submit, and colouring them
           as faults teaches an author to read past the colour. */
        this._refused = said.kind !== 'notice';
        this._conflict = conflict;
        this.render();
    }

    private _state(): SaveState {
        /* Read off the session at render time rather than remembered
           beside it. `commit` re-pins the entry with the pull request it
           opened or updated, so this is the same answer the next save
           builds on -- and it is already right on the first render for
           an entry that was read with one open, which is the common
           case for anybody editing a draft on a deploy preview. */
        const pull = this.session.entry.pull;
        return {
            busy: this._busy,
            note: this._note,
            refused: this._refused,
            pull: pull ? {number: pull.number, url: pull.html_url} : null,
            conflict: this._conflict
        };
    }
}
