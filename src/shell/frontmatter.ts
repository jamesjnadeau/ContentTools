/* Turning a form's answers back into frontmatter, without losing the rest.
 *
 * Two rules, and the whole sub-phase hangs on them.
 *
 * THE FILE IS NOT THE FORM. A markdown file's frontmatter belongs to the
 * site, not to this tool: `layout:`, `aliases:`, `weight:`, whatever the
 * generator reads. The config declares the handful of keys somebody should
 * be able to EDIT, and a merge that started from the form would delete
 * every other one -- days later, when a page stops rendering and nobody
 * connects it to a typo fix. So the merge starts from the parsed data, in
 * its own key order, and writes only the keys the form actually answered.
 *
 * AND MOST SAVES MUST NOT TOUCH IT AT ALL. `MarkdownDocument.update`
 * preserves the original block byte for byte when it is not given new
 * data -- comments, key order, quoting style, none of which survives a
 * YAML round trip. `frontmatterChanged` is what decides whether to hand it
 * any, so a save that only edited the body produces a diff in the body.
 */

/** The values a form reported, keyed by field name. */
export type FieldValues = Readonly<Record<string, unknown>>;

/** A frontmatter block the shell may write over. */
export function isMergeable(data: unknown): data is Record<string, unknown> | null {
    return data === null || data === undefined || isPlainObject(data);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && !(value instanceof Date);
}

/**
 * The form's answers applied over what the file already held.
 *
 * `undefined` from a widget means "this key was absent and still is", so
 * the key is not created. Every other value is written, including `''`,
 * `null` and `[]` -- those are a person clearing a field, which is an
 * edit, and deleting the key instead would be a different one.
 */
export function mergeFrontmatter(data: unknown, values: FieldValues): Record<string, unknown> {
    const out: Record<string, unknown> = isPlainObject(data) ? {...data} : {};
    for (const [name, value] of Object.entries(values)) {
        if (value !== undefined) {
            out[name] = value;
        }
    }
    return out;
}

/**
 * Whether `merged` says anything the file does not already say.
 *
 * The empty case is its own answer rather than a consequence: a file with
 * no frontmatter and a form nobody filled in must stay a file with no
 * frontmatter, not gain an empty `---\n---` block that every later diff
 * carries.
 */
export function frontmatterChanged(data: unknown, merged: Record<string, unknown>): boolean {
    if (!isPlainObject(data)) {
        return Object.keys(merged).length > 0;
    }
    return !sameValue(data, merged);
}

/**
 * Deep equality, over what YAML can hold.
 *
 * Not `JSON.stringify` on both sides: it is key-order sensitive, and the
 * merge preserves the file's order while a form has its own -- so two
 * identical sets of keys written in different orders would compare
 * different and rewrite the block on every save. Dates are compared by
 * their instant, because `yaml` resolves an unquoted date to a `Date` and
 * a re-read of the same file produces a different object.
 */
function sameValue(a: unknown, b: unknown): boolean {
    if (a instanceof Date || b instanceof Date) {
        return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        /* No own-property check beside the key count, and one was
           written and removed: with the counts equal, a key of `a` that
           `b` lacks reads back as `undefined` and compares unequal to
           whatever `a` holds. The single case that would need it -- both
           sides holding an explicit `undefined` under different names --
           cannot arise, because `yaml` never produces one and
           `mergeFrontmatter` is the only other source and skips them. */
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length
            && keys.every(key => sameValue(a[key], b[key]));
    }
    /* Two values of DIFFERENT shapes land here and are unequal, which is
       what each branch above being `&&` rather than `||` relies on. The
       `||` spellings were written first and mutation testing could not
       kill either: a list against a scalar, or a mapping against one,
       reaches this line and gets the same answer with less code between
       it and the reader. */
    return a === b;
}
