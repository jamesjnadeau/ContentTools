/* The frontmatter form: one control per declared field.
 *
 * WHAT A WIDGET HAS TO GET RIGHT is not rendering an input, it is knowing
 * the difference between "empty" and "absent". A markdown file's
 * frontmatter is hand-written and hand-read, and most fields most sites
 * declare are optional and unset. A widget that reported an untouched
 * optional field as `''` would add a key to every file the first time
 * anybody saved it -- a whole-file frontmatter diff on a typo fix, which
 * is the exact thing routing every change through a reviewable pull
 * request exists to prevent.
 *
 * So `value()` returns `undefined` for a field that arrived absent and
 * was never filled in, and `mergeFrontmatter` leaves those keys alone.
 * Every widget below records what it was handed at build time for no
 * other reason.
 *
 * The second thing they get right is refusing to guess. `widget` is an
 * unconstrained string in the config, so `widget: strng` is a config
 * somebody will ship. The answer is `unknown`: the value read-only, the
 * name of the widget on screen, and `value()` returning `undefined` so
 * the key passes through untouched. Falling back to `string` would let a
 * structured field be flattened to text and written back that way.
 */
import {h} from '../render.js';
import type {Field} from '../../cms/config.js';

export interface Widget {
    readonly node: HTMLElement;
    /**
     * What to write, or `undefined` to leave the key exactly as it was.
     *
     * `undefined` is "absent and still absent". A field that HAD a value
     * and has been cleared returns its type's empty value instead --
     * `''`, `null` or `[]` -- because clearing is an edit and deleting
     * the key is not what the person asked for.
     */
    value(): unknown;
    /** A message naming what is wrong, or null. */
    validate(): string | null;
}

export type WidgetFactory = (doc: Document, field: Field, value: unknown) => Widget;

/** The widget name a registry has no entry for. */
export const UNKNOWN_WIDGET = 'unknown';

/** Whether the frontmatter held this key at all. */
function wasSet(value: unknown): boolean {
    return value !== undefined;
}

/** The label, the control, and room for an error under it. */
function fieldRow(doc: Document, field: Field, control: HTMLElement,
                  extra: HTMLElement[] = []): {node: HTMLElement; error: HTMLElement} {
    const id = `ct-cms-field-${field.name}`;
    control.setAttribute('id', id);
    if (field.required) {
        /* The attribute as well as the label, so the browser and the
           accessibility tree agree with the asterisk. Our own
           `validate()` still runs: the form is never submitted, so
           nothing would otherwise consult the browser's opinion. */
        control.setAttribute('required', 'required');
    }
    const error = h(doc, 'p', {class: 'ct-cms__field-error', role: 'alert'});
    error.hidden = true;
    const node = h(doc, 'div', {class: 'ct-cms__field'}, [
        h(doc, 'label', {class: 'ct-cms__field-label', for: id},
          [field.required ? `${field.label} *` : field.label]),
        control,
        ...extra,
        error
    ]);
    return {node, error};
}

/** `required` and nothing else, which is all most widgets need. */
function requireFilled(field: Field, empty: boolean): string | null {
    return field.required && empty ? `${field.label} is required.` : null;
}

function textLike(tag: 'input' | 'textarea', type?: string): WidgetFactory {
    return (doc, field, value) => {
        const props: Record<string, string> = {class: 'ct-cms__field-input'};
        if (type) {
            props.type = type;
        }
        const control = h(doc, tag, props) as HTMLInputElement | HTMLTextAreaElement;
        const had = wasSet(value);
        control.value = had && value !== null ? String(value) : '';
        const {node, error} = fieldRow(doc, field, control);
        return {
            node,
            value: () => (control.value === '' && !had ? undefined : control.value),
            validate: () => show(error, requireFilled(field, control.value === ''))
        };
    };
}

/** Put a message under the control and hand it back, so callers can chain. */
function show(error: HTMLElement, message: string | null): string | null {
    error.textContent = message ?? '';
    error.hidden = message === null;
    return message;
}

const stringWidget = textLike('input', 'text');
const textWidget = textLike('textarea');

const numberWidget: WidgetFactory = (doc, field, value) => {
    const control = h(doc, 'input',
                      {class: 'ct-cms__field-input', type: 'number'}) as HTMLInputElement;
    const had = wasSet(value);
    /* Only a real number goes in, and `shown` records whether one did.
       A `number` field over a file holding `weight: "3"` or `weight:
       soon` is the config and the file disagreeing, and the control
       cannot display either -- so without this the widget would read
       back as "cleared" and write `null` over whatever was there, on
       the first save of a body edit that had nothing to do with it. An
       unshowable value is left exactly as it is instead. */
    const shown = typeof value === 'number';
    control.value = shown ? String(value) : '';
    const {node, error} = fieldRow(doc, field, control);
    return {
        node,
        /* `null`, not `''`, for a cleared number. `count: ''` is a string
           where the site's templates expect arithmetic, and YAML will
           happily store it. */
        value: () => {
            if (control.value === '') {
                return had && shown ? null : undefined;
            }
            return control.valueAsNumber;
        },
        validate: () => show(error, control.validity.badInput
            ? `${field.label} must be a number.`
            : requireFilled(field, control.value === ''))
    };
};

const booleanWidget: WidgetFactory = (doc, field, value) => {
    const control = h(doc, 'input',
                      {class: 'ct-cms__field-check', type: 'checkbox'}) as HTMLInputElement;
    const had = wasSet(value);
    control.checked = value === true;
    const {node} = fieldRow(doc, field, control);
    return {
        node,
        /* A checkbox has no empty state, so an absent key that is still
           unticked is the ONLY thing that can mean "not set". Anything
           else is a deliberate false, which `draft: false` says out loud
           and an absent key does not. */
        value: () => (!had && !control.checked ? undefined : control.checked),
        // Nothing to require: a checkbox always has an answer.
        validate: () => null
    };
};

function dateLike(type: 'date' | 'datetime-local'): WidgetFactory {
    return (doc, field, value) => {
        const control = h(doc, 'input',
                          {class: 'ct-cms__field-input', type}) as HTMLInputElement;
        const had = wasSet(value);
        control.value = textOfDate(value, type);
        /* Asked of the CONTROL, after the assignment, because it is the
           only thing that knows what it will accept: `2024-13-45` and
           `soon` are both strings and neither survives. Same reason as
           the number widget -- a value the control cannot show must be
           left alone rather than read back as cleared and written over
           with `null`. */
        const shown = control.value !== '';
        const {node, error} = fieldRow(doc, field, control);
        return {
            node,
            /* The control's own text, never a `Date`. `date` and
               `datetime` are two widgets rather than one for exactly
               this: writing `2024-01-02T00:00:00.000Z` where the file
               said `2024-01-02` changes what the file means, and turns
               a one-word edit into a diff nobody can read. */
            value: () => {
                if (control.value === '') {
                    return had && shown ? null : undefined;
                }
                return control.value;
            },
            validate: () => show(error, control.validity.badInput
                ? `${field.label} must be a ${type === 'date' ? 'date' : 'date and time'}.`
                : requireFilled(field, control.value === ''))
        };
    };
}

/**
 * What to put in a date control for a value out of somebody's YAML.
 *
 * `yaml` resolves an unquoted `2024-01-02` to a `Date`, and a quoted one
 * to a string, for the same line in two different files. Both have to
 * land in a control that only accepts `YYYY-MM-DD`.
 */
function textOfDate(value: unknown, type: 'date' | 'datetime-local'): string {
    const iso = value instanceof Date
        ? value.toISOString()
        : (typeof value === 'string' ? value : '');
    if (iso === '') {
        return '';
    }
    return type === 'date' ? iso.slice(0, 10) : iso.slice(0, 16);
}

const selectWidget: WidgetFactory = (doc, field, value) => {
    const control = h(doc, 'select', {class: 'ct-cms__field-input'}) as HTMLSelectElement;
    const had = wasSet(value);
    /* A blank first choice only when the key is absent. Offering it for a
       field that HAS a value would make "none of these" reachable by
       accident, and there is no way to express it in the config. */
    if (!had) {
        control.appendChild(h(doc, 'option', {value: ''}, ['—']));
    }
    for (const option of field.options) {
        control.appendChild(h(doc, 'option', {value: option.value}, [option.label]));
    }
    control.value = typeof value === 'string' ? value : '';
    const {node, error} = fieldRow(doc, field, control);
    return {
        node,
        value: () => (control.value === '' && !had ? undefined : control.value),
        validate: () => show(error, requireFilled(field, control.value === ''))
    };
};

const listWidget: WidgetFactory = (doc, field, value) => {
    const control = h(doc, 'textarea',
                      {class: 'ct-cms__field-input'}) as HTMLTextAreaElement;
    const had = wasSet(value);
    control.value = Array.isArray(value) ? value.join('\n') : '';
    const hint = h(doc, 'p', {class: 'ct-cms__field-hint'}, ['One per line.']);
    const {node, error} = fieldRow(doc, field, control, [hint]);
    const lines = () => control.value.split('\n').map(line => line.trim())
        .filter(line => line !== '');
    return {
        node,
        /* Blank lines dropped and each entry trimmed, because the
           separator is a newline and a trailing one is how every
           textarea ends. An empty list that WAS a list stays `[]`: the
           tags were removed, which is not the same as never having had
           any. */
        value: () => {
            const out = lines();
            return out.length === 0 && !had ? undefined : out;
        },
        validate: () => show(error, requireFilled(field, lines().length === 0))
    };
};

const imageWidget: WidgetFactory = (doc, field, value) => {
    const control = h(doc, 'input',
                      {class: 'ct-cms__field-input', type: 'text'}) as HTMLInputElement;
    const had = wasSet(value);
    control.value = had && value !== null ? String(value) : '';
    /* The preview IS the widget. Getting the path wrong is the common
       failure for an image field and it is invisible in a text box until
       somebody looks at the built site; a broken thumbnail says it here.
       The field is still a PATH: M5-6's media grid inserts into the
       editor's body, not into a field, so choosing from what the
       repository already holds is not wired up here. There is
       deliberately no upload button either -- media has to travel in the
       same commit as the entry that references it, and only the editor's
       own dialog stages it that way. */
    const preview = h(doc, 'img', {class: 'ct-cms__field-preview', alt: ''});
    const paint = () => {
        preview.hidden = control.value === '';
        if (control.value !== '') {
            preview.setAttribute('src', control.value);
        }
    };
    control.addEventListener('input', paint);
    const {node, error} = fieldRow(doc, field, control, [preview]);
    paint();
    return {
        node,
        value: () => (control.value === '' && !had ? undefined : control.value),
        validate: () => show(error, requireFilled(field, control.value === ''))
    };
};

const unknownWidget: WidgetFactory = (doc, field, value) => {
    const control = h(doc, 'input', {
        class: 'ct-cms__field-input',
        type: 'text',
        readonly: 'readonly'
    }) as HTMLInputElement;
    control.value = value === undefined || value === null ? '' : JSON.stringify(value);
    const note = h(doc, 'p', {class: 'ct-cms__field-hint'},
                   [`No widget called "${field.widget}". Shown as stored, and left alone.`]);
    const {node} = fieldRow(doc, field, control, [note]);
    return {
        node,
        // Untouched, whatever it is. The key passes straight through.
        value: () => undefined,
        /* Not an error, and deliberately not required-checked: the person
           in front of it cannot fix either, and a form they cannot submit
           would stop them saving the body too. */
        validate: () => null
    };
};

/** The widgets every deployment gets. A site may add to this, not replace it. */
export const DEFAULT_WIDGETS: Readonly<Record<string, WidgetFactory>> = Object.freeze({
    'string': stringWidget,
    'text': textWidget,
    'number': numberWidget,
    'boolean': booleanWidget,
    'date': dateLike('date'),
    'datetime': dateLike('datetime-local'),
    'select': selectWidget,
    'list': listWidget,
    'image': imageWidget,
    [UNKNOWN_WIDGET]: unknownWidget
});

/** Build the control for one field, falling back loudly. */
export function buildWidget(
        doc: Document,
        field: Field,
        value: unknown,
        registry: Readonly<Record<string, WidgetFactory>> = DEFAULT_WIDGETS
        ): Widget {
    const make = registry[field.widget] ?? registry[UNKNOWN_WIDGET] ?? unknownWidget;
    return make(doc, field, value);
}
