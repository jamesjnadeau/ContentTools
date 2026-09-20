# `RootContext` — the host seam

Every `document` and `window` access in this library goes through one object. An ESLint
`no-restricted-globals` rule forbids those two globals across all of `src/` and `vendor-src/`,
exempting only the seam itself (`src/core/root-context.ts` and
`src/core/document-root-context.ts`) and `src/global.ts`, whose whole job is to attach the
browser globals. So the seam cannot quietly rot back into direct global reads.

`ShadowRootContext` is deliberately *not* exempt: it reaches the real document and window
through the fields its base class holds, which is also why it inherits every page-level method
unchanged.

That exists for the obvious reason — it is what lets `<content-tools-editor>` put the chrome in
a shadow root without the other ~12,000 lines knowing anything changed — and for two less
obvious ones: it makes the DOM mockable, so focus descent and global-state logic are unit
tested without a browser; and it gave three latent bugs a single place to be fixed (see
[Incidental fixes](#incidental-fixes)).

It is an **extension point**, not an implementation detail, which is why it is exported.

```js
import {rootContext, setRootContext, DocumentRootContext} from '@jamesjnadeau/content-tools';
import {ShadowRootContext} from '@jamesjnadeau/content-tools/element';
```

`ShadowRootContext` is exported from `/element`, not from the root entry: it is only useful to
someone who already has a shadow root, and re-exporting it from the main entry would drag its
weight into the IIFE build for every script-tag consumer who will never construct one.

## Installing one

A `DocumentRootContext` is installed on import, so an integration that never mentions any of
this behaves exactly as v1.6.x did.

```js
const previous = setRootContext(new ShadowRootContext(myShadowRoot));
try {
  // ... the library now resolves everything against myShadowRoot
} finally {
  setRootContext(previous);          // setRootContext returns the previous one
}
```

`rootContext()` returns the context in force and **throws** if none is installed — importing
the library installs the default, so that only happens if you deep-import a module directly.

The context is process-wide, like `EditorApp` and `ContentEdit.Root`. One at a time.
De-singletoning is Milestone 2.

## The interface

`DocumentRootContext` is the reference implementation; subclass it rather than starting from
scratch, because most of the surface is genuinely environment-independent.

### Mounting and scope

| Method | Document-backed behaviour |
|---|---|
| `mountPoint()` | Where the chrome attaches — `document.body` |
| `setMountPoint(el)` | Override it |
| `overlayPoint()` | Where drag helpers and crop marks go — same node |
| `contentScope()` | The subtree region queries run against — `document` |
| `setContentScope(node)` | Narrow it |

### Element construction

`createElement(tag)`, `createTextNode(text)`, `createRange()`, and `createSandboxDocument()` —
a detached document for sanitising untrusted HTML without running scripts or loading resources
in the live page.

### Selection

| Method | Notes |
|---|---|
| `getSelection()` | The raw `Selection`, or `null` |
| `getRange()` | The first selected range, **as a live `Range`**, or `null` |
| `selectRange(range)` | Via `setBaseAndExtent` |
| `clearSelection()` | |

Two things here are load-bearing.

**`getRange()` must return a *live* `Range`.** `ContentSelect.Range.rect()` measures a
collapsed caret by inserting a marker span into the range, and a `StaticRange` has no
`insertNode()`. A shadow-backed context reads `StaticRange`s and has to rebuild a live `Range`
before returning one. Doing that here, once, is why no call site has to care which engine it is
running on.

**`selectRange()` uses `setBaseAndExtent`, not `addRange`.** `addRange` is unreliable in WebKit
once shadow-tree nodes are involved, and it is strictly worse in light DOM too.

#### The three-branch read

`ShadowRootContext.getRange()` is why CI runs Chromium, Firefox and WebKit — each takes a
different branch:

1. **`ShadowRoot.getSelection()`** — Chromium's non-standard method. Reports `rangeCount === 0`
   when the selection is not in this tree, so it declines cleanly in Mode A.
2. **`Selection.getComposedRanges()`** — Safari 17.4+, Chromium 137+. Returns `StaticRange`s,
   rebuilt into a live `Range`. The signature churned: the current spec takes
   `{shadowRoots: [...]}`, older WebKit took a bare list. Both are tried.
3. **`document.getSelection()`** — Firefox has neither of the above and does **not** retarget,
   so its document selection reports real shadow nodes.

The trap, established by probing rather than reading specs: **the wrong branch does not fail
loudly.** Called with the wrong shadow root, or with a signature it does not recognise,
`getComposedRanges()` returns a *retargeted* range pointing at the host's parent rather than
throwing. "The call did not throw" is therefore useless as a discriminator.

Containment is the discriminator instead. Every branch's answer is validated against the root
before it is trusted, so an unrecognised signature costs a wasted call, never a wrong caret.
The equivalence suite asserts **which** branch answered, because three engines all quietly
falling through to the last one would pass while proving nothing.

### Focus

`getActiveElement()` descends through open shadow roots — `document.activeElement` stops at the
host, which is why a dialog input inside a shadow root cannot otherwise be found.
`deepActiveElement(doc)` is exported separately for the same reason. `hasFocus()`.

### Global UI state

`setGlobalState(name, on)` for `'dragging'`, `'resizing'` and `'no-scroll'`.

`ShadowRootContext` writes **both** `document.body` and the shadow mount point.
`.ce--dragging` / `.ce--resizing` set `cursor` and `user-select`, which are inherited and do
reach into the shadow tree, but they cannot beat a chrome rule setting `cursor` on its own
elements — so the mount-point write gives the chrome sheet a selector it can use from inside
the boundary. `no-scroll` stays document-only: scroll locking is genuinely a page concern.

### Geometry and environment

`scrollPosition()`, `viewportSize()`, `pageWidth()`, `getComputedStyle(el)`,
`supportsComputedStyle()`, `confirm(message)`, `currentEvent()`, `clipboardData()`,
`isLegacyIE()`.

`supportsComputedStyle()` is read live rather than assumed: the widget code unmounts
immediately when it is unavailable, and a spec exercises that path by nulling
`window.getComputedStyle` to stop transition monitoring.

`currentEvent()` is the one genuinely ugly member. Only the drag-clone check uses it, to read
`altKey`. It reaches for a global because ContentEdit's dropper functions take
`(element, target, placement)` and never received the event — changing that signature would
break every consumer-defined dropper, so the read is routed through the seam rather than fixed.

### Storage

`storage()` returns `{getItem, setItem}` for the persisted UI preferences (toolbox position,
last-used dialog tab).

### Listeners

`on(target, type, fn, opts)` / `off(...)`, where `target` is `'document'` or `'window'`, and
`addGlobalListener(...)` which returns a disposer.

Both forms exist because the library's existing teardown removes listeners by function
identity; converting all of it to disposers at the same time as introducing the seam would have
made a behaviour-preserving phase unverifiable. New code should use `addGlobalListener`.

## Incidental fixes

Three real bugs that the seam fixed as a side effect of having one place to fix them:

- **`localStorage` no longer takes the editor down.** It throws in a sandboxed iframe and in
  Safari's private mode; `storage()` swallows it and returns `null`.
- **Listener teardown is structurally correct.** The library used to remove global listeners by
  re-deriving the same bound function — easy to get subtly wrong, and untested.
- **The four `window.event` reads are routed.** Deprecated global-state reads that misbehave for
  shadow-originated events.

## Writing your own

Subclass `DocumentRootContext` and override only what differs. `ShadowRootContext` overrides
five things — mounting, overlay, scope, global state and the selection read — and inherits
everything else, because geometry, storage, listeners and element construction are page- or
document-level concerns that a shadow root does not alter.

For tests, a plain object with the members you exercise is enough; the focus-descent and
global-state unit tests do exactly that.
