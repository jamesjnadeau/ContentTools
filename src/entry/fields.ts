/* The frontmatter form, above the body the editor holds.
 *
 * Beside `session.ts` rather than inside either surface, because both of
 * them build this same form: the shell renders it above the editor under
 * /admin, and the in-page script renders it inside the bar on the site's
 * own page. The two look different and the CONTROLS must not -- a `date`
 * that reports an unshowable value as cleared on one surface and leaves
 * it alone on the other is a file that loses a key depending on where it
 * was edited. So the markup and the "empty versus absent" rules are
 * here, and each surface writes its own rules for the classes.
 *
 * Built once per ENTRY and not once per render, and that is the whole
 * design. The frame re-renders on every state change -- a save starting,
 * a notice arriving -- and rebuilding the controls each time would
 * destroy the caret in whichever one the person is typing into. The
 * widgets are also the only place the current answers live: there is no
 * copy of them in the shell's state to get out of step, so nothing ever
 * writes a value back into a control somebody is holding.
 *
 * `key` is what says "this is a different entry now". Entry identity is
 * not usable for it: a save replaces the `Entry` object with a re-pinned
 * copy, and keying on that would rebuild the form -- losing focus --
 * every time somebody pressed Submit.
 */
import {h} from '../core/render.js';
import {buildWidget, DEFAULT_WIDGETS} from './widgets.js';
import type {Widget, WidgetFactory} from './widgets.js';
import {fieldsFor} from '../cms/config.js';
import type {Collection, Field} from '../cms/config.js';
import {isMergeable} from './frontmatter.js';
import type {FieldValues} from './frontmatter.js';
import type {MarkdownDocument} from '../markdown/document.js';

export interface FieldsState {
    /** Changes when a different entry is loaded. */
    key: string;
    fields: readonly Field[];
    /** The parsed frontmatter, or null. */
    data: unknown;
    /**
     * Why the form cannot be used, or null.
     *
     * A block whose YAML did not parse is the case this exists for. The
     * form is not merely inaccurate then -- writing a merge over content
     * nobody has read would replace the person's broken-but-recoverable
     * frontmatter with whatever the form happened to hold.
     */
    refusal: string | null;
}

export interface FieldsView {
    readonly node: HTMLElement;
    /** `null` closes the form: no entry is open. */
    update(state: FieldsState | null): void;
    /** What the widgets say, or null when there is no usable form. */
    values(): FieldValues | null;
    /** Every field's complaint, and the messages appear under the fields. */
    errors(): string[];
}

const NOT_A_MAPPING =
    'This entry\u2019s frontmatter is not a set of keys, so it cannot be edited here. '
    + 'It will be saved exactly as it is.';
const UNREADABLE =
    'This entry\u2019s frontmatter could not be read as YAML, so it cannot be edited '
    + 'here. It will be saved exactly as it is, for you to fix in the repository.';

/**
 * What the form shows for this entry, and whether it may be used at all.
 *
 * Shared by both surfaces, and the REFUSALS are why. The fields come
 * from the config and the values from the file, and either can be
 * absent without the other mattering -- but a block the parser could
 * not read is the case that matters: merging a form into content nobody
 * has read replaces somebody's broken-but-recoverable frontmatter with
 * whatever the form happened to hold. Two surfaces deciding that
 * separately is one of them deciding it wrong.
 */
export function formState(
        collection: Collection, slug: string, doc: MarkdownDocument): FieldsState {
    const front = doc.frontmatter();
    const data = front ? front.data : null;

    /* `valid` and not `data === null`, because those are opposite
       instructions that look identical: an empty block parses to null
       and is a file with no keys yet, which a form may add to. See
       `Frontmatter.valid`. */
    let refusal: string | null = null;
    if (front && !front.valid) {
        refusal = UNREADABLE;
    } else if (!isMergeable(data)) {
        refusal = NOT_A_MAPPING;
    }

    return {
        /* What tells the form one entry from the next -- and NOT the
           `Entry` object, because a save replaces that with a copy
           re-pinned to the new commit, and keying on it would rebuild
           every control under whoever was typing on every press of
           Submit. */
        key: `${collection.name}/${slug}`,
        fields: fieldsFor(collection, slug),
        data,
        refusal
    };
}

/** The registry as a GETTER: see `buildEntry`. */
export type WidgetSource = () => Readonly<Record<string, WidgetFactory>>;

export function buildFields(doc: Document, registry: WidgetSource = () => DEFAULT_WIDGETS
        ): FieldsView {
    const rows = h(doc, 'div', {class: 'ct-fields__rows'});
    /* `ct-fields__note`, not the shell's `ct-cms__note` it was written
       as: this markup is built once and styled by two sheets, so a class
       named after one surface is a rule the other has to define under a
       name that means nothing there. */
    const note = h(doc, 'p', {class: 'ct-fields__note'});
    const node = h(doc, 'section', {class: 'ct-fields'}, [
        h(doc, 'h3', {class: 'ct-fields__heading'}, ['Details']),
        note,
        rows
    ]);

    let built: string | null = null;
    let widgets: {field: Field; widget: Widget}[] = [];
    let usable = false;

    function rebuild(state: FieldsState): void {
        widgets = [];
        rows.replaceChildren();
        usable = state.refusal === null;
        note.textContent = state.refusal ?? '';
        if (!usable) {
            return;
        }
        /* A mapping or nothing, guaranteed by the caller: anything else
           -- a bare list, a scalar -- is what `refusal` is for, and the
           early return above has already taken that path. A shape check
           here was written and removed; no test could tell it from this,
           because every reachable non-mapping is refused before it
           arrives. */
        const held = (state.data ?? {}) as Record<string, unknown>;
        for (const field of state.fields) {
            /* Reading the property is enough to tell present from
               absent, and an own-property check beside it was removed:
               `yaml` resolves `title:` with nothing after it to NULL,
               never to undefined, so the only value that would fool
               this cannot come out of a frontmatter block. Present-and-
               null matters -- a widget told it was absent would report
               it as still absent and never clear it. */
            const widget = buildWidget(doc, field, held[field.name], registry());
            widgets.push({field, widget});
            rows.appendChild(widget.node);
        }
    }

    return {
        node,

        update(state: FieldsState | null): void {
            /* Nothing to show is not the same as a form with no rows:
               a collection that declares no fields gets no heading
               either, rather than an empty panel above every entry. */
            const empty = state === null
                || (state.fields.length === 0 && state.refusal === null);
            node.hidden = empty;
            if (empty) {
                /* `usable` too, and not only `built`: it is the single
                   thing `values()` asks, so leaving it set would have a
                   closed form still reporting the last entry's answers
                   to whatever asked next. */
                built = null;
                usable = false;
                widgets = [];
                rows.replaceChildren();
                return;
            }
            if (state.key !== built) {
                built = state.key;
                rebuild(state);
            }
        },

        values(): FieldValues | null {
            if (!usable) {
                return null;
            }
            const out: Record<string, unknown> = {};
            for (const {field, widget} of widgets) {
                out[field.name] = widget.value();
            }
            return out;
        },

        errors(): string[] {
            /* Every widget is asked, not just up to the first failure:
               `validate()` is what puts the message under its own
               control, so stopping early would leave the second broken
               field silently unmarked. */
            return widgets
                .map(({widget}) => widget.validate())
                .filter((message): message is string => message !== null);
        }
    };
}
