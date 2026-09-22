/* The bar the in-page script puts on the site's own page.
 *
 * It is small on purpose and it is not the editor. Its job in this
 * sub-phase is to be the one place every answer lands -- including the
 * three that are somebody's mistake -- because a script that decides a
 * page is not editable and then says nothing is indistinguishable from a
 * script that failed to load.
 *
 * Chrome in a shadow root, content in the light DOM: Mode A, one level
 * up, and for the same reasons `<content-tools-cms>` does it. Here the
 * isolation matters MORE than it does under /admin, because the page
 * around this bar belongs to somebody else. Their rules must not reach
 * our chrome, and ours must not reach a single node of their site -- a
 * CMS that restyles the page it is editing is a CMS that lies about what
 * the page looks like.
 *
 * There is no cascade layer here, unlike `ct-chrome` and `ct-shell`, and
 * the absence is deliberate. A layer exists so a CONSUMER can win at
 * equal specificity; those two are embedded by a host page that may want
 * to restyle them. Nothing embeds this. A site cannot write a rule that
 * reaches inside this root at all -- we expose no `::part()` -- so a
 * layer would be a wrapper no test could ever tell the presence of.
 */

import {sheetFactory} from '../core/constructed-styles.js';
import {h} from '../core/render.js';
import {buildFields} from '../entry/fields.js';
import type {FieldsState, FieldsView} from '../entry/fields.js';
import type {FieldValues} from '../entry/frontmatter.js';
import type {CmsConfig} from '../cms/config.js';
import type {PageEntry} from '../cms/preview.js';
import editCSS from './styles/edit.scss?inline';

/**
 * The bar's host element.
 *
 * A valid custom element name, and unregistered: `attachShadow` is
 * allowed on an undefined element whose name has a hyphen in it, and not
 * registering anything is one less thing this script can collide with on
 * a page it does not own. The name is also the bar's only real defence
 * against the site's own CSS -- see the head of ./styles/edit.scss.
 */
export const BAR_TAG = 'content-tools-edit-bar';

/**
 * The page, once the questions about it have been answered.
 *
 * Every state from `ready` on carries all three, because every one of
 * them wants to say which element this is about: an author deciding
 * whether the `body` selector is right should not have to sign in first,
 * and one who is signed in should be able to see it while the read is in
 * flight.
 */
export interface Located {
    readonly entry: PageEntry;
    readonly selector: string;
    readonly body: HTMLElement;
}

/**
 * What the bar has to say about this page.
 *
 * Each one is somewhere a person can genuinely be left: a config that
 * does not parse, a page that maps to no entry, an entry whose body
 * cannot be found, a page that is editable by somebody who is not signed
 * in, a read in flight, a read that failed, and an editor that is up.
 */
export type BarState =
    /** The config is missing or will not parse. Nothing else was tried. */
    | {readonly kind: 'broken'; readonly hint: string}
    /** The config is fine and this page is not one of its entries. */
    | {readonly kind: 'not-an-entry'; readonly hint: string}
    /** This page IS an entry, and the element holding its body is not. */
    | {readonly kind: 'no-body'; readonly entry: PageEntry; readonly hint: string}
    /**
     * Everything the editor needs, found -- the config included.
     *
     * The config is in here rather than fetched a second time by
     * whoever acts on this. It is one of the things the editor needs:
     * it names the repository, the branch and the media folder, and
     * two reads of one file is two answers that can differ if somebody
     * deploys between them.
     */
    | ({readonly kind: 'ready'; readonly config: CmsConfig} & Located)
    /** Editable, and nobody in this tab has a token. */
    | ({readonly kind: 'signed-out'} & Located)
    /** Reading the version on the branch. */
    | ({readonly kind: 'loading'} & Located)
    /** The read, or the mount, did not work. */
    | ({readonly kind: 'failed'; readonly hint: string} & Located)
    /** The editor is up, over the element named in the hint. */
    | ({readonly kind: 'editing'} & Editing & Located);

/** Everything about the entry that only exists once the editor is up. */
export interface Editing {
    /**
     * The frontmatter form.
     *
     * Never null, unlike the shell's, and the difference is that the
     * shell has a screen with no entry on it and this state does not.
     * A collection that declares no fields is a STATE rather than an
     * absence -- `buildFields` hides itself for one -- so a nullable
     * field here would be a second spelling of the same thing, and the
     * bar would have two ways to show no form that could disagree.
     */
    readonly fields: FieldsState;
    /** Whether the form is showing. See `showFields`. */
    readonly fieldsOpen: boolean;
    readonly save: SaveState;
}

/** What a submit is doing, and what the last one produced. */
export interface SaveState {
    /** A submit is in flight: the button refuses a second press. */
    readonly busy: boolean;
    /** The last outcome, or '' before there has been one. */
    readonly note: string;
    /**
     * Whether that outcome was a refusal, and should be coloured as one.
     *
     * Carried rather than derived from the words, and separate from the
     * note for the same reason the bar does not colour `signed-out`:
     * "nothing to save" and "somebody else changed this" are both
     * answers to pressing Submit, and colouring the ordinary one as a
     * fault teaches an author to read past the colour.
     */
    readonly refused: boolean;
    /** The pull request this entry's edits are in, once there is one. */
    readonly pull: {readonly number: number; readonly url: string} | null;
    /**
     * The markdown a refused save would have written.
     *
     * Shown verbatim and selectable, as the shell does it. A conflict is
     * the one failure where the person's work is still in hand and the
     * only way forward throws it away, and offering the reload without
     * showing them what they wrote is data loss with a button on it.
     *
     * There is no Reload button beside it, unlike the shell's, and the
     * absence is not an omission: this surface IS the entry's page, so
     * the browser's own reload is the reload -- and a button of ours
     * that did the same thing would be a second way to lose the text
     * in the box above it.
     */
    readonly conflict: string | null;
}

/** What the bar's two controls do. Supplied by whoever built the bar. */
export interface BarHandlers {
    /** Commit what is in the editor and open or update the pull request. */
    submit(): void;
    /** Show or hide the frontmatter form. */
    showFields(open: boolean): void;
}

/** A built bar: the element to append, and the way to change what it says. */
export interface Bar {
    /** The host. Its shadow root is open, so a test can read inside it. */
    readonly node: HTMLElement;
    update(state: BarState): void;
    /**
     * What the frontmatter form holds, or null when there is no usable
     * one. This is the ONLY copy of those answers -- see ../entry/fields.
     */
    values(): FieldValues | null;
    /** Every complaint the form has, shown under the fields as it asks. */
    errors(): string[];
}

/* No `layered()` -- see the header. Memoised per document all the same,
   because a page with an <iframe> the script also runs in has two
   documents and a constructed sheet belongs to exactly one of them. */
const barStyleSheet = sheetFactory(editCSS);

/** The form's id, so the Details button can say what it controls. */
const FIELDS_ID = 'ct-edit-fields';

/**
 * Build the bar, saying nothing yet. `update` is what gives it words.
 *
 * Everything is built here and shown or hidden by `update`, including
 * the controls only an editing page has. Building them on demand would
 * mean rebuilding the frontmatter form, and the form IS the answers --
 * there is no copy of them anywhere else, so a rebuild between a
 * keystroke and a submit is a field the author filled in and the file
 * never got.
 */
export function buildBar(doc: Document, handlers: BarHandlers): Bar {
    const node = doc.createElement(BAR_TAG);
    const root = node.attachShadow({mode: 'open'});

    const sheet = barStyleSheet(doc);
    /* Null where constructable sheets are unsupported. An unstyled bar
       is ugly and still readable, and it is still the only place the
       three failure states appear, so there is no <style> fallback to
       keep in step with this. */
    if (sheet) {
        root.adoptedStyleSheets = [sheet];
    }

    const title = h(doc, 'p', {class: 'ct-edit__title'});
    const hint = h(doc, 'p', {class: 'ct-edit__hint'});

    /* `aria-expanded` as well as the words, because what it controls is
       below the fold of a bar somebody may have scrolled past -- the
       state on the control itself is the only thing telling a
       screen-reader user that pressing it did anything. `open` is kept
       here rather than read back off the attribute: the handler needs
       to know what pressing it means NOW, and a string comparison is
       the same answer spelled so that a typo makes it silently
       always-open. */
    let open = false;
    const details = h(doc, 'button', {
        class: 'ct-edit__details',
        type: 'button',
        'aria-controls': FIELDS_ID,
        'aria-expanded': 'false',
        onclick: () => handlers.showFields(!open)
    }, ['Details']);

    /* A new tab, and `noopener` with it: this is a link out of somebody
       else's published page, and the page it opens must not get a
       handle back to a document the author is still editing in. */
    const pull = h(doc, 'a', {
        class: 'ct-edit__pull',
        target: '_blank',
        rel: 'noopener noreferrer'
    });

    const submit = h(doc, 'button', {
        class: 'ct-edit__submit',
        type: 'button',
        onclick: () => handlers.submit()
    }, [SUBMIT_LABEL]);

    const actions = h(doc, 'div', {class: 'ct-edit__actions'}, [details, pull, submit]);
    const note = h(doc, 'p', {class: 'ct-edit__note'});

    const conflict = h(doc, 'textarea', {
        class: 'ct-edit__conflict',
        readonly: 'readonly',
        spellcheck: 'false',
        'aria-label': 'The markdown this submit would have written'
    });

    const fields: FieldsView = buildFields(doc);
    fields.node.setAttribute('id', FIELDS_ID);

    /* `status` rather than `alert`: the bar is built empty and filled a
       moment later, once the config has been fetched, so without a live
       region somebody using a screen reader gets nothing at all -- and
       three of the four things it can say are not emergencies. */
    const panel = h(doc, 'div', {class: 'ct-edit', role: 'status'},
                    [title, hint, actions, note, fields.node, conflict]);
    root.appendChild(panel);

    return {
        node,
        values: () => fields.values(),
        errors: () => fields.errors(),

        update(state: BarState): void {
            const said = describe(state);
            panel.className = `ct-edit ct-edit--${state.kind}`;
            title.textContent = said.title;
            hint.textContent = said.hint;

            const editing = state.kind === 'editing' ? state : null;
            actions.hidden = editing === null;

            /* Asked of the form rather than of the state, because
               `update` is where "there is nothing to show" is decided
               -- a collection with no fields and a form that was closed
               are the same to it, and computing that a second time here
               is the second answer that can disagree. */
            fields.update(editing ? editing.fields : null);
            const form = !fields.node.hidden;
            details.hidden = !form;
            if (form) {
                open = (editing as Editing).fieldsOpen;
                fields.node.hidden = !open;
                details.setAttribute('aria-expanded', String(open));
            }

            const save = editing ? editing.save : null;
            (submit as HTMLButtonElement).disabled = save === null || save.busy;
            /* The label says which, rather than only the note below it:
               the button is what the person is looking at when they
               wonder whether the press registered. */
            submit.textContent = save?.busy ? 'Submitting\u2026' : SUBMIT_LABEL;

            note.textContent = save ? save.note : '';
            /* `save !== null &&` rather than `Boolean(save?.refused)`,
               which was written first: `toggle` with a second argument
               of `undefined` TOGGLES rather than sets, so the optional
               form flips the class on every update of a state that has
               no save -- invisibly, because the note is empty there,
               and untestably for the same reason. Spelled this way the
               guard is load-bearing: without it the line throws. */
            note.classList.toggle('ct-edit__note--refused',
                                  save !== null && save.refused);

            const open_pull = save ? save.pull : null;
            /* Emptied rather than left saying "#3" behind `hidden`: a
               hidden node's text is still in `textContent`, which is
               what an assertion reads, so a stale label makes a test
               pass that should not. */
            pull.textContent = open_pull ? `Pull request #${open_pull.number}` : '';
            if (open_pull) {
                pull.setAttribute('href', open_pull.url);
            } else {
                /* Removed rather than emptied: `<a href="">` is a link
                   to the current page, so a hidden empty one reloads
                   the site for anybody who tabs onto it. */
                pull.removeAttribute('href');
            }
            pull.hidden = open_pull === null;

            (conflict as HTMLTextAreaElement).value = save?.conflict ?? '';
            conflict.hidden = !save?.conflict;
        }
    };
}

/** What the button says when it is not in the middle of saying it. */
const SUBMIT_LABEL = 'Submit for review';

/** The two lines a state reads as. Pure, and separate so it is testable. */
export function describe(state: BarState): {title: string; hint: string} {
    switch (state.kind) {
        case 'broken':
            return {title: 'The CMS config could not be read', hint: state.hint};
        case 'not-an-entry':
            return {title: 'Not an editable page', hint: state.hint};
        case 'no-body':
            return {title: entryName(state.entry), hint: state.hint};
        case 'ready':
        case 'editing':
            /* Naming the ELEMENT, not just the selector, is the whole
               point of these two. The editor replaces that element's
               children, so a `body` selector that matches the page
               wrapper replaces the site's layout with a post -- and
               `main.layout` against `article.post` is the difference,
               read at a glance, before anybody presses anything. */
            return {
                title: entryName(state.entry),
                hint: `Editing ${found(state)}.`
            };
        case 'signed-out':
            return {
                title: entryName(state.entry),
                /* The element is named HERE TOO, and that is the point of
                   saying it in two states rather than one: checking a
                   `body` selector is a deployment job, and asking somebody
                   to obtain a token before they can see whether they
                   pointed it at the right element makes the check cost an
                   afternoon instead of a page load. */
                hint: `Found ${found(state)}. Sign in through the admin `
                    + 'screens in this tab, then come back to edit it.'
            };
        case 'loading':
            return {
                title: entryName(state.entry),
                /* "the branch" rather than "the repository", because that
                   is the surprising part: the words about to replace what
                   is on screen are the ones under review, not the ones
                   this page was built from. */
                hint: 'Reading the version on the branch...'
            };
        case 'failed':
            return {title: entryName(state.entry), hint: state.hint};
    }
}

/** `article.post, matched by article.post` -- the element and its rule. */
function found(state: Located): string {
    return `${describeElement(state.body)}, matched by ${state.selector}`;
}

/** `blog/hello`: the spelling `<meta name="cms:entry">` uses. */
function entryName(entry: PageEntry): string {
    return `${entry.collection}/${entry.slug}`;
}

/**
 * An element as a selector-shaped description: `article#post-3.prose`.
 *
 * Selector-shaped rather than prose because it is also the answer to the
 * question the person reading it is about to ask -- what they should have
 * written in `body:` instead.
 */
export function describeElement(el: Element): string {
    const id = el.id === '' ? '' : `#${el.id}`;
    const classes = [...el.classList].map(name => `.${name}`).join('');
    return `${el.tagName.toLowerCase()}${id}${classes}`;
}
