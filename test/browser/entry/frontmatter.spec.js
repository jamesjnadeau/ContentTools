import {
    frontmatterChanged, isMergeable, mergeFrontmatter
} from '../../../src/entry/frontmatter.js';

/* Whether a save touches the frontmatter block at all, and what it writes
 * when it does.
 *
 * Both halves fail silently and both fail in the repository rather than on
 * the screen. A merge that starts from the form deletes the keys the
 * config never declared -- `layout:` disappears and a page stops rendering
 * days after the typo fix that did it. And a change predicate that says
 * "yes" when nothing changed rewrites the block through a YAML round trip
 * on every save: comments gone, key order sorted, quoting normalised, and
 * a whole-file diff in a pull request whose reason for existing is that
 * somebody can read it.
 */

describe('mergeFrontmatter', function() {

    it('keeps keys the config never declared', function() {
        /* The single highest-value assertion in the widget work. The file
           belongs to the site, not to this tool: the generator reads
           `layout` and `aliases` and the form has never heard of either. */
        const merged = mergeFrontmatter(
            {layout: 'post', title: 'Old', aliases: ['/old/']},
            {title: 'New'});
        expect(merged).toEqual({layout: 'post', title: 'New', aliases: ['/old/']});
    });

    it('keeps the file\'s key order, not the form\'s', function() {
        const merged = mergeFrontmatter({b: 1, a: 1}, {a: 2, c: 3});
        expect(Object.keys(merged)).toEqual(['b', 'a', 'c']);
    });

    it('does not create a key a widget reported as absent', function() {
        /* `undefined` is "was not there and still is not". The KEYS are
           asserted, not the object: `toEqual` ignores a property whose
           value is undefined, so `{draft: undefined}` compares equal to
           no `draft` at all while making `frontmatterChanged` true and
           `yaml` write `draft: null` into the file. */
        const merged = mergeFrontmatter({title: 'Hi'}, {title: 'Hi', draft: undefined});
        expect(Object.keys(merged)).toEqual(['title']);
        expect(frontmatterChanged({title: 'Hi'}, merged)).toBe(false);
    });

    it('writes an empty value, because clearing a field is an edit', function() {
        /* `''`, `null` and `[]` are somebody emptying a control. Treating
           them as "absent" would silently refuse to clear anything. */
        expect(mergeFrontmatter({a: 'x', b: 1, c: ['t']}, {a: '', b: null, c: []}))
            .toEqual({a: '', b: null, c: []});
    });

    it('starts from an empty object when the file had no frontmatter', function() {
        expect(mergeFrontmatter(null, {title: 'First'})).toEqual({title: 'First'});
        expect(mergeFrontmatter(undefined, {title: 'First'})).toEqual({title: 'First'});
    });

    it('does not mutate the parsed data', function() {
        // The document keeps this object; a save must not edit it in place.
        const data = {title: 'Old'};
        mergeFrontmatter(data, {title: 'New'});
        expect(data).toEqual({title: 'Old'});
    });
});

describe('frontmatterChanged', function() {

    it('is false when every value is the same', function() {
        expect(frontmatterChanged({a: 1, b: 'x'}, {a: 1, b: 'x'})).toBe(false);
    });

    it('is false when only the key ORDER differs', function() {
        /* Not `JSON.stringify` on both sides. The merge preserves the
           file's order and a form has its own, so an order-sensitive
           comparison would rewrite the block on every single save. */
        expect(frontmatterChanged({a: 1, b: 2}, {b: 2, a: 1})).toBe(false);
    });

    it('is true when a value differs, a key arrives, or a key goes', function() {
        expect(frontmatterChanged({a: 1}, {a: 2})).toBe(true);
        expect(frontmatterChanged({a: 1}, {a: 1, b: 2})).toBe(true);
        expect(frontmatterChanged({a: 1, b: 2}, {a: 1})).toBe(true);
    });

    it('compares dates by their instant', function() {
        /* `yaml` resolves an unquoted `2024-01-02` to a `Date`, so a
           re-read of the same file produces a different object every
           time. Identity comparison would rewrite it on every save. */
        expect(frontmatterChanged(
            {at: new Date('2024-01-02T00:00:00Z')},
            {at: new Date('2024-01-02T00:00:00Z')})).toBe(false);
        expect(frontmatterChanged(
            {at: new Date('2024-01-02T00:00:00Z')},
            {at: new Date('2024-01-03T00:00:00Z')})).toBe(true);
        // And a date against a string of it is a real change, not a match.
        expect(frontmatterChanged(
            {at: new Date('2024-01-02T00:00:00Z')}, {at: '2024-01-02'})).toBe(true);
    });

    it('compares lists by order and length', function() {
        expect(frontmatterChanged({t: ['a', 'b']}, {t: ['a', 'b']})).toBe(false);
        expect(frontmatterChanged({t: ['a', 'b']}, {t: ['b', 'a']})).toBe(true);
        expect(frontmatterChanged({t: ['a']}, {t: ['a', 'b']})).toBe(true);
        // A list and a scalar are not equal however they print.
        expect(frontmatterChanged({t: ['a']}, {t: 'a'})).toBe(true);
    });

    it('compares nested mappings, not just the top level', function() {
        expect(frontmatterChanged({a: {b: {c: 1}}}, {a: {b: {c: 1}}})).toBe(false);
        expect(frontmatterChanged({a: {b: {c: 1}}}, {a: {b: {c: 2}}})).toBe(true);
        // A mapping and a scalar are not equal either.
        expect(frontmatterChanged({a: {b: 1}}, {a: 'b'})).toBe(true);
    });

    it('is false for a file with no frontmatter and an empty form', function() {
        /* The case that decides whether a legacy `.md` gains an empty
           `---\n---` block that every later diff then carries. */
        expect(frontmatterChanged(null, {})).toBe(false);
        expect(frontmatterChanged(undefined, {})).toBe(false);
    });

    it('is true for a file with no frontmatter once something is filled in', function() {
        expect(frontmatterChanged(null, {title: 'First'})).toBe(true);
    });
});

describe('isMergeable', function() {

    it('accepts a mapping, and a block that is absent or empty', function() {
        expect(isMergeable({a: 1})).toBe(true);
        expect(isMergeable(null)).toBe(true);
        expect(isMergeable(undefined)).toBe(true);
    });

    it('refuses anything that is not a set of keys', function() {
        /* `---\n- one\n- two\n---` parses to an array, and `---\n42\n---`
           to a number. Writing a merged mapping over either replaces
           content nobody has read. */
        expect(isMergeable(['one'])).toBe(false);
        expect(isMergeable(42)).toBe(false);
        expect(isMergeable('text')).toBe(false);
        expect(isMergeable(new Date())).toBe(false);
    });
});
