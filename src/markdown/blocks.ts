/**
 * Which markdown blocks the editor can represent, and which it cannot.
 *
 * Markdown mode constrains the editor so that everything it CAN produce is
 * markdown-expressible. This module answers the other half: not everything
 * markdown can express is something the editor can edit. A footnote
 * definition, a raw HTML block and a Hugo shortcode are all valid markdown
 * and none of them is rich text.
 *
 * Those become `ContentEdit.Static` blocks -- visible, not focusable, not
 * movable -- and because a static block can only be removed, never edited,
 * its source bytes always survive a round trip untouched.
 *
 * The classification lives here rather than in either walker so that the two
 * cannot disagree about it. A block the HTML walker renders static and the
 * DOM walker tries to re-serialize would silently rewrite the user's file.
 */

import type {Node, Parent} from './types.js';

/**
 * Template-language blocks that parse as ordinary markdown text but are not
 * text: Hugo's `{{< … >}}` and `{{% … %}}`, and Liquid's `{% … %}` (Jekyll,
 * Eleventy). A paragraph consisting of nothing else is one of these.
 *
 * Anchored at both ends deliberately. A shortcode in the MIDDLE of a
 * sentence is genuinely inline and is left as text -- treating the whole
 * paragraph as static there would make the surrounding prose uneditable.
 */
const SHORTCODE = /^(?:\{\{[<%][\s\S]*[>%]\}\}|\{%[\s\S]*%\})$/;

/**
 * The inline node types the HTML walker can render and the DOM walker can
 * read back. One list, consulted by the classifier below and mirrored by
 * the switch in `to-html.ts`.
 *
 * What is NOT here matters more than what is. `footnoteReference` (`[^1]`),
 * `linkReference` (`[ref]`) and `imageReference` have no HTML the editor
 * can offer -- there is no footnote tool and no reference-link tool -- so
 * rendering them would drop the reference and write the paragraph back
 * without it. A corpus round trip caught exactly that, silently, which is
 * why the check is a whitelist: an inline type nobody has thought about
 * makes its block read-only instead of making its content disappear.
 *
 * Inline `html` is excluded for the same reason: `<span class="x">a</span>`
 * would come back as bare `a`.
 */
const PHRASING: ReadonlySet<string> = new Set([
    'text',
    'strong',
    'emphasis',
    'delete',
    'inlineCode',
    'break',
    'link',
    'image'
]);

/** True if every inline node in `nodes` can make the round trip. */
function isRepresentablePhrasing(nodes: Node[]): boolean {
    return (nodes || []).every((node) => {
        if (!PHRASING.has(node.type)) {
            return false;
        }
        const children = (node as Parent).children;
        return !children || isRepresentablePhrasing(children);
    });
}

/** Text content of a phrasing subtree, for shortcode matching. */
function plainText(node: Node): string {
    if (typeof node.value === 'string') {
        return node.value;
    }
    const children = (node as Parent).children;
    if (!children) {
        return '';
    }
    return children.map(plainText).join('');
}

/**
 * A list item the editor can represent: one paragraph, optionally followed
 * by one nested list. That is exactly what `ContentEdit.ListItem` is --
 * a `ListItemText` and an optional child `List` -- so anything else (two
 * paragraphs, a code block, a blockquote) has no home in the element tree.
 */
function isRepresentableListItem(item: Parent): boolean {
    const children = item.children || [];
    if (children.length === 0 || children.length > 2) {
        return false;
    }
    if (children[0].type !== 'paragraph') {
        return false;
    }
    if (children.length === 2 && children[1].type !== 'list') {
        return false;
    }
    if (children.length === 2 && !isRepresentable(children[1])) {
        return false;
    }
    if (!isRepresentablePhrasing((children[0] as Parent).children)) {
        return false;
    }
    // A task-list item carries a checkbox markdown can write but the editor
    // has no control for, so editing the text would silently drop it.
    return (item.checked === null) || (item.checked === undefined);
}

/** True if the editor can render `node` as something the user can edit. */
export function isRepresentable(node: Node): boolean {
    switch (node.type) {
    case 'paragraph':
        // A shortcode paragraph is markup, not prose.
        return !SHORTCODE.test(plainText(node).trim())
            && isRepresentablePhrasing((node as Parent).children);

    case 'heading':
        return isRepresentablePhrasing((node as Parent).children);

    case 'code':
        // Plain text by definition, so there is no phrasing to check.
        return true;

    case 'table': {
        const rows = (node as Parent).children || [];
        return rows.every((row) => ((row as Parent).children || []).every(
            (cell) => isRepresentablePhrasing((cell as Parent).children)));
    }

    case 'blockquote': {
        // `ContentEdit.Text` holds inline content, so a blockquote is
        // editable only when it is one paragraph. A multi-paragraph quote
        // would have to flatten, which loses the paragraph breaks.
        const children = (node as Parent).children || [];
        return children.length === 1
            && children[0].type === 'paragraph'
            && isRepresentablePhrasing((children[0] as Parent).children);
    }

    case 'list': {
        const children = (node as Parent).children || [];
        return children.length > 0 && children.every(
            (item) => item.type === 'listItem' && isRepresentableListItem(item as Parent));
    }

    default:
        // thematicBreak, html, definition, footnoteDefinition, yaml, and
        // anything a future extension introduces. Unknown means static,
        // which is the safe direction to fail in: the block survives
        // byte-identically instead of being guessed at.
        return false;
    }
}
