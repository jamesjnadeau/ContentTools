# ContentTools 2 (alpha)

A WYSIWYG editor for HTML content, being modernized into the editing surface
for a git-backed markdown CMS.

This is a fork of [GetmeUK/ContentTools](https://github.com/GetmeUK/ContentTools),
which has been unmaintained since 2022.

## Status

**`2.0.0-alpha.0` — the library modernization is done; the CMS is not built yet.**

What changed from v1.6.16:

| | v1.6.16 | now |
|---|---|---|
| Language | CoffeeScript 1.x | TypeScript |
| Modules | one shared closure, concatenated | 74 ES modules |
| Build | Grunt + PhantomJS (unrunnable on Node 22) | Vite |
| Dependencies | ContentEdit/ContentSelect/HTMLString vendored as one prebuilt file | absorbed as source |
| Tests | 127 assertions, PhantomJS | 546, real browser |
| Host access | bare `document`/`window` throughout | one `RootContext` seam |

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

## Development

```sh
npm install
npm run build        # dist/: IIFE, minified IIFE, ESM, CSS + images
npm test             # lint, typecheck, 546 browser tests, golden master, visual
npm run test:coverage
```

`npm run dev` builds and serves the playground at
`http://127.0.0.1:8931/playground/`.

### How this is tested

Three suites, deliberately covering different things:

- **`test/browser/`** — 546 tests in real Chromium, run against the SOURCE so
  coverage can attribute. Includes upstream ContentEdit's own 329 specs,
  inherited with the code.
- **`test/golden/golden.spec.mjs`** — a characterisation harness that drives
  the BUILT bundle through scripted edits and compares against snapshots taken
  from the frozen v1.6.16 artifact. This is what made the rewrite safe: it
  answers "did behaviour change?" independently of whether a test was written
  for it.
- **`test/golden/visual.spec.mjs`** — screenshots the editor chrome under the
  rebuilt stylesheet and compares against the legacy one.

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

Next: `<content-tools-editor>` as a Shadow DOM custom element, then markdown
round-tripping, a git/PR backend over Octokit, and the CMS shell.

## Licence

MIT, as upstream.
