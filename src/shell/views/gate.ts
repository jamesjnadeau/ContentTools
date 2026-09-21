/* The sign-in gate: full screen, and nothing exists behind it.
 *
 * It is a STATE, not a route. With no token there is nothing to list and
 * no URL worth linking to, so making it a route would mean every other
 * view needed a signed-out branch and a redirect that can loop -- to
 * express a condition that pre-empts routing anyway. Everything past this
 * point may assume a token exists.
 *
 * It is built ONCE and updated, rather than rebuilt per render. A refused
 * token re-renders, and rebuilding would wipe the field the person just
 * typed into at the exact moment they need to look at what they typed.
 */
import {h} from '../render.js';
import {alertRegion, showAlert} from './alert.js';
import type {Described} from '../errors.js';

/** Where GitHub's own token page lives. */
export const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export interface GateHandlers {
    /** The token the person offered. Never empty -- the view refuses that. */
    signIn(token: string): void;
}

export interface GateState {
    /** `owner/name`, from the config. */
    repo: string;
    error: Described | null;
}

export interface Gate {
    readonly node: HTMLElement;
    update(state: GateState): void;
}

export function buildGate(doc: Document, handlers: GateHandlers): Gate {
    const alert = alertRegion(doc);

    /* A password field rather than a text one. The token is a credential
       with write access to somebody's repository, and this screen is open
       for as long as it takes to go and make one -- which is long enough
       for somebody to walk past. */
    const input = h(doc, 'input', {
        class: 'ct-cms__input',
        type: 'password',
        id: 'ct-cms-token',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: 'github_pat_...'
    }) as HTMLInputElement;

    /* Which repository this deployment edits, named on the gate. One build
       serves many sites, so it is not something a person can infer from
       the page they happen to have open -- and they are about to scope a
       token to it. */
    const repo = h(doc, 'code', {class: 'ct-cms__gate-repo'});

    const form = h(doc, 'form', {
        class: 'ct-cms__gate-form',
        onsubmit: (event: Event) => {
            /* Without this the browser navigates -- to the same URL with
               an empty query string, which reloads the shell and loses
               the token before it is ever read. */
            event.preventDefault();
            const given = input.value.trim();
            if (given) {
                handlers.signIn(given);
            }
        }
    }, [
        h(doc, 'label', {class: 'ct-cms__label', for: 'ct-cms-token'}, ['Access token']),
        input,
        h(doc, 'button', {class: 'ct-cms__button', type: 'submit'}, ['Sign in'])
    ]);

    const node = h(doc, 'div', {class: 'ct-cms__gate'}, [
        h(doc, 'div', {class: 'ct-cms__gate-panel'}, [
            h(doc, 'h1', {class: 'ct-cms__gate-title'}, ['Sign in']),
            h(doc, 'p', {class: 'ct-cms__gate-text'}, ['This site edits ', repo, '.']),
            alert,
            h(doc, 'p', {class: 'ct-cms__gate-text'},
              ['Paste a fine-grained personal access token scoped to that ' +
               'repository, with these permissions:']),
            /* Named here rather than left to GitHub's own screen. A token
               scoped without them comes back as a 404 -- GitHub answers 404
               for a repository a token cannot see, so as not to disclose
               that it exists -- and a 404 reads to the person who just made
               the token as "that repository is gone", which is the one
               conclusion that leads nowhere. */
            h(doc, 'ul', {class: 'ct-cms__gate-permissions'}, [
                h(doc, 'li', {}, ['Contents — read and write']),
                h(doc, 'li', {}, ['Pull requests — read and write'])
            ]),
            h(doc, 'p', {class: 'ct-cms__gate-text'}, [
                h(doc, 'a', {
                    class: 'ct-cms__link',
                    href: TOKEN_URL,
                    target: '_blank',
                    /* `noopener` because the opened page gets a handle on
                       this one otherwise, and this one is holding a token. */
                    rel: 'noopener noreferrer'
                }, ['Create a token on GitHub'])
            ]),
            form,
            h(doc, 'p', {class: 'ct-cms__hint'},
              ['The token is kept for this tab only, and forgotten when you ' +
               'close it. It is never sent anywhere but GitHub.'])
        ])
    ]);

    return {
        node,
        update(state: GateState): void {
            repo.textContent = state.repo;
            showAlert(doc, alert, state.error);
        }
    };
}
