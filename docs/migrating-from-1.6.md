# Migrating from ContentTools 1.6.x

**The integration contract did not change.** Every public API v1.6.16 exposed
still exists, with the same names, the same arguments and the same
behaviour — that is what the golden-master suite exists to enforce, and it
compares the current build against the frozen v1.6.16 artifact on every
commit. What changed is the package: the language it is written in, the file
names it ships, and the fact that it now has types and an ESM entry.

If you have a `<script>` tag and an `EditorApp.get().init(...)` call, the
migration is two paths and no code.

## The contract that is unchanged

Asserted directly, not assumed:

- `EditorApp.get().init(queryOrDOMElements, namingProp = 'id', fixtureTest, withIgnition)`
- `addEventListener('saved', ev => ev.detail().regions)` — **changed regions
  only**, and `detail()` is still a method
- the `start` / `started` / `stop` / `stopped` / `save` / `saved` / `revert`
  lifecycle, and `preventDefault()` on the first four
- `busy()`, `new FlashUI('ok' | 'no')`, `toolbox().tools([...])`
- `ContentTools.StylePalette.add([...])`, `ContentTools.IMAGE_UPLOADER = fn`,
  and the other mutable config (`RESTRICTED_ATTRIBUTES`, `DEFAULT_TOOLS`,
  `CANCEL_MESSAGE`, `MIN_CROP`, `INLINE_TAGS`)
- the eight `imageuploader.*` dialog events
- `ContentEdit.addTranslations()` / `_()` with the same 26 dictionaries
- all 21 tools, registered under the same names
- the five browser globals from the script build: `FSM`, `HTMLString`,
  `ContentSelect`, `ContentEdit`, `ContentTools`

Consumer config being *writable* is the subtle one. `ContentTools` is a plain
object, so `ContentTools.IMAGE_UPLOADER = fn` is a property write, not an ESM
binding — which is why it survived the module conversion, and why there is a
test that says so.

## File names

`build/` became `dist/`:

| v1.6.16 | 2.x |
|---|---|
| `build/content-tools.js` | `dist/content-tools.js` |
| `build/content-tools.min.js` | `dist/content-tools.min.js` |
| `build/content-tools.min.css` | `dist/content-tools.min.css` |
| `build/images/*` | `dist/images/*` |
| — | `dist/content-tools.css` (readable) |
| — | `dist/content-tools-content.css`, `.min.css` (see below) |
| — | `dist/index.js` + `dist/chunks/*` (ESM) |
| — | `dist/element.js` (the custom element) |
| — | `dist/src/**/*.d.ts` (types) |

The stylesheet still references `images/icons.woff` relatively and the asset
filenames are still unhashed, so an existing `<link>` that points at the
directory keeps working once the directory name is updated.

`build/` is still in the repository, holding the frozen v1.6.16 artifacts as
the reference the test suites compare against. It is not published and it is
not rebuilt.

## Script tag

```diff
-<link rel="stylesheet" href="ContentTools/build/content-tools.min.css">
-<script src="ContentTools/build/content-tools.min.js"></script>
+<link rel="stylesheet" href="node_modules/@jamesjnadeau/content-tools/dist/content-tools.min.css">
+<script src="node_modules/@jamesjnadeau/content-tools/dist/content-tools.min.js"></script>
```

Nothing else. The bundle still attaches the same five globals to `window`.

## npm

The package is `@jamesjnadeau/content-tools`; upstream's was `ContentTools`.

```js
import ContentTools from '@jamesjnadeau/content-tools';
import '@jamesjnadeau/content-tools/style.min.css';
```

Subpaths, via the `exports` map — there are no deep imports:

| | |
|---|---|
| `.` | the ESM library, plus types |
| `./element` | registers `<content-tools-editor>` |
| `./global` | the IIFE build, for a bundler that wants the globals |
| `./style.css`, `./style.min.css` | the full stylesheet |
| `./content.css`, `./content.min.css` | the document-level subset |
| `./translations/*` | the 26 dictionaries, unbundled |

Translations stay separate files rather than being bundled: `addTranslations()`
is already a lazy-registration API, so shipping all 26 would be a pure size
regression.

## Things that will actually differ

Five, and only the first is likely to reach your code.

**`dist/index.js` is not a standalone file.** It imports a shared chunk from
`dist/chunks/`. That is deliberate: `dist/index.js` and `dist/element.js`
share one copy of the library, and building them separately would give a
consumer who imports both two copies of every module — and therefore two
`EditorApp` singletons and two `ContentEdit.Root`s. That failure presents as
"my `addEventListener` never fires", with nothing in any stack trace to
suggest why. If you were copying `build/content-tools.js` into a directory by
hand, use `dist/content-tools.js` (the IIFE) rather than the ESM entry.

**Do not set `sideEffects: false` for this package.** 21 tools register
themselves by evaluating their class bodies, and the element registers its tag
the same way. The package ships a `sideEffects` allowlist that covers both;
overriding it in your own bundler config drops the registrations with no build
error, and `ToolShelf.fetch('bold')` then throws at runtime.

**`localStorage` no longer takes the editor down with it.** The four places
that persisted UI preferences (toolbox position, last-used dialog tab) now go
through a wrapper that swallows the exception `localStorage` throws in a
sandboxed iframe and in Safari's private mode. Previously that threw out of
the editor.

**The build requires Node 22.** Only to build it — the published artifacts
target the same browsers v1.6.16 did, and the legacy IE branches are still in
the code.

**Four upstream bugs are preserved, not fixed.** They are listed under "Known
issues" in the README. Each one changes behaviour to fix, so each needs
verifying on its own rather than being swept into a port.

## What is new and optional

- **`<content-tools-editor>`** — the editor as a custom element, with its
  chrome in a shadow root so its ~44 kB of CSS stops colliding with your
  page. See [element.md](element.md) and [content-scope.md](content-scope.md).
- **`RootContext`** — the single seam through which the library reaches
  `document` and `window`, now exported. See
  [root-context.md](root-context.md).
- **Types**, shipped with the ESM build.

Neither the element nor the seam is required. An integration that mentions
neither gets exactly v1.6.16 behaviour.
