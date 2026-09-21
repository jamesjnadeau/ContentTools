/* The chrome around an open entry.
 *
 * The EDITOR is not here, and that separation is the point. It is a
 * light-DOM child of the shell host rendered through `<slot name="editor">`
 * (see the header of content-tools-cms.ts for why it cannot be anywhere
 * else), so this view owns only what sits above it: what the entry is,
 * where its pull request is, the button that submits, and the two panels
 * that appear when a save is refused or a navigation is held back.
 *
 * Built once and updated in place, like the entry list. Rebuilding it per
 * render would be harmless today -- there is no input in it yet -- and
 * actively wrong from M5-4, when the frontmatter fields land in this same
 * panel and a rebuild starts eating keystrokes.
 */
import {h} from '../render.js';
import {formatRoute} from '../routes.js';
import {buildFields} from './fields.js';
import type {FieldsState, FieldsView, WidgetSource} from './fields.js';
import {statusOf} from '../../cms/status.js';
import type {Entry} from '../../cms/repo.js';
import type {EditorialStatus} from '../../cms/status.js';
import type {FieldValues} from '../frontmatter.js';

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
            remove,
            submit
        ]),
        back,
        note,
        leaving,
        deleting,
        conflict,
        /* Above the slot the editor lands in, because the frontmatter is
           the top of the file and reading the screen in file order is
           one less thing to explain. */
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
