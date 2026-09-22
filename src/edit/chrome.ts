/* The bar the in-page script puts on the site's own page.
 *
 * It is small on purpose and it is not the editor. Its job in this
 * sub-phase is to be the one place every answer lands -- including the
 * three that are somebody's mistake -- because a script that decides a
 * page is not editable and then says nothing is indistinguishable from a
 * script that failed to load.
 *
 * Chrome in a shadow root, content in the light DOM: Mode A, one level
 * up, and for the same reasons `<content-tools-cms>` does it. Here the
 * isolation matters MORE than it does under /admin, because the page
 * around this bar belongs to somebody else. Their rules must not reach
 * our chrome, and ours must not reach a single node of their site -- a
 * CMS that restyles the page it is editing is a CMS that lies about what
 * the page looks like.
 *
 * There is no cascade layer here, unlike `ct-chrome` and `ct-shell`, and
 * the absence is deliberate. A layer exists so a CONSUMER can win at
 * equal specificity; those two are embedded by a host page that may want
 * to restyle them. Nothing embeds this. A site cannot write a rule that
 * reaches inside this root at all -- we expose no `::part()` -- so a
 * layer would be a wrapper no test could ever tell the presence of.
 */

import {sheetFactory} from '../core/constructed-styles.js';
import {h} from '../core/render.js';
import type {CmsConfig} from '../cms/config.js';
import type {PageEntry} from '../cms/preview.js';
import editCSS from './styles/edit.scss?inline';

/**
 * The bar's host element.
 *
 * A valid custom element name, and unregistered: `attachShadow` is
 * allowed on an undefined element whose name has a hyphen in it, and not
 * registering anything is one less thing this script can collide with on
 * a page it does not own. The name is also the bar's only real defence
 * against the site's own CSS -- see the head of ./styles/edit.scss.
 */
export const BAR_TAG = 'content-tools-edit-bar';

/**
 * The page, once the questions about it have been answered.
 *
 * Every state from `ready` on carries all three, because every one of
 * them wants to say which element this is about: an author deciding
 * whether the `body` selector is right should not have to sign in first,
 * and one who is signed in should be able to see it while the read is in
 * flight.
 */
export interface Located {
    readonly entry: PageEntry;
    readonly selector: string;
    readonly body: HTMLElement;
}

/**
 * What the bar has to say about this page.
 *
 * Each one is somewhere a person can genuinely be left: a config that
 * does not parse, a page that maps to no entry, an entry whose body
 * cannot be found, a page that is editable by somebody who is not signed
 * in, a read in flight, a read that failed, and an editor that is up.
 */
export type BarState =
    /** The config is missing or will not parse. Nothing else was tried. */
    | {readonly kind: 'broken'; readonly hint: string}
    /** The config is fine and this page is not one of its entries. */
    | {readonly kind: 'not-an-entry'; readonly hint: string}
    /** This page IS an entry, and the element holding its body is not. */
    | {readonly kind: 'no-body'; readonly entry: PageEntry; readonly hint: string}
    /**
     * Everything the editor needs, found -- the config included.
     *
     * The config is in here rather than fetched a second time by
     * whoever acts on this. It is one of the things the editor needs:
     * it names the repository, the branch and the media folder, and
     * two reads of one file is two answers that can differ if somebody
     * deploys between them.
     */
    | ({readonly kind: 'ready'; readonly config: CmsConfig} & Located)
    /** Editable, and nobody in this tab has a token. */
    | ({readonly kind: 'signed-out'} & Located)
    /** Reading the version on the branch. */
    | ({readonly kind: 'loading'} & Located)
    /** The read, or the mount, did not work. */
    | ({readonly kind: 'failed'; readonly hint: string} & Located)
    /** The editor is up, over the element named in the hint. */
    | ({readonly kind: 'editing'} & Located);

/** A built bar: the element to append, and the way to change what it says. */
export interface Bar {
    /** The host. Its shadow root is open, so a test can read inside it. */
    readonly node: HTMLElement;
    update(state: BarState): void;
}

/* No `layered()` -- see the header. Memoised per document all the same,
   because a page with an <iframe> the script also runs in has two
   documents and a constructed sheet belongs to exactly one of them. */
const barStyleSheet = sheetFactory(editCSS);

/** Build the bar, saying nothing yet. `update` is what gives it words. */
export function buildBar(doc: Document): Bar {
    const node = doc.createElement(BAR_TAG);
    const root = node.attachShadow({mode: 'open'});

    const sheet = barStyleSheet(doc);
    /* Null where constructable sheets are unsupported. An unstyled bar
       is ugly and still readable, and it is still the only place the
       three failure states appear, so there is no <style> fallback to
       keep in step with this. */
    if (sheet) {
        root.adoptedStyleSheets = [sheet];
    }

    const title = h(doc, 'p', {class: 'ct-edit__title'});
    const hint = h(doc, 'p', {class: 'ct-edit__hint'});
    /* `status` rather than `alert`: the bar is built empty and filled a
       moment later, once the config has been fetched, so without a live
       region somebody using a screen reader gets nothing at all -- and
       three of the four things it can say are not emergencies. */
    const panel = h(doc, 'div', {class: 'ct-edit', role: 'status'}, [title, hint]);
    root.appendChild(panel);

    return {
        node,
        update(state: BarState): void {
            const said = describe(state);
            panel.className = `ct-edit ct-edit--${state.kind}`;
            title.textContent = said.title;
            hint.textContent = said.hint;
        }
    };
}

/** The two lines a state reads as. Pure, and separate so it is testable. */
export function describe(state: BarState): {title: string; hint: string} {
    switch (state.kind) {
        case 'broken':
            return {title: 'The CMS config could not be read', hint: state.hint};
        case 'not-an-entry':
            return {title: 'Not an editable page', hint: state.hint};
        case 'no-body':
            return {title: entryName(state.entry), hint: state.hint};
        case 'ready':
        case 'editing':
            /* Naming the ELEMENT, not just the selector, is the whole
               point of these two. The editor replaces that element's
               children, so a `body` selector that matches the page
               wrapper replaces the site's layout with a post -- and
               `main.layout` against `article.post` is the difference,
               read at a glance, before anybody presses anything. */
            return {
                title: entryName(state.entry),
                hint: `Editing ${found(state)}.`
            };
        case 'signed-out':
            return {
                title: entryName(state.entry),
                /* The element is named HERE TOO, and that is the point of
                   saying it in two states rather than one: checking a
                   `body` selector is a deployment job, and asking somebody
                   to obtain a token before they can see whether they
                   pointed it at the right element makes the check cost an
                   afternoon instead of a page load. */
                hint: `Found ${found(state)}. Sign in through the admin `
                    + 'screens in this tab, then come back to edit it.'
            };
        case 'loading':
            return {
                title: entryName(state.entry),
                /* "the branch" rather than "the repository", because that
                   is the surprising part: the words about to replace what
                   is on screen are the ones under review, not the ones
                   this page was built from. */
                hint: 'Reading the version on the branch...'
            };
        case 'failed':
            return {title: entryName(state.entry), hint: state.hint};
    }
}

/** `article.post, matched by article.post` -- the element and its rule. */
function found(state: Located): string {
    return `${describeElement(state.body)}, matched by ${state.selector}`;
}

/** `blog/hello`: the spelling `<meta name="cms:entry">` uses. */
function entryName(entry: PageEntry): string {
    return `${entry.collection}/${entry.slug}`;
}

/**
 * An element as a selector-shaped description: `article#post-3.prose`.
 *
 * Selector-shaped rather than prose because it is also the answer to the
 * question the person reading it is about to ask -- what they should have
 * written in `body:` instead.
 */
export function describeElement(el: Element): string {
    const id = el.id === '' ? '' : `#${el.id}`;
    const classes = [...el.classList].map(name => `.${name}`).join('');
    return `${el.tagName.toLowerCase()}${id}${classes}`;
}
