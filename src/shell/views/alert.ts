/* The one place a failure becomes something on the screen.
 *
 * The rule the cms dist suite already enforces for the playground applies
 * to the shell: an error reaches the PAGE, never the console. A shell that
 * logs and renders nothing looks idle when it has failed, and the person
 * in front of it has no way to tell "nothing happened" from "everything
 * broke".
 *
 * The region is created empty and kept, rather than built when something
 * goes wrong. An `aria-live` region has to be in the document BEFORE its
 * content changes for assistive technology to announce the change -- one
 * inserted already-populated is silent, which is the failure that looks
 * exactly like success.
 */
import {h} from '../../core/render.js';
import type {Described} from '../errors.js';

/** The permanent, empty region. Built once; filled by `showAlert`. */
export function alertRegion(doc: Document): HTMLElement {
    /* `role="alert"` carries an implicit `aria-live="assertive"`, so the
       attribute is not repeated: spelling both is how they come to
       disagree. */
    return h(doc, 'div', {class: 'ct-cms__alert-region', role: 'alert'});
}

/** Fill the region, or empty it when there is nothing wrong. */
export function showAlert(doc: Document, region: HTMLElement, error: Described | null): void {
    region.replaceChildren();
    if (!error) {
        return;
    }

    const parts: HTMLElement[] = [
        h(doc, 'p', {class: 'ct-cms__alert-title'}, [error.title])
    ];
    /* The path a ConfigError names, on its own line and monospaced. It is
       the operator's likeliest failure by a distance -- a typo in a
       hand-edited YAML file -- and it is the only error here whose message
       is a coordinate they can go and act on. */
    if (error.path) {
        parts.push(h(doc, 'p', {class: 'ct-cms__alert-path'}, [error.path]));
    }
    if (error.detail) {
        parts.push(h(doc, 'p', {class: 'ct-cms__alert-detail'}, [error.detail]));
    }

    /* A `notice` is not a failure -- "nothing to save" is an ordinary
       answer to an ordinary press -- and rendering it in the same red
       panel as a refused token is how people learn to read past the red
       panel. It stays in the live region, because it is still the reply
       to something they just did and a sighted user sees it appear. */
    const kind = error.kind === 'notice' ? ' ct-cms__alert--notice' : '';
    region.appendChild(h(doc, 'div', {class: `ct-cms__alert${kind}`}, parts));
}
