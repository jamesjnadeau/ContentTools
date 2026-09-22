/* The chrome around an open entry, under `/admin`.
 *
 * There is no editor here, and since M6-3 there is none anywhere under
 * `/admin`: the body of an entry is edited on the site's own page, with
 * the real template around it, and this screen is what is left -- what the
 * entry is, where its pull request is, the frontmatter form, the link that
 * sends an author to the page, the button that submits the form, and the
 * panels that appear when a save is refused or a navigation is held back.
 *
 * The frontmatter stays HERE rather than following the body out to the
 * page. It is the part of a file the site's own template has no place to
 * show -- a date and a list of tags are not on the page, they decide where
 * the page goes -- so editing them in the management screen is editing
 * them where they are visible.
 *
 * Built once and updated in place, like the entry list: the frontmatter
 * fields are in this panel, and a rebuild per render eats keystrokes.
 */
import {h} from '../../core/render.js';
import {formatRoute} from '../routes.js';
import {buildFields} from '../../entry/fields.js';
import type {FieldsState, FieldsView, WidgetSource} from '../../entry/fields.js';
import {statusOf} from '../../cms/status.js';
import {editUrl, editUrlIsStale} from '../../cms/preview.js';
import {findCollection} from '../../cms/config.js';
import type {CmsConfig} from '../../cms/config.js';
import type {Entry} from '../../cms/repo.js';
import type {EditorialStatus} from '../../cms/status.js';
import type {FieldValues} from '../../entry/frontmatter.js';

const STATUS_LABELS: Record<EditorialStatus, string> = {
    'draft': 'Draft',
    'in-review': 'In review',
    'ready': 'Ready'
};

export interface EntryHandlers {
    /** Commit what is in the editor and open or update the pull request. */
    submit(): void;
    /** Throw away local edits and read the entry again. */
    reload(): void;
    /** Abandon the held-back navigation and stay here. */
    stay(): void;
    /** Leave anyway, losing the unsaved work. */
    discard(): void;
    /** Ask whether to delete, or withdraw the question. */
    askDelete(asking: boolean): void;
    /** Delete it, as a pull request. */
    confirmDelete(): void;
}

export interface EntryState {
    /** The entry being edited, or null while it loads. */
    entry: Entry | null;
    /** A save is in flight. */
    saving: boolean;
    /** What the last successful save said, or null. */
    saved: string | null;
    /**
     * The markdown a refused save would have written.
     *
     * Shown verbatim and selectable. A conflict is the one failure where
     * the person's work is still in hand and the tool is about to throw
     * it away on their behalf: reloading is the only way forward, and
     * reloading without showing them what they wrote first is data loss
     * with a button on it.
     */
    conflict: string | null;
    /** A navigation is being held back pending an answer. */
    leaving: boolean;
    /** The frontmatter form: which fields, holding what. Null when closed. */
    fields: FieldsState | null;
    /** Whether this collection lets entries be removed at all. */
    deletable: boolean;
    /** The delete confirmation is showing. */
    deleting: boolean;
    /**
     * The deployment's config, for working out where this entry is
     * published. Null until it has loaded.
     *
     * The collection is resolved FROM it rather than passed beside it:
     * two fields describing one entry are two fields that can name
     * different collections, and the one that would be wrong is the one
     * the Edit link is built from -- which is an author sent to another
     * post's page to edit this one.
     */
    config: CmsConfig | null;
}

export interface EntryView {
    readonly node: HTMLElement;
    update(state: EntryState): void;
    /** What the frontmatter form holds, or null when there is no form. */
    values(): FieldValues | null;
    /** Every complaint the form has, shown under the fields as a side effect. */
    errors(): string[];
}

/*
 * `widgets` is a getter rather than a registry, because the view is built
 * in the element's CONSTRUCTOR and `el.widgets = {...}` is set by a host
 * page some time after that. Reading it at build time -- once per entry --
 * means a site's own widget works on the first entry opened rather than
 * on the second.
 */
export function buildEntry(
        doc: Document,
        handlers: EntryHandlers,
        widgets?: WidgetSource
        ): EntryView {
    const fields: FieldsView = buildFields(doc, widgets);
    const heading = h(doc, 'h2', {class: 'ct-cms__heading'});
    const back = h(doc, 'a', {class: 'ct-cms__entry-back'});
    const badge = h(doc, 'span', {class: 'ct-cms__badge'});
    const pull = h(doc, 'a', {
        class: 'ct-cms__entry-pull',
        target: '_blank',
        rel: 'noopener noreferrer'
    });
    /* Named as well as classed, and so is Delete below. They sit in one
       row, so `.ct-cms__entry-view .ct-cms__button` stopped meaning
       "Submit" the moment a second button arrived beside it -- and a
       selector that silently starts matching the destructive one is not
       a failure anybody wants to debug from a screenshot. */
    const submit = h(doc, 'button', {
        class: 'ct-cms__button ct-cms__entry-submit',
        type: 'button',
        onclick: () => handlers.submit()
    }, ['Submit for review']);
    const note = h(doc, 'p', {class: 'ct-cms__note'});

    /* Where the body is edited, and the only way to reach it from here.
       A NEW TAB, deliberately: the two surfaces write the same file and
       an author moves between them, so closing this one to reach the
       other would mean re-opening the entry on every trip back. It also
       sidesteps a guard this shell cannot write -- a cross-origin
       navigation is not something `_navigate` can hold back with a panel
       of its own, only `beforeunload` can, and that dialog belongs to the
       browser rather than to us.

       An `<a>` with a real href rather than a button, so it can be opened
       in a background tab, copied, and read by a screen reader as what it
       is: somewhere else. */
    const edit = h(doc, 'a', {
        class: 'ct-cms__button ct-cms__button--muted ct-cms__entry-edit',
        target: '_blank',
        rel: 'noopener noreferrer'
    }, ['Edit on the site']);

    /* Said out loud rather than left to be discovered. With a pull
       request open and no `site.preview` configured, the link goes to the
       LIVE page, which is built from the base branch and shows the
       published text -- so what opens is the old version of an entry that
       has a draft, and editing it would commit the draft away. */
    const stale = h(doc, 'p', {class: 'ct-cms__entry-stale'},
        ['This entry has a draft, but this deployment builds no previews '
         + 'for pull requests, so the link opens the published page. '
         + 'Editing it would write over the draft.']);

    /* Beside Submit rather than tucked away, and deliberately not behind a
       menu: it is one of two things a person does to an entry, and hiding
       it makes the shell feel like it cannot do something it can. What
       protects the entry is the confirmation below and the fact that a
       delete is a pull request like any other, not the button being hard
       to find. */
    const remove = h(doc, 'button', {
        class: 'ct-cms__button ct-cms__button--cancel ct-cms__entry-delete',
        type: 'button',
        onclick: () => handlers.askDelete(true)
    }, ['Delete entry']);

    /* Its own block rather than a second `.ct-cms__leave`. The two panels
       look alike and are asked for opposite reasons -- one is about work
       you are about to lose, the other about a page you meant to remove
       -- and a test reaching for "the leave panel" must not be able to
       find this one. */
    const deleting = h(doc, 'div', {class: 'ct-cms__confirm', role: 'group'}, [
        /* Says what actually happens. "Are you sure?" invites a reflex;
           "nothing is removed from the site until somebody merges it" is
           the fact that makes this a safe thing to press, and a person who
           knows it will not come back asking where their page went. */
        h(doc, 'p', {class: 'ct-cms__confirm-note'},
          ['Deleting opens a pull request. Nothing is removed from the site '
           + 'until somebody reviews and merges it.']),
        h(doc, 'button', {
            class: 'ct-cms__button',
            type: 'button',
            onclick: () => handlers.askDelete(false)
        }, ['Keep it']),
        h(doc, 'button', {
            class: 'ct-cms__button ct-cms__button--cancel',
            type: 'button',
            onclick: () => handlers.confirmDelete()
        }, ['Delete it'])
    ]);

    const conflictText = h(doc, 'textarea', {
        class: 'ct-cms__conflict-text',
        readonly: 'readonly',
        spellcheck: 'false',
        'aria-label': 'The markdown this save would have written'
    });
    const conflict = h(doc, 'div', {class: 'ct-cms__conflict'}, [
        conflictText,
        h(doc, 'button', {
            class: 'ct-cms__button ct-cms__button--cancel',
            type: 'button',
            onclick: () => handlers.reload()
        }, ['Reload from GitHub'])
    ]);

    const leaving = h(doc, 'div', {class: 'ct-cms__leave', role: 'group'}, [
        h(doc, 'p', {class: 'ct-cms__leave-note'},
          ['This entry has changes that have not been submitted.']),
        h(doc, 'button', {
            class: 'ct-cms__button',
            type: 'button',
            onclick: () => handlers.stay()
        }, ['Stay here']),
        h(doc, 'button', {
            class: 'ct-cms__button ct-cms__button--cancel',
            type: 'button',
            onclick: () => handlers.discard()
        }, ['Discard and leave'])
    ]);

    const node = h(doc, 'section', {class: 'ct-cms__entry-view'}, [
        h(doc, 'div', {class: 'ct-cms__entry-head'}, [
            heading, badge, pull,
            h(doc, 'span', {class: 'ct-cms__spacer'}),
            edit,
            remove,
            submit
        ]),
        back,
        stale,
        note,
        leaving,
        deleting,
        conflict,
        /* Last in the panel, and the only thing in it an author types
           into: everything above says what this entry is and what can be
           done with it. */
        fields.node
    ]);

    return {
        node,
        values: () => fields.values(),
        errors: () => fields.errors(),

        update(state: EntryState): void {
            const entry = state.entry;
            heading.textContent = entry ? entry.slug : '';

            back.textContent = entry ? `All ${entry.collection}` : '';
            /* No href at all while there is no entry, rather than an
               empty one: `<a href="">` is a link to the current page, so
               a hidden-but-focusable empty link would reload the shell
               for a keyboard user who tabbed onto it. */
            if (entry) {
                back.setAttribute(
                    'href',
                    formatRoute({kind: 'collection', collection: entry.collection}));
            } else {
                back.removeAttribute('href');
            }
            back.hidden = entry === null;

            const open = entry?.pull ?? null;
            const status = open ? statusOf(open) : null;
            /* Emptied rather than left saying "Open" behind `hidden`.
               A hidden node's text is still in `textContent`, which is
               what a screenshot-free assertion reads, so a stale label
               would make a test pass that should not. */
            badge.textContent = open ? (status ? STATUS_LABELS[status] : 'Open') : '';
            badge.hidden = open === null;

            pull.textContent = open ? `Pull request #${open.number}` : '';
            if (open) {
                pull.setAttribute('href', open.html_url);
            } else {
                pull.removeAttribute('href');
            }
            pull.hidden = open === null;

            /* Disabled while a save is in flight, and while there is no
               entry to save. A second press mid-save would build a
               second commit on the same parent, and the second one is
               the conflict -- so the button would generate the error the
               conflict panel then explains. */
            (submit as HTMLButtonElement).disabled = state.saving || entry === null;

            /* Hidden for a collection that does not allow it, and disabled
               mid-save rather than hidden: a button that vanishes under
               the pointer is worse than one that refuses. An entry that
               has not loaded has no path to delete. */
            remove.hidden = !state.deletable;
            (remove as HTMLButtonElement).disabled = state.saving || entry === null;
            deleting.hidden = !state.deleting;

            /* Null for three different reasons -- nothing has loaded
               yet, a bookmark names a collection that was renamed, or
               this collection is not published as pages at all -- and the
               screen says the same thing for all three, because there is
               one thing to say: there is no page to go to. */
            const config = state.config;
            const collection = config && entry
                ? findCollection(config, entry.collection)
                : null;
            const href = config && entry && collection
                ? editUrl(config, collection, entry.slug, open?.number ?? null)
                : null;
            /* Emptied rather than left behind `hidden`, for the reason
               the badge above is: a hidden node's text is still in
               `textContent`, so a stale label makes a test pass that
               should not. */
            edit.textContent = href === null ? '' : 'Edit on the site';
            if (href === null) {
                edit.removeAttribute('href');
            } else {
                edit.setAttribute('href', href);
            }
            edit.hidden = href === null;

            /* No `config === null` term, and there was one until
               mutation testing asked what it caught. Nothing: `href` is
               null whenever `config` is, so the first test subsumes it
               -- and TypeScript narrows `config` through it, so it was
               not even carrying the compiler. It comes back if `href`
               ever gets a spelling that survives a missing config. */
            stale.hidden = href === null
                || !editUrlIsStale(config, open?.number ?? null);

            note.textContent = entry === null
                ? 'Loading…'
                : (state.saving ? 'Saving…' : (state.saved ?? ''));

            (conflictText as HTMLTextAreaElement).value = state.conflict ?? '';
            conflict.hidden = state.conflict === null;
            leaving.hidden = !state.leaving;
            fields.update(state.fields);
        }
    };
}
