# ContentTools 2 (release candidate)

A WYSIWYG editor for HTML content, modernized into the editing surface for a
git-backed markdown CMS.

This is a fork of [GetmeUK/ContentTools](https://github.com/GetmeUK/ContentTools),
which has been unmaintained since 2022.

## Status

**All five milestones are complete: the library is modernized, the editor
runs as a custom element, it can be constrained to what markdown expresses,
and there is a CMS shell on top of it that edits a git repository by pull
request — with authors signing in either with their own token or through a
GitHub App.**

**`2.0.0-rc.0`** is the current release, and it carries all five: the API
is frozen, every gate is green, and what is left before `2.0.0` is not
code. Three things can only be checked by hand and have not been —
the round trip against a real repository, a real GitHub App signing a real
person in, and whether GitHub's App web flow *enforces* PKCE rather than
merely accepting it. A tool that writes to somebody's git history should
have written to one before it calls itself final.

Not yet on npm. `npm pack` produces the artifact; the tag is
`v2.0.0-rc.0`.

| | |
|---|---|
| 1 | TypeScript ESM library, ContentEdit absorbed as source, one `RootContext` seam, and `<content-tools-editor>` with its chrome in a shadow root |
| 2 | markdown mode — the editor constrained to what markdown expresses — and a save that keeps untouched blocks byte-identical; a repeatable editor lifecycle |
| 3 | runtime config, a GitHub client of our own, one branch and one pull request per entry |
| 4 | two auth adapters: a fine-grained PAT, and a GitHub App whose code exchange is one pure `Request` → `Response` function, deployed as a tiny proxy |
| 5 | the shell: collections, entries, frontmatter widgets, a media library and the editorial workflow |

What changed from v1.6.16:

| | v1.6.16 | now |
|---|---|---|
| Language | CoffeeScript 1.x | TypeScript |
| Modules | one shared closure, concatenated | 122 ES modules |
| Build | Grunt + PhantomJS (unrunnable on Node 22) | Vite |
| Dependencies | ContentEdit/ContentSelect/HTMLString vendored as one prebuilt file | absorbed as source |
| Tests | 127 assertions, PhantomJS | 1,577 in real Chromium, plus ten Playwright suites against the built artifacts |
| Host access | bare `document`/`window` throughout | one `RootContext` seam |
| Embedding | mounts chrome into `document.body` | `<content-tools-editor>`, chrome in a shadow root |
| Output | HTML in, HTML out | that, or markdown with a one-line diff |
| Backend | none: `saved` hands you a string | that, or a git repository edited by pull request |

ContentEdit, ContentSelect and HTMLString are no longer external: their
upstream sources were verified byte-identical to what was vendored, then
absorbed. See `vendor-src/UPSTREAM.md`.

## Install

```sh
npm install @jamesjnadeau/content-tools
```

## Use

The v1.6.x integration contract is unchanged:

```js
import ContentTools from '@jamesjnadeau/content-tools';
import '@jamesjnadeau/content-tools/style.css';

const editor = ContentTools.EditorApp.get();
editor.init('[data-editable]', 'data-name');

editor.addEventListener('saved', ev => {
    const regions = ev.detail().regions;   // {name: html}, CHANGED regions only
    if (!Object.keys(regions).length) return;

    editor.busy(true);
    persist(regions).then(
        () => { editor.busy(false); new ContentTools.FlashUI('ok'); },
        () => { editor.busy(false); new ContentTools.FlashUI('no'); }
    );
});
```

Or as a single script that attaches the browser globals, as before:

```html
<link rel="stylesheet" href="node_modules/@jamesjnadeau/content-tools/dist/content-tools.css">
<script src="node_modules/@jamesjnadeau/content-tools/dist/content-tools.js"></script>
```

### As a custom element

```html
<link rel="stylesheet" href="node_modules/@jamesjnadeau/content-tools/dist/content-tools-content.css">

<content-tools-editor regions="[data-editable], [data-fixture]">
  <div data-editable data-name="body">…</div>
</content-tools-editor>

<script type="module">
  import '@jamesjnadeau/content-tools/element';

  const editor = document.querySelector('content-tools-editor');
  editor.start();
  document.addEventListener('ct-saved', ev => persist(ev.detail.regions));
</script>
```

The editor's ~44 kB of chrome CSS goes into the element's shadow root instead
of into your page, so `.ct-app` and friends can no longer collide with your
own styles. By default the editable content stays in the light DOM, so your
page still styles it and preview fidelity is free — which is why you link
`content.css` for the content rules.

**One element per page**, deliberately. `ContentTools.EditorApp` and
`ContentEdit.Root` are singletons, and a second connected element goes inert
and emits `ct-error` rather than fighting the first. Milestone 2 made that
rule cheap to live with instead of trying to lift it: an element can be
booted and torn down as many times as you like, and the Nth time behaves
exactly like the first.

Full attribute, property, method and event reference:
**[docs/element.md](docs/element.md)**.

### As a CMS

```html
<content-tools-cms config="./cms-config.yml"></content-tools-cms>
<script type="module" src="./dist/shell.js"></script>
```

That tag is the whole application. It loads the config for the one
repository that deployment edits, signs an author in — with their own
fine-grained token, or through a GitHub App — lists what they can edit, and
turns each save into a branch, a commit and a pull request for a human to
review. `app/` is a working deployment of it — copy `app/` and `dist/` to
any static host.

Editing one paragraph produces a one-line diff, because the markdown save
splices the blocks nobody touched back in verbatim. That is the property the
whole thing rests on: a pull request nobody can read is a review that does
not happen.

**[docs/shell.md](docs/shell.md)**, **[docs/auth.md](docs/auth.md)** for
the two ways authors sign in, and **[docs/cms.md](docs/cms.md)** for the same
machinery without the UI.

## Documentation

- [Migrating from 1.6.x](docs/migrating-from-1.6.md)
- [`<content-tools-editor>`](docs/element.md)
- [Markdown mode](docs/markdown-mode.md)
- [The git-backed half](docs/cms.md)
- [The shell](docs/shell.md)
- [Content scope: Mode A and Mode B](docs/content-scope.md)
- [`RootContext` — the host seam](docs/root-context.md)

The v1.6.x API is unchanged, so [upstream's
documentation](https://getcontenttools.com/api/content-tools) still describes
it accurately.

## Development

```sh
npm install
npm run build        # dist/: IIFE, minified IIFE, ESM, CSS + images
npm test             # lint, typecheck, browser tests, golden master, equivalence, visual, size
npm run test:coverage
```

`npm run dev` builds and serves the CMS at `http://127.0.0.1:8931/app/` —
the same page the dist suite drives — and the playground at
`/playground/`: the editor, the custom-element version at `element.html`,
markdown mode at `markdown.html`, and the headless git layer at
`cms.html`.

### How this is tested

Deliberately covering different things:

- **`test/browser/`** — 1,577 tests in real Chromium, run against the SOURCE so
  coverage can attribute. Includes upstream ContentEdit's own 329 specs,
  inherited with the code.
- **`test/golden/golden.spec.mjs`** — a characterisation harness that drives
  the BUILT bundle through scripted edits and compares against snapshots taken
  from the frozen v1.6.16 artifact. This is what made the rewrite safe: it
  answers "did behaviour change?" independently of whether a test was written
  for it.
- **`test/golden/visual.spec.mjs`** — screenshots the editor chrome under the
  rebuilt stylesheet and compares against the legacy one.
- **`test/golden/element-dist.spec.mjs`** — drives the BUILT `dist/element.js`
  from a page with nothing else on it. The suites above all run against
  source, so this is the only thing that can see a packaging failure: a
  tag registration tree-shaken away, two ESM entries carrying separate copies
  of the library and therefore separate singletons, or a missing side-effect
  import. It has already caught one of those.
- **`test/golden/element-golden.spec.mjs`** — the equivalence proof. It runs
  the golden-master scenarios a second time through
  `<content-tools-editor>` and compares the element-driven page against the
  imperative one *live, in the same test*: same regions, same saved payloads,
  same event order, same serialized chrome. The observation code is shared
  between the two pages (`fixtures/driver-core.js`), so a difference it sees
  is a difference in the element.

  This is also the only suite that runs on **three engines**.
  `ShadowRootContext.getRange()` is a feature-detected chain — Chromium's
  `ShadowRoot.getSelection()`, then `Selection.getComposedRanges()`, then
  Firefox's non-retargeting document selection — and each engine takes a
  different branch, so a Chromium-only run leaves two thirds of it
  unexecuted. CI installs all three; locally Chromium is the default and
  `CT_ENGINES=firefox,webkit npm run test:element:golden` adds the others
  (`npx playwright install --with-deps firefox webkit` first).

- **`test/golden/proxy-dist.spec.mjs`** — imports the BUILT `dist/proxy.js`
  into a page and runs a code exchange through it. The proxy is the one
  artifact nobody here can deploy, and it is published from its own Vite
  mode, so this is what says the published module resolves and behaves:
  the client secret reaches GitHub, the refresh token is not in the bytes
  that come back, and `configFrom` names a missing variable rather than
  failing on somebody's first sign-in. The handler's own rules — a failure
  GitHub answers with HTTP **200** and an `error` body, a `redirect_uri`
  off the configured origin, a method that is not `POST` — are in
  `test/browser/auth/exchange.spec.js`, where they can be enumerated.

- **`test/golden/cms-dist.spec.mjs`** — drives the BUILT `dist/cms.js` through
  `playground/cms.html`, with Playwright routing `api.github.com` to an
  in-memory GitHub. Everywhere else the client is constructed with that fake
  as its `fetch`, which is what makes the layers above it testable and also
  means the request never touches the browser's stack; here the page is
  unmodified and the real `fetch` runs, so the URLs, methods and headers are
  themselves under test. It found the default `fetch` being called unbound on
  its first run.

- **`test/golden/shell-dist.spec.mjs`** — the same technique one layer up,
  against `app/index.html` and the built `dist/shell.js`: sign in, list a
  collection, open an entry, edit one paragraph, submit, and assert the pull
  request it produced carries a one-line diff and a byte-identical
  frontmatter block. The deliverable and the fixture are the same page on
  purpose, so neither can quietly stop working while the other passes.

- **`test/golden/markdown-dist.spec.mjs`**, **`styles.spec.mjs`** and
  **`chunk-closure.spec.mjs`** — the remaining properties of the artifacts
  rather than of the code: that `dist/markdown.js` resolves its own
  dependencies once bundled, that the three stylesheets partition the rules
  exactly (nothing in both halves, nothing in neither), and that every file
  in `dist/chunks/` is inside some size budget's transitive closure. A chunk
  in nobody's budget ships unmeasured.

`build/` holds the frozen v1.6.16 artifacts as the reference those suites
compare against. Do not rebuild them.

## Known issues

Bugs found during the port and deliberately left as-is, because fixing each
changes behaviour and needs verifying on its own:

- `src/scripts/editor.ts` — `(!region.type() === 'Fixture')` compares a
  boolean with a string, so the branch that blanks the HTML of a
  single-empty-child region has never executed.
- `vendor-src/html-string/strings.ts` — CoffeeScript's implicit-call syntax
  bound every argument to `concat`, so one parser transition is registered
  with a single argument instead of four.
- `HTMLString.Tag.SELF_CLOSING` is an object, but membership is tested with
  array semantics, so the test never matches.
- `init()` only assigns `fixtureTest` when the argument is truthy, so passing
  `null` cannot restore the default on an app that already has a custom one.
  Milestone 2 bounded it rather than fixing it: `destroy()` is terminal now,
  so the next `EditorApp.get()` is a fresh instance with the default back.

## Roadmap

The original plan is closed: there is a deployable CMS, a change made in
it arrives as a pull request somebody can read, and a site's authors can
sign in with a button rather than a pasted token.

What is left is a release — everything past Milestone 1 is unpublished —
and then a preview pane, which needs the site's own templates and so is a
config key and a piece of work of its own. Three things are owed by hand
rather than by test, and are listed in
[docs/auth.md](docs/auth.md) and the plan: the round trip against a real
repository, a real GitHub App signing a real person in, and whether the App
web flow enforces PKCE rather than merely accepting it.

## Licence

MIT, as upstream.
