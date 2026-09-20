/**
 * mdast -> HTML, for the editing surface.
 *
 * This is a bespoke walker rather than `mdast-util-to-hast`. That utility
 * exists to turn arbitrary markdown into arbitrary HTML and carries the
 * heuristics that job needs; here the input is a closed set of node types
 * (markdown mode guarantees it) and the OUTPUT is not arbitrary either --
 * it has to land on the exact tags `ContentEdit` maps to element classes,
 * and it has to be the inverse of `from-dom.ts`. Hand-writing both sides
 * of that pair is what makes the round trip checkable.
 *
 * Two choices worth naming:
 *
 * - `<b>` and `<i>`, not `<strong>` and `<em>`. That is what the bold and
 *   italic tools produce (`tools/bold.ts`, `tools/italic.ts`), so emitting
 *   anything else would make the editor rewrite every emphasis on first
 *   touch. `from-dom.ts` accepts all four.
 * - Each top-level block carries `data-ct-md="<index>"`. That is the
 *   identity the save path matches blocks on -- see `document.ts`.
 */

import type {Node, Parent, SourceBlock} from './types.js';

/** The marker attribute tying a rendered block back to its source block. */
export const SOURCE_ATTRIBUTE = 'data-ct-md';

/** The attribute a fenced code block's language is carried in. */
export const LANGUAGE_ATTRIBUTE = 'data-ct-lang';

function escapeText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
    return escapeText(value).replace(/"/g, '&quot;');
}

function attr(name: string, value: unknown): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    return ` ${name}="${escapeAttribute(String(value))}"`;
}

// --- inline --------------------------------------------------------------

function inline(nodes: Node[]): string {
    return nodes.map(inlineOne).join('');
}

function inlineOne(node: Node): string {
    switch (node.type) {
    case 'text':
        return escapeText(String(node.value ?? ''));

    case 'strong':
        return `<b>${inline((node as Parent).children)}</b>`;

    case 'emphasis':
        return `<i>${inline((node as Parent).children)}</i>`;

    case 'delete':
        return `<del>${inline((node as Parent).children)}</del>`;

    case 'inlineCode':
        return `<code>${escapeText(String(node.value ?? ''))}</code>`;

    case 'break':
        return '<br>';

    case 'link':
        return `<a${attr('href', node.url)}${attr('title', node.title)}>` +
            `${inline((node as Parent).children)}</a>`;

    case 'image':
        return `<img${attr('src', node.url)}` +
            `${attr('alt', node.alt ?? '')}${attr('title', node.title)}>`;

    default:
        /* Unreachable: `blocks.ts` renders any block containing an inline
           type outside its PHRASING list as static, so nothing else gets
           here. Escaping rather than throwing keeps the two lists drifting
           apart from being a crash, and keeps it from injecting markup --
           but a block reaching this branch is a bug in the pairing, not a
           supported path. */
        return escapeText(String(node.value ?? ''));
    }
}

// --- blocks --------------------------------------------------------------

function listItem(item: Parent): string {
    const children = item.children || [];
    const text = inline((children[0] as Parent).children);
    const nested = children[1] ? block(children[1]) : '';
    return `<li>${text}${nested}</li>`;
}

/** One block, WITHOUT the source marker (nested blocks do not carry one). */
function block(node: Node): string {
    switch (node.type) {
    case 'paragraph':
        return `<p>${inline((node as Parent).children)}</p>`;

    case 'heading': {
        const depth = Math.min(Math.max(Number(node.depth) || 1, 1), 6);
        return `<h${depth}>${inline((node as Parent).children)}</h${depth}>`;
    }

    case 'blockquote': {
        const paragraph = (node as Parent).children[0] as Parent;
        return `<blockquote>${inline(paragraph.children)}</blockquote>`;
    }

    case 'code':
        /* The language rides an attribute rather than the conventional
           `class="language-js"` on an inner `<code>`: `ContentEdit.PreText`
           maps to `<pre>` itself and keeps its own attributes, and the
           markdown profile's allow-list hides this one from the properties
           dialog, so the user cannot accidentally corrupt it. */
        return `<pre${attr(LANGUAGE_ATTRIBUTE, node.lang)}>` +
            `${escapeText(String(node.value ?? ''))}</pre>`;

    case 'list': {
        const tag = node.ordered ? 'ol' : 'ul';
        const start = node.ordered && node.start !== null && node.start !== 1
            ? attr('start', node.start)
            : '';
        const items = ((node as Parent).children || [])
            .map((item) => listItem(item as Parent)).join('');
        return `<${tag}${start}>${items}</${tag}>`;
    }

    case 'table':
        return table(node as Parent);

    default:
        // Unreachable: `isRepresentable` gated this, and everything it
        // rejects goes through `staticBlock`.
        return '';
    }
}

function table(node: Parent): string {
    const align = (node.align as (string | null)[]) || [];
    const rows = node.children || [];
    const cells = (row: Node, tag: string) => ((row as Parent).children || [])
        .map((cell, column) =>
            `<${tag}${attr('align', align[column])}>` +
            `${inline((cell as Parent).children)}</${tag}>`)
        .join('');

    /* GFM tables always have a header row, so the first row is always a
       thead -- there is no "headerless" case to detect. */
    const head = rows.length
        ? `<thead><tr>${cells(rows[0], 'th')}</tr></thead>`
        : '';
    const body = rows.slice(1)
        .map((row) => `<tr>${cells(row, 'td')}</tr>`).join('');

    return `<table>${head}${body ? `<tbody>${body}</tbody>` : ''}</table>`;
}

/**
 * A block the editor cannot edit, rendered as a `ContentEdit.Static`.
 *
 * `data-ce-tag="static"` is ContentEdit's own escape hatch for forcing an
 * element class, and `Static.html()` re-emits its tag, attributes and
 * content verbatim -- so what goes in comes back out unchanged. The source
 * text is shown as-is inside a `<pre>`, which is honest: the user can see
 * exactly what is in their file and that they cannot edit it here.
 */
function staticBlock(source: string): string {
    return `<div data-ce-tag="static" class="ct-md-static">` +
        `<pre>${escapeText(source)}</pre></div>`;
}

/** Render one top-level block, marked with its source index. */
export function blockToHTML(entry: SourceBlock, source: string): string {
    const html = entry.editable
        ? block(entry.node)
        : staticBlock(source.slice(entry.start, entry.end));

    // Insert the marker into the opening tag rather than wrapping, so the
    // block stays the element ContentEdit maps.
    const tagEnd = html.indexOf('>');
    if (tagEnd === -1) {
        return html;
    }
    const selfClosing = html[tagEnd - 1] === '/';
    const insertAt = selfClosing ? tagEnd - 1 : tagEnd;
    return html.slice(0, insertAt) +
        attr(SOURCE_ATTRIBUTE, entry.index) +
        html.slice(insertAt);
}

/** Render every block of a parsed document. */
export function toHTML(blocks: SourceBlock[], source: string): string {
    return blocks.map((entry) => blockToHTML(entry, source)).join('');
}
