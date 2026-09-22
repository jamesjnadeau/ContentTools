/* The screen before there is a screen.
 *
 * Shown while the config is loading and, if it never loads, instead of the
 * gate. It is a separate view from the gate on purpose: with no config
 * there is no repository to name and no permissions to list, so a sign-in
 * form here would ask somebody to scope a token to a repository the page
 * cannot tell them. The failure it is most often reporting -- a typo in a
 * hand-edited config file -- is also the one the operator can act on
 * immediately, which is why the alert carries the offending path.
 */
import {h} from '../../core/render.js';
import {alertRegion, showAlert} from './alert.js';
import type {Described} from '../errors.js';

export interface StatusState {
    error: Described | null;
}

export interface Status {
    readonly node: HTMLElement;
    update(state: StatusState): void;
}

export function buildStatus(doc: Document): Status {
    const alert = alertRegion(doc);
    /* Kept and emptied rather than removed, so the "still loading" line
       does not sit underneath an error explaining that loading is over. */
    const waiting = h(doc, 'p', {class: 'ct-cms__note'}, ['Loading…']);

    const node = h(doc, 'div', {class: 'ct-cms__gate'}, [
        h(doc, 'div', {class: 'ct-cms__gate-panel'}, [
            h(doc, 'h1', {class: 'ct-cms__gate-title'}, ['Content']),
            alert,
            waiting
        ])
    ]);

    return {
        node,
        update(state: StatusState): void {
            showAlert(doc, alert, state.error);
            waiting.hidden = state.error !== null;
        }
    };
}
