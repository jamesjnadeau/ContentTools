# Custom tools

A tool is a class with static methods, stowed on `ContentTools.ToolShelf` under a
name. The toolbox is a list of names. It looks each one up on the shelf when it is
built. That is the whole mechanism, and it has not changed since 1.6. What differs
between the ways of using the package is **where the tool list comes from**, **what
filters it**, and **where the toolbox is drawn**.

| You use | Stow with | Name it in | Markdown filter | Icon CSS goes |
|---|---|---|---|---|
| Script tag / `EditorApp.init()` | the global `ContentTools` | `DEFAULT_TOOLS` or `toolbox().tools()` | only if you call `app.profile(...)` | in the page |
| `<content-tools-editor>` | the `ContentTools` you import | `el.tools` | `mode="markdown"`: set `el.profile` | `el.adoptStyles()` |
| In-page `dist/edit.js` | `contentToolsEdit.setup()` | `contentToolsEdit.allowTools` / `.tools` | always on: `allowTools` | `contentToolsEdit.styles` |

`<content-tools-cms>` (`/admin`) has no editor, so it has no toolbox to add to. You
edit words on the page with `dist/edit.js`.

## Writing one

This example is a strikethrough tool. It uses `<del>`, which is also GFM's `~~`, so
it works in both modes. Bold already does everything it needs except the tag, so it
subclasses Bold:

```js
function defineStrike(ContentTools) {
    class Strike extends ContentTools.Tools.Bold {
        static initClass() {
            ContentTools.ToolShelf.stow(this, 'strike');
            this.label = 'Strikethrough';
            this.icon = 'strike';       // the toolbox button gets .ct-tool--strike
            this.tagName = 'del';
        }
    }
    Strike.initClass();
}
```

A tool written from scratch extends `ContentTools.Tool` and implements the static
`canApply(element, selection)`, `isApplied(element, selection)` and
`apply(element, selection, callback)` methods. Call `callback(true)` when it
applies, and fire `tool-apply` / `tool-applied` through `this.dispatchEditorEvent`
as the built-in tools do. Any file under `src/scripts/tools/` is a working example.
[The upstream API documentation](https://getcontenttools.com/api/content-tools) is
still accurate for `Tool`.

### The icon

The button is `<button class="ct-tool ct-tool--{icon}">`. The glyph is its
`:before`, drawn in the bundled icon font. A custom tool needs a rule for its own
icon. The font's glyphs are fine to use, and so is plain text:

```css
.ct-tool--strike:before { content: "S"; text-decoration: line-through; font-family: inherit; }
```

Where that rule goes depends on the surface. See the table above and the sections
below.

### Stow it before the toolbox is built

The toolbox calls `ToolShelf.fetch(name)` for every name when it is built, and
`fetch` throws for a name nothing has stowed. So the tool has to be stowed first:
before `init()`, before the element is connected, or inside
`contentToolsEdit.setup`.

### Stow it on the right `ContentTools`

A tool is stowed on the library instance the toolbox reads. A second copy of the
library has its own shelf, and the toolbox never looks at it. This happens with an
ESM import next to the IIFE script tag, or with two bundles that each include the
package. Import `ContentTools` from the same place the editor comes from. On the
in-page surface this is handled for you, because the library is handed to `setup`.

## Script tag and `EditorApp`

This is the same as 1.6.x:

```html
<script src="dist/content-tools.min.js"></script>
<style>.ct-tool--strike:before { content: "S"; text-decoration: line-through; font-family: inherit; }</style>
<script>
    defineStrike(ContentTools);
    ContentTools.DEFAULT_TOOLS[0].push('strike');   // or app.toolbox().tools([...]) later
    ContentTools.EditorApp.get().init('*[data-editable]', 'data-name');
</script>
```

The toolbox is in the page's own DOM, so the icon rule can go in any stylesheet.

If you have constrained the app to markdown yourself with `app.profile(MARKDOWN_PROFILE)`,
widen it with `allowTools()` (see below).

## `<content-tools-editor>`

```js
import ContentTools, {MARKDOWN_PROFILE, allowTools} from '@jamesjnadeau/content-tools';
import '@jamesjnadeau/content-tools/element';

defineStrike(ContentTools);

const el = document.querySelector('content-tools-editor');
el.tools = [...ContentTools.DEFAULT_TOOLS, ['strike']];
el.adoptStyles('.ct-tool--strike:before { content: "S"; text-decoration: line-through; font-family: inherit; }');
```

**The toolbox is in the element's shadow root.** A rule in the page's stylesheet
does not reach it, and the button renders as an empty square. Pass the rule to
`el.adoptStyles()`, which takes CSS text, a URL or a `CSSStyleSheet`.

**In markdown mode, also set `profile`.** `mode="markdown"` allows the 17 built-in
tools by name and drops every other name from `tools` without a warning. Set a
widened profile, before connecting if you can:

```js
el.profile = allowTools(MARKDOWN_PROFILE, ['strike']);
```

Setting `profile` on a booted element rebuilds it, as changing `mode` does, and the
change is refused with a warning while the editor is editing. Setting it back to
`null` lets `mode` decide again.

## The in-page surface, `dist/edit.js`

`edit.js` builds its editor itself, from a script tag, so there is no element for
you to configure. Instead, declare a plain object on `window` **before** the script
runs. Module scripts are deferred, so an inline script anywhere before it works:

```html
<script>
  window.contentToolsEdit = {
    setup({ContentTools}) {
      defineStrike(ContentTools);
    },
    allowTools: ['strike'],
    styles: '.ct-tool--strike:before { content: "S"; text-decoration: line-through; font-family: inherit; }'
  };
</script>
<script type="module" src="/cms/edit.js"></script>
```

Every key is optional:

| Key | What it does |
|---|---|
| `setup(library)` | Called once with `{ContentTools, ContentEdit, HTMLString}`, the instances the editor uses, before the toolbox is built. It may return a promise, so a tool can live in its own module and be `import()`ed here. |
| `allowTools` | Names the markdown constraint lets through. Without `tools`, they are also appended to the default layout as a group of their own. |
| `tools` | The whole toolbox layout, `DEFAULT_TOOLS`-shaped. It is still filtered, so a name you want must also be in `allowTools`. |
| `styles` | CSS text, a URL, a `CSSStyleSheet`, or an array of them, adopted into the editor's shadow root. |

**Readers still download nothing.** `setup` is not called, and the library is not
fetched, until somebody is actually editing. That is why the library is handed to
you instead of imported: before that moment there is no `ContentTools` on the page
to import.

**Mistakes show up on the bar.** A name nothing stowed, or a key of the wrong shape,
puts the bar into its failed state with a sentence that names the problem. It does
not fail silently when somebody presses the pencil. Open one entry after deploying
to check.

A page that calls `boot(window, extension)` itself can pass the object directly
instead of using the global.

## What a tool may write in markdown mode

`allowTools` widens **only the tool list**. Paste, the properties dialog and the tag
allow-list stay constrained. By listing a name, you are telling the editor that
your tool only writes what the markdown serializer can hold. Here is what happens to
anything else when the entry is saved:

- **Inline tags** it does not know are unwrapped. The text is kept and the tag is
  lost. Known: `a`, `b`/`strong`, `i`/`em`, `code`, `del`, `br`, `img`.
- **Blocks** it does not know are **dropped, with their content**. Known:
  paragraphs, `h1`–`h6`, `pre`, lists, `blockquote`, tables and images. Anything
  that inserts some other block element loses words on save.
- **Attributes** outside `href`/`title` on links, `src`/`alt`/`title` on images and
  `align` on table cells are not written. So a tool that sets a class, as the
  alignment tools do, has no effect on the file.

A tool that works within these limits (inserting a snippet as ordinary paragraphs,
opening a dialog that writes a link, wrapping text in `<del>`) is fine. For anything
else, use HTML mode.
