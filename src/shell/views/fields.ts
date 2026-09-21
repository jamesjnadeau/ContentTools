/* The frontmatter form, above the body the editor holds.
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
import {h} from '../render.js';
import {buildWidget, DEFAULT_WIDGETS} from '../widgets/index.js';
import type {Widget, WidgetFactory} from '../widgets/index.js';
import type {Field} from '../../cms/config.js';
import type {FieldValues} from '../frontmatter.js';

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

/** The registry as a GETTER: see `buildEntry`. */
export type WidgetSource = () => Readonly<Record<string, WidgetFactory>>;

export function buildFields(doc: Document, registry: WidgetSource = () => DEFAULT_WIDGETS
        ): FieldsView {
    const rows = h(doc, 'div', {class: 'ct-cms__field-rows'});
    const note = h(doc, 'p', {class: 'ct-cms__note'});
    const node = h(doc, 'section', {class: 'ct-cms__fields'}, [
        h(doc, 'h3', {class: 'ct-cms__fields-heading'}, ['Details']),
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
