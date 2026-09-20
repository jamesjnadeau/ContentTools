# ContentTools 2 (beta)

A WYSIWYG editor for HTML content, being modernized into the editing surface
for a git-backed markdown CMS.

This is a fork of [GetmeUK/ContentTools](https://github.com/GetmeUK/ContentTools),
which has been unmaintained since 2022.

## Status

**`2.0.0-beta.0` — Milestone 1 is complete: the library is modernized and the
editor also runs as a custom element. The CMS is not built yet.**

What changed from v1.6.16:

| | v1.6.16 | now |
|---|---|---|
| Language | CoffeeScript 1.x | TypeScript |
| Modules | one shared closure, concatenated | 81 ES modules |
| Build | Grunt + PhantomJS (unrunnable on Node 22) | Vite |
| Dependencies | ContentEdit/ContentSelect/HTMLString vendored as one prebuilt file | absorbed as source |
| Tests | 127 assertions, PhantomJS | 667, real browser, plus five suites against the built artifacts |
| Host access | bare `document`/`window` throughout | one `RootContext` seam |
| Embedding | mounts chrome into `document.body` | `<content-tools-editor>`, chrome in a shadow root |

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

**One element per page.** `ContentTools.EditorApp` and `ContentEdit.Root` are
still singletons, so a second connected element goes inert and emits
`ct-error`. De-singletoning is Milestone 2.

Full attribute, property, method and event reference:
**[docs/element.md](docs/element.md)**.

## Documentation

- [Migrating from 1.6.x](docs/migrating-from-1.6.md)
- [`<content-tools-editor>`](docs/element.md)
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

`npm run dev` builds and serves the playground at
`http://127.0.0.1:8931/playground/`, and the custom-element version at
`http://127.0.0.1:8931/playground/element.html`.

### How this is tested

Five suites, deliberately covering different things:

- **`test/browser/`** — 667 tests in real Chromium, run against the SOURCE so
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

`build/` holds the frozen v1.6.16 artifacts as the reference those suites
compare against. Do not rebuild them.

## Known issues

Bugs found during the port and deliberately left as-is, because fixing each
changes behaviour and needs verifying on its own:

- `editor.ts` — `(!region.type() === 'Fixture')` compares a boolean with a
  string, so the branch that blanks the HTML of a single-empty-child region
  has never executed.
- `html-string/strings.ts` — CoffeeScript's implicit-call syntax bound every
  argument to `concat`, so one parser transition is registered with a single
  argument instead of four.
- `HTMLString.Tag.SELF_CLOSING` is an object, but membership is tested with
  array semantics, so the test never matches.
- `EditorApp` is a singleton, and `init()` only assigns `fixtureTest` when the
  argument is truthy — so passing `null` cannot restore the default, and a
  custom test persists for every later caller.

## Roadmap

Milestone 1b is complete: the editor runs as `<content-tools-editor>` with
its chrome in a shadow root, and the element-driven page is proven to behave
identically to the imperative one on Chromium, Firefox and WebKit.

Next: markdown round-tripping and de-singletoning the editor, then a git/PR
backend over Octokit, pluggable auth, and the CMS shell — collection browser,
entry editor and editorial workflow, with every change submitted as a pull
request.

## Licence

MIT, as upstream.
