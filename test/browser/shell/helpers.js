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
site:
  # No base: this fake site is served at the root, which is spelled by
  # OMITTING the key. An explicit empty string is refused -- see
  # config.spec.js.
  preview: https://deploy-preview-{{pr}}--site.test
media:
  folder: static/images
  publicPath: /images
collections:
  - name: blog
    label: Blog
    folder: content/blog
    create: true
    page: /blog/{{slug}}/
    body: article .content
    fields:
      - {name: title, label: Title}
      - {name: draft, label: Draft, widget: boolean}
      - {name: tags, label: Tags, widget: list}
  - name: pages
    label: Pages
    body: article .content
    files:
      - name: about
        label: About
        file: content/about.md
        page: /about/
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

/**
 * The open entry's panel once it has actually loaded, or null.
 *
 * The panel itself is built once and only RENDERED on an entry route, so
 * its presence answers "is this the entry screen"; the heading answers
 * "has the file arrived", which is the question every caller here is
 * really asking. Both, because a spec that waited only for the panel
 * would go on to read a form that is still empty.
 *
 * This replaced `editorOf`, which looked for the editor element the shell
 * used to append to its own light DOM. There is none: since M6-3 the body
 * is edited on the site's own page and `/admin` shows no editor at all.
 */
export function entryOf(el) {
    const view = el.shadowRoot.querySelector('.ct-cms__entry-view');
    return view && view.querySelector('.ct-cms__heading').textContent !== ''
        ? view
        : null;
}

/** One of the open entry's frontmatter controls, by field name. */
export function fieldOf(el, name) {
    return el.shadowRoot.querySelector(`#ct-field-${name}`);
}

/**
 * Change a frontmatter field, as typing into it would.
 *
 * This replaced `retype`, which rewrote a block of the body through
 * ContentEdit. The body is not here any more, so the only edit `/admin`
 * can make -- and therefore the only way a spec can make this screen
 * dirty -- is through the form.
 *
 * No event is dispatched, and none is needed: the widgets ARE the state
 * of the form, so the session asks the controls what they hold at the
 * moment it compares, which is what makes an `onChange` per keystroke
 * unnecessary in the first place. Assigning `value` is exactly what a
 * keystroke leaves behind.
 */
export function setField(el, name, value) {
    const control = fieldOf(el, name);
    if (control.type === 'checkbox') {
        control.checked = value;
    } else {
        control.value = value;
    }
    return control;
}

/** Wait until the open entry has loaded. */
export function openedEntry(el, describe = 'the entry to open') {
    return until(() => entryOf(el) !== null, describe);
}

/** The text of whatever the alert region is currently saying. */
export function alertText(el) {
    return [...el.shadowRoot.querySelectorAll('.ct-cms__alert-region')]
        .map(region => region.textContent)
        .join(' ')
        .trim();
}
