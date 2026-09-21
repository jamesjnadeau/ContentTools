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
import {statusOf} from '../../cms/status.js';
import type {Entry} from '../../cms/repo.js';
import type {EditorialStatus} from '../../cms/status.js';

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
}

export interface EntryView {
    readonly node: HTMLElement;
    update(state: EntryState): void;
}

export function buildEntry(doc: Document, handlers: EntryHandlers): EntryView {
    const heading = h(doc, 'h2', {class: 'ct-cms__heading'});
    const back = h(doc, 'a', {class: 'ct-cms__entry-back'});
    const badge = h(doc, 'span', {class: 'ct-cms__badge'});
    const pull = h(doc, 'a', {
        class: 'ct-cms__entry-pull',
        target: '_blank',
        rel: 'noopener noreferrer'
    });
    const submit = h(doc, 'button', {
        class: 'ct-cms__button',
        type: 'button',
        onclick: () => handlers.submit()
    }, ['Submit for review']);
    const note = h(doc, 'p', {class: 'ct-cms__note'});

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
            submit
        ]),
        back,
        note,
        leaving,
        conflict
    ]);

    return {
        node,

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

            note.textContent = entry === null
                ? 'Loading…'
                : (state.saving ? 'Saving…' : (state.saved ?? ''));

            (conflictText as HTMLTextAreaElement).value = state.conflict ?? '';
            conflict.hidden = state.conflict === null;
            leaving.hidden = !state.leaving;
        }
    };
}
