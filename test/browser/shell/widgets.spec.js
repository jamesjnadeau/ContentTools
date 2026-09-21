import {
    buildWidget, DEFAULT_WIDGETS, UNKNOWN_WIDGET
} from '../../../src/shell/widgets/index.js';

/* One control per declared field, and the thing each one has to get right
 * is not rendering an input.
 *
 * It is the difference between EMPTY and ABSENT. Most fields most sites
 * declare are optional and unset, so a widget that reported an untouched
 * optional field as `''` would add a key to every file the first time
 * anybody pressed Submit -- a whole-file frontmatter diff on a typo fix,
 * which is the exact failure routing every change through a reviewable
 * pull request exists to prevent. `undefined` is the answer, and half the
 * assertions below are about nothing else.
 */

/** A field declaration with the defaults `parseFields` would have given it. */
function field(over = {}) {
    return {
        name: 'title', label: 'Title', widget: 'string',
        required: false, options: [], default: undefined, ...over
    };
}

/** Build a widget and hand back the control it rendered. */
function build(over, value, registry) {
    const widget = buildWidget(document, field(over), value, registry);
    const control = widget.node.querySelector('input, textarea, select');
    return {widget, control, node: widget.node};
}

describe('the frontmatter widgets', function() {

    // --- absent vs empty, per widget --------------------------------------

    it('leaves an absent text-ish field absent', function() {
        for (const widget of ['string', 'text', 'image']) {
            expect(build({widget}, undefined).widget.value()).toBe(undefined);
        }
    });

    it('reports a CLEARED text-ish field as empty, not absent', function() {
        /* Clearing is an edit. Returning `undefined` here would silently
           refuse to empty a field somebody has just emptied. */
        for (const widget of ['string', 'text', 'image']) {
            const {widget: w, control} = build({widget}, 'was here');
            control.value = '';
            expect(w.value()).toBe('');
        }
    });

    it('reports what was typed into an absent field', function() {
        const {widget, control} = build({}, undefined);
        control.value = 'Typed';
        expect(widget.value()).toBe('Typed');
    });

    it('shows the stored value', function() {
        expect(build({}, 'Stored').control.value).toBe('Stored');
        expect(build({widget: 'text'}, 'Stored').control.value).toBe('Stored');
    });

    it('shows a present-but-null key as an empty control that can be filled', function() {
        /* `title:` with nothing after it parses to null and is PRESENT.
           The control is empty, and clearing it stays `''` rather than
           reverting to absent. */
        const {widget, control} = build({}, null);
        expect(control.value).toBe('');
        expect(widget.value()).toBe('');
    });

    // --- number ------------------------------------------------------------

    it('gives a cleared number null rather than the empty string', function() {
        /* `weight: ''` is a string where the site's templates expect
           arithmetic, and YAML will store it without complaint. */
        const {widget, control} = build({widget: 'number'}, 3);
        expect(control.value).toBe('3');
        control.value = '';
        expect(widget.value()).toBe(null);
    });

    it('leaves an absent number absent, and reads a typed one as a number', function() {
        const {widget, control} = build({widget: 'number'}, undefined);
        expect(widget.value()).toBe(undefined);
        control.value = '42';
        expect(widget.value()).toBe(42);
    });

    it('leaves a stored value it cannot show ALONE', function() {
        /* A `number` field over `weight: "3"` or `weight: soon` is the
           config and the file disagreeing. The control cannot display
           either, and reading that back as "cleared" would write `null`
           over it -- on the first save of a body edit that had nothing
           to do with this field. */
        for (const stored of ['abc', '3', {a: 1}]) {
            const {widget, control} = build({widget: 'number'}, stored);
            expect(control.value).toBe('');
            expect(widget.value()).toBe(undefined);
        }
        // And typing one in still writes it.
        const {widget, control} = build({widget: 'number'}, 'abc');
        control.value = '7';
        expect(widget.value()).toBe(7);
    });

    it('leaves a date it cannot show alone', function() {
        for (const stored of ['soon', '2024-13-45', 42]) {
            const {widget, control} = build({widget: 'date'}, stored);
            expect(control.value).toBe('');
            expect(widget.value()).toBe(undefined);
        }
    });

    it('does not complain about an optional field left empty', function() {
        /* Otherwise every optional field a file has not set shows an
           error the moment anybody presses Submit, and the entry cannot
           be saved at all. */
        for (const widget of ['string', 'text', 'number', 'date', 'list']) {
            expect(build({widget}, undefined).widget.validate()).toBe(null);
        }
    });

    // --- boolean -----------------------------------------------------------

    it('tells an absent unticked checkbox from a deliberate false', function() {
        /* A checkbox has no empty state, so this is the only signal
           there is: `draft: false` says something out loud that an
           absent key does not. */
        const absent = build({widget: 'boolean'}, undefined);
        expect(absent.widget.value()).toBe(undefined);
        absent.control.checked = true;
        expect(absent.widget.value()).toBe(true);

        const stored = build({widget: 'boolean'}, false);
        expect(stored.control.checked).toBe(false);
        expect(stored.widget.value()).toBe(false);
    });

    it('ticks a checkbox for a stored true', function() {
        const {widget, control} = build({widget: 'boolean'}, true);
        expect(control.checked).toBe(true);
        expect(widget.value()).toBe(true);
    });

    it('never complains about a required checkbox', function() {
        // It always has an answer, so `required` has nothing to ask for.
        const {widget} = build({widget: 'boolean', required: true}, undefined);
        expect(widget.validate()).toBe(null);
    });

    // --- date and datetime ---------------------------------------------------

    it('keeps a date a date, and gives the control text not an instant', function() {
        /* `date` and `datetime` are two widgets for exactly this:
           writing `2024-01-02T00:00:00.000Z` where the file said
           `2024-01-02` changes what the file means. */
        const {widget, control} = build({widget: 'date'}, '2024-01-02');
        expect(control.value).toBe('2024-01-02');
        expect(widget.value()).toBe('2024-01-02');
    });

    it('accepts a Date, because unquoted YAML dates parse to one', function() {
        const value = new Date('2024-01-02T03:04:05Z');
        expect(build({widget: 'date'}, value).control.value).toBe('2024-01-02');
        expect(build({widget: 'datetime'}, value).control.value)
            .toBe('2024-01-02T03:04');
    });

    it('gives a cleared date null and an absent one undefined', function() {
        const {widget, control} = build({widget: 'date'}, '2024-01-02');
        control.value = '';
        expect(widget.value()).toBe(null);
        expect(build({widget: 'date'}, undefined).widget.value()).toBe(undefined);
    });

    // --- select ---------------------------------------------------------------

    it('offers a blank choice only when the key is absent', function() {
        /* With a value stored there is no way to say "none of these" in
           the config, so offering it makes an unrepresentable state
           reachable by a stray click. */
        const options = [{value: 'a', label: 'A'}, {value: 'b', label: 'B'}];
        expect(build({widget: 'select', options}, undefined).control.options.length)
            .toBe(3);
        const stored = build({widget: 'select', options}, 'b');
        expect(stored.control.options.length).toBe(2);
        expect(stored.control.value).toBe('b');
    });

    it('labels an option by its label and writes its value', function() {
        const options = [{value: 'draft', label: 'Not ready'}];
        const {widget, control} = build({widget: 'select', options}, 'draft');
        expect(control.options[0].textContent).toBe('Not ready');
        expect(widget.value()).toBe('draft');
    });

    // --- list -----------------------------------------------------------------

    it('reads a list one per line, trimmed, with blanks dropped', function() {
        /* The separator is a newline and every textarea ends with one,
           so a trailing blank would become an empty tag on every save. */
        const {widget, control} = build({widget: 'list'}, ['one', 'two']);
        expect(control.value).toBe('one\ntwo');
        control.value = ' one \n\n two\n';
        expect(widget.value()).toEqual(['one', 'two']);
    });

    it('gives an emptied list [] and an absent one undefined', function() {
        const {widget, control} = build({widget: 'list'}, ['one']);
        control.value = '';
        expect(widget.value()).toEqual([]);
        expect(build({widget: 'list'}, undefined).widget.value()).toBe(undefined);
    });

    it('shows whatever the list held, numbers included', function() {
        expect(build({widget: 'list'}, [1, 2]).control.value).toBe('1\n2');
    });

    it('says how a list is separated', function() {
        /* A textarea of tags is otherwise a guess between newlines and
           commas, and guessing commas writes one tag containing all of
           them. */
        const {node} = build({widget: 'list'}, ['one']);
        expect(node.querySelector('.ct-cms__field-hint').textContent)
            .toBe('One per line.');
    });

    // --- image -----------------------------------------------------------------

    it('previews the path, and repaints as it is typed', function() {
        /* The preview IS the widget. A wrong path is invisible in a text
           box until somebody looks at the built site. */
        const {node, control} = build({widget: 'image'}, '/images/a.png');
        const preview = node.querySelector('.ct-cms__field-preview');
        expect(preview.hidden).toBe(false);
        expect(preview.getAttribute('src')).toBe('/images/a.png');

        control.value = '/images/b.png';
        control.dispatchEvent(new Event('input'));
        expect(preview.getAttribute('src')).toBe('/images/b.png');

        control.value = '';
        control.dispatchEvent(new Event('input'));
        expect(preview.hidden).toBe(true);
    });

    it('hides the preview when there is no path to show', function() {
        const {node} = build({widget: 'image'}, undefined);
        expect(node.querySelector('.ct-cms__field-preview').hidden).toBe(true);
    });

    // --- the unknown widget -------------------------------------------------

    it('refuses to guess at a widget it does not know', function() {
        /* `widget: strng` is a config somebody will ship. Falling back to
           `string` would let a structured field be flattened to text and
           written back that way. */
        const {widget, node, control} = build({widget: 'strng'}, {deep: true});
        expect(control.readOnly).toBe(true);
        expect(control.value).toBe('{"deep":true}');
        expect(node.textContent).toContain('strng');
        // Untouched, whatever it is: the key passes straight through.
        expect(widget.value()).toBe(undefined);
    });

    it('does not block a save on a field nobody can fill in', function() {
        /* The person in front of it can fix neither the config nor the
           control, and a form they cannot submit stops them saving the
           body too. */
        const {widget} = build({widget: 'strng', required: true}, undefined);
        expect(widget.validate()).toBe(null);
    });

    it('shows an unknown widget an empty box for an absent value', function() {
        expect(build({widget: 'strng'}, undefined).control.value).toBe('');
        expect(build({widget: 'strng'}, null).control.value).toBe('');
    });

    // --- validation -------------------------------------------------------------

    it('names the field that is required and empty', function() {
        const {widget, node} = build({required: true, label: 'Headline'}, undefined);
        expect(widget.validate()).toBe('Headline is required.');
        const error = node.querySelector('.ct-cms__field-error');
        expect(error.hidden).toBe(false);
        expect(error.textContent).toBe('Headline is required.');
    });

    it('clears the message once the field is filled', function() {
        /* `validate()` is what puts the message under its own control,
           so it has to take it away too -- a stale complaint under a
           filled field is worse than none. */
        const {widget, control, node} = build({required: true}, undefined);
        widget.validate();
        control.value = 'now filled';
        expect(widget.validate()).toBe(null);
        const error = node.querySelector('.ct-cms__field-error');
        expect(error.hidden).toBe(true);
        expect(error.textContent).toBe('');
    });

    it('complains about a required list, select and date left empty', function() {
        const options = [{value: 'a', label: 'A'}];
        expect(build({widget: 'list', required: true}, undefined).widget.validate())
            .toBe('Title is required.');
        expect(build({widget: 'select', required: true, options}, undefined)
            .widget.validate()).toBe('Title is required.');
        expect(build({widget: 'date', required: true}, undefined).widget.validate())
            .toBe('Title is required.');
        expect(build({widget: 'number', required: true}, undefined).widget.validate())
            .toBe('Title is required.');
    });

    it('accepts a required field that has a value', function() {
        expect(build({required: true}, 'Set').widget.validate()).toBe(null);
        expect(build({widget: 'number', required: true}, 0).widget.validate()).toBe(null);
        expect(build({widget: 'list', required: true}, ['a']).widget.validate())
            .toBe(null);
    });

    // --- the row ------------------------------------------------------------------

    it('marks a required field in the label and on the control', function() {
        /* The asterisk and the attribute, so the accessibility tree
           agrees with what is on screen. */
        const {node, control} = build({required: true, label: 'Headline'}, undefined);
        expect(node.querySelector('.ct-cms__field-label').textContent)
            .toBe('Headline *');
        expect(control.hasAttribute('required')).toBe(true);
    });

    it('ties the label to its control', function() {
        // Without this the label is decoration: clicking it focuses nothing.
        const {node, control} = build({name: 'weight', widget: 'number'}, 1);
        const label = node.querySelector('.ct-cms__field-label');
        expect(label.getAttribute('for')).toBe(control.id);
        expect(control.id).not.toBe('');
    });

    it('starts with the error hidden', function() {
        const {node} = build({required: true}, undefined);
        expect(node.querySelector('.ct-cms__field-error').hidden).toBe(true);
    });

    // --- the registry -----------------------------------------------------------------

    it('ships a widget for every name the config documents', function() {
        for (const name of ['string', 'text', 'number', 'boolean', 'date',
                            'datetime', 'select', 'list', 'image', UNKNOWN_WIDGET]) {
            expect(typeof DEFAULT_WIDGETS[name]).toBe('function');
        }
    });

    it('uses a registry a site supplies', function() {
        const registry = {
            ...DEFAULT_WIDGETS,
            colour: doc => ({
                node: doc.createElement('div'),
                value: () => '#fff',
                validate: () => null
            })
        };
        const widget = buildWidget(document, field({widget: 'colour'}), undefined,
                                   registry);
        expect(widget.value()).toBe('#fff');
    });

    it('falls back to the registry\'s OWN unknown widget', function() {
        /* A site that overrides `unknown` is saying how it wants an
           unrecognised field shown; reaching past it to ours would
           ignore that. */
        const registry = {
            [UNKNOWN_WIDGET]: doc => ({
                node: doc.createElement('div'),
                value: () => 'theirs',
                validate: () => null
            })
        };
        expect(buildWidget(document, field({widget: 'nope'}), undefined, registry)
            .value()).toBe('theirs');
    });

    it('falls back to ours when a registry has no unknown widget at all', function() {
        /* A registry is a plain object a host page writes, so it can
           simply not have the key. Throwing here would take the whole
           entry down over one mistyped widget name. */
        const {value} = buildWidget(document, field({widget: 'nope'}), 'x', {});
        expect(value()).toBe(undefined);
    });
});
