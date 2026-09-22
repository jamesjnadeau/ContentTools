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
    /**
     * Whether the ignition switch is ON.
     *
     * The editor element is up in both, and that is the distinction
     * this flag exists to keep honest: `editing` means the entry is
     * OPEN, not that anybody is editing it. With the switch off the
     * page is still showing exactly what the site published, and a bar
     * that said "Editing article.post" over the reader's own markup
     * would be describing something that has not happened.
     *
     * Submit stays live either way, which is not an oversight: pressing
     * the green tick keeps the edits and takes the tools away, and the
     * button that commits them has to still work afterwards.
     */
    readonly started: boolean;
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

    /* The toolbox's grip, bump for bump, so the two things an author can
       drag around the page look like the same kind of thing. Hidden from
       assistive technology: it is a mouse affordance, and three empty
       divs read out of a live region are three announcements of nothing. */
    const grip = h(doc, 'div', {class: 'ct-edit__grip ct-grip', 'aria-hidden': 'true'},
                   [0, 1, 2].map(() => h(doc, 'div', {class: 'ct-grip__bump'})));

    /* The words scroll under the grip rather than taking it with them: a
       nine-field form is taller than some viewports, and a handle that
       has scrolled out of the panel is a bar that cannot be moved off
       the paragraph it is covering. */
    const body = h(doc, 'div', {class: 'ct-edit__body'},
                   [title, hint, actions, note, fields.node, conflict]);

    /* `status` rather than `alert`: the bar is built empty and filled a
       moment later, once the config has been fetched, so without a live
       region somebody using a screen reader gets nothing at all -- and
       three of the four things it can say are not emergencies. */
    const panel = h(doc, 'div', {class: 'ct-edit', role: 'status'}, [grip, body]);
    root.appendChild(panel);

    /* Kept here because `update` rewrites the panel's class list whole,
       and a state change landing mid-drag must not make the bar opaque
       under the pointer. */
    let held = false;
    const drag = draggable(node, grip, dragging => {
        held = dragging;
        panel.classList.toggle('ct-edit--dragging', dragging);
    });

    return {
        node,
        values: () => fields.values(),
        errors: () => fields.errors(),

        update(state: BarState): void {
            const said = describe(state);
            panel.className = `ct-edit ct-edit--${state.kind}`;
            panel.classList.toggle('ct-edit--dragging', held);
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

            /* Every update can change the panel's height -- the form
               opening is most of a screen -- so a bar dropped near the
               bottom is pulled back up here rather than left with its
               Submit button below the fold. */
            drag.contain();
        }
    };
}

/**
 * Where the bar was last dropped, as `left,top` in whole pixels.
 *
 * The toolbox's `ct-toolbox-position`, one widget along, and in
 * `localStorage` for the same reason: it is where this author likes the
 * bar on this site, not something that belongs to one tab.
 */
export const BAR_POSITION_KEY = 'ct-edit-bar-position';

/** `localStorage`, or null where reaching for it throws. */
function storage(view: Window | null): Storage | null {
    /* Inside a try because the getter itself throws with site data
       blocked, and a bar that fails to build over a preference is a
       page that says nothing at all about why it is not editable. */
    try {
        return view ? view.localStorage : null;
    } catch {
        return null;
    }
}

/**
 * Let the bar be dragged by its grip, as the toolbox is by its own.
 *
 * Until somebody drags it the bar sits where the stylesheet puts it --
 * top right -- and nothing here touches it: only a bar that has been
 * placed has an inline `left`, and only a placed bar is contained.
 * Pointer events rather than the toolbox's mouse events, so a touch
 * screen, which has no mouse to drag with, can move it too.
 */
function draggable(
        node: HTMLElement,
        grip: HTMLElement,
        dragging: (on: boolean) => void): {contain(): void} {
    const doc = node.ownerDocument;
    const view = doc.defaultView;
    let offset: {x: number; y: number} | null = null;

    /* `right: auto` because the stylesheet's `right` would otherwise
       stretch the host between the two, and inline because the host's
       own rules are `:host` rules that any rule on the page outranks. */
    const place = (left: number, top: number) => {
        node.style.left = `${Math.round(left)}px`;
        node.style.top = `${Math.round(top)}px`;
        node.style.right = 'auto';
    };

    const contain = () => {
        if (!node.isConnected || !node.style.left) {
            return;
        }
        /* The document element's client size rather than `innerWidth`,
           which counts the scrollbar -- a bar tucked under it has a
           strip nobody can click. */
        const width = doc.documentElement.clientWidth;
        const height = doc.documentElement.clientHeight;
        const rect = node.getBoundingClientRect();
        place(Math.max(0, Math.min(rect.left, width - rect.width)),
              Math.max(0, Math.min(rect.top, height - rect.height)));
    };

    const onMove = (ev: PointerEvent) => {
        if (offset) {
            place(ev.clientX - offset.x, ev.clientY - offset.y);
        }
    };

    const onStop = () => {
        if (!offset) {
            return;
        }
        offset = null;
        doc.removeEventListener('pointermove', onMove);
        doc.removeEventListener('pointerup', onStop);
        doc.removeEventListener('pointercancel', onStop);
        dragging(false);

        contain();
        try {
            storage(view)?.setItem(BAR_POSITION_KEY,
                                   `${parseInt(node.style.left)},${parseInt(node.style.top)}`);
        } catch {
            /* Full, or refused. The bar is where it was dropped either
               way; it only will not be there next time. */
        }
    };

    grip.addEventListener('pointerdown', (ev: PointerEvent) => {
        if (ev.button !== 0 || offset) {
            return;
        }
        /* Suppresses the mousedown that follows, which is what would
           otherwise start a text selection across somebody's article
           for the length of the drag. */
        ev.preventDefault();
        const rect = node.getBoundingClientRect();
        offset = {x: ev.clientX - rect.left, y: ev.clientY - rect.top};
        doc.addEventListener('pointermove', onMove);
        doc.addEventListener('pointerup', onStop);
        doc.addEventListener('pointercancel', onStop);
        dragging(true);
    });

    /* Same shape as the toolbox's check: two whole numbers, or it is not
       a position this code wrote and it is ignored. */
    const saved = storage(view)?.getItem(BAR_POSITION_KEY);
    if (saved && /^\d+,\d+$/.test(saved)) {
        const [left, top] = saved.split(',').map(Number);
        place(left, top);
    }

    /* Never removed, because the bar never is: it is on the page for as
       long as the page is. A window made smaller must not leave the bar
       -- and the Submit button on it -- outside it. */
    view?.addEventListener('resize', contain);

    return {contain};
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
        /* NONE of the four below names the element the `body` selector
           matched, and they used to. `Found article#post-1.post, matched
           by article.post.` is a deployment check written where an
           author reads it, so every one of them paid for a line that
           answered a question they had not asked -- on every page, every
           time. The check itself is not lost: `no-body` still says
           exactly what was looked for when nothing matched, which is the
           arrangement that actually breaks. What went is the reassurance
           in the case where it worked. */
        case 'ready':
            return {title: entryName(state.entry), hint: 'Ready to edit.'};
        case 'editing':
            return {
                title: entryName(state.entry),
                /* "Editing" is claimed only once something is. With the
                   switch off the page is still the site's own, and a bar
                   saying otherwise over the reader's markup is the one
                   thing this state must not do. */
                hint: state.started
                    ? 'Editing this page.'
                    : 'Press the pencil, top left of the page, to edit it.'
            };
        case 'signed-out':
            return {
                title: entryName(state.entry),
                hint: 'Sign in through the admin screens in this tab, then '
                    + 'come back to edit it.'
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

/** `blog/hello`: the spelling `<meta name="cms:entry">` uses. */
function entryName(entry: PageEntry): string {
    return `${entry.collection}/${entry.slug}`;
}
