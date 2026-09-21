/* Mounting the shell in a test, against an in-memory GitHub.
 *
 * Two things are deliberately NOT faked here. The auth adapter is the real
 * `PatAuthAdapter` writing real `sessionStorage`, because the token round
 * trip is one of the things worth asserting and a fake storage would make
 * the assertion vacuous; `forgetToken()` is the cleanup that costs. And the
 * gate is driven the way a person drives it -- type into the field, submit
 * the form -- rather than by calling a private method, because the handler
 * wiring is exactly what a unit-level shortcut would stop covering.
 *
 * `fetch` is a PROPERTY on the element rather than a global stub, so
 * nothing is intercepted anywhere: the shell is handed a function and the
 * rest of the stack cannot tell the difference. That is the same argument
 * that made `fetch` a constructor argument down in `src/cms/github.ts`.
 */
import {createFakeGitHub} from '../cms/fake-github.js';
import {TOKEN_KEY} from '../../../src/auth/pat.js';
import '../../../src/shell/index.js';

export {createFakeGitHub};

export const CONFIG_URL = '/test-cms-config.yml';

/* Both collection shapes declare fields, and a FILE collection declares
   them per file -- which is the only arrangement that can tell
   `fieldsFor(collection, slug)` from `collection.fields`. None of them is
   `required`: a required field refuses a save, and a spec about
   navigation should not have to fill a form in to get past it. */

export const CONFIG_YAML = `
backend:
  repo: owner/site
  branch: main
media:
  folder: static/images
  publicPath: /images
collections:
  - name: blog
    label: Blog
    folder: content/blog
    create: true
    fields:
      - {name: title, label: Title}
      - {name: draft, label: Draft, widget: boolean}
      - {name: tags, label: Tags, widget: list}
  - name: pages
    label: Pages
    files:
      - name: about
        label: About
        file: content/about.md
        fields:
          - {name: heading, label: Heading}
`;

/** A `fetch` serving `files` by exact URL, and the fake GitHub for the rest. */
export function shellFetch(fake, files = {[CONFIG_URL]: CONFIG_YAML}) {
    return async function fetchFor(input, init) {
        const url = typeof input === 'string' ? input : String(input.url ?? input);
        if (Object.prototype.hasOwnProperty.call(files, url)) {
            const body = files[url];
            /* A string is the file; anything else is the status to answer
               with, so a test can say "this config 404s" in one word. */
            return typeof body === 'string'
                ? new Response(body, {status: 200})
                : new Response('', {status: body});
        }
        return fake.fetch(input, init);
    };
}

/** Forget any token a previous test left behind. */
export function forgetToken() {
    try {
        sessionStorage.removeItem(TOKEN_KEY);
    } catch {
        /* Storage refused; the adapter will have fallen back to memory,
           which is per-adapter and therefore already clean. */
    }
}

/**
 * Mount a shell and wait for it to settle.
 *
 * "Settled" is the reflected `state` attribute leaving `loading` -- the
 * attribute exists so a host page can wait without polling a property, and
 * a test using the same signal is a test of that contract.
 */
export async function mountShell(options = {}) {
    const fake = options.fake ?? createFakeGitHub();
    const el = document.createElement('content-tools-cms');
    el.fetch = options.fetch ?? shellFetch(fake, options.files);
    if (options.config !== null) {
        el.setAttribute('config', options.config ?? CONFIG_URL);
    }
    document.body.appendChild(el);
    await settled(el);
    return {el, fake, shadow: el.shadowRoot};
}

/** Wait until the shell's reflected state is no longer `loading`. */
export async function settled(el, attempts = 100) {
    for (let i = 0; i < attempts; i += 1) {
        if (el.getAttribute('state') && el.getAttribute('state') !== 'loading') {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error(`shell never settled; state=${el.getAttribute('state')}`);
}

/** Wait until `check()` is true, or fail saying what it was instead. */
export async function until(check, describe = 'condition', attempts = 100) {
    for (let i = 0; i < attempts; i += 1) {
        if (check()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error(`${describe} never became true`);
}

/** Sign in through the gate, exactly as a person does. */
export async function signIn(el, token = 'github_pat_test') {
    const input = el.shadowRoot.querySelector('.ct-cms__input');
    const form = el.shadowRoot.querySelector('.ct-cms__gate-form');
    input.value = token;
    form.dispatchEvent(new Event('submit', {cancelable: true, bubbles: true}));
    await until(() => el.getAttribute('state') !== 'signed-out',
                'the shell to leave the gate');
}

/**
 * Press the gate's button, as a person does with an App adapter.
 *
 * A sibling of `signIn` rather than a branch inside it: `signIn` is what
 * every other spec here uses, and the whole claim of this milestone is
 * that the PAT path did not change. An edit to that function is the
 * alarm.
 */
export async function signInWithApp(el) {
    el.shadowRoot.querySelector('.ct-cms__gate-app-button').click();
    await until(() => el.getAttribute('state') !== 'signed-out',
                'the shell to leave the gate');
}

/**
 * Mount at a route, sign in, and wait for whatever that route loads.
 *
 * The hash is set BEFORE the element is connected, because that is the
 * case a bookmark exercises: the route has to survive a boot that had no
 * config to resolve it against yet.
 */
export async function openAt(hash, options = {}) {
    location.hash = hash;
    const mounted = await mountShell(options);
    await signIn(mounted.el);
    return mounted;
}

/** The editor element the shell put in its own light DOM, or null. */
export function editorOf(el) {
    return el.querySelector('content-tools-editor');
}

/**
 * Rewrite one block of the open entry, as typing into it would.
 *
 * Through the ContentEdit element rather than by assigning textContent:
 * the editor keeps its own tree, and a DOM poke behind its back leaves
 * `lastModified()` untouched -- so `save()` would report nothing changed
 * and every assertion afterwards would be about an edit that never
 * happened. The idiom is test/browser/content-tools/editor.spec.js's.
 */
export function retype(el, text, index = 1) {
    const block = editorOf(el).editorApp.regions().body.children[index];
    block.content = new HTMLString.String(text);
    block.updateInnerHTML();
    block.taint();
    return block;
}

/** The text of whatever the alert region is currently saying. */
export function alertText(el) {
    return [...el.shadowRoot.querySelectorAll('.ct-cms__alert-region')]
        .map(region => region.textContent)
        .join(' ')
        .trim();
}
