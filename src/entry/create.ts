/* How a new entry is named, and what it starts as.
 *
 * Here rather than in `src/shell/` because two surfaces name entries --
 * the management screens and the site's own page -- and they must agree
 * on every part of it: which collections can be added to, what filename a
 * typed name becomes, and what the file holds before anybody has written
 * a word. A second spelling of any of it is how one surface comes to
 * offer a name the other turns away, or to write a stub the other would
 * not have.
 */
import {entryPath, expandSlug, slugify} from '../cms/config.js';
import type {Collection, Field, FolderCollection} from '../cms/config.js';
import {MarkdownDocument} from '../markdown/document.js';
import {fieldDefaults} from './frontmatter.js';

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

/**
 * The document a new entry starts from.
 *
 * The defaults go into the SOURCE, not into the form beside it. A
 * form seeded separately would be a second description of what the
 * file holds, and the byte-preserving comparison -- which asks
 * whether the form now says something the file does not -- would be
 * comparing the form against a document that never had them.
 *
 * `title` is what the person typed when naming the entry, for a surface
 * that has no form to retype it into. It seeds a `title` field only when
 * that is unambiguous -- a string field the config gave no default -- so
 * a collection that spells its headline differently, or wants "Untitled"
 * until somebody says otherwise, is not second-guessed.
 */
export function blankDocument(fields: readonly Field[], title?: string): MarkdownDocument {
    const blank = MarkdownDocument.parse('');
    let values = fieldDefaults(fields);

    const typed = title?.trim() ?? '';
    const titleField = fields.find(f => f.name === 'title');
    if (typed !== '' && titleField?.widget === 'string' && titleField.default === undefined) {
        /* First, so the file reads the way a person would write it,
           whatever order the other defaults come in. */
        values = {title: typed, ...values};
    }

    /* No keys, no block. A collection whose fields declare no
       defaults must not give every new entry an empty `---\n---`
       for every later diff to carry. */
    return Object.keys(values).length === 0
        ? blank
        : MarkdownDocument.parse(blank.update('', {frontmatter: values}));
}
