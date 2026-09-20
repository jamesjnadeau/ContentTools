# Content scope: Mode A and Mode B

"Shadow DOM" does not say *where the editable content lives*. That one choice produces two
different products, and the element exposes it as `content-scope`.

|  | Mode A — `content-scope="light"` | Mode B — `content-scope="shadow"` |
|---|---|---|
| Chrome (toolbox, inspector, dialogs) | shadow root | shadow root |
| Editable content | host's light DOM, slotted | reparented into the shadow root |
| Who styles the content | the host page, for free | you must inject a stylesheet |
| Preview fidelity | exactly what the site renders | only what you inject |
| Selection reads for content | ordinary `document.getSelection()` | the three-branch shadow chain |
| Region query scope | the host element | the shadow root |
| Drag/crop overlay | `document.body` | the shadow mount point |
| Status | **default, supported** | experimental preview |

**Mode A is the default and the one to use.** It fixes the problem that actually hurts — ~44 kB
of chrome CSS loose in the host page, `.ct-app` and friends colliding with whatever the site
already ships — while leaving the content where the site's own stylesheet can reach it. What
you are editing looks exactly like what you publish, at no cost. That is not a small thing for
a CMS.

## What Mode A still needs from you

The content-targeting rules (`.ce-element` and its modifiers, the drop indicators,
`.ce--dragging` / `.ce--resizing`) have to reach the light DOM, so they ship as a separate
document-level stylesheet:

```html
<link rel="stylesheet" href=".../dist/content-tools-content.css">
```

Without it, editing works but the affordances are invisible: no hover outlines, no drop
indicators, no drag cursor.

The element handles the other document-level requirement itself. **A `@font-face` declared
inside a shadow root is ignored** by Chromium and WebKit, so the element injects the icon face
into the document — once per document, idempotently, from an inlined `.woff` — and every
toolbox icon renders. Skip that and you get a grid of tofu boxes that no DOM assertion catches.

Body classes are written to both places. `.ce--dragging` and `.ce--resizing` set `cursor` and
`user-select`, which are inherited and therefore do reach into the shadow tree, but they cannot
beat a chrome rule that sets `cursor` on its own elements — so the shadow mount point gets the
class too, and `:host(.ce--dragging)` rules apply inside. `ct--no-scroll` stays document-only,
because the thing being locked is the page.

## When Mode B is right

A controlled **preview pane**: content you render yourself, styled by a stylesheet you control,
isolated from the page around it. That is the case Mode B exists for, and it is a Milestone 2+
concern (a side-by-side edit and preview also needs de-singletoning, which is why it is a
preview rather than a supported path today).

Its costs are real:

- **It reparents your light-DOM children.** They are moved into the shadow root on boot and
  moved back on teardown. If anything else in your page holds references to those nodes or
  styles them by descendant selector from outside, it breaks.
- **You must inject a stylesheet** (`content-styles` or `adoptStyles`), or the content is
  unstyled.
- **Selection reads go through the three-branch chain**, and on the Firefox branch a range that
  cannot be validated as belonging to our root comes back `null`. See
  [root-context.md](root-context.md).
- **IME and `contenteditable`** have genuine engine differences inside a shadow root that Mode A
  never encounters.

Switching mode while the editor is editing is **refused with a warning**. Moving nodes under
mounted `ContentEdit.Region`s would leave every region pointing at a reparented node. Call
`stop()` first.

## Doing it imperatively

`content-scope` is a thin wrapper over the seam. Without the element:

```js
import {setRootContext} from '@jamesjnadeau/content-tools';
import {ShadowRootContext} from '@jamesjnadeau/content-tools/element';

setRootContext(new ShadowRootContext(myShadowRoot, {contentScope: 'shadow'}));
```

`ShadowRootContext` also exposes `contentScopeMode()` / `setContentScopeMode(mode)`, which is
what the element's attribute drives.
