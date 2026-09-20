# ContentTools 2 (alpha)

A WYSIWYG editor for HTML content, being modernized into the editing surface
for a git-backed markdown CMS.

This is a fork of [GetmeUK/ContentTools](https://github.com/GetmeUK/ContentTools),
which has been unmaintained since 2022.

## Status

**`2.0.0-alpha.0` — the library modernization is done and the editor is now
also a custom element; the CMS is not built yet.**

What changed from v1.6.16:

| | v1.6.16 | now |
|---|---|---|
| Language | CoffeeScript 1.x | TypeScript |
| Modules | one shared closure, concatenated | 81 ES modules |
| Build | Grunt + PhantomJS (unrunnable on Node 22) | Vite |
| Dependencies | ContentEdit/ContentSelect/HTMLString vendored as one prebuilt file | absorbed as source |
| Tests | 127 assertions, PhantomJS | 662, real browser |
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

The editor's ~55 KB of chrome CSS goes into the element's shadow root
instead of into your page, so `.ct-app` and friends can no longer collide
with your own styles. The icon font is inlined and registered on the
document automatically — an `@font-face` declared inside a shadow root is
ignored by Chromium and WebKit, so the element cannot leave it to the
stylesheet.

**Two modes.** By default (`content-scope="light"`, *Mode A*) only the chrome
is encapsulated; the content stays in the light DOM behind a `<slot>`, which
is why your page styles it and preview fidelity is free. Link
`content.css` for the content rules — the `.ce-element` states, the drop
indicators, the drag and resize cursors — which by definition have to reach
the document. `content-scope="shadow"` (*Mode B*) moves the content into the
shadow root as well: full isolation, but you must supply `content-styles`,
and it is an opt-in preview rather than the supported path.

**One element per page.** `ContentTools.EditorApp` and `ContentEdit.Root` are
still singletons, so a second connected element goes inert: it logs, emits
`ct-error` with `{code: 'singleton-conflict'}`, leaves its content rendered
and untouched, and throws from its own methods. De-singletoning is Milestone
2.

#### Attributes

| Attribute | Default | |
|---|---|---|
| `regions` | `[data-editable], [data-fixture]` | selector for the editable regions; live |
| `naming-prop` | `data-name` | attribute a region's name is read from |
| `ignition` | absent (off) | show the built-in edit/save switch |
| `content-scope` | `light` | `light` (Mode A) or `shadow` (Mode B) |
| `content-styles` | — | stylesheet URL to load into the shadow root |
| `ui-lang` | falls back to `lang` | language for the chrome |
| `state` | — | **reflected out**: `dormant` / `ready` / `editing` |
| `busy` | — | **reflected out** |

`naming-prop` defaults to `data-name` here, not to `id` as the imperative
`init()` does; and `ignition` is off by default, because an element is
normally driven by the app around it. `ui-lang` is deliberately not `lang`:
`lang` is inherited by the content and tells the browser what language *the
text being edited* is in, which drives spellcheck, hyphenation, `:lang()` and
screen-reader pronunciation. It is honoured as a fallback. Setting `ui-lang`
fetches nothing — load the shipped translations with
`ContentEdit.addTranslations()` yourself.

#### Properties and methods

Properties: `tools`, `fixtureTest`, `stylePalette`, `imageUploader`, and the
read-only `rootContext` and `editorApp` (unstable — it is the v1.6.x
singleton, which Milestone 2 reshapes).

Methods: `start()`, `stop(save = true)`, `save(passive = false)`, `revert()`,
`refresh()`, `flash(type)`, `adoptStyles(sheetOrCssOrUrl)`,
`removeAdoptedStyles()`.

`stop()` **saves** by default, where the imperative `stop()` reverts —
reverting shows a confirm dialog, and cancelling it aborts the stop. The
same reason applies when the element is removed from the DOM mid-edit: it
saves rather than discarding the user's work.

`adoptStyles` takes a `CSSStyleSheet`, CSS text (told apart by containing a
`{`) or a URL (appended as a `<link>`). Whatever you add wins over the
editor's own rules at equal specificity, because the chrome sheet is wrapped
in `@layer ct-chrome` and unlayered rules always beat layered ones — no
`!important`, and it does not depend on insertion order.

#### Events

Every event is a `CustomEvent` with `bubbles: true` and `composed: true`, so
it escapes the shadow boundary and you can listen anywhere above the element.

| Event | | `detail` |
|---|---|---|
| `ct-start` `ct-stop` `ct-save` `ct-revert` | cancelable | as the legacy event |
| `ct-started` `ct-stopped` | | — |
| `ct-saved` | | `{regions, passive}` — **changed** regions only |
| `ct-busy` | | `{busy}` |
| `ct-error` | | `{code, message}` |

`preventDefault()` on one of the four cancelable events aborts the action
inside the editor.

These are a **second, separate stream** from the legacy
`editorApp.addEventListener('saved', …)` one, which is unchanged and whose
`ContentTools.Event` still exposes `detail()` as a *method*. The DOM events
carry `detail` as a *property*. No object serves both.

## Development

```sh
npm install
npm run build        # dist/: IIFE, minified IIFE, ESM, CSS + images
npm test             # lint, typecheck, 546 browser tests, golden master, visual
npm run test:coverage
```

`npm run dev` builds and serves the playground at
`http://127.0.0.1:8931/playground/`, and the custom-element version at
`http://127.0.0.1:8931/playground/element.html`.

### How this is tested

Three suites, deliberately covering different things:

- **`test/browser/`** — 662 tests in real Chromium, run against the SOURCE so
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

Next: markdown round-tripping and de-singletoning the editor, then a git/PR
backend over Octokit, pluggable auth, and the CMS shell — collection browser,
entry editor and editorial workflow, with every change submitted as a pull
request.

## Licence

MIT, as upstream.
