# `<content-tools-editor>`

The custom element wraps the editor in a shadow root, so its ~44 kB of chrome CSS stops
colliding with whatever the host page already ships. It is the boundary the CMS shell embeds.

```html
<link rel="stylesheet" href="/node_modules/@jamesjnadeau/content-tools/dist/content-tools-content.css">
<script type="module">
  import '@jamesjnadeau/content-tools/element';
</script>

<content-tools-editor regions="[data-editable]" naming-prop="data-name" ignition>
  <article data-editable data-name="body">
    <p>Edit me.</p>
  </article>
</content-tools-editor>
```

Importing `@jamesjnadeau/content-tools/element` registers the tag as a side effect; there is
nothing else to call. The import also pulls in the library itself, from a chunk shared with
`@jamesjnadeau/content-tools`, so importing both entries never yields two copies of the
singletons.

Registration is guarded, so importing the module during SSR or twice on one page is inert
rather than fatal. The entry also exports `ContentToolsEditor` (the class, for `instanceof` and
for registering under a different name), `TAG_NAME`, and `ShadowRootContext`.

**The content stylesheet is yours to link.** The element injects the icon `@font-face` into
the document (a `@font-face` declared inside a shadow root is ignored by Chromium and WebKit,
which is how you get a toolbox full of tofu boxes), and it adopts the chrome stylesheet into
its own shadow root. It does *not* inject the rules that style the editable content —
`.ce-element`, the drop indicators, `.ce--dragging`. Those must reach the light DOM, so link
`dist/content-tools-content.css` yourself. See [content-scope.md](content-scope.md).

## One element per page

`ContentTools.EditorApp` and `ContentEdit.Root` are process-wide singletons, so a second
connected element cannot work. It degrades rather than throwing from `connectedCallback`: it
logs an error, leaves `state` unset, keeps rendering its `<slot>` so the content stays visible
and untouched, emits `ct-error` with `{code: 'singleton-conflict'}`, and throws from its public
methods when you call them — there a throw is right, because you get your own stack.

This is a rule, not a defect awaiting a fix: the shell this element was built for opens one
entry at a time. What it *does* support is doing that repeatedly — connect, edit, disconnect,
connect again — because `EditorApp.destroy()` is terminal, so every boot gets an app the
constructor just built. `ContentEdit.Root` is still shared, which is why the second-instance
guard remains.

## Attributes

| Attribute | Default | Meaning |
|---|---|---|
| `regions` | `[data-editable], [data-fixture]` | Selector for the editable regions |
| `naming-prop` | `data-name` | Attribute a region's name is read from |
| `ignition` | absent (off) | Show the built-in edit/save switch |
| `content-scope` | `light` | `light` (Mode A) or `shadow` (Mode B, experimental) |
| `content-styles` | — | A stylesheet URL to load into the shadow root |
| `ui-lang` | falls back to `lang` | Language for the chrome |

Two defaults deliberately differ from the imperative API:

- **`ignition` is off unless present.** A boolean attribute cannot express "on unless you say
  otherwise", and an element is normally driven by the shell around it rather than by its own
  on-page switch. Add `ignition` for v1.6.x behaviour.
- **`ui-lang`, not `lang`.** `lang` is a global HTML attribute with real platform semantics: it
  is inherited by the light-DOM content and tells the browser that *the text being edited* is
  in that language, driving spellcheck, hyphenation, `:lang()`, font fallback and screen-reader
  pronunciation. The chrome's language and the content's language are different things, and
  conflating them makes a French UI editing English copy impossible without lying to the
  accessibility tree. `lang` is honoured as a fallback, because an element with only `lang` set
  almost certainly means both.

`ui-lang` sets `ContentEdit.LANGUAGE` and **fetches nothing** — an auto-fetch would race
`start()`. Load the shipped dictionaries yourself:

```js
import fr from '@jamesjnadeau/content-tools/translations/fr.json' with {type: 'json'};
ContentEdit.addTranslations('fr', fr);
```

Changing `ui-lang` re-renders a mounted toolbox. Already-open dialogs are not retranslated.

### Reflected out

`state` (`dormant` | `ready` | `editing`) and `busy` are written by the element and are
read-only. They are deliberately not observed — reflecting an attribute you also react to is
how custom elements end up in a loop.

### Live vs. reboot

Changing `regions` re-syncs in place. Changing `naming-prop`, `ignition` or `content-scope`
reboots the element; while the editor is editing the change is **refused with a warning**
rather than applied, because moving nodes under mounted regions would leave every region
pointing at a reparented node. Stop the editor first. `content-styles` and `ui-lang` apply
live.

## Properties

The five attributes above are mirrored as properties (`regions`, `namingProp`, `ignition`,
`contentScope`, `contentStyles`, `uiLang`). Beyond them:

| Property | Type | Notes |
|---|---|---|
| `tools` | `string[][]` | Toolbox layout; reaches a mounted toolbox immediately. Filtered by the profile |
| `profile` | `ConstraintProfile \| null` | Replaces the profile `mode` names; `null` (default) lets `mode` decide. Rebuilds a booted editor. See [custom-tools.md](custom-tools.md) |
| `fixtureTest` | `(el: Element) => boolean` | Which elements are fixtures |
| `stylePalette` | `ContentTools.Style[]` | Reset-then-add, because `StylePalette.add()` is global and append-only |
| `imageUploader` | `(dialog) => void` | Sets `ContentTools.IMAGE_UPLOADER` while connected |
| `rootContext` | readonly | The `ShadowRootContext` in use |
| `editorApp` | readonly | The `EditorApp` this element is driving, or `null`. A new one per boot. **Unstable** |
| `state`, `busy` | readonly | As above |

All the settable properties use the upgrade-property pattern, so assigning before the element
upgrades works:

```js
const el = document.createElement('content-tools-editor');
el.tools = [['bold', 'italic', 'link']];   // before upgrade
document.body.append(el);                  // still honoured
```

The globals these set (`IMAGE_UPLOADER`, the style palette, `ContentEdit.LANGUAGE`) are
restored on teardown.

## Methods

| Method | Notes |
|---|---|
| `start()` | Enter editing |
| `stop(save = true)` | **Saves by default**, unlike the imperative `stop()`, which reverts |
| `save(passive = false)` | `passive` leaves the page editable |
| `revert(): boolean` | Runs a confirm dialog; `false` means the user cancelled |
| `refresh()` | Re-scan for regions (`syncRegions`); safe while editing |
| `flash(type = 'ok')` | `'ok'` or `'no'`; a no-op when the editor is not mounted |
| `adoptStyles(sheet \| cssText \| url)` | Add a consumer stylesheet to the shadow root |
| `removeAdoptedStyles()` | Remove everything `adoptStyles` added |

`stop()` saving by default is the one behavioural deviation from v1.6.x worth knowing about.
Reverting runs a confirm dialog, and if the user cancels, `revert()` returns false and `stop()`
silently aborts, leaving a half-torn-down editor. That is not a defensible default for a method
a shell calls. Pass `stop(false)` for the old behaviour.

**Disconnecting saves too.** A removal from the DOM stops the editor with `save = true`, for
the same reason: a modal confirm fired by a DOM removal is indefensible, and losing the user's
edits with no notification is worse than an unexpected save. A *move* (a synchronous
disconnect/reconnect pair, which is what frameworks do) is not a removal and does not tear
down.

`adoptStyles` tells its three forms apart by structure: a `CSSStyleSheet` is used directly; a
string containing `{` is treated as CSS text; anything else is a URL and is appended as a
`<link>`. A URL is linked rather than fetched because `fetch` + `replaceSync` needs CORS and
would break every cross-origin sheet.

## Events

All events are `CustomEvent`s with `bubbles: true` and `composed: true`. Without `composed`
nothing escapes the shadow boundary and the entire contract dies silently, so it is asserted
per event in the suite.

| Event | Cancelable | `detail` |
|---|---|---|
| `ct-start` | yes | `null` |
| `ct-stop` | yes | `{save}` |
| `ct-save` | yes | `{passive}` |
| `ct-revert` | yes | `null` |
| `ct-started` | no | `null` |
| `ct-stopped` | no | `null` |
| `ct-saved` | no | `{regions, passive}` |
| `ct-busy` | no | `{busy}` |
| `ct-error` | no | `{code, message}` |

`regions` on `ct-saved` is the **changed** regions only — the v1.6.x contract, unchanged. A
passive save with nothing modified still fires `ct-saved`, with `regions` empty.

Cancellation propagates inwards: `preventDefault()` on `ct-start`, `ct-stop`, `ct-save` or
`ct-revert` aborts the action inside the editor.

```js
el.addEventListener('ct-save', ev => {
  ev.preventDefault();                  // we will handle persistence
  publish(ev.detail.regions).then(() => el.flash('ok'), () => el.flash('no'));
});
```

### Two event streams, documented as two

`ContentTools.Event.detail()` is a **method**; a DOM `CustomEvent` carries a `.detail`
**property**. The legacy stream is unchanged and still reachable through `el.editorApp`; the
DOM stream is what the element exposes. One object serving both was rejected: it would have to
be a function with properties hung off it, and every `typeof detail === 'object'` check in
consumer code would flip.

Our bridge registers at boot, so it runs before any handler you later attach directly to
`editorApp`. `ct-start` is an *intent*; `ct-started` is the *fact*.

## Styling

The chrome stylesheet is adopted into the shadow root inside `@layer ct-chrome`. Unlayered
rules always beat layered ones regardless of specificity or insertion order, so **any**
consumer rule reaching the shadow root wins — through `adoptStyles`, `content-styles`, or a
`::part`-free `:host` rule in the page. Insertion order alone could not have guaranteed that
across `adoptedStyleSheets` and in-tree `<link>`s.

A second, tiny, **unlayered** sheet carries the structural rules: `:host` is
`display: block; position: relative`, and `:host([hidden])` is `display: none` (an unstyled
custom element is `display: inline`, which would make `hidden` a no-op). Those are outside the
layer on purpose — they are structure, not theme — but being unlayered also means a page rule
overrides them with no specificity games.
