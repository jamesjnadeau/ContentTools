import {buildFields} from '../../../src/entry/fields.js';
import {DEFAULT_WIDGETS} from '../../../src/entry/widgets.js';

/* The form as a whole: when it is rebuilt, when it refuses, and what it
 * reports.
 *
 * The rebuild rule is the one with teeth. The frame re-renders on every
 * state change -- a save starting, a notice arriving, a pull request
 * appearing -- and rebuilding the controls each time destroys the caret in
 * whichever one somebody is typing into, along with everything they had
 * typed. The widgets are also the only place the current answers live, so
 * a rebuild is data loss rather than a flicker.
 */

function field(over = {}) {
    return {
        name: 'title', label: 'Title', widget: 'string',
        required: false, options: [], default: undefined, ...over
    };
}

function state(over = {}) {
    return {key: 'blog/hello', fields: [field()], data: {}, refusal: null, ...over};
}

/** The controls currently on screen, in order. */
function controls(view) {
    return [...view.node.querySelectorAll('input, textarea, select')];
}

describe('the frontmatter form', function() {

    // --- when it rebuilds -------------------------------------------------

    it('keeps the SAME control across a re-render of the same entry', function() {
        /* Node identity, not a count. A rebuild that happens to produce
           the same number of inputs has still thrown away the caret and
           whatever was half-typed into it. */
        const view = buildFields(document);
        view.update(state());
        const before = controls(view)[0];
        before.value = 'half typed';

        view.update(state());
        expect(controls(view)[0]).toBe(before);
        expect(controls(view)[0].value).toBe('half typed');
    });

    it('keeps it across a re-render that re-pins the entry', function() {
        /* A save replaces the `Entry` object with a copy pinned to the
           new commit. Keying on identity would rebuild the form -- and
           lose focus -- on every press of Submit, which is why the key
           is `collection/slug`. */
        const view = buildFields(document);
        view.update(state({data: {title: 'Hello'}}));
        const before = controls(view)[0];
        view.update(state({data: {title: 'Hello'}}));
        expect(controls(view)[0]).toBe(before);
    });

    it('rebuilds for a different entry', function() {
        const view = buildFields(document);
        view.update(state({data: {title: 'One'}}));
        const before = controls(view)[0];
        view.update(state({key: 'blog/two', data: {title: 'Two'}}));
        expect(controls(view)[0]).not.toBe(before);
        expect(controls(view)[0].value).toBe('Two');
    });

    // --- what it shows ------------------------------------------------------

    it('renders one control per declared field, in order', function() {
        const view = buildFields(document);
        view.update(state({
            fields: [field({name: 'title'}), field({name: 'weight', widget: 'number'})],
            data: {title: 'Hello', weight: 3}
        }));
        expect(controls(view).map(c => c.value)).toEqual(['Hello', '3']);
    });

    it('tells a key written with no value from a key that is not there', function() {
        /* `title:` parses to null and is PRESENT. A widget told it was
           absent would report it as still absent, so clearing it -- or
           in this case filling it -- would never be written. */
        const view = buildFields(document);
        view.update(state({fields: [field(), field({name: 'other'})],
                           data: {title: null}}));
        expect(view.values()).toEqual({title: '', other: undefined});
    });

    it('treats frontmatter that is not a mapping as no values at all', function() {
        /* The refusal is the shell's job; if one is somehow not set the
           form must still not invent keys out of a list. */
        const view = buildFields(document);
        view.update(state({data: ['one', 'two']}));
        expect(view.values()).toEqual({title: undefined});
    });

    it('hides itself for a collection that declares no fields', function() {
        // An empty panel above every entry, saying "Details" and nothing.
        const view = buildFields(document);
        view.update(state({fields: []}));
        expect(view.node.hidden).toBe(true);
    });

    it('hides itself when no entry is open', function() {
        const view = buildFields(document);
        view.update(state());
        expect(view.node.hidden).toBe(false);
        view.update(null);
        expect(view.node.hidden).toBe(true);
        expect(controls(view).length).toBe(0);
    });

    it('rebuilds after being hidden, rather than showing the last entry\'s form',
       function() {
        /* Closing an entry and reopening the same one is the case: if
           the key were left set, the stale controls would come back
           holding whatever the last session typed. */
        const view = buildFields(document);
        view.update(state({data: {title: 'Hello'}}));
        controls(view)[0].value = 'edited but not saved';
        view.update(null);
        view.update(state({data: {title: 'Hello'}}));
        expect(controls(view)[0].value).toBe('Hello');
    });

    // --- refusing ------------------------------------------------------------

    it('shows no controls and says why when the block cannot be used', function() {
        /* Writing a merge over frontmatter the parser could not read
           replaces somebody's broken-but-recoverable YAML with whatever
           the form happened to hold. */
        const view = buildFields(document);
        view.update(state({refusal: 'Could not be read.'}));
        expect(controls(view).length).toBe(0);
        expect(view.node.textContent).toContain('Could not be read.');
        expect(view.node.hidden).toBe(false);
    });

    it('reports no values while refusing, so the caller writes nothing', function() {
        const view = buildFields(document);
        view.update(state({refusal: 'Could not be read.'}));
        expect(view.values()).toBe(null);
        expect(view.errors()).toEqual([]);
    });

    it('shows the refusal even for a collection with no fields', function() {
        /* Otherwise a malformed block on a collection that declares
           nothing is simply invisible, and the person never learns why
           their frontmatter is not being touched. */
        const view = buildFields(document);
        view.update(state({fields: [], refusal: 'Could not be read.'}));
        expect(view.node.hidden).toBe(false);
    });

    it('comes back once a usable entry is opened', function() {
        const view = buildFields(document);
        view.update(state({refusal: 'Could not be read.'}));
        view.update(state({key: 'blog/other', data: {title: 'Fine'}}));
        expect(view.values()).toEqual({title: 'Fine'});
        expect(view.node.textContent).not.toContain('Could not be read.');
    });

    // --- what it reports ---------------------------------------------------------

    it('reports nothing before an entry is loaded', function() {
        expect(buildFields(document).values()).toBe(null);
    });

    it('reports nothing once the entry is closed again', function() {
        /* The shell asks for values on the way to a save, and closing
           an entry is one tick before opening the next. A form still
           answering for the entry that has gone would merge the last
           file's frontmatter into the next one. */
        const view = buildFields(document);
        view.update(state({data: {title: 'Hello'}}));
        expect(view.values()).toEqual({title: 'Hello'});
        view.update(null);
        expect(view.values()).toBe(null);
        return expect(view.errors()).toEqual([]);
    });

    it('collects every field\'s complaint, not just the first', function() {
        /* `validate()` is also what puts the message under its own
           control, so stopping at the first failure would leave the
           second broken field silently unmarked. */
        const view = buildFields(document);
        view.update(state({
            fields: [field({name: 'a', label: 'A', required: true}),
                     field({name: 'b', label: 'B', required: true})],
            data: {}
        }));
        expect(view.errors()).toEqual(['A is required.', 'B is required.']);
        expect(view.node.querySelectorAll('.ct-field__error:not([hidden])').length)
            .toBe(2);
    });

    it('is quiet when every field is satisfied', function() {
        const view = buildFields(document);
        view.update(state({fields: [field({required: true})], data: {title: 'Set'}}));
        expect(view.errors()).toEqual([]);
    });

    // --- the registry -------------------------------------------------------------

    it('asks for the registry at BUILD time, not at construction time', function() {
        /* The frame is built in the element's constructor and a host
           page sets `el.widgets` afterwards. A snapshot taken up front
           would ignore it, silently, for the life of the page. */
        let registry = DEFAULT_WIDGETS;
        const view = buildFields(document, () => registry);
        registry = {
            ...DEFAULT_WIDGETS,
            string: doc => {
                const node = doc.createElement('div');
                node.className = 'mine';
                return {node, value: () => 'from the site', validate: () => null};
            }
        };
        view.update(state());
        expect(view.node.querySelector('.mine')).not.toBe(null);
        expect(view.values()).toEqual({title: 'from the site'});
    });

    it('uses the shipped widgets when no registry is given', function() {
        const view = buildFields(document);
        view.update(state({fields: [field({widget: 'boolean'})], data: {title: true}}));
        expect(controls(view)[0].type).toBe('checkbox');
    });
});
