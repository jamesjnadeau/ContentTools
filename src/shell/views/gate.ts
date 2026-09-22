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
 *
 * It has TWO shapes, and which one shows is the adapter's to say. An
 * adapter that needs a secret from the person gets the form; one that
 * needs a click gets the button. Both panels are built and one is
 * hidden, rather than one being built on demand: the identity rule above
 * applies to whichever is showing, and a panel that is rebuilt when the
 * adapter is swapped back would also lose the alert that explained why.
 *
 * The button is a `<button>` and never an `<a>`, and it lives OUTSIDE the
 * form. Both are load-bearing for tests that predate it:
 * `.ct-cms__gate a` is taken to be GitHub's token page, and
 * `.ct-cms__gate-form button` to be the one thing that submits a token.
 */
import {h} from '../../core/render.js';
import {alertRegion, showAlert} from './alert.js';
import type {Described} from '../errors.js';

/** Where GitHub's own token page lives. */
export const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export interface GateHandlers {
    /**
     * Sign in with what the person offered, or with `null` when there was
     * nothing to offer -- the button shape has no field, and an adapter
     * that redirects reads nothing from one. A string is never empty; the
     * form refuses that before calling.
     */
    signIn(offered: string | null): void;
}

export interface GateState {
    /** `owner/name`, from the config. */
    repo: string;
    error: Described | null;
    /** The adapter's button, or null for the token form. */
    gate: {label: string; note: string} | null;
    /**
     * Markdown a refused save was carrying, or null.
     *
     * Shown here rather than on the entry view because there is no entry
     * view any more: dropping the token closes the editor, and the whole
     * of what somebody wrote goes with it.
     */
    unsaved: string | null;
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

    /* The whole of the personal-access-token explanation, in one box that
       can be hidden. None of it is true for an App: there is no token to
       scope, no permissions for the person to get right, and no page on
       GitHub for them to visit. */
    const pat = h(doc, 'div', {class: 'ct-cms__gate-pat'}, [
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
    ]);

    /* `type="button"` is inert where this button stands -- it is outside
       the form, and a `<button>` with no form owner submits nothing
       whatever its type -- so no test can kill it. It is written anyway
       because every other button in this shell carries it, and a lone
       exception is how the one that DOES end up inside a form gets
       written without it. */
    const appNote = h(doc, 'p', {class: 'ct-cms__gate-text'});
    const appButton = h(doc, 'button', {
        class: 'ct-cms__button ct-cms__gate-app-button',
        type: 'button',
        onclick: () => handlers.signIn(null)
    });
    const app = h(doc, 'div', {class: 'ct-cms__gate-app'}, [appNote, appButton]);

    /* The work a refused save was carrying, in a box the person can
       select out of. Offering them a sign-in screen without showing them
       what they wrote is data loss with a button on it -- which is the
       same sentence the entry view's conflict pane is written under, and
       the reason this reuses its textarea rule rather than inventing
       one.

       It says "copy it now" because that is the truth for both shapes of
       this gate and especially for the App one: signing in there leaves
       the page entirely, and nothing brings the draft back into an
       editor on the way home. */
    const rescueText = h(doc, 'textarea', {
        class: 'ct-cms__conflict-text',
        readonly: 'readonly',
        spellcheck: 'false',
        'aria-label': 'The markdown that was not saved'
    }) as HTMLTextAreaElement;
    const rescue = h(doc, 'div', {class: 'ct-cms__gate-rescue'}, [
        h(doc, 'p', {class: 'ct-cms__gate-text'},
          ['This did not save, because the sign-in had expired. Copy it now: '
           + 'it is kept only until you are signed in again.']),
        rescueText
    ]);

    const node = h(doc, 'div', {class: 'ct-cms__gate'}, [
        h(doc, 'div', {class: 'ct-cms__gate-panel'}, [
            h(doc, 'h1', {class: 'ct-cms__gate-title'}, ['Sign in']),
            h(doc, 'p', {class: 'ct-cms__gate-text'}, ['This site edits ', repo, '.']),
            /* Above both panels: which shape is showing does not change
               what a refusal says, and one alert cannot be left behind on
               the panel that is hidden. */
            alert,
            /* Above both panels, like the alert and for the same
               reason: which shape is showing has nothing to do with
               whether there is work to rescue, and a panel hidden with
               the token form would take the draft with it. */
            rescue,
            pat,
            app
        ])
    ]);

    return {
        node,
        update(state: GateState): void {
            repo.textContent = state.repo;
            showAlert(doc, alert, state.error);
            rescue.hidden = state.unsaved === null;
            /* Emptied rather than left alone when there is nothing to
               rescue, so letting go of a draft lets go of it here too:
               a hidden textarea still holding somebody's post is their
               writing sitting in the DOM after the shell said it was
               finished with it.

               Written first as `value !== unsaved` around the
               assignment, to keep a selection from being dropped
               mid-copy by an unrelated render. That guard is gone
               because the reason for it was not measured and is not
               true: Chromium leaves the selection alone when a
               textarea is assigned the string it already holds, and
               moves the caret only when the text actually changes --
               which is the case that wants the new text anyway. */
            rescueText.value = state.unsaved ?? '';

            pat.hidden = state.gate !== null;
            app.hidden = state.gate === null;
            if (state.gate) {
                appButton.textContent = state.gate.label;
                appNote.textContent = state.gate.note;
            }
        }
    };
}
