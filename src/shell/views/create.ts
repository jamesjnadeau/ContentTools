/* Naming a new entry.
 *
 * One field and one button, and the field is not the title of the post --
 * it is the FILENAME, which is the one thing about an entry nobody can
 * change afterwards without breaking its URL. So the name the file will
 * get is shown while it is being typed, rather than derived silently from
 * a title and discovered later in a pull request.
 *
 * Built once and updated in place, like every other view that holds an
 * input: rebuilding on each render would destroy the caret mid-word, and
 * this view re-renders on every keystroke because the preview is what it
 * is for.
 */
import {h} from '../render.js';
import {entryPath, expandSlug, slugify} from '../../cms/config.js';
import type {Collection, FolderCollection} from '../../cms/config.js';

export interface CreateState {
    collection: Collection;
    /** A create already in flight: the button is held while it runs. */
    busy: boolean;
}

export interface CreateView {
    readonly node: HTMLElement;
    update(state: CreateState): void;
}

export interface CreateHandlers {
    /** Make the entry. The slug is re-derived there, not passed from here. */
    create(title: string): void;
}

/** Why this collection cannot be added to, or null. */
export function refuseCreate(collection: Collection): string | null {
    /* A file collection is a fixed list of pages somebody declared, so
       adding to it means editing the config, not pressing a button. The
       route is reachable by hand-typed URL, which is the only way anybody
       gets here -- there is no link. */
    if (collection.kind === 'file') {
        return `${collection.label} is a fixed set of pages, so entries cannot be added to it.`;
    }
    if (!collection.create) {
        return `${collection.label} does not allow new entries.`
            + ' A deployment turns that on with `create: true` in its config.';
    }
    return null;
}

/**
 * The filename a title would get, or null when there is no usable name.
 *
 * `slugify` returning nothing is not an edge case to paper over: a title
 * written entirely in a script it cannot spell has no ASCII filename, and
 * inventing one would give somebody a page at a URL they did not choose
 * and cannot guess.
 */
export function previewPath(collection: FolderCollection, title: string, at: Date): string | null {
    if (slugify(title) === '') {
        return null;
    }
    return entryPath(collection, expandSlug(collection, title, at));
}

export function buildCreate(doc: Document, handlers: CreateHandlers): CreateView {
    const heading = h(doc, 'h2', {class: 'ct-cms__heading'});
    const refusal = h(doc, 'p', {class: 'ct-cms__note'});
    const input = h(doc, 'input', {
        class: 'ct-cms__field-input',
        id: 'ct-cms-new-title',
        type: 'text',
        autocomplete: 'off'
    }) as HTMLInputElement;
    const preview = h(doc, 'p', {class: 'ct-cms__field-hint'});
    const submit = h(doc, 'button', {
        class: 'ct-cms__button',
        type: 'button'
    }, ['Create']) as HTMLButtonElement;

    const form = h(doc, 'div', {class: 'ct-cms__create-form'}, [
        h(doc, 'label', {class: 'ct-cms__field-label', for: 'ct-cms-new-title'},
          ['What is it called?']),
        input,
        preview,
        submit
    ]);
    const node = h(doc, 'section', {class: 'ct-cms__create'}, [heading, refusal, form]);

    /** The state of the moment, so typing and rendering agree. */
    let shown: CreateState | null = null;

    function paint(): void {
        const state = shown;
        /* A file collection has no `slug` template, so expanding one
           throws -- and it would throw from inside `update()`, taking
           the whole render with it rather than just the preview. Not
           reachable today, because `refuseCreate` hides the field this
           paints for and nobody can type into a hidden input; kept
           because it is also what narrows the type, and because the
           thing it prevents is a blank screen rather than a wrong
           line of text. */
        if (!state || state.collection.kind !== 'folder') {
            return;
        }
        /* Read here rather than held, because a tab left open overnight
           would otherwise name a new post after yesterday under a dated
           template -- and the preview would have been right when it was
           drawn. */
        const path = previewPath(state.collection, input.value, new Date());
        preview.textContent = path === null
            ? (input.value === ''
                ? ''
                : 'That name has no letters or numbers a filename can use.')
            : `Saved as ${path}`;
        submit.disabled = path === null || state.busy;
    }

    input.addEventListener('input', paint);
    /* Enter submits, because a one-field form that ignores Enter is a form
       people type into twice. Not a real <form>: a submit inside a shadow
       root still navigates the page, which would throw away the shell. */
    input.addEventListener('keydown', ev => {
        if ((ev as KeyboardEvent).key === 'Enter' && !submit.disabled) {
            handlers.create(input.value);
        }
    });
    submit.addEventListener('click', () => handlers.create(input.value));

    return {
        node,

        update(state: CreateState): void {
            shown = state;
            heading.textContent = `New ${state.collection.label} entry`;

            const why = refuseCreate(state.collection);
            refusal.textContent = why ?? '';
            form.hidden = why !== null;
            paint();
        }
    };
}
