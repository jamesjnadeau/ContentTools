/**
 * HTML -> mdast, the inverse of `to-html.ts`.
 *
 * The input is whatever `region.html()` hands a consumer in `saved`, so it
 * is HTML written by ContentEdit rather than by this package: pretty-printed
 * with newlines and indentation between blocks, with `<b>`/`<i>` from the
 * tools and possibly `<strong>`/`<em>` from a paste. Both are accepted.
 *
 * Parsing goes through `rootContext().createSandboxDocument()` -- the same
 * seam `HTMLCleaner` uses -- rather than a string parser, because the
 * browser's own parser is the only thing guaranteed to agree with the one
 * that produced the markup.
 */

import {rootContext} from '../core/root-context.js';
import {SOURCE_ATTRIBUTE, LANGUAGE_ATTRIBUTE} from './to-html.js';
import type {Node, Parent} from './types.js';

/** A block recovered from the edited HTML. */
export interface EditedBlock {
    /**
     * The source block this came from, or null if the user created it.
     *
     * Read from the marker `to-html.ts` wrote. A block the user split in
     * two produces two elements claiming the same marker; the second is
     * treated as new, which is both true and the only answer that cannot
     * corrupt the first one's bytes.
     */
    index: number | null;
    node: Node;
    /** Verbatim source for a static block, which is never re-serialized. */
    verbatim: boolean;
}

function text(value: string): Node {
    return {type: 'text', value};
}

function parent(type: string, children: Node[], extra?: Record<string, unknown>): Parent {
    return {type, children, ...(extra || {})} as Parent;
}

// --- inline --------------------------------------------------------------

function inlineChildren(node: ParentNode): Node[] {
    const out: Node[] = [];
    for (const child of Array.from(node.childNodes)) {
        collectInline(child, out);
    }
    return normalise(mergeText(out));
}

/* Whitespace, as HTML means it.
 *
 * `region.html()` is pretty-printed: ContentEdit puts every block's
 * content on its own line and indents it, so the text node inside a `<p>`
 * is really `"\n    Some prose\n"`. A browser renders that as
 * `"Some prose"` -- runs of whitespace collapse to a single space, and a
 * block's leading and trailing whitespace disappears -- and markdown
 * means exactly the same thing by it.
 *
 * Taking it literally instead turns the pretty-printer's indentation into
 * content, which is what the first version of this module did: every
 * paragraph came back as an indented code block and every list item grew
 * four levels of nesting. Nothing in the pure-string tests could see it,
 * because none of them had been through a real region.
 *
 * `<pre>` is the one exception, and it never comes through here --
 * `blockFrom` reads its `textContent` directly.
 */
const WHITESPACE = /[\t\n\r ]+/g;

/**
 * Apply HTML's whitespace rules to one level of inline content.
 *
 * Collapse runs, then trim at the two ends. Content nested inside an
 * inline element is normalised by that element's own `inlineChildren`
 * call, so this only ever needs to look at the list it is handed.
 *
 * Three richer versions were written before this one and all three were
 * code no test could fail: descending into nested children (already done
 * by the nested call), trimming either side of a `<br>`, and pruning
 * inline elements the trim had emptied. Inside a paragraph ContentEdit's
 * serializer never puts whitespace next to an inline tag and
 * `HTMLString.optimize()` drops empty ones, so none of those cases can
 * arrive. What this has to handle is bounded by `region.spec.js` and
 * `table-strong.spec.js`, which feed it nothing but real `region.html()`.
 *
 * A table cell is the exception to "never next to an inline tag": it is
 * pretty-printed as `<td>\n    <strong>...`, so its first text node is
 * all whitespace and the trim leaves it empty. That empty node has to go.
 * mdast-util-to-markdown encodes the character before a strong run that
 * opens on punctuation, and the last character of '' is `charCodeAt(-1)`,
 * NaN -- which it writes as `&#xNAN;`. The same mismatch made `sameBlock()`
 * report every such table changed, so a save rewrote tables nobody had
 * touched.
 */
function normalise(nodes: Node[]): Node[] {
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.type !== 'text') {
            continue;
        }
        let value = String(node.value).replace(WHITESPACE, ' ');
        if (i === 0) {
            value = value.replace(/^ /, '');
        }
        if (i === nodes.length - 1) {
            value = value.replace(/ $/, '');
        }
        node.value = value;
    }

    return nodes.filter(node => node.type !== 'text' || node.value !== '');
}

/** Adjacent text nodes serialize differently from one; merge them. */
function mergeText(nodes: Node[]): Node[] {
    const out: Node[] = [];
    for (const node of nodes) {
        const last = out[out.length - 1];
        if (node.type === 'text' && last && last.type === 'text') {
            last.value = String(last.value) + String(node.value);
        } else {
            out.push(node);
        }
    }
    return out;
}

function collectInline(node: ChildNode, out: Node[]): void {
    if (node.nodeType === 3) {
        // Node.TEXT_NODE. Named by number because this module runs against
        // a sandbox document, whose `Node` constant is not in scope here.
        out.push(text(node.nodeValue || ''));
        return;
    }
    if (node.nodeType !== 1) {
        return;
    }

    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    switch (tag) {
    case 'b':
    case 'strong':
        out.push(parent('strong', inlineChildren(element)));
        return;
    case 'i':
    case 'em':
        out.push(parent('emphasis', inlineChildren(element)));
        return;
    case 'del':
    case 's':
    case 'strike':
        out.push(parent('delete', inlineChildren(element)));
        return;
    case 'code':
        out.push({type: 'inlineCode', value: element.textContent || ''});
        return;
    case 'br':
        out.push({type: 'break'});
        return;
    case 'a':
        out.push(parent('link', inlineChildren(element), {
            url: element.getAttribute('href') || '',
            title: element.getAttribute('title') || null
        }));
        return;
    case 'img':
        out.push({
            type: 'image',
            url: element.getAttribute('src') || '',
            alt: element.getAttribute('alt') || '',
            title: element.getAttribute('title') || null
        });
        return;
    default:
        /* An unrecognised inline tag. Its CHILDREN are kept and the tag
           itself dropped, which matches what `HTMLCleaner` does to a
           non-whitelisted tag -- unwrap, never delete, so no text is ever
           silently lost. */
        for (const child of Array.from(element.childNodes)) {
            collectInline(child, out);
        }
    }
}

// --- blocks --------------------------------------------------------------

function listItems(element: Element): Node[] {
    const items: Node[] = [];
    for (const li of Array.from(element.children)) {
        if (li.tagName.toLowerCase() !== 'li') {
            continue;
        }
        // Split the item into its own inline content and any nested list.
        const nested = Array.from(li.children).find(
            (child) => ['ul', 'ol'].indexOf(child.tagName.toLowerCase()) > -1);
        const inlineNodes: Node[] = [];
        for (const child of Array.from(li.childNodes)) {
            if (child === nested) {
                continue;
            }
            collectInline(child, inlineNodes);
        }
        const children: Node[] = [parent('paragraph', normalise(mergeText(inlineNodes)))];
        if (nested) {
            children.push(listFrom(nested));
        }
        items.push(parent('listItem', children, {spread: false, checked: null}));
    }
    return items;
}

function listFrom(element: Element): Node {
    const ordered = element.tagName.toLowerCase() === 'ol';
    const start = element.getAttribute('start');
    return parent('list', listItems(element), {
        ordered,
        start: ordered ? (start ? Number(start) : 1) : null,
        spread: false
    });
}

function tableFrom(element: Element): Node {
    const rows: Node[] = [];
    const align: (string | null)[] = [];

    for (const tr of Array.from(element.querySelectorAll('tr'))) {
        const cells: Node[] = [];
        for (const cell of Array.from(tr.children)) {
            const tag = cell.tagName.toLowerCase();
            if (tag !== 'td' && tag !== 'th') {
                continue;
            }
            if (tag === 'th') {
                align[cells.length] = cell.getAttribute('align') || null;
            }
            cells.push(parent('tableCell', inlineChildren(cell)));
        }
        rows.push(parent('tableRow', cells));
    }

    /* GFM has no footer, and the head is always the first row, so a table
       is just its rows in document order -- which `querySelectorAll('tr')`
       already gives regardless of how thead/tbody/tfoot are arranged. */
    return parent('table', rows, {align});
}

function blockFrom(element: Element): Node | null {
    const tag = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
        return parent('heading', inlineChildren(element), {
            depth: Number(tag.slice(1))
        });
    }

    switch (tag) {
    case 'p':
        return parent('paragraph', inlineChildren(element));
    case 'blockquote':
        return parent('blockquote', [parent('paragraph', inlineChildren(element))]);
    case 'pre':
        return {
            type: 'code',
            lang: element.getAttribute(LANGUAGE_ATTRIBUTE) || null,
            meta: null,
            value: element.textContent || ''
        };
    case 'ul':
    case 'ol':
        return listFrom(element);
    case 'table':
        return tableFrom(element);
    case 'img':
        // A bare image is a block in the editor (`ContentEdit.Image`) but
        // a paragraph containing an image in markdown.
        return parent('paragraph', [{
            type: 'image',
            url: element.getAttribute('src') || '',
            alt: element.getAttribute('alt') || '',
            title: element.getAttribute('title') || null
        }]);
    default:
        return null;
    }
}

/** Read the edited region's HTML back into blocks. */
export function fromHTML(html: string): EditedBlock[] {
    const sandbox = rootContext().createSandboxDocument();
    const wrapper = sandbox.createElement('div') as HTMLElement;
    wrapper.innerHTML = html;

    const blocks: EditedBlock[] = [];
    const claimed = new Set<number>();

    for (const element of Array.from(wrapper.children)) {
        const marker = element.getAttribute(SOURCE_ATTRIBUTE);
        let index: number | null = marker === null ? null : Number(marker);
        if (index !== null && (Number.isNaN(index) || claimed.has(index))) {
            index = null;
        }
        if (index !== null) {
            claimed.add(index);
        }

        if (element.getAttribute('data-ce-tag') === 'static') {
            /* A static block carries no re-serializable content -- it is
               shown read-only precisely because the editor cannot model
               it. Its bytes come from the source, so all that is needed
               here is that it was seen and where it now sits. */
            blocks.push({index, node: {type: 'html', value: ''}, verbatim: true});
            continue;
        }

        const node = blockFrom(element);
        if (node) {
            blocks.push({index, node, verbatim: false});
        }
    }

    return blocks;
}
