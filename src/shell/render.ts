/* Sixty lines standing in for a view library, and the reason they earn it.
 *
 * `src/shell/` may not import a package -- test/browser/shell/imports.spec.js
 * asserts zero bare specifiers -- but that constraint is not why this file is
 * small. The alternative to it is not Lit, it is `innerHTML`, and `innerHTML`
 * is wrong here for one concrete reason: DOM IDENTITY.
 *
 * Re-rendering by assigning innerHTML builds new nodes, so it destroys the
 * caret and the selection in whatever field the user is typing into -- every
 * keystroke, for a form-heavy UI. Worse, it would take the shell's
 * `<slot name="editor">` with it, and a slotted editor with no slot to land
 * in is still CONNECTED and still holding the one-per-page EditorApp lease.
 * It is merely invisible. Every later entry then refuses to open, with
 * nothing in any stack trace to say why.
 *
 * So: build nodes once, update them in place, and key the lists.
 */

/** What `h()` accepts as a child: a node, text, or nothing at all. */
export type Child = Node | string | number | null | undefined | false;

/**
 * Properties for `h()`. A key whose value is a function is attached as a
 * listener (`onclick` -> `click`); `style` and `dataset` are merged; anything
 * else is set as an attribute, and `false`/`null`/`undefined` removes it.
 */
export interface Props {
    [name: string]: unknown;
}

/**
 * Build an element.
 *
 * `doc` is a PARAMETER, and that is load-bearing twice over. The lint rule in
 * eslint.config.mjs forbids a bare `document` outside the RootContext seam,
 * and `rootContext()` would be actively wrong here: while the editor is
 * mounted the global context is a ShadowRootContext pointing into the
 * EDITOR's root, so a render function reading it would build the shell's
 * chrome in the wrong tree. `this.ownerDocument` is the only right answer and
 * only the element knows it.
 */
export function h(
        doc: Document,
        tag: string,
        props: Props = {},
        children: Child[] = []
        ): HTMLElement {
    const el = doc.createElement(tag);
    apply(el, props);
    for (const child of children) {
        if (child === null || child === undefined || child === false) {
            continue;
        }
        el.appendChild(typeof child === 'object' ? child : doc.createTextNode(String(child)));
    }
    return el;
}

/** Set properties on an existing element. Exported so `list()` can update. */
export function apply(el: HTMLElement, props: Props): void {
    for (const [name, value] of Object.entries(props)) {
        if (typeof value === 'function') {
            /* Listeners are assigned as `onclick` rather than added, so
               re-applying props to a REUSED node replaces the handler
               instead of stacking a second one on it. A stacked handler is
               the classic keyed-list bug: the row works, then fires twice,
               then three times, and nothing looks wrong in the DOM. */
            (el as unknown as Record<string, unknown>)[name] = value;
        } else if (name === 'text') {
            el.textContent = String(value);
        } else if (value === false || value === null || value === undefined) {
            el.removeAttribute(name);
        } else {
            el.setAttribute(name, String(value));
        }
    }
}

/**
 * Reconcile `parent`'s children against `items`, by key.
 *
 * A node whose key is unchanged is KEPT -- the same object, not an equal one.
 * A new key is built with `make`. A key that has gone is removed. Order
 * follows `items`. `update` runs on every node either way, so a caller
 * states what a row looks like in one place rather than twice.
 *
 * Keeping the node is the whole point: it is what preserves focus, selection
 * and scroll position across a re-render, and what lets a slotted child
 * survive one.
 */
export function list<T>(
        parent: HTMLElement,
        items: readonly T[],
        key: (item: T) => string,
        make: (item: T) => HTMLElement,
        update?: (el: HTMLElement, item: T) => void
        ): void {
    const existing = new Map<string, HTMLElement>();
    for (const child of [...parent.children]) {
        const k = child.getAttribute('data-key');
        if (k !== null) {
            existing.set(k, child as HTMLElement);
        }
    }

    let previous: HTMLElement | null = null;
    for (const item of items) {
        const k = key(item);
        let el = existing.get(k);
        if (el) {
            existing.delete(k);
        } else {
            el = make(item);
            el.setAttribute('data-key', k);
        }
        /* `update` runs on a node just built as well as on a kept one, so
           a caller has exactly ONE place that states what a row looks like
           for the current state. Running it only on kept nodes is the
           quiet bug: the first render of a list differs from every render
           after it, which surfaces as a selected row that is not
           highlighted until something unrelated re-renders. */
        if (update) {
            update(el, item);
        }
        /* The position this item belongs in. Moving a node that is ALREADY
           there is not free and not a no-op: `insertBefore` removes before
           it inserts, and removing a focused element blurs it -- so an
           unconditional call would kill the caret on every render, which is
           the exact failure this whole module exists to avoid. Skipping the
           move when nothing moved is what makes the reorder case cheap and
           the common case correct. */
        const before = previous ? previous.nextSibling : parent.firstChild;
        if (el !== before) {
            parent.insertBefore(el, before);
        }
        previous = el;
    }

    // Whatever is left in the map is a key that no longer exists.
    for (const el of existing.values()) {
        el.remove();
    }
}
